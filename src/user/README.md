# User Module

This module provides user management functionality for the SMW API.

## API Endpoints

### Get User

**GET** `/admin/v2/{location}/user`

Retrieves the current authenticated user's information.

#### Authentication Required

- Bearer token in Authorization header
- User must have one of the following roles: `administrator`, `owner`, `staffmember`

#### Example Request

```bash
GET /admin/v2/location1/user
Authorization: Bearer ZAuOsCpt_1-cn5wvx9f_d7SqX-_E-BuzCO-tA0UV
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "id": 123,
    "username": "john_doe",
    "status": 2,
    "canLogin": true,
    "canMerge": false,
    "isDeleted": false,
    "created_at": 1640995200,
    "updated_at": 1640995200,
    "logged_at": 1640995200
  },
  "message": "User retrieved successfully"
}
```


## Error Responses

### 404 Not Found

```json
{
  "success": false,
  "errorCode": "NOT_FOUND",
  "message": "User with ID 123 not found"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "errorCode": "UNAUTHORIZED",
  "message": "Access token is required"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "errorCode": "FORBIDDEN",
  "message": "Access denied. Required roles: administrator, owner, staffmember"
}
```

## Security Notes

- **User-Specific Access**: Users can only access their own data (ID from authenticated token)
- **Role-Based Authorization**: Only administrators, owners, and staff members can access this endpoint
- **Sensitive Data Protection**: Sensitive fields (auth_key, access_token, password_hash, pin_hash, oauth_client, oauth_client_user_id, login_token) are excluded from API responses
- **Token Validation**: All requests must include a valid Bearer token
- **Database Security**: Only non-deleted users are returned
- **Error Handling**: All database operations are wrapped in try-catch blocks with proper error handling

## Database Schema

The user entity maps to the `user` table with the following structure:

- `id`: Primary key (auto-increment)
- `username`: User's username (varchar 32)
- `auth_key`: Authentication key (varchar 32)
- `access_token`: Access token (varchar 40)
- `password_hash`: Password hash (varchar 255)
- `pin_hash`: PIN hash (char 128)
- `oauth_client`: OAuth client (varchar 255)
- `oauth_client_user_id`: OAuth client user ID (varchar 255)
- `status`: User status (smallint, default: 2)
- `canLogin`: Can login flag (tinyint 1)
- `canMerge`: Can merge flag (tinyint 1)
- `isDeleted`: Deleted flag (tinyint 1)
- `created_at`: Creation timestamp (int)
- `updated_at`: Update timestamp (int)
- `logged_at`: Last login timestamp (int)
- `login_token`: Login token (varchar 50)
