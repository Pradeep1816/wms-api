import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Program } from '../../program/entities/program.entity';
import { User } from '../../user/entities/user.entity';
import { Lesson } from '../entities/lesson.entity';
import { SubstituteLessonDto, SubstituteTeacherLessonRequestDto } from '../dto/teacher-substitute-request.dto';
import { SubstituteTeacherLessonResponseDto } from '../dto/teacher-substitute-response.dto';
import { ConfirmSubstituteRequestDto } from '../dto/teacher-substitute-confirm-request.dto';
import { LocationService } from '../../location/services/location.service';
import { TeacherSubstituteRepository } from '../repositories/teacher-substitute.repository';
import { formatDateWithTime, parseDateAsUTC } from 'src/utils/date-utils';
import { LessonRepository } from '../repositories/lesson.repository';

@Injectable()
export class TeacherSubstituteService {
  constructor(
    private readonly repository: TeacherSubstituteRepository,
    private readonly locationService: LocationService,
    private readonly lessonRepository: LessonRepository,
  ) {}

  /**
   * Lesson-level substitute teacher (from Group Course Lessons Tab)
   */
  async substituteTeacherForLessons(
    dto: SubstituteTeacherLessonRequestDto,
    userId: number,
    locationSlug: string,
  ): Promise<SubstituteTeacherLessonResponseDto> {
    // For preview mode (no teacherId), use lightweight query
    // For draft creation (with teacherId), load full lesson data
    const lessons = dto.teacherId
      ? await this.repository.getLessonsByIds(dto.ids)
      : await this.repository.getLessonsByIdsMinimal(dto.ids);

    if (lessons.length === 0) {
      throw new NotFoundException('Lessons not found');
    }

    // 2. Validate all lessons have same teacher
    const firstTeacherId = lessons[0].teacherId;
    const allSameTeacher = lessons.every(
      (l) => l.teacherId === firstTeacherId,
    );

    if (!allSameTeacher) {
      return {
        status: false,
        message: 'Choose lessons with same teacher',
      } as SubstituteTeacherLessonResponseDto;
    }

    // 3. Delete existing draft lessons if not resolving conflicts
    if (!dto.resolvingConflicts) {
      const draftLessons = await this.repository.getDraftLessonsByUser(userId);
      if (draftLessons.length > 0) {
        await this.repository.deleteDraftLessons(
          draftLessons.map((l) => l.id),
        );
      }
    }

    const newLessonIds: number[] = [];
    const conflicts: Record<number, string[]> = {};
    const conflictedLessonIdsSet = new Set<number>(); // Use Set to avoid duplicates

    // Get location ID (needed for both resolvingConflicts and teacherId cases)
    const locationId = await this.locationService.getLocationId(locationSlug);

    // 4. Handle resolving conflicts - validate existing draft lessons
    if (dto.resolvingConflicts) {
      const draftLessons = await this.repository.getDraftLessonsByUser(userId);
      if (draftLessons.length > 0) {
        const fullDraftLessons = await this.repository.getLessonsWithRelations(
          draftLessons.map((l) => l.id),
        );

        // Removed for 100% legacy parity (Legacy does NOT check student overlap). Do not remove this comment.
        // // Batch student IDs for private lessons (one query instead of N)
        // const privateCourseIds = fullDraftLessons
        //   .filter(
        //     (d) =>
        //       d.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM &&
        //       d.courseId,
        //   )
        //   .map((d) => d.courseId);
        // const studentIdsByCourse =
        //   privateCourseIds.length > 0
        //     ? await this.repository.getPrivateLessonStudentIds(
        //         [...new Set(privateCourseIds)],
        //       )
        //     : new Map<number, number | null>();

        for (const draftLesson of fullDraftLessons) {
          newLessonIds.push(draftLesson.id);

          // Collect all error messages in order (legacy: ActiveForm::validate)
          const errorMessages: string[] = [];
          const programId = draftLesson.course?.programId;

          if (!programId) {
            errorMessages.push('Teacher unqualified');
          } else {
            // Check 1: Teacher Qualification (Red - Blocking)
            const isUnqualified = await this.repository.checkTeacherQualification(
              draftLesson.teacherId,
              programId,
              locationId,
            );
            if (isUnqualified) {
              errorMessages.push('Teacher unqualified');
            }

            // Check 2: Teacher Occupied (Red - Blocking)
            const isOccupied = await this.repository.checkTeacherConflict(
              draftLesson.teacherId,
              draftLesson.date,
              draftLesson.duration,
              locationId,
              [draftLesson.id], // Only exclude the draft lesson
            );
            if (isOccupied) {
              errorMessages.push('Teacher occupied with another lesson');
            }

            // Removed for 100% legacy parity (Legacy does NOT check student overlap). Do not remove this comment.
            // // Check 3: Student overlap for private lessons (Red - Blocking)
            // if (
            //   draftLesson.course?.program?.type ===
            //   Program.TYPE_PRIVATE_PROGRAM
            // ) {
            //   const studentId = studentIdsByCourse.get(draftLesson.courseId) ?? null;
            //   if (studentId) {
            //     const hasStudentOverlap =
            //       await this.repository.checkStudentConflict(
            //         studentId,
            //         draftLesson.date,
            //         draftLesson.duration,
            //         locationId,
            //         [draftLesson.id],
            //       );
            //     if (hasStudentOverlap) {
            //       errorMessages.push('Student occupied with another lesson');
            //     }
            //   }
            // }

            // Check 3: Teacher Unscheduled for the day (Yellow - Warning only)
            // Legacy: Runs independently, regardless of other checks
            const isNotScheduledForDay =
              await this.repository.checkTeacherScheduledForDay(
                draftLesson.teacherId,
                draftLesson.date,
                locationId,
              );
            if (isNotScheduledForDay) {
              errorMessages.push('Warning: Teacher Unscheduled');
            }

            // Check 4: Teacher Not Available at that time (Yellow - Warning only)
            // Legacy: Runs independently, regardless of day check result
            // Calculate lesson end time (legacy: adds duration and subtracts 1 second)
            const parts = draftLesson.duration.split(':');
            const hours = parseInt(parts[0], 10) || 0;
            const minutes = parseInt(parts[1], 10) || 0;
            const seconds = parseInt(parts[2], 10) || 0;
            const durationInSeconds = hours * 3600 + minutes * 60 + seconds;
            const lessonDate = new Date(draftLesson.date);
            const lessonEndDate = new Date(
              lessonDate.getTime() + durationInSeconds * 1000 - 1000, // ✅ Subtract 1 second (legacy)
            );

            // Extract UTC time components to match MySQL TIME() function output
            const startHours = String(lessonDate.getUTCHours()).padStart(2, '0');
            const startMinutes = String(lessonDate.getUTCMinutes()).padStart(2, '0');
            const startSeconds = String(lessonDate.getUTCSeconds()).padStart(2, '0');
            const lessonStartTime = `${startHours}:${startMinutes}:${startSeconds}`;

            const endHours = String(lessonEndDate.getUTCHours()).padStart(2, '0');
            const endMinutes = String(lessonEndDate.getUTCMinutes()).padStart(2, '0');
            const endSeconds = String(lessonEndDate.getUTCSeconds()).padStart(2, '0');
            const lessonEndTime = `${endHours}:${endMinutes}:${endSeconds}`;

            const isNotAvailableAtTime =
              await this.repository.checkTeacherAvailableAtTime(
                draftLesson.teacherId,
                draftLesson.date,
                lessonStartTime,
                lessonEndTime,
                locationId,
              );
            if (isNotAvailableAtTime) {
              errorMessages.push('Warning: Teacher Unscheduled');
            }
          }

          // Store conflicts (deduplicate messages so same warning is not shown twice)
          if (errorMessages.length > 0) {
            const uniqueMessages = [...new Set(errorMessages)];
            conflicts[draftLesson.id] = uniqueMessages;
            const firstMessage = uniqueMessages[0];
            if (firstMessage !== 'Warning: Teacher Unscheduled') {
              conflictedLessonIdsSet.add(draftLesson.id);
            }
          }
        }
      }
    }
    // 5. If teacher selected, create draft lessons
    else if (dto.teacherId) {
      // locationId is already available from line 72 (no need to fetch again)

      // Removed for 100% legacy parity (Legacy does NOT check student overlap). Do not remove this comment.
      // // Batch student IDs for private lessons (one query instead of N per lesson)
      // const privateCourseIds = lessons
      //   .filter(
      //     (l) => l.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM && l.courseId,
      //   )
      //   .map((l) => l.courseId);
      // const studentIdsByCourse =
      //   privateCourseIds.length > 0
      //     ? await this.repository.getPrivateLessonStudentIds([
      //         ...new Set(privateCourseIds),
      //       ])
      //     : new Map<number, number | null>();

      for (const lesson of lessons) {
        const newLesson = await this.repository.createDraftLesson(
          lesson,
          dto.teacherId,
          userId,
        );

        newLessonIds.push(newLesson.id);

        // Validate lesson for conflicts (legacy: ActiveForm::validate with scenario 'substitute-teacher')
        // Legacy: All checks run in order, all errors collected, first message determines if blocking
        // Step 1: Collect all error messages in order (blocking conflicts first, warnings last)
        const errorMessages: string[] = [];

        // Use original lesson's programId (course relation is loaded in original lesson)
        const programId = lesson.course?.programId;
        if (!programId) {
          errorMessages.push('Teacher unqualified');
        } else {
          // Check 1: Teacher Qualification (Red - Blocking)
          // Legacy: teachers($model->course->programId, $locationId) - checks SPECIFIC program
          const isUnqualified = await this.repository.checkTeacherQualification(
            newLesson.teacherId,
            programId, // SPECIFIC program for THIS lesson
            locationId,
          );
          if (isUnqualified) {
            errorMessages.push('Teacher unqualified');
          }

          // Check 2: Teacher Occupied (Red - Blocking)
          // Legacy only excludes the new lesson ID, NOT old lesson IDs
          // The old lesson SHOULD show as a conflict (user can still confirm, which cancels the old lesson)
          const isOccupied = await this.repository.checkTeacherConflict(
            newLesson.teacherId,
            newLesson.date,
            newLesson.duration,
            locationId,
            [newLesson.id], // ✅ Only exclude the new draft lesson
          );
          if (isOccupied) {
            errorMessages.push('Teacher occupied with another lesson');
          }

          // Check 3: Teacher Unscheduled for the day (Yellow - Warning only)
          // Legacy: Runs independently, regardless of other checks
          const isNotScheduledForDay =
            await this.repository.checkTeacherScheduledForDay(
              newLesson.teacherId,
              newLesson.date,
              locationId,
            );
          if (isNotScheduledForDay) {
            errorMessages.push('Warning: Teacher Unscheduled');
          }

          // Check 4: Teacher Not Available at that time (Yellow - Warning only)
          // Legacy: Runs independently, regardless of day check result
          // Calculate lesson end time (legacy: adds duration and subtracts 1 second)
          const parts = newLesson.duration.split(':');
          const hours = parseInt(parts[0], 10) || 0;
          const minutes = parseInt(parts[1], 10) || 0;
          const seconds = parseInt(parts[2], 10) || 0;
          const durationInSeconds = hours * 3600 + minutes * 60 + seconds;
          const lessonDate = new Date(newLesson.date);
          const lessonEndDate = new Date(
            lessonDate.getTime() + durationInSeconds * 1000 - 1000, // ✅ Subtract 1 second (legacy)
          );

          // Extract UTC time components to match MySQL TIME() function output
          const startHours = String(lessonDate.getUTCHours()).padStart(2, '0');
          const startMinutes = String(lessonDate.getUTCMinutes()).padStart(2, '0');
          const startSeconds = String(lessonDate.getUTCSeconds()).padStart(2, '0');
          const lessonStartTime = `${startHours}:${startMinutes}:${startSeconds}`; // HH:MM:SS format (UTC)

          const endHours = String(lessonEndDate.getUTCHours()).padStart(2, '0');
          const endMinutes = String(lessonEndDate.getUTCMinutes()).padStart(2, '0');
          const endSeconds = String(lessonEndDate.getUTCSeconds()).padStart(2, '0');
          const lessonEndTime = `${endHours}:${endMinutes}:${endSeconds}`; // HH:MM:SS format (UTC)

          const isNotAvailableAtTime =
            await this.repository.checkTeacherAvailableAtTime(
              newLesson.teacherId,
              newLesson.date,
              lessonStartTime,
              lessonEndTime,
              locationId,
            );
          if (isNotAvailableAtTime) {
            errorMessages.push('Warning: Teacher Unscheduled');
          }
        }

        // Removed for 100% legacy parity (Legacy does NOT check student overlap). Do not remove this comment.
        // // Student overlap for private lessons
        // if (lesson.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM) {
        //   const studentId = studentIdsByCourse.get(lesson.courseId) ?? null;
        //   if (studentId) {
        //     const hasStudentOverlap =
        //       await this.repository.checkStudentConflict(
        //         studentId,
        //         newLesson.date,
        //         newLesson.duration,
        //         locationId,
        //         [newLesson.id],
        //       );
        //     if (hasStudentOverlap) {
        //       errorMessages.push('Student occupied with another lesson');
        //     }
        //   }
        // }

        // Store all messages (deduplicate so same warning is not shown twice)
        if (errorMessages.length > 0) {
          const uniqueMessages = [...new Set(errorMessages)];
          conflicts[newLesson.id] = uniqueMessages;
          const firstMessage = uniqueMessages[0];
          if (firstMessage !== 'Warning: Teacher Unscheduled') {
            conflictedLessonIdsSet.add(newLesson.id);
          }
        }
      }
    }

    // 6. Get qualified teachers for dropdown (only when needed for response)
    const programIds = [...new Set(lessons.map((l) => l.course.programId))];
    const qualifiedTeachers: User[] = await this.repository.getQualifiedTeachers(
      programIds,
      locationId,
      firstTeacherId,
    );

    // Map qualified teachers to DTO format
    const teachersList = qualifiedTeachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.profile
        ? `${teacher.profile.firstname || ''} ${teacher.profile.lastname || ''}`.trim() || 'Unknown'
        : 'Unknown',
    }));

    // For preview mode (no teacherId), return only qualified teachers in body structure
    if (!dto.teacherId) {
      return {
        body: {
          teachers: teachersList,
        },
      } as SubstituteTeacherLessonResponseDto;
    }

    // Convert Set to Array for response
    // Only include lessons that have blocking conflicts (not just warnings)
    const conflictedLessonIds = Array.from(conflictedLessonIdsSet);

    // Return full data when teacherId is provided (draft creation mode)
    // Get draft lessons (matching newLessonIds) - these are the lessons with new teacher
    const draftLessonsToReturn = newLessonIds.length > 0
      ? await this.repository.getLessonsWithRelations(newLessonIds)
      : [];


      const lessonsToReturn = draftLessonsToReturn.map((lesson) => {
        const enrolments = lesson.course?.enrolments?.filter(
          (e) => !e.isDeleted && e.isConfirmed === 1,
        ) || [];
        const studentNames = enrolments
          .map((e) => e.student && `${e.student.firstName || ''} ${e.student.lastName || ''}`.trim())
          .filter(Boolean);
        const studentName = studentNames.length > 0 ? studentNames.join(', ') : '';
        return {
          id: lesson.id,
          courseId: lesson.courseId,
          teacherId: lesson.teacherId,
          teacherName: lesson.teacher?.profile
            ? `${lesson.teacher.profile.firstname} ${lesson.teacher.profile.lastname}`.trim()
              : 'Unknown',
          programName: lesson.course?.program?.name || '',
          studentName,
          date: formatDateWithTime(new Date(lesson.date)),
          duration: lesson.duration,
          status: lesson.status,
          isConfirmed: lesson.isConfirmed,
        };
      });

     return {
      status: true,
      hasConflicts: conflictedLessonIds.length > 0,
      newLessonIds,
      conflictedLessonIds,
      conflicts,
      teachers: teachersList,
      lessons: lessonsToReturn,
    } as SubstituteTeacherLessonResponseDto;
  }



  async updateDraftLessonDate(lessonId: number, locationId: number, dto: SubstituteLessonDto): Promise<any> {
    try {
    const lesson = await this.lessonRepository.findLessonById(lessonId, locationId);
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    if (dto.date) {
      try {
        lesson.date = parseDateAsUTC(dto.date);
      } catch {
        throw new BadRequestException('Invalid date');
      }
    }

    if (dto.teacherId !== undefined) {
      const teacherChanged = Number(lesson.teacherId) !== Number(dto.teacherId);
      lesson.teacherId = dto.teacherId;
      // Persist teacher/date first so qualification lookup uses the new teacher.
      await this.repository.updateDraftLessonDate(lesson);
      if (teacherChanged) {
        await this.repository.updateTeacherRate(lesson);
      }
    } else {
      await this.repository.updateDraftLessonDate(lesson);
    }

    return{
      id: lesson.id,
      date: formatDateWithTime(lesson.date),
      teacherId: lesson.teacherId,
    }
    } catch (error) {
      console.error('Error in updateDraftLessonDateAndDuration service:', error);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Confirm substitute teacher changes.
   * Pairing: old lessons ordered by dto.ids, drafts by dto.newLessonIds; pair oldOrdered[i] with draftsOrdered[i].
   */
  async confirmSubstitute(
    dto: ConfirmSubstituteRequestDto,
    userId: number,
    locationSlug: string,
  ): Promise<any> {
    if (dto.newLessonIds.length !== dto.ids.length) {
      throw new BadRequestException(
        'ids and newLessonIds must have the same length (one-to-one pairing)',
      );
    }

    // 1. Get old lessons in request order (dto.ids)
    const oldLessons = await this.repository.getLessonsByIds(dto.ids);

    if (oldLessons.length === 0) {
      throw new NotFoundException('Lessons not found');
    }

    // 2. Load draft lessons by newLessonIds in that order (pair oldLessons[i] with newLessons[i])
    const newLessons = await this.repository.getLessonsWithRelations(
      dto.newLessonIds,
    );

    // Ensure all drafts exist and belong to user / are unconfirmed
    const missing = dto.newLessonIds.filter(
      (id) => !newLessons.find((l) => l.id === id),
    );
    if (missing.length > 0) {
      throw new NotFoundException(
        `Draft lessons not found: ${missing.join(', ')}`,
      );
    }
    for (const lesson of newLessons) {
      if (lesson.isConfirmed) {
        throw new BadRequestException(
          `Lesson ${lesson.id} is already confirmed`,
        );
      }
      if (lesson.createdByUserId !== userId) {
        throw new BadRequestException(
          `Lesson ${lesson.id} was not created by current user`,
        );
      }
    }

    // 3. Run cancel/reschedule in a single transaction (pair by index)
    const confirmedNewLessonIds: number[] = [];
    let lastUsedNewLesson: Lesson | null = null;

    await this.repository.lessonRepository.manager.transaction(
      async (manager) => {
        for (let i = 0; i < newLessons.length; i++) {
          const oldLesson = oldLessons[i];
          const newLesson = newLessons[i];
          if (!oldLesson || !newLesson) continue;

          const lessonType =
            oldLesson.course?.program?.type === Program.TYPE_PRIVATE_PROGRAM
              ? 'Private'
              : oldLesson.course?.program?.type === Program.TYPE_GROUP_PROGRAM
                ? 'Group'
                : 'Unknown';
          console.log(
            `[TeacherSubstitute] ${lessonType} teacher substitute successfully. oldLessonId: ${oldLesson.id}, newLessonId: ${newLesson.id}`,
          );

          await this.repository.cancelAndReschedule(
            oldLesson,
            newLesson,
            userId,
            null,
            null,
            manager,
          );

          confirmedNewLessonIds.push(newLesson.id);
          lastUsedNewLesson = newLesson;

          if (newLesson.course?.program?.type === Program.TYPE_GROUP_PROGRAM) {
            await this.repository.createGroupLessonEmailStatuses(
              newLesson.id,
              newLesson.courseId,
              manager,
            );
          }
        }
      },
    );

    if (!lastUsedNewLesson) {
      throw new BadRequestException('No matching draft lessons found to confirm');
    }

    // 4. Trigger Pusher notification (legacy: Lesson::triggerPusher())
    // TODO: Implement PusherService if needed
    // await this.pusherService.triggerLessonUpdate();

    // 5. Determine redirect URL
    const lastLesson: Lesson = lastUsedNewLesson;
    let redirectUrl: string;

    if (lastLesson.type === Program.TYPE_GROUP_PROGRAM) {
      // TYPE_GROUP_LESSON = 2
      redirectUrl = `/admin/v2/${locationSlug}/group-courses/${lastLesson.courseId}`;
    } else {
      redirectUrl = `/admin/v2/${locationSlug}/private-lessons`;
    }

    // Service returns only URL; controller wraps with standard success/message
    return {
      url: redirectUrl,
    };
  }
}
