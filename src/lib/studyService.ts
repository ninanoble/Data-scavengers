import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  LEGACY_SEED_SITE_IDS,
  SEED_QUESTIONNAIRE_V1,
  SEED_SITES,
  SEED_STUDY_CONFIG,
  buildPilotResponses,
} from '../data/seedData.ts';
import {
  computeDerivedScores,
  computeStudyAnalytics,
  isSafetyTriggered,
} from './scoring.ts';
import {
  enqueueSyncItem,
  listSyncQueue,
  removeSyncQueueItem,
  saveCachedStudyBundle,
} from './offlineStore.ts';
import type {
  AggregateMetric,
  AuditLogEntry,
  ExportLogEntry,
  InterviewResponse,
  QuestionnaireVersion,
  ResponseTag,
  SafetyFlag,
  SharedReport,
  Site,
  StudyConfig,
  SyncQueueItem,
  TeamInvite,
  TeamUser,
  UserDirectoryEntry,
  UserRole,
} from '../types/study.ts';

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'kamikazinina66@gmail.com',
  'chanianina42@gmail.com',
]);

export function makeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

export function generateRespondentCode(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  return `DS-${digits}${suffix}`;
}

export async function ensureUserProfile(firebaseUser: User): Promise<TeamUser> {
  const email = (firebaseUser.email ?? '').toLowerCase();
  const userRef = doc(db, 'users', firebaseUser.uid);
  const dirRef = doc(db, 'userDirectory', firebaseUser.uid);

  let existing: TeamUser | null = null;
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      existing = snap.data() as TeamUser;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
  }

  if (existing) {
    if (BOOTSTRAP_ADMIN_EMAILS.has(email) && existing.role !== 'admin') {
      const now = new Date().toISOString();
      const promoted: TeamUser = {
        ...existing,
        role: 'admin',
        active: true,
        updatedAt: now,
      };
      try {
        await setDoc(userRef, promoted, { merge: true });
        await setDoc(
          dirRef,
          {
            uid: promoted.uid,
            displayName: promoted.displayName,
            role: 'admin',
            ...(promoted.assignedSiteId ? { assignedSiteId: promoted.assignedSiteId } : {}),
            active: true,
            updatedAt: now,
          } satisfies UserDirectoryEntry,
          { merge: true }
        );
        return promoted;
      } catch {
        // Fall through to returning existing if offline
      }
    }
    // Ensure non-PII directory is synchronized
    const dirEntry: UserDirectoryEntry = {
      uid: existing.uid,
      displayName: existing.displayName,
      role: existing.role,
      ...(existing.assignedSiteId ? { assignedSiteId: existing.assignedSiteId } : {}),
      active: existing.active,
      updatedAt: existing.updatedAt,
    };
    try {
      await setDoc(dirRef, dirEntry, { merge: true });
    } catch {
      // Directory best-effort sync
    }
    return existing;
  }

  let resolvedRole: UserRole = BOOTSTRAP_ADMIN_EMAILS.has(email) ? 'admin' : 'interviewer';
  let resolvedName = firebaseUser.displayName || email.split('@')[0] || 'Researcher';
  let assignedSiteId: string | undefined;

  if (email && !BOOTSTRAP_ADMIN_EMAILS.has(email)) {
    try {
      const inviteSnap = await getDoc(doc(db, 'teamInvites', email));
      if (inviteSnap.exists()) {
        const invite = inviteSnap.data() as TeamInvite;
        resolvedRole = invite.role;
        resolvedName = invite.displayName || resolvedName;
        assignedSiteId = invite.assignedSiteId;
      }
    } catch {
      // Proceed with default interviewer role if no invite
    }
  }

  const now = new Date().toISOString();
  const newUser: TeamUser = {
    uid: firebaseUser.uid,
    email,
    displayName: resolvedName,
    role: resolvedRole,
    ...(assignedSiteId ? { assignedSiteId } : {}),
    active: true,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(userRef, newUser);
    const dirEntry: UserDirectoryEntry = {
      uid: newUser.uid,
      displayName: newUser.displayName,
      role: newUser.role,
      ...(assignedSiteId ? { assignedSiteId } : {}),
      active: true,
      updatedAt: now,
    };
    await setDoc(dirRef, dirEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
  }

  return newUser;
}

export async function ensureStudySeeded(user: TeamUser): Promise<{
  sites: Site[];
  config: StudyConfig;
  questionnaire: QuestionnaireVersion;
}> {
  let sites: Site[] = [];
  let config: StudyConfig | null = null;
  let questionnaire: QuestionnaireVersion | null = null;

  try {
    const sitesSnap = await getDocs(collection(db, 'sites'));
    sites = sitesSnap.docs.map((d) => d.data() as Site);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'sites');
  }

  try {
    const cfgSnap = await getDoc(doc(db, 'studyConfig', 'main'));
    if (cfgSnap.exists()) config = cfgSnap.data() as StudyConfig;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'studyConfig/main');
  }

  try {
    const qSnap = await getDocs(collection(db, 'questionnaireVersions'));
    const allQ = qSnap.docs.map((d) => d.data() as QuestionnaireVersion);
    questionnaire =
      allQ.find((q) => q.status === 'published') ??
      allQ.sort((a, b) => b.version - a.version)[0] ??
      null;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'questionnaireVersions');
  }

  if (user.role === 'admin') {
    const batch = writeBatch(db);
    let needsBatch = false;

    const now = new Date().toISOString();
    const legacySet = new Set<string>(LEGACY_SEED_SITE_IDS);
    const existingById = new Map(sites.map((s) => [s.id, s]));

    for (const legacyId of legacySet) {
      const legacySite = existingById.get(legacyId);
      if (legacySite && legacySite.active) {
        const deactivated: Site = { ...legacySite, active: false, updatedAt: now };
        batch.set(doc(db, 'sites', legacyId), deactivated);
        existingById.set(legacyId, deactivated);
        needsBatch = true;
      }
    }

    for (const s of SEED_SITES) {
      if (!existingById.has(s.id)) {
        batch.set(doc(db, 'sites', s.id), s);
        existingById.set(s.id, s);
        needsBatch = true;
      }
    }

    sites = Array.from(existingById.values());

    if (!config) {
      batch.set(doc(db, 'studyConfig', 'main'), SEED_STUDY_CONFIG);
      config = SEED_STUDY_CONFIG;
      needsBatch = true;
    }

    if (!questionnaire) {
      batch.set(doc(db, 'questionnaireVersions', SEED_QUESTIONNAIRE_V1.id), SEED_QUESTIONNAIRE_V1);
      questionnaire = SEED_QUESTIONNAIRE_V1;
      needsBatch = true;
    }

    if (needsBatch) {
      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'seed_bootstrap');
      }
    }
  }

  const finalSites = sites.length > 0 ? sites : SEED_SITES;
  const finalConfig = config ?? SEED_STUDY_CONFIG;
  const finalQuestionnaire = questionnaire ?? SEED_QUESTIONNAIRE_V1;

  await saveCachedStudyBundle({
    sites: finalSites,
    questionnaire: finalQuestionnaire,
    config: finalConfig,
  });

  return { sites: finalSites, config: finalConfig, questionnaire: finalQuestionnaire };
}

export async function logAudit(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> {
  const id = makeId('aud');
  const full: AuditLogEntry = {
    ...entry,
    id,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'auditLogs', id), full);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `auditLogs/${id}`);
  }
}

export async function refreshAggregateSummary(
  responses: InterviewResponse[],
  config: StudyConfig
): Promise<void> {
  const analytics = computeStudyAnalytics(responses, config);
  const siteCounts: Record<string, number> = {};
  for (const s of analytics.siteBreakdown) siteCounts[s.siteName] = s.count;
  const interviewerCounts: Record<string, number> = {};
  for (const i of analytics.interviewerBreakdown) interviewerCounts[i.interviewerName] = i.count;
  const dailyCounts: Record<string, number> = {};
  for (const d of analytics.dailySeries) dailyCounts[d.date] = d.count;

  const summary: AggregateMetric = {
    totalResponses: analytics.totalResponses,
    targetSampleSize: config.targetSampleSize,
    completionRate: analytics.completionRate,
    safetyFlagCount: analytics.safetyFlagCount,
    unpreparedCount: analytics.hypothesis.unpreparedCount,
    preparedCount: analytics.hypothesis.preparedCount,
    meanPreparedness: analytics.meanPreparedness ?? 0,
    meanStrain: analytics.meanStrain ?? 0,
    siteCounts,
    interviewerCounts,
    dailyCounts,
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'aggregateMetrics', 'studySummary'), summary);
  } catch {
    // Non-fatal if rule denies partial refresh
  }
}

export async function submitInterviewResponse(params: {
  response: InterviewResponse;
  user: TeamUser;
  isOnline: boolean;
  config: StudyConfig;
}): Promise<{ synced: boolean; safetyFlag?: SafetyFlag }> {
  const { response, user, isOnline, config } = params;
  const safetyFlag: SafetyFlag | undefined = response.safetyFlagged
    ? {
        id: `flag_${response.id}`,
        responseId: response.id,
        respondentCode: response.respondentCode,
        siteId: response.siteId,
        siteName: response.siteName,
        interviewerUid: response.interviewerUid,
        interviewerName: response.interviewerName,
        status: 'open',
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
      }
    : undefined;

  if (!isOnline) {
    await enqueueSyncItem({
      id: response.id,
      operation: 'create',
      payload: response,
      safetyFlag,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
    return { synced: false, safetyFlag };
  }

  try {
    const now = new Date().toISOString();
    const toWrite: InterviewResponse = { ...response, syncedAt: now };
    await setDoc(doc(db, 'responses', response.id), toWrite);
    if (safetyFlag) {
      await setDoc(doc(db, 'safetyFlags', safetyFlag.id), safetyFlag);
    }
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: response.safetyFlagged ? 'CREATE_RESPONSE_SAFETY_FLAGGED' : 'CREATE_RESPONSE',
      targetType: 'response',
      targetId: response.id,
      details: `Submitted ${response.respondentCode} at ${response.siteName} (${response.completionStatus})`,
    });

    // Update aggregate snapshot if user can list responses, or increment safely
    try {
      const aggSnap = await getDoc(doc(db, 'aggregateMetrics', 'studySummary'));
      const current = aggSnap.exists() ? (aggSnap.data() as AggregateMetric) : null;
      const nextTotal = (current?.totalResponses ?? 0) + 1;
      const nextFlags = (current?.safetyFlagCount ?? 0) + (response.safetyFlagged ? 1 : 0);
      const nextUnprep = (current?.unpreparedCount ?? 0) + (response.derivedScores.isUnprepared ? 1 : 0);
      const nextPrep = (current?.preparedCount ?? 0) + (response.derivedScores.isUnprepared === false ? 1 : 0);
      const siteCounts = { ...(current?.siteCounts ?? {}) };
      siteCounts[response.siteName] = (siteCounts[response.siteName] ?? 0) + 1;
      const interviewerCounts = { ...(current?.interviewerCounts ?? {}) };
      interviewerCounts[response.interviewerName] = (interviewerCounts[response.interviewerName] ?? 0) + 1;
      const dayKey = response.createdAt.slice(0, 10);
      const dailyCounts = { ...(current?.dailyCounts ?? {}) };
      dailyCounts[dayKey] = (dailyCounts[dayKey] ?? 0) + 1;

      await setDoc(doc(db, 'aggregateMetrics', 'studySummary'), {
        totalResponses: nextTotal,
        targetSampleSize: config.targetSampleSize,
        completionRate: current?.completionRate ?? 100,
        safetyFlagCount: nextFlags,
        unpreparedCount: nextUnprep,
        preparedCount: nextPrep,
        meanPreparedness: response.derivedScores.preparedness ?? current?.meanPreparedness ?? 0,
        meanStrain: response.derivedScores.strain ?? current?.meanStrain ?? 0,
        siteCounts,
        interviewerCounts,
        dailyCounts,
        updatedAt: now,
      } satisfies AggregateMetric);
    } catch {
      // Non-fatal
    }

    return { synced: true, safetyFlag };
  } catch {
    // Fallback to encrypted offline queue on transient network failure
    await enqueueSyncItem({
      id: response.id,
      operation: 'create',
      payload: response,
      safetyFlag,
      queuedAt: new Date().toISOString(),
      attempts: 1,
      lastError: 'Network unavailable during submit; queued securely offline.',
    });
    return { synced: false, safetyFlag };
  }
}

export async function flushSyncQueue(user: TeamUser): Promise<{
  syncedCount: number;
  conflictCount: number;
  remainingCount: number;
}> {
  const queue = await listSyncQueue();
  let syncedCount = 0;
  let conflictCount = 0;

  for (const item of queue) {
    if (item.conflictServerData) {
      conflictCount++;
      continue;
    }

    try {
      const ref = doc(db, 'responses', item.id);
      const existingSnap = await getDoc(ref);
      const now = new Date().toISOString();

      if (existingSnap.exists()) {
        const serverData = existingSnap.data() as InterviewResponse;
        if (serverData.updatedAt === item.payload.updatedAt) {
          // Already synced identically (idempotent)
          await removeSyncQueueItem(item.id);
          syncedCount++;
          continue;
        }
        if (serverData.updatedAt > item.payload.updatedAt) {
          // Conflict detected: server has newer changes
          await enqueueSyncItem({
            ...item,
            conflictServerData: serverData,
            attempts: item.attempts + 1,
            lastError: 'Server copy was modified more recently.',
          });
          conflictCount++;
          continue;
        }
      }

      await setDoc(ref, { ...item.payload, syncedAt: now });
      if (item.safetyFlag) {
        await setDoc(doc(db, 'safetyFlags', item.safetyFlag.id), item.safetyFlag);
      }
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'SYNC_OFFLINE_RESPONSE',
        targetType: 'response',
        targetId: item.id,
        details: `Synced offline record ${item.payload.respondentCode} after ${item.attempts} prior attempt(s)`,
      });
      await removeSyncQueueItem(item.id);
      syncedCount++;
    } catch (err) {
      await enqueueSyncItem({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  }

  const remaining = await listSyncQueue();
  return { syncedCount, conflictCount, remainingCount: remaining.length };
}

export async function resolveSyncConflict(
  item: SyncQueueItem,
  resolution: 'keep_local' | 'keep_server',
  user: TeamUser
): Promise<void> {
  if (resolution === 'keep_server') {
    await removeSyncQueueItem(item.id);
    return;
  }
  const now = new Date().toISOString();
  await setDoc(doc(db, 'responses', item.id), {
    ...item.payload,
    updatedAt: now,
    syncedAt: now,
  });
  await logAudit({
    actorUid: user.uid,
    actorName: user.displayName,
    actorRole: user.role,
    action: 'RESOLVE_SYNC_CONFLICT_LOCAL',
    targetType: 'response',
    targetId: item.id,
    details: `Resolved offline sync conflict for ${item.payload.respondentCode} using local revision`,
  });
  await removeSyncQueueItem(item.id);
}

export async function editSubmittedResponse(params: {
  original: InterviewResponse;
  updatedAnswers: Record<string, InterviewResponse['answers'][string]>;
  reason: string;
  user: TeamUser;
  config: StudyConfig;
  questionnaire: QuestionnaireVersion;
}): Promise<InterviewResponse> {
  const { original, updatedAnswers, reason, user, config, questionnaire } = params;
  const now = new Date().toISOString();
  const changedFields = Object.keys(updatedAnswers).filter(
    (k) => JSON.stringify(updatedAnswers[k]) !== JSON.stringify(original.answers[k])
  );
  const derivedScores = computeDerivedScores(updatedAnswers, config, questionnaire);
  const safetyFlagged = isSafetyTriggered(updatedAnswers);
  const ageRaw = Number(updatedAnswers.bg_age);
  const respondentAge = Number.isFinite(ageRaw) && ageRaw >= 12 ? ageRaw : original.respondentAge;

  const history = [
    ...(original.editHistory ?? []),
    {
      editedAt: now,
      editedByUid: user.uid,
      editedByName: user.displayName,
      reason,
      changedFields,
    },
  ];

  const updated: InterviewResponse = {
    ...original,
    answers: updatedAnswers,
    derivedScores,
    safetyFlagged,
    ...(respondentAge ? { respondentAge } : {}),
    editHistory: history,
    updatedAt: now,
  };

  try {
    await updateDoc(doc(db, 'responses', original.id), {
      answers: updatedAnswers,
      derivedScores,
      safetyFlagged,
      ...(respondentAge ? { respondentAge } : {}),
      editHistory: history,
      updatedAt: now,
    });
    if (safetyFlagged && !original.safetyFlagged) {
      const flag: SafetyFlag = {
        id: `flag_${original.id}`,
        responseId: original.id,
        respondentCode: original.respondentCode,
        siteId: original.siteId,
        siteName: original.siteName,
        interviewerUid: original.interviewerUid,
        interviewerName: original.interviewerName,
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(doc(db, 'safetyFlags', flag.id), flag);
    }
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'EDIT_RESPONSE',
      targetType: 'response',
      targetId: original.id,
      details: `Edited ${original.respondentCode} (${changedFields.join(', ') || 'no fields'}). Reason: ${reason}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `responses/${original.id}`);
  }

  return updated;
}

export async function requestOrApproveSoftDelete(params: {
  response: InterviewResponse;
  reason: string;
  user: TeamUser;
  approveImmediately?: boolean;
}): Promise<void> {
  const { response, reason, user, approveImmediately } = params;
  const now = new Date().toISOString();
  try {
    if (user.role === 'admin' && approveImmediately) {
      await updateDoc(doc(db, 'responses', response.id), {
        softDeleted: true,
        deleteApprovalStatus: 'approved',
        deleteReason: reason,
        updatedAt: now,
      });
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'APPROVE_DELETE',
        targetType: 'response',
        targetId: response.id,
        details: `Soft-deleted ${response.respondentCode}. Reason: ${reason}`,
      });
    } else {
      await updateDoc(doc(db, 'responses', response.id), {
        deleteApprovalStatus: 'pending',
        deleteReason: reason,
        updatedAt: now,
      });
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'REQUEST_DELETE',
        targetType: 'response',
        targetId: response.id,
        details: `Requested soft-delete for ${response.respondentCode}. Reason: ${reason}`,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `responses/${response.id}`);
  }
}

export async function acknowledgeSafetyFlag(params: {
  flag: SafetyFlag;
  status: 'acknowledged' | 'referred';
  notes: string;
  user: TeamUser;
}): Promise<void> {
  const { flag, status, notes, user } = params;
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'safetyFlags', flag.id), {
      status,
      acknowledgedByUid: user.uid,
      acknowledgedByName: user.displayName,
      notes,
      updatedAt: now,
    });
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'ACKNOWLEDGE_SAFETY_FLAG',
      targetType: 'safetyFlag',
      targetId: flag.id,
      details: `Marked safety flag for ${flag.respondentCode} as ${status}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `safetyFlags/${flag.id}`);
  }
}

export async function saveResponseTag(tag: ResponseTag, user: TeamUser): Promise<void> {
  try {
    await setDoc(doc(db, 'responseTags', tag.responseId), tag);
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'TAG_OPEN_TEXT',
      targetType: 'responseTag',
      targetId: tag.responseId,
      details: `Updated themes (${tag.themes.join(', ')}) [AI status: ${tag.aiReviewStatus ?? 'none'}]`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `responseTags/${tag.responseId}`);
  }
}

export async function recordExportLog(
  user: TeamUser,
  format: 'csv' | 'xlsx',
  recordCount: number,
  filterSummary: string
): Promise<void> {
  const id = makeId('exp');
  const entry: ExportLogEntry = {
    id,
    actorUid: user.uid,
    actorName: user.displayName,
    format,
    recordCount,
    filterSummary,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'exports', id), entry);
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'EXPORT_DATA',
      targetType: 'export',
      targetId: id,
      details: `Exported ${recordCount} de-identified responses as ${format.toUpperCase()} (${filterSummary})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `exports/${id}`);
  }
}

export async function createShareableReport(params: {
  title: string;
  filters: Record<string, string>;
  snapshotData: Record<string, unknown>;
  user: TeamUser;
}): Promise<SharedReport> {
  const token = makeId('rpt');
  const report: SharedReport = {
    token,
    title: params.title,
    createdByUid: params.user.uid,
    createdByName: params.user.displayName,
    filters: params.filters,
    snapshotData: params.snapshotData,
    revoked: false,
    createdAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'sharedReports', token), report);
    await logAudit({
      actorUid: params.user.uid,
      actorName: params.user.displayName,
      actorRole: params.user.role,
      action: 'CREATE_SHARE_LINK',
      targetType: 'sharedReport',
      targetId: token,
      details: `Created read-only aggregate report link: ${params.title}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `sharedReports/${token}`);
  }
  return report;
}

export async function loadPilotDataset(count: number, user: TeamUser, config: StudyConfig): Promise<void> {
  const items = buildPilotResponses(count, user.uid, user.displayName);
  const batch = writeBatch(db);
  for (const r of items) {
    batch.set(doc(db, 'responses', r.id), r);
  }
  try {
    await batch.commit();
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'SEED_PILOT_DATASET',
      targetType: 'responses',
      targetId: `n_${count}`,
      details: `Loaded ${count} synthetic de-identified pilot responses for analysis testing`,
    });
    await refreshAggregateSummary(items, config);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'responses_pilot_seed');
  }
}

export async function clearPilotDataset(responses: InterviewResponse[], user: TeamUser, config: StudyConfig): Promise<void> {
  const pilots = responses.filter((r) => r.id.startsWith('pilot_'));
  if (pilots.length === 0) return;
  const batch = writeBatch(db);
  for (const p of pilots) {
    batch.update(doc(db, 'responses', p.id), {
      softDeleted: true,
      deleteApprovalStatus: 'approved',
      deleteReason: 'Cleared synthetic pilot records before live field collection',
      updatedAt: new Date().toISOString(),
    });
  }
  try {
    await batch.commit();
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'CLEAR_PILOT_DATASET',
      targetType: 'responses',
      targetId: `cleared_${pilots.length}`,
      details: `Soft-deleted ${pilots.length} synthetic pilot responses`,
    });
    const remaining = responses.filter((r) => !r.id.startsWith('pilot_'));
    await refreshAggregateSummary(remaining, config);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'responses_pilot_clear');
  }
}

export async function fetchAllAuditLogs(): Promise<AuditLogEntry[]> {
  try {
    const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AuditLogEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'auditLogs');
  }
}

export async function fetchMyResponses(uid: string): Promise<InterviewResponse[]> {
  try {
    const q = query(collection(db, 'responses'), where('interviewerUid', '==', uid));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as InterviewResponse)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'responses');
  }
}

export async function inviteOrUpdateTeamMember(params: {
  email: string;
  displayName: string;
  role: UserRole;
  assignedSiteId?: string;
  actor: TeamUser;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const invite: TeamInvite = {
    email,
    displayName: params.displayName.trim(),
    role: params.role,
    ...(params.assignedSiteId ? { assignedSiteId: params.assignedSiteId } : {}),
    createdByUid: params.actor.uid,
    createdAt: now,
  };
  try {
    await setDoc(doc(db, 'teamInvites', email), invite);
    await logAudit({
      actorUid: params.actor.uid,
      actorName: params.actor.displayName,
      actorRole: params.actor.role,
      action: 'MANAGE_USER',
      targetType: 'teamInvite',
      targetId: email,
      details: `Invited/assigned ${params.displayName} (${email}) as ${params.role}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `teamInvites/${email}`);
  }
}

export async function removeTeamInvite(email: string, actor: TeamUser): Promise<void> {
  try {
    await deleteDoc(doc(db, 'teamInvites', email));
    await logAudit({
      actorUid: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      action: 'REMOVE_INVITE',
      targetType: 'teamInvite',
      targetId: email,
      details: `Removed pending team invite for ${email}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `teamInvites/${email}`);
  }
}
