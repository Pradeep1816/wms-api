import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CacheService } from '../../cache/cache.service';
import { CustomerBalanceCalculationRepository } from '../../customer/repositories/customer-balance-calculation.repository';

export interface RecalculateCustomerBalanceOptions {
  manager?: EntityManager;
  locationSlug?: string;
  updatedByUserId?: number;
}

@Injectable()
export class CustomerBalanceRecalculatorService {
  constructor(
    private readonly customerBalanceCalculationRepository: CustomerBalanceCalculationRepository,
    private readonly cacheService: CacheService,
  ) {}

  async recalculateAndPersist(
    customerId: number,
    options: RecalculateCustomerBalanceOptions = {},
  ): Promise<number> {
    const balance = await this.customerBalanceCalculationRepository.calculateBalance(
      customerId,
      options.manager,
    );

    await this.customerBalanceCalculationRepository.upsertCustomerAccountBalance(
      customerId,
      balance,
      {
        manager: options.manager,
        updatedByUserId: options.updatedByUserId,
      },
    );

    if (options.locationSlug) {
      await this.cacheService.forget(`customer:list:${options.locationSlug}:default`);
    }

    return balance;
  }
}
