export class TeacherListDto {
  id: number;
  name: string;
  businessName?: string | null;
}

export type TeacherListStatusFilter = 'all' | 'active' | 'inactive';
