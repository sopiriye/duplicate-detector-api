import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { MerchantStatus } from '@prisma/client';
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeBusinessName(businessName: string): string {
    // Merchant normalization flow:
    // Reuse the shared duplicate-detection normalization rules so registration and search both operate on the same canonical merchant name form.
    return this.duplicateNormalizationService.normalizeBusinessName(
      businessName,
    );
  }
}
