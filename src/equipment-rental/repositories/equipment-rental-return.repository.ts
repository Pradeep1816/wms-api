import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { EquipmentRental } from '../entities/equipment-rental.entity';
import { EquipmentRentalInvoice } from '../entities/equipment-rental-invoice.entity';
import { EquipmentRentalInstrument } from '../entities/equipment-rental-instrument.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoiceType } from '../../invoice/enums/invoice-type.enum';
import { InvoiceStatus } from '../../invoice/enums/invoice-status.enum';
import { EquipmentRentalConstants } from '../enums/equipment-rental.enum';
import { User } from '../../user/entities/user.entity';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { resolveRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { getCurrentESTDate } from '../../utils/date-utils';
import { RoundingUtils } from '../../utils/rounding.utils';

// Tax rate
const TAX_RATE_MAP: Record<number, number> = {
  [EquipmentRentalConstants.TAX_STATUS_HST]: EquipmentRentalConstants.HST_RATE,
  [EquipmentRentalConstants.TAX_STATUS_GST]: EquipmentRentalConstants.GST_RATE,
};

const getRentDays = (returnDate: Date, currentDate: Date): number => {
  const diffTime = Math.abs(currentDate.getTime() - returnDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysInMonth = (date: Date): number => 
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const calculateProratedAmount = (price: number, totalDays: number, rentDays: number): number =>
  RoundingUtils.roundDecimal((price / totalDays) * rentDays, 2);

const calculateTax = (subtotal: number, taxStatusId: number): number => {
  const taxRate = TAX_RATE_MAP[taxStatusId] || 0;
  return subtotal * taxRate / 100;
};

const calculateTotal = (subtotal: number, tax: number): number =>
  subtotal + tax + EquipmentRentalConstants.LATE_FEE;

const roundTo2Decimals = (value: number): number => RoundingUtils.roundDecimal(value, 2);

@Injectable()
export class EquipmentRentalReturnRepository {
  constructor(
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepo: Repository<InvoiceLineItem>,
    @InjectRepository(EquipmentRentalInvoice)
    private readonly equipmentRentalInvoiceRepo: Repository<EquipmentRentalInvoice>,
    @InjectRepository(EquipmentRentalInstrument)
    private readonly equipmentRentalInstrumentRepo: Repository<EquipmentRentalInstrument>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RbacAuthAssignment)
    private readonly rbacAuthAssignmentRepo: Repository<RbacAuthAssignment>,
  ) {}

  /**
   * Process equipment return
   */
  async processReturn(
    rentalId: number,
    returnDate: Date,
    currentDate: Date,
    locationId: number,
    customerId: number,
    userId: number,
    isCreateInvoice: boolean,
  ): Promise<{ rentalId: number; invoiceId?: number; invoiceNumber?: number }> {
    return await this.equipmentRentalRepository.manager.transaction(async (manager: EntityManager) => {
      let invoiceId: number | undefined;
      let invoiceNumber: number | undefined;

      if (isCreateInvoice) {
        const invoiceResult = await this.createInvoiceWithLineItems(
          manager, rentalId, returnDate, currentDate, locationId, customerId, userId
        );
        invoiceId = invoiceResult.invoiceId;
        invoiceNumber = invoiceResult.invoiceNumber;
      }

      await this.markRentalAsReturned(manager, rentalId, returnDate, currentDate);

      return { rentalId, invoiceId, invoiceNumber };
    });
  }

  /**
   * Create invoice with line items
   */
  private async createInvoiceWithLineItems(
    manager: EntityManager,
    rentalId: number,
    returnDate: Date,
    currentDate: Date,
    locationId: number,
    customerId: number,
    userId: number,
  ): Promise<{ invoiceId: number; invoiceNumber: number }> {
    // Create and save invoice
    const invoice = await this.createInvoice(manager, locationId, customerId, currentDate, userId);

    // Link invoice to rental
    await this.linkInvoiceToRental(manager, rentalId, invoice.id);

    // Get and process instruments
    // LEGACY: Process instruments one by one, not grouped
    const instruments = await this.getInstruments(manager, rentalId);

    // Calculate totals (legacy processes in loop and updates invoice inside loop)
    const rentDays = getRentDays(returnDate, currentDate);
    const daysInMonth = getDaysInMonth(currentDate);

    await this.processLineItemsLegacy(
      manager, invoice.id, locationId, instruments, daysInMonth, rentDays, returnDate, currentDate
    );

    return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
  }

  /**
   * Create invoice
   * FIXED: Uses BOT user instead of request userId (matches legacy behavior)
   */
  private async createInvoice(
    manager: EntityManager,
    locationId: number,
    customerId: number,
    currentDate: Date,
    userId: number,
  ): Promise<Invoice> {
    // Find BOT user (legacy: User::findByRole(User::ROLE_BOT))
    // Roles are stored in rbac_auth_assignment table
    // Note: user_id in rbac_auth_assignment is varchar, so we need to cast
    const botUser = await manager
      .createQueryBuilder(User, 'user')
      .innerJoin('rbac_auth_assignment', 'rbacAuthAssignment', 'CAST(rbacAuthAssignment.user_id AS UNSIGNED) = user.id')
      .where('rbacAuthAssignment.item_name = :role', { role: RolesEnum.BOT })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('user.id', 'DESC') // Get last BOT user if multiple exist (matches legacy: end($roleUser))
      .getOne();

    if (!botUser) {
      throw new Error('BOT user not found. Cannot create equipment rental invoice.');
    }

    const invoiceData = {
      type: InvoiceType.INVOICE,
      userId: customerId, // Customer ID (not BOT user ID)
      locationId,
      date: currentDate,
      isEquipmentRentalContract: true,
      status: InvoiceStatus.OWING,
      isDeleted: false,
      isVoid: 0,
      isPosted: 0,
      isTaxAdjusted: 0,
      isCanceled: false,
      paidStatus: 0,
      createdUserId: botUser.id, // FIXED: Use BOT user ID
      updatedUserId: botUser.id, // FIXED: Use BOT user ID
      // Note: Legacy also sets userName from botUser.userProfile.fullName
      // This might be stored in a different field or calculated elsewhere
    };

    const invoice = manager.create(Invoice, invoiceData);

    // Generate invoice number
    const lastInvoice = await manager.findOne(Invoice, {
      where: { locationId },
      order: { invoiceNumber: 'DESC' },
    });
    invoice.invoiceNumber = (lastInvoice?.invoiceNumber || 0) + 1;

    await manager.save(Invoice, invoice);
    return invoice;
  }

  /**
   * Link invoice to rental
   */
  private async linkInvoiceToRental(
    manager: EntityManager,
    rentalId: number,
    invoiceId: number,
  ): Promise<void> {
    const rentalInvoice = manager.create(EquipmentRentalInvoice, {
      equipmentRentalsId: rentalId,
      invoiceId,
      isDeleted: false,
    });
    await manager.save(EquipmentRentalInvoice, rentalInvoice);
  }

  /**
   * Get instruments for rental
   */
  private async getInstruments(
    manager: EntityManager,
    rentalId: number,
  ): Promise<EquipmentRentalInstrument[]> {
    return manager.find(EquipmentRentalInstrument, {
      where: { equipmentRentalsId: rentalId },
      relations: ['item'],
    });
  }

  /**
   * Process line items - EXACT LEGACY BEHAVIOR
   * Legacy processes instruments one by one, handles duplicates, recalculates tax on cumulative subtotal
   */
  private async processLineItemsLegacy(
    manager: EntityManager,
    invoiceId: number,
    locationId: number,
    instruments: EquipmentRentalInstrument[],
    daysInMonth: number,
    rentDays: number,
    returnDate: Date,
    currentDate: Date,
  ): Promise<void> {
    let subtotal = 0;
    let totalTax = 0;
    let total = 0;
    const preItemIds: number[] = [];
    let prevId: number | null = null;

    // Legacy: foreach ($equipmentRentalsInstruments as $equipmentRentalsInstrument)
    for (const equipmentRentalsInstrument of instruments) {
      const price = Number(equipmentRentalsInstrument.item.price);
      const itemId = equipmentRentalsInstrument.instrument;
      const currentId = equipmentRentalsInstrument.equipmentRentalsId;
      const royaltySnapshot = await resolveRoyaltySnapshot(
        manager,
        locationId,
        equipmentRentalsInstrument.item,
      );

      // Legacy: Create line item with initial amount = price * duration
      // Note: Legacy line 334: amount = price * duration (but we'll update to prorated)
      let invoiceLineItem = manager.create(InvoiceLineItem, {
        invoiceId,
        itemId,
        amount: price, // Initial value, will be updated to prorated amount
        unit: 1,
        cost: price,
        itemTypeId: EquipmentRentalConstants.ITEM_TYPE_MISC,
        rate: 0,
        description: equipmentRentalsInstrument.item.description || '',
        code: '', // Legacy: $invoiceLineItem->getItemCode() - would need to implement
        isDeleted: false,
        royaltyFree: 0,
        royaltyCategoryId: royaltySnapshot.categoryId || null,
        royaltyRateApplied: royaltySnapshot.rate,
        advertisementRateApplied: royaltySnapshot.advertisementRate,
        taxType: '',
        taxRate: 0,
        taxStatus: '',
        taxCode: '',
        netTotal: 0,
      });

      let lineItemToUpdate: InvoiceLineItem | null = null;

      // Legacy: Handle duplicates (if prevId != null)
      if (prevId !== null) {
        if (preItemIds.includes(itemId)) {
          // Legacy: Find existing line item and increment unit (lines 344-352)
          const existingLineItem = await manager.findOne(InvoiceLineItem, {
            where: { invoiceId, itemId },
          });

          if (existingLineItem) {
            existingLineItem.unit += 1;
            // Legacy: tax_rate calculation (lines 349-351) - stored but not used in final calc
            // Note: Legacy calculates tax_rate from netPrice, but we don't have that field
            // The tax_rate is stored but final tax is recalculated from subtotal
            await manager.save(InvoiceLineItem, existingLineItem);
            lineItemToUpdate = existingLineItem;
          }
        } else {
          // New item, save it (lines 354-357)
          preItemIds.push(itemId);
          await manager.save(InvoiceLineItem, invoiceLineItem);
          lineItemToUpdate = invoiceLineItem;
        }
      } else {
        // First item (lines 360-363)
        preItemIds.push(itemId);
        await manager.save(InvoiceLineItem, invoiceLineItem);
        lineItemToUpdate = invoiceLineItem;
      }

      // Legacy: Calculate prorated amount (lines 366-372)
      // $remainingMonthtotal = ($equipmentRentalsInstrument->item->price / $totalDays) * $totalRentDays;
      const invoiceAmount = roundTo2Decimals((price / daysInMonth) * rentDays);

      // Legacy: Update line item amount (line 373)
      // Note: Legacy updates $invoiceLineItem which may be unsaved if duplicate
      // For exact behavior, we update the line item that was actually saved
      if (lineItemToUpdate) {
        lineItemToUpdate.amount = invoiceAmount;
        await manager.save(InvoiceLineItem, lineItemToUpdate);
      } else {
        // Fallback: update the new line item (matches legacy behavior even if buggy)
        invoiceLineItem.amount = invoiceAmount;
        await manager.save(InvoiceLineItem, invoiceLineItem);
      }

      // Legacy: Add to subtotal (line 374)
      subtotal += invoiceAmount;

      // Legacy: Recalculate tax on CUMULATIVE subtotal using CURRENT instrument's taxStatusId (lines 375-382)
      // This is the legacy behavior - tax is recalculated on entire subtotal for each item
      // Only the LAST instrument's tax status affects the final tax
      if (equipmentRentalsInstrument.item.taxStatusId === EquipmentRentalConstants.TAX_STATUS_HST) {
        totalTax = subtotal * 13 / 100;
      } else if (equipmentRentalsInstrument.item.taxStatusId === EquipmentRentalConstants.TAX_STATUS_GST) {
        totalTax = subtotal * 5 / 100;
      } else {
        totalTax = subtotal; // Legacy: 100% tax if unknown status (line 381)
      }

      // Legacy: Calculate total and update invoice INSIDE the loop (lines 383-384)
      total = subtotal + totalTax + EquipmentRentalConstants.LATE_FEE;

      // Legacy: Update invoice totals for each instrument (line 384)
      await manager.update(Invoice, { id: invoiceId }, {
        balance: roundTo2Decimals(total),
        tax: roundTo2Decimals(totalTax),
        total: roundTo2Decimals(total),
        subTotal: roundTo2Decimals(subtotal),
      });

      prevId = currentId;
    }
  }


  /**
   * Mark rental as returned
   */
  private async markRentalAsReturned(
    manager: EntityManager,
    rentalId: number,
    returnDate: Date,
    currentDate: Date,
  ): Promise<void> {
    // Use EST timezone for updated date to match legacy system behavior
    await manager.update(EquipmentRental, { id: rentalId }, {
      isReturned: true,
      returnDate,
      endDate: currentDate,
      updatedOn: getCurrentESTDate(),
    });
  }
}
