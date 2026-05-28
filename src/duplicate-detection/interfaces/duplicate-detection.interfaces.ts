import {
  DuplicateRecommendation,
  DuplicateSignal,
  LlmStatus,
  MerchantStatus,
} from '@prisma/client';

export interface DuplicateDetectionMerchant {
  id: string;
  businessName: string;
  normalizedBusinessName: string;
  createdAt: Date;
  status: MerchantStatus;
}

export interface DeterministicCandidate {
  candidateMerchantId: string;
  candidateMerchantName: string;
  levenshteinScore: number;
  trigramScore: number;
  jaroWinklerScore: number;
  deterministicScore: number;
}

export interface DeterministicEvaluationResult {
  sourceMerchant: DuplicateDetectionMerchant;
  totalCandidatesChecked: number;
  candidatesAboveThreshold: DeterministicCandidate[];
  shortlistedCandidates: DeterministicCandidate[];
}

export interface LlmCandidateOpinion {
  candidateMerchantId: string;
  candidateMerchantName: string;
  llmScore: number;
  reasoningSummary: string;
  recommendation: DuplicateRecommendation;
}

export interface LlmReviewResult {
  status: LlmStatus;
  provider: string;
  opinions: LlmCandidateOpinion[];
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string;
  timeoutMs?: number;
  durationMs?: number;
}

export interface FinalDuplicateCandidateResult {
  candidateMerchantId: string;
  candidateMerchantName: string;
  levenshteinScore: number;
  trigramScore: number;
  jaroWinklerScore: number;
  deterministicScore: number;
  llmScore: number | null;
  finalConfidenceScore: number;
  signal: DuplicateSignal;
  recommendation: DuplicateRecommendation;
  llmStatus: LlmStatus;
  llmReason: string | null;
}
