import { Controller, Get, Delete, Put, Post, Param, Query, Body, Req, UnauthorizedException,ValidationPipe, UseGuards } from '@nestjs/common';
import { ProgramService } from './program.service';
import { ProgramListDto, UpdateProgramDto, CreateProgramDto } from './dto/program.dto';
import { ResponseHelper } from '../shared/helpers/response.helper';
import { ProgramListRequestDto } from './dto/program-list-request.dto';
import { Program } from './entities/program.entity';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('admin/v2/programs')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  /**
   * Get all active programs (id and name only)
   * GET /admin/v2/programs/list
   * Query params:
   * - type: 'private' | 'group' (optional) - filter by program type
   * - studentId: number (optional) - filter by student enrolment
   */
  @Get('list')
  async findAll(
    @Query('type') type?: 'private' | 'group',
    @Query('studentId') studentId?: string,
  ) {
    try {
      let studentIdNumber: number | undefined = undefined;
      if (studentId) {
        const parsed = parseInt(studentId, 10);
        if (isNaN(parsed)) {
          return ResponseHelper.errors.BAD_REQUEST('Invalid studentId parameter');
        }
        studentIdNumber = parsed;
      }
      const programs = await this.programService.findAll(type, studentIdNumber);
      return ResponseHelper.success(programs, 'Programs retrieved successfully');
    } catch (error) {
      return ResponseHelper.errors.INTERNAL_ERROR(error.message || 'Failed to retrieve programs');
    }
  }

  /**
   * Delete a program by ID (soft delete)
   * DELETE /admin/v2/programs/:id
   * 
   * Based on SMW-Legacy ProgramController::actionDelete()
   * 
   * Business Logic:
   * - Program can only be deleted if no non-deleted courses are associated
   * - Uses soft delete (sets isDeleted = true)
   * 
   * @param id - Program ID to delete
   * @returns Success response with program ID and redirect URL
   */
  @Delete(':id')
  @UseGuards(AuthGuard)
  async deleteProgram(
    @Req() req: any,
    @Param('id') id: number,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const result = await this.programService.deleteProgram(id, userId);

      return ResponseHelper.success(
        result,
        'Program deleted successfully',
      );
    } catch (error) {
      console.error('Error in deleteProgram controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (
        error.message?.includes('Unable to delete') ||
        error.message?.includes('Invalid')
      ) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to delete program',
      );
    }
  }

  /**
   * Update an existing Program
   * PUT /admin/v2/programs/:id
   * 
   * @param id - Program ID to update
   * @param updateDto - Fields to update (name, rate, status)
   * @returns Success response with updated program
   */
  @Put(':id')
  @UseGuards(AuthGuard)
  async updateProgram(
    @Req() req: any,
    @Param('id') id: number,
    @Body(ValidationPipe) updateDto: UpdateProgramDto,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      const result = await this.programService.updateProgram(
        id,
        userId,
        updateDto,
      );

      return ResponseHelper.success(
        result,
        'Program updated successfully',
      );
    } catch (error) {
      console.error('Error in updateProgram controller:', error);

      if (error.message?.includes('not found')) {
        return ResponseHelper.error('NOT_FOUND', error.message);
      }

      if (error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to update program',
      );
    }
  }

  /**
   * Create a new Program
   * POST /admin/v2/programs/:type
   * @param type - Program type ('private' or 'group')
   * @param createDto - Program data (name, rate)
   * @returns Success response with created program
   */
   @Post(':type')
  @UseGuards(AuthGuard)
  async createProgram(
    @Req() req: any,
    @Param('type') type: string,
    @Body(ValidationPipe) createDto: CreateProgramDto,
  ) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new UnauthorizedException('User not authenticated');
      }

      // Convert type to number (matching legacy: 1 = Private, 2 = Group)
      const programType = parseInt(type, 10);
      
      if (isNaN(programType) || (programType !== Program.TYPE_PRIVATE_PROGRAM && programType !== Program.TYPE_GROUP_PROGRAM)) {
        return ResponseHelper.error('BAD_REQUEST', 'Invalid program type. Use 1 for Private or 2 for Group');
      }

      const result = await this.programService.createProgram(
        createDto,
        programType,
        userId,
      );

      return ResponseHelper.success(
        result,
        'Program created successfully',
      );
    } catch (error) {
      console.error('Error in createProgram controller:', error);

      if (error.message?.includes('Invalid')) {
        return ResponseHelper.error('BAD_REQUEST', error.message);
      }

      return ResponseHelper.error(
        'INTERNAL_SERVER_ERROR',
        'Failed to create program',
      );
    }
  }

   /* Get programs with filtering, sorting, and pagination
   * GET /admin/v2/programs
   * Query params:
   * - type: 'private' | 'group' (required for list view) - filter by program type
   * - name: string (optional) - filter by program name (LIKE search)
   * - rate: string (optional) - filter by rate (LIKE search)
   * - showActive: boolean (optional) - show only active programs
   * - showInActive: boolean (optional) - show only inactive programs  
   * - showAll: boolean (optional) - show all programs (active and inactive)
   * - sort: 'name' | 'rate' (optional) - sort field, default 'name'
   * - order: 'ASC' | 'DESC' (optional) - sort order, default 'ASC'
   * - page: number (optional) - page number, default 1
   * - limit: number (optional) - items per page, default 20
   */
  @Get()
  async getProgramsList(
    @Query(ValidationPipe) query: ProgramListRequestDto,
  ) {
    try {
      const result = await this.programService.getProgramsList(query);
      return ResponseHelper.success(result, 'Programs retrieved successfully');
    } catch (error) {
      console.error('Error in getProgramsList controller:', error);
      return ResponseHelper.errors.INTERNAL_ERROR(
        error.message || 'Failed to retrieve programs',
      );
    }
  }
}
