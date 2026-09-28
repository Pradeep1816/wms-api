import { Controller, Get, Post, Body, Param, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { MergeCustomerService } from '../services/customer-merge.service';
import { MergeCustomerListRequestDto } from '../dto/customer-merge-request.dto';
import { MergeCustomerListDataDto } from '../dto/customer-merge-response.dto';
import { MergePreviewDataDto } from '../dto/customer-merge-preview-response.dto';
import { MergeCustomerPreviewRequestDto } from '../dto/customer-merge-preview-request.dto';
import { MergeCustomerRequestDto } from '../dto/customer-merge-request.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerMergeController {
  constructor(private readonly mergeCustomerService: MergeCustomerService) {}

  @Get(':id/merge')
  @Roles(RolesEnum.BACKEND_USER)
  async getMergeCustomerList(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Query(ValidationPipe) query: MergeCustomerListRequestDto,
  ): Promise<MergeCustomerListDataDto | any> {
    try {
      const result = await this.mergeCustomerService.getMergeCustomerList(locationSlug, customerId, query);
      return ResponseHelper.success(result, 'Merge customers list retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve merge customers');
    }
  }

  @Get(':id/merge-preview')
  @Roles(RolesEnum.BACKEND_USER)
  async getMergePreview(
    @Param('location') locationSlug: string,
    @Param('id') id: number,
    @Query(ValidationPipe) query: MergeCustomerPreviewRequestDto,
  ): Promise<MergePreviewDataDto | any> {
    try {
      const result = await this.mergeCustomerService.getMergePreview(locationSlug, id, query.customerId);
      return ResponseHelper.success(result, 'Merge preview retrieved successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve merge preview');
    }
  }

  @Post(':id/merge')
  @Roles(RolesEnum.BACKEND_USER)
  async mergeCustomer(
    @Param('location') locationSlug: string,
    @Param('id') targetCustomerId: number,
    @Body(ValidationPipe) body: MergeCustomerRequestDto,
  ): Promise<any> {
    try {
      const result = await this.mergeCustomerService.mergeCustomer(
        locationSlug,
        targetCustomerId,
        body.sourceCustomerId,
      );
      return ResponseHelper.success(result, 'Customer merge completed successfully');
    } catch (error) {
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('Cannot merge')) {
        return ResponseHelper.error('VALIDATION_ERROR', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', error.message || 'Failed to execute customer merge');
    }
  }
}


