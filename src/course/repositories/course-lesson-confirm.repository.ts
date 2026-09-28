import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Lesson } from '../../lesson/entities/lesson.entity';
import { LessonHierarchy } from '../../lesson/entities/lesson-hierarchy.entity';

@Injectable()
export class CourseLessonConfirmRepository {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(LessonHierarchy)
    private readonly lessonHierarchyRepository: Repository<LessonHierarchy>,
  ) {}

  /**
   * Get course by ID
   */
  async getCourseById(courseId: number): Promise<Course | null> {
    return await this.courseRepository.findOne({
      where: { id: courseId, isDeleted: false },
    });
  }

  /**
   * Get all unconfirmed lessons for a course
   * 
   * PERFORMANCE NOTE:
   * - Legacy PHP uses LIMIT 12 and queues remaining via 'MakeLessonAsRoot' job
   * - Current implementation processes ALL lessons at once (simpler, no queue dependency)
   * - Typical group course: 4-36 lessons (2-12 weeks × 2-3 lessons/week)
   * 
   * IF PERFORMANCE ISSUES ARISE:
   * 1. Add 'take: 12' to this query
   * 2. Install Bull queue: npm install @nestjs/bull bull
   * 3. Create processor to handle remaining lessons in background
   * 4. Service calls this method repeatedly until all confirmed
   * 
   * Example with limit:
   *   return await this.lessonRepository.find({
   *     where: { courseId, isDeleted: false, isConfirmed: false },
   *     order: { date: 'ASC' },
   *     take: 12,  // <-- Add this
   *   });
   */
  async getUnconfirmedLessons(courseId: number): Promise<Lesson[]> {
    return await this.lessonRepository.find({
      where: {
        courseId,
        isDeleted: false,
        isConfirmed: false,
      },
      order: {
        date: 'ASC',
      },
    });
  }

  /**
   * Update course isConfirmed status
   * Matches legacy: $courseModel->updateAttributes(['isConfirmed' => true]);
   */
  async updateCourseConfirmStatus(
    courseId: number,
    isConfirmed: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Course) : this.courseRepository;
    await repo.update({ id: courseId }, { isConfirmed });
  }

  /**
   * Update lesson isConfirmed status
   * Matches legacy: $lesson->isConfirmed = true; $lesson->save();
   */
  async updateLessonConfirmStatus(
    lessonId: number,
    isConfirmed: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Lesson) : this.lessonRepository;
    await repo.update({ id: lessonId }, { isConfirmed });
  }

  /**
   * Create lesson hierarchy root record
   * Matches legacy: $lesson->makeAsRoot() -> $this->markAsRoot()
   * 
   * The ClosureTable behavior in Yii2 creates a self-referencing record
   * with depth=0 when markAsRoot() is called
   */
  async createLessonHierarchyRoot(
    lessonId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager 
      ? manager.getRepository(LessonHierarchy) 
      : this.lessonHierarchyRepository;

    // Check if already exists (idempotent)
    const existing = await repo.findOne({
      where: { 
        lessonId: lessonId, 
        childLessonId: lessonId, 
        depth: 0 
      },
    });

    if (!existing) {
      const hierarchy = repo.create({
        lessonId: lessonId,
        childLessonId: lessonId,
        depth: 0,
      });
      await repo.save(hierarchy);
    }
  }

  /**
   * Run operations in a transaction
   */
  async runInTransaction<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return await this.courseRepository.manager.transaction(operation);
  }
}
