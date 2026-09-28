import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class ProFormaInvoiceRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // Find location by slug
  
  async findLocationBySlug(locationSlug: string): Promise<Location | null> {
    return this.locationRepository.findOne({ 
      where: { slug: locationSlug } 
    });
  }

  // Find customer by ID and location ID

  async findCustomerByIdAndLocation(customerId: number, locationId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.userLocation', 'userLocation')
      .where('user.id = :customerId', { customerId })
      .andWhere('userLocation.locationId = :locationId', { locationId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: 0 })
      .getOne();
  }

  // Get pro-forma invoices by customer ID with pagination
   
  async getProFormaInvoicesByCustomerId(
    customerId: number,
    locationId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ invoices: any[]; total: number }> {
    const offset = (page - 1) * limit;

    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: {
        userId: customerId,
        type: Invoice.TYPE_PRO_FORMA_INVOICE,
        isDeleted: false,
        locationId: locationId,
      },
      relations: ['proformaPaymentFrequency', 'lineItems', 'lineItems.invoiceItemEnrolment', 'lineItems.invoiceItemEnrolment.enrolment', 'lineItems.invoiceItemEnrolment.enrolment.student'],
      order: { date: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { invoices, total };
  }
}
