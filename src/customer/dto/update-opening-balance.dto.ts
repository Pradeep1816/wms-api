import { IsNumber, IsBoolean, IsNotEmpty, Min } from 'class-validator';

export class UpdateOpeningBalanceDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.1)
  amount: number; // Opening balance amount

  @IsBoolean()
  @IsNotEmpty()
  isCredit: boolean; // true for credit, false for debit
}
