import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../entities/invoice.entity';
import { EmailTemplate } from '../../notification/entities/email-template.entity';
import { ReminderNote } from '../../notification/entities/reminder-note.entity';
import { UserEmail } from '../../user/entities/user-email.entity';
import { Location } from '../../location/entities/location.entity';
import { User } from '../../user/entities/user.entity';

@Injectable()
export class InvoiceEmailStatementRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(ReminderNote)
    private readonly reminderNoteRepository: Repository<ReminderNote>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Get invoice with user relation for email statement (GET preview)
   */
  async getInvoiceWithUser(invoiceId: number, locationId: number): Promise<Invoice | null> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.user', 'user')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Get invoice with user + user profile (for POST send — log message needs profile names)
   * PHP equivalent: Invoice::find()->andWhere(['id' => $invoiceModel->id]) + $invoiceModel->user->publicIdentity
   */
  async getInvoiceWithUserProfile(invoiceId: number, locationId: number): Promise<Invoice | null> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.user', 'user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('invoice.locationId = :locationId', { locationId })
      .andWhere('invoice.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  /**
   * Get customer email addresses
   */
  async getCustomerEmails(customerId: number): Promise<string[]> {
    const emails = await this.userEmailRepository
      .createQueryBuilder('userEmail')
      .innerJoin('userEmail.userContact', 'userContact')
      .where('userContact.userId = :customerId', { customerId })
      .andWhere('userEmail.isDeleted = false')
      .select('userEmail.email')
      .orderBy('userEmail.email', 'ASC')
      .getMany();

    return emails.map(e => e.email);
  }

  /**
   * Get email template by type
   * emailTypeId = 4 for INVOICE, 3 for PFI
   */
  async getEmailTemplate(emailTypeId: number): Promise<EmailTemplate | null> {
    return this.emailTemplateRepository.findOne({
      where: { emailTypeId },
    });
  }

  /**
   * Get HST registration number from invoice location
   */
  async getHstNumberFromInvoiceLocation(locationId: number): Promise<string | null> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId, isDeleted: false },
      select: ['hstRegistrationNo'],
    });

    return location?.hstRegistrationNo || null;
  }

  /**
   * Get line items with code field for email
   */
  async getLineItemsWithCode(invoiceId: number): Promise<any[]> {
    const lineItems = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.lineItems', 'lineItems')
      .where('invoice.id = :invoiceId', { invoiceId })
      .andWhere('lineItems.isDeleted = false')
      .getMany();

    return (lineItems[0]?.lineItems as unknown as any[]) || [];
  }

  /**
   * Get global reminder notes (policies)
   */
  async getReminderNotes(): Promise<string | null> {
    const reminderNote = await this.reminderNoteRepository.findOne({
      where: {},
      order: { id: 'ASC' },
    });

    return reminderNote?.notes || null;
  }

  // ======================================================
  // Methods below are for POST send-email functionality
  // PHP equivalent: EmailController::actionSend()
  // ======================================================

  /**
   * Get location by ID (for sender email — from/replyTo)
   * PHP equivalent: $location = Location::findOne(['id' => $locationId])
   *                 then uses $location->email as from and replyTo
   */
  async getLocation(locationId: number): Promise<Location | null> {
    return this.locationRepository.findOne({
      where: { id: locationId, isDeleted: false },
    });
  }

  /**
   * Mark invoice as sent
   * PHP equivalent: $invoice->isSent = true; $invoice->save();
   */
  async markInvoiceAsSent(invoiceId: number): Promise<void> {
    await this.invoiceRepository.update(invoiceId, { isSent: true });
  }

  /**
   * Get user with profile for log message (logged-in user's name)
   * PHP equivalent: $loggedUser->publicIdentity
   */
  async getUserWithProfile(userId: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profile', 'profile')
      .where('user.id = :userId', { userId })
      .getOne();
  }
}
