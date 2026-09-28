import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Item } from '../../item/entities/item.entity';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { Location } from '../../location/entities/location.entity';
import { InvoiceReverse } from '../../invoice/entities/invoice-reverse.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { PaymentMethod } from '../../payment/entities/payment-method.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { RoundingUtils } from '../../utils/rounding.utils';
const { parseFlexibleDate, formatLegacyDate } = require('../../utils/date-utils');

@Injectable()
export class SalesReportService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem) private readonly lineItemRepo: Repository<InvoiceLineItem>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(ItemCategory) private readonly itemCategoryRepo: Repository<ItemCategory>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(InvoiceReverse) private readonly invoiceReverseRepo: Repository<InvoiceReverse>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentMethod) private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserLocation) private readonly userLocationRepo: Repository<UserLocation>,
  ) { }

  private resolveDates(startDate?: string, endDate?: string): { start: Date; end: Date } {
    const today = new Date();
    const parsedStart = parseFlexibleDate(startDate);
    const parsedEnd = parseFlexibleDate(endDate);
    const start = parsedStart ?? new Date(today.toISOString().slice(0, 10));
    const end = parsedEnd ?? new Date(today.toISOString().slice(0, 10));
    return { start, end };
  }

  async getSales(locationSlug: string, startDate?: string, endDate?: string) {
    const { start, end } = this.resolveDates(startDate, endDate);
    const location = await this.locationRepo.findOne({ where: { slug: locationSlug } });
    if (!location) {
      return { sales: [], salesTotals: { subtotal: '0.00', tax: '0.00', total: '0.00' }, meta: { startDate: start, endDate: end, location: locationSlug } };
    }
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;

    const salesQb = this.lineItemRepo
      .createQueryBuilder('invoiceLineItem')
      .select('item.itemCategoryId', 'itemCategoryId')
      .addSelect('itemCategory.name', 'itemCategoryName')
      .addSelect('COUNT(invoiceLineItem.id)', 'lineCount')
      .addSelect('COALESCE(ROUND(SUM(invoiceLineItem.netTotal), 2), 0)', 'subtotal')
      .addSelect('COALESCE(SUM(invoiceLineItem.taxRate), 0)', 'tax')
      .innerJoin(Invoice, 'invoice', 'invoice.id = invoiceLineItem.invoice_id')
      .innerJoin(Item, 'item', 'item.id = invoiceLineItem.item_id')
      .innerJoin(ItemCategory, 'itemCategory', 'itemCategory.id = item.itemCategoryId')
      .where('invoice.isDeleted = false')
      .andWhere('invoice.isCanceled = false')
      .andWhere('invoiceLineItem.isDeleted = false')
      .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
      .andWhere('invoice.location_id = :locationId', { locationId: location.id })
      .andWhere('DATE(invoice.date) BETWEEN :start AND :end', {
        start: startStr,
        end: endStr,
      })
      .leftJoin(InvoiceReverse, 'invoiceReverse', 'invoiceReverse.invoiceId = invoice.id')
      .andWhere('invoiceReverse.id IS NULL')
      .groupBy('item.itemCategoryId')
      .addGroupBy('itemCategory.name')
      .orderBy('itemCategory.name', 'ASC');

    const salesRaw = await salesQb.getRawMany();
    const sales = salesRaw.map((row: any) => ({
      itemCategoryId: row.itemCategoryId,
      itemCategoryName: row.itemCategoryName,
      lineCount: row.lineCount,
      subtotal: Number(row.subtotal || 0).toFixed(2),
      tax: Number(row.tax || 0).toFixed(2),
      total: (Number(row.subtotal) + Number(row.tax)).toFixed(2),
    }));

    // Minimal-change approach: only adjust Rentals subtotal (categoryId = 12)
    const rentalsIndex = sales.findIndex((r: any) => Number(r.itemCategoryId) === 12);
    if (rentalsIndex !== -1) {
      const pad2b = (n: number) => String(n).padStart(2, '0');
      const startStr2 = `${start.getFullYear()}-${pad2b(start.getMonth() + 1)}-${pad2b(start.getDate())}`;
      const endStr2 = `${end.getFullYear()}-${pad2b(end.getMonth() + 1)}-${pad2b(end.getDate())}`;

      const roundHalfUp = (value: number): number => {
        return RoundingUtils.roundDecimal(value || 0, 2);
      };

      const rentalsQb = this.lineItemRepo
        .createQueryBuilder('invoice_line_item')
        .select([
          'invoice_line_item.id as id',
          'invoice_line_item.amount as amount',
          'invoice_line_item.unit as unit',
          'invoice_line_item.item_type_id as itemTypeId',
          'invoice.isEquipmentRentalContract as isEquipmentRentalContract',
          `MAX(CASE WHEN invoice_line_item_discount.type = 3 AND invoice_line_item_discount.valueType = 0 THEN invoice_line_item_discount.value END) as agg_enrol_dollar`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 4 AND invoice_line_item_discount.valueType = 0 THEN invoice_line_item_discount.value END) as agg_item_dollar`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 4 AND invoice_line_item_discount.valueType = 1 THEN invoice_line_item_discount.value END) as agg_item_percent`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 5 AND invoice_line_item_discount.valueType = 0 THEN invoice_line_item_discount.value END) as agg_group_dollar`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 5 AND invoice_line_item_discount.valueType = 1 THEN invoice_line_item_discount.value END) as agg_group_percent`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 1 AND invoice_line_item_discount.valueType = 1 THEN invoice_line_item_discount.value END) as agg_customer_percent`,
          `MAX(CASE WHEN invoice_line_item_discount.type = 2 AND invoice_line_item_discount.valueType = 1 THEN invoice_line_item_discount.value END) as agg_pf_percent`,
        ])
        .innerJoin('invoice', 'invoice', 'invoice.id = invoice_line_item.invoice_id')
        .innerJoin('item', 'item', 'item.id = invoice_line_item.item_id')
        .innerJoin('item_category', 'itemCategory', 'itemCategory.id = item.itemCategoryId')
        .leftJoin('invoice_line_item_discount', 'invoice_line_item_discount', 'invoice_line_item_discount.invoiceLineItemId = invoice_line_item.id')
        .leftJoin('invoice_reverse', 'invoice_reverse', 'invoice_reverse.invoiceId = invoice.id')
        .where('invoice.isDeleted = false')
        .andWhere('invoice.isCanceled = false')
        .andWhere('invoice_line_item.isDeleted = false')
        .andWhere('invoice.type = :invoiceType', { invoiceType: 2 })
        .andWhere('invoice.location_id = :locationId', { locationId: location.id })
        .andWhere('itemCategory.id = :rentalsCategory', { rentalsCategory: 12 })
        .andWhere('DATE(invoice.date) BETWEEN :start AND :end', { start: startStr2, end: endStr2 })
        .andWhere('invoice_reverse.id IS NULL')
        .groupBy('invoice_line_item.id')
        .addGroupBy('invoice.id');

      const rentalsRows = await rentalsQb.getRawMany();

      const calcLegacyDiscount = (row: any): number => {
        const amount = parseFloat(row.amount || '0');
        const unit = parseFloat(row.unit || '0');
        const itemTypeId = parseInt(row.itemTypeId || '0');
        const isRentalContract = !!row.isEquipmentRentalContract;
        const grossPrice = itemTypeId === 2 ? roundHalfUp(amount) : roundHalfUp(amount * unit);
        let discount = 0.0;
        let lineItemPrice = grossPrice;


        const steps: Array<{ key: string; type: 'dollar' | 'percent' } | { key: 'agg_customer_percent' | 'agg_pf_percent'; type: 'percent' }> = [
          { key: 'agg_enrol_dollar', type: 'dollar' },
          { key: 'agg_item_dollar', type: 'dollar' },
          { key: 'agg_item_percent', type: 'percent' },
          { key: 'agg_group_dollar', type: 'dollar' },
          { key: 'agg_group_percent', type: 'percent' },
          { key: 'agg_customer_percent', type: 'percent' },
          { key: 'agg_pf_percent', type: 'percent' },
        ];

        for (const step of steps) {
          const key = step.key as keyof typeof row;
          const raw = row[key];
          if (raw == null) {
            continue;
          }
          const val = parseFloat(raw);
          if (isNaN(val)) {
            continue;
          }
          switch (key) {
            case 'agg_enrol_dollar':
            case 'agg_item_dollar':
            case 'agg_group_dollar': {
              const add = lineItemPrice < 0 ? -val : val;
              discount += add;
              lineItemPrice = grossPrice - discount;
              break;
            }
            case 'agg_item_percent':
            case 'agg_group_percent': {
              discount += (val / 100) * lineItemPrice;
              lineItemPrice = grossPrice - discount;
              break;
            }
            case 'agg_customer_percent': {
              if (isRentalContract) {
                break; // skip for equipment rental contracts
              }
              discount += (val / 100) * lineItemPrice;
              lineItemPrice = grossPrice - discount;
              break;
            }
            case 'agg_pf_percent': {
              discount += (val / 100) * lineItemPrice;
              break;
            }
          }
        }

        return discount;
      };

      const rentalsSubtotal = rentalsRows.reduce((acc: number, row: any) => {
        const amount = parseFloat(row.amount || '0');
        const unit = parseFloat(row.unit || '0');
        const itemTypeId = parseInt(row.itemTypeId || '0');
        const grossPrice = itemTypeId === 2 ? roundHalfUp(amount) : roundHalfUp(amount * unit);
        const discount = calcLegacyDiscount(row);
        const net = grossPrice - discount;
        return acc + net;
      }, 0);

      sales[rentalsIndex].subtotal = rentalsSubtotal.toFixed(2);
      sales[rentalsIndex].total = (Number(sales[rentalsIndex].subtotal) + Number(sales[rentalsIndex].tax)).toFixed(2);
    }

    const salesTotals = sales.reduce(
      (acc: any, row: any) => {
        acc.subtotal = acc.subtotal + Number(row.subtotal);
        acc.tax = acc.tax + Number(row.tax);
        return acc;
      },
      { subtotal: 0, tax: 0 },
    );
    const salesTotalsFormatted = {
      subtotal: salesTotals.subtotal.toFixed(2),
      tax: salesTotals.tax.toFixed(2),
      total: (salesTotals.subtotal + salesTotals.tax).toFixed(2),
    };

    return {
      body: sales,
      footer: [salesTotalsFormatted],
      meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
    };
  }

  async getPayments(locationSlug: string, startDate?: string, endDate?: string) {
    const { start, end } = this.resolveDates(startDate, endDate);

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const startStr = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
    const endStr = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
    const paymentsQb = this.paymentRepo
      .createQueryBuilder('payment')
      .select('payment.paymentMethodId', 'paymentMethodId')
      .addSelect('paymentMethod.name', 'paymentMethodName')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'subtotal')
      .innerJoin(User, 'user', 'user.id = payment.user_id')
      .innerJoin(UserLocation, 'userLocation', 'userLocation.user_id = user.id')
      .innerJoin(Location, 'location', 'location.id = userLocation.location_id')
      .leftJoin(PaymentMethod, 'paymentMethod', 'paymentMethod.id = payment.paymentMethodId')
      .where('payment.isDeleted = false')
      .andWhere('location.slug = :locationSlug', { locationSlug })
      .andWhere('payment.paymentMethodId NOT IN (:...excludedMethods)', {
        excludedMethods: [PaymentMethod.TYPE_CREDIT_USED, PaymentMethod.TYPE_CREDIT_APPLIED, PaymentMethod.TYPE_GIFT_CARD],
      })
      .andWhere('DATE(payment.date) BETWEEN :start AND :end', {
        start: startStr,
        end: endStr,
      })
      .groupBy('payment.paymentMethodId')
      .addGroupBy('paymentMethod.name')

    const paymentsRaw = await paymentsQb.getRawMany();
    const paymentsTotals = paymentsRaw.reduce((acc: number, row: any) => acc + Number(row.subtotal || 0), 0);
    return {
      body: paymentsRaw.map((row: any) => ({
        paymentMethodId: row.paymentMethodId,
        paymentMethodName: row.paymentMethodName,
        subtotal: Number(row.subtotal || 0).toFixed(2),
      })),
      footer: [{ subtotal: paymentsTotals.toFixed(2) }],
      meta: { startDate: formatLegacyDate(start), endDate: formatLegacyDate(end), location: locationSlug },
    };
  }
}

