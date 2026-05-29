import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
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

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retrieve merchant details with duplicate-analysis summary',
  })
  @ApiOkResponse({
    description:
      'Merchant profile, verification status, registration timestamp, and duplicate-analysis details returned successfully',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Only admins can view merchant details',
  })
  @ApiNotFoundResponse({ description: 'Merchant not found' })
  getById(@Param('id', new ParseUUIDPipe()) merchantId: string) {
    // MerchantsController detail route:
    // Delegate the merchant detail flow so cache reuse, recomputation, and duplicate-analysis response shaping stay in the service layer.
    return this.merchantsService.getById(merchantId);
  }

  @Post(':id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a pending merchant after admin review',
  })
  @ApiOkResponse({
    description:
      'Merchant status updated from pending review to verified successfully',
  })
  @ApiBadRequestResponse({
    description: 'Validation failed or merchant cannot be verified',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Only admins can verify merchants',
  })
  @ApiNotFoundResponse({ description: 'Merchant not found' })
  @ApiConflictResponse({ description: 'Merchant is already verified' })
  verify(
    @Param('id', new ParseUUIDPipe()) merchantId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    // MerchantsController verification route:
    // Delegate merchant verification so verification state changes and admin attribution stay centralized in the service layer.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.merchantsService.verify(merchantId, currentUser.id);
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
