import { Controller, Get, Put, Post, Delete, Param, Body, UseGuards, ValidationPipe, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/services/auth.service';
import { ResponseHelper } from '../../shared/helpers/response.helper';
import { CustomerInfoService } from '../services/customer-info.service';
import { UpdateCustomerInfoDto } from '../dto/update-customer-info.dto';
import { DeleteCustomerInfoDto } from '../dto/delete-customer-info.dto';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerInfoController {
  constructor(private readonly customerInfoService: CustomerInfoService) {}

  @Get(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomerInfo(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<any> {
    try {
      const result = await this.customerInfoService.getCustomerInfo(locationSlug, customerId);
      return ResponseHelper.success(result, 'Customer info retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomerInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer info');
    }
  }

  @Get(':id/enrolment-metadata')
  @Roles(RolesEnum.BACKEND_USER)
  async getEnrolmentMetadata(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
  ): Promise<any> {
    try {
      const result = await this.customerInfoService.getEnrolmentMetadata(locationSlug, customerId);
      return ResponseHelper.success(result, 'Customer enrolment metadata retrieved successfully');
    } catch (error) {
      console.error('Error in getEnrolmentMetadata controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customer enrolment metadata');
    }
  }

  @Put(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async updateCustomerInfo(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Body(ValidationPipe) updateDto: UpdateCustomerInfoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.customerInfoService.update(
        locationSlug,
        customerId,
        updateDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, 'Customer info updated successfully');
    } catch (error) {
      console.error('Error in updateCustomerInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to update customer info');
    }
  }

  @Post(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async createCustomerInfo(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Body(ValidationPipe) createDto: UpdateCustomerInfoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.customerInfoService.create(
        locationSlug,
        customerId,
        createDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, 'Customer info created successfully');
    } catch (error) {
      console.error('Error in createCustomerInfo controller:', error);
      if (error.message.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message.includes('validation')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to create customer info');
    }
  }

  @Delete(':id/info')
  @Roles(RolesEnum.BACKEND_USER)
  async deleteCustomerInfo(
    @Param('location') locationSlug: string,
    @Param('id') customerId: number,
    @Body(ValidationPipe) deleteDto: DeleteCustomerInfoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<any> {
    try {
      const result = await this.customerInfoService.delete(
        locationSlug,
        customerId,
        deleteDto,
        currentUser.id,
      );
      return ResponseHelper.success(result, 'Customer info deleted successfully');
    } catch (error) {
      console.error('Error in deleteCustomerInfo controller:', error);
      if (error instanceof BadRequestException) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      if (error.message?.includes('validation') || error.message?.includes('Cannot delete primary email')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to delete customer info');
    }
  }
}
