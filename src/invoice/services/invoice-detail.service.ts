import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { isPOSFeatureEnabled } from '../../shared/helpers/pos-rollout.helper';
import { InvoiceDetailRepository } from '../repositories/invoice-detail.repository';
import { InvoiceDetailsResponse, ReturnedInvoiceInfo } from '../dto/invoice-detail-response.dto';
import { InvoiceItemsResponse } from '../dto/invoice-items-response.dto';
import { InvoiceTotalsDto } from '../dto/invoice-totals-response.dto';
import { InvoiceDiscountCalculator } from './calculations/invoice-discount.calculator';
import { InvoiceTotalsTransformationService } from './transformations/invoice-totals-transformation.service';
import { InvoiceType } from '../enums/invoice-type.enum';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { formatDate } from '../../utils/date-utils';
import { formatPhoneNumber, formatCurrency } from '../../utils/formatters';
import { InvoiceItemsTransformationService } from './transformations/invoice-items-transformation.service';
import { InvoiceMessageResponse } from '../dto/invoice-message-response.dto';
import { 
  AvailableCustomersRequestDto, 
  AvailableCustomersDataDto,
  AvailableCustomerItemDto 
} from '../dto/assign-customer-to-invoice.dto';
import { plainToInstance } from 'class-transformer';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { ItemCategory } from '../../item/entities/item-category.entity';

@Injectable()
export class InvoiceDetailService {
  constructor(
    private readonly invoiceDetailRepository: InvoiceDetailRepository,
    private readonly invoiceItemsTransformationService: InvoiceItemsTransformationService,
    private readonly discountCalculator: InvoiceDiscountCalculator,
    private readonly totalsTransformationService: InvoiceTotalsTransformationService,
  ) {}

  async getInvoiceDetail(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
  ): Promise<InvoiceDetailsResponse> {
    try {
      // Fetch invoice
      const invoice = await this.invoiceDetailRepository.findInvoiceById(locationId, invoiceId);

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // Fetch return invoice related data in parallel
      const [
        hasLineItems,
        isReversedInvoice,
        isInvoiceReversed,
        firstLineItemTypeId,
        firstLineItemMeta,
        returnedInvoice,
      ] = await Promise.all([
        this.invoiceDetailRepository.hasLineItems(invoiceId),
        this.invoiceDetailRepository.isReversedInvoice(invoiceId),
        this.invoiceDetailRepository.isInvoiceReversed(invoiceId),
        this.invoiceDetailRepository.getFirstLineItemTypeId(invoiceId),
        this.invoiceDetailRepository.getFirstLineItemActionMeta(invoiceId),
        this.invoiceDetailRepository.getReturnedInvoiceInfo(invoiceId),
      ]);

      // Calculate canRevert - matches legacy Invoice::canRevert()
      const canRevert = this.calculateCanRevert(
        hasLineItems,
        isReversedInvoice,
        isInvoiceReversed,
        firstLineItemTypeId,
      );
      const { canAddItem, canEditTax, canEditDiscount } = this.calculateItemActionFlags(
        invoice.type,
        Boolean(invoice.isPosted),
        Boolean(invoice.isVoid),
        Boolean(invoice.isCanceled),
        hasLineItems,
        firstLineItemMeta,
        isPOSFeatureEnabled(locationSlug),
      );

      const invoiceInfo = {
        id: invoice.id,
        number: `I-${String(invoice.invoiceNumber).padStart(5, '0')}`,
        date: invoice.date ? formatDate(new Date(invoice.date)) : '',
        status: invoice.getStatus(),
        isCanceled: invoice.isCanceled,
        canRevert,
        canAddItem,
        canEditTax,
        canEditDiscount,
        isReversedInvoice,
        returnedInvoice,
      };

      // If no customer is assigned, return null for the customer section
      let customerInfo: {
        customerId: number;
        customerName: string;
        phoneNumber: string | null;
        email: string | null;
        type: number;
      } | null = null;

      if (invoice.userId) {
        // Check if customer is the location walkin placeholder (not a real customer)
        const isWalkinPlaceholder =
          await this.invoiceDetailRepository.isLocationWalkinCustomer(
            invoice.userId,
            locationId,
          );

        if (invoice.userId) {
          const customerRaw: any =
            await this.invoiceDetailRepository.getCustomerInfo(invoice.userId);

          customerInfo = {
            customerId: customerRaw?.customerId || invoice.userId,
            customerName: isWalkinPlaceholder && invoice.walkinBuyerName ? `${invoice.walkinBuyerName} (Walk-in Customer)` : customerRaw?.customerName?.trim() || '',
            phoneNumber: customerRaw?.phoneNumber
              ? formatPhoneNumber(customerRaw.phoneNumber)
              : null,
            email: customerRaw?.email || null,
            type: customerRaw?.role === RolesEnum.GUEST ? 2 : 1,
          };
        }
      }

      return {
        body: {
          invoice: invoiceInfo,
          customer: customerInfo,
        },
      } as InvoiceDetailsResponse;
    } catch (error) {
      console.error('Error in getInvoiceDetail service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve invoice details: ${error.message}`,
      );
    }
  }

  /**
   * Returns true if invoice can be returned, false otherwise.
   * 
   * Conditions (all must be true):
   * 1. Has at least one non-deleted line item
   * 2. Not already a reversed invoice (credit invoice)
   * 3. Not already been reversed by another invoice
   * 4. Not an opening balance invoice
   * 5. Not a payment credit invoice
   */
  
  private calculateCanRevert(
    hasLineItems: boolean,
    isReversedInvoice: boolean,
    isInvoiceReversed: boolean,
    firstLineItemTypeId: number | null,
  ): boolean {
    // Check Has line items
    if (!hasLineItems) {
      return false;
    }

    // Check Not already a reversed invoice
    if (isReversedInvoice) {
      return false;
    }

    // Check Not already been reversed
    if (isInvoiceReversed) {
      return false;
    }

    // Check Not opening balance (4) or payment credit (10)
    if (firstLineItemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE) {
      return false;
    }
    if (firstLineItemTypeId === ItemTypeEnum.TYPE_PAYMENT_CREDIT) {
      return false;
    }

    return true;
  }

  private calculateItemActionFlags(
    invoiceType: number,
    isPosted: boolean,
    isVoid: boolean,
    isCanceled: boolean,
    hasLineItems: boolean,
    firstLineItemMeta: { itemTypeId: number | null; itemCategoryId: number | null } | null,
    allowInvoicePOS = false,
  ): { canAddItem: boolean; canEditTax: boolean; canEditDiscount: boolean } {
    // Global action blockers.
    if (isPosted || isVoid || isCanceled) {
      return { canAddItem: false, canEditTax: false, canEditDiscount: false };
    }

    // No line items: only regular invoices can add; tax/discount need selected line items.
    if (!hasLineItems) {
      return {
        canAddItem: invoiceType === InvoiceType.INVOICE,
        canEditTax: false,
        canEditDiscount: false,
      };
    }

    // Safety fallback if line items exist but metadata couldn't be resolved.
    if (!firstLineItemMeta || firstLineItemMeta.itemTypeId === null) {
      return { canAddItem: false, canEditTax: false, canEditDiscount: false };
    }

    const isSpecialLineItem =
      firstLineItemMeta.itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE ||
      firstLineItemMeta.itemTypeId === ItemTypeEnum.TYPE_LESSON_CREDIT;
    const isLessonLineItem =
      firstLineItemMeta.itemCategoryId === ItemCategory.CATEGORY_LESSON;
    const isPaymentCreditInvoice =
      firstLineItemMeta.itemTypeId === ItemTypeEnum.TYPE_PAYMENT_CREDIT;

    const canEditDiscount = !isSpecialLineItem && !isPaymentCreditInvoice;

    const canManageItems =
      invoiceType === InvoiceType.INVOICE &&
      !isSpecialLineItem &&
      (!isLessonLineItem || allowInvoicePOS) &&
      !isPaymentCreditInvoice;

    return {
      canAddItem: canManageItems,
      canEditTax: canManageItems,
      canEditDiscount,
    };
  }

  async getInvoiceItems(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    showAllFields: boolean = false,
    sortField?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): Promise<InvoiceItemsResponse> {
    try {
      // Verify invoice exists and belongs to location
      const invoice = await this.invoiceDetailRepository.findInvoiceById(locationId, invoiceId);

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // Fetch line items with optional sorting
      const lineItems = await this.invoiceDetailRepository.findLineItemsByInvoiceId(
        invoiceId,
        sortField,
        sortOrder,
      );

      // Fetch all discounts in one query
      const lineItemIds = lineItems.map((li) => li.id);
      const allDiscounts = await this.invoiceDetailRepository.findDiscountsByLineItemIds(lineItemIds);

      // Group discounts by line item ID
      const discountsByLineItem = new Map<number, typeof allDiscounts>();
      for (const discount of allDiscounts) {
        const existing = discountsByLineItem.get(discount.invoiceLineItemId) || [];
        existing.push(discount);
        discountsByLineItem.set(discount.invoiceLineItemId, existing);
      }

      // Transform using transformation service
      return this.invoiceItemsTransformationService.transformToResponse(
        lineItems,
        discountsByLineItem,
        invoice.isEquipmentRentalContract,
        showAllFields,
      );
    } catch (error) {
      console.error('Error in getInvoiceItems service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve invoice items: ${error.message}`,
      );
    }
  }

  /**
   * Get invoice totals (discounts, subTotal, tax, total, paid, balance)
   * @param locationId - Location ID
   * @param invoiceId - Invoice ID
   * @returns Object with body containing InvoiceTotalsDto
   */
  async getInvoiceTotals(
    locationId: number,
    invoiceId: number,
  ): Promise<{ body: InvoiceTotalsDto }> {
    try {
      // 1. Fetch and validate invoice
      const invoice = await this.invoiceDetailRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationId}`,
        );
      }

      // 2. Fetch line items with discounts
      const lineItems = await this.invoiceDetailRepository.getLineItemsWithDiscounts(
        invoiceId,
      );

      // 3. Calculate total discounts using cascade logic
      const discounts = this.discountCalculator.calculateTotalDiscounts(
        lineItems,
        invoice,
      );

      // 4. Get paid amount based on invoice type
      let paid: number;
      
      if (invoice.type === InvoiceType.PRO_FORMA_INVOICE) {
        // Pro-forma invoice: use applied payments + credit-used payments
        // Future note: keep the legacy non-regular invoice balance/status logic here
        // if this workflow is ever used again.
        const appliedPayments = await this.invoiceDetailRepository.getInvoiceAppliedPayments(
          invoiceId,
        );
        const creditUsedPayments = await this.invoiceDetailRepository.getInvoiceCreditUsedPayments(
          invoiceId,
        );
        
        // For pro-forma, balance calculation is different
        // We'll let the transformation service handle this
        paid = appliedPayments + creditUsedPayments;
      } else {
        // Regular invoice: use total paid amount
        paid = await this.invoiceDetailRepository.getInvoicePaidAmount(invoiceId);
      }

      // 5. Transform to DTO with formatting and balance tolerance
      const totals = this.totalsTransformationService.transformToDto(
        invoice,
        discounts,
        paid,
      );

      return {
        body: totals,
      };
    } catch (error) {
      console.error('Error in getInvoiceTotals service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve invoice totals: ${error.message}`,
      );
    }
  }

  /**
   * Get invoice message (notes/printed notes section)
   * @param locationId - Location ID
   * @param locationSlug - Location slug
   * @param invoiceId - Invoice ID
   * @returns Object with body containing message string
   */
  async getInvoiceMessage(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
  ): Promise<InvoiceMessageResponse> {
    try {
      const invoice = await this.invoiceDetailRepository.findInvoiceById(locationId, invoiceId);

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      return {
        body: {
          id: invoice.id,
          message: invoice.notes || '',
        },
      } as InvoiceMessageResponse;
    } catch (error) {
      console.error('Error in getInvoiceMessage service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve invoice message: ${error.message}`,
      );
    }
  }

  /**
   * Get available customers for assignment to invoice
   * Returns a paginated list of customers that can be attached to the invoice
   * Excludes current customer if already assigned
   * 
   * @param locationId - Location ID
   * @param locationSlug - Location slug
   * @param invoiceId - Invoice ID
   * @param query - Query parameters (page, limit, search, showAll)
   * @returns Object with body (customer list) and pagination info
   */
  async getAvailableCustomers(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    query: AvailableCustomersRequestDto,
  ): Promise<AvailableCustomersDataDto> {
    try {
      // 1. Validate invoice exists in location
      const invoice = await this.invoiceDetailRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // 2. Get available customers (exclude current customer if assigned)
      const { customers, total } = await this.invoiceDetailRepository.getAvailableCustomers(
        locationId,
        invoice.userId, // Exclude current customer
        query.page || 1,
        query.limit || 20,
        query.search,
        query.showAll || false,
        query.sort || 'lastname',
        query.order || 'ASC',
      );

      // 3. Transform customers to response DTOs
      const body = customers.map(customer =>
        plainToInstance(AvailableCustomerItemDto, {
          id: customer.id,
          firstName: customer.firstName || '',
          lastName: customer.lastName || '',
          email: customer.email || '',
          balance: formatCurrency(Number(customer.balance) || 0),
          students: customer.students || '',
        }, { excludeExtraneousValues: true }),
      );

      // 4. Return paginated response
      const pagination = {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        totalPages: Math.ceil(total / (query.limit || 20)),
      };

      return { body, pagination };
    } catch (error) {
      console.error('Error in getAvailableCustomers service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to retrieve available customers: ${error.message}`,
      );
    }
  }
}
