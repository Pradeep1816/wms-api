import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TestEmailRepository } from '../repositories/test-email.repository';
import { TestEmailRequestDto } from '../dto/test-email-request.dto';
import { TestEmailListResponseDto } from '../dto/test-email-response.dto';
import { TestEmailTransformationService } from './transformations/test-email-transformation.service';
import { UpdateTestEmailRequestDto } from '../dto/update-test-email-request.dto';
import { UpdateTestEmailResponseDto } from '../dto/update-test-email-response.dto';
import { plainToInstance } from 'class-transformer';
import { formatDate, getCurrentESTDate } from 'src/utils/date-utils';

@Injectable()
export class TestEmailService {
  constructor(
    private readonly testEmailRepo: TestEmailRepository,
    private readonly transformService: TestEmailTransformationService,
  ) {}

  async getTestEmails(
    query: TestEmailRequestDto,
  ): Promise<TestEmailListResponseDto> {
    const { page, limit } = query;
    const { items, total } = await this.testEmailRepo.findAll(
      page,
      limit,
    );

    const body = this.transformService.transformRows(items);
    const pagination = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };

    return {
      body,
      pagination,
    };
  }

  async updateTestEmail(
    id: number,
    updateDto: UpdateTestEmailRequestDto,
    userId: number,
  ): Promise<UpdateTestEmailResponseDto> {
    try {
      const testEmail = await this.testEmailRepo.findById(id);

      if (!testEmail) {
        throw new NotFoundException(`Test email with ID ${id} not found`);
      }

      const updatedTestEmail = await this.testEmailRepo.update(id, {
        email: updateDto.email,
        updatedOn: getCurrentESTDate(),
        updatedByUserId: userId,
      });

      if (!updatedTestEmail) {
        throw new BadRequestException('Failed to update test email');
      }

      const response = plainToInstance(
        UpdateTestEmailResponseDto,
        updatedTestEmail,
        { excludeExtraneousValues: true },
      );

      response.updatedOn = formatDate(updatedTestEmail.updatedOn);

      return response;
    } catch (error) {
      console.error('Error in updateTestEmail service:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to update test email');
    }
  }
}
