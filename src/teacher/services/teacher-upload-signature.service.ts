import { Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '../../user/entities/user-profile.entity';
import { UpdateTeacherSignatureDto } from '../dto/update-teacher-signature.dto';
import { TeacherUploadSignatureRepository } from '../repositories/teacher-upload-signature.repository';

@Injectable()
export class TeacherUploadSignatureService {
  constructor(
    private readonly teacherUploadSignatureRepository: TeacherUploadSignatureRepository,
  ) {}

  async updateTeacherSignature(
    locationId: number,
    teacherId: number,
    dto: UpdateTeacherSignatureDto,
  ) {
    const profile = await this.getTeacherProfile(
      locationId,
      teacherId,
    );

    profile.signatureDataUrl = dto.signatureDataUrl ?? null;

    const updatedProfile =
      await this.teacherUploadSignatureRepository.saveProfile(profile);

    return {
      teacherId,
      signatureDataUrl: updatedProfile.signatureDataUrl,
    };
  }

  async getTeacherSignature(locationId: number, teacherId: number) {
    const profile = await this.getTeacherProfile(
      locationId,
      teacherId,
    );

    return {
      signatureDataUrl: profile.signatureDataUrl,
    };
  }

  private async getTeacherProfile(
    locationId: number,
    teacherId: number,
  ): Promise<UserProfile> {
    const teacher = await this.teacherUploadSignatureRepository.findTeacherWithProfile(
      locationId,
      teacherId,
    );

    if (!teacher) {
      throw new NotFoundException(
        `Teacher with ID ${teacherId} not found in location ${locationId}`,
      );
    }

    if (!teacher.profile) {
      throw new NotFoundException(
        `User profile for teacher ID ${teacherId} not found`,
      );
    }

    return teacher.profile;
  }
}
