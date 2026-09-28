export class BirthdayRowDto {
	studentId: string;
	studentName: string;
	customerId: string;
	customerName: string;
	phoneNumber: string;
	email: string;
	birthDate: string;
}

export class BirthdaysResponseDto {
	body: BirthdayRowDto[];
	meta: { startDate: string; endDate: string; location: string };
	pagination: { page: number; limit: number; total: number; totalPages: number };
}



