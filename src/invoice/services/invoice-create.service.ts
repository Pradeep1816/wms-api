import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvoiceCreateRepository } from '../repositories/invoice-create.repository';
import { CreateBlankInvoiceRequestDto } from '../dto/create-blank-invoice-request.dto';
import { CreateBlankInvoiceResponseDto } from '../dto/create-blank-invoice-response.dto';
import { InvoiceType } from '../enums/invoice-type.enum';
import { formatDate } from '../../utils/date-utils';
import { formatCurrency } from '../../utils/formatters';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class InvoiceCreateService {
  constructor(
    private readonly invoiceCreateRepository: InvoiceCreateRepository,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Create a blank invoice with zero-dollar totals
   */
  async createBlankInvoice(
    locationId: number,
    requestDto: CreateBlankInvoiceRequestDto,
    currentUserId: number,
  ): Promise<CreateBlankInvoiceResponseDto> {
    try {
      // Determine customer and type
      let customerId: number;
      let invoiceType: number;

      if (requestDto.customer_id) {
        // Validate customer exists and belongs to location
        const isValid = await this.invoiceCreateRepository.validateCustomer(
          requestDto.customer_id,
          locationId,
        );

        if (!isValid) {
          throw new NotFoundException(
            `Customer with ID ${requestDto.customer_id} not found in this location`,
          );
        }

        // Validate type is provided when customer_id is provided
        if (!requestDto.type) {
          throw new BadRequestException(
            'Type is required when customer_id is provided',
          );
        }

        customerId = requestDto.customer_id;
        invoiceType = requestDto.type;
      } else {
        // Use walk-in customer and default type
        const walkinCustomerId =
          await this.invoiceCreateRepository.getWalkinCustomer(locationId);

        if (!walkinCustomerId) {
          throw new NotFoundException(
            'Walk-in customer not configured for this location',
          );
        }

        customerId = walkinCustomerId;
        invoiceType = InvoiceType.INVOICE; // Default to Invoice (type 2)
      }

      // Create invoice within transaction
      const invoice = await this.dataSource.transaction(async (manager) => {
        // 1. Create transaction record
        const transactionId =
          await this.invoiceCreateRepository.createTransaction(
            currentUserId,
            manager,
          );

        // 2. Get next invoice number
        const invoiceNumber =
          await this.invoiceCreateRepository.getNextInvoiceNumber(
            locationId,
            invoiceType,
            manager,
          );

        // 3. Create blank invoice
        return await this.invoiceCreateRepository.createBlankInvoice(
          transactionId,
          customerId,
          locationId,
          invoiceNumber,
          invoiceType,
          currentUserId,
          manager,
        );
      });

      // Format invoice number for display
      const formattedNumber = this.formatInvoiceNumber(
        invoice.invoiceNumber,
        invoice.type,
      );

      // Transform to response DTO
      return plainToInstance(
        CreateBlankInvoiceResponseDto,
        {
          id: invoice.id,
          invoiceNumber: formattedNumber,
          date: formatDate(invoice.date),
          status: invoice.status,
          type: invoice.type,
          total: formatCurrency(Number(invoice.total) || 0),
          balance: formatCurrency(Number(invoice.balance) || 0),
          userId: invoice.userId,
          locationId: invoice.locationId,
        },
        { excludeExtraneousValues: true },
      );
    } catch (error) {
      console.error('Error in createBlankInvoice service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to create blank invoice: ${error.message}`,
      );
    }
  }

  /**
   * Format invoice number with prefix and padding
   * Format: I-00001 (Invoice) or P-00001 (Pro-Forma)
   */
  private formatInvoiceNumber(invoiceNumber: number, type: number): string {
    const paddedNumber = String(invoiceNumber).padStart(5, '0');
    const prefix = type === InvoiceType.INVOICE ? 'I' : 'P';
    return `${prefix}-${paddedNumber}`;
  }
}
