import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterMerchantDto {
  @ApiProperty({ example: 'BetaFoods Ltd' })
  @IsString()
  businessName!: string;

  @ApiProperty({ example: 'contact@betafoods.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: UserRole.MERCHANT, enum: UserRole })
  @Equals(UserRole.MERCHANT, { message: 'role must be MERCHANT' })
  role!: UserRole;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'RC1234567' })
  @IsOptional()
  @IsString()
  cacNumber?: string;

  @ApiPropertyOptional({ example: '12 Example Street, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;
}
