# Duplicate Detector API

A backend API for merchant onboarding and duplicate detection. The service helps an operations team identify whether a newly registered merchant may already exist in the system under a slightly different business name.

The system uses a deterministic-first matching engine and an optional OpenAI second-opinion layer. Deterministic matching provides the stable baseline, while the LLM adds contextual reasoning only after the system has already shortlisted likely duplicate candidates.

## Table of Contents

- [Core Idea](#core-idea)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Flow](#system-flow)
- [Architecture](#architecture)
- [Duplicate Detection Design](#duplicate-detection-design)
- [Database Design](#database-design)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Database Setup](#database-setup)
- [Seed Data](#seed-data)
- [Running the Application](#running-the-application)
- [API Usage Examples](#api-usage-examples)
- [Testing](#testing)
- [Key Trade-Offs](#key-trade-offs)
- [Reliability and Fallback Strategy](#reliability-and-fallback-strategy)
- [Security Notes](#security-notes)
- [Current Limitations](#current-limitations)
- [What I Would Do With Another 8 Hours](#what-i-would-do-with-another-8-hours)
- [AI-Assisted Development Reflection](#ai-assisted-development-reflection)

## Core Idea

When a new merchant registers, the API stores the merchant as `PENDING_REVIEW`, runs duplicate detection against existing merchant records, stores the duplicate-analysis result, and allows an admin to review and verify the merchant.

Example problem:

```text
Existing merchant: Beta Foods Limited
New merchant:      BetaFoods Ltd
```

The system should recognize that both names may refer to the same business and return an explainable duplicate-confidence result for admin review.

The high-level flow is:

```text
Register -> Normalize -> Compare -> Score -> Store -> Review -> Verify
```

## Features

- Merchant registration with pending-review status
- Admin registration and login
- Shared login endpoint for admins and verified merchants
- JWT-based authentication
- Role-based access control for admin-only merchant review actions
- Merchant search by business name, normalized business name, or email
- Merchant detail retrieval with stored duplicate-analysis result
- Merchant verification by admin
- Deterministic duplicate detection using three algorithms
- OpenAI second-opinion review for shortlisted candidates
- Stored duplicate-check runs and candidate-level score breakdowns
- OpenAI request logging and fallback status tracking
- Prisma/PostgreSQL schema with indexes
- Swagger/OpenAPI documentation
- Seed data for realistic duplicate and non-duplicate testing

## Tech Stack

- **Runtime:** Node.js
- **Framework:** NestJS
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT + Passport
- **Validation:** class-validator + class-transformer
- **API Documentation:** Swagger/OpenAPI
- **LLM Provider:** OpenAI
- **Testing:** Jest + Supertest

## System Flow

### Merchant Registration Flow

1. A merchant submits registration details.
2. The system validates the request body.
3. The system creates a user record with role `MERCHANT`.
4. The system creates a linked merchant profile with status `PENDING_REVIEW`.
5. The system normalizes the merchant business name.
6. The duplicate-detection engine compares the new merchant against existing merchants.
7. Candidate duplicate results are stored in the database.
8. The registration response tells the merchant that their account is pending admin verification.
9. The merchant cannot log in until an admin verifies the merchant profile.

### Admin Review Flow

1. Admin logs in and receives a JWT.
2. Admin searches merchants using `GET /api/merchants?search=`.
3. Admin opens a merchant detail view using `GET /api/merchants/:id`.
4. The response includes merchant profile data and duplicate-analysis output.
5. Admin verifies the merchant using `POST /api/merchants/:id/verify`.
6. Once verified, the merchant can log in successfully.

## Architecture

The codebase follows a modular NestJS structure:

```text
src/
  auth/
    dto/
    factories/
    interfaces/
    auth.controller.ts
    auth.service.ts
    auth-token.service.ts
    jwt.strategy.ts
    password.service.ts

  common/
    decorators/
    guards/
    interfaces/

  database/
    database.module.ts
    database.service.ts

  duplicate-detection/
    interfaces/
    deterministic-matching.service.ts
    duplicate-detection.service.ts
    duplicate-normalization.service.ts
    duplicate-score.service.ts
    duplicate-detection.constants.ts

  llm/
    llm.module.ts
    openai-duplicate-second-opinion.service.ts

  merchants/
    dto/
    merchants.controller.ts
    merchants.service.ts

  app.module.ts
  main.ts
```

### Module Responsibilities

#### `auth` module

Handles:

- Admin registration
- Shared login
- Password hashing and verification
- JWT token signing
- JWT strategy validation
- Role-specific login responses

#### `merchants` module

Handles:

- Merchant registration
- Merchant search
- Merchant detail retrieval
- Merchant verification
- Merchant duplicate-result refresh checks

#### `duplicate-detection` module

Handles:

- Merchant name normalization
- Deterministic similarity scoring
- Candidate threshold filtering
- Score merging
- Duplicate-check persistence orchestration

#### `llm` module

Handles:

- OpenAI duplicate second-opinion request
- Structured JSON response formatting
- LLM timeout handling
- LLM failure fallback

#### `database` module

Provides the Prisma client through a global `DatabaseService`.

## Duplicate Detection Design

The duplicate detector is deterministic-first. This means the system does not send the full merchant database to OpenAI. Instead, it first uses mathematical matching to find likely candidates, then sends only the strongest candidates to OpenAI.

### Step 1: Normalize Business Names

Before scoring, merchant names are normalized so small differences do not distort the result.

Normalization includes:

- Lowercasing
- Trimming whitespace
- Removing punctuation
- Collapsing repeated spaces
- Removing common business suffixes like `limited`, `ltd`, `plc`, `company`, `enterprise`, and `services`
- Removing simple stop words like `the` and `and`
- Normalizing `nig` into `nigeria`

Example:

```text
Beta Foods Limited!!! -> beta foods
```

### Step 2: Deterministic Matching

The system calculates three scores for every comparison merchant:

1. **Levenshtein similarity**
   - Measures how many edits are needed to transform one merchant name into another.

2. **Trigram similarity**
   - Breaks names into three-character chunks and compares overlap.

3. **Jaro-Winkler similarity**
   - Works well when names have similar prefixes and small changes later in the string.

The final deterministic score is calculated as:

```text
deterministicScore = (levenshteinScore + trigramScore + jaroWinklerScore) / 3
```

### Step 3: Threshold Filtering

Only candidates with deterministic score greater than or equal to `0.60` are treated as possible duplicates.

```text
score >= 0.60 -> possible duplicate candidate
score < 0.60  -> ignored
```

### Step 4: Candidate Shortlisting

Only the strongest candidates are sent to OpenAI.

Current shortlist limit:

```text
5 candidates
```

This keeps the LLM call small, cheaper, faster, and easier to reason about.

### Step 5: OpenAI Second Opinion

OpenAI receives:

- The source merchant
- The shortlisted deterministic candidates
- Each candidate's deterministic score

The model is instructed to return structured JSON with:

- Candidate merchant ID
- Candidate merchant name
- LLM score between `0` and `1`
- Reasoning summary
- Recommendation

Default model fallback:

```text
gpt-4o-mini
```

The model can be overridden through `OPENAI_MODEL`.

### Step 6: Final Score Merging

If OpenAI returns a valid result, the final confidence score is:

```text
finalConfidenceScore = (deterministicScore * 0.65) + (llmScore * 0.35)
```

If OpenAI is disabled, fails, times out, or returns invalid output, the system falls back to deterministic-only scoring:

```text
finalConfidenceScore = deterministicScore
```

### Recommendation Bands

| Final Score | Recommendation | Meaning |
|---|---|---|
| `0.85 - 1.00` | `LIKELY_DUPLICATE` | Strong duplicate candidate |
| `0.70 - 0.84` | `REVIEW` | Possible duplicate; admin should inspect |
| `0.60 - 0.69` | `WEAK_MATCH` | Low-confidence match, still visible for review |
| `< 0.60` | `NO_MATCH` | Not treated as a duplicate |

## Database Design

The schema is designed around authentication, merchant onboarding, duplicate-check runs, candidate-level scoring, and optional auditability.

### Main Tables

#### `users`

Stores authentication-level data:

- `id`
- `firstName`
- `lastName`
- `email`
- `passwordHash`
- `role`
- `isActive`
- `lastLoginAt`
- timestamps

Important indexes:

- Unique index on `email`
- Index on `role`
- Index on `isActive`

#### `merchants`

Stores merchant business profile and verification state:

- `id`
- `userId`
- `businessName`
- `normalizedBusinessName`
- `businessEmail`
- `phoneNumber`
- `cacNumber`
- `address`
- `status`
- `verifiedAt`
- `verifiedByUserId`
- rejection fields
- timestamps

Important indexes:

- `businessName`
- `normalizedBusinessName`
- `businessEmail`
- `cacNumber`
- `status`
- `createdAt`

#### `duplicate_checks`

Stores each duplicate-check run:

- source merchant
- status
- LLM status
- deterministic threshold
- deterministic/LLM weights
- candidate counts
- error message
- computation timestamp

#### `duplicate_check_candidates`

Stores every candidate returned by a duplicate-check run:

- candidate merchant
- Levenshtein score
- Trigram score
- Jaro-Winkler score
- deterministic score
- LLM score
- final confidence score
- signal source
- recommendation
- LLM reason

#### `llm_request_logs`

Stores LLM request metadata:

- provider
- status
- request payload
- response payload
- error message
- timeout
- duration

#### `audit_logs`

The schema includes an audit log table for future expansion. The current implementation prepares the data model, but an audit-log endpoint is not exposed yet.

## API Documentation

Swagger documentation is available at:

```text
http://localhost:3000/docs
```

All application API routes use the global `/api` prefix.

Example:

```text
POST http://localhost:3000/api/login
GET  http://localhost:3000/api/merchants?search=beta
```

## Environment Variables

Create a `.env` file in the project root.

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/duplicate_detector?schema=public"
JWT_SECRET="replace-with-a-secure-secret"
JWT_EXPIRES_IN="1d"
OPENAI_API_KEY="your-openai-api-key"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TIMEOUT_MS="10000"
PORT="3000"
```

### Notes

- `DATABASE_URL` is required.
- `JWT_SECRET` has a development fallback, but a real value should always be provided outside local experiments.
- `OPENAI_API_KEY` is optional. If it is not configured, the API still works using deterministic duplicate detection only.
- `OPENAI_MODEL` defaults to `gpt-4o-mini`.
- `OPENAI_TIMEOUT_MS` defaults to `10000` milliseconds.

## Getting Started

### Prerequisites

- Node.js
- npm
- PostgreSQL
- An OpenAI API key, optional but recommended for full LLM second-opinion behavior

### Install Dependencies

```bash
npm install
```

## Database Setup

Create a PostgreSQL database, then update `DATABASE_URL` in `.env`.

Generate Prisma client:

```bash
npx prisma generate
```

Run migrations locally:

```bash
npx prisma migrate dev
```

For production-like environments:

```bash
npx prisma migrate deploy
```

## Seed Data

The seed script creates:

- A seed admin user
- Multiple merchant records with realistic near-duplicate and non-duplicate names

Run:

```bash
npm run db:seed
```

Seed admin credentials:

```text
Email:    admin@similarmatch.local
Password: AdminSeed123!
```

Seeded merchant password:

```text
StrongPassword123
```

The seed data includes examples like:

- `Beta Foods Limited`
- `BetaFoods Ltd`
- `Beta Foods Nigeria Limited`
- `Green Energy Solutions`
- `Green Agro Services`
- `Zenith Tech Services`
- `Zenith Technologies Ltd`

This makes it easier to test both near-duplicate and clearly different merchant scenarios.

## Running the Application

Development mode:

```bash
npm run start:dev
```

Standard mode:

```bash
npm run start
```

Production mode after build:

```bash
npm run build
npm run start:prod
```

Default local server:

```text
http://localhost:3000
```

Swagger docs:

```text
http://localhost:3000/docs
```

## API Usage Examples

### 1. Register Admin

```bash
curl -X POST http://localhost:3000/api/auth-admin/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Seed",
    "lastName": "Admin",
    "email": "admin@example.com",
    "password": "StrongPassword123",
    "role": "ADMIN"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "StrongPassword123"
  }'
```

Example response:

```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

Use the returned token as:

```text
Authorization: Bearer <accessToken>
```

### 3. Register Merchant

```bash
curl -X POST http://localhost:3000/api/merchants/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "BetaFoods Ltd",
    "email": "contact@betafoods-new.com",
    "password": "StrongPassword123",
    "role": "MERCHANT",
    "phoneNumber": "+2348012345678",
    "cacNumber": "RC1234567",
    "address": "12 Example Street, Lagos"
  }'
```

Example response:

```json
{
  "message": "Merchant registered and pending admin verification",
  "merchant": {
    "id": "uuid",
    "businessName": "BetaFoods Ltd",
    "status": "PENDING_REVIEW"
  }
}
```

The duplicate-check result is stored internally and is available to admins through the merchant detail endpoint.

### 4. Search Merchants

Admin only.

```bash
curl "http://localhost:3000/api/merchants?search=beta" \
  -H "Authorization: Bearer <admin-token>"
```

Example response:

```json
[
  {
    "merchantId": "uuid",
    "businessName": "Beta Foods Limited",
    "status": "VERIFIED",
    "email": "betafoods.ltd@example.com",
    "createdAt": "2026-05-20T10:00:00.000Z"
  }
]
```

### 5. Get Merchant Details With Duplicate Analysis

Admin only.

```bash
curl http://localhost:3000/api/merchants/<merchant-id> \
  -H "Authorization: Bearer <admin-token>"
```

Example response shape:

```json
{
  "merchant": {
    "id": "uuid",
    "businessName": "BetaFoods Ltd",
    "normalizedBusinessName": "betafoods",
    "email": "contact@betafoods-new.com",
    "phoneNumber": "+2348012345678",
    "cacNumber": "RC1234567",
    "address": "12 Example Street, Lagos",
    "status": "PENDING_REVIEW",
    "createdAt": "2026-05-20T10:00:00.000Z"
  },
  "duplicateCheck": {
    "status": "COMPLETED",
    "llmStatus": "COMPLETED",
    "deterministicThreshold": 0.6,
    "deterministicWeight": 0.65,
    "llmWeight": 0.35,
    "totalCandidatesChecked": 30,
    "candidatesAboveThreshold": 3,
    "candidatesSentToLlm": 3,
    "candidates": [
      {
        "candidateMerchantId": "uuid",
        "candidateMerchant": {
          "id": "uuid",
          "businessName": "Beta Foods Limited",
          "status": "VERIFIED",
          "email": "betafoods.ltd@example.com"
        },
        "deterministicScores": {
          "levenshteinScore": 0.88,
          "trigramScore": 0.93,
          "jaroWinklerScore": 0.92,
          "deterministicScore": 0.91
        },
        "llmScore": 0.84,
        "finalConfidenceScore": 0.89,
        "signal": "BOTH",
        "recommendation": "LIKELY_DUPLICATE",
        "llmStatus": "COMPLETED",
        "llmReason": "The names share the same core business tokens and differ mainly by spacing and suffix."
      }
    ]
  }
}
```

### 6. Verify Merchant

Admin only.

```bash
curl -X POST http://localhost:3000/api/merchants/<merchant-id>/verify \
  -H "Authorization: Bearer <admin-token>"
```

Example response:

```json
{
  "message": "Merchant verified successfully",
  "merchant": {
    "id": "uuid",
    "businessName": "BetaFoods Ltd",
    "status": "VERIFIED",
    "verifiedAt": "2026-05-20T10:15:00.000Z",
    "verifiedByUserId": "admin-user-id"
  }
}
```

### 7. Merchant Login After Verification

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contact@betafoods-new.com",
    "password": "StrongPassword123"
  }'
```

Unverified merchants receive a forbidden response until an admin verifies them.

## Testing

Run unit tests:

```bash
npm run test
```

Run end-to-end tests:

```bash
npm run test:e2e
```

Run test coverage:

```bash
npm run test:cov
```

### Important Test Scenarios

The system should be tested around the following behavior:

1. **Near-duplicate is flagged**
   - Existing merchant: `Beta Foods Limited`
   - New merchant: `BetaFoods Ltd`
   - Expected result: duplicate candidate returned with deterministic score greater than or equal to `0.60`.

2. **Clearly different merchant is not flagged**
   - Existing merchant: `Beta Foods Limited`
   - New merchant: `Green Energy Solutions`
   - Expected result: no duplicate candidate returned below the duplicate threshold.

3. **Protected route rejects missing JWT**
   - Endpoint: `GET /api/merchants`
   - Expected result: `401 Unauthorized`.

4. **Admin can verify merchant**
   - Create merchant.
   - Login as admin.
   - Call `POST /api/merchants/:id/verify`.
   - Expected result: merchant status changes to `VERIFIED`.

5. **OpenAI failure fallback works**
   - Disable or mock OpenAI failure.
   - Expected result: deterministic results are still stored and returned; API does not crash.

## Key Trade-Offs

### 1. Deterministic First, LLM Second

The system does not use the LLM as the primary duplicate detector. Deterministic algorithms first shortlist candidates, and OpenAI only reviews those shortlisted candidates.

This reduces:

- Cost
- Latency
- Data exposure
- Randomness
- Risk of hallucinated matches

### 2. Admin Review Instead of Auto-Rejection

The system recommends possible duplicates but does not automatically reject merchants. This is important because false positives can block legitimate businesses.

The API is therefore designed as a decision-support system for admins, not a fully automated rejection engine.

### 3. Stored Duplicate Results

Duplicate-check results are stored in the database so admins can review them later without recomputing every time.

When a merchant detail request is made, the service checks whether the stored result is still current. If a newer merchant was created after the last computation, the system may recompute the duplicate check.

### 4. Name-Only Matching for the MVP

The first version focuses mainly on merchant business name matching. Other signals such as CAC number, email, phone number, address, and domain name are useful future improvements but are not required for the first implementation.

### 5. Public Merchant Registration, Admin Verification

Merchant registration is public so anyone can submit a merchant profile. However, merchants cannot log in until admin verification is complete.

This keeps onboarding open while still preserving operational control.

## Reliability and Fallback Strategy

OpenAI is helpful but not required for the core system to work.

If OpenAI is unavailable, disabled, times out, or returns invalid output:

- Merchant registration still succeeds.
- Deterministic duplicate detection still runs.
- Duplicate candidates can still be stored.
- The LLM status records the reason, such as `SKIPPED_DISABLED`, `FAILED`, or `TIMEOUT`.
- Final confidence falls back to the deterministic score.

This ensures the duplicate detector degrades gracefully instead of failing the merchant onboarding flow.

## Security Notes

- Protected routes require JWT Bearer authentication.
- Admin-only routes are protected with role-based guards.
- Passwords are hashed using a salted `scrypt` flow.
- JWT secrets and OpenAI keys must be stored in environment variables.
- DTO validation uses whitelist mode and rejects non-whitelisted fields.
- Merchants cannot log in until their status is `VERIFIED`.

## Current Limitations

- There is no frontend/admin dashboard in this version.
- The audit log data model exists, but the audit-log endpoint is not currently exposed.
- Duplicate detection currently focuses on business name similarity as the primary matching signal.
- The OpenAI layer depends on `OPENAI_API_KEY`; without it, the system uses deterministic matching only.
- There is no queue/background worker yet; duplicate detection currently runs during the registration/detail flow.
- Rate limiting is not currently implemented.

## What I Would Do With Another 8 Hours

1. **Move duplicate detection to a background job**

   Merchant registration should respond immediately, then a worker can compute deterministic and LLM duplicate results asynchronously. This would improve perceived frontend response time and make the system more scalable.

2. **Add automatic verification when no duplicate is found**

   If deterministic and LLM checks return no likely duplicate above the threshold, the system could automatically verify the merchant or mark them as low-risk for faster admin approval.

3. **Add merchant notification email**

   When possible duplicates are detected, the admin could send an email notifying the merchant that their registration is under review because similar records already exist.

4. **Add multi-signal duplicate detection**

   Business name is useful, but future versions should also score:

   - CAC number
   - Email
   - Phone number
   - Address
   - Business domain

5. **Expose audit logs**

   The schema already includes audit-log support. I would expose `GET /api/merchants/:id/audit-log` and write audit records for merchant creation, duplicate-check runs, LLM failures, and verification events.

6. **Add rate limiting**

   Merchant registration and duplicate-check flows should be rate-limited to prevent OpenAI abuse and reduce spam registrations.

7. **Add stronger tests**

   I would expand the test suite with integration tests for duplicate detection, admin verification, merchant login restriction, OpenAI fallback, and role-based access control.

8. **Optimize database-level similarity search**

   PostgreSQL `pg_trgm` and a GIN index on `normalized_business_name` would improve candidate lookup when the merchant dataset becomes larger.

## AI-Assisted Development Reflection

AI assistance was useful for quickly exploring architecture options, reasoning about duplicate-detection trade-offs, shaping README sections, and reviewing whether the deterministic-first plus LLM-second-opinion approach was sensible.

Where it helped:

- Breaking down the problem into modules
- Comparing duplicate-detection strategies
- Structuring response formats
- Thinking through edge cases such as LLM failure and false positives
- Drafting documentation sections

Where it could hurt if used carelessly:

- It can encourage over-engineering beyond the actual project scope.
- It can suggest features that are useful later but unnecessary for the first working version.
- It can produce confident but inaccurate implementation details if not checked against the actual codebase.

The practical approach was to use AI as a thinking and drafting assistant, while keeping final engineering decisions grounded in the source code, database schema, and project requirements.

## License

This project is currently unlicensed/private unless a license is added later.
