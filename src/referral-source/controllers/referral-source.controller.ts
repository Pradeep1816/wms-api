import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UnauthorizedException, UseGuards, ValidationPipe } from '@nestjs/common';
import { ReferralSourceService } from '../services/referral-source.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { ReferralSourceListResponseDto } from '../dto/referral-source.dto';
import { ReferralSourceRequestDto } from '../dto/referral-source-request.dto';
import { CreateReferralSourceRequestDto } from '../dto/create-referral-source-request.dto';
import { UpdateReferralSourceRequestDto } from '../dto/update-referral-source-request.dto';

@Controller('admin/v2/referral-sources')
@UseGuards(AuthGuard, RolesGuard)
export class ReferralSourceController {
  constructor(private readonly referralSourceService: ReferralSourceService) {}

  @Get()
  @Roles(RolesEnum.BACKEND_USER)
  async getReferralSources(
    @Query(ValidationPipe) query: ReferralSourceRequestDto
  ): Promise<ReferralSourceListResponseDto | any> {
    try {
      const referralSources = await this.referralSourceService.getReferralSources(
      query.sort,
      query.order
      );
      return ResponseHelper.success(referralSources, 'Referral sources retrieved successfully');
    } catch (error) {
      console.error('Error in getReferralSources controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve referral sources');
    }
  }
  @Post()
@Roles(RolesEnum.ADMINISTRATOR)
async createReferralSource(
  @Req() req: any,
  @Body(ValidationPipe) createDto: CreateReferralSourceRequestDto,
): Promise<any> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.referralSourceService.createReferralSource(
      userId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Referral source created successfully',
    );

  } catch (error) {
    console.error('Error in createReferralSource controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('required') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('already exists')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create referral source',
    );
  }
}
@Put(':id')
@Roles(RolesEnum.ADMINISTRATOR)
async updateReferralSource(
  @Req() req: any,
  @Param('id') id: number,
  @Body(ValidationPipe) updateDto: UpdateReferralSourceRequestDto,
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.referralSourceService.updateReferralSource(
      id,
      userId,
      updateDto,
    );

    return ResponseHelper.success(
      result,
      'Referral source updated successfully',
    );

  } catch (error) {
    console.error('Error in updateReferralSource controller:', error);
    return ResponseHelper.error('BAD_REQUEST', error.message);
  }
}
@Delete(':id')
@Roles(RolesEnum.ADMINISTRATOR)
async deleteReferralSource(
  @Req() req: any,
  @Param('id') id: number,
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    const result = await this.referralSourceService.deleteReferralSource(
      id,
      userId,
    );

    return ResponseHelper.success(
      result,
      'Referral source deleted successfully',
    );

  } catch (error) {
    console.error('Error in deleteReferralSource controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('validation') ||
      error.message?.includes('Invalid')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to delete referral source',
    );
  }
}


}
