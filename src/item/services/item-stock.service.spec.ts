import 'reflect-metadata';
import { FindOperator, Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RolesEnum } from '../../auth/enums/roles.enum';
import { Item } from '../entities/item.entity';
import { ItemCategory } from '../entities/item-category.entity';
import { ItemLocationStock } from '../entities/item-location-stock.entity';
import { ItemRepository } from '../repositories/item.repository';
import { ItemService } from './item.service';
import { Location } from '../../location/entities/location.entity';
import { TaxStatus } from '../../tax/entities/tax-status.entity';

function fixture(item: Item | null) {
  const itemRows = {
    findOne: vi.fn(
      (options: { where: { locationId: FindOperator<number> } }) => {
        const allowedLocations = options.where.locationId.value;
        if (!Array.isArray(allowedLocations))
          throw new Error('Expected location scope');
        return Promise.resolve(
          item && allowedLocations.includes(item.locationId) ? item : null,
        );
      },
    ),
  };
  const stockRows = {
    create: vi.fn((input: Partial<ItemLocationStock>) =>
      Object.assign(new ItemLocationStock(), input),
    ),
    upsert: vi.fn(() => Promise.resolve(undefined)),
    findOneOrFail: vi.fn(async () => ({ trackInventory: false, stockQuantity: null, lowStockQuantity: null })),
    createQueryBuilder: vi.fn(() => ({ insert() { return this; }, values() { return this; }, orIgnore() { return this; }, execute: vi.fn() })),
    manager: {} as any,
  };
  stockRows.manager = { queryRunner: { isTransactionActive: true }, insert: vi.fn(),
    getRepository: () => stockRows, transaction: async (action: any) => action(stockRows.manager) };
  const repository = new ItemRepository(
    itemRows as unknown as Repository<Item>,
    stockRows as unknown as Repository<ItemLocationStock>,
  );
  const service = new ItemService(
    {} as Repository<ItemCategory>,
    {} as Repository<Location>,
    {} as Repository<TaxStatus>,
    repository,
  );
  return { itemRows, stockRows, repository, service };
}

describe('location item stock', () => {
  it('stores separate stock and low-stock levels for a shared item at two schools', async () => {
    const item = Object.assign(new Item(), {
      id: 10,
      code: 'BOOK',
      locationId: 0,
      isDeleted: false,
    });
    const f = fixture(item);
    await f.service.updateItemStock(10, 15, [RolesEnum.ADMINISTRATOR], {
      trackInventory: true,
      stockQuantity: 2,
      lowStockQuantity: 5,
    });
    await f.service.updateItemStock(10, 20, [RolesEnum.OWNER], {
      trackInventory: true,
      stockQuantity: 12,
      lowStockQuantity: 5,
    });

    expect(f.stockRows.upsert.mock.calls.map(([stock]) => stock)).toMatchObject(
      [
        { itemId: 10, locationId: 15, stockQuantity: 2, lowStockQuantity: 5 },
        { itemId: 10, locationId: 20, stockQuantity: 12, lowStockQuantity: 5 },
      ],
    );
    expect(f.itemRows.findOne.mock.calls[0][0].where.locationId.value).toEqual([
      15, 0,
    ]);
    expect(f.itemRows.findOne.mock.calls[1][0].where.locationId.value).toEqual([
      20, 0,
    ]);
  });

  it('rejects items unavailable at the school and accounting items', async () => {
    const missing = fixture(null);
    await expect(
      missing.service.updateItemStock(10, 15, [RolesEnum.ADMINISTRATOR], {
        trackInventory: true,
        stockQuantity: 1,
        lowStockQuantity: 2,
      }),
    ).rejects.toThrow('not found');
    expect(missing.stockRows.upsert).not.toHaveBeenCalled();

    const elsewhere = fixture(
      Object.assign(new Item(), {
        id: 10,
        code: 'BOOK',
        locationId: 20,
        isDeleted: false,
      }),
    );
    await expect(
      elsewhere.service.updateItemStock(10, 15, [RolesEnum.ADMINISTRATOR], {
        trackInventory: true,
        stockQuantity: 1,
        lowStockQuantity: 2,
      }),
    ).rejects.toThrow('not found');
    expect(elsewhere.stockRows.upsert).not.toHaveBeenCalled();

    const accounting = fixture(
      Object.assign(new Item(), {
        id: 1,
        code: 'OPENING BALANCE',
        locationId: 15,
        isDeleted: false,
      }),
    );
    await expect(
      accounting.service.updateItemStock(1, 15, [RolesEnum.ADMINISTRATOR], {
        trackInventory: true,
        stockQuantity: 1,
        lowStockQuantity: 2,
      }),
    ).rejects.toThrow('accounting');
    expect(accounting.stockRows.upsert).not.toHaveBeenCalled();
  });

  it('keeps legacy stock updates tracked when the toggle is omitted', async () => {
    const item = Object.assign(new Item(), {
      id: 10,
      code: 'BOOK',
      locationId: 15,
      isDeleted: false,
    });
    const f = fixture(item);

    await f.service.updateItemStock(10, 15, [RolesEnum.ADMINISTRATOR], {
      stockQuantity: 7,
      lowStockQuantity: 3,
    });

    expect(f.stockRows.upsert.mock.calls[0][0]).toMatchObject({
      itemId: 10,
      locationId: 15,
      trackInventory: true,
      stockQuantity: 7,
      lowStockQuantity: 3,
    });
  });
  it('turns tracking off and clears enforced quantities', async () => {
    const item = Object.assign(new Item(), {
      id: 10,
      code: 'BOOK',
      locationId: 15,
      isDeleted: false,
    });
    const f = fixture(item);

    await f.service.updateItemStock(10, 15, [RolesEnum.ADMINISTRATOR], {
      trackInventory: false,
    });

    expect(f.stockRows.upsert.mock.calls[0][0]).toMatchObject({
      itemId: 10,
      locationId: 15,
      trackInventory: false,
      stockQuantity: null,
      lowStockQuantity: null,
    });
  });
  it('rejects staff stock updates before writing', async () => {
    const f = fixture(
      Object.assign(new Item(), {
        id: 10,
        code: 'BOOK',
        locationId: 15,
        isDeleted: false,
      }),
    );
    await expect(
      f.service.updateItemStock(10, 15, [RolesEnum.STAFFMEMBER], {
        trackInventory: true,
        stockQuantity: 1,
        lowStockQuantity: 2,
      }),
    ).rejects.toThrow('Only admin and owner');
    expect(f.itemRows.findOne).not.toHaveBeenCalled();
    expect(f.stockRows.upsert).not.toHaveBeenCalled();
  });
});
