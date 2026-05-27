import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { MerchantStatus } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { DatabaseService } from '../database/database.service';
import { DuplicateDetectionService } from '../duplicate-detection/duplicate-detection.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';

@Injectable()
export class MerchantsService {
  private readonly logger = new Logger(MerchantsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly duplicateDetectionService: DuplicateDetectionService,
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

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeBusinessName(businessName: string): string {
    // Merchant registration normalization flow:
    // Seed the stored normalized business name now so later duplicate-detection epics can compare against a stable canonical value.
    return businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(limited|ltd|company|co|inc|plc|incorporated)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
