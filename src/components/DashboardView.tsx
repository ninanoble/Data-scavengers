import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  HeartHandshake,
  Image as ImageIcon,
  Printer,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth } from '../lib/firebase.ts';
import { exportDeidentifiedCSV, exportDeidentifiedXLSX } from '../lib/exportUtils.ts';
import { computeStudyAnalytics, type DashboardFilters } from '../lib/scoring.ts';
import {
  acknowledgeSafetyFlag,
  createShareableReport,
  recordExportLog,
} from '../lib/studyService.ts';
import type {
  AggregateInsightsPayload,
  AggregateMetric,
  InterviewResponse,
  QuestionnaireVersion,
  SafetyFlag,
  Site,
  StudyConfig,
  TeamUser,
  UserDirectoryEntry,
} from '../types/study.ts';

interface DashboardViewProps {
  user: TeamUser;
  effectiveRole: TeamUser['role'];
  responses: InterviewResponse[];
  aggregateMetric: AggregateMetric | null;
  safetyFlags: SafetyFlag[];
  sites: Site[];
  directory: UserDirectoryEntry[];
  questionnaire: QuestionnaireVersion;
  config: StudyConfig;
  onSafetyFlagUpdated: (flag: SafetyFlag) => void;
}

interface SavedFilterView {
  id: string;
  name: string;
  filters: DashboardFilters;
}

interface InsightsResult {
  summary: string;
  keyPatterns: string[];
  limitations: string[];
  nextDataToCollect: string[];
  generatedAt: string;
  model: string;
  disclaimer: string;
}

const DEFAULT_SAVED_VIEWS: SavedFilterView[] = [
  { id: 'all', name: 'All Sites & Ages', filters: {} },
  { id: 'teen', name: 'Teen Mothers (< 18)', filters: { ageGroup: 'under_18' } },
  { id: 'young', name: 'Young Mothers (18–24)', filters: { ageGroup: '18_24' } },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  effectiveRole,
  responses,
  aggregateMetric,
  safetyFlags,
  sites,
  directory,
  questionnaire,
  config,
  onSafetyFlagUpdated,
}) => {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [savedViews, setSavedViews] = useState<SavedFilterView[]>(() => {
    try {
      const raw = localStorage.getItem('ds_saved_dashboard_views');
      return raw ? [...DEFAULT_SAVED_VIEWS, ...(JSON.parse(raw) as SavedFilterView[])] : DEFAULT_SAVED_VIEWS;
    } catch {
      return DEFAULT_SAVED_VIEWS;
    }
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'comparisons' | 'relationships' | 'quality'>('overview');
  const [comparisonDimension, setComparisonDimension] = useState<string>('Preparedness');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightsResult | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({});

  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const isInterviewerView = effectiveRole === 'interviewer';
  const analytics = useMemo(
    () => computeStudyAnalytics(responses, config, filters, questionnaire),
    [responses, config, filters, questionnaire]
  );

  // Interviewer aggregate-only view (never exposes raw records from other interviewers)
  if (isInterviewerView) {
    const total = aggregateMetric?.totalResponses ?? analytics.totalResponses;
    const pct = Math.min(100, Math.round((total / config.targetSampleSize) * 100));
    const siteRows = aggregateMetric
      ? Object.entries(aggregateMetric.siteCounts).map(([name, count]) => ({ name, count }))
      : analytics.siteBreakdown.map((s) => ({ name: s.siteName, count: s.count }));

    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
          <p className="font-mono text-xs text-[#5E6A63] dark:text-[#98A69E]">
            Interviewer Aggregate Overview · Individual entries from other team members are hidden for privacy
          </p>
          <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-1">
            Study Progress Toward Target Sample
          </h2>

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Total Team Responses</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                {total} <span className="text-sm font-normal text-[#5E6A63]">/ {config.targetSampleSize}</span>
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-[#EFECE4] dark:bg-[#111412] overflow-hidden">
                <div className="h-full bg-[#1B4D3E]" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">My Collected Responses</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[#1B4D3E] dark:text-[#6EE7B7]">
                {responses.filter((r) => !r.softDeleted && r.interviewerUid === user.uid).length}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Mean Study Preparedness</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                {aggregateMetric?.meanPreparedness ? aggregateMetric.meanPreparedness.toFixed(2) : '—'}
                <span className="text-sm font-normal text-[#5E6A63]"> / 5</span>
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
          <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
            Responses by Health Centre
          </h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={siteRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD2" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1B4D3E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  const targetProgressPct = Math.min(
    100,
    Math.round((analytics.totalResponses / config.targetSampleSize) * 100)
  );

  const comparisonDimensions = Array.from(new Set(analytics.comparisons.map((c) => c.dimension)));
  const activeComparisons = analytics.comparisons.filter((c) => c.dimension === comparisonDimension);

  const handleSaveView = () => {
    const name = window.prompt('Name this filter view (e.g., Muhima Urban Cohort):');
    if (!name || !name.trim()) return;
    const custom: SavedFilterView = {
      id: `view_${Date.now()}`,
      name: name.trim(),
      filters: { ...filters },
    };
    const nextCustom = [...savedViews.filter((v) => !DEFAULT_SAVED_VIEWS.some((d) => d.id === v.id)), custom];
    localStorage.setItem('ds_saved_dashboard_views', JSON.stringify(nextCustom));
    setSavedViews([...DEFAULT_SAVED_VIEWS, ...nextCustom]);
  };

  const handleExportChartPng = () => {
    const svg = chartContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svg.clientWidth * 2 || 1200;
      canvas.height = svg.clientHeight * 2 || 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `data-detectives-chart-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleExportData = async (format: 'csv' | 'xlsx') => {
    if (effectiveRole !== 'admin') return;
    const filtered = responses.filter((r) => !r.softDeleted);
    if (format === 'csv') {
      exportDeidentifiedCSV(filtered, questionnaire, config);
    } else {
      exportDeidentifiedXLSX(filtered, questionnaire, config);
    }
    const summary = `site=${filters.siteId || 'all'}, age=${filters.ageGroup || 'all'}, interviewer=${filters.interviewerUid || 'all'}`;
    await recordExportLog(user, format, filtered.length, summary);
  };

  const handleCreateShareLink = async () => {
    if (effectiveRole !== 'admin') return;
    setShareBusy(true);
    try {
      const report = await createShareableReport({
        title: `Data Detectives Aggregate Snapshot (${new Date().toLocaleDateString()})`,
        filters: Object.fromEntries(
          Object.entries(filters).map(([k, v]) => [k, String(v ?? '')])
        ),
        snapshotData: {
          totalResponses: analytics.totalResponses,
          targetSampleSize: config.targetSampleSize,
          hypothesis: analytics.hypothesis,
          siteBreakdown: analytics.siteBreakdown,
          comparisons: analytics.comparisons.slice(0, 12),
        },
        user,
      });
      const url = `${window.location.origin}/?report=${report.token}`;
      setShareUrl(url);
      await navigator.clipboard?.writeText(url).catch(() => {});
    } finally {
      setShareBusy(false);
    }
  };

  const handleFetchInsights = async () => {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');

      const payload: AggregateInsightsPayload = {
        totalResponses: analytics.totalResponses,
        targetSampleSize: config.targetSampleSize,
        validHypothesisN: analytics.hypothesis.validN,
        unpreparedPercent: analytics.hypothesis.unpreparedPercent,
        meanPreparedness: analytics.meanPreparedness,
        meanStrain: analytics.meanStrain,
        strainGap: analytics.hypothesis.strainGap,
        cohensD: analytics.hypothesis.cohensD,
        pearsonR: analytics.hypothesis.pearsonR,
        verdictWithheld: analytics.hypothesis.verdictWithheld,
        siteBreakdown: analytics.siteBreakdown.map((s) => ({
          siteName: s.siteName,
          count: s.count,
          meanPreparedness: s.meanPreparedness,
          meanStrain: s.meanStrain,
        })),
        topPredictors: analytics.regressionPredictors.map((p) => ({
          factor: p.label,
          r: p.r,
          rSquared: p.rSquared,
        })),
        comparisonHighlights: analytics.comparisons.slice(0, 12).map((c) => ({
          dimension: c.dimension,
          group: c.group,
          n: c.n,
          meanStrain: c.meanStrain,
        })),
      };

      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate insights');
      setInsights(data as InsightsResult);
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Unable to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  };

  const corrBadgeBg = (r: number | null) => {
    if (r === null) return 'bg-[#F6F4EF] dark:bg-[#111412] text-[#5E6A63]';
    if (r >= 0.4) return 'bg-[#991B1B]/15 text-[#991B1B] dark:text-[#FCA5A5]';
    if (r <= -0.4) return 'bg-[#1B4D3E]/15 text-[#1B4D3E] dark:text-[#6EE7B7]';
    return 'bg-[#EFECE4] dark:bg-[#222925] text-[#1C2420] dark:text-[#EEF2EF]';
  };

  const openFlags = safetyFlags.filter((f) => f.status === 'open');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Urgent Safety Flag Notice Bar (only when open clinical flags exist — never casual decoration) */}
      {openFlags.length > 0 && effectiveRole === 'admin' && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] dark:bg-[#2A1414] dark:border-[#7F1D1D] p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 text-[#7F1D1D] dark:text-[#FCA5A5]">
              <HeartHandshake className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-base">
                {openFlags.length} Open Same-Day Safety Referral Flag(s) Requiring Admin Review
              </h3>
            </div>
            <span className="font-mono text-xs text-[#991B1B] dark:text-[#FCA5A5]">
              De-identified · No mother PII stored
            </span>
          </div>
          <div className="space-y-2">
            {openFlags.map((flag) => (
              <div
                key={flag.id}
                className="rounded-xl bg-white dark:bg-[#181D1A] border border-[#FECACA] dark:border-[#7F1D1D] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="text-sm">
                  <span className="font-mono font-semibold text-[#991B1B] dark:text-[#FCA5A5]">
                    {flag.respondentCode}
                  </span>
                  <span className="mx-2 text-[#98A69E]">·</span>
                  <span className="font-medium">{flag.siteName}</span>
                  <span className="mx-2 text-[#98A69E]">·</span>
                  <span className="text-xs text-[#5E6A63]">
                    Interviewer: {flag.interviewerName} · {new Date(flag.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={flagNotes[flag.id] || ''}
                    onChange={(e) => setFlagNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))}
                    placeholder="Referral confirmation note..."
                    className="min-h-[38px] rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] px-3 text-xs bg-[#F6F4EF] dark:bg-[#111412]"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await acknowledgeSafetyFlag({
                        flag,
                        status: 'referred',
                        notes: flagNotes[flag.id] || 'Confirmed same-day clinic referral completed.',
                        user,
                      });
                      onSafetyFlagUpdated({ ...flag, status: 'referred' });
                    }}
                    className="min-h-[38px] rounded-lg bg-[#B91C1C] px-3.5 text-xs font-semibold text-white hover:bg-[#991B1B]"
                  >
                    Confirm Referred
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter & Export Action Bar */}
      <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[#5E6A63] dark:text-[#98A69E]">
              Cutoffs {config.cutoffsLocked ? 'Locked for Analysis' : 'Configurable'} · Preparedness &lt;{' '}
              {config.preparednessCutoff} · Strain ≥ {config.strainCutoff}
            </p>
            <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-0.5">
              Matrescence Study Analytics
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportChartPng}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-3 py-1.5 text-xs font-medium hover:bg-[#EFECE4] dark:hover:bg-[#222925]"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Chart PNG</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-3 py-1.5 text-xs font-medium hover:bg-[#EFECE4] dark:hover:bg-[#222925]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            {effectiveRole === 'admin' && (
              <>
                <button
                  type="button"
                  onClick={() => handleExportData('csv')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#1B4D3E] px-3 py-1.5 text-xs font-medium text-[#1B4D3E] dark:text-[#6EE7B7]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV + Codebook</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportData('xlsx')}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[#1B4D3E] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#143A2E]"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export XLSX</span>
                </button>
                <button
                  type="button"
                  disabled={shareBusy}
                  onClick={handleCreateShareLink}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#B8862D] px-3 py-1.5 text-xs font-medium text-[#8C6219] dark:text-[#E5B85C]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{shareBusy ? 'Creating...' : 'Share Read-Only'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] border border-[#D4A145] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>Read-only aggregate report link copied:</span>
            <code className="font-mono text-[#1B4D3E] dark:text-[#6EE7B7] break-all">{shareUrl}</code>
          </div>
        )}

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-[#E2DDD2] dark:border-[#28302B]">
          <div>
            <label className="block text-[11px] font-medium text-[#5E6A63] mb-1">Saved View</label>
            <select
              onChange={(e) => {
                const found = savedViews.find((v) => v.id === e.target.value);
                if (found) setFilters(found.filters);
              }}
              className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs"
            >
              {savedViews.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#5E6A63] mb-1">Site</label>
            <select
              value={filters.siteId || 'all'}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
              className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs"
            >
              <option value="all">All Study Sites</option>
              {sites
                .filter((s) => s.active || responses.some((r) => r.siteId === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#5E6A63] mb-1">Age Group</label>
            <select
              value={filters.ageGroup || 'all'}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  ageGroup: e.target.value as DashboardFilters['ageGroup'],
                }))
              }
              className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs"
            >
              <option value="all">All Ages</option>
              <option value="under_18">Teen mothers (&lt; 18)</option>
              <option value="18_24">18 – 24</option>
              <option value="25_34">25 – 34</option>
              <option value="35_plus">35+</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#5E6A63] mb-1">Interviewer</label>
            <select
              value={filters.interviewerUid || 'all'}
              onChange={(e) => setFilters((f) => ({ ...f, interviewerUid: e.target.value }))}
              className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs"
            >
              <option value="all">All Team Members</option>
              {directory.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#5E6A63] mb-1">From Date</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
              className="w-full min-h-[40px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-2.5 text-xs font-mono"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={handleSaveView}
              className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1 rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] px-2.5 text-xs font-medium"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Save View</span>
            </button>
            <button
              type="button"
              onClick={() => setFilters({})}
              className="min-h-[40px] rounded-xl px-2.5 text-xs text-[#5E6A63] hover:text-[#1C2420]"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Responses vs Target</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
            {analytics.totalResponses}
            <span className="text-sm font-normal text-[#5E6A63]"> / {config.targetSampleSize}</span>
          </p>
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-[#EFECE4] dark:bg-[#111412] overflow-hidden">
            <div className="h-full bg-[#1B4D3E]" style={{ width: `${targetProgressPct}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Completion Rate</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
            {analytics.completionRate}%
          </p>
          <p className="mt-1 text-xs text-[#5E6A63] font-mono tabular-nums">
            {analytics.completeCount} complete · {analytics.partialCount} partial
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Mean Preparedness</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#1B4D3E] dark:text-[#6EE7B7]">
            {analytics.meanPreparedness !== null ? analytics.meanPreparedness.toFixed(2) : '—'}
            <span className="text-sm font-normal text-[#5E6A63]"> / 5</span>
          </p>
          <p className="mt-1 text-xs text-[#5E6A63]">Higher = more prepared</p>
        </div>

        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5">
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Mean Current Strain</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#B45309] dark:text-[#FBBF24]">
            {analytics.meanStrain !== null ? analytics.meanStrain.toFixed(2) : '—'}
            <span className="text-sm font-normal text-[#5E6A63]"> / 5</span>
          </p>
          <p className="mt-1 text-xs text-[#5E6A63]">Higher = greater strain</p>
        </div>

        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 col-span-2 lg:col-span-1">
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">Safety Referral Flags</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-[#991B1B] dark:text-[#FCA5A5]">
            {analytics.safetyFlagCount}
          </p>
          <p className="mt-1 text-xs text-[#5E6A63]">
            {openFlags.length} open · {safetyFlags.length - openFlags.length} referred
          </p>
        </div>
      </div>

      {/* Hypothesis Tester */}
      <section className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs text-[#B8862D] font-semibold">
              Primary Study Hypothesis Tester
            </p>
            <h3 className="font-display text-xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-1">
              {analytics.hypothesis.hypothesisStatement}
            </h3>
          </div>
          <div className="font-mono text-xs text-[#5E6A63] shrink-0 tabular-nums">
            Valid paired n = {analytics.hypothesis.validN} (min n = 30)
          </div>
        </div>

        {analytics.hypothesis.verdictWithheld ? (
          <div className="rounded-xl border border-[#D4A145] bg-[#FEFCE8] dark:bg-[#292211] p-5 space-y-2">
            <div className="flex items-center gap-2 text-[#854D0E] dark:text-[#FDE68A] font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Hypothesis Verdict Withheld Below n = 30</span>
            </div>
            <p className="text-sm text-[#713F12] dark:text-[#FDE68A]">
              {analytics.hypothesis.verdictText}
            </p>
            <p className="text-xs text-[#854D0E] dark:text-[#FCD34D]">
              {analytics.hypothesis.biasWarning}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                <p className="text-xs text-[#5E6A63]">% Unprepared (&lt; {config.preparednessCutoff})</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                  {analytics.hypothesis.unpreparedPercent}%
                </p>
                <p className="mt-1 font-mono text-xs text-[#5E6A63] tabular-nums">
                  95% CI: [{analytics.hypothesis.unpreparedPercentCI95?.[0]}%, {analytics.hypothesis.unpreparedPercentCI95?.[1]}%]
                </p>
              </div>

              <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                <p className="text-xs text-[#5E6A63]">Strain Gap (Unprepared − Prepared)</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                  {analytics.hypothesis.strainGap !== null
                    ? `${analytics.hypothesis.strainGap >= 0 ? '+' : ''}${analytics.hypothesis.strainGap}`
                    : '—'}
                </p>
                <p className="mt-1 font-mono text-xs text-[#5E6A63] tabular-nums">
                  {analytics.hypothesis.strainGapCI95
                    ? `95% CI: [${analytics.hypothesis.strainGapCI95[0]}, ${analytics.hypothesis.strainGapCI95[1]}]`
                    : 'Insufficient group variance'}
                </p>
              </div>

              <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                <p className="text-xs text-[#5E6A63]">Effect Size (Cohen’s d)</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                  {analytics.hypothesis.cohensD ?? '—'}
                </p>
                <p className="mt-1 text-xs text-[#5E6A63]">
                  {analytics.hypothesis.cohensD !== null
                    ? Math.abs(analytics.hypothesis.cohensD) >= 0.8
                      ? 'Large effect'
                      : Math.abs(analytics.hypothesis.cohensD) >= 0.5
                      ? 'Medium effect'
                      : 'Small effect'
                    : '—'}
                </p>
              </div>

              <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                <p className="text-xs text-[#5E6A63]">Correlation (Prep vs Strain)</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#1C2420] dark:text-[#EEF2EF]">
                  r = {analytics.hypothesis.pearsonR ?? '—'}
                </p>
                <p className="mt-1 text-xs text-[#5E6A63]">Negative r = lower prep, higher strain</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#1B4D3E]/30 bg-[#1B4D3E]/5 dark:bg-[#1B4D3E]/15 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Plain-Language Verdict</span>
              </div>
              <p className="text-sm text-[#1C2420] dark:text-[#EEF2EF] leading-relaxed">
                {analytics.hypothesis.verdictText}
              </p>
              <p className="text-xs text-[#5E6A63] dark:text-[#98A69E]">
                {analytics.hypothesis.biasWarning}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Analytical Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#EFECE4] dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] w-fit">
        {(
          [
            ['overview', 'Site & Timeline'],
            ['comparisons', 'Subgroup Comparisons'],
            ['relationships', 'Correlations & Regression'],
            ['quality', `Data Quality (${analytics.dataQualityAlerts.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors min-h-[38px] whitespace-nowrap ${
              activeTab === id
                ? 'bg-white dark:bg-[#222925] text-[#1C2420] dark:text-white shadow-xs'
                : 'text-[#5E6A63] dark:text-[#98A69E] hover:text-[#1C2420]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div ref={chartContainerRef}>
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
              <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                Cumulative Responses Over Time
              </h3>
              <div className="mt-4 h-72">
                {analytics.dailySeries.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-[#5E6A63]">
                    No responses in current filter range.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.dailySeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD2" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#1B4D3E"
                        fill="#1B4D3E"
                        fillOpacity={0.15}
                        name="Cumulative N"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
              <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                Mean Preparedness vs Strain by Health Centre
              </h3>
              <div className="mt-4 h-72">
                {analytics.siteBreakdown.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-[#5E6A63]">
                    No site data yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.siteBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD2" />
                      <XAxis dataKey="siteName" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="meanPreparedness" name="Preparedness (1-5)" fill="#1B4D3E" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="meanStrain" name="Strain (1-5)" fill="#B8862D" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
              <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                Interviewer Collection Summary
              </h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E2DDD2] dark:border-[#28302B] text-left text-xs text-[#5E6A63]">
                      <th className="py-2 pr-4">Researcher</th>
                      <th className="py-2 px-4 text-right">Total</th>
                      <th className="py-2 px-4 text-right">Complete</th>
                      <th className="py-2 pl-4 text-right">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                    {analytics.interviewerBreakdown.map((row) => (
                      <tr key={row.interviewerUid} className="h-10">
                        <td className="py-2 pr-4 font-medium">{row.interviewerName}</td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums">{row.count}</td>
                        <td className="py-2 px-4 text-right font-mono tabular-nums">{row.completeCount}</td>
                        <td className="py-2 pl-4 text-right font-mono tabular-nums">
                          {Math.round(row.avgDurationSeconds / 60)}m {row.avgDurationSeconds % 60}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comparisons' && (
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                  Subgroup Strain & Preparedness Comparisons
                </h3>
                <p className="text-xs text-[#5E6A63]">
                  Compare strain across preparedness, support, pregnancy intention, age (including teen mothers &lt; 18), urban/rural, education, hardship, and site.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {comparisonDimensions.map((dim) => (
                  <button
                    key={dim}
                    type="button"
                    onClick={() => setComparisonDimension(dim)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      comparisonDimension === dim
                        ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                        : 'border-[#D8D2C5] dark:border-[#2E3832] text-[#4A5550] dark:text-[#B8C2BC]'
                    }`}
                  >
                    {dim}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeComparisons} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD2" />
                    <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="group" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="meanStrain" name="Mean Strain (1-5)" fill="#B8862D" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="meanPreparedness" name="Mean Preparedness (1-5)" fill="#1B4D3E" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E2DDD2] dark:border-[#28302B] text-left text-xs text-[#5E6A63]">
                      <th className="py-2 pr-3">Group</th>
                      <th className="py-2 px-3 text-right">n</th>
                      <th className="py-2 px-3 text-right">Prep</th>
                      <th className="py-2 px-3 text-right">Strain</th>
                      <th className="py-2 pl-3 text-right">% Unprep</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                    {activeComparisons.map((c) => (
                      <tr key={c.group} className="h-10">
                        <td className="py-2 pr-3 font-medium">{c.group}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{c.n}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{c.meanPreparedness ?? '—'}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">{c.meanStrain ?? '—'}</td>
                        <td className="py-2 pl-3 text-right font-mono tabular-nums">
                          {c.unpreparedPercent !== null ? `${c.unpreparedPercent}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'relationships' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                  Pairwise Pearson Correlation Matrix (r)
                </h3>
                <p className="text-xs text-[#5E6A63] mt-0.5">
                  Numeric values shown in every cell for accessibility. Correlation does not prove causation.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="py-2 pr-2 text-left font-medium text-[#5E6A63]">Score</th>
                      {analytics.correlationVariables.map((v) => (
                        <th key={v.key} className="py-2 px-1.5 text-center font-medium text-[#5E6A63]">
                          {v.label.split(' ')[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.correlationVariables.map((rowVar) => (
                      <tr key={rowVar.key}>
                        <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{rowVar.label}</td>
                        {analytics.correlationVariables.map((colVar) => {
                          const r = analytics.correlationMatrix[rowVar.key]?.[colVar.key] ?? null;
                          return (
                            <td key={colVar.key} className="p-1 text-center">
                              <div
                                className={`rounded-md py-1.5 px-1 font-mono tabular-nums ${corrBadgeBg(r)}`}
                              >
                                {r !== null ? r.toFixed(2) : '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                  Simple Regression Predictors of Current Strain
                </h3>
                <p className="text-xs text-[#5E6A63] mt-0.5">
                  Ranked by variance explained (R²). Caution: observational associations may reflect bidirectional stress or unmeasured confounding.
                </p>
              </div>
              <div className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {analytics.regressionPredictors.map((pred) => (
                  <div key={pred.key} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[#1C2420] dark:text-[#EEF2EF]">{pred.label}</p>
                      <p className="text-xs text-[#5E6A63]">
                        Direction: {pred.direction === 'protective' ? 'Protective (higher score, lower strain)' : pred.direction === 'risk' ? 'Risk (higher score, higher strain)' : 'Weak/neutral'} · n = {pred.n}
                      </p>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums shrink-0">
                      <p className="font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                        R² = {pred.rSquared !== null ? pred.rSquared.toFixed(3) : '—'}
                      </p>
                      <p className="text-[#5E6A63]">
                        r = {pred.r !== null ? pred.r.toFixed(2) : '—'} · β = {pred.slope ?? '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quality' && (
          <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
                Automated Data-Quality Checks
              </h3>
              <span className="font-mono text-xs text-[#5E6A63]">
                {analytics.dataQualityAlerts.length} alert(s)
              </span>
            </div>
            {analytics.dataQualityAlerts.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#15803D] dark:text-[#6EE7B7] flex flex-col items-center gap-2">
                <ShieldCheck className="w-6 h-6" />
                <span>No missing required fields, speed flags (&lt; 2 min), or duplicate Likert patterns detected.</span>
              </div>
            ) : (
              <div className="divide-y divide-[#E2DDD2] dark:divide-[#28302B]">
                {analytics.dataQualityAlerts.map((alert, idx) => (
                  <div key={`${alert.responseId}_${idx}`} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div>
                      <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                        {alert.respondentCode}
                      </span>
                      <span className="mx-2 text-[#98A69E]">·</span>
                      <span>{alert.siteName}</span>
                      <span className="mx-2 text-[#98A69E]">·</span>
                      <span className="text-xs text-[#5E6A63]">{alert.interviewerName}</span>
                    </div>
                    <span className="text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
                      {alert.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gemini Aggregate-Only Insights Panel */}
      <section className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[#1B4D3E] dark:text-[#6EE7B7]">
              Aggregate-Only Research Assistant · Zero Raw Responses Sent
            </p>
            <h3 className="font-display text-xl font-semibold text-[#1C2420] dark:text-[#EEF2EF] mt-0.5">
              AI Study Insights & Next Data Priorities
            </h3>
          </div>
          <button
            type="button"
            disabled={insightsLoading}
            onClick={handleFetchInsights}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1B4D3E] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#143A2E] disabled:opacity-60 shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>{insightsLoading ? 'Analyzing Aggregates...' : 'Generate Aggregate Insights'}</span>
          </button>
        </div>

        {insightsError && (
          <div className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs text-[#991B1B]">
            {insightsError}
          </div>
        )}

        {insights ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            <div className="lg:col-span-3 rounded-xl bg-[#F6F4EF] dark:bg-[#111412] border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <p className="text-sm text-[#1C2420] dark:text-[#EEF2EF] leading-relaxed">{insights.summary}</p>
              <p className="mt-2 font-mono text-[11px] text-[#5E6A63]">
                {insights.disclaimer} · Model: {insights.model}
              </p>
            </div>
            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1B4D3E] dark:text-[#6EE7B7]">
                Key Patterns
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-[#374151] dark:text-[#D1D5DB] list-disc pl-4">
                {insights.keyPatterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#B45309] dark:text-[#FBBF24]">
                Methodological Limits
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-[#374151] dark:text-[#D1D5DB] list-disc pl-4">
                {insights.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[#E2DDD2] dark:border-[#28302B] p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#1C2420] dark:text-[#EEF2EF]">
                Next Data to Collect
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs text-[#374151] dark:text-[#D1D5DB] list-disc pl-4">
                {insights.nextDataToCollect.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#5E6A63] dark:text-[#98A69E] flex items-center gap-2">
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>
              Click “Generate Aggregate Insights” to send only de-identified aggregate counts, means, effect sizes, and regression R² values to Gemini for synthesis.
            </span>
          </p>
        )}
      </section>
    </div>
  );
};
