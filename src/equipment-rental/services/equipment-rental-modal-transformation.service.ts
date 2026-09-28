import { Injectable } from '@nestjs/common';
import {
  EquipmentRentalModalDataDto,
  InstrumentRentalDto,
  StudentDto,
  CustomerInfoDto,
  RentedInstrumentDto,
  RentalDetailsDto,
} from '../dto/equipment-rental-modal-response.dto';
import { User } from '../../user/entities/user.entity';
import { UserContact } from '../../user/entities/user-contact.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { EquipmentRentalInstrument } from '../entities/equipment-rental-instrument.entity';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { plainToInstance } from 'class-transformer';
import { EquipmentRentalInstrumentCalculatorService } from './equipment-rental-instrument-calculation.service';

@Injectable()
export class EquipmentRentalModalTransformationService {
  constructor(
    private readonly calculatorService: EquipmentRentalInstrumentCalculatorService,
  ) {}
  /**
   * Transform Item entity to InstrumentRentalDto (includes tax rate)
   */
  async transformItemToDto(item: any, provinceId?: number): Promise<InstrumentRentalDto> {
    const taxStatusId = item?.taxStatusId;
    const taxRate = await this.calculatorService.calculateTaxRate(taxStatusId, provinceId);

    return plainToInstance(InstrumentRentalDto, {
      id: item.id || 0,
      code: item.code || '',
      description: item.description || '',
      price: item.price || 0,
      taxRate,
    });
  }

  /**
   * Transform items array to InstrumentRentalDto array
   */
  async transformItemsToDtos(items: any[], provinceId?: number): Promise<InstrumentRentalDto[]> {
    if (!items || !Array.isArray(items)) {
      return [];
    }
    return Promise.all(items.map(item => this.transformItemToDto(item, provinceId)));
  }

  /**
   * Transform student raw data to StudentDto
   */
  transformStudentToDto(student: any): StudentDto {
    return plainToInstance(StudentDto, {
      id: student.id || 0,
      fullName: student.fullName || '',
    });
  }

  /**
   * Transform students array to StudentDto array
   */
  transformStudentsToDtos(students: any[]): StudentDto[] {
    if (!students || !Array.isArray(students)) {
      return [];
    }
    return students.map(student => this.transformStudentToDto(student));
  }

  /**
   * Format phone number to (XXX) XXX-XXXX format
   */
  private formatPhoneNumber(phone: string): string {
    if (!phone) return '';
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  /**
   * Extract address fields from UserAddress entity
   */
  private extractAddressFields(address: any): { address: string; city: string; postalCode: string } {
    return {
      address: address?.address || '',
      city: address?.city?.name || '',
      postalCode: address?.postalCode || '',
    };
  }

  /**
   * Find address from contacts with priority:
   * 1. Primary contact address
   * 2. Contact with same labelId as primary
   * 3. Any contact with address
   */
  private findAddressFromContacts(contacts: any[], primaryContact: any): { address: string; city: string; postalCode: string } {
    // First try primary contact address
    if (primaryContact?.addresses?.[0]) {
      return this.extractAddressFields(primaryContact.addresses[0]);
    }

    // If primary contact has no address, try contact with same labelId
    if (primaryContact) {
      const sameLabelContact = contacts.find(
        c => c.id !== primaryContact.id && 
             c.labelId === primaryContact.labelId && 
             c.addresses?.length > 0
      );
      if (sameLabelContact?.addresses?.[0]) {
        return this.extractAddressFields(sameLabelContact.addresses[0]);
      }
    }

    // Fallback: Find any contact with an address
    const contactWithAddress = contacts.find(c => c.addresses?.length > 0);
    if (contactWithAddress?.addresses?.[0]) {
      return this.extractAddressFields(contactWithAddress.addresses[0]);
    }

    return { address: '', city: '', postalCode: '' };
  }

  /**
   * Get phone number from contacts by labelId
   * Priority: Primary contact with matching label > Any contact with matching label
   */
  private getPhoneByLabel(contacts: any[], labelId: number, primaryContact: any): string {
    // First check if primary contact matches the label and has phones
    if (primaryContact && primaryContact.labelId === labelId && primaryContact.phones?.length > 0) {
      return primaryContact.phones[0].number || '';
    }

    // Fallback: Find any contact with matching label and phones
    const contactWithLabel = contacts.find(c => c.labelId === labelId && c.phones?.length > 0);
    return contactWithLabel?.phones?.[0]?.number || '';
  }

  /**
   * Transform User entity to CustomerInfoDto
   * Matching legacy PHP logic: getPublicIdentity(), getEmail(), getAddresses()
   */
  transformCustomerInfoToDto(customer: User | null): CustomerInfoDto {
    if (!customer || !customer.contacts?.length) {
      return plainToInstance(CustomerInfoDto, {
        customerName: '',
        address: '',
        city: '',
        postalCode: '',
        homePhone: '',
        workPhone: '',
        otherPhone: '',
        email: '',
      });
    }

    const contacts = customer.contacts;

    // Get primary contact (isPrimary = 1, stored as number in DB) - matching legacy getEmail() logic
    const primaryContact = contacts.find(c => Number(c.isPrimary) === 1);
    
    // getEmail() - Get email from primary contact's emails (matching legacy)
    const email = primaryContact?.emails?.[0]?.email || '';

    // getPublicIdentity() - First try profile fullname, then username, then email (matching legacy)
    const customerName = (customer.profile?.firstname && customer.profile?.lastname)
      ? `${customer.profile.firstname} ${customer.profile.lastname}`.trim()
      : customer.username || email;

    // getAddresses() - Get address via contacts
    const { address, city, postalCode } = this.findAddressFromContacts(contacts, primaryContact);

    // Get phones by contact label (prioritize primary contact if it matches the label)
    const homePhoneRaw = this.getPhoneByLabel(contacts, UserContact.LABEL_HOME, primaryContact);
    const workPhoneRaw = this.getPhoneByLabel(contacts, UserContact.LABEL_WORK, primaryContact);
    const otherPhoneRaw = this.getPhoneByLabel(contacts, UserContact.LABEL_OTHER, primaryContact);

    return plainToInstance(CustomerInfoDto, {
      customerName: customerName,
      address: address,
      city: city,
      postalCode: postalCode,
      homePhone: this.formatPhoneNumber(homePhoneRaw),
      workPhone: this.formatPhoneNumber(workPhoneRaw), 
      otherPhone: this.formatPhoneNumber(otherPhoneRaw),
      email: email,
    });
  }

  /**
   * Transform invoice line item to RentedInstrumentDto
   */
  transformLineItemToRentedInstrument(lineItem: InvoiceLineItem): RentedInstrumentDto {
    const item = lineItem.item;
    // Extract data from line item description or other fields
    // The description might contain instrument details, or we can use item details
    const description = lineItem.description || item?.description || '';
    const code = lineItem.code || item?.code || '';
    
    // Extract values from line item - ensure all numeric values are properly converted
    // netTotal is the total amount for this line item - convert to number first
    const netTotalNum = typeof lineItem.netTotal === 'number' 
      ? lineItem.netTotal 
      : (lineItem.netTotal ? parseFloat(String(lineItem.netTotal)) : 0);
    const total = !isNaN(netTotalNum) ? netTotalNum.toFixed(2) : '0.00';
    
    // Rate is the monthly rate (price per unit) - convert to number first
    const rateNum = typeof lineItem.rate === 'number' 
      ? lineItem.rate 
      : (lineItem.rate ? parseFloat(String(lineItem.rate)) : (item?.price ? parseFloat(String(item.price)) : 0));
    const monthlyRate = !isNaN(rateNum) ? rateNum.toFixed(2) : '0.00';
    
    // Unit represents the number of months - convert to number first
    const unitNum = typeof lineItem.unit === 'number' 
      ? lineItem.unit 
      : (lineItem.unit ? parseFloat(String(lineItem.unit)) : 1);
    const numberOfMonths = !isNaN(unitNum) ? unitNum.toString() : '1';
    
    // Amount might be retail value, or we might need to calculate it
    // If amount is not set, calculate from rate * unit
    const amountNum = typeof lineItem.amount === 'number' 
      ? lineItem.amount 
      : (lineItem.amount ? parseFloat(String(lineItem.amount)) : null);
    const retailValue = amountNum !== null && !isNaN(amountNum)
      ? amountNum.toFixed(2)
      : (!isNaN(rateNum) && !isNaN(unitNum) ? (rateNum * unitNum).toFixed(2) : '0.00');
    
    // Asset tag might be in description or stored separately
    // Try to extract from description if it contains asset tag info
    const assetTag = ''; // This might be stored elsewhere or in description
    
    return plainToInstance(RentedInstrumentDto, {
      instrumentId: item?.id || lineItem.itemId || 0,
      instrumentCode: code,
      instrument: description,
      retailValue: retailValue || '0.00',
      assetTag: assetTag,
      monthlyRate: monthlyRate || '0.00',
      numberOfMonths: numberOfMonths || '1',
      total: total || '0.00',
    });
  }

  /**
   * Transform line items array to RentedInstrumentDto array
   */
  transformLineItemsToRentedInstruments(lineItems: InvoiceLineItem[]): RentedInstrumentDto[] {
    if (!lineItems || !Array.isArray(lineItems)) {
      return [];
    }
    return lineItems.map(item => this.transformLineItemToRentedInstrument(item));
  }

  /**
   * Transform EquipmentRentalInstrument entity to RentedInstrumentDto
   * This is the primary source for rented instruments (from equipment_rental_instruments table)
   */
  async transformEquipmentRentalInstrumentToRentedInstrument(
    equipmentRentalInstrument: EquipmentRentalInstrument,
    rentalData: {
      startDate: Date;
      duration?: number;
      isOnGoing?: boolean | number;
    },
    provinceId?: number,
  ): Promise<RentedInstrumentDto> {
    const item = equipmentRentalInstrument.item;
    const description = item?.description || '';
    const code = item?.code || '';
  
    // Get price from item (monthly rate)
    const priceNum = item?.price ? parseFloat(String(item.price)) : 0;
    
    // Get tax status ID
    const taxStatusId = item?.taxStatusId || 1; // Default to 1 (STATUS_DEFAULT = 13% HST)

    // Use calculator service to perform all calculations (async)
    const calculationResult = await this.calculatorService.calculateRentalInstrument(
      {
        price: priceNum,
        startDate: rentalData.startDate,
        duration: rentalData.duration,
        isOnGoing: rentalData.isOnGoing,
      },
      taxStatusId,
      provinceId,
    );
  
    // Retail value from equipmentRentalInstrument.value
    const valueNum = equipmentRentalInstrument.value 
      ? parseFloat(String(equipmentRentalInstrument.value)) 
      : null;
    const retailValue = valueNum !== null && !isNaN(valueNum)
      ? valueNum.toFixed(2)
      : ''; // Fallback to calculated total if value not set
  
    const assetTag = equipmentRentalInstrument.asset || '';
  
    return plainToInstance(RentedInstrumentDto, {
      instrumentId: item?.id || equipmentRentalInstrument.instrument || 0,
      instrumentCode: code,
      instrument: description,
      retailValue: retailValue || '',
      assetTag: assetTag,
      monthlyRate: calculationResult.monthlyRate,
      numberOfMonths: calculationResult.numberOfMonths,
      total: calculationResult.total,
      taxRate: calculationResult.taxRate, // Include tax rate for frontend calculations
    });
  }

  /**
   * Transform array of EquipmentRentalInstrument to RentedInstrumentDto[]
   */
  async transformEquipmentRentalInstrumentsToRentedInstruments(
    equipmentRentalInstruments: EquipmentRentalInstrument[],
    rentalData: {
      startDate: Date;
      duration?: number;
      isOnGoing?: boolean | number;
    },
    provinceId?: number,
  ): Promise<RentedInstrumentDto[]> {
    if (!equipmentRentalInstruments || !Array.isArray(equipmentRentalInstruments)) {
      return [];
    }
    return Promise.all(
      equipmentRentalInstruments.map((eri) => 
        this.transformEquipmentRentalInstrumentToRentedInstrument(eri, rentalData, provinceId)
      )
    );
  }

  /**
   * Transform all modal data to EquipmentRentalModalDataDto
   */
  async transformModalDataToDto(
    instrumentRentals: any[],
    students: any[],
    user: User | null,
    rentedInstruments?: RentedInstrumentDto[],
    rentalDetails?: any,
    provinceId?: number,
  ): Promise<EquipmentRentalModalDataDto> {
    const body: any = {
      instrumentRentals: await this.transformItemsToDtos(instrumentRentals, provinceId),
      students: this.transformStudentsToDtos(students),
      customerInfo: this.transformCustomerInfoToDto(user),
    };

    if (rentedInstruments && rentedInstruments.length > 0) {
      body.rentedInstruments = rentedInstruments;
    }

    if (rentalDetails) {
      body.rentalDetails = plainToInstance(RentalDetailsDto, rentalDetails);
    }

    return plainToInstance(EquipmentRentalModalDataDto, { body });
  }
}

