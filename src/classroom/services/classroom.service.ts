import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClassroomRepository } from '../repositories/classroom.repository';
import { CreateClassroomRequestDto } from '../dto/create-classroom-request.dto';
import { UpdateClassroomRequestDto } from '../dto/update-classroom-request.dto';
import { ClassroomRequestDto } from '../dto/classroom-request.dto';

@Injectable()
export class ClassroomService {
  constructor(
    private readonly classroomRepository: ClassroomRepository,
  ) { }

  async getClassrooms(locationId: number, query: ClassroomRequestDto) {
    const { name, description, page, limit, sort, order } = query;

    const { items, total } = await this.classroomRepository.findClassrooms(
      locationId,
      name,
      description,
      page,
      limit,
      sort,
      order,
    );

    // Transform items to response format
    const body = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
    }));

    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return { body, pagination };
  }

  async createClassroom(
    userId: number,
    locationId: number,
    createDto: CreateClassroomRequestDto,
  ) {
    try {
      const classroom = await this.classroomRepository.createClassroom(
        createDto,
        userId,
        locationId,
      );

      const response: any = {
        id: classroom.id,
        name: classroom.name,
        description: classroom.description,
        createdByUserId: userId,
      };

      return response;

    } catch (error) {
      console.error('Error in createClassroom service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to create classroom');
    }
  }
  async updateClassroom(
    id: number,
    userId: number,
    updateDto: UpdateClassroomRequestDto,
  ) {
    try {
      const updatedClassroom =
        await this.classroomRepository.updateClassroom(
          id,
          userId,
          updateDto,
        );

      return {
        id: updatedClassroom.id,
        name: updatedClassroom.name,
        description: updatedClassroom.description,
        updatedByUserId: userId,
      };

    } catch (error) {
      console.error('Error in updateClassroom service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to update classroom');
    }
  }
  async deleteClassroom(
    id: number,
    userId: number,
    locationId: number,
  ) {
    try {
      const deletedResult =
        await this.classroomRepository.deleteClassroom(
          id,
          userId,
          locationId,
        );

      if (!deletedResult || !deletedResult.id) {
        throw new BadRequestException('Failed to delete classroom');
      }

      return {
        id: deletedResult.id,
        name: deletedResult.name,
        deletedByUserId: userId,

      };

    } catch (error) {
      console.error('Error in deleteClassroom service:', error);

      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new BadRequestException('Failed to delete classroom');
    }
  }
}