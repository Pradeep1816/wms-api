import { Injectable } from '@nestjs/common';
import { AccountReceivableResponseDto, AccountReceivableTotalsDto, AccountReceivablePaginationDto } from '../dto/account-receivable-dto/account-receivable-response.dto';
import { AccountReceivableDataDto } from '../dto/account-receivable-dto/account-receivable-data.dto';
import { AccountReceivableRepository } from '../repositories/account-receivable.repository';
import { RoundingUtils } from '../../utils/rounding.utils';

@Injectable()
export class AccountReceivableService {
  constructor(
    private readonly accountReceivableRepository: AccountReceivableRepository,
  ) {}

  async getAccountReceivable(
    locationSlug: string,
    showAllActive: boolean | undefined = true,
    showAllInActive: boolean | undefined = true,
    page: number = 1,
    limit: number = 10,
  ): Promise<AccountReceivableResponseDto> {
    try {
      // Get location
      const location = await this.accountReceivableRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new Error(`Location not found: ${locationSlug}`);
      }

      // Get customers with non-zero account balance
      const customers = await this.getCustomersWithBalance(location.id, showAllActive, showAllInActive);
      
      // Calculate total count for pagination
      const totalCount = customers.length;
      const totalPages = Math.ceil(totalCount / limit);
      
      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedCustomers = customers.slice(offset, offset + limit);

      // Process each customer to get their account receivable data (optimized with batch queries)
      const customerData = await this.processCustomerDataBatch(paginatedCustomers);

      // Calculate totals using raw values
      const totals = this.calculateTotals(customerData);

      // Remove _raw property from customer data before returning
      const cleanedCustomerData = customerData.map(({ _raw, ...rest }) => rest);

      return {
        body: cleanedCustomerData,
        footer: totals,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
        },
      };
    } catch (error) {
      console.error(`[AccountReceivable] Error:`, error);
      throw error;
    }
  }

  private async getCustomersWithBalance(
    locationId: number,
    showAllActive: boolean | undefined,
    showAllInActive: boolean | undefined,
  ): Promise<any[]> {
    // Get all customers first
    const allCustomers = await this.accountReceivableRepository.getCustomersWithBalance(
      locationId,
      showAllActive,
      showAllInActive
    );

    // HYBRID APPROACH: Use batch queries for initial filtering, then individual queries for accuracy
    const customerIds = allCustomers.map(customer => customer.id);
    
    if (customerIds.length === 0) {
      console.log(`[DEBUG] No customers found`);
      return [];
    }

    const startTime = Date.now();

    // Step 1: Batch queries for initial filtering (fast)
    const [outstandingInvoices, prepaidLessons, credits] = await Promise.all([
      this.accountReceivableRepository.getBatchOutstandingInvoices(customerIds),
      this.accountReceivableRepository.getBatchPrePaidLessons(customerIds),
      this.accountReceivableRepository.getBatchCredits(customerIds)
    ]);

    // Step 2: Use batch results directly for performance (skip individual verification)
    const customersWithBalance: any[] = [];
    let activeCount = 0;
    let inactiveCount = 0;
    
      
    for (const customer of allCustomers) {
      const customerId = customer.id;
      const invoiceBalance = outstandingInvoices.get(customerId) || 0;
      const prePaidLessons = prepaidLessons.get(customerId) || 0;
      const unusedCredits = credits.get(customerId) || 0;
      const balance = invoiceBalance - (prePaidLessons + unusedCredits);
      
      // Apply legacy filtering logic
      let shouldInclude = balance != 0;
      
      // if (customer.status === 2) {
      //   // Active customers: include if balance is not zero
      //   shouldInclude = Math.abs(balance) > 0.01;
      // } else {
      //   // Inactive customers: exclude if both total and unusedCredits are zero
      //   // (This matches legacy behavior)
      //   shouldInclude = !(invoiceBalance === 0 && unusedCredits === 0);
      // }
      
      if (shouldInclude) {
        customersWithBalance.push(customer);
        if (customer.status === 2) activeCount++;
        else inactiveCount++;
      }
    }

    return customersWithBalance;
  }

  private async processCustomerData(customer: any): Promise<AccountReceivableDataDto> {
    const customerId = customer.id;
    
    try {
      // Get customer profile for name
      const profile = await this.accountReceivableRepository.findUserProfileByUserId(customerId);
      const customerName = profile ? `${profile.firstname || ''} ${profile.lastname || ''}`.trim() : 'Unknown';
      
      // Determine status
      const status = customer.status === 2 ? 'Active' : 'Inactive';

      // Calculate outstanding invoices by age buckets
      const [aging_0_30, aging_31_60, aging_61_90, aging_90_plus] = await Promise.all([
        this.accountReceivableRepository.getRecentInvoicesBalanceTotal(customerId, 30),
        this.accountReceivableRepository.getRecentInvoicesBalanceTotal(customerId, 60),
        this.accountReceivableRepository.getRecentInvoicesBalanceTotal(customerId, 90),
        this.accountReceivableRepository.getRecentInvoicesBalanceTotal(customerId, 91),
      ]);

      // Get total outstanding invoices
      const total = await this.accountReceivableRepository.getInvoiceOwingAmountTotal(customerId);

      // Get prepaid lessons
      const prePaidLessons = await this.accountReceivableRepository.getPrePaidLessons(customerId);

      // Get unused credits
      const unusedCredits = await this.accountReceivableRepository.getTotalCredits(customerId);

      // Calculate balance
      const balance = total - (prePaidLessons + unusedCredits);

      return {
        id: customerId,
        customerName,
        status,
        aging_0_30: RoundingUtils.roundDecimal(aging_0_30, 2),
        aging_31_60: RoundingUtils.roundDecimal(aging_31_60, 2),
        aging_61_90: RoundingUtils.roundDecimal(aging_61_90, 2),
        aging_90_plus: RoundingUtils.roundDecimal(aging_90_plus, 2),
        total: RoundingUtils.roundDecimal(total, 2),
        prePaidLessons: RoundingUtils.roundDecimal(prePaidLessons, 2),
        unusedCredits: RoundingUtils.roundDecimal(unusedCredits, 2),
        balance: RoundingUtils.roundDecimal(balance, 2),
      };
    } catch (error) {
      console.error(`[AccountReceivable] Error processing customer ${customerId}:`, error);
      throw error;
    }
  }


  private calculateTotals(customerData: any[]): AccountReceivableTotalsDto {
    // Use raw unrounded values for accurate totals, then round the final result
    // This prevents cumulative rounding errors
    return {
      aging_0_30: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.aging_0_30 || item.aging_0_30), 0),
        2,
      ),
      aging_31_60: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.aging_31_60 || item.aging_31_60), 0),
        2,
      ),
      aging_61_90: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.aging_61_90 || item.aging_61_90), 0),
        2,
      ),
      aging_90_plus: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.aging_90_plus || item.aging_90_plus), 0),
        2,
      ),
      total: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.total || item.total), 0),
        2,
      ),
      prePaidLessons: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.prePaidLessons || item.prePaidLessons), 0),
        2,
      ),
      unusedCredits: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.unusedCredits || item.unusedCredits), 0),
        2,
      ),
      balance: RoundingUtils.roundDecimal(
        customerData.reduce((sum, item) => sum + (item._raw?.balance || item.balance), 0),
        2,
      ),
    };
  }

  // Optimized batch processing method
  private async processCustomerDataBatch(customers: any[]): Promise<AccountReceivableDataDto[]> {
    const customerIds = customers.map(c => c.id);

    if (customerIds.length === 0) {
      return [];
    }

    // Fetch all data in parallel using batch queries
    const [
      aging0_30Map,
      aging31_60Map,
      aging61_90Map,
      aging90_plusMap,
      totalMap,
      prePaidLessonsMap,
      creditsMap,
    ] = await Promise.all([
      this.accountReceivableRepository.getBatchAgingData(customerIds, 30),
      this.accountReceivableRepository.getBatchAgingData(customerIds, 60),
      this.accountReceivableRepository.getBatchAgingData(customerIds, 90),
      this.accountReceivableRepository.getBatchAgingData(customerIds, 91),
      this.accountReceivableRepository.getBatchOutstandingInvoices(customerIds),
      this.accountReceivableRepository.getBatchPrePaidLessons(customerIds),
      this.accountReceivableRepository.getBatchCredits(customerIds),
    ]);

    // Build customer data from batch results
    // Store unrounded values for accurate totals calculation
    return customers.map(customer => {
      const customerId = customer.id;
      const customerName = `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Unknown';
      const status = customer.status === 2 ? 'Active' : 'Inactive';

      const aging_0_30_raw = aging0_30Map.get(customerId) || 0;
      const aging_31_60_raw = aging31_60Map.get(customerId) || 0;
      const aging_61_90_raw = aging61_90Map.get(customerId) || 0;
      const aging_90_plus_raw = aging90_plusMap.get(customerId) || 0;
      const total_raw = totalMap.get(customerId) || 0;
      const prePaidLessons_raw = prePaidLessonsMap.get(customerId) || 0;
      const unusedCredits_raw = creditsMap.get(customerId) || 0;
      const balance_raw = total_raw - (prePaidLessons_raw + unusedCredits_raw);

      return {
        id: customerId,
        customerName,
        status,
        aging_0_30: RoundingUtils.roundDecimal(aging_0_30_raw, 2),
        aging_31_60: RoundingUtils.roundDecimal(aging_31_60_raw, 2),
        aging_61_90: RoundingUtils.roundDecimal(aging_61_90_raw, 2),
        aging_90_plus: RoundingUtils.roundDecimal(aging_90_plus_raw, 2),
        total: RoundingUtils.roundDecimal(total_raw, 2),
        prePaidLessons: RoundingUtils.roundDecimal(prePaidLessons_raw, 2),
        unusedCredits: RoundingUtils.roundDecimal(unusedCredits_raw, 2),
        balance: RoundingUtils.roundDecimal(balance_raw, 2),
        // Store raw values for accurate totals calculation
        _raw: {
          aging_0_30: aging_0_30_raw,
          aging_31_60: aging_31_60_raw,
          aging_61_90: aging_61_90_raw,
          aging_90_plus: aging_90_plus_raw,
          total: total_raw,
          prePaidLessons: prePaidLessons_raw,
          unusedCredits: unusedCredits_raw,
          balance: balance_raw,
        }
      };
    });
  }

}
