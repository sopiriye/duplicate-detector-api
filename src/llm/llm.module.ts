import { Module } from '@nestjs/common';
import { OpenAiDuplicateSecondOpinionService } from './openai-duplicate-second-opinion.service';

@Module({
  providers: [OpenAiDuplicateSecondOpinionService],
  exports: [OpenAiDuplicateSecondOpinionService],
})
export class LlmModule {}
