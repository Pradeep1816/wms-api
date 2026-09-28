import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoyaltyTransaction } from './entities/royalty-transaction.entity';
import { RoyaltyTransactionRepository } from './repositories/royalty-transaction.repository';
import { RoyaltyLedgerService } from './services/royalty-ledger.service';
import { PaymentRoyaltyRecognitionRepository } from './repositories/payment-royalty-recognition.repository';
import { RoyaltyPaymentCorrectionService } from './services/royalty-payment-correction.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoyaltyTransaction])],
  providers: [
    RoyaltyTransactionRepository,
    PaymentRoyaltyRecognitionRepository,
    RoyaltyLedgerService,
    RoyaltyPaymentCorrectionService,
  ],
  exports: [
    RoyaltyTransactionRepository,
    PaymentRoyaltyRecognitionRepository,
    RoyaltyLedgerService,
    RoyaltyPaymentCorrectionService,
  ],
})
export class RoyaltyLedgerModule {}
