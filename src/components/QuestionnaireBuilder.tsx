import React, { useMemo, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { ArrowDown, ArrowUp, BookOpen, Check, FilePlus2, Lock, Plus, Shield } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { generateCodebook } from '../lib/scoring.ts';
import { logAudit } from '../lib/studyService.ts';
import type {
  LicensedScaleSlot,
  QuestionDefinition,
  QuestionnaireVersion,
  QuestionType,
  ScoreDomain,
  StudyConfig,
  TeamUser,
} from '../types/study.ts';

interface QuestionnaireBuilderProps {
  user: TeamUser;
  questionnaire: QuestionnaireVersion;
  config: StudyConfig;
  onPublished: (nextVersion: QuestionnaireVersion) => void;
}

export const QuestionnaireBuilder: React.FC<QuestionnaireBuilderProps> = ({
  user,
  questionnaire,
  config,
  onPublished,
}) => {
  const [draft, setDraft] = useState<QuestionnaireVersion>(questionnaire);
  const [tab, setTab] = useState<'builder' | 'scales' | 'codebook'>('builder');
  const [newLabelEn, setNewLabelEn] = useState('');
  const [newLabelRw, setNewLabelRw] = useState('');
  const [newSectionId, setNewSectionId] = useState(questionnaire.sections[0]?.id || 'sec_background');
  const [newType, setNewType] = useState<QuestionType>('agreement_5');
  const [newDomain, setNewDomain] = useState<ScoreDomain>('none');
  const [newRequired, setNewRequired] = useState(true);
  const [newReverse, setNewReverse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isAdmin = user.role === 'admin';
  const codebook = useMemo(() => generateCodebook(draft, config), [draft, config]);

  const sortedQuestions = useMemo(
    () => draft.questions.slice().sort((a, b) => a.order - b.order),
    [draft.questions]
  );

  const moveQuestion = (index: number, delta: -1 | 1) => {
    if (!isAdmin) return;
    const list = sortedQuestions.slice();
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;
    const reordered = list.map((q, idx) => ({ ...q, order: idx + 1 }));
    setDraft((prev) => ({ ...prev, questions: reordered }));
  };

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !newLabelEn.trim()) return;
    const id = `q_${Date.now().toString(36)}`;
    const nextQ: QuestionDefinition = {
      id,
      sectionId: newSectionId,
      order: draft.questions.length + 1,
      type: newType,
      labelEn: newLabelEn.trim(),
      labelRw: newLabelRw.trim() || `${newLabelEn.trim()} [Needs professional translation and back-translation]`,
      required: newRequired,
      reverseScored: newReverse,
      scoreDomain: newDomain,
      ...(newType === 'single_choice' || newType === 'multi_choice'
        ? {
            options: [
              { value: 'option_1', labelEn: 'Option 1', labelRw: 'Amahitamo 1' },
              { value: 'option_2', labelEn: 'Option 2', labelRw: 'Amahitamo 2' },
            ],
          }
        : {}),
    };
    setDraft((prev) => ({ ...prev, questions: [...prev.questions, nextQ] }));
    setNewLabelEn('');
    setNewLabelRw('');
  };

  const handleImportScale = (slot: LicensedScaleSlot) => {
    if (!isAdmin) return;
    const updatedSlots = draft.licensedScaleSlots.map((s) =>
      s.id === slot.id
        ? {
            ...s,
            status: 'active' as const,
            validatedKinyarwandaReady: true,
            licenseReference: window.prompt('Enter license approval reference / IRB ID:', s.licenseReference) || s.licenseReference,
          }
        : s
    );
    setDraft((prev) => ({ ...prev, licensedScaleSlots: updatedSlots }));
    setStatusMessage(`Marked "${slot.name}" as licensed & ready for custom item entry in Questionnaire v${draft.version + 1}.`);
  };

  const handlePublishNewVersion = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setStatusMessage(null);
    const nextVerNum = questionnaire.version + 1;
    const now = new Date().toISOString();
    const nextVersion: QuestionnaireVersion = {
      ...draft,
      id: `qv_${nextVerNum}`,
      version: nextVerNum,
      status: 'published',
      createdByUid: user.uid,
      createdByName: user.displayName,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await setDoc(doc(db, 'questionnaireVersions', nextVersion.id), nextVersion);
      await setDoc(doc(db, 'questionnaireVersions', questionnaire.id), {
        ...questionnaire,
        status: 'archived',
        updatedAt: now,
      });
      await logAudit({
        actorUid: user.uid,
        actorName: user.displayName,
        actorRole: user.role,
        action: 'UPDATE_QUESTIONNAIRE',
        targetType: 'questionnaireVersion',
        targetId: nextVersion.id,
        details: `Published Questionnaire v${nextVerNum} (${nextVersion.questions.length} items)`,
      });
      setDraft(nextVersion);
      onPublished(nextVersion);
      setStatusMessage(`Published Questionnaire v${nextVerNum}. Existing responses retain their original v${questionnaire.version} reference.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `questionnaireVersions/${nextVersion.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-[#1B4D3E] dark:text-[#6EE7B7]">
            Active Version v{questionnaire.version} · {draft.questions.length} Questions · {draft.sections.length} Sections
          </p>
          <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-0.5">
            Questionnaire Builder, Licensed Scales & Codebook
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#EFECE4] dark:bg-[#111412] p-1">
            {(
              [
                ['builder', 'Questions'],
                ['scales', 'Licensed Scale Slots'],
                ['codebook', 'Scoring & Codebook'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  tab === k ? 'bg-white dark:bg-[#222925] text-[#1C2420] dark:text-white shadow-xs' : 'text-[#5E6A63]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {isAdmin && tab === 'builder' && (
            <button
              type="button"
              disabled={saving}
              onClick={handlePublishNewVersion}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#143A2E]"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>{saving ? 'Publishing...' : `Publish as v${questionnaire.version + 1}`}</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/10 px-4 py-3 text-sm text-[#1B4D3E] dark:text-[#6EE7B7] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {tab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Question List */}
          <div className="lg:col-span-2 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
            {sortedQuestions.map((q, idx) => (
              <div key={q.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6A63]">
                    <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                      {String(idx + 1).padStart(2, '0')}. {q.id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{q.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>Domain: {q.scoreDomain}</span>
                    {q.reverseScored && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#B45309] font-medium">Reverse-scored</span>
                      </>
                    )}
                    {q.conditionalRule && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>If {q.conditionalRule.dependsOnQuestionId} {q.conditionalRule.operator} {String(q.conditionalRule.value)}</span>
                      </>
                    )}
                    {q.isSafetyQuestion && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#B91C1C] font-semibold">Safety Trigger</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF]">{q.labelEn}</p>
                  <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">{q.labelRw}</p>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, -1)}
                      aria-label="Move up"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2DDD2] dark:border-[#28302B]"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, 1)}
                      aria-label="Move down"
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[#E2DDD2] dark:border-[#28302B]"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Question Form */}
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 h-fit space-y-4">
            <h3 className="font-display text-lg font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
              Add Study Question
            </h3>
            {!isAdmin ? (
              <p className="text-xs text-[#5E6A63] flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span>Only the Research Lead (Admin) can modify and publish questionnaire versions.</span>
              </p>
            ) : (
              <form onSubmit={handleAddQuestion} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Section</label>
                  <select
                    value={newSectionId}
                    onChange={(e) => setNewSectionId(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-xs"
                  >
                    {draft.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.titleEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Question Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as QuestionType)}
                    className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-xs"
                  >
                    <option value="agreement_5">1–5 Agreement Scale</option>
                    <option value="frequency_5">1–5 Frequency Scale</option>
                    <option value="single_choice">Single Choice</option>
                    <option value="multi_choice">Multi Choice</option>
                    <option value="number">Number</option>
                    <option value="slider_10">0–10 Slider</option>
                    <option value="short_text">Short Text</option>
                    <option value="long_text">Long Text</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Scoring Domain</label>
                  <select
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value as ScoreDomain)}
                    className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-xs"
                  >
                    <option value="none">Descriptive only</option>
                    <option value="preparedness">Preparedness</option>
                    <option value="strain">Strain</option>
                    <option value="support">Support</option>
                    <option value="partner">Partner Quality</option>
                    <option value="hardship">Daily Hardship</option>
                    <option value="matrescence">Matrescence</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">English Prompt *</label>
                  <textarea
                    rows={2}
                    required
                    value={newLabelEn}
                    onChange={(e) => setNewLabelEn(e.target.value)}
                    className="w-full rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] p-2.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Kinyarwanda Draft Prompt</label>
                  <textarea
                    rows={2}
                    value={newLabelRw}
                    onChange={(e) => setNewLabelRw(e.target.value)}
                    placeholder="Leave blank to auto-flag for back-translation"
                    className="w-full rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] p-2.5 text-xs"
                  />
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newRequired}
                      onChange={(e) => setNewRequired(e.target.checked)}
                    />
                    <span>Required</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newReverse}
                      onChange={(e) => setNewReverse(e.target.checked)}
                    />
                    <span>Reverse-scored</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1B4D3E] text-xs font-semibold text-white"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Draft v{questionnaire.version + 1}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'scales' && (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-[#1B4D3E] dark:text-[#6EE7B7] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-lg font-semibold">
                Validated & Licensed Scale Import Slots
              </h3>
              <p className="text-sm text-[#5E6A63] dark:text-[#98A69E] mt-1">
                Copyrighted clinical scales (EPDS, Parenting Stress Index, MSPSS) are intentionally NOT hard-coded in this platform. Once your team obtains formal permission and a validated Kinyarwanda translation, activate the corresponding slot below and add the licensed items to the next questionnaire version.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {draft.licensedScaleSlots.map((slot) => (
              <div
                key={slot.id}
                className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <p className="font-mono text-xs text-[#5E6A63]">
                    {slot.status === 'active' ? 'Licensed & Active' : 'Awaiting License & Validation'}
                  </p>
                  <h4 className="font-semibold text-base text-[#1C2420] dark:text-[#EEF2EF]">
                    {slot.name}
                  </h4>
                  <p className="text-xs text-[#4A5550] dark:text-[#B8C2BC]">Domain: {slot.domain}</p>
                  <p className="text-xs text-[#5E6A63]">{slot.notes}</p>
                  <p className="font-mono text-[11px] text-[#5E6A63]">Ref: {slot.licenseReference}</p>
                </div>

                {isAdmin && slot.status !== 'active' && (
                  <button
                    type="button"
                    onClick={() => handleImportScale(slot)}
                    className="min-h-[40px] rounded-xl border border-[#1B4D3E] px-3 text-xs font-medium text-[#1B4D3E] dark:text-[#6EE7B7] hover:bg-[#1B4D3E]/5"
                  >
                    Import Validated Scale License
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'codebook' && (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-[#1B4D3E] dark:text-[#6EE7B7] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-lg font-semibold">
                Transparent Scoring Documentation & Codebook
              </h3>
              <p className="text-sm text-[#5E6A63] dark:text-[#98A69E]">
                Preparedness cutoff: &lt; {config.preparednessCutoff} · Strain cutoff: ≥ {config.strainCutoff} · Lock state: {config.cutoffsLocked ? 'Locked' : 'Unlocked'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E2DDD2] dark:border-[#28302B] text-left text-[#5E6A63]">
                  <th className="py-2 pr-3">Variable</th>
                  <th className="py-2 px-3">Section</th>
                  <th className="py-2 px-3">Label (EN)</th>
                  <th className="py-2 px-3">Valid Values</th>
                  <th className="py-2 pl-3">Scoring Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {codebook.map((row) => (
                  <tr key={row.variableName}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7] whitespace-nowrap">
                      {row.variableName}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{row.section}</td>
                    <td className="py-2.5 px-3 max-w-xs">{row.labelEn}</td>
                    <td className="py-2.5 px-3 max-w-xs text-[#5E6A63]">{row.validValues}</td>
                    <td className="py-2.5 pl-3 max-w-xs text-[#4A5550] dark:text-[#B8C2BC]">{row.scoringRule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
