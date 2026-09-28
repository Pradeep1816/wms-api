# Authentication & Authorization System

This module provides comprehensive authentication and role-based access control (RBAC) for the SMW API.

## Overview

The system uses Bearer tokens stored in the `access_token` column of the `user` table for authentication, combined with RBAC for authorization.

## Flow

1. **Client sends request** with `Authorization: Bearer <token>` header
2. **AuthGuard** extracts and validates the token
3. **AuthService** queries database to find user and their roles
4. **RolesGuard** checks if user has required roles
5. **Request proceeds** with user info attached to `req.user`

## Components

### Entities

#### User Entity
- Maps to existing `user` table
- Contains `access_token` field for authentication
- Related to RBAC assignments

#### RBAC Entities
- `RbacAuthItem`: Stores roles and permissions
- `RbacAuthAssignment`: Links users to roles

### Services

#### AuthService
- `validateToken(token)`: Validates access token and returns user with roles
- `getUserRoles(userId)`: Gets all roles for a user
- `hasRole(userId, role)`: Checks if user has specific role
- `hasAnyRole(userId, roles)`: Checks if user has any of the specified roles

### Guards

#### AuthGuard
- Validates Bearer tokens
- Attaches user info to request object
- Throws `UnauthorizedException` for invalid tokens

#### RolesGuard
- Checks user roles against required roles
- Uses `@Roles()` decorator metadata
- Throws `ForbiddenException` for insufficient permissions

### Decorators

#### @Roles(...roles)
```typescript
@Roles('administrator', 'owner')
@Get()
async getData() { ... }
```

#### @CurrentUser()
```typescript
@Get()
async getData(@CurrentUser() user: AuthenticatedUser) {
  console.log(user.id, user.username, user.roles);
}
```

## Available Roles

The system uses a `RolesEnum` enum for type-safe role management:

```typescript
export enum RolesEnum {
  ADMINISTRATOR = 'administrator',
  BACKEND_USER = 'backend_user', // Group for ADMINISTRATOR, OWNER, STAFFMEMBER
  BOT = 'bot',
  CUSTOMER = 'customer',
  GUEST = 'guest',
  OWNER = 'owner',
  STAFFMEMBER = 'staffmember',
  TEACHER = 'teacher',
}
```

### Role Descriptions

- `administrator`: Full system access
- `backend_user`: Group role for administrator, owner, and staffmember (most common backend access)
- `owner`: Business owner access
- `staffmember`: Staff member access
- `teacher`: Teacher access
- `customer`: Customer access
- `bot`: Bot/system access
- `guest`: Guest access

## Role Groups

The system supports role groups to simplify common access patterns:

### BACKEND_USER Group
- **Purpose**: Most common backend access pattern
- **Includes**: `administrator`, `owner`, `staffmember`
- **Usage**: Use `RolesEnum.BACKEND_USER` instead of listing all three roles
- **Example**: `@Roles(RolesEnum.BACKEND_USER)` instead of `@Roles(RolesEnum.ADMINISTRATOR, RolesEnum.OWNER, RolesEnum.STAFFMEMBER)`

### Benefits
- **Cleaner Code**: Reduces repetition in role declarations
- **Easier Maintenance**: Change group membership in one place
- **Better Readability**: Clear intent with group names
- **Flexible**: Can still use individual roles when needed

## Usage Examples

### Controller with Authentication
```typescript
import { RolesEnum } from '../auth/enums/roles.enum';

@Controller('admin/v2/:location/user')
@UseGuards(AuthGuard, RolesGuard)
export class UserController {
  @Get()
  @Roles(RolesEnum.BACKEND_USER)
  async getUser(@CurrentUser() user: AuthenticatedUser) {
    // Only administrators, owners, and staff can access (using group role)
    return this.userService.getUser(user.id);
  }
}
```

### Public Endpoint (No Auth)
```typescript
@Controller('public')
export class PublicController {
  @Get()
  async getPublicData() {
    // No guards = public access
    return { message: 'Public data' };
  }
}
```

### Admin Only Endpoint
```typescript
import { RolesEnum } from '../auth/enums/roles.enum';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
export class AdminController {
  @Get()
  @Roles(RolesEnum.ADMINISTRATOR)
  async getAdminData() {
    // Only administrators can access
    return { message: 'Admin data' };
  }
}
```

### Owner Only Endpoint
```typescript
import { RolesEnum } from '../auth/enums/roles.enum';

@Controller('owner')
@UseGuards(AuthGuard, RolesGuard)
export class OwnerController {
  @Get()
  @Roles(RolesEnum.OWNER)
  async getOwnerData() {
    // Only owners can access
    return { message: 'Owner data' };
  }
}
```

### Mixed Role Access
```typescript
import { RolesEnum } from '../auth/enums/roles.enum';

@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  @Get()
  @Roles(RolesEnum.ADMINISTRATOR, RolesEnum.TEACHER)
  async getReports() {
    // Both administrators and teachers can access
    return { message: 'Reports data' };
  }
}
```

## Request Format

### Headers
```
Authorization: Bearer ZAuOsCpt_1-cn5wvx9f_d7SqX-_E-BuzCO-tA0UV
Content-Type: application/json
```

### Response Format

#### Success
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

#### Authentication Error
```json
{
  "success": false,
  "errorCode": "UNAUTHORIZED",
  "message": "Invalid or expired token"
}
```

#### Authorization Error
```json
{
  "success": false,
  "errorCode": "FORBIDDEN",
  "message": "Access denied. Required roles: administrator"
}
```

## Database Setup

### Required Tables
1. `user` - Already exists
2. `rbac_auth_item` - Stores roles and permissions
3. `rbac_auth_assignment` - Links users to roles
4. `rbac_auth_rule` - Stores RBAC rules (optional, for advanced permissions)

### Database Schema

#### **rbac_auth_item Table**
```sql
CREATE TABLE `rbac_auth_item` (
  `name` varchar(64) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `type` int NOT NULL,
  `isLocationSpecific` int NOT NULL DEFAULT '0',
  `description` text CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci,
  `rule_name` varchar(64) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci DEFAULT NULL,
  `data` text CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci,
  `created_at` int DEFAULT NULL,
  `updated_at` int DEFAULT NULL,
  PRIMARY KEY (`name`),
  KEY `rule_name` (`rule_name`),
  KEY `idx-auth_item-type` (`type`),
  CONSTRAINT `rbac_auth_item_ibfk_1` FOREIGN KEY (`rule_name`) REFERENCES `rbac_auth_rule` (`name`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
```

#### **rbac_auth_rule Table**
```sql
CREATE TABLE `rbac_auth_rule` (
  `name` varchar(64) CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci NOT NULL,
  `data` text CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci,
  `created_at` int DEFAULT NULL,
  `updated_at` int DEFAULT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci
```

### Sample Data
```sql
-- Insert roles
INSERT INTO rbac_auth_item (name, type, isLocationSpecific, description, created_at) VALUES
('administrator', 1, 0, 'System Administrator', UNIX_TIMESTAMP()),
('owner', 1, 1, 'Business Owner', UNIX_TIMESTAMP()),
('staffmember', 1, 1, 'Staff Member', UNIX_TIMESTAMP()),
('teacher', 1, 1, 'Teacher', UNIX_TIMESTAMP()),
('customer', 1, 0, 'Customer', UNIX_TIMESTAMP()),
('bot', 1, 0, 'Bot/System', UNIX_TIMESTAMP()),
('guest', 1, 0, 'Guest User', UNIX_TIMESTAMP());

-- Assign role to user
INSERT INTO rbac_auth_assignment (item_name, user_id, created_at) VALUES
('administrator', '1', UNIX_TIMESTAMP());
```

## Security Features

- **Token Validation**: Validates tokens against database
- **Role-based Access**: Granular permission control
- **Sensitive Data Protection**: Excludes sensitive fields from responses
- **Error Handling**: Proper HTTP status codes and error messages
- **Request Context**: User info available in all protected endpoints

## Testing

### Test with Valid Token
```bash
curl -H "Authorization: Bearer ZAuOsCpt_1-cn5wvx9f_d7SqX-_E-BuzCO-tA0UV" \
     http://localhost:3000/admin/v2/location1/user?id=123
```

### Test with Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token" \
     http://localhost:3000/admin/v2/location1/user?id=123
```

### Test without Token
```bash
curl http://localhost:3000/admin/v2/location1/user?id=123
```

## Migration from PHP/Yii2

The system is designed to work with existing tokens from your PHP application:

1. **Same Token Format**: Uses existing `access_token` values
2. **Same Database**: Works with existing `user` table
3. **RBAC Compatible**: Uses same RBAC structure as Yii2
4. **Gradual Migration**: Can be implemented alongside existing system

## Best Practices

1. **Always use guards** on protected endpoints
2. **Specify required roles** explicitly
3. **Handle errors gracefully** in controllers
4. **Log authentication events** for security monitoring
5. **Use HTTPS** in production for token security
6. **Implement token expiration** if needed
7. **Regular security audits** of role assignments
