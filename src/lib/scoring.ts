import type {
  AnswerValue,
  ConditionalRule,
  DerivedScores,
  InterviewResponse,
  QuestionDefinition,
  QuestionnaireVersion,
  StudyConfig,
} from '../types/study.ts';

export interface DashboardFilters {
  siteId?: string;
  interviewerUid?: string;
  ageGroup?: 'all' | 'under_18' | '18_24' | '25_34' | '35_plus';
  dateFrom?: string;
  dateTo?: string;
}

export interface DataQualityAlert {
  responseId: string;
  respondentCode: string;
  interviewerName: string;
  siteName: string;
  type: 'missing_required' | 'too_fast' | 'duplicate_pattern';
  message: string;
  createdAt: string;
}

export interface HypothesisResult {
  hypothesisStatement: string;
  validN: number;
  minimumN: number;
  verdictWithheld: boolean;
  unpreparedCount: number;
  preparedCount: number;
  unpreparedPercent: number | null;
  unpreparedPercentCI95: [number, number] | null;
  unpreparedMeanStrain: number | null;
  preparedMeanStrain: number | null;
  strainGap: number | null;
  strainGapCI95: [number, number] | null;
  cohensD: number | null;
  pearsonR: number | null;
  verdictLevel: 'withheld' | 'supported' | 'partially_supported' | 'not_supported';
  verdictText: string;
  biasWarning: string;
}

export interface ComparisonGroupRow {
  dimension: string;
  group: string;
  n: number;
  meanPreparedness: number | null;
  meanStrain: number | null;
  unpreparedPercent: number | null;
}

export interface CorrelationVariable {
  key: string;
  label: string;
}

export interface RegressionPredictor {
  key: string;
  label: string;
  n: number;
  r: number | null;
  rSquared: number | null;
  slope: number | null;
  direction: 'protective' | 'risk' | 'neutral';
  cautionNote: string;
}

export interface StudyAnalytics {
  totalResponses: number;
  completeCount: number;
  partialCount: number;
  completionRate: number;
  safetyFlagCount: number;
  meanPreparedness: number | null;
  meanStrain: number | null;
  meanSupport: number | null;
  meanHardship: number | null;
  siteBreakdown: Array<{
    siteId: string;
    siteName: string;
    count: number;
    meanPreparedness: number | null;
    meanStrain: number | null;
    unpreparedPercent: number | null;
  }>;
  interviewerBreakdown: Array<{
    interviewerUid: string;
    interviewerName: string;
    count: number;
    completeCount: number;
    avgDurationSeconds: number;
  }>;
  dailySeries: Array<{
    date: string;
    count: number;
    cumulative: number;
  }>;
  dataQualityAlerts: DataQualityAlert[];
  hypothesis: HypothesisResult;
  comparisons: ComparisonGroupRow[];
  correlationVariables: CorrelationVariable[];
  correlationMatrix: Record<string, Record<string, number | null>>;
  regressionPredictors: RegressionPredictor[];
}

function toFiniteNumber(val: AnswerValue): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function evaluateCondition(
  rule: ConditionalRule | undefined,
  answers: Record<string, AnswerValue>
): boolean {
  if (!rule) return true;
  const actual = answers[rule.dependsOnQuestionId];
  if (actual === undefined || actual === null || actual === '') return false;

  switch (rule.operator) {
    case 'eq':
      return String(actual) === String(rule.value);
    case 'neq':
      return String(actual) !== String(rule.value);
    case 'lt': {
      const n = toFiniteNumber(actual);
      return n !== null && n < Number(rule.value);
    }
    case 'gt': {
      const n = toFiniteNumber(actual);
      return n !== null && n > Number(rule.value);
    }
    case 'includes':
      return Array.isArray(actual) && actual.includes(String(rule.value));
    default:
      return true;
  }
}

/**
 * Computes transparent, documented derived scores for a single interview response.
 * - Preparedness: mean of 6 pre-birth readiness items (1-5), with `pre_worry` reverse-scored (6 - x).
 * - Strain: mean of 5 past-2-week distress items (1-5) + reverse-scored `wb_rest` (6 - x).
 * - Support: composite of `sup_someone_to_talk` (1-5) and support network count (`sup_who_helps`, scaled 1-5).
 * - Partner quality: mean of 3 partner items (1-5) when answered.
 * - Hardship: mean of food & money worry items (1-5).
 * - Matrescence: mean of 3 matrescence/identity items (1-5).
 */
export function computeDerivedScores(
  answers: Record<string, AnswerValue>,
  config: Pick<StudyConfig, 'preparednessCutoff' | 'strainCutoff'>,
  questionnaire?: QuestionnaireVersion
): DerivedScores {
  const preparednessIds = questionnaire
    ? questionnaire.questions
        .filter((q) => q.scoreDomain === 'preparedness' && q.type === 'agreement_5')
        .map((q) => ({ id: q.id, reverse: !!q.reverseScored }))
    : [
        { id: 'pre_emo_readiness', reverse: false },
        { id: 'pre_knowledge', reverse: false },
        { id: 'pre_advice', reverse: false },
        { id: 'pre_calm', reverse: false },
        { id: 'pre_partner_support', reverse: false },
        { id: 'pre_worry', reverse: true },
      ];

  const strainIds = questionnaire
    ? questionnaire.questions
        .filter((q) => q.scoreDomain === 'strain' && q.type === 'frequency_5')
        .map((q) => ({ id: q.id, reverse: !!q.reverseScored }))
    : [
        { id: 'wb_low_mood', reverse: false },
        { id: 'wb_lost_enjoyment', reverse: false },
        { id: 'wb_anxiety', reverse: false },
        { id: 'wb_overwhelm', reverse: false },
        { id: 'wb_not_coping', reverse: false },
        { id: 'wb_rest', reverse: true },
      ];

  const prepVals: number[] = [];
  for (const item of preparednessIds) {
    const raw = toFiniteNumber(answers[item.id]);
    if (raw !== null && raw >= 1 && raw <= 5) {
      prepVals.push(item.reverse ? 6 - raw : raw);
    }
  }

  const strainVals: number[] = [];
  for (const item of strainIds) {
    const raw = toFiniteNumber(answers[item.id]);
    if (raw !== null && raw >= 1 && raw <= 5) {
      strainVals.push(item.reverse ? 6 - raw : raw);
    }
  }

  // Support score: someone_to_talk (1-5) + breadth of helpers mapped to 1-5
  const supportVals: number[] = [];
  const talkVal = toFiniteNumber(answers.sup_someone_to_talk);
  if (talkVal !== null && talkVal >= 1 && talkVal <= 5) {
    supportVals.push(talkVal);
  }
  const helpers = answers.sup_who_helps;
  if (Array.isArray(helpers)) {
    const nonNoneHelpers = helpers.filter((h) => h !== 'no_one');
    const breadthScore = nonNoneHelpers.length === 0 ? 1 : Math.min(5, 1 + nonNoneHelpers.length);
    supportVals.push(breadthScore);
  }

  // Partner quality
  const partnerIds = ['sup_partner_listens', 'sup_partner_shares_care', 'sup_partner_safe_respected'];
  const partnerVals: number[] = [];
  for (const id of partnerIds) {
    const raw = toFiniteNumber(answers[id]);
    if (raw !== null && raw >= 1 && raw <= 5) {
      partnerVals.push(raw);
    }
  }

  // Hardship
  const hardshipIds = ['hard_food_worry', 'hard_money_worry'];
  const hardshipVals: number[] = [];
  for (const id of hardshipIds) {
    const raw = toFiniteNumber(answers[id]);
    if (raw !== null && raw >= 1 && raw <= 5) {
      hardshipVals.push(raw);
    }
  }

  // Matrescence
  const matIds = ['mat_identity_shift', 'mat_grief_for_old_self', 'mat_growing_into_role'];
  const matVals: number[] = [];
  for (const id of matIds) {
    const raw = toFiniteNumber(answers[id]);
    if (raw !== null && raw >= 1 && raw <= 5) {
      matVals.push(raw);
    }
  }

  const preparedness = mean(prepVals);
  const strain = mean(strainVals);
  const support = mean(supportVals);
  const partnerQuality = mean(partnerVals);
  const hardship = mean(hardshipVals);
  const matrescence = mean(matVals);
  const overallPreparedness = toFiniteNumber(answers.pre_overall_preparedness);

  return {
    preparedness,
    strain,
    support,
    partnerQuality,
    hardship,
    matrescence,
    overallPreparedness,
    isUnprepared: preparedness !== null ? preparedness < config.preparednessCutoff : null,
    isHighStrain: strain !== null ? strain >= config.strainCutoff : null,
  };
}

export function isSafetyTriggered(answers: Record<string, AnswerValue>): boolean {
  const val = answers.safety_self_harm;
  return val === 'yes' || val === 'Yes' || val === true;
}

export function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return Math.round((num / denom) * 1000) / 1000;
}

export function wilsonCI95(successes: number, total: number): [number, number] | null {
  if (total <= 0) return null;
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
  return [
    Math.round(Math.max(0, center - half) * 1000) / 10,
    Math.round(Math.min(1, center + half) * 1000) / 10,
  ];
}

export function filterResponses(
  responses: InterviewResponse[],
  filters: DashboardFilters = {}
): InterviewResponse[] {
  return responses.filter((r) => {
    if (r.softDeleted) return false;
    if (filters.siteId && filters.siteId !== 'all' && r.siteId !== filters.siteId) return false;
    if (filters.interviewerUid && filters.interviewerUid !== 'all' && r.interviewerUid !== filters.interviewerUid) {
      return false;
    }
    if (filters.ageGroup && filters.ageGroup !== 'all') {
      const age = r.respondentAge ?? toFiniteNumber(r.answers.bg_age);
      if (age === null) return false;
      if (filters.ageGroup === 'under_18' && age >= 18) return false;
      if (filters.ageGroup === '18_24' && (age < 18 || age > 24)) return false;
      if (filters.ageGroup === '25_34' && (age < 25 || age > 34)) return false;
      if (filters.ageGroup === '35_plus' && age < 35) return false;
    }
    if (filters.dateFrom) {
      if (r.createdAt.slice(0, 10) < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      if (r.createdAt.slice(0, 10) > filters.dateTo) return false;
    }
    return true;
  });
}

export function computeStudyAnalytics(
  allResponses: InterviewResponse[],
  config: StudyConfig,
  filters: DashboardFilters = {},
  questionnaire?: QuestionnaireVersion
): StudyAnalytics {
  const responses = filterResponses(allResponses, filters);
  const totalResponses = responses.length;
  const completeCount = responses.filter((r) => r.completionStatus === 'complete').length;
  const partialCount = totalResponses - completeCount;
  const completionRate = totalResponses > 0 ? Math.round((completeCount / totalResponses) * 1000) / 10 : 0;
  const safetyFlagCount = responses.filter((r) => r.safetyFlagged).length;

  const prepScores = responses.map((r) => r.derivedScores.preparedness).filter((v): v is number => v !== null);
  const strainScores = responses.map((r) => r.derivedScores.strain).filter((v): v is number => v !== null);
  const supportScores = responses.map((r) => r.derivedScores.support).filter((v): v is number => v !== null);
  const hardshipScores = responses.map((r) => r.derivedScores.hardship).filter((v): v is number => v !== null);

  // Site breakdown
  const siteMap = new Map<string, { siteName: string; items: InterviewResponse[] }>();
  for (const r of responses) {
    const entry = siteMap.get(r.siteId) ?? { siteName: r.siteName, items: [] };
    entry.items.push(r);
    siteMap.set(r.siteId, entry);
  }
  const siteBreakdown = Array.from(siteMap.entries()).map(([siteId, { siteName, items }]) => {
    const preps = items.map((i) => i.derivedScores.preparedness).filter((v): v is number => v !== null);
    const strains = items.map((i) => i.derivedScores.strain).filter((v): v is number => v !== null);
    const unprep = items.filter((i) => i.derivedScores.isUnprepared === true).length;
    const validPrepCount = items.filter((i) => i.derivedScores.isUnprepared !== null).length;
    return {
      siteId,
      siteName,
      count: items.length,
      meanPreparedness: mean(preps),
      meanStrain: mean(strains),
      unpreparedPercent: validPrepCount > 0 ? Math.round((unprep / validPrepCount) * 1000) / 10 : null,
    };
  });

  // Interviewer breakdown
  const intMap = new Map<string, { interviewerName: string; items: InterviewResponse[] }>();
  for (const r of responses) {
    const entry = intMap.get(r.interviewerUid) ?? { interviewerName: r.interviewerName, items: [] };
    entry.items.push(r);
    intMap.set(r.interviewerUid, entry);
  }
  const interviewerBreakdown = Array.from(intMap.entries()).map(([interviewerUid, { interviewerName, items }]) => {
    const avgDur =
      items.length > 0 ? Math.round(items.reduce((a, b) => a + (b.durationSeconds || 0), 0) / items.length) : 0;
    return {
      interviewerUid,
      interviewerName,
      count: items.length,
      completeCount: items.filter((i) => i.completionStatus === 'complete').length,
      avgDurationSeconds: avgDur,
    };
  });

  // Daily series
  const dayMap = new Map<string, number>();
  for (const r of responses) {
    const day = r.createdAt.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  let running = 0;
  const dailySeries = sortedDays.map(([date, count]) => {
    running += count;
    return { date, count, cumulative: running };
  });

  // Data-quality alerts
  const dataQualityAlerts: DataQualityAlert[] = [];
  const requiredIds = questionnaire
    ? questionnaire.questions.filter((q) => q.required && !q.conditionalRule).map((q) => q.id)
    : ['bg_age', 'pre_pregnancy_planned', 'pre_emo_readiness', 'wb_low_mood', 'safety_self_harm'];

  const patternMap = new Map<string, InterviewResponse[]>();
  for (const r of responses) {
    if (r.durationSeconds > 0 && r.durationSeconds < 120) {
      dataQualityAlerts.push({
        responseId: r.id,
        respondentCode: r.respondentCode,
        interviewerName: r.interviewerName,
        siteName: r.siteName,
        type: 'too_fast',
        message: `Completed in ${r.durationSeconds}s (< 2 min threshold)`,
        createdAt: r.createdAt,
      });
    }
    const missingCount = requiredIds.filter((qId) => {
      const val = r.answers[qId];
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    }).length;
    if (missingCount > 0) {
      dataQualityAlerts.push({
        responseId: r.id,
        respondentCode: r.respondentCode,
        interviewerName: r.interviewerName,
        siteName: r.siteName,
        type: 'missing_required',
        message: `${missingCount} required item(s) unanswered`,
        createdAt: r.createdAt,
      });
    }
    const sigKeys = [
      'pre_emo_readiness',
      'pre_knowledge',
      'pre_advice',
      'pre_calm',
      'pre_worry',
      'wb_low_mood',
      'wb_anxiety',
      'wb_overwhelm',
    ];
    const sig = `${r.interviewerUid}:${sigKeys.map((k) => String(r.answers[k] ?? '')).join('|')}`;
    if (sigKeys.every((k) => r.answers[k] !== undefined && r.answers[k] !== null)) {
      const arr = patternMap.get(sig) ?? [];
      arr.push(r);
      patternMap.set(sig, arr);
    }
  }
  for (const [, dupes] of patternMap.entries()) {
    if (dupes.length >= 2) {
      for (const d of dupes.slice(1)) {
        dataQualityAlerts.push({
          responseId: d.id,
          respondentCode: d.respondentCode,
          interviewerName: d.interviewerName,
          siteName: d.siteName,
          type: 'duplicate_pattern',
          message: `Identical Likert pattern repeated (${dupes.length}x by ${d.interviewerName})`,
          createdAt: d.createdAt,
        });
      }
    }
  }

  // Hypothesis testing
  const validHypItems = responses.filter(
    (r) => r.derivedScores.preparedness !== null && r.derivedScores.strain !== null
  );
  const validN = validHypItems.length;
  const unpreparedItems = validHypItems.filter((r) => r.derivedScores.preparedness! < config.preparednessCutoff);
  const preparedItems = validHypItems.filter((r) => r.derivedScores.preparedness! >= config.preparednessCutoff);

  const unpreparedCount = unpreparedItems.length;
  const preparedCount = preparedItems.length;
  const unpreparedPercent = validN > 0 ? Math.round((unpreparedCount / validN) * 1000) / 10 : null;
  const unpreparedPercentCI95 = validN > 0 ? wilsonCI95(unpreparedCount, validN) : null;

  const unprepStrains = unpreparedItems.map((r) => r.derivedScores.strain!);
  const prepStrains = preparedItems.map((r) => r.derivedScores.strain!);
  const unpreparedMeanStrain = mean(unprepStrains);
  const preparedMeanStrain = mean(prepStrains);

  let strainGap: number | null = null;
  let strainGapCI95: [number, number] | null = null;
  let cohensD: number | null = null;

  if (
    unpreparedMeanStrain !== null &&
    preparedMeanStrain !== null &&
    unprepStrains.length >= 2 &&
    prepStrains.length >= 2
  ) {
    strainGap = Math.round((unpreparedMeanStrain - preparedMeanStrain) * 100) / 100;
    const sd1 = stdDev(unprepStrains)!;
    const sd2 = stdDev(prepStrains)!;
    const n1 = unprepStrains.length;
    const n2 = prepStrains.length;
    const se = Math.sqrt((sd1 * sd1) / n1 + (sd2 * sd2) / n2);
    strainGapCI95 = [
      Math.round((strainGap - 1.96 * se) * 100) / 100,
      Math.round((strainGap + 1.96 * se) * 100) / 100,
    ];
    const pooledSd = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (n1 + n2 - 2));
    if (pooledSd > 0) {
      cohensD = Math.round((strainGap / pooledSd) * 100) / 100;
    }
  }

  const pearsonR = pearsonCorrelation(
    validHypItems.map((r) => r.derivedScores.preparedness!),
    validHypItems.map((r) => r.derivedScores.strain!)
  );

  const verdictWithheld = validN < 30;
  let verdictLevel: HypothesisResult['verdictLevel'] = 'withheld';
  let verdictText =
    `Statistical verdict withheld: ${validN} complete paired responses collected (minimum n = 30 required before evaluating study hypothesis).`;

  if (!verdictWithheld) {
    const majorityUnprepared = (unpreparedPercent ?? 0) > 50;
    const predictsHigherStrain = (strainGap ?? 0) > 0.25 && (pearsonR ?? 0) <= -0.15;
    if (majorityUnprepared && predictsHigherStrain) {
      verdictLevel = 'supported';
      verdictText = `Preliminary evidence supports the study hypothesis: ${unpreparedPercent}% of mothers scored below the preparedness cutoff (< ${config.preparednessCutoff}), and unprepared mothers reported +${strainGap} higher mean strain (Cohen's d = ${cohensD ?? 'N/A'}, r = ${pearsonR ?? 'N/A'}).`;
    } else if (majorityUnprepared || predictsHigherStrain) {
      verdictLevel = 'partially_supported';
      verdictText = `Mixed / partial support: ${unpreparedPercent}% scored unprepared (< ${config.preparednessCutoff}), with a strain gap of ${strainGap ?? 'N/A'} points (r = ${pearsonR ?? 'N/A'}).`;
    } else {
      verdictLevel = 'not_supported';
      verdictText = `Current sample does not support both parts of the hypothesis: ${unpreparedPercent}% scored unprepared, with a strain gap of ${strainGap ?? 'N/A'} points (r = ${pearsonR ?? 'N/A'}).`;
    }
  }

  const hypothesis: HypothesisResult = {
    hypothesisStatement:
      'H1: Most surveyed mothers of children under 2 in Rwanda report feeling emotionally and relationally unprepared for motherhood, and lower preparedness predicts higher current maternal strain.',
    validN,
    minimumN: 30,
    verdictWithheld,
    unpreparedCount,
    preparedCount,
    unpreparedPercent,
    unpreparedPercentCI95,
    unpreparedMeanStrain,
    preparedMeanStrain,
    strainGap,
    strainGapCI95,
    cohensD,
    pearsonR,
    verdictLevel,
    verdictText,
    biasWarning:
      'Methodological caution: Health-centre convenience sampling may under-represent mothers unable to attend clinics, and retrospective recall of pre-birth readiness can be influenced by current postpartum distress (recall bias).',
  };

  // Comparisons
  const comparisons: ComparisonGroupRow[] = [];
  const addGroup = (dimension: string, group: string, items: InterviewResponse[]) => {
    if (items.length === 0) return;
    const preps = items.map((i) => i.derivedScores.preparedness).filter((v): v is number => v !== null);
    const strains = items.map((i) => i.derivedScores.strain).filter((v): v is number => v !== null);
    const unprep = items.filter((i) => i.derivedScores.isUnprepared === true).length;
    const validPrep = items.filter((i) => i.derivedScores.isUnprepared !== null).length;
    comparisons.push({
      dimension,
      group,
      n: items.length,
      meanPreparedness: mean(preps),
      meanStrain: mean(strains),
      unpreparedPercent: validPrep > 0 ? Math.round((unprep / validPrep) * 1000) / 10 : null,
    });
  };

  // By preparedness tier
  addGroup('Preparedness', `Unprepared (< ${config.preparednessCutoff})`, unpreparedItems);
  addGroup('Preparedness', `Prepared (>= ${config.preparednessCutoff})`, preparedItems);

  // By support tier
  addGroup('Support', 'Low support (< 3.0)', responses.filter((r) => (r.derivedScores.support ?? 99) < 3));
  addGroup('Support', 'Adequate support (>= 3.0)', responses.filter((r) => (r.derivedScores.support ?? -1) >= 3));

  // By pregnancy intention
  for (const intent of ['planned', 'wanted_later', 'unwanted']) {
    const label = intent === 'planned' ? 'Planned' : intent === 'wanted_later' ? 'Unplanned (wanted)' : 'Unwanted';
    addGroup('Pregnancy Intention', label, responses.filter((r) => r.answers.pre_pregnancy_planned === intent));
  }

  // By age group (including teen mothers)
  addGroup(
    'Age Group',
    'Teen mothers (< 18)',
    responses.filter((r) => {
      const age = r.respondentAge ?? toFiniteNumber(r.answers.bg_age);
      return age !== null && age < 18;
    })
  );
  addGroup(
    'Age Group',
    'Young mothers (18-24)',
    responses.filter((r) => {
      const age = r.respondentAge ?? toFiniteNumber(r.answers.bg_age);
      return age !== null && age >= 18 && age <= 24;
    })
  );
  addGroup(
    'Age Group',
    '25-34',
    responses.filter((r) => {
      const age = r.respondentAge ?? toFiniteNumber(r.answers.bg_age);
      return age !== null && age >= 25 && age <= 34;
    })
  );
  addGroup(
    'Age Group',
    '35+',
    responses.filter((r) => {
      const age = r.respondentAge ?? toFiniteNumber(r.answers.bg_age);
      return age !== null && age >= 35;
    })
  );

  // By urban/rural
  for (const setting of ['urban', 'rural']) {
    addGroup(
      'Setting',
      setting === 'urban' ? 'Urban' : 'Rural',
      responses.filter((r) => r.answers.bg_urban_rural === setting)
    );
  }

  // By education
  for (const edu of ['none_primary', 'secondary', 'vocational_university']) {
    const label =
      edu === 'none_primary' ? 'None / Primary' : edu === 'secondary' ? 'Secondary' : 'Vocational / University';
    addGroup('Education', label, responses.filter((r) => r.answers.bg_education === edu));
  }

  // By hardship
  addGroup('Hardship', 'High hardship (>= 3.0)', responses.filter((r) => (r.derivedScores.hardship ?? -1) >= 3));
  addGroup('Hardship', 'Low hardship (< 3.0)', responses.filter((r) => (r.derivedScores.hardship ?? 99) < 3));

  // By site
  for (const s of siteBreakdown) {
    addGroup('Site', s.siteName, responses.filter((r) => r.siteId === s.siteId));
  }

  // Correlation matrix & simple regression predicting Strain
  const correlationVariables: CorrelationVariable[] = [
    { key: 'strain', label: 'Current Strain' },
    { key: 'preparedness', label: 'Preparedness' },
    { key: 'support', label: 'Social Support' },
    { key: 'partnerQuality', label: 'Partner Quality' },
    { key: 'hardship', label: 'Daily Hardship' },
    { key: 'matrescence', label: 'Matrescence Shift' },
  ];

  const getVarValue = (r: InterviewResponse, key: string): number | null => {
    switch (key) {
      case 'strain':
        return r.derivedScores.strain;
      case 'preparedness':
        return r.derivedScores.preparedness;
      case 'support':
        return r.derivedScores.support;
      case 'partnerQuality':
        return r.derivedScores.partnerQuality;
      case 'hardship':
        return r.derivedScores.hardship;
      case 'matrescence':
        return r.derivedScores.matrescence;
      default:
        return null;
    }
  };

  const correlationMatrix: Record<string, Record<string, number | null>> = {};
  for (const v1 of correlationVariables) {
    correlationMatrix[v1.key] = {};
    for (const v2 of correlationVariables) {
      if (v1.key === v2.key) {
        correlationMatrix[v1.key][v2.key] = 1;
        continue;
      }
      const pairs = responses
        .map((r) => [getVarValue(r, v1.key), getVarValue(r, v2.key)])
        .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
      correlationMatrix[v1.key][v2.key] = pearsonCorrelation(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      );
    }
  }

  const regressionPredictors: RegressionPredictor[] = correlationVariables
    .filter((v) => v.key !== 'strain')
    .map((v) => {
      const pairs = responses
        .map((r) => [getVarValue(r, v.key), r.derivedScores.strain])
        .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
      const xs = pairs.map((p) => p[0]);
      const ys = pairs.map((p) => p[1]);
      const r = pearsonCorrelation(xs, ys);
      const rSquared = r !== null ? Math.round(r * r * 1000) / 1000 : null;

      let slope: number | null = null;
      if (pairs.length >= 3) {
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
        const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
        if (den > 0) slope = Math.round((num / den) * 100) / 100;
      }

      const direction: RegressionPredictor['direction'] =
        r === null ? 'neutral' : r <= -0.1 ? 'protective' : r >= 0.1 ? 'risk' : 'neutral';

      return {
        key: v.key,
        label: v.label,
        n: pairs.length,
        r,
        rSquared,
        slope,
        direction,
        cautionNote: 'Observational association only; correlation does not establish causation.',
      };
    })
    .sort((a, b) => (b.rSquared ?? -1) - (a.rSquared ?? -1));

  return {
    totalResponses,
    completeCount,
    partialCount,
    completionRate,
    safetyFlagCount,
    meanPreparedness: mean(prepScores),
    meanStrain: mean(strainScores),
    meanSupport: mean(supportScores),
    meanHardship: mean(hardshipScores),
    siteBreakdown,
    interviewerBreakdown,
    dailySeries,
    dataQualityAlerts,
    hypothesis,
    comparisons,
    correlationVariables,
    correlationMatrix,
    regressionPredictors,
  };
}

export interface CodebookRow {
  variableName: string;
  section: string;
  labelEn: string;
  labelRw: string;
  type: string;
  validValues: string;
  scoringRule: string;
}

export function generateCodebook(
  questionnaire: QuestionnaireVersion,
  config: StudyConfig
): CodebookRow[] {
  const sectionMap = new Map(questionnaire.sections.map((s) => [s.id, s.titleEn]));
  const questionRows: CodebookRow[] = questionnaire.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      let validValues = '';
      if (q.options && q.options.length > 0) {
        validValues = q.options.map((o) => `${o.value}=${o.labelEn}`).join('; ');
      } else if (q.type === 'agreement_5') {
        validValues = '1=Strongly disagree .. 5=Strongly agree';
      } else if (q.type === 'frequency_5') {
        validValues = '1=Never .. 5=Almost always';
      } else if (q.type === 'slider_10') {
        validValues = '0..10 integer';
      } else if (q.type === 'number') {
        validValues = `${q.min ?? 0}..${q.max ?? 999}`;
      } else {
        validValues = 'Free text (de-identified)';
      }

      const scoringRule =
        q.scoreDomain === 'none'
          ? 'Descriptive / grouping variable'
          : q.scoreDomain === 'safety'
          ? 'Triggers immediate same-day clinical referral alert if value = yes'
          : `${q.scoreDomain} composite${q.reverseScored ? ' (REVERSE SCORED: 6 - raw)' : ''}`;

      return {
        variableName: q.id,
        section: sectionMap.get(q.sectionId) ?? q.sectionId,
        labelEn: q.labelEn,
        labelRw: q.labelRw,
        type: q.type,
        validValues,
        scoringRule,
      };
    });

  const derivedRows: CodebookRow[] = [
    {
      variableName: 'derived_preparedness',
      section: 'Derived Scores',
      labelEn: 'Maternal Preparedness Mean Score (1-5)',
      labelRw: 'Igipimo cyo kwitegura ububyeyi (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00',
      scoringRule: `Mean of 6 readiness items (pre_worry reverse-scored: 6 - raw). Unprepared if < ${config.preparednessCutoff}`,
    },
    {
      variableName: 'derived_strain',
      section: 'Derived Scores',
      labelEn: 'Current Maternal Strain Mean Score (1-5)',
      labelRw: 'Igipimo cy’imihangayiko y’ubu (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00',
      scoringRule: `Mean of 5 wellbeing distress items + reverse-scored rest (6 - wb_rest). High strain if >= ${config.strainCutoff}`,
    },
    {
      variableName: 'derived_support',
      section: 'Derived Scores',
      labelEn: 'Social Support Composite (1-5)',
      labelRw: 'Igipimo cy’ubufasha bw’abandi (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00',
      scoringRule: 'Mean of sup_someone_to_talk (1-5) and support network breadth (1-5)',
    },
    {
      variableName: 'derived_partner_quality',
      section: 'Derived Scores',
      labelEn: 'Partner Relational Quality Mean (1-5)',
      labelRw: 'Igipimo cy’imikoranire n’umufasha (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00 (nullable if no partner)',
      scoringRule: 'Mean of 3 partner support & safety items',
    },
    {
      variableName: 'derived_hardship',
      section: 'Derived Scores',
      labelEn: 'Daily Economic/Food Hardship Mean (1-5)',
      labelRw: 'Igipimo cy’ibibazo by’ubuzima bwa buri munsi (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00',
      scoringRule: 'Mean of food worry and money worry items',
    },
    {
      variableName: 'derived_matrescence',
      section: 'Derived Scores',
      labelEn: 'Matrescence Identity Transition Mean (1-5)',
      labelRw: 'Igipimo cy’impinduka mu buzima bw’ububyeyi (1-5)',
      type: 'computed_number',
      validValues: '1.00 .. 5.00',
      scoringRule: 'Mean of 3 matrescence/identity agreement items',
    },
  ];

  return [...questionRows, ...derivedRows];
}
