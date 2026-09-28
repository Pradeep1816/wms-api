import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { InvoiceVoidRepository } from '../repositories/invoice-void.repository';
import { VoidInvoiceRequestDto, VoidInvoiceResponseDto } from '../dto/void-invoice.dto';
import { InvoiceType } from '../enums/invoice-type.enum';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { AuditTrailService } from '../../audit-trail/services/audit-trail.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoicePosStockService } from './invoice-pos-stock.service';

// Program type constant (matches legacy Program::TYPE_PRIVATE_PROGRAM)
const PROGRAM_TYPE_PRIVATE = 1;

@Injectable()
export class InvoiceVoidService {
  constructor(
    private readonly invoiceVoidRepository: InvoiceVoidRepository,
    private readonly dataSource: DataSource,
    private readonly customerBalanceRecalculatorService: CustomerBalanceRecalculatorService,
    private readonly auditTrailService: AuditTrailService,
    private readonly posStock: InvoicePosStockService,
  ) {}

  /**
   * Void an invoice.
   * 
   * Matches legacy flow:
   *   Invoice::void($canbeUnscheduled)
   *     → Guard: not already void, not payment credit invoice
   *     → updateAttributes: isVoid=1, tax=0, isTaxAdjusted=0
   *     → Loop lineItems → soft-delete each → afterSoftDelete side effects
   *     → Recalculate totals → Update customer balance
   * 
   * @param locationId - Location ID (from LocationResolveGuard)
   * @param locationSlug - Location slug (for error messages)
   * @param invoiceId - Invoice ID
   * @param requestDto - DTO with canBeUnscheduled flag
   * @param userId - Current authenticated user ID
   * @returns VoidInvoiceResponseDto with status boolean
   */
  async voidInvoice(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    requestDto: VoidInvoiceRequestDto,
    userId: number,
  ): Promise<VoidInvoiceResponseDto> {
    try {
      // 1. Validate invoice exists
      const invoice = await this.invoiceVoidRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // 2. Guard: invoice must be of type INVOICE (not pro-forma)
      if (invoice.type !== InvoiceType.INVOICE) {
        throw new BadRequestException(
          'Only invoices can be voided. Pro-forma invoices are not eligible.',
        );
      }

      // 3. Guard: must NOT already be void (matches legacy: !$this->isVoid)
      if (invoice.isVoid) {
        throw new BadRequestException('Invoice is already voided.');
      }

      // 4. Guard: must NOT be a payment credit invoice
      //    (matches legacy: !$this->isPaymentCreditInvoice())
      const isPaymentCredit = await this.invoiceVoidRepository.isPaymentCreditInvoice(invoiceId);
      if (isPaymentCredit) {
        throw new BadRequestException(
          'Cannot void a payment credit invoice.',
        );
      }

      // 5. Check if invoice is reversed (needed for afterSoftDelete logic)
      const isReversed = await this.invoiceVoidRepository.isReversedInvoice(invoiceId);

      // 6. Execute everything in a transaction
      await this.dataSource.transaction(async (manager) => {
        if (manager.queryRunner) {
          manager.queryRunner.data = {
            ...(manager.queryRunner.data ?? {}),
            currentUserId: userId,
          };
        }

        // Preserve complete before-state snapshots while retaining the existing
        // direct-update void behavior.
        const invoiceBefore = await manager.findOne(Invoice, {
          where: { id: invoiceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invoiceBefore || invoiceBefore.isVoid || invoiceBefore.isCanceled) {
          throw new BadRequestException('Invoice is already voided or cancelled.');
        }
        const lineItemsBefore = await manager.find(InvoiceLineItem, {
          where: { invoiceId, isDeleted: false },
          order: { itemId: 'ASC', id: 'ASC' },
        });
        if (lineItemsBefore.some(line => line.isPos && (Number(line.returnedQuantity) > 0 || line.returnedFromLineItemId))) {
          throw new BadRequestException('This invoice has POS returns. Use Return POS Items for remaining goods.');
        }
        if (lineItemsBefore.some(line => line.isPos)) {
          const paid = await manager.query('SELECT ip.id FROM invoice_payment ip INNER JOIN payment p ON p.id=ip.payment_id AND p.isDeleted=0 WHERE ip.invoice_id=? AND ip.isDeleted=0 AND ip.amount<>0 LIMIT 1', [invoiceId]);
          if (paid.length) throw new BadRequestException('This invoice has POS purchases and payments. Use Return POS Items (or Return for the whole invoice) to preserve the payment and return audit.');
        }
        for (const line of lineItemsBefore.filter(line => line.isPos)) {
          await this.posStock.restoreAll(manager, locationId, { ...line });
        }

        // 6a. Mark invoice as void (direct update, no model events)
        //     Matches legacy: updateAttributes(['isVoid' => true, 'tax' => 0.00, 'isTaxAdjusted' => false])
        await this.invoiceVoidRepository.markInvoiceAsVoid(invoiceId, userId, manager);

        // 6b. Get all non-deleted line items with lesson info
        const lineItems = await this.invoiceVoidRepository.getLineItemsWithLessonInfo(
          invoiceId,
          manager,
        );

        // 6c. Process each line item (matches legacy foreach loop)
        for (const lineItem of lineItems) {
          // Soft-delete the line item
          await this.invoiceVoidRepository.softDeleteLineItem(lineItem.lineItemId, manager);

          // afterSoftDelete side effects (only for invoice + lesson items + not reversed)
          const isLessonItem = lineItem.itemCategoryId === ItemCategory.CATEGORY_LESSON;

          if (isLessonItem && !isReversed && lineItem.lessonId) {
            const isPrivateLesson = lineItem.programType === PROGRAM_TYPE_PRIVATE;

            if (isPrivateLesson) {
              // Delete credit-used LessonPayment records
              if (lineItem.enrolmentId) {
                await this.invoiceVoidRepository.deleteCreditUsedPayments(
                  lineItem.lessonId,
                  lineItem.enrolmentId,
                  invoiceId,
                  userId,
                  manager,
                );
              }

              // Unschedule lesson if flag is set
              if (requestDto.canBeUnscheduled) {
                await this.invoiceVoidRepository.unscheduleLesson(
                  lineItem.lessonId,
                  userId,
                  manager,
                );
              }
            }
          }
        }

        // 6d. Recalculate invoice totals (matches legacy Invoice::beforeSave on $invoiceModel->save())
        await this.invoiceVoidRepository.recalculateInvoiceTotals(
          invoiceId,
          userId,
          manager,
          false,
        );

        // 6e. Update customer balance (matches legacy Invoice::afterSave → User::updateCustomerBalance)
        await this.customerBalanceRecalculatorService.recalculateAndPersist(invoice.userId, {
          manager,
          locationSlug,
          updatedByUserId: userId,
        });

        // Write one final audit entry per changed record. These inserts use the
        // same transaction and roll back together with the void operation.
        const lineItemIds = lineItemsBefore.map((lineItem) => lineItem.id);
        const lineItemsAfter =
          lineItemIds.length > 0
            ? await manager.find(InvoiceLineItem, {
                where: { id: In(lineItemIds) },
              })
            : [];
        const lineItemsAfterById = new Map(
          lineItemsAfter.map((lineItem) => [lineItem.id, lineItem]),
        );

        for (const lineItemBefore of lineItemsBefore) {
          const lineItemAfter = lineItemsAfterById.get(lineItemBefore.id);
          if (lineItemAfter) {
            await this.auditTrailService.writeUpdateEntry(manager, {
              target: InvoiceLineItem,
              modelType: 'common\\models\\InvoiceLineItem',
              before: lineItemBefore,
              after: lineItemAfter,
              userId,
            });
          }
}
        const invoiceAfter = await manager.findOne(Invoice, {
          where: { id: invoiceId },
        });
        if (invoiceBefore && invoiceAfter) {
          await this.auditTrailService.writeUpdateEntry(manager, {
            target: Invoice,
            modelType: 'common\\models\\Invoice',
            before: invoiceBefore,
            after: invoiceAfter,
            userId,
          });
        }
      });

      return { status: true };
    } catch (error) {
      console.error('Error in voidInvoice service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to void invoice: ${error.message}`,
      );
    }
  }

}
