import {
  Body,
  Controller,
  Get,
  Put,
  Param,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { EditPriceRequestDto } from '../dto/edit-price-request.dto';
import { EditPriceService } from '../services/edit-price.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEditPriceController {
  constructor(private readonly editPriceService: EditPriceService) {}

  /**
   * GET current program rate for a single lesson (matches legacy)
   * GET /admin/v2/:location/private-lesson/edit-price/:id
   */
  @Get('edit-price/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getEditPrice(
    @LocationId() _locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    try {
      const result = await this.editPriceService.getEditPrice(id);

      return ResponseHelper.success(result, 'Program rate retrieved successfully');
    } catch (error: any) {
      console.error('Error in getEditPrice controller:', error);
      if (error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to get program rate for lesson',
      );
    }
  }

  /**
   * UPDATE program rate for a single lesson (matches legacy)
   * Admin-only access
   * PUT /admin/v2/:location/private-lesson/edit-price
   */
  @Put('edit-price')
  @Roles(RolesEnum.ADMINISTRATOR)
  async editPrice(
    @Param('location') locationSlug: string,
    @LocationId() _locationId: number,
    @Body(ValidationPipe) body: EditPriceRequestDto,
  ): Promise<any> {
    try {
      const result = await this.editPriceService.editPrice(body, locationSlug);

      return ResponseHelper.success(result, 'Program rate updated successfully');
    } catch (error: any) {
      console.error('Error in editPrice controller:', error);
      if (error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to edit program rate for lesson',
      );
    }
  }
}
