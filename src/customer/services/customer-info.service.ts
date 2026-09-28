import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomersInfoRepository } from '../repositories/customers-info.repository';
import { CustomersInfoProfileRepository } from '../repositories/customers-info-profile.repository';
import { CustomersInfoEmailRepository } from '../repositories/customers-info-email.repository';
import { CustomersInfoPhoneRepository } from '../repositories/customers-info-phone.repository';
import { CustomersInfoAddressRepository } from '../repositories/customers-info-address.repository';
import { CustomersInfoDiscountRepository } from '../repositories/customers-info-discount.repository';
import { CustomersInfoOpeningBalanceRepository } from '../repositories/customers-info-opening-balance.repository';
import { CustomerListRepository } from '../repositories/customers.repository';
import { LocationService } from '../../location/services/location.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateCustomerInfoDto } from '../dto/update-customer-info.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdateEmailDto } from '../dto/update-email.dto';
import { UpdatePhoneDto } from '../dto/update-phone.dto';
import { UpdateAddressDto } from '../dto/update-address.dto';
import { UpdateDiscountDto } from '../dto/update-discount.dto';
import { UpdateOpeningBalanceDto } from '../dto/update-opening-balance.dto';
import { DeleteCustomerInfoDto } from '../dto/delete-customer-info.dto';
import { CustomerEnrolmentMetadataDto } from '../dto/customer-enrolment-metadata.dto';

@Injectable()
export class CustomerInfoService {
  constructor(
    private readonly customerRepository: CustomerListRepository,
    private readonly customersInfoRepository: CustomersInfoRepository,
    private readonly customersInfoProfileRepository: CustomersInfoProfileRepository,
    private readonly customersInfoEmailRepository: CustomersInfoEmailRepository,
    private readonly customersInfoPhoneRepository: CustomersInfoPhoneRepository,
    private readonly customersInfoAddressRepository: CustomersInfoAddressRepository,
    private readonly customersInfoDiscountRepository: CustomersInfoDiscountRepository,
    private readonly customersInfoOpeningBalanceRepository: CustomersInfoOpeningBalanceRepository,
    private readonly locationService: LocationService,
  ) {}

  private async getLocationAndEnsureCustomer(locationSlug: string, customerId: number): Promise<{ locationId: number }> {
    const locationId = await this.locationService.getLocationId(locationSlug);
    const customer = await this.customerRepository.findCustomerById(customerId, locationId);
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found in location ${locationSlug}`);
    }
    return { locationId };
  }

  private getHandlerOrThrow(type: string) {
    const updateHandlers = this.getUpdateHandlers();
    const handler = (updateHandlers as any)[type];
    if (!handler) {
      throw new BadRequestException(`Invalid ${type ? 'type' : 'request type'}`);
    }
    return handler;
  }

  private async validateDataOrThrow(dtoClass: new (...args: any[]) => any, data: any): Promise<void> {
    const dto = plainToInstance(dtoClass, data);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const errorMessages = errors.map((error: any) => Object.values(error.constraints || {}).join(', '));
      throw new BadRequestException(`Validation failed: ${errorMessages.join('; ')}`);
    }
  }

  async getCustomerInfo(locationSlug: string, customerId: number): Promise<any> {
    try {
      const { locationId } = await this.getLocationAndEnsureCustomer(locationSlug, customerId);

      const [profile, emails, phones, addresses, discount, openingBalance, paymentPreference, contactLabels] = await Promise.all([
        this.customersInfoRepository.getCustomerProfile(customerId, locationId),
        this.customersInfoRepository.getCustomerEmails(customerId, locationId),
        this.customersInfoRepository.getCustomerPhones(customerId, locationId),
        this.customersInfoRepository.getCustomerAddresses(customerId, locationId),
        this.customersInfoRepository.getCustomerDiscount(customerId, locationId),
        this.customersInfoRepository.getCustomerOpeningBalance(customerId, locationId),
        this.customersInfoRepository.getCustomerPaymentPreference(customerId, locationId),
        this.customersInfoRepository.getCustomerContactLabels(customerId),
      ]);

      return {
        profile: profile,
        email: emails,
        phone: phones,
        addresses: addresses,
        discount: discount,
        openingBalance: openingBalance,
        paymentPreference: paymentPreference,
        contactLabels: contactLabels,
      };
    } catch (error) {
      console.error('Error in getCustomerInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve customer info');
    }
  }

  /**
   * Get metadata required for creating a new private enrolment for a customer:
   * - Customer discount
   * - Payment frequencies
   * - Private programs with rates
   */
  async getEnrolmentMetadata(locationSlug: string, customerId: number): Promise<CustomerEnrolmentMetadataDto> {
    try {
      const { locationId } = await this.getLocationAndEnsureCustomer(locationSlug, customerId);

      const [discount, paymentFrequencies, programs] = await Promise.all([
        this.customersInfoRepository.getCustomerDiscount(customerId, locationId),
        this.customersInfoRepository.getPaymentFrequencies(),
        this.customersInfoRepository.getPrivatePrograms(),
      ]);

      return {
        discount,
        paymentFrequencies,
        programs,
      };
    } catch (error) {
      console.error('Error in getEnrolmentMetadata service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to retrieve enrolment metadata');
    }
  }

  private getUpdateHandlers() {
    return {
      profile: {
        repository: this.customersInfoProfileRepository,
        dtoClass: UpdateProfileDto,
      },
      email: {
        repository: this.customersInfoEmailRepository,
        dtoClass: UpdateEmailDto,
      },
      phone: {
        repository: this.customersInfoPhoneRepository,
        dtoClass: UpdatePhoneDto,
      },
      addresses: {
        repository: this.customersInfoAddressRepository,
        dtoClass: UpdateAddressDto,
      },
      discount: {
        repository: this.customersInfoDiscountRepository,
        dtoClass: UpdateDiscountDto,
      },
      openingBalance: {
        repository: this.customersInfoOpeningBalanceRepository,
        dtoClass: UpdateOpeningBalanceDto,
      },
    } as const;
  }

  async update(
    locationSlug: string,
    customerId: number,
    updateDto: UpdateCustomerInfoDto,
    currentUserId: number,
  ): Promise<any> {
    try {
      const { locationId } = await this.getLocationAndEnsureCustomer(locationSlug, customerId);
      const handler = this.getHandlerOrThrow(updateDto.type);
      await this.validateDataOrThrow(handler.dtoClass, updateDto.data);
      return handler.repository.update(customerId, locationId, updateDto.data, currentUserId);
    } catch (error) {
      console.error('Error in updateCustomerInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to update customer info');
    }
  }

  async create(
    locationSlug: string,
    customerId: number,
    createDto: UpdateCustomerInfoDto,
    currentUserId: number,
  ): Promise<any> {
    try {
      const { locationId } = await this.getLocationAndEnsureCustomer(locationSlug, customerId);
      const handler = this.getHandlerOrThrow(createDto.type);
      await this.validateDataOrThrow(handler.dtoClass, createDto.data);
      return handler.repository.create(customerId, locationId, createDto.data, currentUserId);
    } catch (error) {
      console.error('Error in createCustomerInfo service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to create customer info');
    }
  }

  async delete(
    locationSlug: string,
    customerId: number,
    deleteDto: DeleteCustomerInfoDto,
    currentUserId: number,
  ): Promise<any> {
    try {
      const { locationId } = await this.getLocationAndEnsureCustomer(locationSlug, customerId);
      const handler = this.getHandlerOrThrow(deleteDto.type);
      return handler.repository.delete(customerId, locationId, deleteDto.id, currentUserId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      if ((error as any).message?.includes('belongs to customer') || 
          (error as any).message?.includes('Cannot delete primary email')) {
        throw new BadRequestException((error as any).message);
      }
      throw new BadRequestException('Failed to delete customer info');
    }
  }
}
