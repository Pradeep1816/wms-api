import BigNumber from 'bignumber.js';

/**
 * Centralized Rounding Utilities
 *
 * This utility provides consistent rounding methods across all API services
 * to ensure financial data consistency with the legacy system.
 *
 * Key Features:
 * - ROUND_HALF_UP
 * - Balance tolerance logic (±0.09 threshold)
 * - Currency formatting with tolerance
 * - Database threshold constants
 * - Exact decimal helpers for lesson pricing flows
 */

export class RoundingUtils {
    /**
     * Standard money scale used by the lesson calculators and DB rows.
     */
    static readonly MONEY_SCALE = 4;

    /**
     * Balance tolerance threshold - matches legacy system
     * Balances between -0.09 and +0.09 are treated as 0.00
     */
    static readonly BALANCE_TOLERANCE = 0.09;
    
    /**
     * Credit threshold for database queries
     */
    static readonly CREDIT_THRESHOLD = -0.1;
    
    /**
     * Outstanding threshold for database queries
     */
    static readonly OUTSTANDING_THRESHOLD = 0.09;

    /**
     * Convert a value into an exact decimal number.
     *
     * BigNumber keeps lesson math away from binary floating-point drift while
     * still letting callers decide when they want to round.
     */
    static decimal(value: BigNumber.Value = 0): BigNumber {
      if (value === null || value === undefined) {
        return new BigNumber(0);
      }

      const numeric = new BigNumber(value);
      return numeric.isFinite() ? numeric : new BigNumber(0);
    }

    /**
     * Convert a lesson duration string like `00:15:00` into exact decimal
     * hours.
     */
    static durationToHours(duration: string): BigNumber {
      if (!duration) {
        return this.decimal(0);
      }

      const parts = duration.split(':');
      if (parts.length !== 3) {
        return this.decimal(0);
      }

      const hours = Number(parts[0]) || 0;
      const minutes = Number(parts[1]) || 0;
      const seconds = Number(parts[2]) || 0;

      return this.decimal(hours)
        .plus(this.decimal(minutes).dividedBy(60))
        .plus(this.decimal(seconds).dividedBy(3600));
    }

    /**
     * Round a decimal value with BigNumber, keeping the requested precision
     * exact before it is converted back to a native number.
     */
    static roundDecimal(value: BigNumber.Value, precision: number = 2): number {
      return this.decimal(value)
        .decimalPlaces(precision, BigNumber.ROUND_HALF_UP)
        .toNumber();
    }

    /**
     * Subtract an applied amount from a stored total without converting either
     * operand through native JavaScript arithmetic first.
     */
    static calculateBalance(
      total: BigNumber.Value,
      applied: BigNumber.Value = 0,
      precision: number = 2,
    ): number {
      return this.roundDecimal(this.decimal(total).minus(applied), precision);
    }

    /**
     * Calculate unused payment credit from active invoice and lesson allocations.
     * Keep the final value at the payment table's four-decimal money scale.
     */
    static calculatePaymentBalance(
      paymentAmount: BigNumber.Value,
      invoiceUsed: BigNumber.Value = 0,
      lessonUsed: BigNumber.Value = 0,
    ): number {
      return this.calculateBalance(
        paymentAmount,
        this.decimal(invoiceUsed).plus(lessonUsed),
        this.MONEY_SCALE,
      );
    }

    /**
     * Clamp a prepaid lesson reduction so it never exceeds the remaining
     * lesson price and never goes below zero.
     */
    static prepaidReduction(
      prepaidValue: BigNumber.Value,
      remainingPrice: BigNumber.Value,
    ): BigNumber {
      const value = this.decimal(prepaidValue);
      const remaining = this.decimal(remainingPrice);

      if (remaining.lte(0)) {
        return this.decimal(0);
      }

      return BigNumber.min(value, remaining);
    }

    /**
     * Split a total into equally rounded shares while keeping the final share
     * as the remainder so the parts sum to the exact original total.
     */
    static splitAmountPreservingTotal(
      value: BigNumber.Value,
      parts: number,
    ): number[] {
      const count = Math.max(1, Math.floor(Number(parts) || 0));
      const total = this.decimal(value);

      if (count === 1) {
        return [this.roundDecimal(total, 2)];
      }

      const evenShare = this.decimal(total.dividedBy(count)).decimalPlaces(
        2,
        BigNumber.ROUND_HALF_UP,
      );
      const shares: number[] = [];
      let allocated = this.decimal(0);

      for (let index = 0; index < count - 1; index += 1) {
        shares.push(evenShare.toNumber());
        allocated = allocated.plus(evenShare);
      }

      shares.push(this.roundDecimal(total.minus(allocated), 2));
      return shares;
    }
  
    /**
     * Compatibility wrapper for exact decimal half-up rounding.
     * This keeps the public API stable while routing all money math through
     * the same BigNumber-based implementation.
     * 
     * @param value - The value to round
     * @param precision - Number of decimal places (default: 2)
     * @returns Rounded value
     */
    static roundHalfUp(value: number, precision: number = 2): number {
      return this.roundDecimal(value, precision);
    }

    /**
     * Lesson-specific rounding for borderline floating-point values.
     * This keeps lesson discount math stable while the shared rounder moves
     * to exact decimal behavior.
     *
     * @param value - The value to round
     * @param precision - Number of decimal places (default: 2)
     * @returns Rounded value
     */
    static roundHalfUpForLesson(value: number, precision: number = 2): number {
      if (isNaN(value) || !isFinite(value)) {
        return 0;
      }

      const factor = Math.pow(10, precision);
      const sign = value < 0 ? -1 : 1;
      const scaled = Math.abs(value) * factor;

      // Nudge borderline floating-point values over the half-way mark
      // before rounding, but only for lesson-specific money calculations.
      const rounded = Math.round(scaled + Number.EPSILON * scaled) / factor;
      return sign * rounded;
    }
  
    /**
     * Standard JavaScript rounding (for non-financial calculations)
     * 
     * @param value - The value to round
     * @param precision - Number of decimal places (default: 2)
     * @returns Rounded value
     */
    static round(value: number, precision: number = 2): number {
      if (isNaN(value) || !isFinite(value)) {
        return 0;
      }
      
      const factor = Math.pow(10, precision);
      return Math.round(value * factor) / factor;
    }
  
    /**
     * Apply balance tolerance logic - matches legacy CustomFormatter::asBalance()
     * Balances between -0.09 and +0.09 are rounded to 0.00
     * 
     * @param value - The balance value
     * @returns Value with tolerance applied
     */
    static applyBalanceTolerance(value: number): number {
      const rounded = this.roundHalfUp(value);
      if (rounded <= this.BALANCE_TOLERANCE && rounded >= -this.BALANCE_TOLERANCE) {
        return 0.00;
      }
      return rounded;
    }

    /**
     * Lesson-specific balance tolerance helper.
     *
     * @param value - The balance value
     * @returns Value with lesson-specific tolerance applied
     */
    static applyBalanceToleranceForLesson(value: number): number {
      const rounded = this.roundHalfUpForLesson(value);
      if (rounded <= this.BALANCE_TOLERANCE && rounded >= -this.BALANCE_TOLERANCE) {
        return 0.00;
      }
      return rounded;
    }
  
    /**
     * Format currency with balance tolerance applied
     * 
     * @param value - The monetary value
     * @param applyTolerance - Whether to apply balance tolerance (default: true)
     * @returns Formatted currency string
     */
    static formatCurrency(value: number, applyTolerance: boolean = true): string {
      const processedValue = applyTolerance ? this.applyBalanceTolerance(value) : this.roundHalfUp(value);
      return `$${processedValue.toFixed(2)}`;
    }
  
    /**
     * Format currency without tolerance (for calculations)
     * 
     * @param value - The monetary value
     * @returns Formatted currency string
     */
    static formatCurrencyNoTolerance(value: number): string {
      return `$${this.roundHalfUp(value).toFixed(2)}`;
    }
  
    /**
     * Round for display purposes (with tolerance)
     * 
     * @param value - The value to round
     * @returns Rounded value with tolerance applied
     */
    static roundForDisplay(value: number): number {
      return this.applyBalanceTolerance(value);
    }
  
    /**
     * Round for calculation purposes (without tolerance)
     * 
     * @param value - The value to round
     * @returns Rounded value without tolerance
     */
    static roundForCalculation(value: number): number {
      return this.roundHalfUp(value);
    }
  
    /**
     * Round for database storage
     * 
     * @param value - The value to round
     * @returns Rounded value for database storage
     */
    static roundForDatabase(value: number): number {
      return this.roundHalfUp(value);
    }
  
    /**
     * Check if a balance should be considered zero based on tolerance
     * 
     * @param value - The balance value
     * @returns True if balance should be treated as zero
     */
    static isBalanceZero(value: number): boolean {
      const rounded = this.roundHalfUp(value);
      return rounded <= this.BALANCE_TOLERANCE && rounded >= -this.BALANCE_TOLERANCE;
    }
  
    /**
     * Get database threshold for credit queries
     * 
     * @returns Credit threshold value
     */
    static getCreditThreshold(): number {
      return this.CREDIT_THRESHOLD;
    }
  
    /**
     * Get database threshold for outstanding queries
     * 
     * @returns Outstanding threshold value
     */
    static getOutstandingThreshold(): number {
      return this.OUTSTANDING_THRESHOLD;
    }
  
    /**
     * Round array of values consistently
     * 
     * @param values - Array of values to round
     * @param applyTolerance - Whether to apply tolerance (default: false)
     * @returns Array of rounded values
     */
    static roundArray(values: number[], applyTolerance: boolean = false): number[] {
      return values.map(value => 
        applyTolerance ? this.applyBalanceTolerance(value) : this.roundHalfUp(value)
      );
    }
  
    /**
     * Calculate sum with proper rounding
     * 
     * @param values - Array of values to sum
     * @param applyTolerance - Whether to apply tolerance to final result (default: false)
     * @returns Properly rounded sum
     */
    static sum(values: number[], applyTolerance: boolean = false): number {
      const sum = values.reduce((acc, val) => acc + (isNaN(val) ? 0 : val), 0);
      return applyTolerance ? this.applyBalanceTolerance(sum) : this.roundHalfUp(sum);
    }
  }
  

  export const RoundingHelper  = {
   
    round: (value: number, precision: number = 2) => RoundingUtils.roundHalfUp(value, precision),
    
   
    formatCurrency: (value: number) => RoundingUtils.formatCurrency(value),
   
    applyTolerance: (value: number) => RoundingUtils.applyBalanceTolerance(value),
  };
  
