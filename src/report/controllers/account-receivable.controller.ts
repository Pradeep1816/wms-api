import { Controller, Get, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { AccountReceivableRequestDto } from '../dto/account-receivable-dto/account-receivable-request.dto';
import { AccountReceivableResponseDto } from '../dto/account-receivable-dto/account-receivable-response.dto';
import { AccountReceivableService } from '../services/account-receivable.service';

@Controller('admin/v2/:location/report')
@UseGuards(AuthGuard, RolesGuard)
export class AccountReceivableController {
  constructor(private readonly accountReceivableService: AccountReceivableService) {}

  @Get('account-receivable')
  @Roles(RolesEnum.BACKEND_USER)
  async getAccountReceivable(
    @Param('location') locationSlug: string,
    @Query(ValidationPipe) query: AccountReceivableRequestDto,
  ): Promise<AccountReceivableResponseDto | any> {
    try {
      const report = await this.accountReceivableService.getAccountReceivable(
        locationSlug,
        query.showAllActive,
        query.showAllInActive,
        query.page,
        query.limit,
      );
      return ResponseHelper.success(report, 'Account receivable report retrieved successfully');
    } catch (error) {
      console.log(error);
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve account receivable report');
    }
  }
}
