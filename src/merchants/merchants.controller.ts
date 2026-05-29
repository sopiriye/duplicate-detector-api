import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { SearchMerchantsQueryDto } from './dto/search-merchants-query.dto';
import { MerchantsService } from './merchants.service';

@ApiTags('Merchants')
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchantsService: MerchantsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search merchants with lightweight admin results',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Optional merchant business name or email search term',
  })
  @ApiOkResponse({
    description:
      'Matching merchants returned without duplicate-analysis details',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Only admins can search merchants',
  })
  search(@Query() searchMerchantsQueryDto: SearchMerchantsQueryDto) {
    // MerchantsController search route:
    // Delegate the admin merchant search flow so filtering and response shaping stay centralized in the service layer.
    return this.merchantsService.search(searchMerchantsQueryDto);
  }

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
