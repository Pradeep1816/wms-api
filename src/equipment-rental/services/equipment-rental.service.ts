import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { IEquipmentRentalQueryService } from '../interfaces/equipment-rental-service.interface';
import { EquipmentRentalRequestDto } from '../dto/equipment-rental-request.dto';
import { EquipmentRentalModalRequestDto } from '../dto/equipment-rental-modal-request.dto';
import { EquipmentRentalDataDto } from '../dto/equipment-rental-response.dto';
import { EquipmentRentalModalDataDto, RentedInstrumentDto } from '../dto/equipment-rental-modal-response.dto';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalRepository } from '../repositories/equipment-rental.repository';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { EquipmentRentalTransformationService } from './equipment-rental-transformation.service';
import { EquipmentRentalModalTransformationService } from './equipment-rental-modal-transformation.service';
import { EquipmentRentalCalculationService } from './equipment-rental-calculation.service';
import { ItemRepository } from '../../item/repositories/item.repository';
import { StudentRepository } from '../../student/repositories/student.repository';
import { CustomerEquipmentRentalsInfoRepository } from '../../customer/repositories/customer-equipment-rentals-info.repository';

@Injectable()
export class EquipmentRentalService implements IEquipmentRentalQueryService {
  constructor(
    private readonly equipmentRentalRepository: EquipmentRentalRepository,
    private readonly validationService: CustomerValidationService,
    private readonly transformationService: EquipmentRentalTransformationService,
    private readonly modalTransformationService: EquipmentRentalModalTransformationService,
    private readonly calculationService: EquipmentRentalCalculationService,
    private readonly itemRepository: ItemRepository,
    private readonly studentRepository: StudentRepository,
    private readonly customerEquipmentRentalsInfoRepository: CustomerEquipmentRentalsInfoRepository,
  ) { }

  async getEquipmentRentalsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: EquipmentRentalRequestDto,
  ): Promise<EquipmentRentalDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get equipment rentals with pagination
      const { equipmentRentals, total, rentalDurations } = await this.equipmentRentalRepository.getEquipmentRentalsByCustomerId(
        customerId,
        query.page || 1,
        query.limit || 10,
        query.showAll,
      );

      // Transform equipment rentals to DTOs
      const equipmentRentalData = this.transformationService.transformRentalsToDtos(equipmentRentals, rentalDurations);

      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query.page || 1,
        query.limit || 10
      );

      return {
        body: equipmentRentalData,
        pagination,
      };
    } catch (error) {
      console.error('Error in getEquipmentRentalsByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve equipment rentals: ${error.message}`);
    }
  }

  async getEquipmentRentalsModalData(
    locationSlug: string,
    customerId: number,
    query: EquipmentRentalModalRequestDto,
  ): Promise<EquipmentRentalModalDataDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);

      // Get provinceId from location for tax rate calculation
      const provinceId = await this.equipmentRentalRepository.getProvinceIdByLocationId(locationId);

      let equipmentRental: EquipmentRental | null = null;
      let rentedInstruments: RentedInstrumentDto[] = [];
      let rentalDetails: any = null;

      // Get equipment rental by ID if rentalId is provided
      // This for When need customer Info while Updating Equipment Rental 
      if (query.id) {
        equipmentRental = await this.equipmentRentalRepository.getEquipmentRentalById(query.id);
        if (!equipmentRental) {
          throw new NotFoundException(`Equipment rental not found: ${query.id}`);
        }
        customerId = equipmentRental.customerId;

        // Try to get instruments directly from equipment_rental_instruments table first (primary source)
        const equipmentRentalInstruments = await this.equipmentRentalRepository.getEquipmentRentalInstruments(equipmentRental.id);
        if (equipmentRentalInstruments && equipmentRentalInstruments.length > 0) {
          // Transform equipment rental instruments to rented instruments (async with provinceId)
          rentedInstruments = await this.modalTransformationService.transformEquipmentRentalInstrumentsToRentedInstruments(
            equipmentRentalInstruments,
            {
              startDate: equipmentRental.startDate,
              duration: equipmentRental.duration || undefined,
              isOnGoing: equipmentRental.isOnGoing,
            },
            provinceId,
          );
        } else {
          // Fallback: Try to get from invoice line items (for backwards compatibility)
          const invoiceData = await this.equipmentRentalRepository.getInvoiceForRental(equipmentRental, locationId);
          if (invoiceData && invoiceData.lineItems && invoiceData.lineItems.length > 0) {
            rentedInstruments = this.modalTransformationService.transformLineItemsToRentedInstruments(invoiceData.lineItems);
          } else {
            console.warn(`No rented instruments found for equipment rental ID: ${query.id}`);
          }
        }

        // Prepare rental details - always include rental details when rentalId is provided
        const startDateStr = equipmentRental.startDate 
          ? new Date(equipmentRental.startDate).toISOString().split('T')[0] 
          : undefined;
        const returnDateStr = equipmentRental.returnDate 
          ? new Date(equipmentRental.returnDate).toISOString().split('T')[0] 
          : undefined;
        const endDateStr = equipmentRental.endDate 
          ? new Date(equipmentRental.endDate).toISOString().split('T')[0] 
          : undefined;

        // Convert tinyint (0/1) to boolean for isOnGoing and securityDeposit
        const isOnGoing = equipmentRental.isOnGoing !== null && equipmentRental.isOnGoing !== undefined 
          ? Boolean(equipmentRental.isOnGoing) 
          : false;
        const securityDeposit = equipmentRental.securityDeposit !== null && equipmentRental.securityDeposit !== undefined 
          ? Boolean(equipmentRental.securityDeposit) 
          : false;

        const createdOnStr = equipmentRental.createdOn 
          ? new Date(equipmentRental.createdOn).toISOString().split('T')[0] 
          : undefined;

        rentalDetails = {
          startDate: startDateStr,
          returnDate: returnDateStr,
          endDate: endDateStr,
          duration: equipmentRental.duration ?? undefined,
          isOnGoing: isOnGoing,
          securityDeposit: securityDeposit,
          tenderType: equipmentRental.tenderType ?? undefined,
          depositAmount: equipmentRental.depositAmount ? equipmentRental.depositAmount.toString() : undefined,
          studentId: equipmentRental.studentId ?? undefined,
          createdOn: createdOnStr,
        };
      }

      // Fetch all required data in parallel
      const [instrumentRentals, students, customerInfo] = await Promise.all([
        this.itemRepository.getInstrumentRentalByLocation(locationId),
        this.studentRepository.getActiveStudentListByCustomerId(customerId),
        this.customerEquipmentRentalsInfoRepository.getEquipmentRentalsCustomerInfo(customerId),
      ]);

      // Transform data to DTOs
      return await this.modalTransformationService.transformModalDataToDto(
        instrumentRentals,
        students,
        customerInfo,
        rentedInstruments.length > 0 ? rentedInstruments : undefined,
        rentalDetails,
        provinceId,
      );
    } catch (error) {
      console.error('Error in getEquipmentRentalsModalData service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve equipment rentals modal data: ${error.message}`);
    }
  }
}
