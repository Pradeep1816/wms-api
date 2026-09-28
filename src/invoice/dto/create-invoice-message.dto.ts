import { IsString, IsNotEmpty } from 'class-validator';
import { Expose } from 'class-transformer';

/**
 * Request DTO for creating an invoice message.
 */
export class CreateInvoiceMessageRequestDto {
    @IsString()
    @IsNotEmpty({ message: 'Message cannot be empty' })
    message: string;
}

/**
 * Response info for create invoice message.
 */
export class CreateInvoiceMessageInfo {
    @Expose()
    id: number;

    @Expose()
    message: string;
}

/**
 * Response DTO for create invoice message.
 */
export class CreateInvoiceMessageResponseDto {
    @Expose()
    body: CreateInvoiceMessageInfo;
}
