import { Expose, Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class MergeCustomerPreviewRequestDto {
    @Expose()
    @IsNotEmpty()
    @Transform(({ value }) => Number(value))
    @IsInt()
    @Min(1)
    customerId: number;
}


