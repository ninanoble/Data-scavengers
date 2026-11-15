import React from 'react';
import { AlertTriangle, CheckCircle2, HeartHandshake, PhoneCall, X } from 'lucide-react';
import { TRANSLATIONS } from '../data/i18n.ts';
import type { Language, Site } from '../types/study.ts';

interface SafetyProtocolModalProps {
  mode: 'urgent_alert' | 'help_reference';
  language: Language;
  site: Site | undefined;
  allSites: Site[];
  respondentCode?: string;
  onAcknowledge?: () => void;
  onClose?: () => void;
}

export const SafetyProtocolModal: React.FC<SafetyProtocolModalProps> = ({
  mode,
  language,
  site,
  allSites,
  respondentCode,
  onAcknowledge,
  onClose,
}) => {
  const t = TRANSLATIONS[language];
  const activeSite = site ?? allSites[0];

  if (mode === 'urgent_alert') {
    return (
      <div
        className="fixed inset-0 z-50 overflow-y-auto bg-[#7F1D1D] text-white p-4 sm:p-8 flex items-center justify-center"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="safety-alert-title"
      >
        <div className="w-full max-w-2xl rounded-2xl bg-[#FEF2F2] text-[#1C2420] p-6 sm:p-8 shadow-2xl border border-[#FCA5A5]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#B91C1C] text-white">
              <HeartHandshake className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-[#991B1B] font-semibold">
                Immediate Clinical Safety Protocol · {respondentCode || 'Active Interview'}
              </p>
              <h2
                id="safety-alert-title"
                className="font-display text-2xl sm:text-3xl font-semibold text-[#7F1D1D] mt-1"
              >
                {t.safety.alertTitle}
              </h2>
              <p className="mt-2 text-base text-[#374151] leading-relaxed">{t.safety.alertLead}</p>
            </div>
          </div>

          <ol className="mt-6 space-y-3 rounded-xl bg-white p-5 border border-[#FECACA] text-sm sm:text-base text-[#1C2420]">
            <li className="flex gap-3">
              <span className="font-mono font-semibold text-[#B91C1C]">01.</span>
              <span>{t.safety.step1}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono font-semibold text-[#B91C1C]">02.</span>
              <span>{t.safety.step2}</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono font-semibold text-[#B91C1C]">03.</span>
              <span>{t.safety.step3}</span>
            </li>
          </ol>

          {activeSite && (
            <div className="mt-5 rounded-xl bg-white p-5 border border-[#E2DDD2]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#4A5550]">
                  {t.safety.referralSiteContact}
                </p>
                <span className="font-mono text-xs text-[#1B4D3E] font-medium">
                  {activeSite.name} ({activeSite.district})
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-[#1C2420]">
                {activeSite.referralContactName}
              </p>
              <div className="mt-1 flex items-center gap-2 text-sm font-mono text-[#B91C1C] font-medium">
                <PhoneCall className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{activeSite.referralContactPhone}</span>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#4A5550]">
                {t.safety.protocolLabel}
              </p>
              <p className="mt-1 text-sm text-[#374151] leading-relaxed">
                {language === 'rw' && activeSite.referralProtocolRw
                  ? activeSite.referralProtocolRw
                  : activeSite.referralProtocolEn}
              </p>
            </div>
          )}

          <p className="mt-4 text-xs text-[#6B7280] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#B91C1C] shrink-0" aria-hidden="true" />
            <span>{t.safety.flaggedNotice}</span>
          </p>

          <div className="mt-6">
            <button
              type="button"
              onClick={onAcknowledge}
              className="w-full min-h-[52px] rounded-xl bg-[#B91C1C] px-5 py-3.5 text-base font-semibold text-white hover:bg-[#991B1B] transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              <span>{t.safety.acknowledgeButton}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs p-4 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[#1B4D3E] dark:text-[#6EE7B7]">
              Rwanda Maternal Support & Clinic Referral Guide
            </p>
            <h2
              id="help-modal-title"
              className="font-display text-xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-1"
            >
              {t.interview.whereToGetHelp}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help guide"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E2DDD2] dark:border-[#28302B] text-[#4A5550] dark:text-[#B8C2BC] hover:bg-[#F6F4EF] dark:hover:bg-[#222925]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B] text-sm text-[#1C2420] dark:text-[#EEF2EF]">
          <p className="font-semibold">National & Emergency Mental Health Contacts (Rwanda)</p>
          <p className="mt-1 text-[#4A5550] dark:text-[#B8C2BC]">
            Rwanda Biomedical Centre (RBC) Health Line: <span className="font-mono font-semibold">114</span> ·
            Isange One Stop Centre (GBV & Psychosocial): <span className="font-mono font-semibold">3029</span> ·
            Emergency: <span className="font-mono font-semibold">112</span>
          </p>
        </div>

        <div className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {allSites
            .filter((s) => s.active)
            .map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4 bg-white dark:bg-[#181D1A]"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-[#1C2420] dark:text-[#EEF2EF]">{s.name}</p>
                  <span className="text-xs text-[#5E6A63] dark:text-[#98A69E]">
                    {s.district} · {s.urbanRural}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-[#1B4D3E] dark:text-[#6EE7B7]">
                  {s.referralContactName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#4A5550] dark:text-[#B8C2BC]">
                  {s.referralContactPhone}
                </p>
                <p className="mt-2 text-xs text-[#4A5550] dark:text-[#B8C2BC] leading-relaxed">
                  {language === 'rw' && s.referralProtocolRw ? s.referralProtocolRw : s.referralProtocolEn}
                </p>
              </div>
            ))}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#143A2E]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
