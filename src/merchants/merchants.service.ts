import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DuplicateCheckStatus, MerchantStatus } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { DatabaseService } from '../database/database.service';
import { DuplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';
import { DuplicateNormalizationService } from '../duplicate-detection/duplicate-normalization.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { SearchMerchantsQueryDto } from './dto/search-merchants-query.dto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
    private readonly duplicateNormalizationService: DuplicateNormalizationService,
  ) {}

  async register(registerMerchantDto: RegisterMerchantDto) {
    // Merchant registration flow:
    // Normalize the registration email and reject duplicate authentication credentials before creating any records.
    const email = this.normalizeEmail(registerMerchantDto.email);
    const existingUser = await this.databaseService.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Merchant registration flow:
    // Hash the password and create the linked auth user plus merchant profile in a single transaction.
    const passwordHash = await this.passwordService.hash(
      registerMerchantDto.password,
    );
    const merchant = await this.databaseService.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: registerMerchantDto.role,
        },
        select: {
          id: true,
        },
      });

      return await tx.merchant.create({
        data: {
          userId: user.id,
          businessName: registerMerchantDto.businessName.trim(),
          normalizedBusinessName: this.normalizeBusinessName(
            registerMerchantDto.businessName,
          ),
          businessEmail: email,
          phoneNumber: registerMerchantDto.phoneNumber?.trim(),
          cacNumber: registerMerchantDto.cacNumber?.trim(),
          address: registerMerchantDto.address?.trim(),
          status: MerchantStatus.PENDING_REVIEW,
        },
        select: {
          id: true,
          businessName: true,
          status: true,
        },
      });
    });

    // Merchant registration flow:
    // Trigger the duplicate-detection registration orchestration without blocking merchant onboarding when the trigger fails.
    try {
      await this.duplicateDetectionService.runRegistrationCheck(merchant.id);
    } catch (error) {
      this.logger.error(
        `Failed to trigger duplicate detection for merchant ${merchant.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // Merchant registration flow:
    // Return the under-review response payload defined by the SRS for merchant registration.
    return {
      message: 'Merchant registered and pending admin verification',
      merchant,
    };
  }

  async search(searchMerchantsQueryDto: SearchMerchantsQueryDto) {
    // Merchant search flow:
    // Normalize the optional search term once so admin queries can match both raw merchant names and canonical normalized names.
    const searchTerm = searchMerchantsQueryDto.search?.trim();
    const normalizedSearchTerm = searchTerm
      ? this.normalizeBusinessName(searchTerm)
      : undefined;

    // Merchant search flow:
    // Query only lightweight merchant fields needed by the search response and keep results ordered by most recent registration.
    const merchants = await this.databaseService.merchant.findMany({
      where: searchTerm
        ? {
            OR: [
              {
                businessName: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                normalizedBusinessName: {
                  contains: normalizedSearchTerm,
                  mode: 'insensitive',
                },
              },
              {
                businessEmail: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  is: {
                    email: {
                      contains: searchTerm,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      select: {
        id: true,
        businessName: true,
        status: true,
        businessEmail: true,
        createdAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    // Merchant search flow:
    // Map database records into the lightweight SRS result shape without leaking duplicate-analysis details.
    return merchants.map((merchant) => ({
      merchantId: merchant.id,
      businessName: merchant.businessName,
      status: merchant.status,
      email: merchant.businessEmail ?? merchant.user?.email ?? null,
      createdAt: merchant.createdAt,
    }));
  }

  async getById(merchantId: string) {
    // Merchant details lookup flow:
    // Load the merchant profile first so the route can fail clearly when the requested merchant does not exist.
    const merchant = await this.databaseService.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        normalizedBusinessName: true,
        businessEmail: true,
        phoneNumber: true,
        cacNumber: true,
        address: true,
        status: true,
        verifiedAt: true,
        verifiedByUserId: true,
        rejectedAt: true,
        rejectedByUserId: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    // Merchant details cache flow:
    // Recompute duplicate results only when the latest check is missing, failed, or stale because newer merchants were registered later.
    await this.refreshDuplicateResultsIfNeeded(merchant.id);

    // Merchant details response flow:
    // Fetch the latest duplicate-check summary, candidate breakdown, and LLM request metadata for the admin detail response.
    const latestDuplicateCheck =
      await this.databaseService.duplicateCheck.findFirst({
        where: { sourceMerchantId: merchant.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          llmStatus: true,
          deterministicThreshold: true,
          deterministicWeight: true,
          llmWeight: true,
          totalCandidatesChecked: true,
          candidatesAboveThreshold: true,
          candidatesSentToLlm: true,
          errorMessage: true,
          computedAt: true,
          createdAt: true,
          updatedAt: true,
          candidates: {
            orderBy: { finalConfidenceScore: 'desc' },
            select: {
              id: true,
              candidateMerchantId: true,
              levenshteinScore: true,
              trigramScore: true,
              jaroWinklerScore: true,
              deterministicScore: true,
              llmScore: true,
              finalConfidenceScore: true,
              signal: true,
              recommendation: true,
              llmStatus: true,
              llmReason: true,
              createdAt: true,
              candidateMerchant: {
                select: {
                  id: true,
                  businessName: true,
                  status: true,
                  businessEmail: true,
                  createdAt: true,
                },
              },
            },
          },
          llmRequestLogs: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              provider: true,
              status: true,
              errorMessage: true,
              timeoutMs: true,
              durationMs: true,
              createdAt: true,
            },
          },
        },
      });

    return {
      merchant: {
        id: merchant.id,
        businessName: merchant.businessName,
        normalizedBusinessName: merchant.normalizedBusinessName,
        email: merchant.businessEmail ?? merchant.user?.email ?? null,
        phoneNumber: merchant.phoneNumber,
        cacNumber: merchant.cacNumber,
        address: merchant.address,
        status: merchant.status,
        verifiedAt: merchant.verifiedAt,
        verifiedByUserId: merchant.verifiedByUserId,
        rejectedAt: merchant.rejectedAt,
        rejectedByUserId: merchant.rejectedByUserId,
        rejectionReason: merchant.rejectionReason,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
      },
      duplicateCheck: latestDuplicateCheck
        ? {
            id: latestDuplicateCheck.id,
            status: latestDuplicateCheck.status,
            llmStatus: latestDuplicateCheck.llmStatus,
            deterministicThreshold: Number(
              latestDuplicateCheck.deterministicThreshold,
            ),
            deterministicWeight: Number(
              latestDuplicateCheck.deterministicWeight,
            ),
            llmWeight: Number(latestDuplicateCheck.llmWeight),
            totalCandidatesChecked: latestDuplicateCheck.totalCandidatesChecked,
            candidatesAboveThreshold:
              latestDuplicateCheck.candidatesAboveThreshold,
            candidatesSentToLlm: latestDuplicateCheck.candidatesSentToLlm,
            errorMessage: latestDuplicateCheck.errorMessage,
            computedAt: latestDuplicateCheck.computedAt,
            createdAt: latestDuplicateCheck.createdAt,
            updatedAt: latestDuplicateCheck.updatedAt,
            candidates: latestDuplicateCheck.candidates.map((candidate) => ({
              id: candidate.id,
              candidateMerchantId: candidate.candidateMerchantId,
              candidateMerchant: {
                id: candidate.candidateMerchant.id,
                businessName: candidate.candidateMerchant.businessName,
                status: candidate.candidateMerchant.status,
                email: candidate.candidateMerchant.businessEmail,
                createdAt: candidate.candidateMerchant.createdAt,
              },
              deterministicScores: {
                levenshteinScore: Number(candidate.levenshteinScore),
                trigramScore: Number(candidate.trigramScore),
                jaroWinklerScore: Number(candidate.jaroWinklerScore),
                deterministicScore: Number(candidate.deterministicScore),
              },
              llmScore:
                candidate.llmScore === null ? null : Number(candidate.llmScore),
              finalConfidenceScore: Number(candidate.finalConfidenceScore),
              signal: candidate.signal,
              recommendation: candidate.recommendation,
              llmStatus: candidate.llmStatus,
              llmReason: candidate.llmReason,
              createdAt: candidate.createdAt,
            })),
            llmRequests: latestDuplicateCheck.llmRequestLogs.map((log) => ({
              id: log.id,
              provider: log.provider,
              status: log.status,
              errorMessage: log.errorMessage,
              timeoutMs: log.timeoutMs,
              durationMs: log.durationMs,
              createdAt: log.createdAt,
            })),
          }
        : null,
    };
  }

  async verify(merchantId: string, verifiedByUserId: string) {
    // Merchant verification lookup flow:
    // Load the current merchant verification state first so the route can reject invalid verification transitions clearly.
    const merchant = await this.databaseService.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        status: true,
      },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.status === MerchantStatus.VERIFIED) {
      throw new ConflictException('Merchant is already verified');
    }

    if (merchant.status !== MerchantStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only merchants pending review can be verified',
      );
    }

    // Merchant verification persistence flow:
    // Promote the merchant to verified status and persist the admin attribution needed for later review and login authorization.
    const verifiedMerchant = await this.databaseService.merchant.update({
      where: { id: merchantId },
      data: {
        status: MerchantStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedByUserId,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
      },
      select: {
        id: true,
        businessName: true,
        status: true,
        verifiedAt: true,
        verifiedByUserId: true,
      },
    });

    // Merchant verification response flow:
    // Return the minimal verification payload that confirms the merchant is now eligible for login under the auth rules.
    return {
      message: 'Merchant verified successfully',
      merchant: verifiedMerchant,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async refreshDuplicateResultsIfNeeded(
    sourceMerchantId: string,
  ): Promise<void> {
    // Merchant details refresh flow:
    // Inspect the latest duplicate-check state first so detail requests reuse stored results whenever the cache is still current.
    const latestCheck = await this.databaseService.duplicateCheck.findFirst({
      where: { sourceMerchantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        computedAt: true,
      },
    });

    if (
      latestCheck?.status === DuplicateCheckStatus.COMPLETED &&
      latestCheck.computedAt
    ) {
      const newerMerchantCount = await this.databaseService.merchant.count({
        where: {
          id: {
            not: sourceMerchantId,
          },
          createdAt: {
            gt: latestCheck.computedAt,
          },
        },
      });

      if (newerMerchantCount === 0) {
        return;
      }
    } else if (latestCheck?.status === DuplicateCheckStatus.PENDING) {
      return;
    }

    // Merchant details refresh flow:
    // Attempt duplicate recomputation when the cached result is absent, stale, or failed, but do not block the detail response if recomputation fails.
    try {
      await this.duplicateDetectionService.runRegistrationCheck(
        sourceMerchantId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to refresh duplicate detection for merchant ${sourceMerchantId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private normalizeBusinessName(businessName: string): string {
    // Merchant normalization flow:
    // Reuse the shared duplicate-detection normalization rules so registration and search both operate on the same canonical merchant name form.
    return this.duplicateNormalizationService.normalizeBusinessName(
      businessName,
    );
  }
}
