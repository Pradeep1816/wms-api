import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Classroom } from "../entities/classroom.entity";
import { CreateClassroomRequestDto } from "../dto/create-classroom-request.dto";
import { QueryRunner, Repository } from "typeorm";
import { UpdateClassroomRequestDto } from "../dto/update-classroom-request.dto";
import { getCurrentESTDate } from "src/utils/date-utils";

@Injectable()
export class ClassroomRepository {
  constructor(
    @InjectRepository(Classroom)
    private readonly classroomRepository: Repository<Classroom>,
  ) {}


async createClassroom(
  createDto: CreateClassroomRequestDto,
  userId: number,
  locationId: number,
): Promise<any> {

  const queryRunner =
    this.classroomRepository.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { name, description } = createDto;

    const insertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into('classroom')
      .values({
        name,
        description,
        locationId,
        createdOn: getCurrentESTDate(),
        updatedOn: getCurrentESTDate(),
        createdByUserId: userId,
        updatedByUserId: userId,
        isDeleted: false,
      })
      .execute();

    const newId = insertResult.identifiers[0].id;

    const created = await queryRunner.manager.findOne('classroom', {
      where: { id: newId },
    });

    await queryRunner.commitTransaction();
    return created;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

private async getExistingClassroom(
  id: number,
  queryRunner: QueryRunner,
) {
  return await queryRunner.manager
    .createQueryBuilder()
    .select('classroom')
    .from(Classroom, 'classroom')
    .where('classroom.id = :id', { id })
    .andWhere('classroom.isDeleted = false')
    .getOne();
}

async getClassroomByIdAndLocation(
  id: number,
  locationId: number,
): Promise<Classroom | null> {
  return this.classroomRepository
    .createQueryBuilder('classroom')
    .where('classroom.id = :id', { id })
    .andWhere('classroom.locationId = :locationId', { locationId })
    .andWhere('classroom.isDeleted = false')
    .getOne();
}

// Update Classroom
async updateClassroom(
  id: number,
  userId: number,
  updateDto: UpdateClassroomRequestDto,
) {

  const queryRunner =
    this.classroomRepository.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingClassroom = await this.getExistingClassroom(
      id,
    
      queryRunner,
    );

    if (!existingClassroom) {
      throw new NotFoundException('Classroom not found');
    }

    const updateData: any = {};

    if (updateDto.name) updateData.name = updateDto.name;
    if (updateDto.description) updateData.description = updateDto.description;

    updateData.updatedOn = getCurrentESTDate();
    updateData.updatedByUserId = userId;

    await queryRunner.manager
      .createQueryBuilder()
      .update(Classroom)
      .set(updateData)
      .where('id = :id', { id })
      .execute();

    const updatedClassroom = await queryRunner.manager.findOne(Classroom, {
      where: { id },
    });

    if (!updatedClassroom) {
      throw new Error('Failed to fetch updated classroom');
    }

    await queryRunner.commitTransaction();
    return updatedClassroom;

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

// Delete Classroom
async deleteClassroom(
  id: number,
  userId: number,
  locationId: number,
): Promise<any> {

  const queryRunner =
    this.classroomRepository.manager.connection.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const existingClassroom = await this.getExistingClassroom(
      id,
      queryRunner,
    );

    if (!existingClassroom) {
      throw new NotFoundException('Classroom not found');
    }

    // Check for associated lessons
    const associatedLesson = await queryRunner.manager
      .createQueryBuilder()
      .select('lesson')
      .from('lesson', 'lesson')
      .where('lesson.classroomId = :id', { id })
      .andWhere('lesson.isDeleted = false')
      .getOne();

    // Check for teacher room associations (legacy: TeacherRoom with teacherAvailability for current location)
    const associatedTeacherRoom = await queryRunner.manager
      .createQueryBuilder()
      .select('teacherRoom.id')
      .from('teacher_room', 'teacherRoom')
      .innerJoin(
        'teacher_availability_day',
        'ta',
        'ta.id = teacherRoom.teacherAvailabilityId',
      )
      .innerJoin('user_location', 'ul', 'ul.id = ta.teacher_location_id')
      .where('teacherRoom.classroomId = :id', { id })
      .andWhere('ta.isDeleted = false')
      .andWhere('ul.location_id = :locationId', { locationId })
      .getOne();

    if (associatedLesson || associatedTeacherRoom) {
      throw new BadRequestException(
        "Lessons or teacher availability associated with this classroom so it can't be deleted"
      );
    }

    const deletedOn = getCurrentESTDate();

    await queryRunner.manager
      .createQueryBuilder()
      .update(Classroom)
      .set({
        isDeleted: true,
        updatedOn: deletedOn,
        updatedByUserId: userId,
      })
      .where('id = :id', { id })
      .execute();

    await queryRunner.commitTransaction();

    return {
      id: id,
      name: existingClassroom.name,
      deletedOn: deletedOn,
    };

  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;

  } finally {
    await queryRunner.release();
  }
}

async findClassrooms(
  locationId: number,
  name?: string,
  description?: string,
  page: number = 1,
  limit: number = 20,
  sort: 'name' | 'description' = 'name',
  order: 'ASC' | 'DESC' = 'ASC',
) {
  const sortMapping: Record<string, string> = {
    name: 'classroom.name',
    description: 'classroom.description',
  };

  const query = this.classroomRepository
    .createQueryBuilder('classroom')
    .where('classroom.isDeleted = 0')
    .andWhere('classroom.locationId = :locationId', { locationId });

  // Apply optional filters
  name && query.andWhere('classroom.name LIKE :name', { name: `%${name}%` });
  description && query.andWhere('classroom.description LIKE :description', { description: `%${description}%` });

  // Apply sorting
  query.orderBy(sortMapping[sort] || 'classroom.name', order);

  // Get total count
  const total = await query.getCount();

  // Apply pagination
  const items = await query
    .skip((page - 1) * limit)
    .take(limit)
    .getMany();

  return { items, total };
}
}