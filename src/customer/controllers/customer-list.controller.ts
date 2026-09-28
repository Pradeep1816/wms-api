import { Controller, Get, Query, Param, UseGuards, ValidationPipe } from '@nestjs/common';
import { CustomerListService } from '../services/customer-list.service';
import { CustomerListNewRequestDto } from '../dto/customer-list-request.dto';
import { CustomerListNewResponseDto } from '../dto/customer-list-response.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ResponseHelper } from '../../shared/helpers/response.helper';

@Controller('admin/v2/:location/customers')
@UseGuards(AuthGuard, RolesGuard)
export class CustomerListController {
  constructor(private readonly customerListNewService: CustomerListService) {}

  @Get("list")
  @Roles(RolesEnum.BACKEND_USER)
  async getCustomers(
    @Param('location') locationSlug: string,
    @Query(new ValidationPipe({ transform: true })) query: CustomerListNewRequestDto,
  ): Promise<CustomerListNewResponseDto | any> {
    try {
      const result = await this.customerListNewService.getCustomers(locationSlug, query);
      return ResponseHelper.success(result, 'Customers list retrieved successfully');
    } catch (error) {
      console.error('Error in getCustomers controller:', error);
      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve customers');
    }
  }
}
