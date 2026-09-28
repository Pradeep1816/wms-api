import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lesson } from '../../entities/lesson.entity';

@Injectable()
export class PrivateLessonEmailSelectedRepository {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  /**
   * Find lesson IDs that belong to the given location (private lessons only).
   * Used to validate user can access lessons before fetching email data.
   */
  async findLessonIdsInLocation(
    lessonIds: number[],
    locationId: number,
  ): Promise<number[]> {
    if (!lessonIds?.length) return [];
    const rows = await this.lessonRepository
      .createQueryBuilder('lesson')
      .innerJoin('lesson.course', 'course')
      .select('lesson.id')
      .where('lesson.id IN (:...lessonIds)', { lessonIds })
      .andWhere('lesson.isDeleted = :isDeleted', { isDeleted: false })
      .andWhere('course.locationId = :locationId', { locationId })
      .andWhere(
        'EXISTS (SELECT 1 FROM private_lesson pl WHERE pl.lessonId = lesson.id)',
      )
      .getMany();
    return rows.map((r) => r.id);
  }

  /**
   * Load lessons with course -> enrolments -> student -> user -> contacts -> emails
   * and return unique emails plus default subject for the email form.
   */
  async getEmailMultiCustomer(lessonIds: number[]): Promise<any> {
    if (!lessonIds?.length) {
      return { emails: [], subject: 'Message from Arcadia Academy of Music' };
    }

    const lessons = await this.lessonRepository.find({
      where: { id: In(lessonIds) },
      relations: [
        'course',
        'course.enrolments',
        'course.enrolments.student',
        'course.enrolments.student.user',
        'course.enrolments.student.user.contacts',
        'course.enrolments.student.user.contacts.emails',
      ],
    });

    const emailSet = new Set<string>();
    for (const lesson of lessons) {
      const enrolments = lesson.course?.enrolments ?? [];
      for (const enrolment of enrolments) {
        const user = enrolment.student?.user;
        if (!user?.contacts) continue;
        for (const contact of user.contacts) {
          if (contact.isDeleted) continue;
          const emails = contact.emails ?? [];
          for (const e of emails) {
            if (e?.email && !e.isDeleted) emailSet.add(e.email);
          }
        }
      }
    }

    const emails = Array.from(emailSet);
    const subject = 'Message from Arcadia Academy of Music';

    return { emails, subject };
  }

  /**
   * Fetch lessons with student info for creating log entries.
   * Loads: lesson -> course -> enrolments -> student -> user -> profile
   */
  async findLessonsWithStudentInfo(lessonIds: number[]): Promise<Lesson[]> {
    if (!lessonIds?.length) {
      return [];
    }

    return this.lessonRepository.find({
      where: { id: In(lessonIds) },
      relations: [
        'course',
        'course.enrolments',
        'course.enrolments.student',
        'course.enrolments.student.user',
        'course.enrolments.student.user.profile',
      ],
    });
  }

  /**
   * Fetch a single user with profile by ID.
   */
  async findUserWithProfile(userId: number): Promise<any> {
    return this.lessonRepository.manager.findOne('User', {
      where: { id: userId },
      relations: ['profile'],
    });
  }

  /**
   * Save a log link entry.
   */
  async saveLogLink(logLinkData: any): Promise<any> {
    return this.lessonRepository.manager.getRepository('LogLink').save(logLinkData);
  }
}
