import { EquipmentRentalInstrument } from '../../equipment-rental/entities/equipment-rental-instrument.entity';
import { EquipmentRentalInvoice } from '../../equipment-rental/entities/equipment-rental-invoice.entity';
import { Invoice } from '../../invoice/entities/invoice.entity';
import { InvoiceLineItem } from '../../invoice/entities/invoice-line-item.entity';
import { Location } from '../../location/entities/location.entity';
import { Log } from '../../log/entities/log.entity';
import { LogActivity } from '../../log/entities/log-activity.entity';
import { LogHistory } from '../../log/entities/log-history.entity';
import { LogLink } from '../../log/entities/log-link.entity';
import { LogObject } from '../../log/entities/log-object.entity';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { LogObjectType } from '../../log/enums/log-object-type.enum';
import { TaxTypeTaxStatusAssoc } from '../../tax/entities/tax-type-tax-status-assoc.entity';
import { User } from '../../user/entities/user.entity';
import { InvoiceEquipmentRentalsCronRepository } from './invoice-equipment-rentals-cron.repository';

describe('InvoiceEquipmentRentalsCronRepository', () => {
  function createManagerHarness(options: {
    customer: any;
    location: any;
    instruments: any[];
    botUser: any;
  }) {
    const saved = {
      invoices: [] as any[],
      rentalInvoices: [] as any[],
      lineItems: [] as any[],
      logs: [] as any[],
      logLinks: [] as any[],
      logHistory: [] as any[],
    };
    let invoiceId = 1000;
    let lineItemId = 2000;
    let logId = 3000;

    const upsert = (collection: any[], entity: any) => {
      const index = collection.findIndex((item) => item.id === entity.id);
      if (index >= 0) {
        collection[index] = entity;
      } else {
        collection.push(entity);
      }
      return entity;
    };

    const manager: any = {
      create: vi.fn((_entity, data) => ({ ...data })),
      findOne: vi.fn(async (entity, query) => {
        switch (entity) {
          case User:
            return options.customer;
          case Location:
            return options.location;
          case LogObject:
            return { id: 11, name: LogObjectType.INVOICE };
          case LogActivity:
            return { id: 22, name: LogActivityType.TYPE_CREATE };
          case Invoice:
            return saved.invoices.find((invoice) => invoice.id === query?.where?.id) || null;
          case InvoiceLineItem:
            return (
              saved.lineItems.find(
                (lineItem) =>
                  lineItem.invoiceId === query?.where?.invoiceId &&
                  lineItem.itemId === query?.where?.itemId,
              ) || null
            );
          case TaxTypeTaxStatusAssoc:
            return null;
          default:
            return null;
        }
      }),
      find: vi.fn(async (entity) => {
        if (entity === EquipmentRentalInstrument) {
          return options.instruments;
        }
        return [];
      }),
      save: vi.fn(async (entity, payload) => {
        if (Array.isArray(payload)) {
          return Promise.all(payload.map((item) => manager.save(entity, item)));
        }

        switch (entity) {
          case Invoice:
            if (!payload.id) {
              payload.id = ++invoiceId;
            }
            return upsert(saved.invoices, payload);
          case EquipmentRentalInvoice:
            if (!payload.id) {
              payload.id = saved.rentalInvoices.length + 1;
            }
            return upsert(saved.rentalInvoices, payload);
          case InvoiceLineItem:
            if (!payload.id) {
              payload.id = ++lineItemId;
            }
            return upsert(saved.lineItems, payload);
          case Log:
            if (!payload.id) {
              payload.id = ++logId;
            }
            return upsert(saved.logs, payload);
          case LogLink:
            if (!payload.id) {
              payload.id = saved.logLinks.length + 1;
            }
            return upsert(saved.logLinks, payload);
          case LogHistory:
            if (!payload.id) {
              payload.id = saved.logHistory.length + 1;
            }
            return upsert(saved.logHistory, payload);
          default:
            return payload;
        }
      }),
    };

    manager.transaction = vi.fn(async (callback: any) => callback(manager));

    return { manager, saved };
  }

  let equipmentRentalRepository: any;
  let locationRepository: any;
  let equipmentRentalInvoiceRepository: any;
  let invoiceRepository: any;
  let repository: InvoiceEquipmentRentalsCronRepository;

  beforeEach(() => {
    equipmentRentalRepository = {
      find: vi.fn(),
      manager: null,
    };
    locationRepository = {
      createQueryBuilder: vi.fn(),
    };
    equipmentRentalInvoiceRepository = {
      createQueryBuilder: vi.fn(),
      count: vi.fn(),
    };
    invoiceRepository = {
      createQueryBuilder: vi.fn(),
    };

    repository = new InvoiceEquipmentRentalsCronRepository(
      equipmentRentalRepository,
      locationRepository,
      equipmentRentalInvoiceRepository,
      invoiceRepository,
    );
  });

  it('queries only non-deleted rentals for the cron candidate list', async () => {
    equipmentRentalRepository.find.mockResolvedValue([]);

    await repository.getEquipmentRentalsForCron();

    expect(equipmentRentalRepository.find).toHaveBeenCalledWith({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });
  });

  it('creates a fixed-term rental invoice with correct customer, location, line items, codes, and logs', async () => {
    const customer = {
      id: 91,
      username: 'amy.jones',
      isDeleted: false,
      profile: { firstname: 'Amy', lastname: 'Jones' },
      userLocation: { locationId: 48 },
    };
    const botUser = {
      id: 727,
      username: 'smw.bot',
      profile: { firstname: 'SMW', lastname: 'Bot' },
    };
    const location = { id: 48, provinceId: 1 };
    const instruments = [
      {
        id: 1,
        equipmentRentalsId: 501,
        instrument: 1001,
        item: {
          code: 'GTR',
          price: 100,
          description: 'Guitar Rental',
          taxStatusId: 1,
          royaltyFree: 0,
        },
      },
      {
        id: 2,
        equipmentRentalsId: 501,
        instrument: 1001,
        item: {
          code: 'GTR',
          price: 100,
          description: 'Guitar Rental',
          taxStatusId: 1,
          royaltyFree: 0,
        },
      },
      {
        id: 3,
        equipmentRentalsId: 501,
        instrument: 1002,
        item: {
          code: 'AMP',
          price: 50,
          description: 'Amp Rental',
          taxStatusId: 1,
          royaltyFree: 0,
        },
      },
    ];
    const { manager, saved } = createManagerHarness({
      customer,
      location,
      instruments,
      botUser,
    });
    equipmentRentalRepository.manager = manager;

    vi.spyOn(repository as any, 'findBotUser').mockResolvedValue(botUser);
    vi.spyOn(repository as any, 'createTransaction').mockResolvedValue(321);
    vi.spyOn(repository as any, 'getNextInvoiceNumber').mockResolvedValue(77);
    vi.spyOn(repository as any, 'resolveTaxContext').mockResolvedValue({
      taxRate: 13,
      taxStatusName: 'HST',
      taxTypeName: 'HST',
      taxCode: 'HST',
    });

    const result = await repository.createFixedTermRentalInvoice(
      {
        id: 501,
        customerId: 91,
        studentId: 200,
        startDate: new Date('2026-05-05T00:00:00.000Z'),
        returnDate: new Date('2026-07-31T00:00:00.000Z'),
        endDate: null,
        duration: 2,
        isOnGoing: false,
        hst: 52,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
      '2026-09-01',
    );

    expect(result).toMatchObject({
      invoiceNumber: 77,
      lineItemsCreated: 2,
      subtotal: 500,
      tax: 52,
      total: 552,
    });

    expect(saved.invoices).toHaveLength(1);
    expect(saved.invoices[0]).toMatchObject({
      userId: 91,
      locationId: 48,
      isEquipmentRentalContract: true,
    });

    expect(saved.rentalInvoices).toHaveLength(1);
    expect(saved.rentalInvoices[0]).toMatchObject({
      equipmentRentalsId: 501,
      invoiceId: saved.invoices[0].id,
    });

    expect(saved.lineItems).toHaveLength(2);
    const guitarLine = saved.lineItems.find((line) => line.itemId === 1001);
    const ampLine = saved.lineItems.find((line) => line.itemId === 1002);
    expect(guitarLine).toMatchObject({
      unit: 2,
      code: 'GTR',
      amount: 200,
    });
    expect(ampLine).toMatchObject({
      unit: 1,
      code: 'AMP',
      amount: 100,
    });

    expect(saved.logs).toHaveLength(1);
    expect(saved.logLinks).toHaveLength(2);
    expect(saved.logHistory).toHaveLength(1);
  });

  it('creates the legacy-prorated first ongoing invoice amount for late-month starts', async () => {
    const customer = {
      id: 92,
      username: 'john.smith',
      isDeleted: false,
      profile: { firstname: 'John', lastname: 'Smith' },
      userLocation: { locationId: 48 },
    };
    const botUser = {
      id: 727,
      username: 'smw.bot',
      profile: { firstname: 'SMW', lastname: 'Bot' },
    };
    const location = { id: 48, provinceId: 1 };
    const instruments = [
      {
        id: 10,
        equipmentRentalsId: 502,
        instrument: 1101,
        item: {
          code: 'VLN',
          price: 100,
          description: 'Violin Rental',
          taxStatusId: 1,
          royaltyFree: 0,
        },
      },
    ];
    const { manager, saved } = createManagerHarness({
      customer,
      location,
      instruments,
      botUser,
    });
    equipmentRentalRepository.manager = manager;

    vi.spyOn(repository as any, 'findBotUser').mockResolvedValue(botUser);
    vi.spyOn(repository as any, 'createTransaction').mockResolvedValue(322);
    vi.spyOn(repository as any, 'getNextInvoiceNumber').mockResolvedValue(78);
    vi.spyOn(repository as any, 'resolveTaxContext').mockResolvedValue({
      taxRate: 13,
      taxStatusName: 'HST',
      taxTypeName: 'HST',
      taxCode: 'HST',
    });

    const result = await repository.createOngoingRentalInvoice(
      {
        id: 502,
        customerId: 92,
        studentId: 201,
        startDate: new Date('2026-05-20T00:00:00.000Z'),
        returnDate: null,
        endDate: null,
        duration: 1,
        isOnGoing: true,
        hst: 13,
        createdOn: new Date('2026-05-01T00:00:00.000Z'),
      },
      '2026-05-20',
      true,
    );

    expect(result).toMatchObject({
      lineItemsCreated: 1,
      subtotal: 138.71,
      tax: 18.03,
      total: 156.74,
    });

    expect(saved.lineItems).toHaveLength(1);
    expect(saved.lineItems[0]).toMatchObject({
      code: 'VLN',
      amount: 138.71,
      netTotal: 138.71,
    });
  });
});
