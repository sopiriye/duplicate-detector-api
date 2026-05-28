import { Injectable } from '@nestjs/common';

@Injectable()
export class DuplicateNormalizationService {
  normalizeBusinessName(businessName: string): string {
    // DuplicateNormalizationService normalization flow:
    // Normalize merchant names into a canonical form so deterministic algorithms compare stable text instead of raw user input.
    return businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(
        /\b(limited|ltd|plc|company|co|inc|incorporated|enterprise|enterprises|services?)\b/g,
        ' ',
      )
      .replace(/\b(the|and)\b/g, ' ')
      .replace(/\bnig\b/g, ' nigeria ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
