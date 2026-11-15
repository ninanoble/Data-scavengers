import { describe, expect, it } from 'vitest';
import {
  buildPilotResponses,
  SEED_QUESTIONNAIRE_V1,
  SEED_STUDY_CONFIG,
} from '../data/seedData.ts';
import {
  computeDerivedScores,
  computeStudyAnalytics,
  evaluateCondition,
  generateCodebook,
  isSafetyTriggered,
  pearsonCorrelation,
} from '../lib/scoring.ts';

describe('Data Scavengers scoring & statistics engine', () => {
  it('reverse-scores pre_worry in Preparedness and wb_rest in Strain', () => {
    const scores = computeDerivedScores(
      {
        pre_emo_readiness: 2,
        pre_knowledge: 2,
        pre_advice: 2,
        pre_calm: 2,
        pre_partner_support: 2,
        pre_worry: 5, // reverse-scored => 6 - 5 = 1 => mean = 11/6 = 1.83
        wb_low_mood: 4,
        wb_lost_enjoyment: 4,
        wb_anxiety: 4,
        wb_overwhelm: 4,
        wb_not_coping: 4,
        wb_rest: 1, // reverse-scored => 6 - 1 = 5 => mean = 25/6 = 4.17
      },
      SEED_STUDY_CONFIG,
      SEED_QUESTIONNAIRE_V1
    );

    expect(scores.preparedness).toBe(1.83);
    expect(scores.isUnprepared).toBe(true);
    expect(scores.strain).toBe(4.17);
    expect(scores.isHighStrain).toBe(true);
  });

  it('triggers safety alert exclusively on affirmative self-harm response', () => {
    expect(isSafetyTriggered({ safety_self_harm: 'yes' })).toBe(true);
    expect(isSafetyTriggered({ safety_self_harm: 'Yes' })).toBe(true);
    expect(isSafetyTriggered({ safety_self_harm: 'no' })).toBe(false);
    expect(isSafetyTriggered({})).toBe(false);
  });

  it('evaluates conditional partner question visibility correctly', () => {
    const rule = {
      dependsOnQuestionId: 'bg_relationship',
      operator: 'neq' as const,
      value: 'single_separated_widowed',
    };
    expect(evaluateCondition(rule, { bg_relationship: 'married_cohabiting' })).toBe(true);
    expect(evaluateCondition(rule, { bg_relationship: 'single_separated_widowed' })).toBe(false);
  });

  it('withholds hypothesis verdict when valid paired n < 30', () => {
    const smallSample = buildPilotResponses(18, 'uid_1', 'Test Lead');
    const analytics = computeStudyAnalytics(smallSample, SEED_STUDY_CONFIG, {}, SEED_QUESTIONNAIRE_V1);

    expect(analytics.hypothesis.validN).toBe(18);
    expect(analytics.hypothesis.verdictWithheld).toBe(true);
    expect(analytics.hypothesis.verdictLevel).toBe('withheld');
    expect(analytics.hypothesis.verdictText).toContain('minimum n = 30');
    expect(analytics.hypothesis.biasWarning).toContain('recall bias');
  });

  it('unlocks hypothesis verdict, CI, Cohen d, and Pearson r when n >= 30', () => {
    const sample = buildPilotResponses(42, 'uid_1', 'Test Lead');
    const analytics = computeStudyAnalytics(sample, SEED_STUDY_CONFIG, {}, SEED_QUESTIONNAIRE_V1);

    expect(analytics.hypothesis.validN).toBe(42);
    expect(analytics.hypothesis.verdictWithheld).toBe(false);
    expect(analytics.hypothesis.unpreparedPercent).toBeGreaterThan(50);
    expect(analytics.hypothesis.strainGap).toBeGreaterThan(0.5);
    expect(analytics.hypothesis.cohensD).toBeGreaterThan(0.5);
    expect(analytics.hypothesis.pearsonR).toBeLessThan(-0.3);
    expect(analytics.hypothesis.unpreparedPercentCI95).not.toBeNull();
    expect(analytics.hypothesis.strainGapCI95).not.toBeNull();
  });

  it('computes Pearson correlation accurately and prevents mother PII in codebook/pilot records', () => {
    const r = pearsonCorrelation([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    expect(r).toBe(-1);

    const codebook = generateCodebook(SEED_QUESTIONNAIRE_V1, SEED_STUDY_CONFIG);
    const variableNames = codebook.map((c) => c.variableName);
    expect(variableNames).not.toContain('mother_name');
    expect(variableNames).not.toContain('phone');
    expect(variableNames).not.toContain('village');
    expect(variableNames).toContain('derived_preparedness');
    expect(variableNames).toContain('derived_strain');
  });
});
