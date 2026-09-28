import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { AuditTrailListQueryDto } from '../dto/audit-trail-request.dto';
import { AuditTrailQueryService } from '../services/audit-trail-query.service';

@Controller('admin/v2/audit-trail')
@UseGuards(AuthGuard, RolesGuard)
export class AuditTrailController {
  constructor(private readonly auditTrailQueryService: AuditTrailQueryService) {}

  // Returns the paginated global audit trail list for the report UI.
  @Get('entries')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getEntries(@Query(ValidationPipe) query: AuditTrailListQueryDto) {
    try {
      const data = await this.auditTrailQueryService.getEntries(query);
      return ResponseHelper.success(data, 'Audit trail entries retrieved successfully');
    } catch (error) {
      console.error('Error in getEntries controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve audit trail entries',
      );
    }
  }

  // Returns a single audit trail entry so the UI can inspect the raw payload.
  @Get('entries/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getEntryById(@Param('id', ParseIntPipe) id: number) {
    try {
      const data = await this.auditTrailQueryService.getEntryById(id);
      if (!data) {
        return ResponseHelper.errors.NOT_FOUND('Audit trail entry');
      }

      return ResponseHelper.success(data, 'Audit trail entry retrieved successfully');
    } catch (error) {
      console.error('Error in getEntryById controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve audit trail entry',
      );
    }
  }

  // Returns the distinct model types and counts used by the filter chips.
  @Get('model-types')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getModelTypes() {
    try {
      const data = await this.auditTrailQueryService.getModelTypes();
      return ResponseHelper.success(data, 'Audit trail model types retrieved successfully');
    } catch (error) {
      console.error('Error in getModelTypes controller:', error);
      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to retrieve audit trail model types',
      );
    }
  }
}

