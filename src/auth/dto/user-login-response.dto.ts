export interface UserLoginResponseDto {
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
  isModernUserPortalEnabled: boolean;
  redirectUrl: string;
  // legacyRedirectUrl: string;
}
