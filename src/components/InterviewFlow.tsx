import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CloudOff,
  FileText,
  HeartHandshake,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TRANSLATIONS } from '../data/i18n.ts';
import { computeDerivedScores, evaluateCondition, isSafetyTriggered } from '../lib/scoring.ts';
import {
  deleteOfflineDraft,
  listOfflineDrafts,
  saveOfflineDraft,
} from '../lib/offlineStore.ts';
import {
  generateRespondentCode,
  makeId,
  resolveSyncConflict,
  submitInterviewResponse,
} from '../lib/studyService.ts';
import { SafetyProtocolModal } from './SafetyProtocolModal.tsx';
import type {
  AnswerValue,
  InterviewResponse,
  Language,
  OfflineDraft,
  QuestionDefinition,
  QuestionnaireVersion,
  Site,
  StudyConfig,
  SyncQueueItem,
  TeamUser,
} from '../types/study.ts';

interface InterviewFlowProps {
  user: TeamUser;
  sites: Site[];
  questionnaire: QuestionnaireVersion;
  config: StudyConfig;
  isOnline: boolean;
  syncQueue: SyncQueueItem[];
  onRefreshQueue: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onSubmitted: (response: InterviewResponse, synced: boolean) => void;
}

export const InterviewFlow: React.FC<InterviewFlowProps> = ({
  user,
  sites,
  questionnaire,
  config,
  isOnline,
  syncQueue,
  onRefreshQueue,
  onSyncNow,
  onSubmitted,
}) => {
  const [stage, setStage] = useState<'hub' | 'consent' | 'survey' | 'complete'>('hub');
  const [language, setLanguage] = useState<Language>('en');
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string>('');
  const [respondentCode, setRespondentCode] = useState<string>('');
  const [respondentAge, setRespondentAge] = useState<string>('');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [guardianConsentConfirmed, setGuardianConsentConfirmed] = useState(false);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [startedAt, setStartedAt] = useState<string>('');
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ code: string; synced: boolean; flagged: boolean } | null>(null);

  const t = TRANSLATIONS[language];
  const activeSites = useMemo(() => sites.filter((s) => s.active), [sites]);
  const [siteId, setSiteId] = useState<string>(
    activeSites.find((s) => s.id === user.assignedSiteId)?.id || activeSites[0]?.id || ''
  );
  useEffect(() => {
    if (!activeSites.some((s) => s.id === siteId)) {
      setSiteId(activeSites.find((s) => s.id === user.assignedSiteId)?.id || activeSites[0]?.id || '');
    }
  }, [activeSites, siteId, user.assignedSiteId]);
  const selectedSite = useMemo(
    () => activeSites.find((s) => s.id === siteId) ?? activeSites[0],
    [activeSites, siteId]
  );

  const sortedSections = useMemo(
    () => questionnaire.sections.slice().sort((a, b) => a.order - b.order),
    [questionnaire.sections]
  );

  const loadDrafts = async () => {
    const list = await listOfflineDrafts(user.uid);
    setDrafts(list);
  };

  useEffect(() => {
    void loadDrafts();
  }, [user.uid]);

  // Autosave draft whenever answers or step change during survey
  useEffect(() => {
    if (stage !== 'survey' || !activeDraftId) return;
    const timer = setTimeout(() => {
      const draft: OfflineDraft = {
        id: activeDraftId,
        respondentCode,
        siteId: selectedSite?.id ?? siteId,
        siteName: selectedSite?.name ?? '',
        interviewerUid: user.uid,
        interviewerName: user.displayName,
        questionnaireVersionId: questionnaire.id,
        questionnaireVersion: questionnaire.version,
        language,
        consentConfirmed,
        respondentAge: respondentAge ? Number(respondentAge) : undefined,
        guardianConsentConfirmed,
        answers,
        startedAt,
        updatedAt: new Date().toISOString(),
        currentStep,
      };
      void saveOfflineDraft(draft).then(() => loadDrafts());
    }, 350);
    return () => clearTimeout(timer);
  }, [
    stage,
    activeDraftId,
    respondentCode,
    siteId,
    selectedSite,
    user.uid,
    user.displayName,
    questionnaire.id,
    questionnaire.version,
    language,
    consentConfirmed,
    respondentAge,
    guardianConsentConfirmed,
    answers,
    startedAt,
    currentStep,
  ]);

  const startNewConsent = () => {
    setActiveDraftId(makeId('resp'));
    setRespondentCode(generateRespondentCode());
    setSiteId(user.assignedSiteId || activeSites[0]?.id || '');
    setRespondentAge('');
    setConsentConfirmed(false);
    setPrivacyConfirmed(false);
    setGuardianConsentConfirmed(false);
    setAnswers({});
    setCurrentStep(0);
    setSafetyAcknowledged(false);
    setValidationError(null);
    setStage('consent');
  };

  const resumeDraft = (d: OfflineDraft) => {
    setActiveDraftId(d.id);
    setRespondentCode(d.respondentCode);
    setSiteId(d.siteId);
    setLanguage(d.language);
    setConsentConfirmed(d.consentConfirmed);
    setPrivacyConfirmed(true);
    setRespondentAge(d.respondentAge ? String(d.respondentAge) : '');
    setGuardianConsentConfirmed(!!d.guardianConsentConfirmed);
    setAnswers(d.answers);
    setStartedAt(d.startedAt);
    setCurrentStep(d.currentStep);
    setSafetyAcknowledged(false);
    setValidationError(null);
    setStage('survey');
  };

  const parsedAge = Number(respondentAge);
  const isMinor = Number.isFinite(parsedAge) && parsedAge > 0 && parsedAge < 18;

  const handleConfirmConsent = () => {
    if (!selectedSite) {
      setValidationError('Please select a health centre site.');
      return;
    }
    if (!Number.isFinite(parsedAge) || parsedAge < 12 || parsedAge > 65) {
      setValidationError('Please enter a valid age between 12 and 65.');
      return;
    }
    if (!consentConfirmed || !privacyConfirmed) {
      setValidationError('Both verbal consent and zero-PII privacy confirmation are required.');
      return;
    }
    if (isMinor && !guardianConsentConfirmed) {
      setValidationError('Participant is under 18. Guardian/caregiver consent must be confirmed.');
      return;
    }
    setValidationError(null);
    setAnswers((prev) => ({ ...prev, bg_age: parsedAge }));
    setStartedAt(new Date().toISOString());
    setStage('survey');
  };

  const currentSection = sortedSections[currentStep];

  const visibleQuestionsForSection = useMemo(() => {
    if (!currentSection) return [];
    return questionnaire.questions
      .filter((q) => q.sectionId === currentSection.id)
      .sort((a, b) => a.order - b.order)
      .filter((q) => evaluateCondition(q.conditionalRule, answers));
  }, [currentSection, questionnaire.questions, answers]);

  const setAnswer = (q: QuestionDefinition, value: AnswerValue) => {
    setValidationError(null);
    setAnswers((prev) => {
      const next = { ...prev, [q.id]: value };
      if (q.isSafetyQuestion && (value === 'yes' || value === 'Yes')) {
        setShowSafetyModal(true);
      }
      return next;
    });
  };

  const validateCurrentSection = (): boolean => {
    for (const q of visibleQuestionsForSection) {
      if (!q.required) continue;
      const val = answers[q.id];
      if (
        val === undefined ||
        val === null ||
        val === '' ||
        (Array.isArray(val) && val.length === 0)
      ) {
        setValidationError(
          language === 'rw'
            ? `Nyamuneka subiza ikibazo: ${q.labelRw}`
            : `Please complete required question: "${q.labelEn}"`
        );
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateCurrentSection()) return;
    if (currentStep < sortedSections.length - 1) {
      setCurrentStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (completionStatus: 'complete' | 'partial') => {
    if (completionStatus === 'complete' && !validateCurrentSection()) return;
    if (!selectedSite) return;

    const flagged = isSafetyTriggered(answers);
    if (flagged && !safetyAcknowledged) {
      setShowSafetyModal(true);
      return;
    }

    setSubmitting(true);
    setValidationError(null);
    const now = new Date().toISOString();
    const startMs = startedAt ? new Date(startedAt).getTime() : Date.now();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startMs) / 1000));

    const derivedScores = computeDerivedScores(answers, config, questionnaire);
    const ageNum = Number(answers.bg_age ?? parsedAge);

    const payload: InterviewResponse = {
      id: activeDraftId,
      respondentCode,
      siteId: selectedSite.id,
      siteName: selectedSite.name,
      interviewerUid: user.uid,
      interviewerName: user.displayName,
      questionnaireVersionId: questionnaire.id,
      questionnaireVersion: questionnaire.version,
      language,
      consentConfirmed: true,
      ...(Number.isFinite(ageNum) && ageNum >= 12 ? { respondentAge: ageNum } : {}),
      guardianConsentConfirmed: isMinor ? guardianConsentConfirmed : false,
      answers,
      derivedScores,
      safetyFlagged: flagged,
      durationSeconds,
      completionStatus,
      softDeleted: false,
      deleteApprovalStatus: 'none',
      createdAt: now,
      updatedAt: now,
    };

    try {
      const res = await submitInterviewResponse({
        response: payload,
        user,
        isOnline,
        config,
      });
      await deleteOfflineDraft(activeDraftId);
      await loadDrafts();
      await onRefreshQueue();
      setLastResult({ code: payload.respondentCode, synced: res.synced, flagged });
      setStage('complete');
      onSubmitted(payload, res.synced);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to save interview.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestionInput = (q: QuestionDefinition) => {
    const val = answers[q.id];

    if (q.type === 'single_choice' && q.options) {
      return (
        <div className="mt-3 space-y-2.5" role="radiogroup" aria-label={q.labelEn}>
          {q.options.map((opt) => {
            const selected = val === opt.value;
            const isDangerOption = q.isSafetyQuestion && opt.value === 'yes';
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setAnswer(q, opt.value)}
                className={`w-full min-h-[52px] text-left rounded-xl px-4 py-3 border transition-colors flex items-center justify-between gap-3 ${
                  selected
                    ? isDangerOption
                      ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                      : 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                    : 'bg-white dark:bg-[#111412] text-[#1C2420] dark:text-[#EEF2EF] border-[#D8D2C5] dark:border-[#2E3832] hover:bg-[#EFECE4] dark:hover:bg-[#222925]'
                }`}
              >
                <span className="text-base font-medium leading-snug">
                  {language === 'rw' ? opt.labelRw : opt.labelEn}
                </span>
                <span
                  className={`h-5 w-5 rounded-full border shrink-0 flex items-center justify-center ${
                    selected ? 'border-white bg-white/20' : 'border-[#98A69E]'
                  }`}
                >
                  {selected && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'multi_choice' && q.options) {
      const selectedArr = Array.isArray(val) ? val : [];
      const toggleOption = (optVal: string) => {
        if (optVal === 'no_one') {
          setAnswer(q, selectedArr.includes('no_one') ? [] : ['no_one']);
          return;
        }
        const withoutNone = selectedArr.filter((v) => v !== 'no_one');
        if (withoutNone.includes(optVal)) {
          setAnswer(q, withoutNone.filter((v) => v !== optVal));
        } else {
          setAnswer(q, [...withoutNone, optVal]);
        }
      };

      return (
        <div className="mt-3 space-y-2.5">
          {q.options.map((opt) => {
            const checked = selectedArr.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggleOption(opt.value)}
                className={`w-full min-h-[52px] text-left rounded-xl px-4 py-3 border transition-colors flex items-center justify-between gap-3 ${
                  checked
                    ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                    : 'bg-white dark:bg-[#111412] text-[#1C2420] dark:text-[#EEF2EF] border-[#D8D2C5] dark:border-[#2E3832] hover:bg-[#EFECE4] dark:hover:bg-[#222925]'
                }`}
              >
                <span className="text-base font-medium leading-snug">
                  {language === 'rw' ? opt.labelRw : opt.labelEn}
                </span>
                <span
                  className={`h-5 w-5 rounded-md border shrink-0 flex items-center justify-center ${
                    checked ? 'border-white bg-white/20' : 'border-[#98A69E]'
                  }`}
                >
                  {checked && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      );
    }

    if (q.type === 'agreement_5' || q.type === 'frequency_5') {
      const labels =
        q.type === 'agreement_5' ? t.interview.agreementLabels : t.interview.frequencyLabels;
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((num, idx) => {
              const selected = Number(val) === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setAnswer(q, num)}
                  className={`min-h-[54px] rounded-xl border flex flex-col items-center justify-center p-2 transition-colors ${
                    selected
                      ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                      : 'bg-white dark:bg-[#111412] text-[#1C2420] dark:text-[#EEF2EF] border-[#D8D2C5] dark:border-[#2E3832] hover:bg-[#EFECE4] dark:hover:bg-[#222925]'
                  }`}
                >
                  <span className="font-mono text-lg font-semibold tabular-nums">{num}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-[#5E6A63] dark:text-[#98A69E] px-1">
            <span>1 = {labels[0]}</span>
            <span>3 = {labels[2]}</span>
            <span>5 = {labels[4]}</span>
          </div>
        </div>
      );
    }

    if (q.type === 'slider_10') {
      const numVal = typeof val === 'number' ? val : 5;
      return (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#5E6A63] dark:text-[#98A69E]">0 · Not prepared</span>
            <span className="font-mono text-2xl font-semibold text-[#1B4D3E] dark:text-[#6EE7B7] tabular-nums">
              {typeof val === 'number' ? val : '—'} / 10
            </span>
            <span className="text-xs text-[#5E6A63] dark:text-[#98A69E]">10 · Fully prepared</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={numVal}
            onChange={(e) => setAnswer(q, Number(e.target.value))}
            className="w-full h-3 accent-[#1B4D3E] cursor-pointer"
          />
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnswer(q, n)}
                className={`min-h-[40px] rounded-lg text-xs font-mono border transition-colors ${
                  val === n
                    ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                    : 'bg-white dark:bg-[#111412] text-[#4A5550] dark:text-[#B8C2BC] border-[#E2DDD2] dark:border-[#28302B]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (q.type === 'number') {
      return (
        <input
          type="number"
          inputMode="numeric"
          min={q.min}
          max={q.max}
          value={val === undefined || val === null ? '' : String(val)}
          onChange={(e) =>
            setAnswer(q, e.target.value === '' ? null : Number(e.target.value))
          }
          className="mt-3 w-full min-h-[52px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-4 py-3 text-lg font-mono text-[#1C2420] dark:text-[#EEF2EF] focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
          placeholder={`${q.min ?? 0} – ${q.max ?? 99}`}
        />
      );
    }

    if (q.type === 'long_text') {
      return (
        <textarea
          rows={4}
          value={typeof val === 'string' ? val : ''}
          onChange={(e) => setAnswer(q, e.target.value)}
          placeholder={
            language === 'rw'
              ? 'Andika ibisubizo mu magambo y’umubyeyi (nta mazina cyangwa telefoni)...'
              : 'Record her words faithfully without any names, phone numbers, or village names...'
          }
          className="mt-3 w-full rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-4 py-3 text-base text-[#1C2420] dark:text-[#EEF2EF] focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
        />
      );
    }

    return (
      <input
        type="text"
        value={typeof val === 'string' ? val : ''}
        onChange={(e) => setAnswer(q, e.target.value)}
        className="mt-3 w-full min-h-[52px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-4 py-3 text-base text-[#1C2420] dark:text-[#EEF2EF] focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]"
      />
    );
  };

  return (
    <div className="mx-auto max-w-3xl pb-28 sm:pb-12">
      {/* Top Field Toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-4">
        <div className="flex items-center gap-3 text-sm">
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 text-[#15803D] dark:text-[#6EE7B7] font-medium">
              <Wifi className="w-4 h-4" aria-hidden="true" />
              <span>Online</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[#B45309] dark:text-[#FBBF24] font-medium">
              <WifiOff className="w-4 h-4" aria-hidden="true" />
              <span>Offline (AES-GCM Encrypted Local Storage)</span>
            </span>
          )}
          <span aria-hidden="true" className="text-[#98A69E]">·</span>
          <span className="font-mono text-xs text-[#4A5550] dark:text-[#B8C2BC] tabular-nums">
            Queue: {syncQueue.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#EFECE4] dark:bg-[#111412] p-1">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                language === 'en'
                  ? 'bg-white dark:bg-[#222925] text-[#1C2420] dark:text-white shadow-xs'
                  : 'text-[#5E6A63] dark:text-[#98A69E]'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('rw')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors min-h-[36px] ${
                language === 'rw'
                  ? 'bg-white dark:bg-[#222925] text-[#1C2420] dark:text-white shadow-xs'
                  : 'text-[#5E6A63] dark:text-[#98A69E]'
              }`}
            >
              Kinyarwanda
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#B91C1C]/30 bg-[#FEF2F2] dark:bg-[#3B1212] px-3 py-2 text-xs font-semibold text-[#991B1B] dark:text-[#FCA5A5] hover:bg-[#FEE2E2] min-h-[40px]"
          >
            <HeartHandshake className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.interview.whereToGetHelp}</span>
          </button>
        </div>
      </div>

      {language === 'rw' && t.rwTranslationNotice && (
        <div className="mb-5 rounded-xl border border-[#D4A145]/50 bg-[#FEFCE8] dark:bg-[#292211] px-4 py-3 text-xs text-[#713F12] dark:text-[#FDE68A]">
          {t.rwTranslationNotice}
        </div>
      )}

      {/* Stage 1: Field Hub */}
      {stage === 'hub' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 sm:p-8">
            <p className="font-mono text-xs text-[#5E6A63] dark:text-[#98A69E]">
              Questionnaire v{questionnaire.version} · {questionnaire.questions.length} items · Offline Ready
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-2">
              {language === 'rw' ? questionnaire.titleRw : questionnaire.titleEn}
            </h2>
            <p className="mt-2 text-sm text-[#4A5550] dark:text-[#B8C2BC] leading-relaxed">
              {t.consent.dataHandlingReminder}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startNewConsent}
                className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#143A2E] transition-colors"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                <span>{t.interview.newInterview}</span>
              </button>

              {syncQueue.length > 0 && isOnline && (
                <button
                  type="button"
                  onClick={onSyncNow}
                  className="w-full sm:w-auto min-h-[52px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#1B4D3E] px-5 py-3 text-sm font-semibold text-[#1B4D3E] dark:text-[#6EE7B7] hover:bg-[#1B4D3E]/5"
                >
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  <span>Sync {syncQueue.length} Offline Record(s)</span>
                </button>
              )}
            </div>
          </div>

          {/* Pending Sync / Conflict Resolution */}
          {syncQueue.length > 0 && (
            <div className="rounded-2xl border border-[#D4A145]/60 bg-white dark:bg-[#181D1A] p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF] flex items-center gap-2">
                  <CloudOff className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
                  <span>Encrypted Offline Sync Queue ({syncQueue.length})</span>
                </h3>
              </div>
              <div className="mt-3 divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {syncQueue.map((item) => (
                  <div key={item.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                        {item.payload.respondentCode} · {item.payload.siteName}
                      </p>
                      <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">
                        Queued {new Date(item.queuedAt).toLocaleString()} · Attempts: {item.attempts}
                        {item.lastError ? ` · ${item.lastError}` : ''}
                      </p>
                    </div>
                    {item.conflictServerData && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await resolveSyncConflict(item, 'keep_local', user);
                            await onRefreshQueue();
                          }}
                          className="min-h-[40px] rounded-lg bg-[#1B4D3E] px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Keep Local Revision
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await resolveSyncConflict(item, 'keep_server', user);
                            await onRefreshQueue();
                          }}
                          className="min-h-[40px] rounded-lg border border-[#D8D2C5] px-3 py-1.5 text-xs font-medium"
                        >
                          Keep Server Copy
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incomplete Drafts */}
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
            <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF] flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1B4D3E] dark:text-[#6EE7B7]" aria-hidden="true" />
              <span>{t.interview.resumeDrafts} ({drafts.length})</span>
            </h3>
            {drafts.length === 0 ? (
              <p className="mt-3 text-sm text-[#5E6A63] dark:text-[#98A69E]">
                No paused interviews saved on this device. Drafts autosave encrypted locally as you go.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {drafts.map((d) => (
                  <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                        {d.respondentCode} · {d.siteName}
                      </p>
                      <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">
                        Section {d.currentStep + 1} of {sortedSections.length} · Updated{' '}
                        {new Date(d.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resumeDraft(d)}
                      className="min-h-[44px] rounded-xl bg-[#EFECE4] dark:bg-[#222925] px-4 py-2 text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF] hover:bg-[#E2DDD2]"
                    >
                      Resume
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage 2: Informed Consent & Privacy Gate */}
      {stage === 'consent' && (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-[#1B4D3E] dark:text-[#6EE7B7] font-semibold">
                Assigned Code: {respondentCode}
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-1">
                {t.consent.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setStage('hub')}
              className="min-h-[44px] rounded-xl border border-[#E2DDD2] dark:border-[#28302B] px-3.5 text-sm text-[#4A5550] dark:text-[#B8C2BC]"
            >
              Cancel
            </button>
          </div>

          <p className="text-sm text-[#4A5550] dark:text-[#B8C2BC] leading-relaxed">{t.consent.intro}</p>

          <ul className="space-y-2.5 rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B] text-sm text-[#1C2420] dark:text-[#EEF2EF]">
            <li className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#1B4D3E] dark:text-[#6EE7B7] mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t.consent.privacyBullet1}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-[#1B4D3E] dark:text-[#6EE7B7] mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t.consent.privacyBullet2}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <HeartHandshake className="w-4 h-4 text-[#B91C1C] mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t.consent.privacyBullet3}</span>
            </li>
          </ul>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF] mb-1.5">
                {t.consent.siteLabel}
              </label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3.5 text-base text-[#1C2420] dark:text-[#EEF2EF]"
              >
                {activeSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.district})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF] mb-1.5">
                {t.consent.ageLabel}
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={12}
                max={65}
                value={respondentAge}
                onChange={(e) => setRespondentAge(e.target.value)}
                placeholder="e.g. 23"
                className="w-full min-h-[48px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3.5 text-base font-mono text-[#1C2420] dark:text-[#EEF2EF]"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4 cursor-pointer min-h-[56px]">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="mt-1 h-5 w-5 accent-[#1B4D3E]"
              />
              <span className="text-sm text-[#1C2420] dark:text-[#EEF2EF]">{t.consent.confirmConsent}</span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4 cursor-pointer min-h-[56px]">
              <input
                type="checkbox"
                checked={privacyConfirmed}
                onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                className="mt-1 h-5 w-5 accent-[#1B4D3E]"
              />
              <span className="text-sm text-[#1C2420] dark:text-[#EEF2EF]">{t.consent.confirmPrivacy}</span>
            </label>

            {isMinor && (
              <div className="rounded-xl border border-[#D4A145] bg-[#FEFCE8] dark:bg-[#292211] p-4 space-y-2">
                <p className="text-xs font-semibold text-[#854D0E] dark:text-[#FDE68A]">
                  {t.consent.guardianRequired}
                </p>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={guardianConsentConfirmed}
                    onChange={(e) => setGuardianConsentConfirmed(e.target.checked)}
                    className="mt-1 h-5 w-5 accent-[#1B4D3E]"
                  />
                  <span className="text-sm text-[#1C2420] dark:text-[#EEF2EF]">
                    {t.consent.confirmGuardian}
                  </span>
                </label>
              </div>
            )}
          </div>

          {validationError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 text-sm text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirmConsent}
            className="w-full min-h-[52px] rounded-xl bg-[#1B4D3E] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#143A2E] transition-colors"
          >
            {t.consent.startInterview}
          </button>
        </div>
      )}

      {/* Stage 3: Survey Sections */}
      {stage === 'survey' && currentSection && (
        <div className="space-y-5">
          {/* Progress Header */}
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
            <div className="flex items-center justify-between gap-2 text-xs text-[#5E6A63] dark:text-[#98A69E]">
              <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                {respondentCode} · {selectedSite?.name}
              </span>
              <span className="font-mono tabular-nums">
                {t.interview.stepOf} {currentStep + 1} / {sortedSections.length}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full rounded-full bg-[#EFECE4] dark:bg-[#111412] overflow-hidden">
              <div
                className="h-full bg-[#1B4D3E] transition-all duration-200"
                style={{ width: `${Math.round(((currentStep + 1) / sortedSections.length) * 100)}%` }}
              />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-4">
              {language === 'rw' ? currentSection.titleRw : currentSection.titleEn}
            </h2>
            <p className="mt-1 text-sm text-[#5E6A63] dark:text-[#98A69E]">
              {language === 'rw' ? currentSection.descriptionRw : currentSection.descriptionEn}
            </p>
          </div>

          {/* Questions */}
          <div className="space-y-4">
            {visibleQuestionsForSection.map((q) => (
              <div
                key={q.id}
                className={`rounded-2xl border p-5 sm:p-6 ${
                  q.isSafetyQuestion
                    ? 'border-[#FCA5A5] bg-[#FEF2F2]/60 dark:bg-[#2A1414] dark:border-[#7F1D1D]'
                    : 'border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-base sm:text-lg font-medium text-[#1C2420] dark:text-[#EEF2EF] leading-snug">
                    {language === 'rw' ? q.labelRw : q.labelEn}
                    {q.required && <span className="text-[#B91C1C] ml-1" aria-label="required">*</span>}
                  </p>
                </div>
                {(q.helpEn || q.helpRw) && (
                  <p className="mt-1 text-xs text-[#5E6A63] dark:text-[#98A69E]">
                    {language === 'rw' ? q.helpRw || q.helpEn : q.helpEn}
                  </p>
                )}
                {renderQuestionInput(q)}
              </div>
            ))}
          </div>

          {validationError && (
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3.5 text-sm text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Thumb-Zone Navigation Bar (<= 15% mobile sticky cap) */}
          <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#E2DDD2] dark:border-[#28302B] bg-white/95 dark:bg-[#181D1A]/95 backdrop-blur-md px-4 py-3 pb-safe sm:static sm:rounded-2xl sm:border sm:p-4">
            <div className="mx-auto max-w-3xl flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 0) setStage('hub');
                  else setCurrentStep((s) => s - 1);
                }}
                className="min-h-[48px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-4 py-2.5 text-sm font-medium text-[#1C2420] dark:text-[#EEF2EF]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t.interview.previous}</span>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit('partial')}
                className="hidden sm:inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-4 py-2.5 text-xs font-medium text-[#4A5550] dark:text-[#B8C2BC]"
              >
                <Save className="w-4 h-4" />
                <span>Save Partial</span>
              </button>

              {currentStep < sortedSections.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="flex-1 sm:flex-none min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-6 py-2.5 text-base font-semibold text-white hover:bg-[#143A2E]"
                >
                  <span>{t.interview.next}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit('complete')}
                  className="flex-1 sm:flex-none min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4D3E] px-6 py-2.5 text-base font-semibold text-white hover:bg-[#143A2E] disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'Saving...' : t.interview.submit}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stage 4: Completion */}
      {stage === 'complete' && lastResult && (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1B4D3E]/10 text-[#1B4D3E] dark:text-[#6EE7B7]">
            <Check className="h-7 w-7" />
          </div>
          <p className="font-mono text-sm font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
            {lastResult.code}
          </p>
          <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
            {lastResult.synced ? t.interview.synced : t.interview.savedOffline}
          </h2>
          <p className="text-sm text-[#4A5550] dark:text-[#B8C2BC] max-w-md mx-auto">
            {lastResult.synced
              ? 'This de-identified record has been saved to the study database and attributed to your account.'
              : 'Your connection is offline. The interview is AES-GCM encrypted in local storage and will sync automatically without duplicates when internet returns.'}
          </p>

          {lastResult.flagged && (
            <div className="mx-auto max-w-md rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-left text-xs text-[#7F1D1D] flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Same-day safety referral flag recorded. Please ensure the mother has been accompanied to clinic mental health staff before moving to the next interview.
              </span>
            </div>
          )}

          <div className="pt-3 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setStage('hub')}
              className="min-h-[48px] rounded-xl bg-[#1B4D3E] px-6 py-3 text-sm font-semibold text-white hover:bg-[#143A2E]"
            >
              Return to Field Hub
            </button>
          </div>
        </div>
      )}

      {showSafetyModal && (
        <SafetyProtocolModal
          mode="urgent_alert"
          language={language}
          site={selectedSite}
          allSites={sites}
          respondentCode={respondentCode}
          onAcknowledge={() => {
            setSafetyAcknowledged(true);
            setShowSafetyModal(false);
          }}
        />
      )}

      {showHelpModal && (
        <SafetyProtocolModal
          mode="help_reference"
          language={language}
          site={selectedSite}
          allSites={sites}
          onClose={() => setShowHelpModal(false)}
        />
      )}
    </div>
  );
};
