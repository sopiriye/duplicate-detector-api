import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { MerchantsService } from './merchants.service';

@ApiTags('Merchants')
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a merchant and mark the account as pending review',
  })
  @ApiCreatedResponse({
    description:
      'Merchant registration accepted and marked for admin verification',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({ description: 'Email already exists' })
  register(@Body() registerMerchantDto: RegisterMerchantDto) {
    // MerchantsController registration route:
    // Delegate merchant onboarding to the service so persistence, password hashing, and duplicate-check triggering stay centralized.
    return this.merchantsService.register(registerMerchantDto);
  }
}
