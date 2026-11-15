import React, { useState } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  Check,
  Database,
  FileCheck2,
  History,
  Lock,
  Plus,
  Shield,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  clearPilotDataset,
  inviteOrUpdateTeamMember,
  loadPilotDataset,
  logAudit,
  makeId,
  removeTeamInvite,
  requestOrApproveSoftDelete,
} from '../lib/studyService.ts';
import type {
  AuditLogEntry,
  ExportLogEntry,
  InterviewResponse,
  Site,
  StudyConfig,
  TeamInvite,
  TeamUser,
  UserDirectoryEntry,
  UserRole,
} from '../types/study.ts';

interface GovernanceViewProps {
  user: TeamUser;
  sites: Site[];
  config: StudyConfig;
  directory: UserDirectoryEntry[];
  invites: TeamInvite[];
  responses: InterviewResponse[];
  auditLogs: AuditLogEntry[];
  exportLogs: ExportLogEntry[];
  onSitesUpdated: (sites: Site[]) => void;
  onConfigUpdated: (config: StudyConfig) => void;
  onDataChanged: () => Promise<void>;
}

export const GovernanceView: React.FC<GovernanceViewProps> = ({
  user,
  sites,
  config,
  directory,
  invites,
  responses,
  auditLogs,
  exportLogs,
  onSitesUpdated,
  onConfigUpdated,
  onDataChanged,
}) => {
  const [subTab, setSubTab] = useState<'team' | 'sites' | 'cutoffs' | 'audit' | 'privacy'>('team');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('interviewer');
  const [inviteSiteId, setInviteSiteId] = useState(
    sites.find((s) => s.active)?.id || sites[0]?.id || ''
  );

  const [siteName, setSiteName] = useState('');
  const [siteDistrict, setSiteDistrict] = useState('');
  const [siteUrbanRural, setSiteUrbanRural] = useState<Site['urbanRural']>('urban');
  const [siteContact, setSiteContact] = useState('');
  const [sitePhone, setSitePhone] = useState('');
  const [siteProtocol, setSiteProtocol] = useState('');

  const [prepCutoff, setPrepCutoff] = useState(String(config.preparednessCutoff));
  const [strainCutoff, setStrainCutoff] = useState(String(config.strainCutoff));
  const [targetN, setTargetN] = useState(String(config.targetSampleSize));
  const [retentionDays, setRetentionDays] = useState(String(config.dataRetentionDays));
  const [cutoffReason, setCutoffReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';
  const pendingDeletes = responses.filter((r) => !r.softDeleted && r.deleteApprovalStatus === 'pending');

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !inviteEmail.trim() || !inviteName.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await inviteOrUpdateTeamMember({
        email: inviteEmail,
        displayName: inviteName,
        role: inviteRole,
        assignedSiteId: inviteSiteId,
        actor: user,
      });
      setInviteEmail('');
      setInviteName('');
      await onDataChanged();
      setFeedback('Team member role invite saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (member: UserDirectoryEntry, newRole: UserRole) => {
    if (!isAdmin || member.uid === user.uid) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', member.uid), { role: newRole, updatedAt: now });
      await updateDoc(doc(db, 'userDirectory', member.uid), { role: newRole, updatedAt: now });
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'MANAGE_USER',
        targetType: 'user',
        targetId: member.uid,
        details: `Updated ${member.displayName} role to ${newRole}`,
      });
      await onDataChanged();
      setFeedback(`Updated ${member.displayName} to ${newRole}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${member.uid}`);
    }
  };

  const handleAddSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !siteName.trim() || !siteDistrict.trim()) return;
    setBusy(true);
    const now = new Date().toISOString();
    const nextSite: Site = {
      id: makeId('site'),
      name: siteName.trim(),
      district: siteDistrict.trim(),
      urbanRural: siteUrbanRural,
      referralContactName: siteContact.trim() || 'Mental Health Nurse on Duty',
      referralContactPhone: sitePhone.trim() || 'RBC Helpline: 114',
      referralProtocolEn:
        siteProtocol.trim() ||
        'Stop interview, stay with the mother, and escort her the same day to the health centre mental health desk.',
      referralProtocolRw: '[Needs professional translation and back-translation]',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await setDoc(doc(db, 'sites', nextSite.id), nextSite);
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'ADD_SITE',
        targetType: 'site',
        targetId: nextSite.id,
        details: `Added health centre site: ${nextSite.name} (${nextSite.district})`,
      });
      onSitesUpdated([...sites, nextSite]);
      setSiteName('');
      setSiteDistrict('');
      setSiteContact('');
      setSitePhone('');
      setSiteProtocol('');
      setFeedback(`Added site ${nextSite.name}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCutoffs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (config.cutoffsLocked) {
      setFeedback('Cutoffs are locked for formal analysis. Unlock only with a documented protocol amendment.');
      return;
    }
    if (cutoffReason.trim().length < 5) {
      setFeedback('Please enter a brief documented reason for updating study thresholds.');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const nextPrep = Number(prepCutoff);
    const nextStrain = Number(strainCutoff);
    const nextTarget = Number(targetN);
    const nextLog = [
      ...(config.cutoffChangeLog ?? []),
      {
        changedAt: now,
        changedByUid: user.uid,
        changedByName: user.displayName,
        field: 'preparednessCutoff' as const,
        previousValue: config.preparednessCutoff,
        newValue: nextPrep,
        reason: cutoffReason.trim(),
      },
    ];
    const nextCfg: StudyConfig = {
      ...config,
      preparednessCutoff: nextPrep,
      strainCutoff: nextStrain,
      targetSampleSize: nextTarget,
      cutoffChangeLog: nextLog,
      updatedByUid: user.uid,
      updatedAt: now,
    };
    try {
      await setDoc(doc(db, 'studyConfig', 'main'), nextCfg);
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'UPDATE_CONFIG',
        targetType: 'studyConfig',
        targetId: 'main',
        details: `Updated cutoffs (prep=${nextPrep}, strain=${nextStrain}, target=${nextTarget}). Reason: ${cutoffReason.trim()}`,
      });
      onConfigUpdated(nextCfg);
      setCutoffReason('');
      setFeedback('Study thresholds saved and logged.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleLock = async () => {
    if (!isAdmin) return;
    const reason = window.prompt(
      config.cutoffsLocked
        ? 'Protocol amendment reason to UNLOCK cutoffs:'
        : 'Confirm reason to LOCK cutoffs before formal analysis:'
    );
    if (!reason || reason.trim().length < 4) return;
    const now = new Date().toISOString();
    const nextLocked = !config.cutoffsLocked;
    const nextCfg: StudyConfig = {
      ...config,
      cutoffsLocked: nextLocked,
      cutoffChangeLog: [
        ...(config.cutoffChangeLog ?? []),
        {
          changedAt: now,
          changedByUid: user.uid,
          changedByName: user.displayName,
          field: 'cutoffsLocked',
          previousValue: config.cutoffsLocked,
          newValue: nextLocked,
          reason: reason.trim(),
        },
      ],
      updatedByUid: user.uid,
      updatedAt: now,
    };
    await setDoc(doc(db, 'studyConfig', 'main'), nextCfg);
    await logAudit({
      actorUid: user.uid,
      actorName: user.displayName,
      actorRole: user.role,
      action: 'LOCK_CUTOFFS',
      targetType: 'studyConfig',
      targetId: 'main',
      details: `${nextLocked ? 'Locked' : 'Unlocked'} derived score cutoffs. Reason: ${reason.trim()}`,
    });
    onConfigUpdated(nextCfg);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
            Team, Sites, Cutoffs & Data Governance
          </h2>
          <p className="text-sm text-[#5E6A63] dark:text-[#98A69E] mt-0.5">
            Role-based access control, clinic referral protocols, immutable audit trail, and privacy safeguards.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#EFECE4] dark:bg-[#111412]">
          {(
            [
              ['team', 'Team (8)'],
              ['sites', 'Sites & Hospitals'],
              ['cutoffs', 'Cutoffs & Lock'],
              ['audit', 'Audit & Exports'],
              ['privacy', 'Privacy & Pilot Data'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                subTab === id
                  ? 'bg-white dark:bg-[#222925] text-[#1C2420] dark:text-white shadow-xs'
                  : 'text-[#5E6A63]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/10 px-4 py-3 text-sm text-[#1B4D3E] dark:text-[#6EE7B7] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {subTab === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1B4D3E]" />
                <span>Active Research Team ({directory.length} / 8 students)</span>
              </h3>
              <div className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {directory.map((m) => (
                  <div key={m.uid} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-[#1C2420] dark:text-[#EEF2EF]">{m.displayName}</p>
                      <p className="font-mono text-xs text-[#5E6A63]">
                        Role: {m.role} · {m.active ? 'Active' : 'Disabled'}
                      </p>
                    </div>
                    {isAdmin && m.uid !== user.uid && (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value as UserRole)}
                        className="min-h-[38px] rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs"
                      >
                        <option value="interviewer">Interviewer</option>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {invites.length > 0 && (
              <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-3">
                <h3 className="text-base font-semibold">Pending Pre-Assigned Team Invites</h3>
                <div className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                  {invites.map((inv) => (
                    <div key={inv.email} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-medium">{inv.displayName} ({inv.email})</p>
                        <p className="font-mono text-[#5E6A63]">Assigned role: {inv.role}</p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={async () => {
                            await removeTeamInvite(inv.email, user);
                            await onDataChanged();
                          }}
                          className="text-[#B91C1C] hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 h-fit space-y-4">
            <h3 className="font-display text-lg font-semibold">Assign Team Member Role</h3>
            {!isAdmin ? (
              <p className="text-xs text-[#5E6A63]">Only Admin can pre-register team roles.</p>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Student full name"
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
                />
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="student@university.ac.rw"
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
                >
                  <option value="interviewer">Interviewer (collect + own entries)</option>
                  <option value="analyst">Analyst (read-only de-identified + dashboard)</option>
                  <option value="admin">Admin (research lead)</option>
                </select>
                <select
                  value={inviteSiteId}
                  onChange={(e) => setInviteSiteId(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
                >
                  {sites
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        Default site: {s.name}
                      </option>
                    ))}
                </select>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[44px] rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white"
                >
                  Save Team Assignment
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {subTab === 'sites' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
            {sites
              .filter((s) => s.active)
              .map((s) => (
                <div key={s.id} className="p-5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-base">{s.name}</h4>
                    <span className="font-mono text-xs text-[#5E6A63]">
                      {s.district} · {s.urbanRural}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[#1B4D3E] dark:text-[#6EE7B7]">
                    Referral Contact: {s.referralContactName} ({s.referralContactPhone})
                  </p>
                  <p className="text-xs text-[#4A5550] dark:text-[#B8C2BC]">{s.referralProtocolEn}</p>
                </div>
              ))}
          </div>

          {isAdmin && (
            <form
              onSubmit={handleAddSite}
              className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 h-fit space-y-3"
            >
              <h3 className="font-display text-lg font-semibold">Add Hospital / Study Site</h3>
              <input
                type="text"
                required
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="Hospital or health centre name"
                className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
              />
              <input
                type="text"
                required
                value={siteDistrict}
                onChange={(e) => setSiteDistrict(e.target.value)}
                placeholder="District (e.g., Huye)"
                className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
              />
              <select
                value={siteUrbanRural}
                onChange={(e) => setSiteUrbanRural(e.target.value as Site['urbanRural'])}
                className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
              >
                <option value="urban">Urban</option>
                <option value="peri-urban">Peri-urban</option>
                <option value="rural">Rural</option>
              </select>
              <input
                type="text"
                value={siteContact}
                onChange={(e) => setSiteContact(e.target.value)}
                placeholder="Mental health focal contact"
                className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
              />
              <input
                type="text"
                value={sitePhone}
                onChange={(e) => setSitePhone(e.target.value)}
                placeholder="Clinic desk / helpline"
                className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
              />
              <textarea
                rows={3}
                value={siteProtocol}
                onChange={(e) => setSiteProtocol(e.target.value)}
                placeholder="Same-day referral protocol instructions..."
                className="w-full rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] p-3 text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1B4D3E] text-sm font-semibold text-white"
              >
                <Plus className="w-4 h-4" />
                <span>Add Site</span>
              </button>
            </form>
          )}
        </div>
      )}

      {subTab === 'cutoffs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleSaveCutoffs}
            className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-semibold">Derived Score Cutoffs & Target N</h3>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleToggleLock}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-semibold border ${
                    config.cutoffsLocked
                      ? 'border-[#B45309] text-[#B45309]'
                      : 'border-[#1B4D3E] text-[#1B4D3E] dark:text-[#6EE7B7]'
                  }`}
                >
                  {config.cutoffsLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>{config.cutoffsLocked ? 'Unlock Cutoffs' : 'Lock Cutoffs for Analysis'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Unprepared &lt;</label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  max={5}
                  disabled={!isAdmin || config.cutoffsLocked}
                  value={prepCutoff}
                  onChange={(e) => setPrepCutoff(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">High Strain ≥</label>
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  max={5}
                  disabled={!isAdmin || config.cutoffsLocked}
                  value={strainCutoff}
                  onChange={(e) => setStrainCutoff(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Target N</label>
                <input
                  type="number"
                  min={30}
                  max={50000}
                  disabled={!isAdmin || config.cutoffsLocked}
                  value={targetN}
                  onChange={(e) => setTargetN(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 font-mono text-sm"
                />
              </div>
            </div>

            {isAdmin && !config.cutoffsLocked && (
              <>
                <input
                  type="text"
                  required
                  value={cutoffReason}
                  onChange={(e) => setCutoffReason(e.target.value)}
                  placeholder="Documented reason for threshold change..."
                  className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white"
                >
                  Save & Log Threshold Change
                </button>
              </>
            )}
          </form>

          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-3">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-[#1B4D3E]" />
              <span>Cutoff & Lock Change Log</span>
            </h3>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {(config.cutoffChangeLog ?? []).map((entry, idx) => (
                <div key={idx} className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-3 text-xs space-y-1">
                  <p className="font-semibold">
                    {entry.changedByName} · <span className="font-mono">{new Date(entry.changedAt).toLocaleString()}</span>
                  </p>
                  <p className="font-mono text-[#5E6A63]">
                    {entry.field}: {String(entry.previousValue)} → {String(entry.newValue)}
                  </p>
                  <p className="text-[#4A5550] dark:text-[#B8C2BC]">{entry.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'audit' && (
        <div className="space-y-6">
          {pendingDeletes.length > 0 && isAdmin && (
            <div className="rounded-2xl border border-[#D4A145] bg-[#FEFCE8] dark:bg-[#292211] p-5 space-y-3">
              <h3 className="font-semibold text-sm text-[#854D0E] dark:text-[#FDE68A]">
                Pending Soft-Delete Requests ({pendingDeletes.length})
              </h3>
              {pendingDeletes.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#181D1A] p-3 rounded-xl border border-[#E2DDD2]">
                  <div className="text-xs">
                    <span className="font-mono font-semibold">{r.respondentCode}</span> · {r.interviewerName} · Reason: {r.deleteReason}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await requestOrApproveSoftDelete({
                        response: r,
                        reason: r.deleteReason || 'Approved by research lead',
                        user,
                        approveImmediately: true,
                      });
                      await onDataChanged();
                    }}
                    className="min-h-[36px] rounded-lg bg-[#B91C1C] px-3 text-xs font-semibold text-white"
                  >
                    Approve Soft-Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-3">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#1B4D3E]" />
                <span>Immutable Audit Trail ({auditLogs.length})</span>
              </h3>
              <div className="max-h-96 overflow-y-auto divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">{log.action}</span>
                      <span className="font-mono text-[#5E6A63]">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-[#1C2420] dark:text-[#EEF2EF]">
                      {log.actorName} ({log.actorRole}) — {log.details}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-3">
              <h3 className="text-base font-semibold">Admin Export Log ({exportLogs.length})</h3>
              {exportLogs.length === 0 ? (
                <p className="text-xs text-[#5E6A63]">No data exports performed yet.</p>
              ) : (
                <div className="max-h-96 overflow-y-auto divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                  {exportLogs.map((ex) => (
                    <div key={ex.id} className="py-2.5 text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold uppercase">{ex.format} · {ex.recordCount} rows</span>
                        <span className="font-mono text-[#5E6A63]">{new Date(ex.createdAt).toLocaleString()}</span>
                      </div>
                      <p>{ex.actorName} · Filters: {ex.filterSummary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'privacy' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#1B4D3E]" />
              <span>Privacy & Data Governance Policy</span>
            </h3>
            <ul className="space-y-2 text-sm text-[#4A5550] dark:text-[#B8C2BC] list-disc pl-5">
              <li>Zero mother PII: names, phone numbers, national IDs, GPS coordinates, and villages are excluded by schema and Firestore security rules.</li>
              <li>Encryption: TLS in transit, cloud-managed encryption at rest, and AES-GCM-256 Web Crypto encryption for offline IndexedDB drafts & sync queue.</li>
              <li>AI safeguards: Gemini receives only aggregated numeric statistics for Insights and scrubbed de-identified quotes for optional theme suggestions.</li>
              <li>Automatic inactivity lock pauses the screen after 30 minutes to protect clinic tablet/phone sessions.</li>
            </ul>

            {isAdmin && (
              <div className="pt-3 border-t border-[#E2DDD2] dark:border-[#28302B] flex items-end gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Data Retention Period (days)</label>
                  <input
                    type="number"
                    min={30}
                    max={7300}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                    className="w-36 min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 font-mono text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const days = Number(retentionDays);
                    if (!Number.isFinite(days) || days < 30) return;
                    const nextCfg: StudyConfig = {
                      ...config,
                      dataRetentionDays: days,
                      updatedByUid: user.uid,
                      updatedAt: new Date().toISOString(),
                    };
                    await setDoc(doc(db, 'studyConfig', 'main'), nextCfg);
                    onConfigUpdated(nextCfg);
                    setFeedback(`Updated retention policy to ${days} days.`);
                  }}
                  className="min-h-[40px] rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white"
                >
                  Save Retention Policy
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Database className="w-5 h-5 text-[#B8862D]" />
                <span>Synthetic Pilot Dataset Testing Tools</span>
              </h3>
              <p className="text-sm text-[#4A5550] dark:text-[#B8C2BC]">
                Test both statistical regimes safely with synthetic de-identified records (marked <code className="font-mono">pilot_*</code> so you can clear them cleanly before live fieldwork).
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await loadPilotDataset(18, user, config);
                      await onDataChanged();
                      setFeedback('Loaded 18 synthetic pilot responses (verdict remains withheld below n=30).');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-4 text-xs font-medium"
                >
                  Load Small Sample (n = 18)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await loadPilotDataset(42, user, config);
                      await onDataChanged();
                      setFeedback('Loaded 42 synthetic pilot responses (n >= 30 hypothesis tester unlocked).');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="min-h-[42px] rounded-xl bg-[#1B4D3E] px-4 text-xs font-semibold text-white"
                >
                  Load Full Pilot Sample (n = 42)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await clearPilotDataset(responses, user, config);
                      await onDataChanged();
                      setFeedback('Cleared synthetic pilot records.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[#FECACA] px-4 text-xs font-medium text-[#991B1B]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Pilot Records</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
