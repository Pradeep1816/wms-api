import { IsInt, IsNotEmpty, IsPositive } from 'class-validator';

export class MergeStudentDto {
  @IsNotEmpty({ message: 'Source student ID is required' })
  @IsInt({ message: 'Source student ID must be an integer' })
  @IsPositive({ message: 'Source student ID must be a positive number' })
  sourceId: number;
}
