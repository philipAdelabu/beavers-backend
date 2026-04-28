I'll provide all the API documentation markdown files for the BeaverWorks backend.

## Docs/API Directory - Complete Markdown Files

### `docs/api/README.md`

```markdown
# BeaverWorks API Documentation

Welcome to the BeaverWorks API documentation. This API powers the BeaverWorks platform, connecting clients with verified artisans for construction, maintenance, repairs, and technical services.

## Base URL
```

Production: https://api.beaverworks.com/api/v1
Staging: https://staging-api.beaverworks.com/api/v1
Development: http://localhost:3000/api/v1

```

## Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```

Authorization: Bearer <your_access_token>

````

## API Response Format

All responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
````

### Paginated Response

```json
{
  "success": true,
  "message": "Resources retrieved successfully",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## HTTP Status Codes

| Code | Description           |
| ---- | --------------------- |
| 200  | Success               |
| 201  | Created               |
| 204  | No Content            |
| 400  | Bad Request           |
| 401  | Unauthorized          |
| 403  | Forbidden             |
| 404  | Not Found             |
| 409  | Conflict              |
| 422  | Unprocessable Entity  |
| 429  | Too Many Requests     |
| 500  | Internal Server Error |

## API Endpoints

### Authentication

- [POST /auth/register/client](./auth.md#register-client)
- [POST /auth/register/artisan](./auth.md#register-artisan)
- [POST /auth/login](./auth.md#login)
- [POST /auth/logout](./auth.md#logout)
- [POST /auth/refresh](./auth.md#refresh-token)
- [POST /auth/verify-email](./auth.md#verify-email)
- [POST /auth/forgot-password](./auth.md#forgot-password)
- [POST /auth/reset-password](./auth.md#reset-password)

### Clients

- [GET /clients/profile](./clients.md#get-profile)
- [PUT /clients/profile](./clients.md#update-profile)
- [GET /clients/addresses](./clients.md#get-addresses)
- [POST /clients/addresses](./clients.md#add-address)
- [GET /clients/saved-artisans](./clients.md#get-saved-artisans)
- [GET /clients/jobs](./clients.md#get-job-history)

### Artisans

- [GET /artisans/profile](./artisans.md#get-profile)
- [PUT /artisans/profile](./artisans.md#update-profile)
- [POST /artisans/availability](./artisans.md#update-availability)
- [GET /artisans/earnings](./artisans.md#get-earnings)
- [POST /artisans/withdrawals](./artisans.md#request-withdrawal)
- [GET /artisans/ratings](./artisans.md#get-ratings)

### Jobs

- [POST /jobs/create](./jobs.md#create-job)
- [POST /jobs/:jobId/accept](./jobs.md#accept-job)
- [POST /jobs/:jobId/confirm-arrival](./jobs.md#confirm-arrival)
- [POST /jobs/:jobId/start-diagnostics](./jobs.md#start-diagnostics)
- [POST /jobs/:jobId/stop-diagnostics](./jobs.md#stop-diagnostics)
- [POST /jobs/:jobId/start-execution](./jobs.md#start-execution)
- [POST /jobs/:jobId/complete](./jobs.md#complete-job)
- [GET /jobs/:jobId](./jobs.md#get-job-details)

### Payments

- [POST /payments/initialize/:jobId](./payments.md#initialize-payment)
- [GET /payments/methods](./payments.md#get-payment-methods)
- [POST /payments/methods](./payments.md#add-payment-method)
- [GET /payments/history](./payments.md#get-payment-history)
- [POST /payments/dispute/:jobId](./payments.md#create-dispute)

### Location

- [POST /location/update](./locations.md#update-location)
- [GET /location/nearby](./locations.md#get-nearby-artisans)
- [GET /location/artisan/:artisanId](./locations.md#get-artisan-location)
- [POST /location/availability](./locations.md#set-availability)
- [GET /location/eta/:jobId](./locations.md#get-eta)

### Webhooks

- [POST /webhooks/stripe](./webhooks.md#stripe-webhook)
- [POST /webhooks/paystack](./webhooks.md#paystack-webhook)
- [POST /webhooks/flutterwave](./webhooks.md#flutterwave-webhook)

## Rate Limits

| Endpoint Category | Limit        | Window     |
| ----------------- | ------------ | ---------- |
| Authentication    | 5 requests   | 15 minutes |
| Job Creation      | 10 requests  | 1 hour     |
| Location Updates  | 60 requests  | 1 minute   |
| Payment Endpoints | 20 requests  | 1 hour     |
| Admin Endpoints   | 100 requests | 1 minute   |

## WebSocket Events

The API also supports real-time communication via WebSockets:

- Connection URL: `wss://api.beaverworks.com/socket.io`
- Authentication: Include token in connection query: `?token=<your_token>`

### Client Events

- `job:join` - Join a job room
- `job:leave` - Leave a job room
- `location:request` - Request artisan location

### Artisan Events

- `location:update` - Update real-time location
- `artisan:availability` - Set online/offline status
- `job:accept` - Accept a job offer

## Support

For API support, contact:

- Email: api-support@beaverworks.com
- Documentation: https://docs.beaverworks.com
- Status Page: https://status.beaverworks.com

````

### `docs/api/auth.md`

```markdown
# Authentication API

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
````

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

````

### `docs/api/clients.md`

```markdown
# Client API

## Get Profile

Retrieves the authenticated client's profile.

**Endpoint:** `GET /clients/profile`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "full_legal_name": "John Doe",
    "nin": "12345678901",
    "street_address": "123 Main Street, Lagos",
    "service_address": "123 Main Street, Lagos",
    "is_verified": true,
    "verification_status": "verified",
    "email": "client@example.com",
    "phone": "+2348012345678",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
````

## Update Profile

Updates the authenticated client's profile.

**Endpoint:** `PUT /clients/profile`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "fullLegalName": "Johnathan Doe",
  "streetAddress": "456 New Street, Lagos",
  "serviceAddress": "456 New Street, Lagos"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "full_legal_name": "Johnathan Doe",
    "street_address": "456 New Street, Lagos",
    "service_address": "456 New Street, Lagos",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Upload Documents

Uploads verification documents.

**Endpoint:** `POST /clients/upload-documents`

**Headers:** `Authorization: Bearer <access_token>`
**Content-Type:** `multipart/form-data`

**Form Data:**

| Field         | Type | Required | Description         |
| ------------- | ---- | -------- | ------------------- |
| ninPhoto      | File | Yes      | NIN document photo  |
| utilityBill   | File | Yes      | Recent utility bill |
| passportPhoto | File | Yes      | Passport photograph |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Documents uploaded successfully",
  "data": {
    "verification_documents": {
      "ninPhoto": "/uploads/verification-docs/uuid_nin.jpg",
      "utilityBill": "/uploads/verification-docs/uuid_bill.jpg",
      "passportPhoto": "/uploads/profile-photos/uuid_passport.jpg"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Addresses

Retrieves all saved addresses for the client.

**Endpoint:** `GET /clients/addresses`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Addresses retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440100",
      "address": "123 Main Street, Lagos",
      "label": "Home",
      "is_default": true,
      "latitude": 6.5244,
      "longitude": 3.3792,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Add Address

Adds a new service address.

**Endpoint:** `POST /clients/addresses`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "address": "789 Work Address, Lagos",
  "label": "Office",
  "isDefault": false,
  "latitude": 6.5244,
  "longitude": 3.3792
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Address added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440101",
    "address": "789 Work Address, Lagos",
    "label": "Office",
    "is_default": false,
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Update Address

Updates an existing address.

**Endpoint:** `PUT /clients/addresses/:addressId`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "address": "789 Updated Address, Lagos",
  "label": "Office",
  "isDefault": true,
  "latitude": 6.5244,
  "longitude": 3.3792
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Address updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440101",
    "address": "789 Updated Address, Lagos",
    "is_default": true,
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Delete Address

Deletes an address.

**Endpoint:** `DELETE /clients/addresses/:addressId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Address deleted successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Saved Artisans

Retrieves the client's saved/favorite artisans.

**Endpoint:** `GET /clients/saved-artisans`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Saved artisans retrieved successfully",
  "data": [
    {
      "artisan_id": "550e8400-e29b-41d4-a716-446655440200",
      "full_legal_name": "Jane Smith",
      "skill_category": "plumbing",
      "tier_level": 2,
      "star_rating": 4.5,
      "completion_rate": 95,
      "saved_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Save Artisan

Saves an artisan to the client's favorites.

**Endpoint:** `POST /clients/saved-artisans/:artisanId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Artisan saved successfully",
  "data": {
    "client_id": "550e8400-e29b-41d4-a716-446655440000",
    "artisan_id": "550e8400-e29b-41d4-a716-446655440200",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Remove Saved Artisan

Removes an artisan from favorites.

**Endpoint:** `DELETE /clients/saved-artisans/:artisanId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Artisan removed from saved list",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Job History

Retrieves the client's job history with pagination.

**Endpoint:** `GET /clients/jobs`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                            |
| --------- | ------- | -------- | -------------------------------------- |
| status    | string  | No       | Filter by job status                   |
| page      | integer | No       | Page number (default: 1)               |
| limit     | integer | No       | Items per page (default: 10, max: 100) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job history retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "category": "plumbing",
      "description": "Leaking faucet repair",
      "service_type": "repair",
      "job_status": "completed",
      "artisan_name": "Jane Smith",
      "total_amount": 9000,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Statistics

Retrieves client statistics.

**Endpoint:** `GET /clients/statistics`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Statistics retrieved successfully",
  "data": {
    "total_jobs": 15,
    "completed_jobs": 12,
    "cancelled_jobs": 3,
    "total_spent": 125000,
    "average_spent": 8333.33,
    "favorite_categories": [
      { "category": "plumbing", "count": 5 },
      { "category": "electrical", "count": 4 }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Payment Methods

Retrieves saved payment methods.

**Endpoint:** `GET /clients/payment-methods`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment methods retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440400",
      "type": "card",
      "last4": "4242",
      "expiry_month": 12,
      "expiry_year": 2025,
      "is_default": true
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Add Payment Method

Adds a new payment method.

**Endpoint:** `POST /clients/payment-methods`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "paymentMethodId": "pm_card_visa",
  "setAsDefault": true
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Payment method added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440401",
    "type": "card",
    "last4": "4242",
    "is_default": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Delete Payment Method

Deletes a payment method.

**Endpoint:** `DELETE /clients/payment-methods/:methodId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment method deleted successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Set Default Payment Method

Sets a payment method as default.

**Endpoint:** `PUT /clients/payment-methods/:methodId/default`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Default payment method updated",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440400",
    "is_default": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Notifications

Retrieves client notifications.

**Endpoint:** `GET /clients/notifications`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| isRead    | boolean | No       | Filter by read status        |
| type      | string  | No       | Filter by notification type  |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 20) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Notifications retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440500",
      "type": "job_accepted",
      "title": "Job Accepted",
      "message": "An artisan has accepted your job",
      "is_read": false,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Mark Notification as Read

Marks a specific notification as read.

**Endpoint:** `PUT /clients/notifications/:notificationId/read`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440500",
    "is_read": true,
    "read_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Mark All Notifications as Read

Marks all notifications as read.

**Endpoint:** `PUT /clients/notifications/read-all`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "All notifications marked as read",
  "data": {
    "count": 5
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Unread Count

Gets the number of unread notifications.

**Endpoint:** `GET /clients/notifications/unread/count`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Unread count retrieved successfully",
  "data": {
    "count": 3
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

````

### `docs/api/artisans.md`

```markdown
# Artisan API

## Get Profile

Retrieves the authenticated artisan's profile.

**Endpoint:** `GET /artisans/profile`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440200",
    "user_id": "550e8400-e29b-41d4-a716-446655440201",
    "full_legal_name": "Jane Smith",
    "nin": "12345678901",
    "residential_address": "456 Artisan Avenue, Lagos",
    "skill_category": "plumbing",
    "sub_categories": ["pipe fitting", "water heater"],
    "tier_level": 2,
    "star_rating": 4.5,
    "total_ratings": 28,
    "completion_rate": 95,
    "trust_score": 92,
    "onboarding_fee_paid": true,
    "monthly_fee_status": "paid",
    "is_available": true,
    "email": "artisan@example.com",
    "phone": "+2348012345678",
    "is_verified": true,
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
````

## Update Profile

Updates the artisan's profile.

**Endpoint:** `PUT /artisans/profile`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "fullLegalName": "Jane Smith",
  "residentialAddress": "789 New Address, Lagos",
  "skillCategory": "plumbing",
  "subCategories": ["pipe fitting", "water heater", "gas fitting"]
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "full_legal_name": "Jane Smith",
    "residential_address": "789 New Address, Lagos",
    "sub_categories": ["pipe fitting", "water heater", "gas fitting"],
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Update Availability

Updates the artisan's availability status.

**Endpoint:** `POST /artisans/availability`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "isAvailable": true,
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Availability set to true",
  "data": {
    "is_available": true,
    "last_availability_change": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Upload Documents

Uploads verification and certification documents.

**Endpoint:** `POST /artisans/upload-documents`

**Headers:** `Authorization: Bearer <access_token>`
**Content-Type:** `multipart/form-data`

**Form Data:**

| Field          | Type   | Required | Description               |
| -------------- | ------ | -------- | ------------------------- |
| passportPhoto  | File   | Yes      | Passport photograph       |
| ninPhoto       | File   | Yes      | NIN document              |
| certificates   | File[] | No       | Professional certificates |
| tradeTestimony | File[] | No       | Trade testimonies         |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Documents uploaded successfully",
  "data": {
    "documents": {
      "passportPhoto": "/uploads/profile-photos/uuid_passport.jpg",
      "ninPhoto": "/uploads/verification-docs/uuid_nin.jpg",
      "certificates": ["/uploads/certificates/uuid_cert1.pdf"],
      "tradeTestimony": ["/uploads/verification-docs/uuid_testimony.pdf"]
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Earnings

Retrieves the artisan's earnings summary.

**Endpoint:** `GET /artisans/earnings`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| startDate | string | No       | Start date (ISO format) |
| endDate   | string | No       | End date (ISO format)   |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Earnings retrieved successfully",
  "data": {
    "summary": {
      "total_earnings": 1250000,
      "paid_earnings": 1000000,
      "pending_earnings": 250000,
      "total_jobs": 45,
      "completed_jobs": 42,
      "average_earning": 27777.78
    },
    "monthlyBreakdown": [
      {
        "month": "2024-01-01T00:00:00.000Z",
        "earnings": 250000,
        "jobs_completed": 8
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Request Withdrawal

Requests a withdrawal of earnings.

**Endpoint:** `POST /artisans/withdrawals`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "amount": 50000,
  "bankCode": "001",
  "accountNumber": "1234567890",
  "accountName": "Jane Smith"
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Withdrawal request submitted successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440600",
    "amount": 50000,
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Withdrawal History

Retrieves withdrawal history.

**Endpoint:** `GET /artisans/withdrawals`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 20) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Withdrawal history retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440600",
      "amount": 50000,
      "status": "completed",
      "completed_at": "2024-01-02T00:00:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3,
    "totalPages": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Update Bank Account

Updates the artisan's bank account information.

**Endpoint:** `PUT /artisans/bank-account`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "bankCode": "001",
  "accountNumber": "0987654321",
  "accountName": "Jane Smith"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Bank account updated successfully",
  "data": {
    "bank_details": {
      "bankCode": "001",
      "accountNumber": "0987654321",
      "accountName": "Jane Smith"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Performance Metrics

Retrieves artisan performance metrics.

**Endpoint:** `GET /artisans/performance`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Performance metrics retrieved successfully",
  "data": {
    "star_rating": 4.5,
    "total_ratings": 28,
    "completion_rate": 95,
    "trust_score": 92,
    "tier_level": 2,
    "total_completed_jobs": 42,
    "avg_response_time": 120,
    "avg_completion_time": 180,
    "rating_distribution": [
      { "rating": 5, "count": 15 },
      { "rating": 4, "count": 10 },
      { "rating": 3, "count": 3 }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Ratings

Retrieves ratings received by the artisan.

**Endpoint:** `GET /artisans/ratings`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 20) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Ratings retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440700",
      "rating": 5,
      "review": "Excellent work! Very professional.",
      "reviewer_name": "John Doe",
      "categories": {
        "punctuality": 5,
        "quality": 5,
        "communication": 5
      },
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 28,
    "totalPages": 2
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Schedule

Retrieves the artisan's work schedule.

**Endpoint:** `GET /artisans/schedule`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| date      | string | No       | Date to retrieve (YYYY-MM-DD) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Schedule retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440800",
      "day_of_week": 1,
      "start_time": "09:00:00",
      "end_time": "17:00:00",
      "is_available": true
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Set Schedule

Sets the artisan's work schedule.

**Endpoint:** `POST /artisans/schedule`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "dayOfWeek": 1,
  "startTime": "09:00",
  "endTime": "17:00",
  "isAvailable": true
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Schedule set successfully",
  "data": {
    "day_of_week": 1,
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "is_available": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Tools

Retrieves the artisan's tools and equipment.

**Endpoint:** `GET /artisans/tools`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Tools retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440900",
      "name": "Pipe Wrench",
      "quantity": 2,
      "condition": "good",
      "notes": "12-inch adjustable",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Add Tool

Adds a new tool to the artisan's inventory.

**Endpoint:** `POST /artisans/tools`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "name": "Pipe Cutter",
  "quantity": 1,
  "condition": "new",
  "notes": "For cutting copper pipes"
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Tool added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440901",
    "name": "Pipe Cutter",
    "quantity": 1,
    "condition": "new",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Update Tool

Updates an existing tool.

**Endpoint:** `PUT /artisans/tools/:toolId`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "quantity": 2,
  "condition": "good",
  "notes": "Works well"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Tool updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440901",
    "quantity": 2,
    "condition": "good",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Upcoming Jobs

Retrieves upcoming jobs for the artisan.

**Endpoint:** `GET /artisans/upcoming-jobs`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                          |
| --------- | ------- | -------- | ------------------------------------ |
| limit     | integer | No       | Maximum jobs to return (default: 10) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Upcoming jobs retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "category": "plumbing",
      "description": "Leaking faucet repair",
      "service_type": "repair",
      "job_status": "accepted",
      "client_name": "John Doe",
      "client_phone": "+2348012345678",
      "service_address": "123 Main Street, Lagos",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Statistics

Retrieves artisan statistics.

**Endpoint:** `GET /artisans/statistics`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Statistics retrieved successfully",
  "data": {
    "total_jobs": 45,
    "completed_jobs": 42,
    "cancelled_jobs": 3,
    "pending_jobs": 2,
    "total_earnings": 1250000,
    "category_breakdown": [
      { "category": "plumbing", "job_count": 25, "avg_earning": 28000 },
      { "category": "electrical", "job_count": 20, "avg_earning": 27500 }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Tier Details

Retrieves information about artisan tiers.

**Endpoint:** `GET /artisans/tier`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Tier details retrieved successfully",
  "data": {
    "currentTier": 2,
    "requirements": {
      "tier1": {
        "minRating": 0,
        "minJobs": 0,
        "trainingRequired": false
      },
      "tier2": {
        "minRating": 3.5,
        "minJobs": 10,
        "trainingRequired": true
      },
      "tier3": {
        "minRating": 4.5,
        "minJobs": 50,
        "trainingRequired": true
      }
    },
    "nextTierRequirements": {
      "minRating": 4.5,
      "minJobs": 50,
      "trainingRequired": true,
      "currentProgress": {
        "rating": 4.5,
        "jobs": 42
      }
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Training Courses

Retrieves available training courses.

**Endpoint:** `GET /artisans/training-courses`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description          |
| --------- | ------- | -------- | -------------------- |
| tier      | integer | No       | Filter by tier level |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Training courses retrieved successfully",
  "data": {
    "courses": [
      {
        "id": "550e8400-e29b-41d4-a716-446655441000",
        "name": "Advanced Plumbing Techniques",
        "description": "Master advanced plumbing techniques",
        "duration_hours": 40,
        "price": 25000,
        "certification_provided": true
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Enroll in Course

Enrolls the artisan in a training course.

**Endpoint:** `POST /artisans/training-courses/:courseId/enroll`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Enrolled in course successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655441100",
    "course_id": "550e8400-e29b-41d4-a716-446655441000",
    "status": "enrolled",
    "enrolled_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Complete Module

Marks a training module as completed.

**Endpoint:** `PUT /artisans/training-courses/:courseId/module/:moduleIndex/complete`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Module completed successfully",
  "data": {
    "module_index": 1,
    "completed": true,
    "completed_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Course Progress

Retrieves progress for a specific course.

**Endpoint:** `GET /artisans/training-progress/:courseId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Course progress retrieved successfully",
  "data": {
    "enrollment_id": "550e8400-e29b-41d4-a716-446655441100",
    "course_name": "Advanced Plumbing Techniques",
    "total_modules": 5,
    "completed_modules": 3,
    "progress_percentage": 60,
    "module_progress": [
      { "module_index": 1, "completed": true, "completed_at": "2024-01-01T00:00:00.000Z" },
      { "module_index": 2, "completed": true, "completed_at": "2024-01-02T00:00:00.000Z" },
      { "module_index": 3, "completed": true, "completed_at": "2024-01-03T00:00:00.000Z" },
      { "module_index": 4, "completed": false, "completed_at": null },
      { "module_index": 5, "completed": false, "completed_at": null }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Certificate

Retrieves course certificate.

**Endpoint:** `GET /artisans/certificate/:courseId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Certificate retrieved successfully",
  "data": {
    "certificate_number": "CERT-1704067200000-abc123def",
    "course_name": "Advanced Plumbing Techniques",
    "artisan_name": "Jane Smith",
    "issued_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Pay Monthly Fee

Pays the monthly technology fee.

**Endpoint:** `POST /artisans/pay-monthly-fee`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "paymentMethodId": "pm_card_visa"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Monthly fee paid successfully",
  "data": {
    "monthly_fee_status": "paid",
    "last_fee_payment": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Check Monthly Fee Status

Checks the monthly fee payment status.

**Endpoint:** `GET /artisans/monthly-fee-status`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Monthly fee status retrieved",
  "data": {
    "monthly_fee_status": "paid",
    "last_fee_payment": "2024-01-01T00:00:00.000Z",
    "days_until_due": 25
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

````

### `docs/api/jobs.md`

```markdown
# Jobs API

## Create Job

Creates a new job request.

**Endpoint:** `POST /jobs/create`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "category": "plumbing",
  "description": "Leaking faucet in the kitchen sink. Water is dripping constantly.",
  "mediaUrls": ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"],
  "serviceType": "repair",
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
````

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Job created successfully",
  "data": {
    "job": {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "client_id": "550e8400-e29b-41d4-a716-446655440000",
      "category": "plumbing",
      "description": "Leaking faucet in the kitchen sink",
      "service_type": "repair",
      "job_status": "pending",
      "created_at": "2024-01-01T00:00:00.000Z"
    },
    "offersSent": 5
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Accept Job

Accepts a job offer (artisan only).

**Endpoint:** `POST /jobs/:jobId/accept`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job accepted successfully",
  "data": {
    "job": {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "artisan_id": "550e8400-e29b-41d4-a716-446655440201",
      "job_status": "accepted",
      "accepted_at": "2024-01-01T00:00:00.000Z"
    },
    "pin": "123456"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Reject Job Offer

Rejects a job offer (artisan only).

**Endpoint:** `POST /jobs/:jobId/reject`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "reason": "Too far from my location"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job offer rejected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Confirm Arrival

Confirms artisan arrival with PIN (client only).

**Endpoint:** `POST /jobs/:jobId/confirm-arrival`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "pin": "123456"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Arrival confirmed successfully",
  "data": {
    "baseFee": 2500
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Start Diagnostics

Starts the diagnostics phase (artisan only).

**Endpoint:** `POST /jobs/:jobId/start-diagnostics`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Diagnostics started",
  "data": {
    "startTime": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Update Diagnostics Progress

Updates diagnostics progress (artisan only).

**Endpoint:** `PUT /jobs/:jobId/diagnostics-progress`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "progress": 50,
  "notes": "Checking water pressure and pipe condition"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Diagnostics progress updated",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Stop Diagnostics

Stops the diagnostics phase (artisan only).

**Endpoint:** `POST /jobs/:jobId/stop-diagnostics`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "executionMode": "time_based",
  "findings": "Faucet cartridge needs replacement. Water pressure is normal."
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Diagnostics completed",
  "data": {
    "duration": 15.5,
    "fee": 7750,
    "executionMode": "time_based"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Start Execution

Starts the execution phase for time-based billing (artisan only).

**Endpoint:** `POST /jobs/:jobId/start-execution`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Execution started",
  "data": {
    "startTime": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Pause Execution

Pauses the execution (artisan only).

**Endpoint:** `POST /jobs/:jobId/pause-execution`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "reason": "Waiting for materials delivery",
  "duration": 30
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Execution paused",
  "data": {
    "pauseStart": "2024-01-01T00:00:00.000Z",
    "reason": "Waiting for materials delivery"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Resume Execution

Resumes the execution (artisan only).

**Endpoint:** `POST /jobs/:jobId/resume-execution`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Execution resumed",
  "data": {
    "pauseDuration": 1800
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Stop Execution

Stops the execution phase (artisan only).

**Endpoint:** `POST /jobs/:jobId/stop-execution`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Execution completed",
  "data": {
    "duration": 45.5,
    "fee": 45500
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Submit Quote

Submits a quote for quoted-mode jobs (artisan only).

**Endpoint:** `POST /jobs/:jobId/submit-quote`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "quoteAmount": 25000,
  "quoteDetails": "Replace entire faucet assembly and supply lines",
  "estimatedDuration": 120
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Quote submitted successfully",
  "data": {
    "job_id": "550e8400-e29b-41d4-a716-446655440300",
    "quoted_amount": 25000,
    "quote_details": "Replace entire faucet assembly and supply lines",
    "estimated_duration": 120
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Approve Quote

Approves a quote (client only).

**Endpoint:** `POST /jobs/:jobId/approve-quote`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Quote approved",
  "data": {
    "job_id": "550e8400-e29b-41d4-a716-446655440300",
    "job_status": "quote_approved"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Reject Quote

Rejects a quote (client only).

**Endpoint:** `POST /jobs/:jobId/reject-quote`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "reason": "Too expensive",
  "counterOffer": 20000
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Quote rejected",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Complete Job

Marks a job as completed (artisan only).

**Endpoint:** `POST /jobs/:jobId/complete`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "completionNotes": "Faucet replaced successfully. Customer satisfied."
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job completed successfully",
  "data": {
    "job": {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "job_status": "completed",
      "completed_at": "2024-01-01T00:00:00.000Z"
    },
    "billing": {
      "base_fee": 2500,
      "diagnostics_fee": 7750,
      "execution_fee": 45500,
      "total_amount": 55750,
      "billing_status": "awaiting_payment"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Cancel Job

Cancels a job (client or artisan).

**Endpoint:** `POST /jobs/:jobId/cancel`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "reason": "Found another artisan"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "data": {
    "job_id": "550e8400-e29b-41d4-a716-446655440300",
    "job_status": "cancelled",
    "cancelled_at": "2024-01-01T00:00:00.000Z",
    "cancellation_reason": "Found another artisan"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Job Details

Retrieves detailed job information.

**Endpoint:** `GET /jobs/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job details retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440300",
    "client_id": "550e8400-e29b-41d4-a716-446655440000",
    "artisan_id": "550e8400-e29b-41d4-a716-446655440201",
    "client_name": "John Doe",
    "artisan_name": "Jane Smith",
    "category": "plumbing",
    "description": "Leaking faucet in the kitchen sink",
    "service_type": "repair",
    "job_status": "completed",
    "billing_mode": "time_based",
    "base_fee": 2500,
    "diagnostics_fee": 7750,
    "execution_fee": 45500,
    "total_amount": 55750,
    "billing_status": "paid",
    "created_at": "2024-01-01T00:00:00.000Z",
    "accepted_at": "2024-01-01T01:00:00.000Z",
    "arrived_at": "2024-01-01T02:00:00.000Z",
    "completed_at": "2024-01-01T05:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Client Jobs

Retrieves jobs for the authenticated client.

**Endpoint:** `GET /jobs/client/jobs`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| status    | string  | No       | Filter by job status         |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 10) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "category": "plumbing",
      "description": "Leaking faucet repair",
      "job_status": "completed",
      "artisan_name": "Jane Smith",
      "total_amount": 55750,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "totalPages": 2
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Artisan Jobs

Retrieves jobs for the authenticated artisan.

**Endpoint:** `GET /jobs/artisan/jobs`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| status    | string  | No       | Filter by job status         |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 10) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "category": "plumbing",
      "description": "Leaking faucet repair",
      "job_status": "completed",
      "client_name": "John Doe",
      "total_amount": 55750,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Job Timeline

Retrieves the job activity timeline.

**Endpoint:** `GET /jobs/:jobId/timeline`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Job timeline retrieved successfully",
  "data": [
    {
      "status": "created",
      "description": "Job created by client",
      "created_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "status": "accepted",
      "description": "Job accepted by artisan Jane Smith",
      "created_at": "2024-01-01T01:00:00.000Z"
    },
    {
      "status": "arrived",
      "description": "Artisan arrived at location",
      "created_at": "2024-01-01T02:00:00.000Z"
    },
    {
      "status": "diagnostics",
      "description": "Diagnostics started",
      "created_at": "2024-01-01T02:15:00.000Z"
    },
    {
      "status": "diagnostics_completed",
      "description": "Diagnostics completed. Findings: Faucet cartridge needs replacement",
      "created_at": "2024-01-01T02:30:00.000Z"
    },
    {
      "status": "execution",
      "description": "Execution started",
      "created_at": "2024-01-01T02:30:00.000Z"
    },
    {
      "status": "completed",
      "description": "Job completed",
      "created_at": "2024-01-01T05:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Job Invoice

Retrieves the job invoice.

**Endpoint:** `GET /jobs/:jobId/invoice`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Invoice retrieved successfully",
  "data": {
    "invoiceNumber": "INV-550E8400",
    "date": "2024-01-01T00:00:00.000Z",
    "dueDate": "2024-01-08T00:00:00.000Z",
    "job": {
      "id": "550e8400-e29b-41d4-a716-446655440300",
      "category": "plumbing",
      "description": "Leaking faucet repair",
      "service_type": "repair"
    },
    "client": {
      "name": "John Doe",
      "email": "client@example.com",
      "phone": "+2348012345678",
      "address": "123 Main Street, Lagos"
    },
    "artisan": {
      "name": "Jane Smith"
    },
    "billing": {
      "breakdown": {
        "baseFee": 2500,
        "diagnosticsFee": 7750,
        "executionFee": 45500,
        "subtotal": 55750,
        "platformFee": 5575
      },
      "total": 61325
    },
    "status": "paid"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Rate Job

Submits a rating for a completed job (client only).

**Endpoint:** `POST /jobs/:jobId/rate`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "rating": 5,
  "review": "Excellent work! Very professional and punctual.",
  "categories": {
    "punctuality": 5,
    "quality": 5,
    "communication": 5,
    "professionalism": 5
  }
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Rating submitted successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440700",
    "rating": 5,
    "review": "Excellent work! Very professional and punctual.",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Report Issue

Reports an issue with a job.

**Endpoint:** `POST /jobs/:jobId/report`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "issueType": "poor_workmanship",
  "description": "The repair failed after 2 days. Water is leaking again.",
  "photos": ["https://example.com/issue1.jpg", "https://example.com/issue2.jpg"]
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Issue reported successfully. A dispute has been created.",
  "data": {
    "disputeId": "550e8400-e29b-41d4-a716-446655441200",
    "status": "pending"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

````

### `docs/api/payments.md`

```markdown
# Payments API

## Initialize Payment

Initializes a payment for a job.

**Endpoint:** `POST /payments/initialize/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "paymentMethodId": "pm_card_visa"
}
````

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "clientSecret": "pi_3..._secret_...",
    "paymentIntentId": "pi_3M5qZb2eZvKYlo2C1xYz",
    "amount": 61325,
    "requiresAction": false
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Payment Status

Retrieves payment status.

**Endpoint:** `GET /payments/status/:paymentIntentId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment status retrieved",
  "data": {
    "status": "succeeded",
    "amount": 61325,
    "currency": "ngn"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Payment Methods

Retrieves saved payment methods.

**Endpoint:** `GET /payments/methods`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment methods retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440400",
      "type": "card",
      "last4": "4242",
      "expiry_month": 12,
      "expiry_year": 2025,
      "is_default": true,
      "brand": "visa"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440401",
      "type": "bank_transfer",
      "bank_name": "GTBank",
      "account_last4": "1234",
      "is_default": false
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Add Payment Method

Adds a new payment method.

**Endpoint:** `POST /payments/methods`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "paymentMethodId": "pm_card_mastercard",
  "setAsDefault": true
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Payment method added successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440402",
    "type": "card",
    "last4": "5555",
    "expiry_month": 8,
    "expiry_year": 2026,
    "is_default": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Delete Payment Method

Deletes a payment method.

**Endpoint:** `DELETE /payments/methods/:methodId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment method deleted successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Set Default Payment Method

Sets a payment method as default.

**Endpoint:** `PUT /payments/methods/:methodId/default`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Default payment method updated",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440400",
    "is_default": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Payment History

Retrieves payment history.

**Endpoint:** `GET /payments/history`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                  |
| --------- | ------- | -------- | ---------------------------- |
| page      | integer | No       | Page number (default: 1)     |
| limit     | integer | No       | Items per page (default: 20) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment history retrieved successfully",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655441300",
      "job_id": "550e8400-e29b-41d4-a716-446655440300",
      "amount": 61325,
      "status": "succeeded",
      "paid_at": "2024-01-01T00:00:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z",
      "category": "plumbing"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 12,
    "totalPages": 1
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Transaction Details

Retrieves detailed transaction information.

**Endpoint:** `GET /payments/transaction/:transactionId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Transaction details retrieved successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655441300",
    "job_id": "550e8400-e29b-41d4-a716-446655440300",
    "amount": 61325,
    "currency": "ngn",
    "status": "succeeded",
    "payment_method": {
      "type": "card",
      "last4": "4242",
      "brand": "visa"
    },
    "billing_details": {
      "base_fee": 2500,
      "diagnostics_fee": 7750,
      "execution_fee": 45500,
      "platform_fee": 5575,
      "total": 61325
    },
    "paid_at": "2024-01-01T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Create Refund

Requests a refund for a payment.

**Endpoint:** `POST /payments/refund/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "amount": 61325,
  "reason": "Work not completed satisfactorily"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Refund initiated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655441400",
    "amount": 61325,
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Refund Status

Retrieves refund status.

**Endpoint:** `GET /payments/refund/:refundId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Refund status retrieved",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655441400",
    "amount": 61325,
    "status": "completed",
    "completed_at": "2024-01-02T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Create Dispute

Creates a dispute for a payment.

**Endpoint:** `POST /payments/dispute/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "reason": "work_not_completed",
  "description": "The artisan left the job unfinished. The repair was not completed.",
  "evidence": ["https://example.com/evidence1.jpg", "https://example.com/evidence2.jpg"]
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "message": "Dispute created successfully",
  "data": {
    "disputeId": "550e8400-e29b-41d4-a716-446655441200",
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Dispute Status

Retrieves dispute status.

**Endpoint:** `GET /payments/dispute/:disputeId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Dispute status retrieved",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655441200",
    "status": "resolved",
    "resolution": "Refund issued to client",
    "resolved_at": "2024-01-05T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Cancel Dispute

Cancels a pending dispute.

**Endpoint:** `POST /payments/dispute/:disputeId/cancel`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Dispute cancelled successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Escrow Balance

Retrieves escrow balance for a job.

**Endpoint:** `GET /payments/escrow/balance`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Escrow balance retrieved successfully",
  "data": {
    "held": 25000,
    "frozen": 0,
    "released": 50000,
    "breakdown": {
      "base_fee": { "held": 2500, "released": 0 },
      "diagnostics_fee": { "held": 7750, "released": 0 },
      "execution_fee": { "held": 45500, "released": 0 },
      "materials": { "held": 0, "released": 15000 },
      "workmanship": { "held": 0, "released": 35000 }
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Payment Summary

Retrieves payment summary for the authenticated user.

**Endpoint:** `GET /payments/summary`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type   | Required | Description                     |
| --------- | ------ | -------- | ------------------------------- |
| period    | string | No       | Period (day, week, month, year) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Payment summary retrieved successfully",
  "data": {
    "total_spent": 250000,
    "total_saved": 25000,
    "average_spent": 50000,
    "last_payment": {
      "amount": 61325,
      "date": "2024-01-01T00:00:00.000Z",
      "job_id": "550e8400-e29b-41d4-a716-446655440300"
    },
    "monthly_breakdown": [
      { "month": "2024-01", "amount": 250000, "jobs": 5 },
      { "month": "2023-12", "amount": 200000, "jobs": 4 }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Download Receipt

Downloads a payment receipt.

**Endpoint:** `GET /payments/receipt/:paymentId/download`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK` (PDF file)

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="receipt_550e8400.pdf"

[PDF binary data]
```

````

### `docs/api/locations.md`

```markdown
# Location API

## Update Location

Updates the artisan's current location (artisan only).

**Endpoint:** `POST /location/update`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "heading": 180,
  "speed": 15.5,
  "accuracy": 10,
  "jobId": "550e8400-e29b-41d4-a716-446655440300"
}
````

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Location updated successfully",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Artisan Location

Retrieves an artisan's current location.

**Endpoint:** `GET /location/artisan/:artisanId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Artisan location retrieved successfully",
  "data": {
    "latitude": 6.5244,
    "longitude": 3.3792,
    "heading": 180,
    "speed": 15.5,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Nearby Artisans

Retrieves artisans near a location.

**Endpoint:** `GET /location/nearby`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                   |
| --------- | ------- | -------- | ----------------------------- |
| latitude  | float   | Yes      | Latitude                      |
| longitude | float   | Yes      | Longitude                     |
| radius    | integer | No       | Radius in km (default: 5)     |
| category  | string  | No       | Filter by category            |
| limit     | integer | No       | Maximum results (default: 20) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Nearby artisans retrieved successfully",
  "data": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440201",
      "full_legal_name": "Jane Smith",
      "skill_category": "plumbing",
      "tier_level": 2,
      "star_rating": 4.5,
      "completion_rate": 95,
      "distance": 2.5,
      "eta": 5,
      "current_location": {
        "latitude": 6.5244,
        "longitude": 3.3792
      }
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Set Availability

Sets the artisan's availability status (artisan only).

**Endpoint:** `POST /location/availability`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "isAvailable": true,
  "location": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Availability set to true",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Location History

Retrieves location history for a job.

**Endpoint:** `GET /location/history/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description                   |
| --------- | ------- | -------- | ----------------------------- |
| startTime | string  | No       | Start time (ISO format)       |
| endTime   | string  | No       | End time (ISO format)         |
| page      | integer | No       | Page number (default: 1)      |
| limit     | integer | No       | Items per page (default: 100) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Location history retrieved successfully",
  "data": [
    {
      "location": {
        "latitude": 6.5244,
        "longitude": 3.3792
      },
      "timestamp": "2024-01-01T00:00:00.000Z",
      "heading": 180,
      "speed": 15.5
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 250,
    "totalPages": 3
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Calculate Route

Calculates the route from artisan to job location.

**Endpoint:** `POST /location/route`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "origin": {
    "latitude": 6.5244,
    "longitude": 3.3792
  },
  "destination": {
    "latitude": 6.5344,
    "longitude": 3.3892
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Route calculated successfully",
  "data": {
    "routes": [
      {
        "distance": {
          "value": 1250,
          "text": "1.3 km"
        },
        "duration": {
          "value": 300,
          "text": "5 mins"
        },
        "polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
        "steps": [
          {
            "instruction": "Head south on Main Street",
            "distance": 500,
            "duration": 120
          }
        ]
      }
    ]
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get ETA

Gets estimated time of arrival for an artisan to a job.

**Endpoint:** `GET /location/eta/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "ETA retrieved successfully",
  "data": {
    "distance": 1250,
    "etaMinutes": 5,
    "etaFormatted": "5 minutes",
    "arrivalTime": "2024-01-01T01:05:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Generate Arrival PIN

Generates an arrival PIN for the job (artisan only).

**Endpoint:** `POST /location/generate-pin/:jobId`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Arrival PIN generated successfully",
  "data": {
    "pin": "123456",
    "expiresIn": 30
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Validate Geofence

Validates if an artisan is within the job geofence.

**Endpoint:** `POST /location/validate-geofence`

**Headers:** `Authorization: Bearer <access_token>`

**Request Body:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440300",
  "artisanLocation": {
    "latitude": 6.5244,
    "longitude": 3.3792
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Geofence validation completed",
  "data": {
    "isWithinGeofence": true,
    "distance": 45,
    "requiredRadius": 100
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Active Artisans

Retrieves all active artisans (admin only).

**Endpoint:** `GET /location/active-artisans`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| category  | string | No       | Filter by category |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Active artisans retrieved successfully",
  "data": [
    {
      "user_id": "550e8400-e29b-41d4-a716-446655440201",
      "full_legal_name": "Jane Smith",
      "skill_category": "plumbing",
      "tier_level": 2,
      "star_rating": 4.5,
      "current_location": {
        "latitude": 6.5244,
        "longitude": 3.3792
      },
      "last_location_update": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Distance Traveled

Retrieves the total distance traveled by an artisan.

**Endpoint:** `GET /location/distance/:artisanId`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| startDate | string | No       | Start date (ISO format) |
| endDate   | string | No       | End date (ISO format)   |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Distance traveled retrieved successfully",
  "data": {
    "distance": 125000,
    "distance_formatted": "125 km",
    "start_date": "2024-01-01T00:00:00.000Z",
    "end_date": "2024-01-31T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Get Traffic Conditions

Retrieves traffic conditions for an area.

**Endpoint:** `GET /location/traffic`

**Headers:** `Authorization: Bearer <access_token>`

**Query Parameters:**

| Parameter | Type    | Required | Description               |
| --------- | ------- | -------- | ------------------------- |
| latitude  | float   | Yes      | Latitude                  |
| longitude | float   | Yes      | Longitude                 |
| radius    | integer | No       | Radius in km (default: 5) |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Traffic conditions retrieved successfully",
  "data": {
    "zone": "urban",
    "congestionLevel": "moderate",
    "averageSpeed": 25,
    "incidents": [
      {
        "type": "accident",
        "location": "Main Street & 1st Ave",
        "severity": "moderate"
      }
    ],
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

````

### `docs/api/webhooks.md`

```markdown
# Webhooks API

Webhooks allow external services to send real-time notifications to the BeaverWorks platform.

## Stripe Webhook

Receives webhook events from Stripe.

**Endpoint:** `POST /webhooks/stripe`

**Headers:**
- `Stripe-Signature`: Stripe signature header for verification

**Request Body:** (varies by event type)

### Payment Intent Succeeded

```json
{
  "id": "evt_123",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_123",
      "amount": 6132500,
      "currency": "ngn",
      "metadata": {
        "jobId": "550e8400-e29b-41d4-a716-446655440300",
        "clientId": "550e8400-e29b-41d4-a716-446655440000"
      },
      "status": "succeeded"
    }
  }
}
````

**Response:** `200 OK`

```json
{
  "received": true
}
```

### Payment Intent Failed

```json
{
  "id": "evt_123",
  "type": "payment_intent.payment_failed",
  "data": {
    "object": {
      "id": "pi_123",
      "last_payment_error": {
        "message": "Your card was declined"
      },
      "metadata": {
        "jobId": "550e8400-e29b-41d4-a716-446655440300",
        "clientId": "550e8400-e29b-41d4-a716-446655440000"
      }
    }
  }
}
```

### Charge Refunded

```json
{
  "id": "evt_123",
  "type": "charge.refunded",
  "data": {
    "object": {
      "id": "ch_123",
      "payment_intent": "pi_123",
      "amount_refunded": 6132500
    }
  }
}
```

### Subscription Created

```json
{
  "id": "evt_123",
  "type": "customer.subscription.created",
  "data": {
    "object": {
      "id": "sub_123",
      "customer": "cus_123",
      "status": "active",
      "items": {
        "data": [
          {
            "plan": {
              "amount": 500000,
              "currency": "ngn",
              "interval": "month"
            }
          }
        ]
      }
    }
  }
}
```

## Paystack Webhook

Receives webhook events from Paystack.

**Endpoint:** `POST /webhooks/paystack`

**Headers:**

- `x-paystack-signature`: Paystack signature header for verification

### Charge Success

```json
{
  "event": "charge.success",
  "data": {
    "id": 123456789,
    "domain": "live",
    "status": "success",
    "reference": "ref_123",
    "amount": 6132500,
    "currency": "NGN",
    "metadata": {
      "jobId": "550e8400-e29b-41d4-a716-446655440300",
      "clientId": "550e8400-e29b-41d4-a716-446655440000"
    },
    "customer": {
      "id": 12345,
      "email": "client@example.com"
    }
  }
}
```

**Response:** `200 OK`

### Transfer Success

```json
{
  "event": "transfer.success",
  "data": {
    "id": 123456789,
    "reference": "transfer_ref_123",
    "amount": 5000000,
    "currency": "NGN",
    "recipient": {
      "account_number": "1234567890",
      "bank_code": "001"
    },
    "status": "success"
  }
}
```

### Transfer Failed

```json
{
  "event": "transfer.failed",
  "data": {
    "id": 123456789,
    "reference": "transfer_ref_123",
    "reason": "Invalid account number",
    "amount": 5000000
  }
}
```

### Dispute Created

```json
{
  "event": "charge.dispute.create",
  "data": {
    "id": "ds_123",
    "transaction": {
      "reference": "ref_123"
    },
    "reason": "fraudulent"
  }
}
```

## Flutterwave Webhook

Receives webhook events from Flutterwave.

**Endpoint:** `POST /webhooks/flutterwave`

**Headers:**

- `verif-hash`: Flutterwave verification hash

### Charge Completed

```json
{
  "event": "charge.completed",
  "data": {
    "id": 123456789,
    "tx_ref": "ref_123",
    "flw_ref": "flw_123",
    "amount": 61325,
    "currency": "NGN",
    "status": "successful",
    "customer": {
      "id": 12345,
      "email": "client@example.com"
    }
  }
}
```

**Response:** `200 OK`

### Transfer Completed

```json
{
  "event": "transfer.completed",
  "data": {
    "id": 123456789,
    "reference": "transfer_ref_123",
    "amount": 50000,
    "currency": "NGN",
    "status": "successful"
  }
}
```

## Test Webhook

Test endpoint for webhook integration.

**Endpoint:** `POST /webhooks/test`

**Headers:**

- `x-webhook-secret`: Test webhook secret

**Request Body:**

```json
{
  "event": "test.payment",
  "data": {
    "message": "This is a test webhook",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Webhook received successfully",
  "data": {
    "received": true,
    "event": "test.payment"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Webhook Status

Retrieves webhook configuration status (admin only).

**Endpoint:** `GET /webhooks/status`

**Headers:** `Authorization: Bearer <access_token>`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Webhook status retrieved successfully",
  "data": {
    "stripe": {
      "configured": true,
      "lastEvent": "2024-01-01T00:00:00.000Z",
      "status": "active"
    },
    "paystack": {
      "configured": true,
      "lastEvent": "2024-01-01T00:00:00.000Z",
      "status": "active"
    },
    "flutterwave": {
      "configured": true,
      "lastEvent": "2024-01-01T00:00:00.000Z",
      "status": "active"
    }
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Webhook Best Practices

### Verification

Always verify webhook signatures to ensure requests are legitimate:

```javascript
// Stripe
const sig = req.headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

// Paystack
const hash = crypto.createHmac('sha512', secretKey).update(JSON.stringify(req.body)).digest('hex');
if (hash !== signature) {
  throw new Error('Invalid signature');
}

// Flutterwave
if (signature !== flutterwaveSecretHash) {
  throw new Error('Invalid signature');
}
```

### Idempotency

Webhooks may be retried. Ensure your handlers are idempotent:

```javascript
// Check if event was already processed
const processed = await redis.get(`webhook:${event.id}`);
if (processed) {
  return res.status(200).send('Already processed');
}

// Process event
await processEvent(event);

// Mark as processed
await redis.setex(`webhook:${event.id}`, 86400, 'processed');
```

### Error Handling

Always return appropriate status codes:

- `200 OK` - Event received and processed successfully
- `400 Bad Request` - Invalid request format
- `401 Unauthorized` - Invalid signature
- `500 Internal Server Error` - Processing error (will trigger retry)

### Retry Logic

Payment providers automatically retry failed webhooks:

- Stripe: Retries up to 3 times with exponential backoff
- Paystack: Retries up to 3 times after 5 minutes
- Flutterwave: Retries up to 5 times with increasing intervals

## Webhook Events Reference

### Stripe Events

| Event Type                      | Description              |
| ------------------------------- | ------------------------ |
| `payment_intent.succeeded`      | Payment succeeded        |
| `payment_intent.payment_failed` | Payment failed           |
| `charge.refunded`               | Payment was refunded     |
| `customer.subscription.created` | New subscription created |
| `customer.subscription.updated` | Subscription updated     |
| `customer.subscription.deleted` | Subscription cancelled   |

### Paystack Events

| Event Type               | Description        |
| ------------------------ | ------------------ |
| `charge.success`         | Payment succeeded  |
| `transfer.success`       | Transfer completed |
| `transfer.failed`        | Transfer failed    |
| `charge.dispute.create`  | Dispute created    |
| `charge.dispute.resolve` | Dispute resolved   |

### Flutterwave Events

| Event Type           | Description        |
| -------------------- | ------------------ |
| `charge.completed`   | Payment completed  |
| `transfer.completed` | Transfer completed |

```

This completes all the API documentation markdown files for the BeaverWorks backend. The documentation provides:

1. **README.md** - Overview, authentication, base URL, response formats, rate limits
2. **auth.md** - Authentication endpoints (register, login, logout, password management)
3. **clients.md** - Client profile, addresses, saved artisans, job history
4. **artisans.md** - Artisan profile, earnings, withdrawals, ratings, schedule, tools
5. **jobs.md** - Complete job lifecycle (create, accept, diagnostics, execution, completion)
6. **payments.md** - Payment processing, refunds, disputes, escrow
7. **locations.md** - Real-time location tracking, geofencing, routing, ETA
8. **webhooks.md** - Stripe, Paystack, and Flutterwave webhook integration
```
