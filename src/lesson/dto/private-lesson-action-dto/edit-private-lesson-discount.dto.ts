import { Type } from "class-transformer";
import { IsOptional, Min, Max, IsNumber, IsArray, ArrayNotEmpty, IsInt, IsIn } from "class-validator";

export class EditPrivateLessonDiscountDto {

        @IsArray()
        @ArrayNotEmpty()
        @Type(() => Number)
        @IsInt({ each: true })
        lessonIds: number[];
      
        @IsOptional()
        @Type(() => Number)
        @IsNumber()
        @Min(0)
        @Max(100)
        customerDiscount?: number;
      
        @IsOptional()
        @Type(() => Number)
        @IsNumber()
        @Min(0)
        @Max(100)
        paymentFrequencyDiscount?: number;
      
        @IsOptional()
        @Type(() => Number)
        @IsNumber()
        @Min(0)
        @Max(100)
        multiEnrolmentDiscount?: number;
      
        @IsOptional()
        @Type(() => Number)
        @IsNumber()
        @Min(0)
        @Max(100)
        lineItemDiscount?: number;
      
        @IsOptional()
        @Type(() => Number)
        @IsNumber()
        @IsIn([0, 1]) // 0 = $, 1 = %
        lineItemDiscountValueType?: number;
  }
