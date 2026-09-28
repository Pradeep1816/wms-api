import { IsNotEmpty, IsNumber, IsOptional, IsString, IsBoolean, IsIn, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Expose } from 'class-transformer';

// ============================================
// REQUEST DTOs
// ============================================

/**
 * Request DTO for fetching available customers for invoice assignment
 * GET /admin/v2/:location/invoices/:id/available-customers
 */
export class AvailableCustomersRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string; // Search by first name, last name, email, or student name

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  @IsBoolean()
  showAll?: boolean = false; // If true, show all customers; if false, show only owing customers

  @IsOptional()
  @IsString()
  @IsIn(['firstname', 'lastname', 'email'])
  sort?: string = 'lastname'; // Sort field: firstname, lastname, email

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC'; // Sort order: ASC or DESC
}

/**
 * Request DTO for assigning customer to invoice
 * PATCH /admin/v2/:location/invoices/:id/customer
 */
export class AssignCustomerToInvoiceDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  customerId: number;
}

// ============================================
// RESPONSE DTOs
// ============================================

/**
 * Individual customer item in available customers list
 */
export class AvailableCustomerItemDto {
  @Expose()
  id: number;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  email: string;

  @Expose()
  balance: string;

  @Expose()
  students: string; // Comma-separated student names
}

/**
 * Response DTO for available customers list with pagination
 */
export class AvailableCustomersDataDto {
  @Expose()
  body: AvailableCustomerItemDto[];

  @Expose()
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Response DTO for assigning customer to invoice
 */
export class AssignCustomerResponseDto {
  @Expose()
  id: number;

  @Expose()
  customerId: number;

  @Expose()
  customerName: string;

  @Expose()
  email: string;

  @Expose()
  phoneNumber: string;

  /**
   * Hardcoded customer type: 1 = existing customer
   */
  @Expose()
  type: number = 1;
}
