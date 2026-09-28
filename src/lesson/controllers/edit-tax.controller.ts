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
import { EditTaxRequestDto } from '../dto/edit-tax-request.dto';
import { EditTaxService } from '../services/edit-tax.service';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEditTaxController {
  constructor(private readonly editTaxService: EditTaxService) {}

  /**
   * GET current tax value for a single lesson (matches legacy)
   * GET /admin/v2/:location/private-lesson/edit-tax/:id
   */
  @Get('edit-tax/:id')
  @Roles(RolesEnum.BACKEND_USER)
  async getEditTax(
    @LocationId() _locationId: number,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    try {
      const result = await this.editTaxService.getEditTax(id);

      return ResponseHelper.success(result, 'Tax value retrieved successfully');
    } catch (error: any) {
      console.error('Error in getEditTax controller:', error);
      if (error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to get tax for lesson',
      );
    }
  }

  /**
   * UPDATE tax for a single lesson (matches legacy)
   * PUT /admin/v2/:location/private-lesson/edit-tax
   */
  @Put('edit-tax')
  @Roles(RolesEnum.BACKEND_USER)
  async editTax(
    @Param('location') locationSlug: string,
    @LocationId() _locationId: number,
    @Body(ValidationPipe) body: EditTaxRequestDto,
  ): Promise<any> {
    try {
      const result = await this.editTaxService.editTax(body, locationSlug);

      return ResponseHelper.success(
        { body: { tax: result.tax } },
        'Tax updated successfully',
      );
    } catch (error: any) {
      console.error('Error in editTax controller:', error);
      if (error.status === 404) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to edit tax for lesson',
      );
    }
  }
}
