import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Lock,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  WifiOff,
} from 'lucide-react';
import { DashboardView } from './components/DashboardView.tsx';
import { GovernanceView } from './components/GovernanceView.tsx';
import { InterviewFlow } from './components/InterviewFlow.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { MyEntriesView } from './components/MyEntriesView.tsx';
import { OpenTextView } from './components/OpenTextView.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { QuestionnaireBuilder } from './components/QuestionnaireBuilder.tsx';
import { SharedReportView } from './components/SharedReportView.tsx';
import { SEED_QUESTIONNAIRE_V1, SEED_SITES, SEED_STUDY_CONFIG } from './data/seedData.ts';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  isFirebasePlaceholder,
  OperationType,
  testFirestoreConnection,
} from './lib/firebase.ts';
import { listSyncQueue, loadCachedStudyBundle } from './lib/offlineStore.ts';
import {
  ensureStudySeeded,
  ensureUserProfile,
  flushSyncQueue,
  refreshAggregateSummary,
} from './lib/studyService.ts';
import type {
  AggregateMetric,
  AuditLogEntry,
  ExportLogEntry,
  InterviewResponse,
  QuestionnaireVersion,
  ResponseTag,
  SafetyFlag,
  Site,
  StudyConfig,
  SyncQueueItem,
  TeamInvite,
  TeamUser,
  UserDirectoryEntry,
  UserRole,
} from './types/study.ts';

type NavTab = 'interview' | 'entries' | 'dashboard' | 'open_text' | 'questionnaire' | 'governance';

export default function App() {
  const reportToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('report');
  }, []);

  if (reportToken) {
    return <SharedReportView token={reportToken} />;
  }

  return <AuthenticatedApp />;
}

const AuthenticatedApp: React.FC = () => {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ds_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [teamUser, setTeamUser] = useState<TeamUser | null>(null);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);

  const [sites, setSites] = useState<Site[]>(SEED_SITES);
  const [config, setConfig] = useState<StudyConfig>(SEED_STUDY_CONFIG);
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireVersion>(SEED_QUESTIONNAIRE_V1);

  const [responses, setResponses] = useState<InterviewResponse[]>([]);
  const [aggregateMetric, setAggregateMetric] = useState<AggregateMetric | null>(null);
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlag[]>([]);
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [exportLogs, setExportLogs] = useState<ExportLogEntry[]>([]);
  const [tagsByResponseId, setTagsByResponseId] = useState<Record<string, ResponseTag>>({});
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>([]);
  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('interview');

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('ds_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ds_theme', 'light');
    }
  }, [dark]);

  // Connectivity listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Inactivity session lock (default 30 min)
  useEffect(() => {
    if (!teamUser) return;
    const timeoutMins = Number(import.meta.env.VITE_SESSION_TIMEOUT_MINUTES || 30);
    const timeoutMs = Math.max(5, timeoutMins) * 60_000;
    let timer = window.setTimeout(() => setSessionLocked(true), timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSessionLocked(true), timeoutMs);
    };

    const events = ['pointerdown', 'keydown', 'scroll'];
    for (const ev of events) window.addEventListener(ev, resetTimer, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, resetTimer);
    };
  }, [teamUser]);

  const refreshQueue = useCallback(async () => {
    const q = await listSyncQueue();
    setSyncQueue(q);
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (!teamUser || !navigator.onLine) return;
    const res = await flushSyncQueue(teamUser);
    await refreshQueue();
    if (res.syncedCount > 0) {
      setSyncBanner(`Synced ${res.syncedCount} offline interview(s) cleanly without duplicates.`);
      setTimeout(() => setSyncBanner(null), 5000);
    } else if (res.conflictCount > 0) {
      setSyncBanner(`${res.conflictCount} sync conflict(s) require resolution in Field Hub.`);
    }
  }, [teamUser, refreshQueue]);

  // Auto-flush offline queue when connection returns
  useEffect(() => {
    if (isOnline && teamUser && syncQueue.length > 0) {
      void handleSyncNow();
    }
  }, [isOnline, teamUser, syncQueue.length, handleSyncNow]);

  // Auth & study bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setTeamUser(null);
        setAuthReady(true);
        return;
      }

      try {
        setAuthError(null);
        await testFirestoreConnection();
        const profile = await ensureUserProfile(fbUser);
        setTeamUser(profile);
        setActiveTab(profile.role === 'analyst' ? 'dashboard' : 'interview');
        const seeded = await ensureStudySeeded(profile);
        setSites(seeded.sites);
        setConfig(seeded.config);
        setQuestionnaire(seeded.questionnaire);
        await refreshQueue();
      } catch (err) {
        // Fallback to cached offline study bundle if device is offline
        const cached = await loadCachedStudyBundle();
        if (cached.sites) setSites(cached.sites);
        if (cached.config) setConfig(cached.config);
        if (cached.questionnaire) setQuestionnaire(cached.questionnaire);
        if (!navigator.onLine) {
          setTeamUser({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || 'Offline Researcher',
            role: 'interviewer',
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          setAuthError(err instanceof Error ? err.message : 'Unable to initialize session.');
        }
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, [refreshQueue]);

  // Real-time Firestore listeners once authenticated
  useEffect(() => {
    if (!authReady || !firebaseUser || !teamUser) return;
    const unsubs: Array<() => void> = [];

    // Responses listener (strictly scoped by role to match Firestore rules!)
    const responsesQuery =
      teamUser.role === 'admin' || teamUser.role === 'analyst'
        ? query(collection(db, 'responses'), orderBy('createdAt', 'desc'))
        : query(collection(db, 'responses'), where('interviewerUid', '==', teamUser.uid));

    unsubs.push(
      onSnapshot(
        responsesQuery,
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as InterviewResponse)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setResponses(list);
          if (teamUser.role === 'admin' || teamUser.role === 'analyst') {
            void refreshAggregateSummary(list, config);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'responses')
      )
    );

    // Aggregate metrics summary for all active team members
    unsubs.push(
      onSnapshot(
        doc(db, 'aggregateMetrics', 'studySummary'),
        (snap) => {
          if (snap.exists()) setAggregateMetric(snap.data() as AggregateMetric);
        },
        () => {}
      )
    );

    // Team directory
    unsubs.push(
      onSnapshot(
        collection(db, 'userDirectory'),
        (snap) => setDirectory(snap.docs.map((d) => d.data() as UserDirectoryEntry)),
        () => {}
      )
    );

    // Safety flags
    const flagsQuery =
      teamUser.role === 'admin'
        ? query(collection(db, 'safetyFlags'), orderBy('createdAt', 'desc'))
        : query(collection(db, 'safetyFlags'), where('interviewerUid', '==', teamUser.uid));
    unsubs.push(
      onSnapshot(
        flagsQuery,
        (snap) => setSafetyFlags(snap.docs.map((d) => d.data() as SafetyFlag)),
        () => {}
      )
    );

    // Tags, auditLogs, invites, exports (Admin/Analyst)
    if (teamUser.role === 'admin' || teamUser.role === 'analyst') {
      unsubs.push(
        onSnapshot(
          collection(db, 'responseTags'),
          (snap) => {
            const map: Record<string, ResponseTag> = {};
            for (const d of snap.docs) {
              const t = d.data() as ResponseTag;
              map[t.responseId] = t;
            }
            setTagsByResponseId(map);
          },
          () => {}
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc')),
          (snap) => setAuditLogs(snap.docs.map((d) => d.data() as AuditLogEntry)),
          () => {}
        )
      );
    }

    if (teamUser.role === 'admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'teamInvites'),
          (snap) => setInvites(snap.docs.map((d) => d.data() as TeamInvite)),
          () => {}
        )
      );
      unsubs.push(
        onSnapshot(
          query(collection(db, 'exports'), orderBy('createdAt', 'desc')),
          (snap) => setExportLogs(snap.docs.map((d) => d.data() as ExportLogEntry)),
          () => {}
        )
      );
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [authReady, firebaseUser, teamUser, config]);

  const handleGoogleSignIn = async () => {
    if (isFirebasePlaceholder) {
      setAuthError(
        'Firebase is not provisioned for this workspace yet. Ask the AI Studio assistant here to set up Firebase and deploy firestore.rules first.'
      );
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        setAuthError(
          `Domain "${window.location.hostname}" is not in Firebase Authorized Domains. Add it in Firebase Console → Authentication → Settings → Authorized domains, or provision Firebase for this project.`
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError('Sign-in popup was blocked by your browser. Allow popups for this site and try again.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or failed.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setTeamUser(null);
    setPreviewRole(null);
  };

  const effectiveRole: UserRole = previewRole ?? teamUser?.role ?? 'interviewer';

  const navLinks = useMemo(() => {
    if (effectiveRole === 'interviewer') {
      return [
        { id: 'interview' as NavTab, label: 'Collect' },
        { id: 'entries' as NavTab, label: 'My Entries' },
        { id: 'dashboard' as NavTab, label: 'Overview' },
      ];
    }
    if (effectiveRole === 'analyst') {
      return [
        { id: 'dashboard' as NavTab, label: 'Dashboard' },
        { id: 'open_text' as NavTab, label: 'Open Text' },
        { id: 'questionnaire' as NavTab, label: 'Codebook' },
        { id: 'governance' as NavTab, label: 'Governance' },
      ];
    }
    return [
      { id: 'interview' as NavTab, label: 'Collect' },
      { id: 'entries' as NavTab, label: 'My Entries' },
      { id: 'dashboard' as NavTab, label: 'Dashboard' },
      { id: 'open_text' as NavTab, label: 'Open Text' },
      { id: 'questionnaire' as NavTab, label: 'Builder' },
      { id: 'governance' as NavTab, label: 'Governance' },
    ];
  }, [effectiveRole]);

  // Loading state
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#F6F4EF] dark:bg-[#111412]">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
          <div className="h-5 w-40 rounded bg-[#EFECE4] dark:bg-[#222925]" />
          <div className="h-4 w-64 rounded bg-[#EFECE4] dark:bg-[#222925]" />
          <p className="text-xs text-[#5E6A63] pt-2">Initializing encrypted study workspace...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated Sign-In Landing
  if (!firebaseUser || !teamUser) {
    return (
      <LandingPage
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        signingIn={signingIn}
        authError={authError}
        onSignIn={handleGoogleSignIn}
        sites={sites}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#09090B] text-zinc-950 dark:text-zinc-50">
      {/* Strict 3-Zone Top Bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111113] sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab(effectiveRole === 'analyst' ? 'dashboard' : 'interview')}
            className="font-display text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0"
          >
            Data Detectives
          </button>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4A5550] dark:text-[#B8C2BC]" aria-label="Primary Navigation">
            {navLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => setActiveTab(link.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  activeTab === link.id
                    ? 'border-[#1B4D3E] text-[#1B4D3E] dark:border-[#6EE7B7] dark:text-[#6EE7B7]'
                    : 'border-transparent hover:text-[#1C2420] dark:hover:text-white'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-3.5 py-2 text-xs font-medium text-[#1C2420] dark:text-[#EEF2EF] hover:bg-[#EFECE4] dark:hover:bg-[#222925] whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="md:hidden border-t border-[#E2DDD2] dark:border-[#28302B] px-3 py-1.5 flex items-center gap-1 overflow-x-auto">
          {navLinks.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => setActiveTab(link.id)}
              className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 min-h-[38px] ${
                activeTab === link.id
                  ? 'bg-[#1B4D3E] text-white'
                  : 'text-[#4A5550] dark:text-[#B8C2BC]'
              }`}
            >
              {link.label}
            </button>
          ))}
        </div>
      </header>

      {/* Workspace Context Bar (user attribution, role preview for admin, theme, PWA install, offline sync) */}
      <div className="border-b border-[#E2DDD2] dark:border-[#28302B] bg-[#EFECE4]/60 dark:bg-[#141916]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[#4A5550] dark:text-[#B8C2BC]">
            <span className="font-medium text-[#1C2420] dark:text-[#EEF2EF]">{teamUser.displayName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono uppercase">{teamUser.role}</span>
            {previewRole && previewRole !== teamUser.role && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#B45309] font-medium">Previewing {previewRole} view</span>
              </>
            )}
            {!isOnline && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold">
                  <WifiOff className="w-3.5 h-3.5" /> Offline Mode
                </span>
              </>
            )}
            {syncQueue.length > 0 && isOnline && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  className="inline-flex items-center gap-1 text-[#1B4D3E] dark:text-[#6EE7B7] font-semibold underline"
                >
                  <RefreshCw className="w-3 h-3" /> Sync {syncQueue.length} queued
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {teamUser.role === 'admin' && (
              <div className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-[#181D1A] border border-[#D8D2C5] dark:border-[#2E3832] p-0.5">
                {(['admin', 'interviewer', 'analyst'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setPreviewRole(r === 'admin' ? null : r);
                      if (r === 'analyst' && (activeTab === 'interview' || activeTab === 'entries')) {
                        setActiveTab('dashboard');
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize ${
                      effectiveRole === r
                        ? 'bg-[#1B4D3E] text-white'
                        : 'text-[#5E6A63] hover:text-[#1C2420]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle light or dark mode"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#181D1A]"
            >
              {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {syncBanner && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-4">
          <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/10 px-4 py-2.5 text-xs font-medium text-[#1B4D3E] dark:text-[#6EE7B7]">
            {syncBanner}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'interview' && effectiveRole !== 'analyst' && (
          <InterviewFlow
            user={teamUser}
            sites={sites}
            questionnaire={questionnaire}
            config={config}
            isOnline={isOnline}
            syncQueue={syncQueue}
            onRefreshQueue={refreshQueue}
            onSyncNow={handleSyncNow}
            onSubmitted={(resp, synced) => {
              if (synced) {
                setResponses((prev) => [resp, ...prev.filter((p) => p.id !== resp.id)]);
              }
            }}
          />
        )}

        {activeTab === 'entries' && effectiveRole !== 'analyst' && (
          <MyEntriesView
            user={teamUser}
            entries={responses.filter((r) => r.interviewerUid === teamUser.uid)}
            questionnaire={questionnaire}
            config={config}
            onUpdated={(updated) =>
              setResponses((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
            }
            onDeleted={(id) =>
              setResponses((prev) =>
                prev.map((r) => (r.id === id ? { ...r, softDeleted: true } : r))
              )
            }
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            user={teamUser}
            effectiveRole={effectiveRole}
            responses={responses}
            aggregateMetric={aggregateMetric}
            safetyFlags={safetyFlags}
            sites={sites}
            directory={directory}
            questionnaire={questionnaire}
            config={config}
            onSafetyFlagUpdated={(flag) =>
              setSafetyFlags((prev) => prev.map((f) => (f.id === flag.id ? flag : f)))
            }
          />
        )}

        {activeTab === 'open_text' && (effectiveRole === 'admin' || effectiveRole === 'analyst') && (
          <OpenTextView
            user={teamUser}
            responses={responses}
            tagsByResponseId={tagsByResponseId}
            onTagSaved={(tag) =>
              setTagsByResponseId((prev) => ({ ...prev, [tag.responseId]: tag }))
            }
          />
        )}

        {activeTab === 'questionnaire' && (effectiveRole === 'admin' || effectiveRole === 'analyst') && (
          <QuestionnaireBuilder
            user={effectiveRole === 'admin' ? teamUser : { ...teamUser, role: 'analyst' }}
            questionnaire={questionnaire}
            config={config}
            onPublished={(nextVer) => setQuestionnaire(nextVer)}
          />
        )}

        {activeTab === 'governance' && (effectiveRole === 'admin' || effectiveRole === 'analyst') && (
          <GovernanceView
            user={effectiveRole === 'admin' ? teamUser : { ...teamUser, role: 'analyst' }}
            sites={sites}
            config={config}
            directory={directory}
            invites={invites}
            responses={responses}
            auditLogs={auditLogs}
            exportLogs={exportLogs}
            onSitesUpdated={setSites}
            onConfigUpdated={setConfig}
            onDataChanged={async () => {
              await refreshQueue();
            }}
          />
        )}
      </main>

      {/* Inactivity Session Lock Modal */}
      {sessionLocked && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#1B4D3E]/10 text-[#1B4D3E]">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-display text-xl font-semibold">Session Paused for Privacy</h2>
            <p className="text-sm text-[#5E6A63] dark:text-[#98A69E]">
              Your screen locked automatically after inactivity to protect sensitive maternal interview data.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSessionLocked(false)}
                className="w-full min-h-[48px] rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white"
              >
                Resume Session ({teamUser.displayName})
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] text-xs"
              >
                Sign out completely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Floating Indicator */}
      {!isOnline && (
        <div className="fixed bottom-20 sm:bottom-4 left-4 z-40 rounded-xl bg-[#B45309] px-3.5 py-2 text-xs font-medium text-white shadow-lg flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Offline Mode · Encrypted local storage active</span>
        </div>
      )}
    </div>
  );
};
