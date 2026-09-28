import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { EquipmentRental } from '../../equipment-rental/entities/equipment-rental.entity';
import { EquipmentRentalInstrument } from '../../equipment-rental/entities/equipment-rental-instrument.entity';
import { EquipmentRentalInvoice } from '../../equipment-rental/entities/equipment-rental-invoice.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { InvoiceStatus } from '../../invoice/enums/invoice-status.enum';
import { InvoiceType } from '../../invoice/enums/invoice-type.enum';
import { ItemTypeEnum } from '../../invoice/enums/item-type.enum';
import { Location } from '../../location/entities/location.entity';
import { Log } from '../../log/entities/log.entity';
import { LogActivity } from '../../log/entities/log-activity.entity';
import { LogHistory } from '../../log/entities/log-history.entity';
import { LogLink } from '../../log/entities/log-link.entity';
import { LogObject } from '../../log/entities/log-object.entity';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { TaxCode } from '../../tax/entities/tax-code.entity';
import { TaxStatus } from '../../tax/entities/tax-status.entity';
import { TaxType } from '../../tax/entities/tax-type.entity';
import { TaxTypeTaxStatusAssoc } from '../../tax/entities/tax-type-tax-status-assoc.entity';
import { User } from '../../user/entities/user.entity';
import { createLocalDateTime, getCurrentESTDate } from '../../utils/date-utils';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { resolveRoyaltySnapshot } from '../../utils/royality/royalty-calculation.util';
import { RoundingUtils } from '../../utils/rounding.utils';

export interface InvoiceEquipmentRentalsCronLocation {
  id: number;
  name: string;
  slug: string;
}

export interface EquipmentRentalCronCandidate {
  id: number;
  customerId: number;
  studentId: number;
  startDate: Date | null;
  returnDate: Date | null;
  endDate: Date | null;
  duration: number | null;
  isOnGoing: boolean;
  hst: number;
  createdOn: Date | null;
}

export interface EquipmentRentalInvoiceCreationResult {
  invoiceId: number;
  invoiceNumber: number;
  botUserId: number;
  lineItemsCreated: number;
  subtotal: number;
  tax: number;
  total: number;
}

interface TaxContext {
  taxRate: number;
  taxStatusName: string;
  taxTypeName: string;
  taxCode: string;
}

interface CreateInvoiceParams {
  rental: EquipmentRentalCronCandidate;
  invoiceDateYmd: string;
  firstInvoice: boolean;
  billingMode: 'ongoing' | 'fixed';
}

@Injectable()
export class InvoiceEquipmentRentalsCronRepository {
  private readonly logger = new Logger(InvoiceEquipmentRentalsCronRepository.name);

  constructor(
    @InjectRepository(EquipmentRental)
    private readonly equipmentRentalRepository: Repository<EquipmentRental>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(EquipmentRentalInvoice)
    private readonly equipmentRentalInvoiceRepository: Repository<EquipmentRentalInvoice>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async getCronEnabledLocations(): Promise<InvoiceEquipmentRentalsCronLocation[]> {
    return this.locationRepository
      .createQueryBuilder('location')
      .select([
        'location.id AS id',
        'location.name AS name',
        'location.slug AS slug',
      ])
      .where('location.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('location.isEnabledCron = :isEnabledCron', { isEnabledCron: true })
      .orderBy('location.id', 'ASC')
      .getRawMany<InvoiceEquipmentRentalsCronLocation>();
  }

  async getEquipmentRentalsForCron(): Promise<EquipmentRentalCronCandidate[]> {
    const rentals = await this.equipmentRentalRepository.find({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });

    return rentals.map((rental) => ({
      id: rental.id,
      customerId: rental.customerId,
      studentId: rental.studentId,
      startDate: rental.startDate ?? null,
      returnDate: rental.returnDate ?? null,
      endDate: rental.endDate ?? null,
      duration: rental.duration ?? null,
      isOnGoing: Boolean(rental.isOnGoing),
      hst: Number(rental.hst || 0),
      createdOn: rental.createdOn ?? null,
    }));
  }

  async getFirstRentalInvoiceDate(rentalId: number): Promise<Date | null> {
    const rentalInvoice = await this.equipmentRentalInvoiceRepository
      .createQueryBuilder('equipmentRentalInvoice')
      .innerJoinAndSelect('equipmentRentalInvoice.invoice', 'invoice')
      .where('equipmentRentalInvoice.equipmentRentalsId = :rentalId', { rentalId })
      .orderBy('equipmentRentalInvoice.id', 'ASC')
      .getOne();

    return rentalInvoice?.invoice?.date ?? null;
  }

  async hasAnyRentalInvoice(rentalId: number): Promise<boolean> {
    const count = await this.equipmentRentalInvoiceRepository.count({
      where: { equipmentRentalsId: rentalId },
    });
    return count > 0;
  }

  async hasRentalInvoiceOnDate(rentalId: number, invoiceDateYmd: string): Promise<boolean> {
    const count = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin(
        EquipmentRentalInvoice,
        'equipmentRentalInvoice',
        'equipmentRentalInvoice.invoiceId = invoice.id',
      )
      .where('equipmentRentalInvoice.equipmentRentalsId = :rentalId', { rentalId })
      .andWhere('DATE(invoice.date) = :invoiceDateYmd', { invoiceDateYmd })
      .getCount();

    return count > 0;
  }

  async createOngoingRentalInvoice(
    rental: EquipmentRentalCronCandidate,
    invoiceDateYmd: string,
    firstInvoice: boolean,
  ): Promise<EquipmentRentalInvoiceCreationResult> {
    return this.createEquipmentRentalInvoice({
      rental,
      invoiceDateYmd,
      firstInvoice,
      billingMode: 'ongoing',
    });
  }

  async createFixedTermRentalInvoice(
    rental: EquipmentRentalCronCandidate,
    invoiceDateYmd: string,
  ): Promise<EquipmentRentalInvoiceCreationResult> {
    return this.createEquipmentRentalInvoice({
      rental,
      invoiceDateYmd,
      firstInvoice: true,
      billingMode: 'fixed',
    });
  }

  private async createEquipmentRentalInvoice(
    params: CreateInvoiceParams,
  ): Promise<EquipmentRentalInvoiceCreationResult> {
    const { rental } = params;

    return this.equipmentRentalRepository.manager.transaction(
      async (manager: EntityManager) => {
        const [customer, botUser] = await Promise.all([
          manager.findOne(User, {
            where: { id: rental.customerId, isDeleted: false },
            relations: ['profile', 'userLocation'],
          }),
          this.findBotUser(manager),
        ]);

        if (!customer) {
          throw new Error(`Customer ${rental.customerId} not found for equipment rental ${rental.id}`);
        }
        if (!customer.userLocation?.locationId) {
          throw new Error(`Customer ${rental.customerId} has no location for equipment rental ${rental.id}`);
        }
        if (!botUser) {
          throw new Error('BOT user not found. Cannot create equipment rental invoice.');
        }

        const location = await manager.findOne(Location, {
          where: { id: customer.userLocation.locationId },
        });
        if (!location) {
          throw new Error(
            `Location ${customer.userLocation.locationId} not found for customer ${rental.customerId}`,
          );
        }

        const transactionId = await this.createTransaction(manager, botUser.id);
        const invoiceNumber = await this.getNextInvoiceNumber(
          manager,
          location.id,
          InvoiceType.INVOICE,
        );
        const now = getCurrentESTDate();
        const invoice = manager.create(Invoice, {
          transactionId,
          userId: rental.customerId,
          locationId: location.id,
          invoiceNumber,
          date: this.toStoredDate(params.invoiceDateYmd),
          type: InvoiceType.INVOICE,
          subTotal: 0,
          tax: 0,
          total: 0,
          balance: 0,
          status: InvoiceStatus.PAID,
          isSent: false,
          isDeleted: false,
          isTaxAdjusted: 0,
          isCanceled: false,
          isEquipmentRentalContract: true,
          isPosted: 0,
          isVoid: 0,
          paidStatus: 0,
          totalCopy: 0,
          createdUserId: botUser.id,
          updatedUserId: botUser.id,
          createdOn: now,
          updatedOn: now,
        });
        await manager.save(Invoice, invoice);

        await this.createInvoiceCreationLog({
          manager,
          invoice,
          locationId: location.id,
          customer,
          botUser,
        });

        const rentalInvoice = manager.create(EquipmentRentalInvoice, {
          equipmentRentalsId: rental.id,
          invoiceId: invoice.id,
          isDeleted: false,
        });
        await manager.save(EquipmentRentalInvoice, rentalInvoice);

        const instruments = await manager.find(EquipmentRentalInstrument, {
          where: { equipmentRentalsId: rental.id },
          relations: ['item'],
          order: { id: 'ASC' },
        });

        const computedTotals = await this.processInvoiceLineItems({
          manager,
          invoice,
          rental,
          location,
          instruments,
          billingMode: params.billingMode,
          firstInvoice: params.firstInvoice,
        });

        invoice.subTotal = computedTotals.subtotal;
        invoice.tax = computedTotals.tax;
        invoice.total = computedTotals.total;
        invoice.balance = computedTotals.total;
        invoice.status =
          computedTotals.total > 0.09 ? InvoiceStatus.OWING : InvoiceStatus.PAID;
        invoice.updatedUserId = botUser.id;
        invoice.updatedOn = getCurrentESTDate();
        await manager.save(Invoice, invoice);

        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          botUserId: botUser.id,
          lineItemsCreated: computedTotals.lineItemsCreated,
          subtotal: computedTotals.subtotal,
          tax: computedTotals.tax,
          total: computedTotals.total,
        };
      },
    );
  }

  private async processInvoiceLineItems(params: {
    manager: EntityManager;
    invoice: Invoice;
    rental: EquipmentRentalCronCandidate;
    location: Location;
    instruments: EquipmentRentalInstrument[];
    billingMode: 'ongoing' | 'fixed';
    firstInvoice: boolean;
  }): Promise<{
    subtotal: number;
    tax: number;
    total: number;
    lineItemsCreated: number;
  }> {
    const { manager, invoice, rental, location, instruments, billingMode, firstInvoice } = params;

    let subtotal = 0;
    let totalTax = 0;
    let total = 0;
    let lineItemsCreated = 0;
    let prevId: number | null = null;
    const previousItemIds: number[] = [];

    const rentalStartYmd = this.toUtcYmd(rental.startDate);
    const currentItemDayOfMonth = rentalStartYmd
      ? this.getDayOfMonth(rentalStartYmd)
      : null;

    for (const instrument of instruments) {
      const price = Number(instrument.item?.price || 0);
      const itemId = instrument.instrument;
      const currentId = instrument.equipmentRentalsId;
      const taxContext = await this.resolveTaxContext(
        manager,
        Number(instrument.item?.taxStatusId || 0),
        location.provinceId,
      );

      const initialAmount =
        billingMode === 'fixed'
          ? this.roundTo2(price * Number(rental.duration || 0))
          : this.roundTo2(price);

      let savedLineItem: InvoiceLineItem | null = null;
      let wasDuplicate = false;

      if (prevId !== null && previousItemIds.includes(itemId)) {
        wasDuplicate = true;
        const existingLineItem = await manager.findOne(InvoiceLineItem, {
          where: { invoiceId: invoice.id, itemId },
        });
        if (existingLineItem) {
          existingLineItem.unit = Number(existingLineItem.unit || 0) + 1;
          existingLineItem.taxRate = this.roundTo2(
            Number(existingLineItem.amount || 0) *
              Number(existingLineItem.unit || 0) *
              (taxContext.taxRate / 100),
          );
          await manager.save(InvoiceLineItem, existingLineItem);
        }
      } else {
        previousItemIds.push(itemId);
        const royaltySnapshot = await resolveRoyaltySnapshot(
          manager,
          location.id,
          instrument.item ?? itemId,
        );
        savedLineItem = manager.create(InvoiceLineItem, {
          invoiceId: invoice.id,
          itemId,
          itemTypeId: ItemTypeEnum.TYPE_MISC,
          unit: 1,
          amount: initialAmount,
          description: instrument.item?.description || '',
          royaltyFree: Number(instrument.item?.royaltyFree || 0),
          royaltyCategoryId: royaltySnapshot.categoryId || null,
          royaltyRateApplied: royaltySnapshot.rate,
          advertisementRateApplied: royaltySnapshot.advertisementRate,
          taxType: taxContext.taxTypeName,
          taxRate: this.roundTo2(initialAmount * (taxContext.taxRate / 100)),
          taxStatus: taxContext.taxStatusName,
          taxCode: taxContext.taxCode,
          code: instrument.item?.code || 'MISC',
          cost: this.roundTo2(price),
          rate: 0,
          isDeleted: false,
          netTotal: initialAmount,
        });
        await manager.save(InvoiceLineItem, savedLineItem);
        lineItemsCreated += 1;
      }

      prevId = currentId;

      if (billingMode === 'ongoing') {
        if (firstInvoice) {
          if ((currentItemDayOfMonth ?? 0) <= 7) {
            subtotal += initialAmount;
            totalTax = Number(rental.hst || 0);
            total = subtotal + totalTax;
          } else {
            const remainingMonthTotal = this.calculateRemainingMonthTotal(
              price,
              rentalStartYmd,
            );
            const totalAmount = this.roundTo2(remainingMonthTotal + price);

            if (savedLineItem) {
              savedLineItem.amount = totalAmount;
              savedLineItem.taxRate = this.roundTo2(totalAmount * (taxContext.taxRate / 100));
              savedLineItem.netTotal = totalAmount;
              await manager.save(InvoiceLineItem, savedLineItem);
            }

            subtotal += totalAmount;
            totalTax = this.calculateLegacyRunningTax(
              subtotal,
              Number(instrument.item?.taxStatusId || 0),
              taxContext.taxRate,
              false,
            );
            total = subtotal + totalTax;
          }
        } else {
          subtotal += initialAmount;
          totalTax = this.calculateLegacyRunningTax(
            subtotal,
            Number(instrument.item?.taxStatusId || 0),
            taxContext.taxRate,
            false,
          );
          total = subtotal + totalTax;
        }
      } else {
        if ((currentItemDayOfMonth ?? 0) <= 7) {
          subtotal += initialAmount;
          totalTax = Number(rental.hst || 0);
          total = subtotal + totalTax;
        } else {
          const remainingMonthTotal = this.calculateRemainingMonthTotal(
            price,
            rentalStartYmd,
          );
          const invoiceAmount = this.roundTo2(remainingMonthTotal + initialAmount);

          if (savedLineItem && !wasDuplicate) {
            savedLineItem.amount = invoiceAmount;
            savedLineItem.taxRate = this.roundTo2(invoiceAmount * (taxContext.taxRate / 100));
            savedLineItem.netTotal = invoiceAmount;
            await manager.save(InvoiceLineItem, savedLineItem);
          }

          subtotal += invoiceAmount;
          totalTax = Number(rental.hst || 0);
          total = subtotal + totalTax;
        }
      }
    }

    return {
      subtotal: this.roundTo2(subtotal),
      tax: this.roundTo2(totalTax),
      total: this.roundTo2(total),
      lineItemsCreated,
    };
  }

  private async createInvoiceCreationLog(params: {
    manager: EntityManager;
    invoice: Invoice;
    locationId: number;
    customer: User;
    botUser: User;
  }): Promise<void> {
    const { manager, invoice, locationId, customer, botUser } = params;

    try {
      const [logObject, logActivity] = await Promise.all([
        manager.findOne(LogObject, {
          where: { name: LogObjectType.INVOICE },
        }),
        manager.findOne(LogActivity, {
          where: { name: LogActivityType.TYPE_CREATE },
        }),
      ]);

      if (!logObject || !logActivity) {
        return;
      }

      const invoiceNumber = `I-${String(invoice.invoiceNumber).padStart(5, '0')}`;
      const invoiceIndex = `invoice #${invoiceNumber}`;
      const userIndex = this.getDisplayName(customer);
      const loggedUserName = this.getDisplayName(botUser);

      const invoiceSnapshot = await manager.findOne(Invoice, {
        where: { id: invoice.id },
      });

      const log = manager.create(Log, {
        logObjectId: logObject.id,
        logActivityId: logActivity.id,
        message: `${loggedUserName} created an {{${invoiceIndex}}} for {{${userIndex}}}`,
        data: JSON.stringify(invoiceSnapshot ?? invoice),
        locationId,
        createdOn: getCurrentESTDate(),
        createdUserId: botUser.id,
      });
      await manager.save(Log, log);

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      await manager.save(LogLink, [
        manager.create(LogLink, {
          logId: log.id,
          index: invoiceIndex,
          baseUrl,
          path: `/admin/invoice/view?id=${invoice.id}`,
        }),
        manager.create(LogLink, {
          logId: log.id,
          index: userIndex,
          baseUrl,
          path: `/admin/user/view?UserSearch[role_name]=customer&id=${customer.id}`,
        }),
      ]);

      await manager.save(
        LogHistory,
        manager.create(LogHistory, {
          logId: log.id,
          instanceId: invoice.id,
          instanceType: LogObjectType.INVOICE,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to create invoice log for rental invoice ${invoice.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async findBotUser(manager: EntityManager): Promise<User | null> {
    return manager
      .createQueryBuilder(User, 'user')
      .innerJoin(
        'rbac_auth_assignment',
        'rbacAuthAssignment',
        'CAST(rbacAuthAssignment.user_id AS UNSIGNED) = user.id',
      )
      .leftJoinAndSelect('user.profile', 'profile')
      .where('rbacAuthAssignment.item_name = :role', { role: RolesEnum.BOT })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('user.id', 'DESC')
      .getOne();
  }

  private async createTransaction(manager: EntityManager, userId: number): Promise<number> {
    const now = getCurrentESTDate();
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into('transaction')
      .values({
        createdOn: now,
        updatedOn: now,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .execute();

    const transactionId =
      result.identifiers?.[0]?.id ||
      result.raw?.insertId ||
      result.generatedMaps?.[0]?.id;

    if (!transactionId) {
      throw new Error('Could not get transaction ID from insert result');
    }

    return Number(transactionId);
  }

  private async getNextInvoiceNumber(
    manager: EntityManager,
    locationId: number,
    type: number,
  ): Promise<number> {
    const lastInvoice = await manager.findOne(Invoice, {
      where: { locationId, type },
      order: { id: 'DESC' },
    });
    return (lastInvoice?.invoiceNumber || 0) + 1;
  }

  private async resolveTaxContext(
    manager: EntityManager,
    taxStatusId: number,
    provinceId: number,
  ): Promise<TaxContext> {
    if (!taxStatusId) {
      return {
        taxRate: 0,
        taxStatusName: '',
        taxTypeName: '',
        taxCode: '',
      };
    }

    const taxStatus = await manager.findOne(TaxStatus, { where: { id: taxStatusId } });
    const taxAssoc = await manager.findOne(TaxTypeTaxStatusAssoc, {
      where: { taxStatusId },
    });
    const taxType = taxAssoc
      ? await manager.findOne(TaxType, { where: { id: taxAssoc.taxTypeId } })
      : null;
    const taxCode = taxAssoc
      ? await manager.findOne(TaxCode, {
          where: {
            taxTypeId: taxAssoc.taxTypeId,
            provinceId,
          },
          order: { id: 'DESC' },
        })
      : null;

    return {
      taxRate: Number(taxCode?.rate || 0),
      taxStatusName: taxStatus?.name || '',
      taxTypeName: taxType?.name || '',
      taxCode: taxCode?.code || '',
    };
  }

  private calculateRemainingMonthTotal(price: number, startDateYmd: string | null): number {
    if (!startDateYmd) {
      return 0;
    }

    const startDate = this.parseYmdAsUtc(startDateYmd);
    const year = startDate.getUTCFullYear();
    const month = startDate.getUTCMonth();
    const startDay = startDate.getUTCDate();
    const totalDays = this.daysInMonth(year, month);
    const totalRentDays = totalDays - startDay + 1;

    return (price / totalDays) * totalRentDays;
  }

  private calculateLegacyRunningTax(
    subtotal: number,
    taxStatusId: number,
    taxRate: number,
    fallbackToSubtotal: boolean,
  ): number {
    if (taxStatusId === 1 || taxStatusId === 3) {
      return subtotal * (taxRate / 100);
    }
    return fallbackToSubtotal ? subtotal : 0;
  }

  private getDisplayName(user: User | null | undefined): string {
    const firstName = user?.profile?.firstname?.trim() || '';
    const lastName = user?.profile?.lastname?.trim() || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || user?.username || `User ${user?.id ?? ''}`.trim();
  }

  private toStoredDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return createLocalDateTime(year, month - 1, day, 0, 0, 0);
  }

  private toUtcYmd(date: Date | null | undefined): string | null {
    if (!date) {
      return null;
    }
    return new Date(date).toISOString().slice(0, 10);
  }

  private parseYmdAsUtc(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private getDayOfMonth(ymd: string): number {
    return this.parseYmdAsUtc(ymd).getUTCDate();
  }

  private daysInMonth(year: number, zeroIndexedMonth: number): number {
    return new Date(Date.UTC(year, zeroIndexedMonth + 1, 0)).getUTCDate();
  }

  private roundTo2(value: number): number {
    return RoundingUtils.roundDecimal(value || 0, 2);
  }
}
