import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalModalTransformationService } from './equipment-rental-modal-transformation.service';
import { EquipmentRentalRepository } from '../repositories/equipment-rental.repository';
import { CustomerEquipmentRentalsInfoRepository } from '../../customer/repositories/customer-equipment-rentals-info.repository';
import { EquipmentRentalPrintTransformationService } from './transformations/equipment-rental-print-transformation.service';
import { LocationRepository } from '../../location/repositories/location.repository';
import { EquipmentRentalPrintDataDto, EquipmentRentalPrintTotalsDto } from '../dto/equipment-rental-print-response.dto';
import { RentedInstrumentDto } from '../dto/equipment-rental-modal-response.dto';
import { formatDateYMD } from '../../utils/date-utils';
import { formatCurrency } from '../../utils/formatters';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class EquipmentRentalReprintAgreementService {
  constructor(
    private readonly equipmentRentalRepository: EquipmentRentalRepository,
    private readonly modalTransformationService: EquipmentRentalModalTransformationService,
    private readonly customerEquipmentRentalsInfoRepository: CustomerEquipmentRentalsInfoRepository,
    private readonly printTransformationService: EquipmentRentalPrintTransformationService,
    private readonly locationRepository: LocationRepository,
  ) { }

  async getEquipmentRentalPrintDetails(
    locationId: number,
    customerId: number,
    rentalId: number,
  ): Promise<EquipmentRentalPrintDataDto> {
    try {
      
      const [provinceId, equipmentRental, location, customerEntity] = await Promise.all([
        this.equipmentRentalRepository.getProvinceIdByLocationId(locationId),
        this.equipmentRentalRepository.getEquipmentRentalById(rentalId),
        this.locationRepository.getLocationDetails(locationId),
        this.customerEquipmentRentalsInfoRepository.getEquipmentRentalsCustomerInfo(customerId),
      ]);

      if (!equipmentRental) {
        throw new NotFoundException(`Equipment rental not found: ${rentalId}`);
      }

      if (equipmentRental.customerId !== customerId) {
        throw new BadRequestException(`Equipment rental ${rentalId} does not belong to customer ${customerId}`);
      }

      const equipmentRentalInstruments = await this.equipmentRentalRepository.getEquipmentRentalInstruments(
        equipmentRental.id,
      );

      let instruments: RentedInstrumentDto[] = [];
      if (equipmentRentalInstruments.length > 0) {
        instruments = await this.modalTransformationService.transformEquipmentRentalInstrumentsToRentedInstruments(
          equipmentRentalInstruments,
          {
            startDate: equipmentRental.startDate,
            duration: equipmentRental.duration || undefined,
            isOnGoing: equipmentRental.isOnGoing,
          },
          provinceId,
        );
      } else {
        const invoiceData = await this.equipmentRentalRepository.getInvoiceForRental(equipmentRental, locationId);
        if (invoiceData?.lineItems?.length) {
          instruments = this.modalTransformationService.transformLineItemsToRentedInstruments(invoiceData.lineItems);
        }
      }

      const customerInfo = this.modalTransformationService.transformCustomerInfoToDto(customerEntity);
      const customerName = this.getCustomerValue(customerInfo, 'customerName', 'Customer');
      const durationLabel = equipmentRental.isOnGoing ? 'ONGOING' : `${equipmentRental.duration ?? 0}`;

      const totals = this.calculatePrintTotals(instruments, equipmentRental);
      const itemValueTotal = this.roundToTwo(
        instruments.reduce((sum, instrument) => sum + this.parseAmount(instrument.retailValue), 0),
      );
      const monthlyRateTotal = this.roundToTwo(
        instruments.reduce((sum, instrument) => sum + this.parseAmount(instrument.monthlyRate), 0),
      );
      const depositAmount = this.parseAmount(equipmentRental.depositAmount);

      const studentFirstName = equipmentRental.student?.firstName || '';
      const studentLastName = equipmentRental.student?.lastName || '';

      return this.printTransformationService.transformToPrintData({
        location: {
          name: location?.name || '',
          address: location?.address || '',
          province: location?.province?.name || '',
          phoneNumber: location?.phoneNumber || '',
        },
        customer: {
          name: customerName,
          address: this.getCustomerValue(customerInfo, 'address', 'Address'),
          city: this.getCustomerValue(customerInfo, 'city', 'City'),
          postalCode: this.getCustomerValue(customerInfo, 'postalCode', 'P.C'),
          homePhone: this.getCustomerValue(customerInfo, 'homePhone', 'Home Phone'),
          workPhone: this.getCustomerValue(customerInfo, 'workPhone', 'Work Phone'),
          otherPhone: this.getCustomerValue(customerInfo, 'otherPhone', 'Other Phone'),
          email: this.getCustomerValue(customerInfo, 'email', 'Email'),
        },
        student: {
          firstName: studentFirstName,
          lastName: studentLastName,
        },
        rental: {
          startDate: equipmentRental.startDate ? formatDateYMD(equipmentRental.startDate) : '',
          returnDate: equipmentRental.returnDate ? formatDateYMD(equipmentRental.returnDate) : '',
          durationLabel,
        },
        instruments,
        totals,
        contract: {
          agreementText: this.buildAgreementText({
            customerName,
            durationRaw: durationLabel,
            totalRetailValue: itemValueTotal,
            monthlyRateTotal,
            hasSecurityDeposit: Boolean(equipmentRental.securityDeposit),
            tenderType: equipmentRental.tenderType ?? null,
            depositAmount,
          }),
          footerLeft: 'RENTAL EQUIPMENT IS NOT COVERED BY ARCADIA ACADEMY OF MUSIC INSURANCE',
          footerRight: 'RENTAL PAYMENTS DO NOT APPLY TO PURCHASE',
        },
      });
    } catch (error) {
      console.error('Error in getEquipmentRentalPrintDetails service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve equipment rental print details: ${error.message}`);
    }
  }

  private parseAmount(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 0;
    }

    const numeric =
      typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g, ''));

    return Number.isNaN(numeric) ? 0 : numeric;
  }

  private roundToTwo(value: number): number {
    return RoundingUtils.roundDecimal(value || 0, 2);
  }

  private getCustomerValue(customerInfo: any, ...keys: string[]): string {
    for (const key of keys) {
      const value = customerInfo?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value);
      }
    }
    return '';
  }

  private calculatePrintTotals(
    instruments: RentedInstrumentDto[],
    rental: EquipmentRental,
  ): EquipmentRentalPrintTotalsDto {
    const calculatedSubTotal = this.roundToTwo(
      instruments.reduce((sum, instrument) => sum + this.parseAmount(instrument.total), 0),
    );

    const instrumentTax = this.roundToTwo(
      instruments.reduce((sum, instrument) => {
        const amount = this.parseAmount(instrument.total);
        const taxRate = this.parseAmount(instrument.taxRate);
        return sum + amount * (taxRate / 100);
      }, 0),
    );

    const persistedTax = this.roundToTwo(this.parseAmount(rental.hst));
    const persistedTotal = this.roundToTwo(this.parseAmount(rental.total));

    let tax = instrumentTax > 0 ? instrumentTax : persistedTax;
    let subTotal = calculatedSubTotal;
    let total = this.roundToTwo(subTotal + tax);

    if (persistedTotal > 0) {
      total = persistedTotal;
      if (subTotal <= 0) {
        subTotal = this.roundToTwo(Math.max(total - tax, 0));
      }
    }

    return {
      SubTotal: formatCurrency(subTotal),
      Tax: formatCurrency(tax),
      Total: formatCurrency(total),
    };
  }

  private buildAgreementText(params: {
    customerName: string;
    durationRaw: string;
    totalRetailValue: number;
    monthlyRateTotal: number;
    hasSecurityDeposit: boolean;
    tenderType: number | null;
    depositAmount: number;
  }): string {
    const customerName = params.customerName || '';
    const durationText = params.durationRaw || '0';
    const monthLabel = durationText === '1' ? ' MONTH' : ' MONTHS';
    const retailValue = formatCurrency(this.roundToTwo(params.totalRetailValue)) || 'Nill';
    const monthlyRate = formatCurrency(this.roundToTwo(params.monthlyRateTotal)) || 'Nill';
    const depositAmountText = formatCurrency(this.roundToTwo(params.depositAmount)) || 'Nill';

    let depositText = '';
    if (params.hasSecurityDeposit) {
      if (params.tenderType === 3) {
        depositText =
          ' I HAVE AUTHORIZED ARCADIA ACADEMY OF MUSIC TO USE MY CREDIT CARD ON FILE IF THE EQUIPMENT IS DAMAGED, LATE OR NOT RETURNED.';
      } else {
        depositText =
          ` I HAVE PAID A DEPOSIT OF ${depositAmountText} ` +
          'WHICH WILL BE RETURNED TO ME WITHOUT INTEREST IF THE ITEMS RENTED ARE RETURNED TO ARCADIA ACADEMY OF MUSIC IN GOOD CONDITION ON OR BEFORE THE DATE SPECIFIED.';
      }
    }

    return (
      `I HAVE RECEIVED FROM ARCADIA ACADEMY OF MUSIC THE ABOVE LISTED ITEMS WHICH I HAVE EXAMINED AND FIND TO BE IN GOOD WORKING CONDITION, ` +
      `THE VALUE OF WHICH IS ${retailValue}. I AM RENTING THIS FOR A PERIOD OF ${durationText}${monthLabel} ` +
      `AT THE RATE OF ${monthlyRate} (excl. taxes) PER MONTH.` +
      `${depositText} OVERDUE RENT WILL BE DEDUCTED FROM THE DEPOSIT AT THE PRO RATA DAILY RATE. ` +
      `I, ${customerName}, WILL BE RESPONSIBLE FOR THE VALUE OF THE ITEMS, IF FOR ANY REASON THEY ARE NOT RETURNED TO ARCADIA ACADEMY OF MUSIC. ` +
      `I, ${customerName}, WILL ALSO BE RESPONSIBLE FOR ANY DAMAGE TO THESE ITEMS BEYOND NORMAL EXPECTED WEAR. ` +
      `I, ${customerName}, WILL PAY ANY FEES OR COSTS INCURRED BY THE OWNER IN REPOSSESSING THE ITEMS OR COLLECTING THE RENTALS DUE. ` +
      'AN ADDITIONAL CHARGE OF $5.00 WILL BE ADDED TO ALL RENTALS RETURNED AFTER THE DUE.'
    );
  }
}
