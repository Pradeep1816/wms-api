import { Injectable } from '@nestjs/common';
import { TaxRepository } from '../../tax/repositories/tax.repository';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface RentalCalculationParams {
  price: number;
  startDate: Date;
  duration?: number;
  isOnGoing?: boolean | number;
}

export interface RentalCalculationResult {
  total: string;
  taxRate: number;
  monthlyRate: string;
  numberOfMonths: string;
}

@Injectable()
export class EquipmentRentalInstrumentCalculatorService {
  constructor(
    private readonly taxRepository: TaxRepository,
  ) {}

  /**
   * Calculate tax rate based on taxStatusId and provinceId
   * Fetches the rate dynamically from the database via repository
   * @param taxStatusId - Tax status ID
   * @param provinceId - Province ID for location-specific tax rates
   * @returns Tax rate as percentage, or 0 if not found
   */
  async calculateTaxRate(taxStatusId?: number, provinceId?: number): Promise<number> {
    const statusId = taxStatusId || 1; // Default to 1 (STATUS_DEFAULT = 13% HST)
    
    // Require provinceId for tax rate calculation
    if (!provinceId) {
      console.warn(`ProvinceId not provided for tax rate calculation. taxStatusId: ${statusId}`);
      return 0;
    }

    // Use repository to get tax rate from database
    const taxRate = await this.taxRepository.getTaxRateByTaxStatusAndProvince(statusId, provinceId);

    // Return tax rate from database, or 0 if not found
    return taxRate !== null ? taxRate : 0;
  }

  /**
   * Calculate prorated amount for the first month
   * Used when start date is after the 7th of the month
   * @param price - Monthly price
   * @param startDate - Rental start date
   * @returns Prorated amount (rounded using double rounding)
   */
  private calculateProrate(price: number, startDate: Date): number {
    const lastDateOfMonth = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const diffDate = lastDateOfMonth.getTime() - startDate.getTime(); // milliseconds
    const days = diffDate / (1000 * 60 * 60 * 24); // Convert to days (float)
    const day = Math.round(days) + 1;
    const lastDay = lastDateOfMonth.getDate(); // Last day of month (28-31)
    
    //  calculation: price / lastDay * day
    let prorate = (price / lastDay) * day;
    
    //  double rounding: toFixed(3) then toFixed(2)
    prorate = RoundingUtils.roundDecimal(prorate, 3);
    prorate = RoundingUtils.roundDecimal(prorate, 2);
    
    return prorate;
  }

  /**
   * Calculate instrument total with proration logic
   * @param params - Rental calculation parameters
   * @returns Calculated total amount
   */
  calculateInstrumentTotal(params: RentalCalculationParams): number {
    const { price, startDate, duration, isOnGoing } = params;
    const priceNum = price || 0;
    
    // Determine if ongoing rental
    const isOngoing = isOnGoing === true || isOnGoing === 1;
    
    const startDateObj = new Date(startDate);
    const dayOfMonth = startDateObj.getDate(); // Day of month (1-31)
    
    let instrumentTotal = 0;
    
    if (!isOngoing) {
      // Fixed duration rental
      if (dayOfMonth <= 7) {
        // Start date <= 7th: simple calculation 
        instrumentTotal = priceNum * (duration || 1);
      } else {
        // Start date > 7th: prorated 
        const prorate = this.calculateProrate(priceNum, startDateObj);
        // calculation: prorate + price * rentalDuration
        instrumentTotal = prorate + (priceNum * (duration || 1));
      }
    } else {
      // Ongoing rental
      if (dayOfMonth <= 7) {
        // Start date <= 7th: simple calculation
        instrumentTotal = priceNum;
      } else {
        // Start date > 7th: prorated
        const prorate = this.calculateProrate(priceNum, startDateObj);
        // calculation: prorate + price
        instrumentTotal = prorate + priceNum;
      }
    }
    
    return instrumentTotal;
  }

  /**
   * Calculate all rental instrument values
   * @param params - Rental calculation parameters
   * @param taxStatusId - Tax status ID for tax rate calculation
   * @param provinceId - Province ID for location-specific tax rates
   * @returns Complete calculation result
   */
  async calculateRentalInstrument(
    params: RentalCalculationParams,
    taxStatusId?: number,
    provinceId?: number,
  ): Promise<RentalCalculationResult> {
    const { price, duration, isOnGoing } = params;
    const priceNum = price || 0;
    
    // Calculate monthly rate
    const monthlyRate = !isNaN(priceNum)
      ? RoundingUtils.roundDecimal(priceNum, 2).toFixed(2)
      : '0.00';
    
    // Calculate number of months
    const numberOfMonths = duration ? duration.toString() : '1';
    
    // Calculate instrument total
    const instrumentTotal = this.calculateInstrumentTotal(params);
    
    // Final rounding to 2 decimals
    const total = !isNaN(instrumentTotal)
      ? RoundingUtils.roundDecimal(instrumentTotal, 2).toFixed(2)
      : '0.00';
    
    // Calculate tax rate (async database lookup via repository)
    const taxRate = await this.calculateTaxRate(taxStatusId, provinceId);
    
    return {
      total,
      taxRate,
      monthlyRate,
      numberOfMonths,
    };
  }
}
