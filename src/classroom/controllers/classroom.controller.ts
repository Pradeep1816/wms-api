import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UnauthorizedException, UseGuards, ValidationPipe } from "@nestjs/common";
import { ClassroomService } from "../services/classroom.service";
import { Roles } from "src/auth/decorators/roles.decorator";
import { RolesEnum } from "src/auth/enums/roles.enum";
import { CreateClassroomRequestDto } from "../dto/create-classroom-request.dto";
import { ClassroomRequestDto } from "../dto/classroom-request.dto";
import { ResponseHelper } from "src/shared/helpers/response.helper";
import { AuthGuard } from "src/auth/guards/auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { LocationResolveGuard } from "src/shared/guards/location.guard";
import { LocationId } from "src/shared/decorators/location-id.decorator";
import { UpdateClassroomRequestDto } from "../dto/update-classroom-request.dto";

@UseGuards(AuthGuard, RolesGuard, LocationResolveGuard)
@Controller('admin/v2/:location')
export class ClassroomController {
  constructor(
    private readonly classroomService: ClassroomService,
  ) {}

  @Get('classrooms')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async getClassrooms(
    @LocationId() locationId: number,
    @Query(ValidationPipe) query: ClassroomRequestDto,
  ) {
    try {
      const data = await this.classroomService.getClassrooms(locationId, query);
      return ResponseHelper.success(data, 'Classrooms retrieved successfully');
    } catch (error) {
      console.error('Error fetching classrooms:', error);
      return ResponseHelper.error('INTERNAL_SERVER_ERROR', 'Failed to retrieve classrooms');
    }
  }

  @Post('classrooms')
@Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
async createClassroom(
  @Req() req: any,
   @LocationId() locationId: number,
  @Body(ValidationPipe) createDto: CreateClassroomRequestDto,
){
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

 
  

    const result = await this.classroomService.createClassroom(
      userId,
      locationId,
      createDto,
    );

    return ResponseHelper.success(
      result,
      'Classroom created successfully',
    );

  } catch (error) {
    console.error('Error in createClassroom controller:', error);

    if (error.message?.includes('not found')) {
      return ResponseHelper.error('NOT_FOUND', error.message);
    }

    if (
      error.message?.includes('required') ||
      error.message?.includes('Invalid') ||
      error.message?.includes('already exists')
    ) {
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }

    return ResponseHelper.error(
      'INTERNAL_SERVER_ERROR',
      'Failed to create classroom',
    );
  }
}

@Put('classrooms/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async updateClassroom(
    @Req() req: any,
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateClassroomRequestDto,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

     

      const result = await this.classroomService.updateClassroom(
        id,
        userId,
        updateDto,
      );

      return ResponseHelper.success(
        result,
        'Classroom updated successfully',
      );

    } catch (error) {
      console.error('Error in updateClassroom controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('validation') ||
        error.message?.includes('Invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update classroom',
      );
    }
  }


  @Delete('classrooms/:id')
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER)
  async deleteClassroom(
    @Req() req: any,
    @Param('id') id: number,
    @LocationId() locationId: number,
  ){
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const result = await this.classroomService.deleteClassroom(
        id,
        userId,
        locationId,
      );

      return ResponseHelper.success(
        result,
        'Classroom deleted successfully',
      );

    } catch (error) {
      console.error('Error in deleteClassroom controller:', error);
      return ResponseHelper.error('BAD_REQUEST', error.message);
    }
  }
}

 