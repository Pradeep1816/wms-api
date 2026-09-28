import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from '../entities/payment-method.entity';
import { CustomerValidationService } from '../../shared/services/customer-validation.service';
import { PaymentQueryRepository } from '../repositories/payment.repository';
import { PaymentMethodDataDto, PaymentMethodResponseDto } from '../dto/payment-method-response.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PaymentMethodService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepository: Repository<PaymentMethod>,
    private readonly validationService: CustomerValidationService,
    private readonly paymentQueryRepository: PaymentQueryRepository,
  ) {}

  async getPaymentMethods(locationSlug: string): Promise<PaymentMethodResponseDto> {
    try {
      // Validate location exists (keeps API shape consistent across routes)
        // await this.validationService.validateLocationExists(locationSlug);

      const paymentMethods = await this.paymentQueryRepository.getPaymentMethods();
      const items = plainToInstance(PaymentMethodDataDto, paymentMethods, { excludeExtraneousValues: true });
      
      return { body: items };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve payment methods: ${error.message}`);
    }
  }
}


