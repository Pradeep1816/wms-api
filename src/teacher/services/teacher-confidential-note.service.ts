import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RbacAuthAssignment } from '../../auth/entities/rbac-auth-assignment.entity';
import { User } from '../../user/entities/user.entity';
import { UserLocation } from '../../user/entities/user-location.entity';
import { CreateTeacherConfidentialNoteDto } from '../dto/teacher-confidential-note.dto';
import { TeacherConfidentialNote } from '../entities/teacher-confidential-note.entity';
import { TeacherConfidentialNoteRepository } from '../repositories/teacher-confidential-note.repository';

export interface TeacherConfidentialNoteResponseDto {
  id: number;
  content: string;
  createdByUser: string;
  createdOn: string | null;
}

@Injectable()
export class TeacherConfidentialNoteService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserLocation)
    private readonly userLocationRepository: Repository<UserLocation>,
    @InjectRepository(RbacAuthAssignment)
    private readonly assignmentRepository: Repository<RbacAuthAssignment>,
    private readonly confidentialNoteRepository: TeacherConfidentialNoteRepository,
  ) {}

  async getNotes(
    locationId: number,
    teacherId: number,
  ): Promise<{ body: TeacherConfidentialNoteResponseDto[] }> {
    await this.assertTeacherInLocation(locationId, teacherId);

    const notes = await this.confidentialNoteRepository.findByTeacher(
      locationId,
      teacherId,
    );

    return {
      body: notes.map((note) => this.toResponse(note)),
    };
  }

  async createNote(
    locationId: number,
    teacherId: number,
    createdByUserId: number,
    dto: CreateTeacherConfidentialNoteDto,
  ): Promise<{ body: TeacherConfidentialNoteResponseDto[] }> {
    await this.assertTeacherInLocation(locationId, teacherId);

    await this.confidentialNoteRepository.createNote({
      locationId,
      teacherId,
      content: dto.content,
      createdByUserId,
    });

    return this.getNotes(locationId, teacherId);
  }

  private async assertTeacherInLocation(
    locationId: number,
    teacherId: number,
  ): Promise<void> {
    const [user, userLocation, teacherRole] = await Promise.all([
      this.userRepository.findOne({
        where: {
          id: teacherId,
          isDeleted: false,
          status: User.STATUS_ACTIVE,
        },
      }),
      this.userLocationRepository.findOne({
        where: {
          userId: teacherId,
          locationId,
        },
      }),
      this.assignmentRepository.findOne({
        where: {
          user_id: teacherId.toString(),
          item_name: 'teacher',
        },
      }),
    ]);

    if (!user || !userLocation || !teacherRole) {
      throw new NotFoundException('Teacher not found for this location');
    }
  }

  private toResponse(
    note: TeacherConfidentialNote,
  ): TeacherConfidentialNoteResponseDto {
    const createdByUser = note.createdByUser?.profile
      ? `${note.createdByUser.profile.firstname || ''} ${
          note.createdByUser.profile.lastname || ''
        }`.trim()
      : 'Unknown User';

    return {
      id: note.id,
      content: note.content,
      createdByUser,
      createdOn: note.createdOn ? note.createdOn.toISOString() : null,
    };
  }
}
