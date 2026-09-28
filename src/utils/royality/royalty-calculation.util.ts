import { EntityManager } from 'typeorm';
import { Item } from '../../item/entities/item.entity';
import { ItemCategory } from '../../item/entities/item-category.entity';
import { LocationDebt } from '../../location/entities/location-debt.entity';
import { LocationCategoryRoyalty } from '../../location/entities/location-category-royalty.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { Course } from '../../course/entities/course.entity';
import { RoundingUtils } from '../rounding.utils';

export interface RoyaltySnapshot {
  categoryId: number;
  rate: number;
  advertisementRate: number;
}

export interface RoyaltyCategorySnapshot extends RoyaltySnapshot {
  categoryName: string;
}

type RoyaltyItem = Pick<Item, 'id' | 'itemCategoryId' | 'royaltyFree'>;

const normalizeRate = (value: unknown): number => {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return RoundingUtils.roundDecimal(rate, 2);
};

/**
 * Resolve the rate that must be frozen on a sale line.
 * - royalty-free always wins
 * - lessons use the location royalty
 * - every other category uses the category royalty configured for the location
 */
export async function resolveRoyaltySnapshot(
  manager: EntityManager,
  locationId: number,
  itemOrId: RoyaltyItem | number,
  royaltyFreeOverride?: number | boolean,
): Promise<RoyaltySnapshot> {
  const item =
    typeof itemOrId === 'number'
      ? await manager.findOne(Item, { where: { id: itemOrId } })
      : itemOrId;

  if (!item) {
    return { categoryId: 0, rate: 0, advertisementRate: 0 };
  }

  const categoryId = Number(item.itemCategoryId || 0);
  const royaltyFree =
    royaltyFreeOverride === undefined
      ? Boolean(Number(item.royaltyFree))
      : Boolean(Number(royaltyFreeOverride));

  if (royaltyFree || !categoryId) {
    return { categoryId, rate: 0, advertisementRate: 0 };
  }

  if (categoryId === ItemCategory.CATEGORY_OPENING_BALANCE) {
    return { categoryId, rate: 0, advertisementRate: 0 };
  }

  if (ItemCategory.usesLocationRoyalty(categoryId)) {
    const lessonRoyalty = await manager.findOne(LocationDebt, {
      where: {
        locationId,
        type: LocationDebt.TYPE_ROYALTY,
      },
    });
    return {
      categoryId,
      rate: normalizeRate(lessonRoyalty?.value),
      advertisementRate: await resolveAdvertisementRate(
        manager,
        locationId,
        categoryId,
      ),
    };
  }

  const activeCategory = await manager.findOne(ItemCategory, {
    where: { id: categoryId, isDeleted: false },
  });
  if (!activeCategory) {
    return { categoryId, rate: 0, advertisementRate: 0 };
  }

  const locationCategoryRoyalty = await manager.findOne(
    LocationCategoryRoyalty,
    {
      where: { locationId, itemCategoryId: categoryId },
    },
  );
  return {
    categoryId,
    rate: normalizeRate(locationCategoryRoyalty?.royality),
    advertisementRate: normalizeRate(locationCategoryRoyalty?.advertisement),
  };
}

export async function resolveLessonPaymentRoyaltySnapshot(
  manager: EntityManager,
  lessonId: number,
): Promise<RoyaltySnapshot> {
  const lessonLocation = await manager
    .getRepository(Lesson)
    .createQueryBuilder('lesson')
    .select('course.locationId', 'locationId')
    .innerJoin(Course, 'course', 'course.id = lesson.courseId')
    .where('lesson.id = :lessonId', { lessonId })
    .getRawOne();

  const locationId = Number(lessonLocation?.locationId || 0);
  if (!locationId) {
    return {
      categoryId: ItemCategory.CATEGORY_LESSON,
      rate: 0,
      advertisementRate: 0,
    };
  }

  const lessonRoyalty = await manager.findOne(LocationDebt, {
    where: {
      locationId,
      type: LocationDebt.TYPE_ROYALTY,
    },
  });

  return {
    categoryId: ItemCategory.CATEGORY_LESSON,
    rate: normalizeRate(lessonRoyalty?.value),
    advertisementRate: await resolveAdvertisementRate(
      manager,
      locationId,
      ItemCategory.CATEGORY_LESSON,
    ),
  };
}

export async function resolveCategoryRoyaltySnapshot(
  manager: EntityManager,
  locationId: number,
  categoryId: number,
): Promise<RoyaltyCategorySnapshot> {
  const category = await manager.findOne(ItemCategory, {
    where: { id: categoryId, isDeleted: false },
  });
  if (!category) {
    return {
      categoryId,
      categoryName: 'Uncategorized',
      rate: 0,
      advertisementRate: 0,
    };
  }

  if (categoryId === ItemCategory.CATEGORY_OPENING_BALANCE) {
    return {
      categoryId,
      categoryName: category.name,
      rate: 0,
      advertisementRate: 0,
    };
  }

  if (ItemCategory.usesLocationRoyalty(categoryId)) {
    const lessonRoyalty = await manager.findOne(LocationDebt, {
      where: {
        locationId,
        type: LocationDebt.TYPE_ROYALTY,
      },
    });
    return {
      categoryId,
      categoryName: category.name,
      rate: normalizeRate(lessonRoyalty?.value),
      advertisementRate: await resolveAdvertisementRate(
        manager,
        locationId,
        categoryId,
      ),
    };
  }

  const locationCategoryRoyalty = await manager.findOne(
    LocationCategoryRoyalty,
    {
      where: { locationId, itemCategoryId: categoryId },
    },
  );
  return {
    categoryId,
    categoryName: category.name,
    rate: normalizeRate(locationCategoryRoyalty?.royality),
    advertisementRate: normalizeRate(locationCategoryRoyalty?.advertisement),
  };
}

export function calculateRoyaltyAmount(amount: unknown, rate: unknown): number {
  const normalizedAmount = Number(amount);
  const normalizedRate = normalizeRate(rate);
  if (!Number.isFinite(normalizedAmount)) return 0;
  return RoundingUtils.roundHalfUp((normalizedAmount * normalizedRate) / 100);
}

export function calculateProratedFinancialAmount(
  componentAmount: unknown,
  appliedPaymentAmount: unknown,
  billingTotal: unknown,
): number {
  const component = Number(componentAmount);
  const payment = Math.abs(Number(appliedPaymentAmount));
  const total = Math.abs(Number(billingTotal));
  if (![component, payment, total].every(Number.isFinite) || total === 0)
    return 0;
  return RoundingUtils.roundDecimal((component * payment) / total, 2);
}

export function calculateLessonPaymentRevenue(
  appliedPaymentAmount: unknown,
  billingTotal: unknown,
  taxAmount: unknown,
): number {
  const payment = Number(appliedPaymentAmount);
  const total = Math.abs(Number(billingTotal));
  const tax = Math.abs(Number(taxAmount));
  if (![payment, total, tax].every(Number.isFinite) || total === 0) return 0;
  return (
    (Math.sign(payment) * Math.abs(payment) * Math.max(total - tax, 0)) / total
  );
}

/** Resolves a configured rate only when capturing a new transaction snapshot. */
export async function resolveAdvertisementRate(
  manager: EntityManager,
  locationId: number,
  categoryId: number,
): Promise<number> {
  if (!categoryId || categoryId === ItemCategory.CATEGORY_OPENING_BALANCE)
    return 0;
  if (categoryId === ItemCategory.CATEGORY_LESSON) {
    const debt = await manager.findOne(LocationDebt, {
      where: { locationId, type: LocationDebt.TYPE_ADVERTISEMENT },
    });
    return normalizeRate(debt?.value);
  }
  const rate = await manager.findOne(LocationCategoryRoyalty, {
    where: { locationId, itemCategoryId: categoryId },
  });
  return normalizeRate(rate?.advertisement);
}
