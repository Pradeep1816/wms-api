import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInvoice } from '../entities/equipment-rental-invoice.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { getCurrentESTDate } from '../../utils/date-utils';

@Injectable()
export class EquipmentRentalDeleteRepository {
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
   * Delete equipment rental with soft delete
   * Order: rental → rental_invoice → lineItems → invoice
   */
  async delete(rentalId: number, isOngoing: boolean, userId: number): Promise<{ status: boolean }> {
    return await this.equipmentRentalRepository.manager.transaction(async (manager: EntityManager) => {
      if (manager.queryRunner) {
        manager.queryRunner.data = {
          ...(manager.queryRunner.data ?? {}),
          currentUserId: userId,
        };
      }
      // Get rental invoices
      const rentalInvoices = await manager.find(EquipmentRentalInvoice, {
        where: { equipmentRentalsId: rentalId, isDeleted: false },
      });

      // Must have invoices to delete, otherwise return { status: false }
      if (rentalInvoices.length === 0) {
        return { status: false };
      }

      // 1. Soft delete the rental
      // Use EST timezone for updated date to match legacy system behavior
      const rental = await manager.findOne(EquipmentRental, {
        where: { id: rentalId },
      });
      if (!rental) {
        throw new NotFoundException('Equipment rental not found');
      }

      rental.isDeleted = true;
      rental.updatedOn = getCurrentESTDate();
      rental.updatedByUserId = userId;
      await manager.save(EquipmentRental, rental);

      // 2. Delete: ALL for ongoing, FIRST for fixed-term
      const invoicesToDelete = isOngoing ? rentalInvoices : rentalInvoices.slice(0, 1);

      for (const rentalInvoice of invoicesToDelete) {
        await this.deleteInvoice(manager, rentalInvoice);
      }

      return { status: true };
    });
  }

  /**
   * Delete: rental_invoice → lineItems → invoice
   */
  private async deleteInvoice(
    manager: EntityManager,
    rentalInvoice: EquipmentRentalInvoice,
  ): Promise<void> {
    // 1. Soft delete rental_invoice
    rentalInvoice.isDeleted = true;
    await manager.save(EquipmentRentalInvoice, rentalInvoice);

    //Get invoice with line items
    const invoice = await manager.findOne(Invoice, {
      where: { id: rentalInvoice.invoiceId },
      relations: ['lineItems'],
    });

    if (!invoice) {
      return;
    }

    // 2. Soft delete line items
    if (invoice.lineItems && Array.isArray(invoice.lineItems)) {
      for (const lineItem of invoice.lineItems) {
        lineItem.isDeleted = true;
        await manager.save(InvoiceLineItem, lineItem);
      }
    }

    // 3. Soft delete invoice
    invoice.isDeleted = true;
    await manager.save(Invoice, invoice);
  }
}
