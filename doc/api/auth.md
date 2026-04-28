## Authentication

### Base URL : localhost:3000/api/v1/auth

· POST /auth/register/client
· POST /auth/register/artisan
· POST /auth/login
· POST /auth/logout
· POST /auth/refresh
· POST /auth/verify-email
· POST /auth/forgot-password
· POST /auth/reset-password
· POST /auth/change-password

## Register Client

Creates a new client account.

**Endpoint:** `POST /auth/register/client`

**Request Body:**

```json
{
  "email": "client@example.com",
  "phone": "+2348012345678",
  "password": "securepassword",
  "fullLegalName": "John Doe",
  "nin": "12345678901",
  "streetAddress": "123 Main Street, Lagos",
  "serviceAddress": "123 Main Street, Lagos"
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "client@example.com",
      "phone": "+2348012345678",
      "userType": "client"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Register Artisan

Creates a new artisan account.

**Endpoint:** `POST /auth/register/artisan`

**Request Body:**

```json
{
  "email": "artisan@example.com",
  "phone": "+2348012345678",
  "password": "securepassword",
  "fullLegalName": "Jane Smith",
  "nin": "12345678901",
  "residentialAddress": "456 Artisan Avenue, Lagos",
  "skillCategory": "plumbing",
  "onboardingFee": 5000
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email and pay onboarding fee.",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "email": "artisan@example.com",
      "phone": "+2348012345678",
      "userType": "artisan"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Login

Authenticates a user and returns access tokens.

**Endpoint:** `POST /auth/login`

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "userType": "client",
      "fullName": "John Doe",
      "isVerified": true,
      "verificationStatus": "verified"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Logout

Invalidates the current access token.

**Endpoint:** `POST /auth/logout`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Logged out successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Refresh Token

Obtains a new access token using a refresh token.

**Endpoint:** `POST /auth/refresh`

**Request Body:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Verify Email

Verifies a user's email address with OTP.

**Endpoint:** `POST /auth/verify-email`

**Request Body:**

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Email verified successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Send Verification Code

Sends a verification code to the user's email.

**Endpoint:** `POST /auth/send-verification`

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Verification code sent",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Forgot Password

Sends a password reset link to the user's email.

**Endpoint:** `POST /auth/forgot-password`

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "If an account exists, a reset link will be sent",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Reset Password

Resets the user's password using a reset token.

**Endpoint:** `POST /auth/reset-password`

**Request Body:**

```json
{
  "token": "reset_token_here",
  "newPassword": "newSecurePassword123"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Password reset successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Change Password

Changes the authenticated user's password.

**Endpoint:** `POST /auth/change-password`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newPassword456"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Password changed successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Current User

Retrieves the authenticated user's information.

**Endpoint:** `GET /auth/me`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "User profile retrieved",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "phone": "+2348012345678",
    "userType": "client",
    "isVerified": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Error Responses

### Invalid Credentials

```json
{
  "success": false,
  "error": "AuthenticationError",
  "message": "Invalid credentials",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Account Not Verified

```json
{
  "success": false,
  "error": "AuthorizationError",
  "message": "Account not verified. Please check your email for verification code.",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Account Deactivated

```json
{
  "success": false,
  "error": "AuthorizationError",
  "message": "Account is deactivated. Please contact support.",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```
