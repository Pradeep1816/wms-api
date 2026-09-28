import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInvoice } from '../entities/equipment-rental-invoice.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class EquipmentRentalUpdateRepository {
  constructor(
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(EquipmentRentalInvoice)
    private readonly equipmentRentalInvoiceRepo: Repository<EquipmentRentalInvoice>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepo: Repository<InvoiceLineItem>,
  ) {}

  /**
   * Update equipment rental return date and void future invoices
   */
  async update(
    rentalId: number,
    returnDate: Date,
    userId: number,
  ): Promise<void> {
    await this.equipmentRentalRepository.manager.transaction(async (manager: EntityManager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      // Update rental return date
      // Use EST timezone for updated date to match legacy system behavior
      await manager.update(
        EquipmentRental,
        { id: rentalId },
        {
          returnDate,
          updatedOn: getCurrentESTDate(),
          updatedByUserId: userId,
        },
      );

      // Void future invoices
      await this.voidFutureInvoices(manager, rentalId, returnDate);
    });
  }

  /**
   * Void invoice for the first day of next month after return date
   */
  private async voidFutureInvoices(
    manager: EntityManager,
    rentalId: number,
    returnDate: Date,
  ): Promise<void> {
    // Calculate first day of next month after return date
    const nextMonthFirst = new Date(
      returnDate.getFullYear(),
      returnDate.getMonth() + 1,
      1,
    );

    // Find all rental invoices linked to this rental
    const rentalInvoices = await manager.find(EquipmentRentalInvoice, {
      where: { equipmentRentalsId: rentalId },
    });

    if (rentalInvoices.length === 0) {
      return;
    }

    // Get invoice IDs
    const invoiceIds = rentalInvoices.map(ri => ri.invoiceId);

    const invoice = await manager
      .createQueryBuilder(Invoice, 'invoice')
      .leftJoinAndSelect('invoice.lineItems', 'lineItems')
      .where('invoice.id IN (:...invoiceIds)', { invoiceIds })
      .andWhere('DATE(invoice.date) = DATE(:nextMonthFirst)', { nextMonthFirst })
      .getOne();

    // Void the invoice
    if (invoice) {
      await this.voidInvoice(manager, invoice);
    }
  }

  /**
   * Void invoice
   */
  private async voidInvoice(manager: EntityManager, invoice: Invoice): Promise<void> {
    if (invoice.isVoid) {
      return;
    }

    // Update invoice fields
    invoice.isVoid = 1;
    invoice.tax = 0.00;
    invoice.isTaxAdjusted = 0;
    await manager.save(Invoice, invoice);

    // Delete line items (soft delete)
    if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
      for (const lineItem of invoice.lineItems) {
        lineItem.isDeleted = true;
        await manager.save(InvoiceLineItem, lineItem);
      }
    }
  }
}
