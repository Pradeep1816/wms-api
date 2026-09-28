import { BadRequestException, Injectable } from '@nestjs/common';
import { PrivateLessonEditOnlineTypeRepository } from '../../repositories/private-lesson-actions/private-lesson-edit-online-type.repository';
import { EditOnlineTypeDto } from '../../dto/private-lesson-action-dto/edit-online-type.dto';

export interface EditOnlineTypeResult {
  status: boolean;
  message?: string;
  error?: string;
}

/**
 * Service for editing online type of private lessons (bulk from private lesson listing).
 */
@Injectable()
export class PrivateLessonEditOnlineTypeService {
  constructor(
    private readonly privateLessonEditOnlineTypeRepository: PrivateLessonEditOnlineTypeRepository,
  ) {}

  async editOnlineType(
    locationId: number,
    dto: EditOnlineTypeDto,
    userId: number,
  ): Promise<any> {
    const { lessonIds, online } = dto;

    if (!lessonIds?.length) {
      throw new BadRequestException('No lessons selected.');
    }


    const lessons =
      await this.privateLessonEditOnlineTypeRepository.findLessons(
        lessonIds,
        locationId,
      );


    if (lessons.length === 0) {
      throw new BadRequestException('Lessons not found.');
    }

    if (lessons.length !== lessonIds.length) {
      throw new BadRequestException('One or more lessons not found.');
    }

    await this.privateLessonEditOnlineTypeRepository.updateOnlineType(
      lessonIds,
      online,
      userId,
    );

    const message =
    online === 1
    ? 'Private Lesson Edited To Make Online Class Sucessfully'
    : 'Private Lesson Edited To Make In Class Sucessfully'

    return { message };
  }
}
