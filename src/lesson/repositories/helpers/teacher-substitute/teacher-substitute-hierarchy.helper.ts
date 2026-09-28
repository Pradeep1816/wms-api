import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { LessonHierarchy } from '../../../entities/lesson-hierarchy.entity';

@Injectable()
export class TeacherSubstituteHierarchyHelper {
  constructor(
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
  ) {}

  /**
   * Create lesson hierarchy link (makeAsChild equivalent)
   * Legacy: $oldLesson->makeAsChild($newLesson, $permanentRescheduleDate, $enrolmentId)
   * Note: Discount copying is handled in cancelAndReschedule, not here
   * Must be called with manager so all DB access runs in the same transaction.
   */
  async makeAsChild(
    parentLessonId: number,
    childLessonId: number,
    manager: EntityManager,
  ): Promise<void> {
    const hierarchyRepo = manager.getRepository(LessonHierarchy);

    // Get all ancestors of the parent (including parent's self-row (parent, parent, 0) if present)
    const parentAncestors = await hierarchyRepo.find({
      where: { childLessonId: parentLessonId },
    });

    // Closure links: each ancestor → new child with depth + 1 (includes (parent, child, 1) when parent has self-row)
    const closures: LessonHierarchy[] = parentAncestors.map((ancestor) =>
      hierarchyRepo.create({
        lessonId: ancestor.lessonId,
        childLessonId: childLessonId,
        depth: ancestor.depth + 1,
      }),
    );

    // If parent had no hierarchy row, add direct parent → child link
    if (parentAncestors.length === 0) {
      closures.push(
        hierarchyRepo.create({
          lessonId: parentLessonId,
          childLessonId: childLessonId,
          depth: 1,
        }),
      );
    }

    // Every node has self-row (id, id, 0)
    closures.push(
      hierarchyRepo.create({
        lessonId: childLessonId,
        childLessonId: childLessonId,
        depth: 0,
      }),
    );

    await hierarchyRepo.save(closures);

  }
}
