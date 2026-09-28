import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Invoice } from '../../entities/invoice.entity';
import {
  InvoiceListItemDto,
  InvoiceListDataDto,
} from '../../dto/invoice-list-response.dto';
import { formatDate } from '../../../utils/date-utils';
import { formatCurrency, formatPhoneNumber } from '../../../utils/formatters';

@Injectable()
export class InvoiceListTransformationService {
  /**
   * Transform invoice entity to Invoice list DTO
   */
  transformToDto(invoice: Invoice, rawData?: any): InvoiceListItemDto {
    const dtoData = {
      id: invoice.id,
      number: this.formatInvoiceNumber(invoice.invoiceNumber),
      date: invoice.date ? formatDate(new Date(invoice.date)) : '',
      customer: this.getCustomerName(invoice),
      student: this.getStudentName(rawData),
      phone: this.getPhoneNumber(rawData),
      status: invoice.getStatus(),
      total: formatCurrency(Number(invoice.total) || 0),
    };

    return plainToInstance(InvoiceListItemDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Transform multiple invoices to DTOs
   */
  transformToDtos(
    invoices: Invoice[],
    rawDataMap?: Map<number, any>,
  ): InvoiceListItemDto[] {
    return invoices.map((invoice) =>
      this.transformToDto(invoice, rawDataMap?.get(invoice.id)),
    );
  }

  /**
   * Transform invoices data to InvoiceListDataDto
   */
  transformInvoicesData(
    invoices: Invoice[],
    total: number,
    page: number,
    limit: number,
    rawDataMap?: Map<number, any>,
  ): InvoiceListDataDto {
    const formattedInvoices = this.transformToDtos(invoices, rawDataMap);
    const totalPages = Math.ceil(total / limit);

    const dtoData = {
      body: formattedInvoices,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };

    return plainToInstance(InvoiceListDataDto, dtoData, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Format invoice number with prefix and padding
   * Format: I-00001
   */
  private formatInvoiceNumber(invoiceNumber: number): string {
    const paddedNumber = String(invoiceNumber).padStart(5, '0');
    return `I-${paddedNumber}`;
  }

  /**
   * Get customer name from invoice
   */
  private getCustomerName(invoice: Invoice): string {
    const profile = invoice.user?.profile;

    if (profile?.firstname && profile?.lastname) {
      return `${profile.firstname} ${profile.lastname}`;
    }

    return profile?.firstname || '';
  }

  /**
   * Get student name from raw data
   */
  private getStudentName(rawData?: any): string {
    if (!rawData) return '';

    if (rawData.studentName) {
      return rawData.studentName;
    }

    const firstName = rawData.studentFirstName || '';
    const lastName = rawData.studentLastName || '';

    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }

    return firstName || '';
  }

  /**
   * Get phone number from raw data
   */
  private getPhoneNumber(rawData?: any): string {
    if (!rawData?.phoneNumber) return '';
    return formatPhoneNumber(rawData.phoneNumber);
  }
}
