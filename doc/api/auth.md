## New User Creation for client

URL : 127.0.0.1:3000/api/v1/auth/register/client
Method: POST
Body fields: [email, phone, fullLegalName, password, serviceAddress, streetAddress, nin, ninPhoto, passportPhoto]


Response: {
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "timestamp": "2026-04-26T14:57:55.805Z",
  "data": {
    "id": "f102bde6-81eb-4d75-9076-b12252eede04",
    "email": "kola@gmail.com",
    "phone": "+2348032688674",
    "userType": "client",
    "profile": {
      "user_id": "f102bde6-81eb-4d75-9076-b12252eede04",
      "full_legal_name": "Bola Kareem",
      "nin": "1234567890",
      "street_address": "5, Lagos Agogo",
      "service_address": "23, Aina street",
      "verification_documents": {
        "ninPhoto": "https://api.beaverworks.com/uploads/nin-photos/4eca9ac0-ee5e-4ce4-926e-a22f1b50c479.png",
        "passportPhoto": "https://api.beaverworks.com/uploads/profile-photos/db6645e4-908d-4993-8ac5-960587df6da3.png"
      },
      "created_at": "2026-04-26T14:57:55.274Z"
    }
  }
}

## Verify Email

URL : 127.0.0.1:3000/api/v1/auth/verify/email
Method: POST
Body fields: [email, otp]
Response : {
  "success": true,
  "message": "Email verified successfully",
  "timestamp": "2026-04-26T16:26:23.005Z"
}


