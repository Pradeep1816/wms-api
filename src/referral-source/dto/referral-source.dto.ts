export class ReferralSourceDto {
  id: number;
  name: string;
}

export class ReferralSourceListResponseDto {
  success: boolean;
  message: string;
  data: ReferralSourceDto[];
}
