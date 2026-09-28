import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { BirthdaysReportService } from '../services/student-birthdays-report.service';
import { BirthdaysRequestDto } from '../dto/student-birthday-dto/birthdays.request.dto';
import { BirthdaysResponseDto } from '../dto/student-birthday-dto/birthdays.response.dto';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class BirthdaysReportController {
  constructor(private readonly birthdaysReportService: BirthdaysReportService) {}

  @Get('student-birthday')
  @Roles(RolesEnum.BACKEND_USER)
  async getBirthdays(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: BirthdaysRequestDto,
  ) {
    try {
      const data = await this.birthdaysReportService.getStudentBirthdays(locationSlug, query.startDate, query.endDate, query.page, query.limit);
      return ResponseHelper.success(data, 'Birthdays report retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve birthdays report');
    }
  }
}



