import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosTransaction } from './entities/pos-transaction.entity';
import { PosTransactionLineItem } from './entities/pos-transaction-line-item.entity';
import { Item } from '../item/entities/item.entity';
import { LocationWalkinCustomer } from '../location/entities/location-walkin-customer.entity';
import { ItemLocationStock } from '../item/entities/item-location-stock.entity';
import { ItemCategory } from '../item/entities/item-category.entity';
import { PosTransactionController } from './pos-transaction.controller';
import { PosTransactionService } from './pos-transaction.service';
import { UpcValidatorService } from './services/upc-validator.service';
import { LocationModule } from '../location/location.module';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';
import { TaxModule } from '../tax/tax.module';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosTransaction,
      PosTransactionLineItem,
      Item,
      LocationWalkinCustomer,
      ItemLocationStock,
      ItemCategory,
    ]),
    LocationModule,
    AuthModule,
    SharedModule,
    TaxModule,
    InvoiceModule,
  ],
  controllers: [PosTransactionController],
  providers: [PosTransactionService, UpcValidatorService],
  exports: [PosTransactionService],
})
export class PosModule {}
