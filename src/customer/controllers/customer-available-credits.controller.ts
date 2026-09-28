import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { AvailableCreditsService } from '../../invoice/services/available-credits.service';
import { AvailableCreditsRequestDto } from '../../invoice/dto/available-credits-request.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerAvailableCreditsController {
  constructor(private readonly availableCreditsService: AvailableCreditsService) {}

  @Get(':id/available-credits')
  @Roles(RolesEnum.BACKEND_USER)
  async getAvailableCredits(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: AvailableCreditsRequestDto,
  ): Promise<any> {
    try {
      const result = await this.availableCreditsService.getAvailableCredits(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Available credits retrieved successfully');
    } catch (error) {
      console.error('Error in getAvailableCredits controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve available credits');
    }
  }
}


