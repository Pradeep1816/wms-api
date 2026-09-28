import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProFormaInvoiceRepository } from '../repositories/pro-forma-invoice.repository';
import { ProFormaInvoiceRequestDto } from '../dto/pro-forma-invoice-request.dto';
import { ProFormaInvoiceDto, ProFormaInvoicesDataDto } from '../dto/pro-forma-invoice-response.dto';
import { formatDateWithTime } from '../../utils/date-utils';

@Injectable()
export class ProFormaInvoiceService {
  constructor(
    private readonly proFormaInvoiceRepository: ProFormaInvoiceRepository,
  ) {}

  async getProFormaInvoicesByCustomerId(
    locationSlug: string,
    customerId: number,
    query: ProFormaInvoiceRequestDto,
  ): Promise<ProFormaInvoicesDataDto> {
    try {
      // Get location
      const location = await this.proFormaInvoiceRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new NotFoundException(`Location not found: ${locationSlug}`);
      }

      // Get customer
      const customer = await this.proFormaInvoiceRepository.findCustomerByIdAndLocation(
        customerId,
        location.id,
      );
      if (!customer) {
        throw new NotFoundException(`Customer not found: ${customerId}`);
      }

      // Get pro-forma invoices with pagination
      const { invoices, total } = await this.proFormaInvoiceRepository.getProFormaInvoicesByCustomerId(
        customerId,
        location.id,
        query.page,
        query.limit,
      );

      // Transform invoices to DTOs
      const invoiceData: ProFormaInvoiceDto[] = invoices.map(invoice => 
        this.transformProFormaInvoiceToDto(invoice)
      );

      // Calculate pagination
      const { page = 1, limit = 10 } = query;
      const totalPages = Math.ceil(total / limit);

      return {
        body: invoiceData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getProFormaInvoicesByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve pro-forma invoices: ${error.message}`);
    }
  }

  /**
   * Transform pro-forma invoice to DTO
   */
  private transformProFormaInvoiceToDto(invoice: any): ProFormaInvoiceDto {
    // Format date
    const invoiceDate = new Date(invoice.date);
    
    // Get status 
    const status = invoice.getStatus();

    // Get student name and payment frequency from repository data
    const studentName = this.getStudentNameFromInvoice(invoice);
    const paymentFrequency = invoice.proformaPaymentFrequency?.paymentFrequencyId || 'N/A';

    return {
      id: invoice.id,
      studentName: studentName,
      date: formatDateWithTime(invoiceDate),
      status: status,
      paymentFrequency: paymentFrequency,
      total: parseFloat(invoice.total?.toString() || '0'),
    };
  }

  /**
   * Get student name from invoice line items
   */
  private getStudentNameFromInvoice(invoice: any): string {
    if (invoice.lineItems && invoice.lineItems.length > 0) {
      const lineItem = invoice.lineItems[0];
      if (lineItem.invoiceItemEnrolment?.enrolment?.student) {
        const student = lineItem.invoiceItemEnrolment.enrolment.student;
        return `${student.firstName || ''} ${student.lastName || ''}`.trim();
      }
    }
    return '';
  }
}
