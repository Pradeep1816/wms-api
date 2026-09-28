export interface AdminLoginResponseDto {
  token: string;
  accessToken: string;
  location: string;
  id: number;
  user: {
    id: number;
    role: string;
    roles: string[];
    email: string;
  };
  redirectUrl: string;
}

