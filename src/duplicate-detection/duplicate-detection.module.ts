import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LlmModule } from '../llm/llm.module';
import { DeterministicMatchingService } from './deterministic-matching.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { DuplicateNormalizationService } from './duplicate-normalization.service';
import { DuplicateScoreService } from './duplicate-score.service';

@Module({
  imports: [DatabaseModule, LlmModule],
  providers: [
    DuplicateDetectionService,
    DuplicateNormalizationService,
    DeterministicMatchingService,
    DuplicateScoreService,
  ],
  exports: [DuplicateDetectionService, DuplicateNormalizationService],
})
export class DuplicateDetectionModule {}
