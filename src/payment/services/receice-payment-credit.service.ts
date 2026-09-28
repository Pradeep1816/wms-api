import { CustomerValidationService } from "../../shared/services/customer-validation.service";
import { PaymentQueryRepository } from "../repositories/payment.repository";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ReceicePaymentsCreditsRequestDto } from "../dto/receice-payments-credits-request.dto";
import { PaymentCalculationService } from "./calculation/payment-calculation.service";
import { ReceicePaymentsCreditDataDto, ReceicePaymentsCreditsResponseDto } from "../dto/receice-payments-credits-response.dto";
import { plainToInstance } from "class-transformer";
import { DataSource } from "typeorm";
import { RoyaltyTransactionRepository } from "../repositories/royalty-transaction.repository";
import { RoundingUtils } from "../../utils/rounding.utils";

@Injectable()
export class ReceicePaymentCreditService {
  constructor(
    private readonly paymentRepository: PaymentQueryRepository,
    private readonly validationService: CustomerValidationService,
    private readonly calculationService: PaymentCalculationService,
    private readonly dataSource: DataSource,
    private readonly royaltyTransactionRepository: RoyaltyTransactionRepository,
  ) {}

  async receivePaymentCredits(locationSlug: string, customerId: number, query?: ReceicePaymentsCreditsRequestDto): Promise<ReceicePaymentsCreditsResponseDto> {
    try {
      // Validate location and customer
      const { locationId } = await this.validationService.validateLocationAndCustomer(locationSlug, customerId);
      
      // Get payment credits with pagination
      const { payments, total } = await this.paymentRepository.getPaymentCredits(
        customerId, 
        query?.page || 1, 
        query?.limit || 10
      );


      // Transform payments to match DTO structure
      const transformedPaymentCredits = await Promise.all(payments.map(async payment => {
        const royaltyBalances =
          await this.royaltyTransactionRepository.findRecognitionBalancesReadOnly(
            this.dataSource.manager,
            payment.id,
            locationId,
          );
        const royaltyPurposes = Array.from(
          royaltyBalances.reduce((grouped, balance) => {
            const categoryId = Number(balance.transaction.itemCategoryId);
            const existing = grouped.get(categoryId);
            if (existing) {
              existing.amount =
                RoundingUtils.roundDecimal(
                  existing.amount + balance.remainingPaymentAmount,
                  2,
                );
            } else {
              grouped.set(categoryId, {
                itemCategoryId: categoryId,
                categoryName: balance.transaction.categoryName,
                rateApplied: Number(balance.transaction.rateApplied),
                amount:
                  RoundingUtils.roundDecimal(balance.remainingPaymentAmount, 2),
              });
            }
            return grouped;
          }, new Map<number, {
            itemCategoryId: number;
            categoryName: string;
            rateApplied: number;
            amount: number;
          }>()),
        ).map(([, purpose]) => purpose);
        const dto = plainToInstance(ReceicePaymentsCreditDataDto, {
          id: payment.id,
          type:'payment Credit',
          reference: payment.reference,
          amount: Number(payment.balance),
          payment: Number(payment.balance),
          royaltyPurposes,
        });
        
        return {
          id: dto.id,
          type: dto.type,
          reference: dto.reference,
          amount: dto.amount,
          payment: dto.payment,
          royaltyPurposes: dto.royaltyPurposes,
        };
      }));
      
      // Calculate pagination
      const pagination = this.calculationService.calculatePagination(
        total,
        query?.page || 1,
        query?.limit || 10
      );
      
      return {
        body: transformedPaymentCredits,
        pagination: pagination,
      };
    } catch (error) {
      console.error('Error in receivePaymentCredits service:', error);
      throw new BadRequestException(`${error.message}`);
    }
  }
}
