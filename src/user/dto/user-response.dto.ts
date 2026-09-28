import { Exclude, Expose, Transform } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  id: number;

  @Expose()
  @Transform(({ obj }) => {
    // Create fullName from profile data
    const profile = obj.profile;
    if (profile && (profile.firstname || profile.lastname)) {
      const parts = [profile.firstname, profile.lastname]
        .filter(part => part && part.trim() !== '');
      return parts.join(' ').trim() || obj.username || 'Unknown User';
    }
    return obj.username || 'Unknown User';
  })
  fullName: string;

  @Expose()
  @Transform(({ obj }) => {
    // Get the first role from roleAssignments
    if (obj.roleAssignments && obj.roleAssignments.length > 0) {
      const firstAssignment = obj.roleAssignments[0];
      if (firstAssignment && firstAssignment.item) {
        return firstAssignment.item.name || 'unknown';
      }
    }
    return 'unknown';
  })
  role: string;

  @Expose()
  @Transform(({ obj }) => {
    // Get the first role from roleAssignments and transform to display name
    if (obj.roleAssignments && obj.roleAssignments.length > 0) {
      const firstAssignment = obj.roleAssignments[0];
      if (firstAssignment && firstAssignment.item) {
        const roleName = firstAssignment.item.name;
        switch (roleName) {
          case 'administrator':
            return 'Admin';
          case 'owner':
            return 'Owner';
          case 'staffmember':
            return 'Staff';
          case 'teacher':
            return 'Teacher';
          case 'customer':
            return 'Customer';
          case 'bot':
            return 'Bot';
          case 'guest':
            return 'Guest';
          default:
            return roleName;
        }
      }
    }
    return 'Unknown';
  })
  displayRole: string;

  @Expose()
  @Transform(({ obj }) => {
    // Return primary email address
    return obj.primaryEmail ? obj.primaryEmail.email : null;
  })
  primaryEmail: string;

  @Expose()
  @Transform(({ obj }) => {
    // Return array of other email addresses
    if (obj.emails && obj.emails.length > 0) {
      return obj.emails.map(email => email.email);
    }
    return [];
  })
  emails: string[];

  @Expose()
  @Transform(({ obj }) => {
    // Return user locations based on role and business logic
    if (obj.userLocations && obj.roleAssignments && obj.roleAssignments.length > 0) {
      const firstAssignment = obj.roleAssignments[0];
      if (firstAssignment && firstAssignment.item) {
        const roleName = firstAssignment.item.name;
        // Only include userLocations for staffmember and owner roles
        if (roleName === 'staffmember' || roleName === 'owner') {
          return obj.userLocations;
        }
      }
    }
    return null;
  })
  userLocations: number[] | null;

  // Exclude sensitive fields from API response
  @Exclude()
  username: string;

  @Exclude()
  status: number;

  @Exclude()
  canLogin: boolean;

  @Exclude()
  canMerge: boolean;

  @Exclude()
  isDeleted: boolean;

  @Exclude()
  created_at: number;

  @Exclude()
  updated_at: number;

  @Exclude()
  logged_at: number;

  @Exclude()
  auth_key: string;

  @Exclude()
  access_token: string;

  @Exclude()
  password_hash: string;

  @Exclude()
  pin_hash: string;

  @Exclude()
  oauth_client: string;

  @Exclude()
  oauth_client_user_id: string;

  @Exclude()
  login_token: string;

  @Exclude()
  profile: any;

  @Exclude()
  roleAssignments: any[];

  @Exclude()
  primaryEmailRaw: any;

  @Exclude()
  emailsRaw: any[];
}
