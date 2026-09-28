import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LocationGeodataService } from '../services/location-geodata.service';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationGeodataResponseDto } from '../dto/location-geodata.dto';

@Controller('admin/v2')
@UseGuards(AuthGuard, RolesGuard)
export class LocationGeodataController {
  constructor(private readonly locationGeodataService: LocationGeodataService) {}

  @Get('locations-geodata')
  @Roles(RolesEnum.BACKEND_USER)
  async getLocationGeodata(@Query('type') type?: string) {
    try {
      const data = await this.locationGeodataService.getGeodataByType(type);
      return ResponseHelper.success(data, 'Location geodata retrieved successfully');
    } catch (error) {
      console.error('Error in getLocationGeodata controller:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve location geodata');
    }
  }
}
