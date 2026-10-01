# Dallas Urbanists Cloud API Reference

Based on OpenAPI 3.0.3 specification at `https://api.dallasurbanists.org/api-docs.json`.

## Endpoints

### System Endpoints

#### `GET /api/health`
- **Summary**: Server Health Check
- **Description**: Returns operational health and environment state of the API server.
- **Response 200**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-23T12:00:00.000Z",
    "service": "urbanists-cloud-api-server",
    "databases": ["public-improvements"]
  }
  ```

---

### Contacts Endpoints

#### `GET /api/contacts`
- **Summary**: List All Contacts
- **Query Parameters**:
  - `limit` (integer, optional): Maximum items to return (example: `50`)
- **Response 200**: Array of `Contact` objects.

#### `POST /api/contacts`
- **Summary**: Create a New Contact
- **Request Body** (`CreateContactDTO`):
  ```json
  {
    "name": "Jane Doe",
    "emails": ["jane.doe@example.com"],
    "phones": ["+1-214-555-0199"],
    "zip_home": "75201",
    "zip_other": ["75202"],
    "roles": ["member", "volunteer"]
  }
  ```
- **Response 201**: `Contact` object.

#### `GET /api/contacts/{id}`
- **Summary**: Get Contact by ID
- **Path Parameter**: `id` (integer)
- **Response 200**: `Contact` object.

#### `PUT /api/contacts/{id}`
- **Summary**: Update Contact
- **Path Parameter**: `id` (integer)
- **Request Body** (`UpdateContactDTO`): Same structure as `CreateContactDTO`.
- **Response 200**: Updated `Contact` object.

#### `DELETE /api/contacts/{id}`
- **Summary**: Delete Contact
- **Path Parameter**: `id` (integer)
- **Response 200**:
  ```json
  {
    "message": "Contact with ID 1 has been deleted successfully."
  }
  ```

---

### Checkins Endpoints

#### `GET /api/checkins`
- **Summary**: List All Checkins
- **Query Parameters**:
  - `contact_id` (integer, optional): Filter checkins by contact ID
  - `event_id` (string, optional): Filter checkins by event identifier
  - `limit` (integer, optional): Max records to return (default/example: `50`)
  - `offset` (integer, optional): Records to skip for pagination (example: `0`)
- **Response 200**: Array of `Checkin` objects.

#### `POST /api/checkins`
- **Summary**: Create a New Checkin
- **Request Body** (`CreateCheckinDTO`):
  ```json
  {
    "contact_id": 42,
    "event_id": "dallas-bike-ride-2026",
    "submitted_on": "2026-10-01T14:30:00.000Z"
  }
  ```
  *Note*: `event_id` is required. `contact_id` is optional (nullable). `submitted_on` is optional (defaults to server timestamp).
- **Response 201**: `Checkin` object.

#### `GET /api/checkins/{id}`
- **Summary**: Get Checkin by ID
- **Path Parameter**: `id` (integer)
- **Response 200**: `Checkin` object.

#### `PUT /api/checkins/{id}`
- **Summary**: Update Checkin
- **Path Parameter**: `id` (integer)
- **Request Body** (`UpdateCheckinDTO`): `{ contact_id?, event_id?, submitted_on? }`
- **Response 200**: Updated `Checkin` object.

#### `DELETE /api/checkins/{id}`
- **Summary**: Delete Checkin
- **Path Parameter**: `id` (integer)
- **Response 200**:
  ```json
  {
    "message": "Checkin with ID 1 has been deleted successfully."
  }
  ```

---

### Suggestions Endpoints

#### `GET /api/suggestions`
- **Query Parameters**: `status` (`new` | `inprogress` | `stalled` | `withdrawn` | `completed`), `authorEmail` (email), `limit` (integer).
- **Response 200**: `{ "data": [Suggestion], "count": 1 }`

#### `POST /api/suggestions`
- **Request Body** (`CreateSuggestionDTO`):
  ```json
  {
    "status": "new",
    "author": {
      "name": "Alex Rivera",
      "email": "alex@dallasurbanists.org"
    },
    "content": {
      "summary": "Add protected bike lane and shade trees along Elm Street",
      "details": "Installing concrete bollards...",
      "photos": []
    },
    "location": {
      "latitude": 32.78014,
      "longitude": -96.79701,
      "description": "Intersection of Elm St and N Akard St",
      "address": "1500 Elm St, Dallas, TX 75201"
    }
  }
  ```
- **Response 201**: `{ "message": "Suggestion created successfully.", "data": Suggestion }`

#### `POST /api/suggestions/upload-url`
- **Request Body**: `{ "contentType": "image/webp", "filename": "photo.webp" }`
- **Response 200**:
  ```json
  {
    "message": "Signed upload URL generated successfully.",
    "data": {
      "uploadUrl": "https://storage.googleapis.com/...",
      "publicUrl": "https://storage.googleapis.com/...",
      "filePath": "suggestions/uploads/1695484800000-uuid.webp",
      "expiresAt": "2026-09-23T15:15:00.000Z"
    }
  }
  ```
