import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class SearchMerchantsQueryDto {
  @ApiPropertyOptional({
    example: 'Beta Foods',
    description:
      'Optional admin search term for merchant business name or email',
  })
  @IsOptional()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  search?: string;
}
