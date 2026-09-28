import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PosTransactionReversalType } from '../entities/pos-transaction.entity';

export class ReversePosTransactionDto {
  @IsEnum(PosTransactionReversalType)
  type: PosTransactionReversalType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
