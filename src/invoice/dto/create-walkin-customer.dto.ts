import { IsNotEmpty, IsString, IsEmail, IsOptional, MinLength, MaxLength, IsIn, IsNumber } from 'class-validator';
import { Transform, Expose } from 'class-transformer';

// ============================================
// REQUEST DTO
// ============================================

/**
 * Request DTO for creating a walk-in customer and assigning to invoice
 * POST /admin/v2/:location/invoices/:id/walkin
 */
export class CreateWalkinCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(255, { message: 'First name must not exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(255, { message: 'Last name must not exceed 255 characters' })
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Email must not exceed 255 characters' })
  @Transform(({ value }) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return undefined;
    }
    return value.trim();
  })
  email?: string;
}


/**
 * Response DTO for walk-in customer creation
 */
export class CreateWalkinResponseDto {
  @Expose()
  id: number;

  @Expose()
  customerId: number;

  @Expose()
  customerName: string;

  @Expose()
  email: string;

  // Echoed back from request: 1 = existing customer, 2 = walk-in customer.
  @Expose()
  type: 1 | 2;
}
