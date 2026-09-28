import { IsOptional, IsNumber, Min, IsNotEmpty, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { QualificationTypeEnum } from '../enums/qualification-type.enum';
import { BadRequestException } from '@nestjs/common';

export class TeacherQualificationRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsNotEmpty()
  @Transform(({ value }) => {
    // Qualification type validation
    const type = String(value).trim().toUpperCase();
    if (type in QualificationTypeEnum) {
      return QualificationTypeEnum[type as keyof typeof QualificationTypeEnum];
    } else {
      throw new BadRequestException('type must be one of: private, group');
    }
  })
  // @IsEnum(QualificationTypeEnum, {
  //   message: `type must be one of: ${Object.values(QualificationTypeEnum).join(', ')}`,
  // })
  type: QualificationTypeEnum;
}

