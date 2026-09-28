import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from "@nestjs/common";
import { TeacherQualificationRepository } from "../repositories/teacher-qualification.repository";
import { TeacherQualificationTransformationService } from "./transformations/teacher-qualification-transformation.service";
import { TeacherQualificationDto, TeacherQualificationResponseDto } from "../dto/teacher-qualification-response.dto";
import { TeacherQualificationRequestDto } from "../dto/teacher-qualification-request.dto";
import { QualificationTypeEnum } from "../enums/qualification-type.enum";
import { Program } from "../../program/entities/program.entity";
import { CreateTeacherQualificationDto } from "../dto/create-teacher-qualification.dto";
import { UpdateTeacherQualificationDto } from "../dto/update-teacher-qualification.dto";

@Injectable()
export class TeacherQualificationService {
  constructor(
    private readonly teacherQualificationRepository: TeacherQualificationRepository,
    private readonly transformationService: TeacherQualificationTransformationService,
  ) {}

  async getTeacherQualifications(
    teacherId: number,
    query: TeacherQualificationRequestDto,
  ): Promise<TeacherQualificationResponseDto> {
    try {
      const { page = 1, limit = 20, type } = query;
      
      
      const { qualifications, total } = await this.teacherQualificationRepository.getTeacherQualifications(
        teacherId,
        type,
        page,
        limit,
      );
      
      const transformedQualifications = this.transformationService.transformQualificationsToDtos(qualifications);
      
      const totalPages = Math.ceil(total / (query.limit || 20));

      return {
        body: transformedQualifications,
        pagination: {
          page: query.page || 1,
          limit: query.limit || 20,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getTeacherQualifications service:', error);
      throw new InternalServerErrorException('Failed to retrieve teacher qualifications');
    }
  }

  async createTeacherQualifications(
    teacherId: number,
    dto: CreateTeacherQualificationDto,
    qualificationType: QualificationTypeEnum,
    userId: number,
  ): Promise<{ created: number; updated: number }> {
    try {
      // Validate programs exist and match the qualification type
      await this.teacherQualificationRepository.validatePrograms(
        dto.programs,
        qualificationType,
      );

      // Get existing qualifications to determine what's being created vs updated
      const existingQualifications = await this.teacherQualificationRepository
        .getTeacherQualifications(teacherId, qualificationType, 1, 1000);
      
      const existingProgramIds = new Set(
        existingQualifications.qualifications.map(q => q.programId)
      );

      // Create qualifications (repository handles duplicates by updating)
      const qualifications = await this.teacherQualificationRepository.createTeacherQualifications(
        teacherId,
        dto.programs,
        qualificationType,
        dto.rate ?? null,
        userId,
      );

      // Count created vs updated
      const created = qualifications.filter(q => !existingProgramIds.has(q.programId)).length;
      const updated = qualifications.length - created;

      return { created, updated };
    } catch (error) {
      console.error('Error in createTeacherQualifications service:', error);
      
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create teacher qualifications');
    }
  }

  async updateTeacherQualification(
    qualificationId: number,
    dto: UpdateTeacherQualificationDto,
    userId: number,
  ): Promise<{ updated: boolean }> {
    try {
      await this.teacherQualificationRepository.updateTeacherQualification(
        qualificationId,
        dto.rate,
        userId,
      );

      return { updated: true };
    } catch (error) {
      console.error('Error in updateTeacherQualification service:', error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to update teacher qualification');
    }
  }

  async deleteTeacherQualification(
    qualificationId: number,
    userId: number,
  ): Promise<{ deleted: boolean }> {
    try {
      await this.teacherQualificationRepository.deleteTeacherQualification(
        qualificationId,
        userId,
      );

      return { deleted: true };
    } catch (error) {
      console.error('Error in deleteTeacherQualification service:', error);
      
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to delete teacher qualification');
    }
  }
}

