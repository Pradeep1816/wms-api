/* eslint-disable @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access,
  @typescript-eslint/no-unsafe-return,
  @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { PermanentScheduleChangeDraftRepository } from './permanent-schedule-change-draft.repository';

type RawRow = Record<string, unknown> | null;

function createQueryBuilderMock(rawResult: RawRow) {
  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(async () => rawResult),
  };
  return queryBuilder;
}

function createManagerMock(rawResults: RawRow[]) {
  const builders = rawResults.map(createQueryBuilderMock);
  let callIndex = 0;

  return {
    createQueryBuilder: vi.fn(() => builders[callIndex++]),
    builders,
  };
}

describe('PermanentScheduleChangeDraftRepository classroom persistence', () => {
  it('resolves the legacy teacher classroom for a PSC draft lesson', async () => {
    const manager = createManagerMock([
      { id: 31 },
      { id: 91, classroomId: 55 },
      null,
    ]);
    const repository: any = Object.create(
      PermanentScheduleChangeDraftRepository.prototype,
    );
    const lessonDate = new Date(Date.UTC(2026, 4, 5, 15, 0, 0));

    const classroomId = await repository.resolveClassroom(
      manager,
      601,
      3,
      lessonDate,
      '00:45:00',
    );

    expect(classroomId).toBe(55);
    expect(manager.createQueryBuilder).toHaveBeenCalledTimes(3);

    const [teacherLocationBuilder, availabilityBuilder, unavailabilityBuilder] =
      manager.builders;
    expect(teacherLocationBuilder.from).toHaveBeenCalledWith(
      'user_location',
      'ul',
    );
    expect(teacherLocationBuilder.where).toHaveBeenCalledWith(
      'ul.user_id = :teacherId',
      { teacherId: 601 },
    );
    expect(teacherLocationBuilder.andWhere).toHaveBeenCalledWith(
      'ul.location_id = :locationId',
      { locationId: 3 },
    );
    expect(availabilityBuilder.from).toHaveBeenCalledWith(
      'teacher_availability_day',
      'ta',
    );
    expect(availabilityBuilder.where).toHaveBeenCalledWith(
      'ta.teacher_location_id = :teacherLocationId',
      { teacherLocationId: 31 },
    );
    expect(availabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'ta.day = :day',
      { day: 2 },
    );
    expect(availabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'ta.from_time <= :startTime',
      { startTime: '15:00:00' },
    );
    expect(availabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      3,
      'ta.to_time >= :endTime',
      { endTime: '15:45:00' },
    );
    expect(availabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      4,
      'ta.isDeleted = false',
    );
    expect(unavailabilityBuilder.from).toHaveBeenCalledWith(
      'classroom_unavailability',
      'cu',
    );
    expect(unavailabilityBuilder.where).toHaveBeenCalledWith(
      'cu.classroomId = :classroomId',
      { classroomId: 55 },
    );
    expect(unavailabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'DATE(cu.fromDate) <= :lessonDate',
      { lessonDate: '2026-05-05' },
    );
    expect(unavailabilityBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'DATE(cu.toDate) >= :lessonDate',
      { lessonDate: '2026-05-05' },
    );
  });

  it('returns null when the classroom is unavailable', async () => {
    const manager = createManagerMock([
      { id: 31 },
      { id: 91, classroomId: 55 },
      { id: 1 },
    ]);
    const repository: any = Object.create(
      PermanentScheduleChangeDraftRepository.prototype,
    );

    await expect(
      repository.resolveClassroom(
        manager,
        601,
        3,
        new Date(Date.UTC(2026, 4, 5, 15, 0, 0)),
        '00:45:00',
      ),
    ).resolves.toBeNull();
  });
});
