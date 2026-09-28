import { Injectable } from '@nestjs/common';

@Injectable()
export class UpcValidatorService {
  /**
   * Validates if the code is a valid 12-digit UPC format.
   * Kept for a future strict UPC phase.
   */
  isValidUpcFormat(code: string): boolean {
    return /^\d{12}$/.test(code);
  }

  /**
   * Validates UPC checksum using standard UPC-A algorithm.
   * Kept for a future strict UPC phase.
   */
  validateUpcChecksum(code: string): boolean {
    if (!this.isValidUpcFormat(code)) {
      return false;
    }

    const digits = code.split('').map(Number);
    const checkDigit = digits[11];

    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }

    const calculatedCheck = (10 - (sum % 10)) % 10;
    return calculatedCheck === checkDigit;
  }

  validate(code: string): { valid: boolean; error?: string } {
    if (!code || code.trim() === '') {
      return {
        valid: false,
        error: 'Item code cannot be blank',
      };
    }

    // Phase 1/2 contract: accept any non-empty item code.
    // Strict UPC-A checksum validation is intentionally deferred.
    return { valid: true };
  }
}
