import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { EditPrivateLessonDiscountDto } from '../dto/private-lesson-action-dto/edit-private-lesson-discount.dto';
import { EditDiscountService } from '../services/private-lesson-actions/edit-discount.service';
import { GetEditDiscountQueryDto } from '../dto/private-lesson-action-dto/get-edit-discount-request.dto';

@Controller('admin/v2/:location/private-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class PrivateLessonEditDiscountController {
  constructor(private readonly editDiscountService: EditDiscountService) {}


  @Get('apply-discount')
  @Roles(RolesEnum.BACKEND_USER)
  async getEditDiscount(
    @Req() req: any,
    @LocationId() _locationId: number,
    @Query(ValidationPipe) query: GetEditDiscountQueryDto,
  ): Promise<any> {
    try {
      if (!req.user?.id) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.editDiscountService.getEditDiscount(query.lessonIds);

      return ResponseHelper.success(result, 'Discount values retrieved successfully');
    } catch (error: any) {
      console.error('Error in getEditDiscount controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to get discount for lessons',
      );
    }
  } 

  /**
   * Bulk edit discount for selected private lessons.
   */
  @Put('apply-discount')
  @Roles(RolesEnum.BACKEND_USER)
  async editDiscount(
    @Req() req: any,
    @Param('location') locationSlug: string,
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: EditPrivateLessonDiscountDto,
  ): Promise<any> {
    try {
      if (!req.user?.id) {
        return ResponseHelper.error('UNAUTHORIZED', 'User not found');
      }

      const result = await this.editDiscountService.editDiscount(
        body,
        locationId,
        locationSlug,
        req.user.id,
      );

      if (!result.status) {
        return ResponseHelper.error(
          'BAD_REQUEST',
          result.message || 'Failed to edit discount',
        );
      }

      return ResponseHelper.success(
        { lessonIds: body.lessonIds },
        result.message || 'Discount updated successfully',
      );
    } catch (error: any) {
      console.error('Error in editDiscount controller:', error);
      if (error.status === 403) {
        return ResponseHelper.error('FORBIDDEN', error.message);
      }
      return ResponseHelper.error(
        'BAD_REQUEST',
        error.message || 'Failed to edit discount for lessons',
      );
    }
  }
}
