import { describe, expect, it, vi } from 'vitest';
import { ItemRepository } from './item.repository';
import { ItemCategory } from '../entities/item-category.entity';
import { Location } from '../../location/entities/location.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { LocationCategoryRoyalty } from '../../location/entities/location-category-royalty.entity';

const createDto = {
  itemCategoryId: 7,
  code: 'TEST',
  upcCode: null,
  description: 'Test item',
  price: 10,
  royaltyFree: 0,
  taxStatusId: 1,
  status: 1,
};

function createRepository(activeCategory: object | null) {
  const categoryRepository = {
    findOne: vi.fn().mockResolvedValue(activeCategory),
  };
  const itemRepository = {
    manager: {
      getRepository: vi.fn().mockReturnValue(categoryRepository),
    },
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn((value: Record<string, unknown>) => value),
    save: vi.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 1, ...value }),
    ),
  };

  return {
    repository: new ItemRepository(itemRepository as any, {} as any),
    itemRepository,
    categoryRepository,
  };
}

describe('ItemRepository category validation', () => {
  it('rejects item creation when the category is deleted or missing', async () => {
    const { repository, itemRepository, categoryRepository } =
      createRepository(null);

    await expect(repository.createItem(1, createDto)).rejects.toThrow(
      'Item category is deleted or does not exist.',
    );
    expect(categoryRepository.findOne).toHaveBeenCalledWith({
      where: { id: createDto.itemCategoryId, isDeleted: false },
    });
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  it('creates an item when its category is active', async () => {
    const { repository, itemRepository } = createRepository({
      id: createDto.itemCategoryId,
      isDeleted: false,
    });

    await expect(repository.createItem(1, createDto)).resolves.toMatchObject({
      id: 1,
      itemCategoryId: createDto.itemCategoryId,
      locationId: 1,
    });
    expect(itemRepository.save).toHaveBeenCalledOnce();
  });
});

function createCategoryRepository(
  activeLocations: Array<{ id: number }>,
  lessonRoyalties: Array<{ locationId: number; value: number }>,
) {
  const manager = {
    find: vi.fn((entity) => {
      if (entity === Location) {
        return Promise.resolve(activeLocations);
      }
      if (entity === LocationDebt) {
        return Promise.resolve(lessonRoyalties);
      }
      return Promise.resolve([]);
    }),
    create: vi.fn((entity: unknown, value: Record<string, unknown>) => {
      if (entity === ItemCategory) {
        return { id: 22, ...value };
      }
      return value;
    }),
    save: vi.fn((_entity: unknown, value: unknown) => Promise.resolve(value)),
  };
  const queryRunner = {
    data: {},
    manager,
    connect: vi.fn().mockResolvedValue(undefined),
    startTransaction: vi.fn().mockResolvedValue(undefined),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const itemRepository = {
    manager: {
      connection: {
        createQueryRunner: vi.fn(() => queryRunner),
      },
    },
  };

  return {
    repository: new ItemRepository(itemRepository as any, {} as any),
    manager,
    queryRunner,
  };
}

describe('ItemRepository category royalty defaults', () => {
  it('uses every active location lesson royalty for a new category', async () => {
    const { repository, manager, queryRunner } = createCategoryRepository(
      [{ id: 1 }, { id: 2 }],
      [
        { locationId: 1, value: 6 },
        { locationId: 2, value: 7.5 },
      ],
    );

    await expect(
      repository.createItemCategory(
        {
          name: 'Accessories',
          description: 'Retail accessories',
          royality: 0,
        },
        99,
        1,
      ),
    ).resolves.toMatchObject({
      id: 22,
      name: 'Accessories',
      royality: 6,
    });

    expect(manager.create).toHaveBeenCalledWith(LocationCategoryRoyalty, {
      locationId: 1,
      itemCategoryId: 22,
      royality: 6,
      advertisement: 0,
      createdByUserId: 99,
      updatedByUserId: 99,
    });
    expect(manager.create).toHaveBeenCalledWith(LocationCategoryRoyalty, {
      locationId: 2,
      itemCategoryId: 22,
      royality: 7.5,
      advertisement: 0,
      createdByUserId: 99,
      updatedByUserId: 99,
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledOnce();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back when an active location has no lesson royalty', async () => {
    const { repository, manager, queryRunner } = createCategoryRepository(
      [{ id: 1 }, { id: 2 }],
      [{ locationId: 1, value: 6 }],
    );

    await expect(
      repository.createItemCategory({ name: 'Accessories' }, 99, 1),
    ).rejects.toThrow(
      'Location 2 must have a lesson royalty before creating an item category.',
    );

    expect(manager.create).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledOnce();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });
});
