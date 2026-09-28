import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvoicePosLinesService } from './invoice-pos-lines.service';
import { InvoiceDetailEditRepository } from '../repositories/invoice-detail-edit.repository';
import { UserCreateRepository } from '../../user/repositories/user-create.repository';
import { InvoiceDetailRepository } from '../repositories/invoice-detail.repository';
import { UpdateInvoiceDetailRequestDto, UpdateInvoiceDetailResponseDto } from '../dto/update-invoice-detail.dto';
import { CreateWalkinCustomerDto, CreateWalkinResponseDto } from '../dto/create-walkin-customer.dto';
import { UpdateWalkinCustomerDto, UpdateWalkinResponseDto } from '../dto/update-walkin-customer.dto';
import { AdjustTaxRequestDto, AdjustTaxResponseDto } from '../dto/adjust-tax.dto';
import { AssignCustomerToInvoiceDto, AssignCustomerResponseDto } from '../dto/assign-customer-to-invoice.dto';
import { InvoiceDetailsEditTransformationService } from './transformations/invoice-details-edit-transformation.service';
import { InvoiceType } from '../enums/invoice-type.enum';
import { ItemTypeEnum } from '../enums/item-type.enum';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { User } from '../../user/entities/user.entity';
import { Invoice } from '../entities/invoice.entity';
import { plainToInstance } from 'class-transformer';
import * as crypto from 'crypto';
import { CreateInvoiceMessageRequestDto, CreateInvoiceMessageResponseDto } from '../dto/create-invoice-message.dto';

@Injectable()
export class InvoiceDetailEditService {
  constructor(
    private readonly invoiceDetailEditRepository: InvoiceDetailEditRepository,
    private readonly userCreateRepository: UserCreateRepository,
    private readonly transformationService: InvoiceDetailsEditTransformationService,
    private readonly invoiceDetailRepository: InvoiceDetailRepository,
    private readonly dataSource: DataSource,
    private readonly posLines: InvoicePosLinesService,
  ) {}

  /**
   * Update invoice date.
   */
  async updateInvoiceDate(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    updateData: UpdateInvoiceDetailRequestDto,
    userId: number,
  ): Promise<UpdateInvoiceDetailResponseDto> {
    try {
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // Parse YYYY-MM-DD → UTC midnight Date
      const [year, month, day] = updateData.date.split('-').map(Number);
      const parsedDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

      if (isNaN(parsedDate.getTime())) {
        throw new BadRequestException(
          `Invalid date value: ${updateData.date}`,
        );
      }

      // Update invoice date in repository
      const updatedInvoice = await this.invoiceDetailEditRepository.updateInvoiceDate(
        invoice,
        parsedDate,
        userId,
      );

      // Return response DTO using transformation service
      return this.transformationService.transformUpdateDateResponse(updatedInvoice);
    } catch (error) {
      console.error('Error in updateInvoiceDate service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to update invoice date: ${error.message}`,
      );
    }
  }

  /**
   * Create a new walk-in customer and assign to invoice
   * Also updates all related payments to point to the new walk-in customer
   * 
   * Validates:
   *   - Invoice exists and belongs to location
   *   - Invoice is not pro-forma (only invoices can be edited)
   *   - Invoice is not void or canceled
   *   - Email uniqueness within location (if provided)
   * 
   * Creates:
   *   - User (role: guest, username: null, canLogin: false)
   *   - UserProfile (firstName, lastName)
   *   - UserLocation (links to current location)
   *   - UserContact + UserEmail (only if email provided)
   *   - CustomerAccount (balance: 0.00)
   *   - RbacAuthAssignment (role: guest)
   * 
   * Updates:
   *   - Invoice.userId → new walk-in customer ID
   *   - All related Payment.userId → new walk-in customer ID
   * 
   * @param locationId - Location ID
   * @param locationSlug - Location slug
   * @param invoiceId - Invoice ID
   * @param createData - DTO with firstName, lastName, email (optional)
   * @param userId - Current authenticated user ID (for audit)
   * @returns Response DTO with invoice ID, customer ID, and customer name
   */
  async createWalkinCustomer(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    createData: CreateWalkinCustomerDto,
    userId: number,
  ): Promise<CreateWalkinResponseDto> {
    try {
      // 1. Validate invoice exists
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // 2. Use transaction to ensure atomicity
      return await this.dataSource.transaction(async (manager) => {
        // 3. Validate email uniqueness within location (if provided)
        if (createData.email?.trim()) {
          const emailExists = await this.userCreateRepository.checkEmailExists(
            createData.email.trim(),
            locationId,
            manager,
          );
          if (emailExists) {
            throw new BadRequestException(
              `Email ${createData.email} already exists in this location`,
            );
          }
        }

        // 6. Generate auth_key and access_token
        const authKey = this.generateRandomString();
        const accessToken = this.generateRandomString(40);

        // 7. Create User (walk-in: no username/password/pin, canLogin=false, canMerge=false, status=ACTIVE)
        const walkinUser = await this.userCreateRepository.createUser(
          {
            status: User.STATUS_ACTIVE,
            canLogin: false,
            canMerge: false,
            authKey,
            accessToken,
          },
          manager,
        );

        // 8. Create CustomerAccount (balance: 0.00)
        await this.userCreateRepository.createCustomerAccount(walkinUser.id, manager);

        // 9. Create UserProfile (firstName, lastName)
        await this.userCreateRepository.createUserProfile(walkinUser.id, 'en-US', manager);
        
        // 10. Update profile with actual names
        await manager
          .createQueryBuilder()
          .update('user_profile')
          .set({
            firstname: createData.firstName.trim(),
            lastname: createData.lastName.trim(),
          })
          .where('user_id = :userId', { userId: walkinUser.id })
          .execute();

        // 11. Assign role 'guest' via RbacAuthAssignment
        await this.userCreateRepository.assignRole(walkinUser.id, RolesEnum.GUEST, manager);

        // 12. Create UserLocation (link to current location)
        await this.userCreateRepository.createUserLocation(walkinUser.id, locationId, manager);

        // 13. If email provided: Create UserContact + UserEmail
        if (createData.email?.trim()) {
          const userContact = await this.userCreateRepository.createUserContact(walkinUser.id, manager);
          await this.userCreateRepository.createUserEmail(createData.email.trim(), userContact.id, manager);
        }

        // 14. Update invoice.userId to new walk-in customer
        await this.invoiceDetailEditRepository.assignWalkinToInvoice(
          invoice,
          walkinUser.id,
          userId,
          manager,
        );

        // 15. CRITICAL: Update all related payments to point to new walk-in customer
        await this.invoiceDetailEditRepository.updatePaymentCustomers(
          invoiceId,
          walkinUser.id,
          userId,
        );

        // 16. Return response DTO
        return plainToInstance(CreateWalkinResponseDto, {
          id: invoice.id,
          customerId: walkinUser.id,
          customerName: `${createData.firstName} ${createData.lastName}`.trim(),
          email: createData.email?.trim() || '',
          type: 2,
        }, { excludeExtraneousValues: true });
      });
    } catch (error) {
      console.error('Error in createWalkinCustomer service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to create walk-in customer: ${error.message}`,
      );
    }
  }

  /**
   * Update an existing walk-in customer's details (Edit walk-in)
   * 
   * PHP Equivalent: actionEditWalkin($id)
   * Validates:
   *   - Invoice exists, is invoice (not pro-forma), not canceled/voided
   *   - Email uniqueness (if changed)
   * 
   * Updates:
   *   - UserProfile (firstName, lastName)
   *   - UserEmail (creates new contact/email if missing, otherwise updates email string)
   * 
   * @param locationId - Location ID
   * @param locationSlug - Location slug
   * @param invoiceId - Invoice ID
   * @param updateData - DTO with firstName, lastName, email (optional), type
   * @param userId - Current authenticated user ID (for audit)
   */
  async updateWalkinCustomer(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    updateData: UpdateWalkinCustomerDto,
    userId: number,
  ): Promise<UpdateWalkinResponseDto> {
    try {
      // 1. Validate invoice exists
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // 2. Use transaction to ensure atomicity
      return await this.dataSource.transaction(async (manager) => {
        // 3. Find existing user with relations
        const user = await this.invoiceDetailEditRepository.findUserWithContactsAndEmails(
          invoice.userId,
          manager,
        );

        if (!user) {
          throw new NotFoundException(
            `Customer attached to invoice ${invoiceId} not found`,
          );
        }

        const submittedEmail = updateData.email?.trim();
        const primaryContact = user.contacts?.[0];
        const primaryEmail = primaryContact?.emails?.[0];

        // 6. Validate email uniqueness within location (if provided and changed)
        const isEmailChanged = submittedEmail && (!primaryEmail || primaryEmail.email !== submittedEmail);
        
        if (isEmailChanged) {
          const emailExists = await this.userCreateRepository.checkEmailExists(
            submittedEmail as string,
            locationId,
            manager,
          );
          
          if (emailExists) {
            throw new BadRequestException(
              `Email ${submittedEmail} already exists in this location`,
            );
          }
        }

        // 7. Update profile with new names
        await this.invoiceDetailEditRepository.updateUserProfileNames(
          user.id,
          updateData.firstName.trim(),
          updateData.lastName.trim(),
          manager,
        );

        // 8. Handle email updates without nested if-else
        // Using explicit boolean conditions for clarity
        const isNewContactNeeded = Boolean(submittedEmail && !primaryContact);
        const isNewEmailNeeded = Boolean(submittedEmail && primaryContact && !primaryEmail);
        const isEmailUpdateNeeded = Boolean(submittedEmail && primaryEmail && primaryEmail.email !== submittedEmail);

        if (isNewContactNeeded) {
          const newContact = await this.userCreateRepository.createUserContact(user.id, manager);
          await this.userCreateRepository.createUserEmail(submittedEmail as string, newContact.id, manager);
        }

        if (isNewEmailNeeded) {
          await this.userCreateRepository.createUserEmail(submittedEmail as string, primaryContact.id, manager);
        }

        if (isEmailUpdateNeeded) {
          await this.invoiceDetailEditRepository.updateUserEmailAddress(
            primaryEmail.id,
            submittedEmail as string,
            manager,
          );
        }

        // 9. Update Invoice Audit
        invoice.updatedUserId = userId;
        await manager.save(Invoice, invoice);

        // 10. Return response DTO
        return plainToInstance(UpdateWalkinResponseDto, {
          id: invoice.id,
          customerId: user.id,
          customerName: `${updateData.firstName} ${updateData.lastName}`.trim(),
          email: submittedEmail || primaryEmail?.email || '',
          type: 2,
        }, { excludeExtraneousValues: true });
      });
    } catch (error) {
      console.error('Error in updateWalkinCustomer service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to update walk-in customer: ${error.message}`,
      );
    }
  }

  /**
   * Adjust invoice tax.
   */
  async adjustTax(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    requestDto: AdjustTaxRequestDto,
    userId: number,
  ): Promise<AdjustTaxResponseDto> {
    try {
      if (await this.posLines.hasPos(invoiceId)) {
        return this.dataSource.transaction(async manager => {
          this.posLines.audit(manager, userId);
          const invoice = await this.posLines.lockInvoice(manager, locationId, invoiceId);
          await this.posLines.assertEditable(manager, invoice);
          const repository = this.posLines.repository(manager);
          const values = this.transformationService.transformTaxAdjustment(invoice,
            await repository.getLineItemTaxSum(invoiceId), await repository.getInvoicePaidAmount(invoiceId), requestDto);
          Object.assign(invoice, { tax: values.newTax, isTaxAdjusted: values.isTaxAdjusted,
            total: values.newTotal, balance: values.newBalance, status: values.newStatus });
          await manager.save(Invoice, invoice);
          await this.posLines.recalculate(manager, invoice, locationSlug, userId);
          return this.transformationService.transformAdjustTaxResponse(invoice);
        });
      }
      // Validate invoice exists
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      if (invoice.type !== InvoiceType.INVOICE) {
        throw new BadRequestException(
          'Tax can only be adjusted on invoices. Pro-forma invoices are not eligible.',
        );
      }

      if (invoice.isPosted) {
        throw new BadRequestException(
          'Tax cannot be updated if invoice is posted.',
        );
      }

      if (invoice.isVoid) {
        throw new BadRequestException(
          'Cannot adjust tax on a voided invoice.',
        );
      }

      if (invoice.isCanceled) {
        throw new BadRequestException(
          'Cannot adjust tax on a canceled invoice.',
        );
      }

      const firstLineItem = await this.invoiceDetailEditRepository.getFirstLineItem(invoiceId);

      if (!firstLineItem) {
        throw new BadRequestException(
          'Cannot adjust tax: invoice has no line items.',
        );
      }

      if (firstLineItem.itemTypeId === ItemTypeEnum.TYPE_OPENING_BALANCE) {
        throw new BadRequestException(
          'Cannot adjust tax on an Opening Balance invoice.',
        );
      }

      if (firstLineItem.itemTypeId === 10) {
        throw new BadRequestException(
          'Cannot adjust tax on a Payment Credit invoice.',
        );
      }

      const lineItemTax = await this.invoiceDetailEditRepository.getLineItemTaxSum(invoiceId);
      const paidAmount = await this.invoiceDetailEditRepository.getInvoicePaidAmount(invoiceId);

      // Transform and calculate all values
      const { newTax, isTaxAdjusted, newTotal, newBalance, newStatus } =
        this.transformationService.transformTaxAdjustment(
          invoice,
          lineItemTax,
          paidAmount,
          requestDto,
        );

      // Save updated values
      const updatedInvoice = await this.invoiceDetailEditRepository.updateInvoiceTax(
        invoice,
        newTax,
        isTaxAdjusted,
        newTotal,
        newBalance,
        newStatus,
        userId,
      );

      // Return response DTO using transformation service
      return this.transformationService.transformAdjustTaxResponse(updatedInvoice);
    } catch (error) {
      console.error('Error in adjustTax service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to adjust tax: ${error.message}`,
      );
    }
  }

  /**
   * Assign an existing customer to an invoice
   * Also updates all related payments to point to the new customer
   * 
   * Validates:
   *   - Invoice exists and belongs to location
   *   - Invoice is not pro-forma (only invoices can be edited)
   *   - Invoice is not void or canceled
   *   - Customer exists and belongs to location
   * 
   * @param locationId - Location ID
   * @param locationSlug - Location slug
   * @param invoiceId - Invoice ID
   * @param assignData - DTO with customerId
   * @param userId - Current authenticated user ID (for audit)
   * @returns Response DTO with invoice ID, customer ID, and customer name
   */
  async assignCustomerToInvoice(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    assignData: AssignCustomerToInvoiceDto,
    userId: number,
  ): Promise<AssignCustomerResponseDto> {
    try {
      // 1. Validate invoice exists
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      // 2. Validate customer exists in location
      const customerExists = await this.invoiceDetailRepository.validateCustomerInLocation(
        assignData.customerId,
        locationId,
      );

      if (!customerExists) {
        throw new NotFoundException(
          `Customer with ID ${assignData.customerId} not found in location ${locationSlug}`,
        );
      }

      if (await this.posLines.hasPos(invoiceId)) {
        const updated = await this.dataSource.transaction(async manager => {
          this.posLines.audit(manager, userId);
          const locked = await this.posLines.lockInvoice(manager, locationId, invoiceId);
          await this.posLines.assertEditable(manager, locked);
          locked.userId = assignData.customerId;
          locked.walkinBuyerName = null;
          locked.updatedUserId = userId;
          await manager.save(Invoice, locked);
          await this.posLines.recalculate(manager, locked, locationSlug, userId);
          await this.posLines.refreshCustomerBalance(manager, invoice.userId, locationSlug, userId);
          return locked;
        });
        const customer = await this.invoiceDetailRepository.getCustomerInfo(assignData.customerId);
        return plainToInstance(AssignCustomerResponseDto, { id: updated.id, customerId: updated.userId,
          customerName: customer?.customerName || 'Unknown', email: customer?.email || '', phoneNumber: customer?.phoneNumber || '', type: 1 }, { excludeExtraneousValues: true });
      }

      // 3. Update invoice with new customer
      const updatedInvoice = await this.invoiceDetailEditRepository.assignCustomerToInvoice(
        invoice,
        assignData.customerId,
        userId,
      );

      // 6. CRITICAL: Update all related payments to point to new customer
      await this.invoiceDetailEditRepository.updatePaymentCustomers(
        invoiceId,
        assignData.customerId,
        userId,
      );

      // 7. Get customer info for response
      const customerInfo = await this.invoiceDetailRepository.getCustomerInfo(
        assignData.customerId,
      );

      // 8. Return response DTO
      return plainToInstance(AssignCustomerResponseDto, {
        id: updatedInvoice.id,
        customerId: assignData.customerId,
        customerName: customerInfo
          ? `${customerInfo.customerName}`.trim()
          : 'Unknown',
        email: customerInfo?.email || '',
        phoneNumber: customerInfo?.phoneNumber || '',
        type: 1,
      }, { excludeExtraneousValues: true });
    } catch (error) {
      console.error('Error in assignCustomerToInvoice service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to assign customer to invoice: ${error.message}`,
      );
    }
  }

  /**
   * Generate random string for auth_key and access_token
   * Replicates Yii2's generateRandomString()
   */
  private generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64').slice(0, length);
  }

  /**
   * Create invoice message
   * Only allowed when the invoice has no existing message.
   */
  async createInvoiceMessage(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    requestDto: CreateInvoiceMessageRequestDto,
    userId: number,
  ): Promise<CreateInvoiceMessageResponseDto> {
    try {
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      if (invoice.isCanceled) {
        throw new BadRequestException(
          'Cannot add message to a canceled invoice',
        );
      }

      // Guard: only allow create when message is empty
      if (invoice.notes && invoice.notes.trim().length > 0) {
        throw new BadRequestException(
          'Message already exists.',
        );
      }

      const updatedInvoice = await this.invoiceDetailEditRepository.createInvoiceMessage(
        invoice,
        requestDto.message,
        userId,
      );

      return {
        body: {
          id: updatedInvoice.id,
          message: updatedInvoice.notes || '',
        },
      } as CreateInvoiceMessageResponseDto;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to create invoice message: ${error.message}`,
      );
    }
  }

  /**
   * Update invoice message (edit existing message — pencil icon)
   * Only allowed when the invoice already has a message.
   * PHP equivalent: actionNote($id) → $model->load(post()) && $model->save()
   */
  async updateInvoiceMessage(
    locationId: number,
    locationSlug: string,
    invoiceId: number,
    requestDto: CreateInvoiceMessageRequestDto,
    userId: number,
  ): Promise<CreateInvoiceMessageResponseDto> {
    try {
      const invoice = await this.invoiceDetailEditRepository.findInvoiceById(
        locationId,
        invoiceId,
      );

      if (!invoice) {
        throw new NotFoundException(
          `Invoice with ID ${invoiceId} not found in location ${locationSlug}`,
        );
      }

      if (invoice.isCanceled) {
        throw new BadRequestException(
          'Cannot edit message on a canceled invoice',
        );
      }

      // Guard: only allow update when message already exists
      if (!invoice.notes || invoice.notes.trim().length === 0) {
        throw new BadRequestException(
          'No existing message to update. Use POST to create a message first.',
        );
      }

      const updatedInvoice = await this.invoiceDetailEditRepository.updateInvoiceMessage(
        invoice,
        requestDto.message,
        userId,
      );

      return {
        body: {
          id: updatedInvoice.id,
          message: updatedInvoice.notes || '',
        },
      } as CreateInvoiceMessageResponseDto;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        `Failed to update invoice message: ${error.message}`,
      );
    }
  }
}
