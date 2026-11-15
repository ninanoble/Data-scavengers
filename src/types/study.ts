import { z } from 'zod';

export type UserRole = 'admin' | 'interviewer' | 'analyst';
export type Language = 'en' | 'rw';

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'agreement_5'
  | 'frequency_5'
  | 'number'
  | 'slider_10'
  | 'short_text'
  | 'long_text';

export type ScoreDomain =
  | 'none'
  | 'preparedness'
  | 'strain'
  | 'support'
  | 'partner'
  | 'hardship'
  | 'matrescence'
  | 'safety';

export interface QuestionOption {
  value: string;
  labelEn: string;
  labelRw: string;
}

export interface ConditionalRule {
  dependsOnQuestionId: string;
  operator: 'eq' | 'neq' | 'lt' | 'gt' | 'includes';
  value: string | number;
}

export interface QuestionDefinition {
  id: string;
  sectionId: string;
  order: number;
  type: QuestionType;
  labelEn: string;
  labelRw: string;
  helpEn?: string;
  helpRw?: string;
  required: boolean;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  reverseScored?: boolean;
  scoreDomain: ScoreDomain;
  isSafetyQuestion?: boolean;
  conditionalRule?: ConditionalRule;
  kinyarwandaVerified?: boolean;
}

export interface SectionDefinition {
  id: string;
  order: number;
  titleEn: string;
  titleRw: string;
  descriptionEn: string;
  descriptionRw: string;
}

export interface LicensedScaleSlot {
  id: string;
  name: string;
  domain: string;
  status: 'awaiting_license' | 'active';
  licenseReference: string;
  validatedKinyarwandaReady: boolean;
  notes: string;
}

export interface QuestionnaireVersion {
  id: string;
  version: number;
  titleEn: string;
  titleRw: string;
  status: 'draft' | 'published' | 'archived';
  sections: SectionDefinition[];
  questions: QuestionDefinition[];
  licensedScaleSlots: LicensedScaleSlot[];
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  name: string;
  district: string;
  urbanRural: 'urban' | 'peri-urban' | 'rural';
  referralContactName: string;
  referralContactPhone: string;
  referralProtocolEn: string;
  referralProtocolRw: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CutoffChangeEntry {
  changedAt: string;
  changedByUid: string;
  changedByName: string;
  field: 'preparednessCutoff' | 'strainCutoff' | 'cutoffsLocked' | 'targetSampleSize';
  previousValue: string | number | boolean;
  newValue: string | number | boolean;
  reason: string;
}

export interface StudyConfig {
  targetSampleSize: number;
  preparednessCutoff: number;
  strainCutoff: number;
  cutoffsLocked: boolean;
  cutoffChangeLog: CutoffChangeEntry[];
  dataRetentionDays: number;
  updatedByUid?: string;
  updatedAt: string;
}

export interface TeamUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  assignedSiteId?: string;
  active: boolean;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserDirectoryEntry {
  uid: string;
  displayName: string;
  role: UserRole;
  assignedSiteId?: string;
  active: boolean;
  updatedAt: string;
}

export interface TeamInvite {
  email: string;
  displayName: string;
  role: UserRole;
  assignedSiteId?: string;
  createdByUid: string;
  createdAt: string;
}

export interface DerivedScores {
  preparedness: number | null;
  strain: number | null;
  support: number | null;
  partnerQuality: number | null;
  hardship: number | null;
  matrescence: number | null;
  overallPreparedness: number | null;
  isUnprepared: boolean | null;
  isHighStrain: boolean | null;
}

export interface EditHistoryEntry {
  editedAt: string;
  editedByUid: string;
  editedByName: string;
  reason: string;
  changedFields: string[];
}

export type AnswerValue = string | number | string[] | boolean | null;

export interface InterviewResponse {
  id: string;
  respondentCode: string;
  siteId: string;
  siteName: string;
  interviewerUid: string;
  interviewerName: string;
  questionnaireVersionId: string;
  questionnaireVersion: number;
  language: Language;
  consentConfirmed: boolean;
  respondentAge?: number;
  guardianConsentConfirmed?: boolean;
  answers: Record<string, AnswerValue>;
  derivedScores: DerivedScores;
  safetyFlagged: boolean;
  durationSeconds: number;
  completionStatus: 'complete' | 'partial';
  softDeleted: boolean;
  deleteApprovalStatus: 'none' | 'pending' | 'approved';
  deleteReason?: string;
  editHistory?: EditHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface ResponseTag {
  responseId: string;
  themes: string[];
  aiSuggestedThemes?: string[];
  aiReviewStatus?: 'none' | 'pending_review' | 'approved' | 'edited';
  notes?: string;
  taggedByUid: string;
  taggedByName?: string;
  updatedAt: string;
}

export interface SafetyFlag {
  id: string;
  responseId: string;
  respondentCode: string;
  siteId: string;
  siteName: string;
  interviewerUid: string;
  interviewerName: string;
  status: 'open' | 'acknowledged' | 'referred';
  acknowledgedByUid?: string;
  acknowledgedByName?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface ExportLogEntry {
  id: string;
  actorUid: string;
  actorName: string;
  format: 'csv' | 'xlsx';
  recordCount: number;
  filterSummary: string;
  createdAt: string;
}

export interface AggregateMetric {
  totalResponses: number;
  targetSampleSize: number;
  completionRate: number;
  safetyFlagCount: number;
  unpreparedCount: number;
  preparedCount: number;
  meanPreparedness: number;
  meanStrain: number;
  siteCounts: Record<string, number>;
  interviewerCounts: Record<string, number>;
  dailyCounts: Record<string, number>;
  updatedAt: string;
}

export interface SharedReport {
  token: string;
  title: string;
  createdByUid: string;
  createdByName: string;
  filters?: Record<string, string>;
  snapshotData: Record<string, unknown>;
  revoked: boolean;
  createdAt: string;
}

export interface OfflineDraft {
  id: string;
  respondentCode: string;
  siteId: string;
  siteName: string;
  interviewerUid: string;
  interviewerName: string;
  questionnaireVersionId: string;
  questionnaireVersion: number;
  language: Language;
  consentConfirmed: boolean;
  respondentAge?: number;
  guardianConsentConfirmed?: boolean;
  answers: Record<string, AnswerValue>;
  startedAt: string;
  updatedAt: string;
  currentStep: number;
}

export interface SyncQueueItem {
  id: string;
  operation: 'create' | 'update';
  payload: InterviewResponse;
  safetyFlag?: SafetyFlag;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  conflictServerData?: InterviewResponse;
}

export const AggregateInsightsPayloadSchema = z.object({
  totalResponses: z.number().int().min(0),
  targetSampleSize: z.number().int().min(1),
  validHypothesisN: z.number().int().min(0),
  unpreparedPercent: z.number().nullable(),
  meanPreparedness: z.number().nullable(),
  meanStrain: z.number().nullable(),
  strainGap: z.number().nullable(),
  cohensD: z.number().nullable(),
  pearsonR: z.number().nullable(),
  verdictWithheld: z.boolean(),
  siteBreakdown: z.array(
    z.object({
      siteName: z.string(),
      count: z.number().int(),
      meanPreparedness: z.number().nullable(),
      meanStrain: z.number().nullable(),
    })
  ),
  topPredictors: z.array(
    z.object({
      factor: z.string(),
      r: z.number().nullable(),
      rSquared: z.number().nullable(),
    })
  ),
  comparisonHighlights: z.array(
    z.object({
      dimension: z.string(),
      group: z.string(),
      n: z.number().int(),
      meanStrain: z.number().nullable(),
    })
  ),
});

export type AggregateInsightsPayload = z.infer<typeof AggregateInsightsPayloadSchema>;
