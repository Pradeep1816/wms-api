import { Student } from '../entities/student.entity';
import { StudentGender, StudentStatus } from '../enums/student-status.enum';

/**
 * Calculate age from birth date
 * @param birthDate - The birth date (Date object or null)
 * @returns Age string in format "Xyrs old" or empty string if invalid
 */
export function calculateAge(birthDate: Date | null): string {
  if (!birthDate) {
    return '';
  }

  try {
    const today = new Date();
    const birth = new Date(birthDate);
    
    let years = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      years--;
    }

    return `${years}yrs old`;
  } catch (error) {
    return '';
  }
}

/**
 * Get gender value (numeric representation)
 * @param gender - Gender string (e.g., "Male", "Female", "M", "F")
 * @returns Numeric value: 1 for Male, 2 for Female, 0 for unknown/other
 */
export function getGenderName(gender: string): string {
  console.log(gender);
  switch (gender) {
    case StudentGender.MALE:
      return 'Male';
    case StudentGender.FEMALE:
      return 'Female';
    default:
      return 'Not specified';
  }
};

/**
 * Format student status number to string
 * @param status - Student status number (1 = Active, 2 = Inactive, 3 = Draft)
 * @returns Human-readable status string
 */
export function formatStudentStatus(status: number): string {
  switch (status) {
    case StudentStatus.ACTIVE:
      return 'Active';
    case StudentStatus.INACTIVE:
      return 'Inactive';
    case StudentStatus.DRAFT:
      return 'Draft';
    default:
      return 'Unknown';
  }
}
