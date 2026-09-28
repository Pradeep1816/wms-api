import {
  Body,
  Controller,
  Put,
  UseGuards,
  ValidationPipe,
  Req,
  Post,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { UpdateLocationRequestDto } from '../dto/update-location-request.dto';
import { LocationUpdateService } from '../services/location-update.service';
import { LocationHstRequestDto } from '../dto/location-hst-request.dto';
import { LocationHstService } from '../services/location-hst.service';
import { LocationLegalCorporateNameRequestDto } from '../dto/location-legal-corporate-name-request.dto';
import { LocationLegalCorporateNameService } from '../services/location-legal-corporate-name.service';

/**
 * Update location basic details and debt (royalty/advertisement).
 */
@Controller('admin/v2/:location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LocationUpdateController {

  constructor(
    private readonly locationUpdateService: LocationUpdateService,
    private readonly locationHstService: LocationHstService,
    private readonly locationLegalCorporateNameService: LocationLegalCorporateNameService,
  ) {}

  @Put('location-update')
  @Roles(RolesEnum.ADMINISTRATOR)
  async updateLocation(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateLocationRequestDto,
    @Req() req: any,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not authenticated');
      }

      const data = await this.locationUpdateService.updateLocation(
        locationId,
        dto,
        userId,
      );

      return ResponseHelper.success(
        data,
        'Location updated successfully',
      );
    } catch (error) {
      console.error('Error updating location', error.stack || error.message);
      throw error;
    }
  }

  @Post('hst-update')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateHstRegistrationNo(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: LocationHstRequestDto,
  ) {
    try {
      const data = await this.locationHstService.updateHstRegistrationNo(locationId, dto.hst);
      return ResponseHelper.success('HST registration number updated successfully');
    } catch (error) {
      console.error('Error updating HST registration number', error.stack || error.message);
      throw error;
    }
  }

  @Post('legal-corporate-name-update')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateLegalCorporateName(
    @LocationId() locationId: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: LocationLegalCorporateNameRequestDto,
  ) {
    const data =
      await this.locationLegalCorporateNameService.updateLegalCorporateName(
        locationId,
        dto.legalCorporateName,
      );

    return ResponseHelper.success(
      data,
      'Legal Corporate Name updated successfully',
    );
  }
}
