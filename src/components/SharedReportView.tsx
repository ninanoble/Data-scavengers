import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Lock } from 'lucide-react';
import { db } from '../lib/firebase.ts';
import type { SharedReport } from '../types/study.ts';

interface SharedReportViewProps {
  token: string;
}

export const SharedReportView: React.FC<SharedReportViewProps> = ({ token }) => {
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, 'sharedReports', token))
      .then((snap) => {
        if (!active) return;
        if (!snap.exists()) {
          setError('Report link not found or revoked.');
        } else {
          setReport(snap.data() as SharedReport);
        }
      })
      .catch(() => {
        if (active) setError('Unable to load shared aggregate report.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-sm text-[#5E6A63]">Loading shared aggregate snapshot...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-[#E2DDD2] bg-white p-6 text-center space-y-2">
          <Lock className="w-6 h-6 mx-auto text-[#B45309]" />
          <h1 className="font-display text-xl font-semibold">Unavailable Report</h1>
          <p className="text-sm text-[#5E6A63]">{error}</p>
        </div>
      </div>
    );
  }

  const snap = report.snapshotData as {
    totalResponses?: number;
    targetSampleSize?: number;
    hypothesis?: {
      verdictWithheld?: boolean;
      verdictText?: string;
      unpreparedPercent?: number | null;
      strainGap?: number | null;
      cohensD?: number | null;
      pearsonR?: number | null;
    };
    siteBreakdown?: Array<{ siteName: string; count: number; meanPreparedness: number | null; meanStrain: number | null }>;
  };

  return (
    <div className="min-h-screen bg-[#F6F4EF] dark:bg-[#111412] p-6 sm:p-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
          <p className="font-mono text-xs text-[#0F4C3A] dark:text-emerald-400">
            Data Detectives · Read-Only Aggregate Report · Shared by {report.createdByName}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold mt-1">{report.title}</h1>
          <p className="text-xs text-[#5E6A63] mt-1">
            Generated {new Date(report.createdAt).toLocaleString()} · Contains aggregated de-identified metrics only.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[#E2DDD2] bg-white dark:bg-[#181D1A] p-5">
            <p className="text-xs text-[#5E6A63]">Sample Size</p>
            <p className="font-mono text-2xl font-semibold mt-1">
              {snap.totalResponses ?? 0} / {snap.targetSampleSize ?? 385}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2DDD2] bg-white dark:bg-[#181D1A] p-5">
            <p className="text-xs text-[#5E6A63]">% Unprepared</p>
            <p className="font-mono text-2xl font-semibold mt-1">
              {snap.hypothesis?.unpreparedPercent !== null && snap.hypothesis?.unpreparedPercent !== undefined
                ? `${snap.hypothesis.unpreparedPercent}%`
                : '—'}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E2DDD2] bg-white dark:bg-[#181D1A] p-5">
            <p className="text-xs text-[#5E6A63]">Strain Gap / Cohen’s d</p>
            <p className="font-mono text-2xl font-semibold mt-1">
              {snap.hypothesis?.strainGap ?? '—'} / d={snap.hypothesis?.cohensD ?? '—'}
            </p>
          </div>
        </div>

        {snap.hypothesis?.verdictText && (
          <div className="rounded-2xl border border-[#E2DDD2] bg-white dark:bg-[#181D1A] p-6">
            <h2 className="font-display text-lg font-semibold">Hypothesis Summary</h2>
            <p className="mt-2 text-sm text-[#374151] dark:text-[#D1D5DB]">{snap.hypothesis.verdictText}</p>
          </div>
        )}

        {snap.siteBreakdown && snap.siteBreakdown.length > 0 && (
          <div className="rounded-2xl border border-[#E2DDD2] bg-white dark:bg-[#181D1A] p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Site Breakdown</h2>
            <div className="divide-y divide-[#E2DDD2]">
              {snap.siteBreakdown.map((s) => (
                <div key={s.siteName} className="py-2.5 flex justify-between text-sm">
                  <span>{s.siteName}</span>
                  <span className="font-mono">
                    n={s.count} · Prep {s.meanPreparedness ?? '—'} · Strain {s.meanStrain ?? '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
