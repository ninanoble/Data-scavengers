import React, { useState } from 'react';
import { Clock, Edit3, History, Search, Trash2, X } from 'lucide-react';
import { editSubmittedResponse, requestOrApproveSoftDelete } from '../lib/studyService.ts';
import type {
  AnswerValue,
  InterviewResponse,
  QuestionnaireVersion,
  StudyConfig,
  TeamUser,
} from '../types/study.ts';

interface MyEntriesViewProps {
  user: TeamUser;
  entries: InterviewResponse[];
  questionnaire: QuestionnaireVersion;
  config: StudyConfig;
  onUpdated: (updated: InterviewResponse) => void;
  onDeleted: (id: string) => void;
}

export const MyEntriesView: React.FC<MyEntriesViewProps> = ({
  user,
  entries,
  questionnaire,
  config,
  onUpdated,
  onDeleted,
}) => {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InterviewResponse | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<string, AnswerValue>>({});
  const [editReason, setEditReason] = useState('');
  const [historyItem, setHistoryItem] = useState<InterviewResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InterviewResponse | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const visible = entries.filter((e) => {
    if (e.softDeleted) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      e.respondentCode.toLowerCase().includes(q) ||
      e.siteName.toLowerCase().includes(q)
    );
  });

  const openEdit = (item: InterviewResponse) => {
    setEditing(item);
    setEditAnswers({ ...item.answers });
    setEditReason('');
    setErrorMsg(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (editReason.trim().length < 5) {
      setErrorMsg('Please enter a brief audit reason for this correction (at least 5 characters).');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const updated = await editSubmittedResponse({
        original: editing,
        updatedAnswers: editAnswers,
        reason: editReason.trim(),
        user,
        config,
        questionnaire,
      });
      onUpdated(updated);
      setEditing(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save correction.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    if (deleteReason.trim().length < 5) {
      setErrorMsg('Please enter a reason for requesting deletion.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      const approveNow = user.role === 'admin';
      await requestOrApproveSoftDelete({
        response: deleteTarget,
        reason: deleteReason.trim(),
        user,
        approveImmediately: approveNow,
      });
      if (approveNow) {
        onDeleted(deleteTarget.id);
      } else {
        onUpdated({
          ...deleteTarget,
          deleteApprovalStatus: 'pending',
          deleteReason: deleteReason.trim(),
        });
      }
      setDeleteTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to process delete request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
        <div>
          <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
            My Collected Interviews
          </h2>
          <p className="text-sm text-[#5E6A63] dark:text-[#98A69E] mt-0.5">
            Showing only records attributed to {user.displayName}. Corrections require a logged reason.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#5E6A63] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by code or site..."
            className="w-full min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] pl-9 pr-3 text-sm text-[#1C2420] dark:text-[#EEF2EF]"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-10 text-center">
          <p className="text-base font-medium text-[#1C2420] dark:text-[#EEF2EF]">
            No interviews recorded under your account yet.
          </p>
          <p className="text-sm text-[#5E6A63] dark:text-[#98A69E] mt-1">
            Switch to Collect Interview to begin your first de-identified interview.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
          {visible.map((item) => (
            <div key={item.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                    {item.respondentCode}
                  </span>
                  <span aria-hidden="true" className="text-[#98A69E]">·</span>
                  <span className="font-medium text-[#1C2420] dark:text-[#EEF2EF]">{item.siteName}</span>
                  <span aria-hidden="true" className="text-[#98A69E]">·</span>
                  <span className="text-xs text-[#5E6A63] dark:text-[#98A69E] font-mono tabular-nums">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6A63] dark:text-[#98A69E]">
                  <span>Status: {item.completionStatus}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Preparedness: {item.derivedScores.preparedness ?? '—'} / 5
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Strain: {item.derivedScores.strain ?? '—'} / 5
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {Math.round(item.durationSeconds / 60)}m
                  </span>
                  {item.deleteApprovalStatus === 'pending' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#B45309] font-medium">Soft-delete pending admin approval</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-3 py-1.5 text-xs font-medium text-[#1C2420] dark:text-[#EEF2EF] hover:bg-[#EFECE4] dark:hover:bg-[#222925]"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Correct</span>
                </button>
                {(item.editHistory?.length ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistoryItem(item)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-3 py-1.5 text-xs font-medium text-[#4A5550] dark:text-[#B8C2BC]"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History ({item.editHistory?.length})</span>
                  </button>
                )}
                {item.deleteApprovalStatus === 'none' && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(item);
                      setDeleteReason('');
                      setErrorMsg(null);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#FECACA] px-3 py-1.5 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5] hover:bg-[#FEF2F2] dark:hover:bg-[#3B1212]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{user.role === 'admin' ? 'Soft-Delete' : 'Request Delete'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                Correct Response · {editing.respondentCode}
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="p-2">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {questionnaire.questions.map((q) => {
                const v = editAnswers[q.id];
                if (q.type === 'multi_choice') return null;
                return (
                  <div key={q.id} className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-3">
                    <label className="block text-xs font-medium text-[#4A5550] dark:text-[#B8C2BC]">
                      {q.labelEn}
                    </label>
                    {q.options ? (
                      <select
                        value={v === undefined || v === null ? '' : String(v)}
                        onChange={(ev) => setEditAnswers((prev) => ({ ...prev, [q.id]: ev.target.value }))}
                        className="mt-1.5 w-full rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 py-2 text-sm"
                      >
                        <option value="">— Unanswered —</option>
                        {q.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.labelEn}
                          </option>
                        ))}
                      </select>
                    ) : q.type === 'agreement_5' || q.type === 'frequency_5' || q.type === 'number' || q.type === 'slider_10' ? (
                      <input
                        type="number"
                        min={q.type === 'slider_10' ? 0 : q.min ?? 1}
                        max={q.type === 'slider_10' ? 10 : q.max ?? 5}
                        value={v === undefined || v === null ? '' : String(v)}
                        onChange={(ev) =>
                          setEditAnswers((prev) => ({
                            ...prev,
                            [q.id]: ev.target.value === '' ? null : Number(ev.target.value),
                          }))
                        }
                        className="mt-1.5 w-32 rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 py-1.5 text-sm font-mono"
                      />
                    ) : (
                      <textarea
                        rows={2}
                        value={typeof v === 'string' ? v : ''}
                        onChange={(ev) => setEditAnswers((prev) => ({ ...prev, [q.id]: ev.target.value }))}
                        className="mt-1.5 w-full rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 py-1.5 text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF] mb-1">
                Audit Reason for Edit *
              </label>
              <input
                type="text"
                required
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g., Corrected age typo from 24 to 25 during field check"
                className="w-full min-h-[44px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3.5 text-sm"
              />
            </div>

            {errorMsg && <p className="text-xs text-[#B91C1C]">{errorMsg}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-[42px] rounded-xl border border-[#D8D2C5] px-4 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] rounded-xl bg-[#1B4D3E] px-5 text-sm font-semibold text-white"
              >
                {saving ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Version History Modal */}
      {historyItem && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Edit History · {historyItem.respondentCode}</h3>
              <button type="button" onClick={() => setHistoryItem(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {(historyItem.editHistory ?? []).map((h, i) => (
                <div key={i} className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-3 text-xs space-y-1">
                  <p className="font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                    {h.editedByName} · <span className="font-mono">{new Date(h.editedAt).toLocaleString()}</span>
                  </p>
                  <p className="text-[#4A5550] dark:text-[#B8C2BC]">Reason: {h.reason}</p>
                  <p className="font-mono text-[#5E6A63]">Fields: {h.changedFields.join(', ') || 'none'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Soft-Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true">
          <form
            onSubmit={handleConfirmDelete}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 space-y-4"
          >
            <h3 className="font-display text-lg font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
              {user.role === 'admin' ? 'Confirm Soft-Delete' : 'Request Soft-Delete'} · {deleteTarget.respondentCode}
            </h3>
            <p className="text-sm text-[#4A5550] dark:text-[#B8C2BC]">
              {user.role === 'admin'
                ? 'This marks the record soft-deleted and excludes it from analysis while preserving the audit trail.'
                : 'Interviewers cannot permanently delete records. Your request will be reviewed by the Research Lead (Admin).'}
            </p>
            <input
              type="text"
              required
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Reason (e.g., Duplicate entry or mother withdrew consent)"
              className="w-full min-h-[44px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3.5 text-sm"
            />
            {errorMsg && <p className="text-xs text-[#B91C1C]">{errorMsg}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="min-h-[40px] rounded-xl border px-4 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] rounded-xl bg-[#B91C1C] px-4 text-sm font-semibold text-white"
              >
                {saving ? 'Submitting...' : user.role === 'admin' ? 'Soft-Delete' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
