import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from 'src/auth/guards/auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RolesEnum } from 'src/auth/enums/roles.enum';
import { LocationId } from 'src/shared/decorators/location-id.decorator';
import { ResponseHelper } from 'src/shared/helpers/response.helper';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/services/auth.service';
import { GroupLessonDiscountService } from '../services/group-lesson-discount.service';
import { GroupLessonDiscountQueryDto } from '../dto/group-lesson-discount-request.dto';
import { EditGroupLessonDiscountDto } from '../dto/edit-group-lesson-discount-request.dto';

@Controller('admin/v2/:location/group-lesson')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class GroupLessonDiscountController {
  constructor(private readonly service: GroupLessonDiscountService) {}

  @Get('apply-discount')
  @Roles(RolesEnum.BACKEND_USER)
  async getGroupLessonDiscount(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: GroupLessonDiscountQueryDto,
  ): Promise<any> {
    try {
      const result = await this.service.getDiscount(
        locationId,
        query.lessonId,
        query.enrolmentId,
      );
      return ResponseHelper.success(result, 'Group lesson discount retrieved successfully');
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to fetch group lesson discount',
      );
    }
  }

  @Put('apply-discount')
  @Roles(RolesEnum.BACKEND_USER)
  async applyGroupLessonDiscount(
    @LocationId() locationId: number,
    @Body(ValidationPipe) body: EditGroupLessonDiscountDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.service.applyDiscount(
        locationId,
        body.lessonId,
        body.enrolmentId,
        body.value,
        body.valueType,
        currentUser.id,
      );
      return ResponseHelper.success(
        {
          lessonId: body.lessonId,
          enrolmentId: body.enrolmentId,
          value: body.value,
          valueType: body.valueType,
        },
        result.message,
      );
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        error.message || 'Failed to apply group lesson discount',
      );
    }
  }
}

