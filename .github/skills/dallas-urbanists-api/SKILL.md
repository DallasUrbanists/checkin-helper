---
name: dallas-urbanists-api
description: "Work with the Dallas Urbanists Cloud API (https://api.dallasurbanists.org/api-docs.json). Use when integrating or building API clients for attendee checkins, contact management, civic improvement suggestions, photo uploads, or health checks."
argument-hint: "[contacts|checkins|suggestions|health]"
user-invocable: true
---

# Dallas Urbanists Cloud API

Integration guide and workflow reference for interacting with the Dallas Urbanists Cloud API (OpenAPI 3.0.3) serving PostgreSQL contact/checkin records and public improvements data.

Specification source: [Dallas Urbanists API Docs JSON](https://api.dallasurbanists.org/api-docs.json)
Base URL: `https://api.dallasurbanists.org`

## When to Use

- Implementing or updating REST API client composables and fetch calls (e.g. `useApi.js`, `useCheckin.js`)
- Managing **Contacts** (create, list, update, lookup by ID)
- Managing **Checkins** (register attendee for event, list checkins, query by `event_id` or `contact_id`)
- Managing **Suggestions** & photo uploads (create civic suggestions, request signed GCS upload URLs)
- Handling API request/response validation, DTO schemas, and error codes

## Quick Reference

See detailed schemas and request payloads in [API Reference](./references/api-reference.md).

| Resource | Method & Path | Summary | Key Parameters / Payload |
|---|---|---|---|
| **System** | `GET /api/health` | Server Health Check | Returns `{ status, timestamp, service, databases }` |
| **Contacts** | `GET /api/contacts` | List all contacts | Query: `limit` (int, default/example: 50) |
| | `POST /api/contacts` | Create contact | Body: `CreateContactDTO` (`name` required, `emails`, `phones`, `zip_home`, `zip_other`, `roles`) |
| | `GET /api/contacts/{id}` | Get contact by ID | Path: `id` (integer) |
| | `PUT /api/contacts/{id}` | Update contact | Path: `id`, Body: `UpdateContactDTO` |
| | `DELETE /api/contacts/{id}` | Delete contact | Path: `id` |
| **Checkins** | `GET /api/checkins` | List checkins | Query: `contact_id`, `event_id`, `limit`, `offset` |
| | `POST /api/checkins` | Create checkin | Body: `CreateCheckinDTO` (`event_id` required, `contact_id`, `submitted_on`) |
| | `GET /api/checkins/{id}` | Get checkin by ID | Path: `id` (integer) |
| | `PUT /api/checkins/{id}` | Update checkin | Path: `id`, Body: `UpdateCheckinDTO` |
| | `DELETE /api/checkins/{id}` | Delete checkin | Path: `id` |
| **Suggestions**| `GET /api/suggestions` | List suggestions | Query: `status`, `authorEmail`, `limit` |
| | `POST /api/suggestions` | Create suggestion | Body: `CreateSuggestionDTO` (`author`, `content` required) |
| | `POST /api/suggestions/upload-url` | Generate signed photo upload URL | Body: `{ contentType, filename }` |
| | `GET /api/suggestions/{id}` | Get suggestion by ID | Path: `id` |
| | `PUT /api/suggestions/{id}` | Update suggestion | Path: `id`, Body: `UpdateSuggestionDTO` |
| | `DELETE /api/suggestions/{id}` | Delete suggestion | Path: `id` |

---

## Core Workflows

### 1. Attendee Check-in Workflow

When an attendee arrives at an event:
1. **Search / Lookup Contact**:
   - Query `GET /api/contacts?limit=100` or filter client-side by email/phone.
2. **Create Contact (if new attendee)**:
   - Make a `POST /api/contacts` with payload:
     ```json
     {
       "name": "Jane Doe",
       "emails": ["jane.doe@example.com"],
       "phones": ["+1-214-555-0199"],
       "zip_home": "75201",
       "roles": ["member"]
     }
     ```
   - Extract `id` from the response (HTTP 201).
3. **Record Checkin**:
   - Make a `POST /api/checkins` with payload:
     ```json
     {
       "contact_id": 42,
       "event_id": "dallas-bike-ride-2026",
       "submitted_on": "2026-10-01T14:30:00.000Z"
     }
     ```
   - *Note*: `contact_id` is nullable (supports anonymous check-ins). `submitted_on` defaults to current server timestamp if omitted.

### 2. Suggestion & Photo Upload Workflow

1. **Request Upload URL**:
   - `POST /api/suggestions/upload-url` with `{ "contentType": "image/webp", "filename": "sidewalk.webp" }`.
   - Returns `{ uploadUrl, publicUrl, filePath, expiresAt }`.
2. **Upload Binary**:
   - Client sends HTTP `PUT` directly to `uploadUrl` with the raw file data and corresponding `Content-Type`.
3. **Submit Suggestion**:
   - `POST /api/suggestions` referencing the `publicUrl` in the `photos` array.

---

## Error Handling

Standard error response format:
```json
{
  "error": "Bad Request",
  "message": "author.email is required and must be a valid email address."
}
```

- `400 Bad Request`: Input validation failed. Check required fields, email formatting, and data types.
- `404 Not Found`: Resource with specified ID does not exist.
- `409 Conflict`: Resource with supplied ID already exists (e.g. custom suggestion ID).
- `500 Internal Server Error`: Server or database failure.
