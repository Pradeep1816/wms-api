import { Expose } from 'class-transformer';

export class TeacherResourceDto {
  @Expose()
  id: number;

  @Expose()
  title: string;
}

export class TeacherViewResponseDto {
  @Expose()
  resources: TeacherResourceDto[];
}
