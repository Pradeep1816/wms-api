import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import {
  PaymentFrequencyDataDto,
  PaymentFrequencyResponseDto,
} from '../dto/payment-frequency-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PaymentFrequencyService {
  constructor(private readonly paymentQueryRepository: PaymentQueryRepository) {}

  async getPaymentFrequencies(
    locationSlug: string,
  ): Promise<PaymentFrequencyResponseDto> {
    try {
      const paymentFrequencies =
        await this.paymentQueryRepository.getPaymentFrequencies();
      const items = plainToInstance(PaymentFrequencyDataDto, paymentFrequencies, {
        excludeExtraneousValues: true,
      });

      return { body: items };
    } catch (error) {
      throw new BadRequestException(
        `Failed to retrieve payment frequencies: ${error.message}`,
      );
    }
  }
}
