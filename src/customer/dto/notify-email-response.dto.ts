export class NotifyEmailTypeDto {
  id: number;
  emailNotifyType: string;
  isChecked: boolean;
}

export class NotifyEmailPreviewResponseDto {
  emailTypes: NotifyEmailTypeDto[];
}

export class NotifyEmailUpdateResponseDto {
  success: boolean;
  message: string;
}

