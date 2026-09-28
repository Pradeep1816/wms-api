import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InvoiceLineItemDiscount } from '../entities/invoice-line-item-discount.entity';

@Injectable()
export class InvoiceLineItemDiscountRepository {
  constructor(
    @InjectRepository(InvoiceLineItemDiscount)
    private readonly discountRepository: Repository<InvoiceLineItemDiscount>,
  ) {}

  async findByLineItemId(lineItemId: number): Promise<InvoiceLineItemDiscount[]> {
    return this.discountRepository.find({
      where: { invoiceLineItemId: lineItemId },
    });
  }

  async upsertDiscount(
    lineItemId: number,
    type: number,
    value: number,
    valueType: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(InvoiceLineItemDiscount)
      : this.discountRepository;

    let discount = await repo.findOne({
      where: { invoiceLineItemId: lineItemId, type },
    });

    if (!discount) {
      discount = repo.create({
        invoiceLineItemId: lineItemId,
        type,
        value,
        valueType,
      });
    } else {
      discount.value = value;
      discount.valueType = valueType;
    }

    await repo.save(discount);
  }
}
