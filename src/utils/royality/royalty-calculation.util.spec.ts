import { EntityManager } from 'typeorm';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { LocationCategoryRoyalty } from '../../location/entities/location-category-royalty.entity';
import {
  calculateLessonPaymentRevenue,
  calculateProratedFinancialAmount,
  calculateRoyaltyAmount,
  resolveRoyaltySnapshot,
} from './royalty-calculation.util';

const asEntityManager = (findOne: ReturnType<typeof vi.fn>): EntityManager =>
  ({ findOne }) as unknown as EntityManager;

describe('royalty calculation', () => {
  it('uses the location royalty for lesson items', async () => {
    const findOne = vi.fn((entity: unknown) =>
      Promise.resolve(entity === LocationDebt ? { value: 6.25 } : null),
    );
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 10,
      itemCategoryId: ItemCategory.CATEGORY_LESSON,
      royaltyFree: 0,
    });

    expect(result).toEqual({
      categoryId: ItemCategory.CATEGORY_LESSON,
      rate: 6.25,
      advertisementRate: 6.25,
    });
    expect(findOne).toHaveBeenCalledWith(LocationDebt, {
      where: { locationId: 9, type: LocationDebt.TYPE_ROYALTY },
    });
  });

  it('uses the location category royalty for non-lesson items', async () => {
    const findOne = vi.fn((entity: unknown) =>
      Promise.resolve(
        entity === ItemCategory
          ? { id: 7, isDeleted: false }
          : entity === LocationCategoryRoyalty
            ? { royality: 5 }
            : null,
      ),
    );
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 11,
      itemCategoryId: 7,
      royaltyFree: 0,
    });

    expect(result).toEqual({ categoryId: 7, rate: 5, advertisementRate: 0 });
    expect(findOne).toHaveBeenCalledWith(LocationCategoryRoyalty, {
      where: { locationId: 9, itemCategoryId: 7 },
    });
  });

  it('defaults a non-lesson category to zero when the location has no configured rate', async () => {
    const findOne = vi.fn((entity: unknown) =>
      Promise.resolve(
        entity === ItemCategory ? { id: 7, isDeleted: false } : null,
      ),
    );
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 11,
      itemCategoryId: 7,
      royaltyFree: 0,
    });

    expect(result).toEqual({ categoryId: 7, rate: 0, advertisementRate: 0 });
  });

  it('resolves different rates for the same category at different locations', async () => {
    const findOne = vi.fn(
      (entity: unknown, options: { where: { locationId?: number } }) =>
        Promise.resolve(
          entity === ItemCategory
            ? { id: 7, isDeleted: false }
            : { royality: options.where.locationId === 9 ? 4 : 7.5 },
        ),
    );
    const manager = asEntityManager(findOne);
    const item = { id: 11, itemCategoryId: 7, royaltyFree: 0 };

    await expect(resolveRoyaltySnapshot(manager, 9, item)).resolves.toEqual({
      categoryId: 7,
      rate: 4,
      advertisementRate: 0,
    });
    await expect(resolveRoyaltySnapshot(manager, 10, item)).resolves.toEqual({
      categoryId: 7,
      rate: 7.5,
      advertisementRate: 0,
    });
  });

  it('does not apply a location rate when the category has been deleted', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 11,
      itemCategoryId: 7,
      royaltyFree: 0,
    });

    expect(result).toEqual({ categoryId: 7, rate: 0, advertisementRate: 0 });
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne).toHaveBeenCalledWith(ItemCategory, {
      where: { id: 7, isDeleted: false },
    });
  });

  it('makes royalty-free override both lesson and category rates', async () => {
    const findOne = vi.fn();
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 12,
      itemCategoryId: ItemCategory.CATEGORY_LESSON,
      royaltyFree: 1,
    });

    expect(result).toEqual({
      categoryId: ItemCategory.CATEGORY_LESSON,
      rate: 0,
      advertisementRate: 0,
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('never applies royalty to the protected opening balance category', async () => {
    const findOne = vi.fn();
    const manager = asEntityManager(findOne);

    const result = await resolveRoyaltySnapshot(manager, 9, {
      id: 12,
      itemCategoryId: ItemCategory.CATEGORY_OPENING_BALANCE,
      royaltyFree: 0,
    });

    expect(result).toEqual({
      categoryId: ItemCategory.CATEGORY_OPENING_BALANCE,
      rate: 0,
      advertisementRate: 0,
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rounds the calculated royalty to cents and preserves negative returns', () => {
    expect(calculateRoyaltyAmount(123.45, 5)).toBe(6.17);
    expect(calculateRoyaltyAmount(-123.45, 5)).toBe(-6.17);
  });

  it('rounds positive and negative half-cent royalties symmetrically', () => {
    expect(calculateRoyaltyAmount(0.1, 5)).toBe(0.01);
    expect(calculateRoyaltyAmount(-0.1, 5)).toBe(-0.01);
  });

  it('recognizes invoice revenue only when a payment is applied', () => {
    expect(calculateProratedFinancialAmount(200, 0, 226)).toBe(0);
    expect(calculateProratedFinancialAmount(200, 113, 226)).toBe(100);
    expect(calculateProratedFinancialAmount(200, 226, 226)).toBe(200);
  });

  it('preserves the negative sign when a paid invoice is returned', () => {
    expect(calculateProratedFinancialAmount(-200, 226, 226)).toBe(-200);
  });

  it('removes proportional tax from a direct lesson payment', () => {
    expect(calculateLessonPaymentRevenue(29.38, 29.38, 3.38)).toBe(26);
    expect(calculateLessonPaymentRevenue(14.69, 29.38, 3.38)).toBe(13);
    expect(calculateLessonPaymentRevenue(-29.38, 29.38, 3.38)).toBe(-26);
  });
});
