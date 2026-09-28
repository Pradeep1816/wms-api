import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StudentRepository } from '../repositories/student.repository';
import { CustomerStudentsRequestDto } from '../dto/customer-students-request.dto';
import { CustomerStudentsDataDto, CustomerStudentDto } from '../dto/customer-students-response.dto';
import { formatBirthDate } from '../../utils/date-utils';
import { StudentDetailsResponseDto } from '../dto/student-info-response.dto';
import { StudentInfoTransformationService } from './transformations/student-info-transformation.service';
import { CreateStudentDto } from '../dto/create-student.dto';
import { LogStudentService } from '../../log/services/log-student.service';
import { LogActivityType } from '../../log/enums/log-activity.enum';
import { StudentGender } from '../enums/student-status.enum';

@Injectable()
export class StudentService {
  constructor(
    private readonly studentRepository: StudentRepository,
    private readonly studentInfoTransformationService: StudentInfoTransformationService,
    private readonly logStudentService: LogStudentService,
  ) {}

  async getStudentsByCustomerId(
    locationSlug: string,
    customerId: number,
    query: CustomerStudentsRequestDto,
  ): Promise<CustomerStudentsDataDto> {
    try {
      // Get location and validate it exists
      const location = await this.studentRepository.findLocationBySlug(locationSlug);
      if (!location) {
        throw new NotFoundException(`Location with slug ${locationSlug} not found`);
      }

      // Verify customer exists and get customer info
      const customer = await this.studentRepository.findCustomerByIdAndLocation(customerId, location.id);
      if (!customer) {
        throw new NotFoundException(`Customer with ID ${customerId} not found in location ${locationSlug}`);
      }

      // Get students with pagination
      const { students, total } = await this.studentRepository.findStudentsByCustomerId(
        customerId,
        query.page,
        query.limit,
        query.showActive,
        query.excludeStudentId,
      );

      // Transform students to DTOs
      const studentData: CustomerStudentDto[] = students.map(student => 
        this.transformStudentToDto(student, customer)
      );

      // Calculate pagination
      const { page = 1, limit = 20 } = query;
      const totalPages = Math.ceil(total / limit);

      return {
        body: studentData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('Error in getStudentsByCustomerId service:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve students: ${error.message}`);
    }
  }

  /**
   * Transform student entity to DTO
   */
  private transformStudentToDto(student: any, customer: any): CustomerStudentDto {
    return {
      id: student.id,
      fullName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      birthDate: formatBirthDate(student.birthDate),
      customerName: `${customer.profile?.firstname || ''} ${customer.profile?.lastname || ''}`.trim(),
    };
  }

  /**
   * Get student details by ID
   */
  async getStudentDetailsById(studentId: number, locationId: number, locationSlug: string): Promise<StudentDetailsResponseDto> {
    try {
      const student = await this.studentRepository.findStudentById(studentId, locationId);
      
      if (!student) {
        throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
      }

      const privateLessonDefaults = await this.studentRepository.findFirstPrivateCourseByStudentId(
        studentId,
        locationId,
      );

      const data = this.studentInfoTransformationService.transformStudentDetailsToDto(
        student,
        privateLessonDefaults,
      );
      return {
        body: data,
      };
    } catch (error) {
      console.error('Error in getStudentDetailsById service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve student details: ${error.message}`);
    }
  }

  async validateStudentBelongsToCustomer(
    studentId: number,
    customerId: number,
    locationId: number,
    locationSlug: string,
  ): Promise<void> {
    const student = await this.studentRepository.findStudentById(studentId, locationId);

    if (!student) {
      throw new NotFoundException(`Student with ID ${studentId} not found in location ${locationSlug}`);
    }

    if (Number(student.customerId) !== Number(customerId)) {
      throw new BadRequestException('Selected student does not belong to the linked customer.');
    }
  }

  /**
   * Create a new student
   * @param locationSlug - Location slug
   * @param locationId - Location ID
   * @param createDto - Student creation data
   * @param loggedUserId - User ID who is creating the student
   * @returns Created student with URL
   */
  async createStudent(
    locationSlug: string,
    locationId: number,
    createDto: CreateStudentDto,
    loggedUserId: number,
  ): Promise<{ id: number; url: string }> {
    try {
      // Verify customer exists and belongs to location
      const customer = await this.studentRepository.findCustomerByIdAndLocation(createDto.customerId, locationId);
      if (!customer) {
        throw new NotFoundException(`Customer with ID ${createDto.customerId} not found in location ${locationSlug}`);
      }

      // Map gender: "male" -> "1", "female" -> "2", "not-specified" -> "0"
      let gender: string | undefined = undefined;
      if (createDto.gender === 'male') {
        gender = StudentGender.MALE;
      } else if (createDto.gender === 'female') {
        gender = StudentGender.FEMALE;
      } else {
        // For "not-specified" or undefined, use NOT_SPECIFIED ('0')
        gender = StudentGender.NOT_SPECIFIED;
      }

      // Parse birth date if provided
      let birthDate: Date | undefined;
      if (createDto.birthDate) {
        birthDate = new Date(createDto.birthDate);
      }

      // Create student
      const student = await this.studentRepository.createStudent(
        {
          firstName: createDto.firstName,
          lastName: createDto.lastName,
          customerId: createDto.customerId,
          birthDate,
          gender,
          mediaAndOnlineLessonConsent: createDto.mediaAndOnlineLessonConsent,
        },
        loggedUserId,
      );

      // Create student log
      const studentName = `${student.firstName} ${student.lastName}`;
      this.logStudentService.createStudentLog({
        action: LogActivityType.TYPE_CREATE,
        studentId: student.id,
        studentName,
        loggedUserId,
        locationId,
        locationSlug,
        data: createDto,
      }).then(() => {
        console.log(`Student creation log created successfully for student: ${studentName}`);
      }).catch(error => {
        console.error(`Failed to create student log for student: ${studentName}`, error.message);
      });

      return {
        id: student.id,
        url: `v2/admin/${locationSlug}/student/${student.id}/info`,
      };
    } catch (error) {
      console.error('Error in createStudent service:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create student: ${error.message}`);
    }
  }

}
