import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, Between } from 'typeorm';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInstrument } from '../entities/equipment-rental-instrument.entity';
import { Student } from '../../student/entities/student.entity';
import { PaymentFrequency } from '../../payment/entities/payment-frequency.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { ProvinceRepository } from '../../location/repositories/province.repository';
import { IEquipmentRentalQueryRepository } from '../interfaces/equipment-rental-repository.interface';
import { EquipmentRentalRepositoryResponseDto } from '../dto/equipment-rental-response.dto';

@Injectable()
export class EquipmentRentalRepository implements IEquipmentRentalQueryRepository {
  constructor(
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(EquipmentRentalInstrument)
    private readonly equipmentRentalInstrumentRepository: Repository<EquipmentRentalInstrument>,
    @InjectRepository(PaymentFrequency)
    private readonly paymentFrequencyRepository: Repository<PaymentFrequency>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    private readonly provinceRepository: ProvinceRepository,
  ) {}

  /**
   * Get equipment rentals by customer ID with pagination
   */
  async getEquipmentRentalsByCustomerId(
    customerId: number,
    page: number = 1,
    limit: number = 10,
    showAll: boolean = false,
  ): Promise<EquipmentRentalRepositoryResponseDto> {
    const paymentFrequencies = await this.paymentFrequencyRepository.find();
    const rentalDurations: Record<number, string> = {};
    for (const payment of paymentFrequencies) {
      rentalDurations[payment.id] =
        payment.frequencyLength === 1
          ? `${payment.frequencyLength} Month`
          : `${payment.frequencyLength} Months`;
    }
    
    const where: any = {
      customerId: customerId,
      isDeleted: false,
    };
    if (!showAll) {
      where.isReturned = false;
    }
    
    const [rentals, total] = await this.equipmentRentalRepository.findAndCount({
      where,
      relations: ['student'],
      order: { startDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { equipmentRentals: rentals, total, rentalDurations } as EquipmentRentalRepositoryResponseDto;
  }

  /**
   * Get equipment rental by ID and customer ID
   */
  async getEquipmentRentalById(rentalId: number): Promise<EquipmentRental | null> {
    return this.equipmentRentalRepository.findOne({
      where: {
        id: rentalId,
        isDeleted: false,
      },
      relations: ['student'],
    });
  }

  /**
   * Get invoice and line items for an equipment rental
   * Equipment rentals create invoices with isEquipmentRentalContract = true
   */
  async getInvoiceForRental(rental: EquipmentRental, locationId: number): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[] } | null> {
    if (!rental.startDate) {
      return null;
    }

    // Find invoice with isEquipmentRentalContract = true for this customer around the rental start date
    // Check invoices within 30 days of the rental start date (expanded range for better matching)
    const startDate = new Date(rental.startDate);
    const dateBefore = new Date(startDate);
    dateBefore.setDate(dateBefore.getDate() - 30);
    const dateAfter = new Date(startDate);
    dateAfter.setDate(dateAfter.getDate() + 30);

    // Try to find invoice by date range first
    let invoice = await this.invoiceRepository.findOne({
      where: {
        userId: rental.customerId,
        locationId: locationId,
        isEquipmentRentalContract: true,
        isDeleted: false,
        isCanceled: false,
        date: Between(dateBefore, dateAfter),
      },
      order: {
        date: 'DESC',
      },
    });

    // If not found, try without date restriction (fallback)
    if (!invoice) {
      invoice = await this.invoiceRepository.findOne({
        where: {
          userId: rental.customerId,
          locationId: locationId,
          isEquipmentRentalContract: true,
          isDeleted: false,
          isCanceled: false,
        },
        order: {
          date: 'DESC',
          id: 'DESC',
        },
      });
    }

    if (!invoice) {
      console.warn(`No invoice found for equipment rental ID: ${rental.id}, customerId: ${rental.customerId}, locationId: ${locationId}`);
      return null;
    }

    // Get line items for this invoice
    const lineItems = await this.invoiceLineItemRepository.find({
      where: {
        invoiceId: invoice.id,
        isDeleted: false,
      },
      relations: ['item'],
      order: {
        id: 'ASC',
      },
    });

    if (!lineItems || lineItems.length === 0) {
      console.warn(`No line items found for invoice ID: ${invoice.id} (equipment rental ID: ${rental.id})`);
      return null;
    }

    return { invoice, lineItems };
  }

  /**
   * Get equipment rental instruments directly from equipment_rental_instruments table
   * This is the primary source for rented instruments, more reliable than invoice lookup
   */
  async getEquipmentRentalInstruments(rentalId: number): Promise<EquipmentRentalInstrument[]> {
    return await this.equipmentRentalInstrumentRepository.find({
      where: {
        equipmentRentalsId: rentalId,
      },
      relations: ['item'],
      order: {
        id: 'ASC',
      },
    });
  }

  /**
   * Get rental duration in months from payment_frequency table
   */
  async getRentalDurationMonths(durationId: number | null): Promise<number | null> {
    if (!durationId) {
      return null;
    }

    const duration = await this.paymentFrequencyRepository.findOne({
      where: { id: durationId },
    });

    return duration?.frequencyLength ?? durationId;
  }

  // Get province ID from location ID
   
  async getProvinceIdByLocationId(locationId: number): Promise<number | undefined> {
    return this.provinceRepository.getProvinceId(locationId);
  }
}
