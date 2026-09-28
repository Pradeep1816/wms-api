import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { LowStockEmailCronService } from '../services/low-stock-email-cron.service';

@Controller('admin/v2/cron/low-stock-email')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolesEnum.ADMINISTRATOR)
export class LowStockEmailController {
  constructor(private readonly service: LowStockEmailCronService) {}

  @Get()
  async status() {
    return ResponseHelper.success(
      {
        job: this.service.getJobMetadata(),
        alerts: await this.service.getRecentAlerts(),
      },
      'Low-stock email status',
    );
  }

  @Post('run')
  async run() {
    return ResponseHelper.success(
      await this.service.runScheduled(),
      'Due low-stock alerts processed',
    );
  }
}
