import { BadRequestException, Injectable } from "@nestjs/common";
import { ReceiceInvoiceCreditDataDto, ReceiceInvoiceCreditsResponseDto } from "../dto/receive-invoice-credit-response.dto";
import { CustomerValidationService } from "../../shared/services/customer-validation.service";
import { CustomerInvoiceRepository } from "../repositories/customer-invoice.repository";
import { ReceiveInvoiceCreditRequestDto } from "../dto/receive-invoice-credit.request.dto";
import { plainToInstance } from "class-transformer";
import { CustomerInvoiceCalculationService } from "./calculations/customer-invoice-calculation.service";

@Injectable()
export class ReceivePaymentInvoiceCreditService {
    constructor(
        private readonly customerInvoiceRepository: CustomerInvoiceRepository,
        private readonly validationService: CustomerValidationService,
        private readonly customerInvoiceCalculationService: CustomerInvoiceCalculationService,
    ) { }

    async getInvoiceCredits(locationSlug: string, customerId: number, query?: ReceiveInvoiceCreditRequestDto): Promise<ReceiceInvoiceCreditsResponseDto> {
        try {
            const page = query?.page || 1;
            const limit = query?.limit || 10;
            const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);
            const { invoices, total } = await this.customerInvoiceRepository.getInvoiceCredits(customerId, page, limit);

            const transformedInvoiceCredits = invoices.map(invoice => {
                const dto = plainToInstance(ReceiceInvoiceCreditDataDto, {
                    id: invoice.id,
                    type: "Invoice Credit",
                    reference: `I-${invoice.invoiceNumber.toString().padStart(5, '0')}`,
                    amount: Math.abs(Number(invoice.balance)),
                    payment: Math.abs(Number(invoice.balance)),
                });
                return {
                    id: dto.id,
                    type: dto.type,
                    reference: dto.reference,
                    amount: dto.amount,
                    payment: dto.payment,
                };
            });

            const pagination = this.customerInvoiceCalculationService.calculatePagination(total, page, limit);

            return {
                body: transformedInvoiceCredits,
                pagination: pagination,
            };
        } catch (error) {
            console.error('Error in getInvoiceCredits service:', error);
            throw new BadRequestException(`${error.message}`);
        }
    }
}