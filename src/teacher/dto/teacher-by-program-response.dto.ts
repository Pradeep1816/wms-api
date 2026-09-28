import { Expose, Type } from 'class-transformer';

export class TeachersByProgramDto {
  @Expose()
  id: number;

  @Expose()
  name: string;
}

export class TeacherByProgramResponseDto {
  @Expose()
  @Type(() => TeachersByProgramDto)
  body: TeachersByProgramDto[];
}

