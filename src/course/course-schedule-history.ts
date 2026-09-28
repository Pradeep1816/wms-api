import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { CourseSchedule } from './entities/course-schedule.entity';

/** Retain only the history preceding a replacement schedule's effective day. */
export async function closeCourseScheduleHistory(
  repository: Repository<CourseSchedule>,
  courseId: number,
  effectiveDate: Date,
): Promise<void> {
  const startDate = new Date(effectiveDate);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() - 1);

  // These periods are wholly superseded; truncating them would reverse their dates.
  await repository.delete({ courseId, startDate: MoreThanOrEqual(startDate) });
  await repository.update(
    { courseId, startDate: LessThan(startDate), endDate: MoreThanOrEqual(startDate) },
    { endDate },
  );
}
