import React, { useState } from 'react';
import { ArrowDownRight, Building2, Moon, Sun } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import heroClinicImg from '../assets/images/hero_kigali_clinic_1794724783711.jpg';
import fieldTabletImg from '../assets/images/field_research_tablet_1794724783950.jpg';
import type { Site } from '../types/study.ts';

interface LandingPageProps {
  dark: boolean;
  onToggleDark: () => void;
  signingIn: boolean;
  authError: string | null;
  onSignIn: () => void;
  sites: Site[];
}

const WORKFLOW_ITEMS = [
  {
    index: '01.',
    title: 'Bilingual Consent & Guided Capture',
    body: 'Conduct interviews in English or Kinyarwanda with verbal consent verification and automatic guardian-assent gating when a mother is under 18.',
  },
  {
    index: '02.',
    title: 'Offline AES-GCM-256 Encryption',
    body: 'Record complete clinic interviews without internet access. Drafts autosave locally, encrypt at rest, and reconcile idempotently when a connection returns.',
  },
  {
    index: '03.',
    title: 'Same-Day Safety Escalation',
    body: 'If the self-harm screening item is answered Yes, the interface halts the survey immediately, displays the hospital mental health desk, and alerts the research lead.',
  },
  {
    index: '04.',
    title: 'Pre-Registered Analysis & Exports',
    body: 'Lock Preparedness and Strain cutoffs prior to analysis, withhold hypothesis verdicts below n = 30, and export de-identified CSV or XLSX datasets with a full codebook.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  dark,
  onToggleDark,
  signingIn,
  authError,
  onSignIn,
  sites,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [tabletImgFailed, setTabletImgFailed] = useState(false);

  const displaySites = sites.filter((s) => s.active);

  return (
    <div id="top" className="min-h-screen bg-[#FAFAFA] text-zinc-950 dark:bg-[#09090B] dark:text-zinc-50">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA]/95 dark:bg-[#09090B]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[1360px] px-6 sm:px-10 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 whitespace-nowrap shrink-0"
          >
            Data Detectives
          </a>

          <nav
            aria-label="Study overview"
            className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-400"
          >
            <a href="#study" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Study
            </a>
            <a href="#workflow" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Workflow
            </a>
            <a href="#sites" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Hospitals
            </a>
            <a href="#safeguards" className="hover:text-zinc-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Safeguards
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              disabled={signingIn}
              onClick={onSignIn}
              className="min-h-[40px] rounded-lg bg-[#0F4C3A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3A2C] dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {signingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Editorial Hero */}
        <section className="mx-auto max-w-[1360px] px-6 sm:px-10 pt-12 pb-16 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-end">
            <div className="lg:col-span-8 space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Rwanda Matrescence Study</span>
                <span aria-hidden="true">·</span>
                <span>Five Kigali Hospitals</span>
                <span aria-hidden="true">·</span>
                <span>Eight Student Researchers</span>
              </div>

              <h1 className="font-display text-[clamp(2.25rem,4.5vw,4.125rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-zinc-950 dark:text-zinc-50 text-balance max-w-4xl">
                Measuring maternal readiness before birth—and strain after.
              </h1>
            </div>

            <div className="lg:col-span-4 space-y-5">
              <p className="text-[15px] sm:text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
                Data Detectives is the field collection and statistical workspace for interviewing mothers of children under two across Kigali—designed for offline clinics and strict participant anonymity.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={onSignIn}
                  className="min-h-[46px] rounded-lg bg-[#0F4C3A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B3A2C] dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {signingIn ? 'Signing in...' : 'Sign in with Google'}
                </button>
                <a
                  href="#workflow"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white underline underline-offset-4 decoration-zinc-300 dark:decoration-zinc-700 whitespace-nowrap shrink-0"
                >
                  <span>Field protocol</span>
                  <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>

              {authError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
                >
                  {authError}
                </div>
              )}
            </div>
          </div>

          {/* 16:9 Architectural Hero Photograph */}
          <div className="mt-12 lg:mt-16 relative aspect-[16/9] max-h-[580px] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-900">
            {!heroImgFailed ? (
              <img
                src={heroClinicImg}
                alt="Sunlit maternal care pavilion courtyard in Kigali, Rwanda"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-zinc-200 text-center bg-gradient-to-br from-[#0F4C3A] to-zinc-900">
                <Building2 className="w-10 h-10 mb-3 opacity-80" aria-hidden="true" />
                <p className="font-display text-xl font-medium">Data Detectives Field Study</p>
                <p className="text-xs text-zinc-300 mt-1">Five Kigali Partner Hospitals</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-end p-6 sm:p-8">
              <p className="text-xs sm:text-sm text-zinc-100 max-w-xl leading-relaxed">
                Built for hospital outpatient clinics and mobile tablets—combining encrypted offline storage, English and Kinyarwanda interviews, and same-day mental health escalation.
              </p>
            </div>
          </div>
        </section>

        {/* Study Parameters Strip */}
        <section id="study" className="mx-auto max-w-[1360px] px-6 sm:px-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-y border-zinc-200 dark:border-zinc-800 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-zinc-800">
            <div className="py-8 pr-6">
              <p className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                385
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Target sample across mothers of children under two
              </p>
            </div>
            <div className="py-8 pl-6 lg:px-8">
              <p className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                {displaySites.length || 5}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Participating referral and district hospitals in Kigali
              </p>
            </div>
            <div className="py-8 pr-6 lg:px-8">
              <p className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold tracking-tight text-[#0F4C3A] dark:text-emerald-400">
                0
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Names, phone numbers, or home addresses ever recorded
              </p>
            </div>
            <div className="py-8 pl-6 lg:pl-8">
              <p className="font-mono tabular-nums text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                EN / RW
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Per-interview English and Kinyarwanda language switching
              </p>
            </div>
          </div>
        </section>

        {/* Workflow & Capabilities */}
        <section id="workflow" className="mx-auto max-w-[1360px] px-6 sm:px-10 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-medium text-[#0F4C3A] dark:text-emerald-400">
                Field Methodology
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 text-balance">
                Structured around clinic reality and ethical rigor
              </h2>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                Every response receives a randomized de-identified code (<span className="font-mono">DS-XXXX</span>), preserving maternal confidentiality while giving analysts auditable longitudinal integrity.
              </p>

              <div className="pt-4">
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                  {!tabletImgFailed ? (
                    <img
                      src={fieldTabletImg}
                      alt="Public health researcher reviewing study instrument on a tablet inside a clinic hallway"
                      referrerPolicy="no-referrer"
                      onError={() => setTabletImgFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center p-6 text-xs text-zinc-500">
                      Offline tablet interview workspace
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Installable as a Progressive Web App on Android field phones and tablets for uninterrupted clinic interviews.
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
              {WORKFLOW_ITEMS.map((item) => (
                <div key={item.index} className="py-7 grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-6">
                  <div className="sm:col-span-2 font-mono tabular-nums text-sm font-medium text-zinc-400 dark:text-zinc-500">
                    {item.index}
                  </div>
                  <div className="sm:col-span-10 space-y-2">
                    <h3 className="font-display text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Partner Study Hospitals Ledger */}
        <section id="sites" className="mx-auto max-w-[1360px] px-6 sm:px-10 pb-16 lg:pb-24">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <p className="text-xs font-medium text-[#0F4C3A] dark:text-emerald-400">
                Clinical Sites
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mt-1">
                Participating Kigali Hospitals
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm">
              Each site carries a configured same-day mental health escalation desk and protocol for immediate clinical accompaniment.
            </p>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 border-b border-zinc-200 dark:border-zinc-800">
            {displaySites.map((site, idx) => (
              <div
                key={site.id}
                className="py-5 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline"
              >
                <div className="md:col-span-1 font-mono tabular-nums text-xs text-zinc-400">
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <div className="md:col-span-4 font-display text-base font-semibold text-zinc-950 dark:text-zinc-50">
                  {site.name}
                </div>
                <div className="md:col-span-2 text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                  {site.district} · {site.urbanRural}
                </div>
                <div className="md:col-span-5 text-xs text-zinc-600 dark:text-zinc-300">
                  {site.referralContactName}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Safeguards & Access */}
        <section id="safeguards" className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
          <div className="mx-auto max-w-[1360px] px-6 sm:px-10 py-14 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8 space-y-2">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 text-balance">
                Authorized research team access with full audit attribution
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
                Sign in with your verified Google account protected by 2-Step Verification. Every submission, edit, cutoff change, and data export is logged cleanly without storing maternal identifiers.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-wrap lg:justify-end items-center gap-3">
              <PWAInstallButton />
              <button
                type="button"
                disabled={signingIn}
                onClick={onSignIn}
                className="min-h-[46px] rounded-lg bg-[#0F4C3A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0B3A2C] dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {signingIn ? 'Signing in...' : 'Sign in with Google'}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-[#FAFAFA] dark:bg-[#09090B]">
        <div className="mx-auto max-w-[1360px] px-6 sm:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-semibold text-zinc-900 dark:text-zinc-100">Data Detectives</span>
            <span aria-hidden="true">·</span>
            <span>Rwanda Maternal Readiness &amp; Matrescence Study</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onToggleDark}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors whitespace-nowrap"
            >
              {dark ? <Sun className="w-3.5 h-3.5" aria-hidden="true" /> : <Moon className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{dark ? 'Light theme' : 'Dark theme'}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
