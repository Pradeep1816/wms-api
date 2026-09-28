import { Controller, Get, Param, ParseIntPipe, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { EquipmentRentalReprintAgreementService } from '../services/equipment-rental-reprint-agreement.service';
import { EquipmentRentalPrintRequestDto } from '../dto/equipment-rental-print-request.dto';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard,LocationResolveGuard)
export class EquipmentRentalPrintController {
  constructor(
    private readonly equipmentRentalReprintAgreementService: EquipmentRentalReprintAgreementService,
  ) {}

  @Get(':id/equipment-rentals/print-details')
  @Roles(RolesEnum.BACKEND_USER)
  async getEquipmentRentalPrintDetails(
    @LocationId() LocationId: number,
    @Param('id', ParseIntPipe) customerId: number,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: EquipmentRentalPrintRequestDto,
  ): Promise<any> {
    try {
      const result = await this.equipmentRentalReprintAgreementService.getEquipmentRentalPrintDetails(
        LocationId,
        customerId,
        query.rentalId,
      );
      return ResponseHelper.success(result, 'Equipment rental print details retrieved successfully');
    } catch (error) {
      console.error('Error in getEquipmentRentalPrintDetails controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('does not belong')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve equipment rental print details');
    }
  }
}
