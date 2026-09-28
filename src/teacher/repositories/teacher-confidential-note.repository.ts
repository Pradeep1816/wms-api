import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherConfidentialNote } from '../entities/teacher-confidential-note.entity';

@Injectable()
export class TeacherConfidentialNoteRepository {
  constructor(
    @InjectRepository(TeacherConfidentialNote)
    private readonly repository: Repository<TeacherConfidentialNote>,
  ) {}

  findByTeacher(
    locationId: number,
    teacherId: number,
  ): Promise<TeacherConfidentialNote[]> {
    return this.repository.find({
      where: {
        locationId,
        teacherId,
        isDeleted: false,
      },
      relations: ['createdByUser', 'createdByUser.profile'],
      order: {
        createdOn: 'DESC',
        id: 'DESC',
      },
    });
  }

  createNote(params: {
    locationId: number;
    teacherId: number;
    content: string;
    createdByUserId: number;
  }): Promise<TeacherConfidentialNote> {
    const now = new Date();
    const note = this.repository.create({
      ...params,
      isDeleted: false,
      createdOn: now,
      updatedOn: now,
    });

    return this.repository.save(note);
  }
}
