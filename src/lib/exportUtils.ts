import * as XLSX from 'xlsx';
import { generateCodebook } from './scoring.ts';
import type {
  InterviewResponse,
  QuestionnaireVersion,
  StudyConfig,
} from '../types/study.ts';

function buildExportRows(
  responses: InterviewResponse[],
  questionnaire: QuestionnaireVersion
): Record<string, string | number | boolean>[] {
  const orderedQuestions = questionnaire.questions.slice().sort((a, b) => a.order - b.order);

  return responses
    .filter((r) => !r.softDeleted)
    .map((r) => {
      const row: Record<string, string | number | boolean> = {
        respondent_code: r.respondentCode,
        site_id: r.siteId,
        site_name: r.siteName,
        interviewer_name: r.interviewerName,
        questionnaire_version: r.questionnaireVersion,
        language: r.language,
        consent_confirmed: r.consentConfirmed,
        respondent_age: r.respondentAge ?? '',
        guardian_consent_confirmed: r.guardianConsentConfirmed ?? '',
        completion_status: r.completionStatus,
        duration_seconds: r.durationSeconds,
        safety_flagged: r.safetyFlagged,
        created_at: r.createdAt,
        derived_preparedness: r.derivedScores.preparedness ?? '',
        derived_strain: r.derivedScores.strain ?? '',
        derived_support: r.derivedScores.support ?? '',
        derived_partner_quality: r.derivedScores.partnerQuality ?? '',
        derived_hardship: r.derivedScores.hardship ?? '',
        derived_matrescence: r.derivedScores.matrescence ?? '',
        derived_is_unprepared: r.derivedScores.isUnprepared ?? '',
        derived_is_high_strain: r.derivedScores.isHighStrain ?? '',
      };

      for (const q of orderedQuestions) {
        const val = r.answers[q.id];
        if (Array.isArray(val)) {
          row[q.id] = val.join('; ');
        } else if (val === undefined || val === null) {
          row[q.id] = '';
        } else {
          row[q.id] = val;
        }
      }
      return row;
    });
}

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportDeidentifiedCSV(
  responses: InterviewResponse[],
  questionnaire: QuestionnaireVersion,
  config: StudyConfig
): void {
  const rows = buildExportRows(responses, questionnaire);
  const codebook = generateCodebook(questionnaire, config);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['respondent_code'];
  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ];

  const dataBlob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(dataBlob, `data-detectives-deidentified-${dateSlug()}.csv`);

  // Also download codebook companion CSV
  const cbHeaders = ['variableName', 'section', 'labelEn', 'labelRw', 'type', 'validValues', 'scoringRule'];
  const cbLines = [
    cbHeaders.map(escapeCsvCell).join(','),
    ...codebook.map((row) =>
      cbHeaders.map((h) => escapeCsvCell(row[h as keyof typeof row])).join(',')
    ),
  ];
  const cbBlob = new Blob([cbLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  setTimeout(() => {
    triggerDownload(cbBlob, `data-detectives-codebook-${dateSlug()}.csv`);
  }, 300);
}

export function exportDeidentifiedXLSX(
  responses: InterviewResponse[],
  questionnaire: QuestionnaireVersion,
  config: StudyConfig
): void {
  const rows = buildExportRows(responses, questionnaire);
  const codebook = generateCodebook(questionnaire, config);

  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.json_to_sheet(rows);
  const codebookSheet = XLSX.utils.json_to_sheet(codebook);
  const scoringMetaSheet = XLSX.utils.json_to_sheet([
    {
      parameter: 'Preparedness Cutoff',
      value: config.preparednessCutoff,
      locked: config.cutoffsLocked,
      rule: 'Mean of 6 readiness items (pre_worry reverse-scored: 6 - x); unprepared if < cutoff',
    },
    {
      parameter: 'Strain Cutoff',
      value: config.strainCutoff,
      locked: config.cutoffsLocked,
      rule: 'Mean of 5 wellbeing distress items + reverse-scored wb_rest (6 - x); high strain if >= cutoff',
    },
    {
      parameter: 'Target Sample Size',
      value: config.targetSampleSize,
      locked: config.cutoffsLocked,
      rule: 'Default Cochran single-proportion sample size target (385)',
    },
  ]);

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Responses_Deidentified');
  XLSX.utils.book_append_sheet(wb, codebookSheet, 'Codebook');
  XLSX.utils.book_append_sheet(wb, scoringMetaSheet, 'Scoring_Rules');

  XLSX.writeFile(wb, `data-detectives-study-${dateSlug()}.xlsx`);
}

function dateSlug(): string {
  return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
