import {
  DuplicateRecommendation,
  DuplicateSignal,
  LlmStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import {
  DETERMINISTIC_WEIGHT,
  LLM_WEIGHT,
} from './duplicate-detection.constants';
import {
  DeterministicCandidate,
  FinalDuplicateCandidateResult,
  LlmCandidateOpinion,
} from './interfaces/duplicate-detection.interfaces';

@Injectable()
export class DuplicateScoreService {
  mergeCandidateResult(
    candidate: DeterministicCandidate,
    llmOpinion: LlmCandidateOpinion | undefined,
    fallbackStatus: LlmStatus,
  ): FinalDuplicateCandidateResult {
    // DuplicateScoreService merge flow:
    // Combine deterministic and LLM evidence into one persisted result while preserving fallback behavior when LLM output is absent.
    const llmScore = llmOpinion ? this.roundScore(llmOpinion.llmScore) : null;
    const finalConfidenceScore =
      llmScore === null
        ? candidate.deterministicScore
        : this.roundScore(
            candidate.deterministicScore * DETERMINISTIC_WEIGHT +
              llmScore * LLM_WEIGHT,
          );

    return {
      candidateMerchantId: candidate.candidateMerchantId,
      candidateMerchantName: candidate.candidateMerchantName,
      levenshteinScore: candidate.levenshteinScore,
      trigramScore: candidate.trigramScore,
      jaroWinklerScore: candidate.jaroWinklerScore,
      deterministicScore: candidate.deterministicScore,
      llmScore,
      finalConfidenceScore,
      signal:
        llmScore === null
          ? DuplicateSignal.DETERMINISTIC
          : DuplicateSignal.BOTH,
      recommendation: this.buildRecommendation(finalConfidenceScore),
      llmStatus: llmScore === null ? fallbackStatus : LlmStatus.COMPLETED,
      llmReason: llmOpinion?.reasoningSummary ?? null,
    };
  }

  private buildRecommendation(
    finalConfidenceScore: number,
  ): DuplicateRecommendation {
    // DuplicateScoreService recommendation flow:
    // Translate the final confidence score into the approved review recommendation bands from the SRS.
    if (finalConfidenceScore >= 0.85) {
      return DuplicateRecommendation.LIKELY_DUPLICATE;
    }

    if (finalConfidenceScore >= 0.7) {
      return DuplicateRecommendation.REVIEW;
    }

    if (finalConfidenceScore >= 0.6) {
      return DuplicateRecommendation.WEAK_MATCH;
    }

    return DuplicateRecommendation.NO_MATCH;
  }

  private roundScore(score: number): number {
    return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  }
}
