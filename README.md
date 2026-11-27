# FixMate Server

Backend API for **FixMate**, an on-demand smart device and home appliance repair service booking platform. Customers discover approved services, request repairs, track the job status pipeline, and pay through Stripe only after a technician completes the work. Technicians manage their own services and jobs; admins approve services and oversee the platform.

- **Live server URL:** `https://fixmate-api.onrender.com` (replace with the deployed URL)
- **Client repository:** `https://github.com/<your-org>/fixmate-client` (replace with the real client repo link)
- **Runtime:** Node.js + Express + JavaScript (ESM) + MongoDB + Stripe (test mode)

## Key features

- JWT bearer authentication with BetterAuth-compatible secrets and session-token fallback.
- Database-backed role checks: customer, technician, admin. Ownership always comes from `req.user.email`.
- Service marketplace with server-side search, category/mode filters, sorting and pagination.
- Technician service CRUD with ownership checks and admin approval workflow.
- Booking status pipeline with atomic conditional updates and duplicate active-request protection.
- Stripe Checkout sessions, read-only payment verification, and signature-verified webhook.
- Admin dashboard APIs for users, approvals, bookings, payments and aggregate statistics.
- Role-specific customer/technician statistics computed only from the authenticated user's email.
- Idempotent seed script with demo accounts, services, bookings and payments.

## Getting started

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# fill in MongoDB, JWT/BetterAuth secrets and Stripe test keys
npm run seed              # optional, loads demo data
npm run dev               # http://localhost:5000
```

Useful scripts:

| Script | Description |
|---|---|
| `npm run dev` | Start with `node --watch` |
| `npm start` | Start once |
| `npm run build` | Syntax-check the entry point |
| `npm run seed` | Seed idempotent demo data |
| `npm run cleanup:pro-plan` | Optional legacy-field cleanup; dry run by default, add `-- --apply` to write |
| `npm run migrate:ratings` | Rebuild service rating aggregates from reviewed bookings (idempotent) |
| `npm test` | Run unit and route tests |

## Environment variables

Names only (see `.env.example` for the template; never commit `.env`):

`PORT`, `MONGODB_URI`, `DB_NAME`, `JWT_SECRET`, `BETTER_AUTH_SECRET`, `CLIENT_URL`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IMGBB_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV`.

- `NEXT_PUBLIC_APP_URL` is the client origin used for Stripe redirect URLs (defaults to `CLIENT_URL`).

## API overview

JSON responses use success `{ "success": true, "data": ... }` and errors `{ "success": false, "message": "..." }`. The invoice endpoint is the only binary response (`application/pdf`).

### Public

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/services` | `search`, `category`, `serviceMode`, `sort=price_asc\|price_desc\|newest\|rating_desc`, `page`, `limit` (use `limit=6` for home featured). Every service includes `averageRating` and `ratingCount` |
| GET | `/api/services/:id` | Approved + available services only; includes `averageRating` and `ratingCount` |
| GET | `/api/services/:id/reviews` | Public reviews for approved + available services; `page`, `limit`, newest first, first-name-only `customerName` |
| POST | `/api/users/signup` | Server-side signup: only `technician` is honoured, every other role becomes `customer`; admin is seed-only |
| POST | `/api/webhook/stripe` | Raw body, Stripe signature verified |

### Customer (`verifyToken`, `verifyCustomer`)

| Method | Endpoint |
|---|---|
| POST | `/api/bookings` |
| GET | `/api/bookings/my` | Adds `rating`, `review`, `reviewedAt` and `canReview` to each booking |
| POST | `/api/bookings/:id/review` | Paid bookings only, one review per booking |
| GET | `/api/bookings/:id/invoice` | PDF receipt for a paid booking (`application/pdf`) |
| PATCH | `/api/bookings/:id/cancel` |
| POST | `/api/payments/create-checkout-session` |
| GET | `/api/payments/my` |

### Technician (`verifyToken`, `verifyTechnician`)

| Method | Endpoint |
|---|---|
| POST | `/api/services` |
| PATCH | `/api/services/:id` |
| DELETE | `/api/services/:id` |
| GET | `/api/services/my` |
| PATCH | `/api/services/:id/availability` |
| GET | `/api/bookings/technician` |
| PATCH | `/api/bookings/:id/status` |

### Admin (`verifyToken`, `verifyAdmin`)

| Method | Endpoint |
|---|---|
| GET | `/api/admin/users` |
| PATCH | `/api/admin/users/:id/role` |
| GET | `/api/admin/services?approvalStatus=` |
| PATCH | `/api/admin/services/:id/approval` |
| GET | `/api/admin/bookings?status=` |
| GET | `/api/admin/payments` |
| GET | `/api/admin/stats` |

### Any authenticated user

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/users/me` | Safe profile |
| PATCH | `/api/users/profile` | Allow-listed fields only |
| GET | `/api/users/stats` | Role-specific counts and six-month chart |
| GET | `/api/payments/verify?session_id=...` | Read-only Checkout Session verification; `metadata.userId` must match the authenticated user |

### Status rules

`requested → accepted | rejected | cancelled`, `accepted → in-progress`, `in-progress → completed` (requires `finalAmount > 0`). Only Stripe can mark a completed booking as paid. Invalid transitions return 400; ownership failures return 403.

### Ratings & invoices

- `POST /api/bookings/:id/review` accepts `{ "rating": 1-5, "review": "optional text (max 500)" }`, requires a paid booking owned by the caller, and allows exactly one review per booking. It stores `rating`, `review` (or `null`) and `reviewedAt` on the booking, increments the service's `ratingSum`/`ratingCount`, and returns `{ rating, review, reviewedAt, service: { averageRating, ratingCount } }`.
- Public service responses derive `averageRating` (rounded to one decimal, `0` when unrated) and `ratingCount` from the service aggregates; `sort=rating_desc` is available on `GET /api/services`.
- `GET /api/services/:id/reviews` returns only `rating`, `review`, `reviewedAt` and a first-name-only `customerName` (or `"Customer"`). Emails, user IDs and payment identifiers are never returned.
- `GET /api/bookings/:id/invoice` streams an in-memory PDF with a deterministic `invoice-<number>.pdf` filename. It is available only to the booking's customer and only after payment.

## Test credentials

Seeded with `npm run seed`:

| Role | Email | Password |
|---|---|---|
| Admin | value of `ADMIN_EMAIL` (default `admin@fixmate.test`) | value of `ADMIN_PASSWORD` (default `Admin@12345`) |
| Technician | `technician1@fixmate.test` | `Demo@12345` |
| Technician | `technician2@fixmate.test` | `Demo@12345` |
| Technician | `technician3@fixmate.test` | `Demo@12345` |
| Customer | `customer1@fixmate.test` | `Demo@12345` |
| Customer | `customer2@fixmate.test` | `Demo@12345` |

Sign in through the client's BetterAuth endpoint to obtain the bearer token. The server also accepts an opaque BetterAuth session token as a fallback.

## Testing Stripe locally

```bash
stripe listen --forward-to localhost:5000/api/webhook/stripe
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`, then sign in as a customer, complete a booking and start Checkout for it. Use test card `4242 4242 4242 4242` with any future expiry and any CVC. The signature-verified `checkout.session.completed` webhook records the booking payment exactly once. The client redirects to `/dashboard/customer/payments/success?session_id=...`. The success page polls the read-only verify endpoint every 2 seconds for up to ~30 seconds while the webhook catches up. Refreshing the page, using a missing/wrong session ID, and opening another user's session ID are all handled by the same page.

## npm packages

Packages: `@better-auth/utils`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `mongodb`, `pdfkit`, `stripe`, `zod`.

No TypeScript build step: the server runs directly as native ES modules with Node.js.

## Deployment checklist

- [ ] All environment variables are set on the host; `.env` is not committed.
- [ ] Production client domain is in `CLIENT_URL`/CORS and in BetterAuth `trustedOrigins`.
- [ ] Stripe webhook `https://<server>/api/webhook/stripe` registered in test mode for `checkout.session.completed`; signing secret set.
- [ ] No CORS / 404 / 504 errors from the client.
- [ ] MongoDB Atlas network access allows the host (`0.0.0.0/0` for serverless).
- [ ] 401 without token and 403 with wrong role verified manually.
- [ ] Invalid status transitions and payment gate rejections verified manually.
- [ ] Success page + webhook together create only one payment.
- [ ] `npm run migrate:ratings` has been run once after deploying (idempotent; no new env vars required).
- [ ] Seed data is live and demo accounts work.
