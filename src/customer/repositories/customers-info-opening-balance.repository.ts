import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Item } from '../../item/entities/item.entity';
import { CustomersInfoRepository } from './customers-info.repository';

@Injectable()
export class CustomersInfoOpeningBalanceRepository {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly invoiceLineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    private readonly customersInfoRepository: CustomersInfoRepository,
  ) {}

  /**
   * Create opening balance
   * Based on legacy actionAddOpeningBalance functionality
   */
  async create(customerId: number, locationId: number, openingBalanceData: any, currentUserId: number): Promise<any> {
    console.log('Creating opening balance for customer:', customerId, 'location:', locationId, 'data:', openingBalanceData);
    
    const queryRunner = this.userRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    queryRunner.data = {
      ...(queryRunner.data ?? {}),
      currentUserId,
    };
    await queryRunner.startTransaction();

    try {
      // Verify customer exists
      const customer = await queryRunner.manager
        .createQueryBuilder()
        .select('user')
        .from('user', 'user')
        .leftJoin('user_location', 'userLocation', 'userLocation.user_id = user.id')
        .leftJoin('rbac_auth_assignment', 'authAssignment', 'authAssignment.user_id = CAST(user.id AS CHAR)')
        .where('user.id = :customerId', { customerId })
        .andWhere('userLocation.location_id = :locationId', { locationId })
        .andWhere('authAssignment.item_name = :role', { role: 'customer' })
        .andWhere('user.isDeleted = false')
        .getRawOne();

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Create transaction first (like legacy)
      const transactionResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('transaction')
        .values({
          createdOn: new Date(),
          updatedOn: new Date(),
          createdByUserId: currentUserId,
          updatedByUserId: currentUserId,
        })
        .execute();

      console.log('Transaction result:', transactionResult);
      
      // Handle different possible result structures
      let transactionId;
      if (transactionResult.identifiers && transactionResult.identifiers[0]) {
        transactionId = transactionResult.identifiers[0].id;
      } else if (transactionResult.raw && transactionResult.raw.insertId) {
        transactionId = transactionResult.raw.insertId;
      } else if (transactionResult.generatedMaps && transactionResult.generatedMaps[0]) {
        transactionId = transactionResult.generatedMaps[0].id;
      } else {
        throw new Error('Could not get transaction ID from insert result');
      }
      
      console.log('Created transaction with ID:', transactionId);

      // Get next invoice number
      const lastInvoice = await queryRunner.manager
        .createQueryBuilder()
        .select('invoice')
        .from('invoice', 'invoice')
        .where('invoice.location_id = :locationId', { locationId })
        .andWhere('invoice.type = :type', { type: 2 }) // Invoice::TYPE_INVOICE
        .orderBy('invoice.id', 'DESC')
        .getRawOne();

      const invoiceNumber = lastInvoice ? parseInt(lastInvoice.invoice_invoice_number) + 1 : 1;
      console.log('Next invoice number:', invoiceNumber);

      // Get conversion date for location (like legacy)
      const location = await queryRunner.manager
        .createQueryBuilder()
        .select('location')
        .from('location', 'location')
        .where('location.id = :locationId', { locationId })
        .getRawOne();

      let invoiceDate = new Date();
      if (location && location.location_conversionDate) {
        const conversionDate = new Date(location.location_conversionDate);
        invoiceDate = new Date(conversionDate.getTime() - 24 * 60 * 60 * 1000); // Subtract 1 day
      }

      // Create invoice
      const invoiceData = {
        userId: customerId,
        locationId: locationId,
        type: 2, // Invoice::TYPE_INVOICE
        transactionId: transactionId,
        invoiceNumber: invoiceNumber,
        date: invoiceDate.toISOString().split('T')[0], // YYYY-MM-DD format
        status: 2, // Will be updated to 1 after line item creation
        isSent: false,
        subTotal: 0,
        total: 0,
        tax: 0,
        isTaxAdjusted: false,
        isCanceled: false,
        balance: 0,
        isDeleted: false,
        isPosted: false,
        isVoid: false,
        createdOn: new Date(),
        updatedOn: new Date(),
        createdUserId: 1, // TODO: Get from auth context
        updatedUserId: 1, // TODO: Get from auth context
      };

      const invoiceResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('invoice')
        .values(invoiceData)
        .execute();

      console.log('Invoice result:', invoiceResult);
      
      // Handle different possible result structures
      let invoiceId;
      if (invoiceResult.identifiers && invoiceResult.identifiers[0]) {
        invoiceId = invoiceResult.identifiers[0].id;
      } else if (invoiceResult.raw && invoiceResult.raw.insertId) {
        invoiceId = invoiceResult.raw.insertId;
      } else if (invoiceResult.generatedMaps && invoiceResult.generatedMaps[0]) {
        invoiceId = invoiceResult.generatedMaps[0].id;
      } else {
        throw new Error('Could not get invoice ID from insert result');
      }
      
      console.log('Created invoice with ID:', invoiceId);

      // Find opening balance item
      const openingBalanceItem = await queryRunner.manager
        .createQueryBuilder()
        .select('item')
        .from('item', 'item')
        .where('item.code = :code', { code: 'OPENING BALANCE' }) // Item::OPENING_BALANCE_ITEM
        .getRawOne();

      if (!openingBalanceItem) {
        throw new Error('Opening balance item not found');
      }
      console.log('Found opening balance item:', openingBalanceItem);

      // Create invoice line item (matching legacy format)
      const unit = openingBalanceData.isCredit ? -1 : 1;
      const invoiceLineItemData = {
        invoiceId: invoiceId,
        itemId: openingBalanceItem.item_id,
        itemTypeId: 4, // ItemType::TYPE_OPENING_BALANCE
        description: 'Opening Balance',
        unit: unit,
        amount: openingBalanceData.amount,
        code: 'OPENING BALANCE',
        cost: 0,
        rate: 0,
        taxType: 'NO TAX',
        taxRate: 0,
        taxCode: 'ON',
        taxStatus: 'No Tax',
        netTotal: openingBalanceData.amount,
        royaltyFree: false,
        isDeleted: false,
      };

      const lineItemResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('invoice_line_item')
        .values(invoiceLineItemData)
        .execute();
      console.log('Created invoice line item:', lineItemResult);
      
      // Verify line item was created successfully
      if (!lineItemResult.identifiers && !lineItemResult.raw && !lineItemResult.generatedMaps) {
        throw new Error('Failed to create invoice line item');
      }

      // Update invoice totals (matching legacy format)
      const taxRate = 0; // No tax for opening balance
      const subTotal = openingBalanceData.amount * unit; // Apply unit multiplier (unit already defined above)
      const tax = 0;
      const total = subTotal + tax;
      const balance = total; // For new invoices, balance equals total (no payments yet)
      const status = openingBalanceData.isCredit ? 3 : 1; // Credit = 3, Debit = 1

      await queryRunner.manager
        .createQueryBuilder()
        .update('invoice')
        .set({
          date: invoiceDate.toISOString().split('T')[0], // Set conversion date - 1 day
          status: status, // Credit = 3, Debit = 1
          subTotal: subTotal,
          total: total,
          tax: tax,
          balance: balance,
        })
        .where('id = :invoiceId', { invoiceId })
        .execute();
      console.log('Updated invoice totals - subTotal:', subTotal, 'total:', total, 'balance:', balance, 'status:', status);

      // Update customer account balance (like legacy queries 18 and 60)
      const customerAccount = await queryRunner.manager
        .createQueryBuilder()
        .select('customerAccount')
        .from('customer_account', 'customerAccount')
        .where('customerAccount.customerId = :customerId', { customerId })
        .getRawOne();

      if (customerAccount) {
        const currentBalance = parseFloat(customerAccount.customerAccount_balance || 0);
        // For credits, subtract from balance; for debits, add to balance
        const balanceChange = openingBalanceData.isCredit ? -openingBalanceData.amount : openingBalanceData.amount;
        const newBalance = currentBalance + balanceChange;
        
        await queryRunner.manager
          .createQueryBuilder()
          .update('customer_account')
          .set({
            balance: newBalance,
            updatedOn: new Date(),
          updatedByUserId: currentUserId,
        })
          .where('id = :accountId', { accountId: customerAccount.customerAccount_id })
          .execute();
        
        console.log('Updated customer account balance from', currentBalance, 'to', newBalance, '(change:', balanceChange, ')');
      } else {
        console.log('No customer account found for customer:', customerId);
      }

      await queryRunner.commitTransaction();
      console.log('Opening balance creation completed successfully');

      // Return the created invoice info
      return {
        invoiceId: invoiceId,
        amount: openingBalanceData.amount,
        isCredit: openingBalanceData.isCredit,
        total: total,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update opening balance (not typically used, but keeping for consistency)
   */
  async update(customerId: number, locationId: number, openingBalanceData: any): Promise<any> {
    // Opening balance updates are typically not supported as they create invoices
    // This would require complex logic to modify existing invoices
    throw new Error('Opening balance updates are not supported. Create a new opening balance instead.');
  }
}
