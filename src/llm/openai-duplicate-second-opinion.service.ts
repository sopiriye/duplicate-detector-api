import { Injectable, Logger } from '@nestjs/common';
import { DuplicateRecommendation, LlmStatus } from '@prisma/client';
import OpenAI from 'openai';
import {
  OPENAI_MODEL_FALLBACK,
  OPENAI_PROVIDER,
  OPENAI_TIMEOUT_MS,
} from '../duplicate-detection/duplicate-detection.constants';
import {
  DuplicateDetectionMerchant,
  LlmCandidateOpinion,
  LlmReviewResult,
} from '../duplicate-detection/interfaces/duplicate-detection.interfaces';

@Injectable()
export class OpenAiDuplicateSecondOpinionService {
  private readonly logger = new Logger(
    OpenAiDuplicateSecondOpinionService.name,
  );

  async reviewShortlistedCandidates(
    sourceMerchant: DuplicateDetectionMerchant,
    candidates: Array<{
      candidateMerchantId: string;
      candidateMerchantName: string;
      deterministicScore: number;
    }>,
  ): Promise<LlmReviewResult> {
    // OpenAiDuplicateSecondOpinionService preflight flow:
    // Skip the OpenAI call cleanly when there are no shortlisted candidates or no API key is configured.
    if (!candidates.length) {
      return {
        status: LlmStatus.SKIPPED_NO_CANDIDATES,
        provider: OPENAI_PROVIDER,
        opinions: [],
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        status: LlmStatus.SKIPPED_DISABLED,
        provider: OPENAI_PROVIDER,
        opinions: [],
        errorMessage: 'OPENAI_API_KEY is not configured',
      };
    }

    // OpenAiDuplicateSecondOpinionService request flow:
    // Build the structured OpenAI request so the model can evaluate only the shortlisted deterministic candidates.
    const client = new OpenAI({ apiKey });
    const timeoutMs = Number(
      process.env.OPENAI_TIMEOUT_MS ?? OPENAI_TIMEOUT_MS,
    );
    const requestPayload = this.buildRequestPayload(sourceMerchant, candidates);
    const startedAt = Date.now();
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await client.responses.create(requestPayload as never, {
        signal: abortController.signal,
      });
      clearTimeout(timeoutHandle);

      const outputText = this.extractOutputText(response);
      if (!outputText) {
        throw new Error('OpenAI returned no structured output text');
      }

      const parsedOpinions = this.parseOutput(outputText, candidates);

      return {
        status: LlmStatus.COMPLETED,
        provider: OPENAI_PROVIDER,
        opinions: parsedOpinions,
        requestPayload,
        responsePayload: response,
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      clearTimeout(timeoutHandle);
      const timedOut = error instanceof Error && error.name === 'AbortError';
      const status = timedOut ? LlmStatus.TIMEOUT : LlmStatus.FAILED;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown OpenAI error';

      this.logger.warn(
        `OpenAI duplicate second opinion ${status.toLowerCase()} for merchant ${sourceMerchant.id}: ${errorMessage}`,
      );

      return {
        status,
        provider: OPENAI_PROVIDER,
        opinions: [],
        requestPayload,
        errorMessage,
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private buildRequestPayload(
    sourceMerchant: DuplicateDetectionMerchant,
    candidates: Array<{
      candidateMerchantId: string;
      candidateMerchantName: string;
      deterministicScore: number;
    }>,
  ) {
    return {
      model: process.env.OPENAI_MODEL ?? OPENAI_MODEL_FALLBACK,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You are a duplicate-detection second opinion engine.',
                'Return only JSON that matches the supplied schema.',
                'Evaluate only the provided shortlisted candidates.',
                'All llmScore values must be between 0 and 1.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                sourceMerchant: {
                  id: sourceMerchant.id,
                  businessName: sourceMerchant.businessName,
                  normalizedBusinessName: sourceMerchant.normalizedBusinessName,
                },
                candidates,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'duplicate_second_opinion',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              candidates: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    candidateMerchantId: { type: 'string' },
                    candidateMerchantName: { type: 'string' },
                    llmScore: { type: 'number' },
                    reasoningSummary: { type: 'string' },
                    recommendation: {
                      type: 'string',
                      enum: [
                        DuplicateRecommendation.LIKELY_DUPLICATE,
                        DuplicateRecommendation.REVIEW,
                        DuplicateRecommendation.WEAK_MATCH,
                        DuplicateRecommendation.NO_MATCH,
                      ],
                    },
                  },
                  required: [
                    'candidateMerchantId',
                    'candidateMerchantName',
                    'llmScore',
                    'reasoningSummary',
                    'recommendation',
                  ],
                },
              },
            },
            required: ['candidates'],
          },
        },
      },
    };
  }

  private extractOutputText(response: unknown): string | null {
    const responseRecord = response as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };

    if (responseRecord.output_text) {
      return responseRecord.output_text;
    }

    return responseRecord.output?.[0]?.content?.[0]?.text ?? null;
  }

  private parseOutput(
    outputText: string,
    candidates: Array<{
      candidateMerchantId: string;
      candidateMerchantName: string;
      deterministicScore: number;
    }>,
  ): LlmCandidateOpinion[] {
    const parsedOutput = JSON.parse(outputText) as {
      candidates?: Array<{
        candidateMerchantId?: string;
        candidateMerchantName?: string;
        llmScore?: number;
        reasoningSummary?: string;
        recommendation?: DuplicateRecommendation;
      }>;
    };

    const allowedCandidateIds = new Set(
      candidates.map((candidate) => candidate.candidateMerchantId),
    );

    return (parsedOutput.candidates ?? [])
      .filter(
        (candidate) =>
          candidate.candidateMerchantId &&
          allowedCandidateIds.has(candidate.candidateMerchantId),
      )
      .map((candidate) => ({
        candidateMerchantId: candidate.candidateMerchantId as string,
        candidateMerchantName: candidate.candidateMerchantName ?? '',
        llmScore: this.clampScore(candidate.llmScore ?? 0),
        reasoningSummary: candidate.reasoningSummary ?? '',
        recommendation:
          candidate.recommendation ?? DuplicateRecommendation.REVIEW,
      }));
  }

  private clampScore(score: number): number {
    return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
  }
}
