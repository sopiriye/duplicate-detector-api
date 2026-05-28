import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  DETERMINISTIC_THRESHOLD,
  DUPLICATE_SHORTLIST_LIMIT,
} from './duplicate-detection.constants';
import {
  DeterministicCandidate,
  DeterministicEvaluationResult,
  DuplicateDetectionMerchant,
} from './interfaces/duplicate-detection.interfaces';
import { DuplicateNormalizationService } from './duplicate-normalization.service';

@Injectable()
export class DeterministicMatchingService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly duplicateNormalizationService: DuplicateNormalizationService,
  ) {}

  async evaluate(
    sourceMerchantId: string,
  ): Promise<DeterministicEvaluationResult> {
    // DeterministicMatchingService source loading flow:
    // Load the source merchant and the comparison pool required for deterministic duplicate evaluation.
    const sourceMerchant = await this.databaseService.merchant.findUnique({
      where: { id: sourceMerchantId },
      select: {
        id: true,
        businessName: true,
        normalizedBusinessName: true,
        businessEmail: true,
        createdAt: true,
        status: true,
      },
    });

    if (!sourceMerchant) {
      throw new NotFoundException(`Merchant ${sourceMerchantId} was not found`);
    }

    const comparisonMerchants = await this.databaseService.merchant.findMany({
      where: {
        NOT: {
          id: sourceMerchantId,
        },
      },
      select: {
        id: true,
        businessName: true,
        normalizedBusinessName: true,
        createdAt: true,
        status: true,
      },
    });

    // DeterministicMatchingService scoring flow:
    // Compute the three required deterministic similarity scores for each existing merchant and rank only threshold-passing candidates.
    const normalizedSourceName = this.getNormalizedName(sourceMerchant);
    const scoredCandidates = comparisonMerchants
      .map((candidate) => this.scoreCandidate(normalizedSourceName, candidate))
      .filter(
        (candidate) => candidate.deterministicScore >= DETERMINISTIC_THRESHOLD,
      )
      .sort(
        (left, right) => right.deterministicScore - left.deterministicScore,
      );

    // DeterministicMatchingService shortlist flow:
    // Limit the LLM shortlist to the strongest deterministic candidates while preserving the full threshold-passing count for storage metrics.
    return {
      sourceMerchant: sourceMerchant,
      totalCandidatesChecked: comparisonMerchants.length,
      candidatesAboveThreshold: scoredCandidates,
      shortlistedCandidates: scoredCandidates.slice(
        0,
        DUPLICATE_SHORTLIST_LIMIT,
      ),
    };
  }

  private scoreCandidate(
    normalizedSourceName: string,
    candidate: DuplicateDetectionMerchant,
  ): DeterministicCandidate {
    const normalizedCandidateName = this.getNormalizedName(candidate);
    const levenshteinScore = this.computeLevenshteinSimilarity(
      normalizedSourceName,
      normalizedCandidateName,
    );
    const trigramScore = this.computeTrigramSimilarity(
      normalizedSourceName,
      normalizedCandidateName,
    );
    const jaroWinklerScore = this.computeJaroWinklerSimilarity(
      normalizedSourceName,
      normalizedCandidateName,
    );
    const deterministicScore = this.roundScore(
      (levenshteinScore + trigramScore + jaroWinklerScore) / 3,
    );

    return {
      candidateMerchantId: candidate.id,
      candidateMerchantName: candidate.businessName,
      levenshteinScore,
      trigramScore,
      jaroWinklerScore,
      deterministicScore,
    };
  }

  private getNormalizedName(
    merchant: Pick<
      DuplicateDetectionMerchant,
      'businessName' | 'normalizedBusinessName'
    >,
  ): string {
    return merchant.normalizedBusinessName?.trim()
      ? merchant.normalizedBusinessName
      : this.duplicateNormalizationService.normalizeBusinessName(
          merchant.businessName,
        );
  }

  private computeLevenshteinSimilarity(left: string, right: string): number {
    const maxLength = Math.max(left.length, right.length);

    if (maxLength === 0) {
      return 1;
    }

    const matrix = Array.from({ length: left.length + 1 }, () =>
      Array<number>(right.length + 1).fill(0),
    );

    for (let row = 0; row <= left.length; row += 1) {
      matrix[row][0] = row;
    }

    for (let column = 0; column <= right.length; column += 1) {
      matrix[0][column] = column;
    }

    for (let row = 1; row <= left.length; row += 1) {
      for (let column = 1; column <= right.length; column += 1) {
        const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
        matrix[row][column] = Math.min(
          matrix[row - 1][column] + 1,
          matrix[row][column - 1] + 1,
          matrix[row - 1][column - 1] + substitutionCost,
        );
      }
    }

    return this.roundScore(1 - matrix[left.length][right.length] / maxLength);
  }

  private computeTrigramSimilarity(left: string, right: string): number {
    const leftTrigrams = this.buildTrigrams(left);
    const rightTrigrams = this.buildTrigrams(right);

    if (leftTrigrams.length === 0 && rightTrigrams.length === 0) {
      return 1;
    }

    const rightMatches = [...rightTrigrams];
    let intersection = 0;

    for (const trigram of leftTrigrams) {
      const index = rightMatches.indexOf(trigram);

      if (index >= 0) {
        intersection += 1;
        rightMatches.splice(index, 1);
      }
    }

    return this.roundScore(
      (2 * intersection) / (leftTrigrams.length + rightTrigrams.length),
    );
  }

  private buildTrigrams(value: string): string[] {
    const padded = `  ${value}  `;

    if (padded.length < 3) {
      return [padded];
    }

    const trigrams: string[] = [];
    for (let index = 0; index <= padded.length - 3; index += 1) {
      trigrams.push(padded.slice(index, index + 3));
    }

    return trigrams;
  }

  private computeJaroWinklerSimilarity(left: string, right: string): number {
    if (left === right) {
      return 1;
    }

    if (!left.length || !right.length) {
      return 0;
    }

    const matchDistance = Math.max(
      Math.floor(Math.max(left.length, right.length) / 2) - 1,
      0,
    );
    const leftMatches = Array<boolean>(left.length).fill(false);
    const rightMatches = Array<boolean>(right.length).fill(false);
    let matches = 0;

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      const start = Math.max(0, leftIndex - matchDistance);
      const end = Math.min(leftIndex + matchDistance + 1, right.length);

      for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
        if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) {
          continue;
        }

        leftMatches[leftIndex] = true;
        rightMatches[rightIndex] = true;
        matches += 1;
        break;
      }
    }

    if (matches === 0) {
      return 0;
    }

    let transpositions = 0;
    let rightCursor = 0;

    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
      if (!leftMatches[leftIndex]) {
        continue;
      }

      while (!rightMatches[rightCursor]) {
        rightCursor += 1;
      }

      if (left[leftIndex] !== right[rightCursor]) {
        transpositions += 1;
      }

      rightCursor += 1;
    }

    const jaro =
      (matches / left.length +
        matches / right.length +
        (matches - transpositions / 2) / matches) /
      3;

    let prefixLength = 0;
    const prefixLimit = Math.min(4, left.length, right.length);
    while (
      prefixLength < prefixLimit &&
      left[prefixLength] === right[prefixLength]
    ) {
      prefixLength += 1;
    }

    return this.roundScore(jaro + prefixLength * 0.1 * (1 - jaro));
  }

  private roundScore(score: number): number {
    return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  }
}

// i will not review the deterministic algorithm implementation itself now since it's based on well-known string similarity metrics, but I will review them later if needed.

// The DeterministicMatchingService is designed to evaluate a source merchant against existing merchants using three string similarity metrics: Levenshtein, Trigram, and Jaro-Winkler. It computes a composite deterministic score and shortlists candidates that exceed a defined threshold for further LLM evaluation.
