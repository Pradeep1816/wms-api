import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvoiceReturnRepository } from '../repositories/invoice-return.repository';
import { ReturnInvoiceResponseDto } from '../dto/return-invoice-response.dto';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { PermissionService } from '../../auth/services/permission.service';
import { InvoiceReturnRoyaltyService } from './invoice-return-royalty.service';
import { InvoicePosStockService } from './invoice-pos-stock.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';

/**
 * Service for the Return (Revert) Invoice feature.
 * 
 * Replicates legacy PHP actionRevertInvoice($id) from InvoiceController.php (lines 556-603).
 * 
 * Flow:
 *   1. Validate invoice exists and can be reverted
 *   2. Create credit invoice (negative copy of original)
 *   3. Create invoice_reverse linking record
 *   4. Clone all line items with negated unit + their discounts
 *   5. Recalculate credit invoice totals
 *   6. If original was Owing → create credit-applied/credit-used payment pair
 *   7. Mark original invoice as canceled
 *   8. Update customer account balance
 */
@Injectable()
export class InvoiceReturnService {
  constructor(
    private readonly invoiceReturnRepository: InvoiceReturnRepository,
    private readonly dataSource: DataSource,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly permissionService: PermissionService,
    private readonly invoiceReturnRoyaltyService: InvoiceReturnRoyaltyService,
    private readonly posStock: InvoicePosStockService,
  ) {}

  /**
   * Return (revert) an invoice by creating a credit invoice with negated line items.
   * 
   * @param locationId - The location ID (from LocationResolveGuard)
   * @param locationSlug - The location slug (for error messages)
   * @param invoiceId - The invoice ID to return
   * @param currentUserId - The authenticated user's ID (for audit fields)
   * @returns ReturnInvoiceResponseDto with credit invoice details
   */
  async returnInvoice(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    currentUserId: number,
  ): Promise<ReturnInvoiceResponseDto> {
    try {
      await this.validateReturnPermission(currentUserId, locationId);

      return await this.dataSource.transaction(async (manager) => {
        const locked = await manager.findOne(Invoice, { where: { id: invoiceId, locationId, isDeleted: false }, lock: { mode: 'pessimistic_write' } });
        if (!locked || locked.isVoid || locked.isCanceled) throw new BadRequestException('Invoice is unavailable, voided or already returned.');
        if (manager.queryRunner) {
          manager.queryRunner.data = {
            ...(manager.queryRunner.data ?? {}),
            currentUserId,
          };
        }

        // ──────────────────────────────────────────────
        // STEP 1: Validate invoice exists
        // ──────────────────────────────────────────────
        const invoice = await this.invoiceReturnRepository.findInvoiceById(
          locationId,
          invoiceId,
          manager,
        );

        if (!invoice) {
          throw new NotFoundException(
            `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
          );
        }

        // ──────────────────────────────────────────────
        // STEP 2: canRevert() checks
        // Matches legacy Invoice::canRevert() (lines 918-921)
        // ──────────────────────────────────────────────
        await this.validateCanRevert(invoice, manager);

        // ──────────────────────────────────────────────
        // STEP 3: Create the credit invoice
        // Matches legacy lines 559-565
        // ──────────────────────────────────────────────
        const transactionId = await this.invoiceReturnRepository.createTransaction(
          currentUserId,
          manager,
        );

        const invoiceNumber = await this.invoiceReturnRepository.getNextInvoiceNumber(
          invoice.locationId,
          2, // TYPE_INVOICE
          manager,
        );

        const creditInvoice = await this.invoiceReturnRepository.createCreditInvoice(
          invoice,
          transactionId,
          invoiceNumber,
          currentUserId,
          manager,
        );

        // ──────────────────────────────────────────────
        // STEP 4: Create invoice_reverse record
        // Matches legacy lines 566-569
        // ──────────────────────────────────────────────
        await this.invoiceReturnRepository.createInvoiceReverse(
          invoice.id,
          creditInvoice.id,
          manager,
        );

        // ──────────────────────────────────────────────
        // STEP 5: Clone line items (negated unit) + discounts
        // Matches legacy lines 570-585
        // ──────────────────────────────────────────────
        const lineItems = await this.invoiceReturnRepository.getLineItemsWithDiscounts(
          invoice.id,
          manager,
        );

        for (const line of [...lineItems].filter(line => line.isPos).sort((a,b)=>a.itemId-b.itemId)) {
          if (Number(line.returnedQuantity)>0) throw new BadRequestException('This invoice has partial POS returns. Use Return POS Items for the remaining goods.');
          await this.posStock.restoreAll(manager, locationId, line);
          await manager.update(InvoiceLineItem, line.id, { returnedQuantity: Number(line.unit) });
        }

        for (const lineItem of lineItems) {
          // Clone line item with negated unit
          const newLineItem = await this.invoiceReturnRepository.cloneLineItem(
            lineItem,
            creditInvoice.id,
            manager,
          );

          // Clone all discounts for this line item
          if (lineItem.discounts && lineItem.discounts.length > 0) {
            for (const discount of lineItem.discounts) {
              await this.invoiceReturnRepository.cloneDiscount(
                discount,
                newLineItem.id,
                manager,
              );
            }
          }

          // Match legacy discount afterSave cascade:
          // line-item totals are recomputed after discounts are saved.
          await this.invoiceReturnRepository.recalculateClonedLineItemTotals(
            newLineItem.id,
            creditInvoice.id,
            manager,
          );
        }

        // ──────────────────────────────────────────────
        // STEP 6: Recalculate credit invoice totals
        // Matches legacy line 587: $creditInvoice->save()
        // ──────────────────────────────────────────────
        // A POS return credits the tax actually charged, including an invoice-level
        // adjustment. Recomputing only the line rates would change the credit.
        if (lineItems.some(line => line.isPos) && invoice.isTaxAdjusted) {
          await manager.update(Invoice, creditInvoice.id, {
            isTaxAdjusted: invoice.isTaxAdjusted,
            tax: -Number(invoice.tax),
          });
        }
        let updatedCreditInvoice = await this.invoiceReturnRepository.recalculateInvoiceTotals(
          creditInvoice.id,
          currentUserId,
          manager,
        );

        // ──────────────────────────────────────────────
        // STEP 7: If original was OWING, create payment pair
        // Matches legacy lines 588-598
        // Legacy uses the original invoice's current status/balance at the moment
        // of return (InvoiceController::actionRevertInvoice), not a recomputed snapshot.
        // ──────────────────────────────────────────────
        if (Number(invoice.status) === InvoiceStatus.OWING) {
          // Compute payment amount: min(original.balance, abs(credit.balance))
          // Matches legacy lines 589-593
          const originalBalance = Number(invoice.balance);
          const creditBalance = Math.abs(Number(updatedCreditInvoice.balance));
          const amount = Math.min(originalBalance, creditBalance);

          if (amount > 0) {
            await this.invoiceReturnRepository.createPaymentPair(
              invoice,
              updatedCreditInvoice,
              amount,
              invoice.userId,
              currentUserId,
              manager,
            );

            // Recalculate credit invoice totals again after payment
            // Matches legacy line 597: $creditInvoice->save()
            updatedCreditInvoice = await this.invoiceReturnRepository.recalculateInvoiceTotals(
              creditInvoice.id,
              currentUserId,
              manager,
            );

            // Recalculate original invoice totals (Payment::afterSave triggers invoice save)
            await this.invoiceReturnRepository.recalculateInvoiceTotals(
              invoice.id,
              currentUserId,
              manager,
            );
          }
        }

        await this.invoiceReturnRoyaltyService.recordInvoiceReturn(manager, {
          originalInvoiceId: invoice.id,
          creditInvoiceId: updatedCreditInvoice.id,
          locationId: invoice.locationId,
          customerId: invoice.userId,
          effectiveDate: updatedCreditInvoice.date,
          createdByUserId: currentUserId,
        });

        // ──────────────────────────────────────────────
        // STEP 8: Mark original invoice as canceled
        // Matches legacy lines 599-600
        // ──────────────────────────────────────────────
        await this.invoiceReturnRepository.markOriginalAsCanceled(
          invoice.id,
          currentUserId,
          manager,
        );

        // Recalculate original invoice after cancellation
        await this.invoiceReturnRepository.recalculateInvoiceTotals(
          invoice.id,
          currentUserId,
          manager,
        );

        // ──────────────────────────────────────────────
        // STEP 9: Update customer account balance
        // matches legacy Invoice::afterSave → $this->user->updateCustomerBalance()
        // ──────────────────────────────────────────────
        await this.customerBalanceRecalculatorService.recalculateAndPersist(invoice.userId, {
          manager,
          locationSlug,
          updatedByUserId: currentUserId,
        });

        // ──────────────────────────────────────────────
        // STEP 10: Return response
        // ──────────────────────────────────────────────
        const creditInvoiceFormatted = `I-${String(updatedCreditInvoice.invoiceNumber).padStart(5, '0')}`;

        const response = new ReturnInvoiceResponseDto();
        response.creditInvoiceId = updatedCreditInvoice.id;
        response.creditInvoiceNumber = creditInvoiceFormatted;
        response.originalInvoiceId = invoice.id;

        return response;
      });
    } catch (error) {
      console.error('Error in returnInvoice service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to return invoice: ${error.message}`,
      );
    }
  }

  private async validateReturnPermission(
    userId: number,
    locationId: number,
  ): Promise<void> {
    const permissions = await this.permissionService.getUserPermissions(userId, locationId);
    const canManageInvoices = permissions.includes('manageInvoices');
    const canManagePfi = permissions.includes('managePfi');

    if (!canManageInvoices && !canManagePfi) {
      throw new ForbiddenException(
        'You do not have permission to return invoices for this location.',
      );
    }
  }

  /**
   * Validate that an invoice can be reverted.
   * Matches legacy Invoice::canRevert() (lines 918-921):
   *   - Has at least one non-deleted line item
   *   - Not already a reversed invoice (not in invoice_reverse.reversedInvoiceId)
   *   - Not already been reversed (not in invoice_reverse.invoiceId)
   *   - Not an opening balance invoice (lineItem.itemTypeId !== TYPE_OPENING_BALANCE)
   *   - Not a payment credit invoice (lineItem.itemTypeId !== 10)
   */
  private async validateCanRevert(
    invoice: any,
    manager: any,
  ): Promise<void> {
    // Check 1: Has line items
    const firstItemTypeId = await this.invoiceReturnRepository.getFirstLineItemTypeId(
      invoice.id,
      manager,
    );

    if (firstItemTypeId === null) {
      throw new BadRequestException(
        'Cannot return this invoice: invoice has no line items.',
      );
    }

    // Check 2: Not already a reversed invoice (credit invoice)
    const isReversedInvoice = await this.invoiceReturnRepository.isReversedInvoice(
      invoice.id,
      manager,
    );

    if (isReversedInvoice) {
      throw new BadRequestException(
        'Cannot return this invoice: it is already a reversed (credit) invoice.',
      );
    }

    // Check 3: Not already been reversed by another invoice
    const isInvoiceReversed = await this.invoiceReturnRepository.isInvoiceReversed(
      invoice.id,
      manager,
    );

    if (isInvoiceReversed) {
      throw new BadRequestException(
        'Cannot return this invoice: it has already been returned.',
      );
    }

    // Check 4: Not an opening balance invoice
    if (firstItemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE) {
      throw new BadRequestException(
        'Cannot return this invoice: opening balance invoices cannot be returned.',
      );
    }

    // Check 5: Not a payment credit invoice (itemTypeId === 10 in legacy)
    if (firstItemTypeId === 10) {
      throw new BadRequestException(
        'Cannot return this invoice: payment credit invoices cannot be returned.',
      );
    }
  }
}
