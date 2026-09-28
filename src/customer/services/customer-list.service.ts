import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomersRepository } from '../repositories/customer-list.repository';
import { CustomerListNewRequestDto } from '../dto/customer-list-request.dto';
import { CustomerListNewDataDto, CustomerListNewItemDto } from '../dto/customer-list-response.dto';
import { LocationService } from '../../location/services/location.service';

@Injectable()
export class CustomerListService {
  constructor(
    private readonly customerListNewRepository: CustomersRepository,
    private readonly locationService: LocationService,
  ) {}

  async getCustomers(
    locationSlug: string,
    query: CustomerListNewRequestDto,
  ): Promise<CustomerListNewDataDto> {
    try {
      // Get location ID from slug
      const locationId = await this.locationService.getLocationId(locationSlug);

      // Prepare query options
      const options = {
        page: query.page || 1,
        limit: query.limit || 1000,
        status: query.status ?? 1, // Use nullish coalescing to allow 0
        walkinCustomers: query.walkinCustomers || false,
        search: query.search,
      };

      // Fetch customers from repository
      const { customers, total } = await this.customerListNewRepository.findCustomers(
        locationId,
        options,
      );

      // Transform to response DTO
      const body = customers.map(customer => this.transformToListItem(customer));

      const totalPages = Math.ceil(total / options.limit);

      return {
        body,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getCustomers service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve customers: ${error.message}`);
    }
  }

  private transformToListItem(customer: any): CustomerListNewItemDto {
    const firstName = customer.profile?.firstname || '';
    const lastName = customer.profile?.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      id: customer.id,
      firstName,
      lastName,
      fullName,
    };
  }
}
