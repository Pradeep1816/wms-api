/**
 * Response shape for user import endpoint.
 * Matches legacy UserImport::import() return for UI compatibility.
 */
export interface UserImportResponseDto {
  successCount: number;
  studentCount: number;
  customerCount: number;
  errors: string[];
  totalRows: number;
}
