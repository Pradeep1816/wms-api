import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { RoyaltyAuditRequestDto } from '../dto/royalty-audit/royalty-audit.request.dto';
import { RoyaltyAuditService } from '../services/royalty-audit.service';

@Controller('admin/v2/:location/report/royalty-audit')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RolesEnum.ADMINISTRATOR)
export class RoyaltyAuditController {
  constructor(private readonly royaltyAuditService: RoyaltyAuditService) {}

  @Get()
  async getEntries(
    @Param('location') locationSlug: string,
    @Query(new ValidationPipe({ transform: true }))
    query: RoyaltyAuditRequestDto,
  ) {
    try {
      const data = await this.royaltyAuditService.getEntries(locationSlug, query);
      return ResponseHelper.success(
        data,
        'Royalty audit entries retrieved successfully',
      );
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve royalty audit entries',
      );
    }
  }
}
