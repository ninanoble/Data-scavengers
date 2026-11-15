import React, { useMemo, useState } from 'react';
import { Check, Plus, Search, Sparkles, Tag } from 'lucide-react';
import { auth } from '../lib/firebase.ts';
import { saveResponseTag } from '../lib/studyService.ts';
import type { InterviewResponse, ResponseTag, TeamUser } from '../types/study.ts';

interface OpenTextViewProps {
  user: TeamUser;
  responses: InterviewResponse[];
  tagsByResponseId: Record<string, ResponseTag>;
  onTagSaved: (tag: ResponseTag) => void;
}

interface AIThemeSuggestion {
  name: string;
  description: string;
  respondentCodes: string[];
}

export const OpenTextView: React.FC<OpenTextViewProps> = ({
  user,
  responses,
  tagsByResponseId,
  onTagSaved,
}) => {
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState('all');
  const [newTagInput, setNewTagInput] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiThemes, setAiThemes] = useState<AIThemeSuggestion[]>([]);

  const textEntries = useMemo(() => {
    return responses
      .filter((r) => !r.softDeleted)
      .filter((r) => {
        const u = String(r.answers.open_unexpected ?? '').trim();
        const w = String(r.answers.open_wish_knew ?? '').trim();
        return u.length > 0 || w.length > 0;
      });
  }, [responses]);

  const allThemes = useMemo(() => {
    const set = new Set<string>();
    for (const tag of Object.values(tagsByResponseId)) {
      for (const t of tag.themes) set.add(t);
    }
    return Array.from(set).sort();
  }, [tagsByResponseId]);

  const filtered = useMemo(() => {
    return textEntries.filter((r) => {
      const tag = tagsByResponseId[r.id];
      if (themeFilter !== 'all' && !(tag?.themes ?? []).includes(themeFilter)) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.respondentCode.toLowerCase().includes(q) ||
        String(r.answers.open_unexpected ?? '').toLowerCase().includes(q) ||
        String(r.answers.open_wish_knew ?? '').toLowerCase().includes(q)
      );
    });
  }, [textEntries, tagsByResponseId, themeFilter, search]);

  const handleAddTheme = async (responseId: string, themeRaw: string) => {
    const theme = themeRaw.trim();
    if (!theme) return;
    const existing = tagsByResponseId[responseId];
    const nextThemes = Array.from(new Set([...(existing?.themes ?? []), theme]));
    const updated: ResponseTag = {
      responseId,
      themes: nextThemes,
      aiSuggestedThemes: existing?.aiSuggestedThemes ?? [],
      aiReviewStatus: existing?.aiReviewStatus ?? 'none',
      notes: existing?.notes ?? '',
      taggedByUid: user.uid,
      taggedByName: user.displayName,
      updatedAt: new Date().toISOString(),
    };
    await saveResponseTag(updated, user);
    onTagSaved(updated);
    setNewTagInput((prev) => ({ ...prev, [responseId]: '' }));
  };

  const handleRemoveTheme = async (responseId: string, themeToRemove: string) => {
    const existing = tagsByResponseId[responseId];
    if (!existing) return;
    const updated: ResponseTag = {
      ...existing,
      themes: existing.themes.filter((t) => t !== themeToRemove),
      taggedByUid: user.uid,
      taggedByName: user.displayName,
      updatedAt: new Date().toISOString(),
    };
    await saveResponseTag(updated, user);
    onTagSaved(updated);
  };

  const handleRunAIThemeClustering = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const snippets = filtered.slice(0, 35).map((r) => ({
        respondentCode: r.respondentCode,
        text: [r.answers.open_unexpected, r.answers.open_wish_knew].filter(Boolean).join(' | '),
      }));
      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ snippets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cluster themes');
      setAiThemes(data.themes ?? []);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate AI theme suggestions');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAISuggestion = async (suggestion: AIThemeSuggestion) => {
    for (const code of suggestion.respondentCodes) {
      const match = responses.find((r) => r.respondentCode === code);
      if (!match) continue;
      const existing = tagsByResponseId[match.id];
      const nextThemes = Array.from(new Set([...(existing?.themes ?? []), suggestion.name]));
      const nextAi = Array.from(new Set([...(existing?.aiSuggestedThemes ?? []), suggestion.name]));
      const updated: ResponseTag = {
        responseId: match.id,
        themes: nextThemes,
        aiSuggestedThemes: nextAi,
        aiReviewStatus: 'approved',
        notes: existing?.notes ?? '',
        taggedByUid: user.uid,
        taggedByName: user.displayName,
        updatedAt: new Date().toISOString(),
      };
      await saveResponseTag(updated, user);
      onTagSaved(updated);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#1C2420] dark:text-[#EEF2EF]">
              Open-Ended Reflections & Qualitative Coding
            </h2>
            <p className="text-sm text-[#5E6A63] dark:text-[#98A69E] mt-1">
              {filtered.length} de-identified responses with narrative notes. Tag themes manually or review optional AI-suggested clusters.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#5E6A63] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search quotes..."
                className="min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] pl-9 pr-3 text-sm"
              />
            </div>

            <select
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              className="min-h-[42px] rounded-xl border border-[#D8D2C5] dark:border-[#2E3832] bg-[#F6F4EF] dark:bg-[#111412] px-3 text-sm"
            >
              <option value="all">All themes</option>
              {allThemes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={aiLoading || filtered.length === 0}
              onClick={handleRunAIThemeClustering}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-[#1B4D3E] px-4 py-2 text-sm font-medium text-[#1B4D3E] dark:text-[#6EE7B7] hover:bg-[#1B4D3E]/5 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{aiLoading ? 'Clustering...' : 'AI Theme Suggestions'}</span>
            </button>
          </div>
        </div>

        {aiError && (
          <div className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
            {aiError}
          </div>
        )}

        {aiThemes.length > 0 && (
          <div className="mt-5 rounded-xl border border-[#D4A145] bg-[#FEFCE8] dark:bg-[#292211] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-[#854D0E] dark:text-[#FDE68A]">
                AI-Generated Theme Proposals (Unverified — Researcher Review Required)
              </p>
              <button
                type="button"
                onClick={() => setAiThemes([])}
                className="text-xs underline text-[#854D0E] dark:text-[#FDE68A]"
              >
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {aiThemes.map((s) => (
                <div
                  key={s.name}
                  className="rounded-xl bg-white dark:bg-[#181D1A] border border-[#E2DDD2] dark:border-[#28302B] p-3.5 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-sm text-[#1C2420] dark:text-[#EEF2EF]">{s.name}</p>
                    <p className="text-xs text-[#4A5550] dark:text-[#B8C2BC] mt-1">{s.description}</p>
                    <p className="font-mono text-xs text-[#5E6A63] mt-1.5">
                      Matched: {s.respondentCodes.join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyAISuggestion(s)}
                    className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1B4D3E] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#143A2E]"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve & Apply Theme Tag</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-10 text-center text-sm text-[#5E6A63]">
          No open-ended responses match your current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => {
            const tag = tagsByResponseId[r.id];
            const themes = tag?.themes ?? [];
            return (
              <article
                key={r.id}
                className="rounded-2xl border border-[#E2DDD2] dark:border-[#28302B] bg-white dark:bg-[#181D1A] p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5E6A63] dark:text-[#98A69E]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold text-[#1B4D3E] dark:text-[#6EE7B7]">
                      {r.respondentCode}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{r.siteName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Preparedness: {r.derivedScores.preparedness ?? '—'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      Strain: {r.derivedScores.strain ?? '—'}
                    </span>
                  </div>
                  <span className="font-mono">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                    <p className="text-xs font-medium text-[#5E6A63] dark:text-[#98A69E]">
                      What surprised her most
                    </p>
                    <p className="mt-1.5 text-sm text-[#1C2420] dark:text-[#EEF2EF] leading-relaxed">
                      {String(r.answers.open_unexpected || '—')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[#F6F4EF] dark:bg-[#111412] p-4 border border-[#E2DDD2] dark:border-[#28302B]">
                    <p className="text-xs font-medium text-[#5E6A63] dark:text-[#98A69E]">
                      What she wishes clinic/family had done
                    </p>
                    <p className="mt-1.5 text-sm text-[#1C2420] dark:text-[#EEF2EF] leading-relaxed">
                      {String(r.answers.open_wish_knew || '—')}
                    </p>
                  </div>
                </div>

                {/* Manual Tagging Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Tag className="w-3.5 h-3.5 text-[#5E6A63]" aria-hidden="true" />
                    {themes.length === 0 ? (
                      <span className="text-[#5E6A63]">No themes tagged yet</span>
                    ) : (
                      themes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleRemoveTheme(r.id, t)}
                          title="Click to remove theme"
                          className="rounded-md bg-[#EFECE4] dark:bg-[#222925] px-2.5 py-1 text-xs font-medium text-[#1C2420] dark:text-[#EEF2EF] hover:bg-[#E2DDD2]"
                        >
                          {t} ×
                        </button>
                      ))
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleAddTheme(r.id, newTagInput[r.id] || '');
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newTagInput[r.id] || ''}
                      onChange={(e) =>
                        setNewTagInput((prev) => ({ ...prev, [r.id]: e.target.value }))
                      }
                      placeholder="Add theme tag..."
                      className="min-h-[38px] rounded-lg border border-[#D8D2C5] dark:border-[#2E3832] bg-white dark:bg-[#111412] px-3 text-xs"
                    />
                    <button
                      type="submit"
                      className="min-h-[38px] inline-flex items-center gap-1 rounded-lg bg-[#1B4D3E] px-3 text-xs font-medium text-white"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tag</span>
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
