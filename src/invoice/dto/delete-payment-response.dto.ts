import { Expose } from 'class-transformer';

/**
 * Response DTO for Delete Payment API
 */
export class DeletePaymentResponseDto {
  @Expose()
  id: number;
}
