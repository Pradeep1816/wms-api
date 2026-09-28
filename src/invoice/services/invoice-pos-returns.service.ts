import { allocatePosInvoiceTax } from '../utils/pos-invoice-tax.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceLineItem } from '../entities/invoice-line-item.entity';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';
import { InvoiceReturnRepository } from '../repositories/invoice-return.repository';
import { InvoiceCreateRepository } from '../repositories/invoice-create.repository';
import { InvoicePosLinesService } from './invoice-pos-lines.service';
import { InvoicePosStockService } from './invoice-pos-stock.service';
import { ReturnPosItemsDto } from '../dto/return-pos-items.dto';
import {
  InvoiceReturnRoyaltyService,
  returnCategoryKey,
} from './invoice-return-royalty.service';
import { PermissionService } from '../../auth/services/permission.service';
import { CustomerBalanceRecalculatorService } from '../../shared/services/customer-balance-recalculator.service';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class InvoicePosReturnsService {
  constructor(
    private readonly db: DataSource,
    private readonly lines: InvoicePosLinesService,
    private readonly stock: InvoicePosStockService,
    private readonly returns: InvoiceReturnRepository,
    private readonly creator: InvoiceCreateRepository,
    private readonly royalty: InvoiceReturnRoyaltyService,
    private readonly permissions: PermissionService,
    private readonly balances: CustomerBalanceRecalculatorService,
  ) {}

  async returnItems(
    locationId: number,
    slug: string,
    invoiceId: number,
    dto: ReturnPosItemsDto,
    userId: number,
  ) {
    const permissions = await this.permissions.getUserPermissions(
      userId,
      locationId,
    );
    if (!permissions.some((p) => ['manageInvoices', 'managePfi'].includes(p)))
      throw new ForbiddenException(
        'You do not have permission to return invoices.',
      );
    if (!dto.reason.trim())
      throw new BadRequestException('A return reason is required.');
    if (
      new Set(dto.lines.map((line) => line.lineItemId)).size !==
      dto.lines.length
    )
      throw new BadRequestException('Select each item only once.');
    return this.db.transaction(async (manager) => {
      this.lines.audit(manager, userId);
      const invoice = await this.lines.lockInvoice(
        manager,
        locationId,
        invoiceId,
      );
      const requestKey = `pos-return:${invoiceId}:${dto.requestId}`;
      const [existing] = await manager.query<
        Array<{ id: number; number: number }>
      >(
        'SELECT id, invoice_number AS number FROM invoice WHERE posReturnRequestKey=?',
        [requestKey],
      );
      if (existing)
        return {
          creditInvoiceId: existing.id,
          creditInvoiceNumber: `I-${String(existing.number).padStart(5, '0')}`,
          originalInvoiceId: invoiceId,
        };
      if (
        invoice.isVoid ||
        invoice.isCanceled ||
        invoice.type !== Invoice.TYPE_INVOICE
      )
        throw new BadRequestException('This invoice cannot be returned.');
      if (await this.returns.isReversedInvoice(invoiceId, manager))
        throw new BadRequestException(
          'A credit invoice cannot be returned again.',
        );
      const all = await manager.find(InvoiceLineItem, {
        where: { invoiceId, isDeleted: false },
        order: { itemId: 'ASC', id: 'ASC' },
      });
      const selected = new Map(
        dto.lines.map((line) => [line.lineItemId, line.quantity]),
      );
      for (const request of dto.lines) {
        const line = all.find((line) => line.id === request.lineItemId);
        if (
          !line?.isPos ||
          line.returnedFromLineItemId ||
          request.quantity >
            Number(line.unit) - Number(line.returnedQuantity || 0)
        ) {
          throw new BadRequestException(
            'Return quantity exceeds the remaining POS quantity, or the selected line is not a POS purchase.',
          );
        }
      }
      const transactionId = await this.creator.createTransaction(
        userId,
        manager,
      );
      const number = await this.creator.getNextInvoiceNumber(
        locationId,
        Invoice.TYPE_INVOICE,
        manager,
      );
      const credit = await this.returns.createCreditInvoice(
        invoice,
        transactionId,
        number,
        userId,
        manager,
      );
      credit.walkinBuyerName = invoice.walkinBuyerName;
      credit.notes = `POS items returned: ${dto.reason.trim()}`;
      // Later saves recalculate this same entity's totals. Keep the retry key on
      // it too, or those saves overwrite a raw SQL key update with NULL.
      credit.posReturnRequestKey = requestKey;
      await manager.save(Invoice, credit);
      await this.returns.createInvoiceReverse(invoice.id, credit.id, manager);
      const groups = new Map<
        string,
        {
          total: number;
          previous: number;
          next: number;
          tax: number;
          previousTax: number;
          nextTax: number;
        }
      >();
      const lineTaxes = allocatePosInvoiceTax(
        all.map((line) => ({
          id: line.id,
          net: Number(line.netTotal),
          tax: Number(line.taxRate),
        })),
        Number(invoice.tax),
      );
      for (const line of all) {
        if (!line.isPos) continue;
        const key = returnCategoryKey({
          itemCategoryId: line.royaltyCategoryId,
          rateApplied: line.royaltyRateApplied,
          advertisementRateApplied: line.advertisementRateApplied,
          royaltyFree: line.royaltyFree,
          isPos: true,
          categoryName: line.posSnapshot?.categoryName,
        });
        const group = groups.get(key) ?? {
          total: 0,
          previous: 0,
          next: 0,
          tax: 0,
          previousTax: 0,
          nextTax: 0,
        };
        const previous = Number(line.returnedQuantity || 0);
        const count = selected.get(line.id) ?? 0;
        const revenue = Number(line.netTotal);
        group.total += revenue;
        group.previous += (revenue * previous) / Number(line.unit);
        group.next += (revenue * (previous + count)) / Number(line.unit);
        const taxBasis = lineTaxes.get(line.id) || 0;
        group.tax += taxBasis;
        group.previousTax += (taxBasis * previous) / Number(line.unit);
        group.nextTax += (taxBasis * (previous + count)) / Number(line.unit);
        groups.set(key, group);
        if (!count) continue;
        // Cumulative rounding assigns the final cent remainder to the last return.
        const component = (amount: number) =>
          RoundingUtils.roundHalfUp(
            (amount * (previous + count)) / Number(line.unit),
            2,
          ) -
          RoundingUtils.roundHalfUp((amount * previous) / Number(line.unit), 2);
        const net = component(Number(line.netTotal));
        const tax = component(taxBasis);
        const returnLine = manager.create(InvoiceLineItem, {
          ...line,
          id: undefined,
          invoiceId: credit.id,
          unit: -count,
          netTotal: -net,
          taxRate: -tax,
          inventoryQuantityDeducted: 0,
          returnedQuantity: 0,
          returnedFromLineItemId: line.id,
        });
        await manager.save(InvoiceLineItem, returnLine);
        // Store the exact historical net value as a discount, not today's catalog rules.
        const discount = RoundingUtils.roundHalfUp(
          Number(line.amount) * count - net,
          2,
        );
        if (discount)
          await manager.save(
            InvoiceLineItemDiscount,
            manager.create(InvoiceLineItemDiscount, {
              invoiceLineItemId: returnLine.id,
              type: InvoiceLineItemDiscount.TYPE_LINE_ITEM,
              valueType: InvoiceLineItemDiscount.VALUE_TYPE_DOLLAR,
              value: discount,
            }),
          );
        await this.stock.changeQuantity(
          manager,
          locationId,
          line,
          Number(line.unit) - previous,
          Number(line.unit) - previous - count,
        );
        line.returnedQuantity = previous + count;
        await manager.save(InvoiceLineItem, line);
      }
      // Keep saved POS return components exact; do not reprice from current tax settings.
      const credits = await manager.findBy(InvoiceLineItem, {
        invoiceId: credit.id,
        isDeleted: false,
      });
      credit.subTotal = -RoundingUtils.roundHalfUp(
        -credits.reduce((sum, line) => sum + Number(line.netTotal), 0),
        2,
      );
      credit.tax = -RoundingUtils.roundHalfUp(
        -credits.reduce((sum, line) => sum + Number(line.taxRate), 0),
        2,
      );
      credit.total = credit.subTotal + credit.tax;
      credit.balance = credit.total;
      credit.status =
        credit.total < 0 ? Invoice.STATUS_CREDIT : Invoice.STATUS_PAID;
      await manager.save(Invoice, credit);
      const fractions = new Map(
        [...groups]
          .filter(([, g]) => g.total > 0 && g.next > g.previous)
          .map(([key, g]) => [
            key,
            {
              previous: g.previous / g.total,
              next: g.next / g.total,
              previousTax: g.tax ? g.previousTax / g.tax : 0,
              nextTax: g.tax ? g.nextTax / g.tax : 0,
              previousPayment: (g.previous + g.previousTax) / (g.total + g.tax),
              nextPayment: (g.next + g.nextTax) / (g.total + g.tax),
            },
          ]),
      );
      await this.royalty.recordInvoiceReturn(manager, {
        originalInvoiceId: invoice.id,
        creditInvoiceId: credit.id,
        locationId,
        customerId: invoice.userId,
        effectiveDate: credit.date,
        createdByUserId: userId,
        fractions,
      });
      // Cancel only the returned debt; any paid portion remains customer credit.
      const applied = Math.min(
        Math.max(Number(invoice.balance), 0),
        Math.abs(Number(credit.balance)),
      );
      if (applied > 0) {
        await this.returns.createPaymentPair(
          invoice,
          credit,
          applied,
          invoice.userId,
          userId,
          manager,
        );
        await this.returns.recalculateInvoiceTotals(
          invoice.id,
          userId,
          manager,
        );
        await this.returns.recalculateInvoiceTotals(credit.id, userId, manager);
      }
      await this.balances.recalculateAndPersist(invoice.userId, {
        manager,
        locationSlug: slug,
        updatedByUserId: userId,
      });
      return {
        creditInvoiceId: credit.id,
        creditInvoiceNumber: `I-${String(number).padStart(5, '0')}`,
        originalInvoiceId: invoiceId,
      };
    });
  }
}
