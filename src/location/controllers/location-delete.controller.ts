import {
  Controller,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from '../../shared/guards/location.guard';
import { LocationId } from '../../shared/decorators/location-id.decorator';
import { LocationDeleteService } from '../services/location-delete.service';

/**
 * Delete location (soft delete only).
 * DELETE /admin/v2/:location/location-delete
 * Only administrator role is allowed.
 */
@Controller('admin/v2/location')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class LocationDeleteController {
  constructor(
    private readonly locationDeleteService: LocationDeleteService,
  ) { }

  @Delete('delete')
  @Roles(RolesEnum.ADMINISTRATOR)
  async deleteLocation(
    @Query('id') id: number
  ) {
    try {
     const location= await this.locationDeleteService.deleteLocation(id);

      return ResponseHelper.success(
        location,
        'Location has been deleted successfully',
      );
    } catch (error) {
      console.error('Error deleting location', error.stack || error.message);
      throw error;
    }
  }
}
