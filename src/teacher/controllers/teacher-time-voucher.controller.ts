import { Controller, Get, NotFoundException, BadRequestException, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LocationResolveGuard } from 'src/shared/guards/location.guard';
import { TeacherTimeVoucherRequestDto } from '../dto/teacher-time-voucher-request.dto';
import { TeacherTimeVoucherService } from '../services/teacher-time-voucher.service';

@Controller('admin/v2/:location/teachers')
@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
export class TeacherTimeVoucherController {
  constructor(
    private readonly teacherTimeVoucherService: TeacherTimeVoucherService,
  ) {}

  @Get(':id/time-voucher')
  @Roles(RolesEnum.BACKEND_USER)
  async getTeacherTimeVoucher(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query(ValidationPipe) query: TeacherTimeVoucherRequestDto,
  ) {
    try {
      const timeVoucher = await this.teacherTimeVoucherService.getTeacherTimeVoucher(
        locationSlug,
        id,
        query.startDate,
        query.endDate,
        query.summaryOnly,
      );

      return ResponseHelper.success(timeVoucher, 'Teacher time voucher retrieved successfully');
    } catch (error) {
      console.error('Error in teacher time voucher controller:', error);

      if (error instanceof NotFoundException) {
        return ResponseHelper.errors.NOT_FOUND(error.message);
      }

      if (error instanceof BadRequestException) {
        return ResponseHelper.errors.BAD_REQUEST(error.message);
      }

      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve teacher time voucher');
    }
  }
}

