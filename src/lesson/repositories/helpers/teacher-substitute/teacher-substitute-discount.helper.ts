import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LessonDiscount } from '../../../entities/lesson-discount.entity';

@Injectable()
export class TeacherSubstituteDiscountHelper {
  constructor(
    @InjectRepository(LessonDiscount)
    private readonly lessonDiscountRepository: Repository<LessonDiscount>,
  ) {}

  /**
   * Copy discounts from old lesson to new lesson
   */
  async copyDiscounts(
    oldLessonId: number,
    newLessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const discountRepo = manager
      ? manager.getRepository(LessonDiscount)
      : this.lessonDiscountRepository;

    const oldDiscounts = await discountRepo.find({
      where: { lessonId: oldLessonId },
    });

    if (oldDiscounts.length > 0) {
      const newDiscounts = oldDiscounts.map((discount) =>
        discountRepo.create({
          ...discount,
          id: undefined,
          lessonId: newLessonId,
        }),
      );
      await discountRepo.save(newDiscounts);
    }
  }
}
