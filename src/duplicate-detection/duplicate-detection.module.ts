import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Module({
  imports: [DatabaseModule],
  providers: [DuplicateDetectionService],
  exports: [DuplicateDetectionService],
})
export class DuplicateDetectionModule {}
