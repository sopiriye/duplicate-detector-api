import { Injectable, Logger } from '@nestjs/common';
import { DuplicateCheckStatus, LlmStatus } from '@prisma/client';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async runRegistrationCheck(sourceMerchantId: string): Promise<void> {
    // DuplicateDetectionService registration trigger flow:
    // Persist the initial duplicate-check run as soon as merchant registration completes so later scoring epics can build on a recorded run.
    await this.databaseService.duplicateCheck.create({
      data: {
        sourceMerchantId,
        status: DuplicateCheckStatus.PENDING,
        llmStatus: LlmStatus.SKIPPED_DISABLED,
      },
    });

    // DuplicateDetectionService registration trigger flow:
    // Log the registration-time orchestration step so the team can trace that duplicate detection was triggered for the merchant.
    this.logger.log(
      `Duplicate detection triggered for merchant ${sourceMerchantId}`,
    );
  }
}
