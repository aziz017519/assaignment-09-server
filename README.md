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
| `npm test` | Run unit and route tests |

## Environment variables

Names only (see `.env.example` for the template; never commit `.env`):

`PORT`, `MONGODB_URI`, `DB_NAME`, `JWT_SECRET`, `BETTER_AUTH_SECRET`, `CLIENT_URL`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `IMGBB_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV`.

- `NEXT_PUBLIC_APP_URL` is the client origin used for Stripe redirect URLs (defaults to `CLIENT_URL`).
- `STRIPE_PRO_PRICE_ID` is the **recurring** Price used by the technician Pro Checkout session.

## API overview

All responses are JSON: success `{ "success": true, "data": ... }`, errors `{ "success": false, "message": "..." }`.

### Public

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/` | Health check |
| GET | `/api/services` | `search`, `category`, `serviceMode`, `sort=price_asc\|price_desc\|newest`, `page`, `limit` (use `limit=6` for home featured) |
| GET | `/api/services/:id` | Approved + available services only |
| POST | `/api/users/signup` | Server-side signup: only `technician` is honoured, every other role becomes `customer`; admin is seed-only |
| POST | `/api/webhook/stripe` | Raw body, Stripe signature verified |

### Customer (`verifyToken`, `verifyCustomer`)

| Method | Endpoint |
|---|---|
| POST | `/api/bookings` |
| GET | `/api/bookings/my` |
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
| GET | `/api/subscription` | Current plan, service usage, renewal date and Stripe price |
| GET | `/api/subscription/payments` | Booking + Pro subscription payments for this technician |
| POST | `/api/subscription/checkout` | Start a Pro Checkout Session; returns `{ url }` |
| POST | `/api/subscription/portal` | Stripe Billing Portal session; returns `{ url }` |

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

## Pro Technician Plan (technicians only)

- Free technicians can publish at most **3** services. `POST /api/services` returns `403` with `code: "PLAN_LIMIT_REACHED"` once the limit is reached. Pro technicians are unlimited.
- Cancelling/expiring Pro sets `plan` back to `free`. Existing services are **kept**; new additions are blocked while at or above 3.
- Stripe is the source of truth. The success redirect never changes the plan; only signature-verified webhooks do:
  - `checkout.session.completed` → `plan = 'pro'` plus Stripe customer/subscription IDs
  - `invoice.payment_succeeded` → one idempotent `payments` row with `type = 'subscription'`, plus `planExpiresAt`
  - `invoice.payment_failed` → logged only
  - `customer.subscription.deleted` / `updated` (`canceled`, `unpaid`) → `plan = 'free'`
- Customer payment queries always filter `type = 'booking'`; Stripe identifiers are never returned to customers.
- Checkout redirects to the shared success pages (`/dashboard/customer/payments/success` and `/dashboard/technician/subscription/success`). Those pages call `GET /api/payments/verify`, which only reads Stripe + DB state and never upgrades a plan or marks a booking paid.
- Backfill existing data with `npm run migrate:pro-plan` (idempotent; also reconciles partial unique indexes and fills legacy payment fields).

### Status rules

`requested → accepted | rejected | cancelled`, `accepted → in-progress`, `in-progress → completed` (requires `finalAmount > 0`). Only Stripe can mark a completed booking as paid. Invalid transitions return 400; ownership failures return 403.

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
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET`, create a recurring Price (`price_...`, not `prod_...`) and set its ID as `STRIPE_PRO_PRICE_ID`, then sign in as a technician and start checkout. Use test card `4242 4242 4242 4242` with any future expiry and any CVC. `checkout.session.completed` upgrades the account; the first `invoice.payment_succeeded` records the subscription payment and renewal date. The client redirects to `/dashboard/technician/subscription/success?session_id=...` (bookings use `/dashboard/customer/payments/success?session_id=...`). The success page polls the read-only verify endpoint every 2 seconds for up to ~30 seconds while the webhook catches up. Refreshing the page, using a missing/wrong session ID, and opening another user's session ID are all handled by the same page.

## npm packages

Packages: `@better-auth/utils`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `mongodb`, `stripe`, `zod`.

No TypeScript build step: the server runs directly as native ES modules with Node.js.

## Deployment checklist

- [ ] All environment variables are set on the host; `.env` is not committed.
- [ ] Production client domain is in `CLIENT_URL`/CORS and in BetterAuth `trustedOrigins`.
- [ ] Stripe webhook `https://<server>/api/webhook/stripe` registered in test mode; signing secret set.
- [ ] No CORS / 404 / 504 errors from the client.
- [ ] MongoDB Atlas network access allows the host (`0.0.0.0/0` for serverless).
- [ ] 401 without token and 403 with wrong role verified manually.
- [ ] Invalid status transitions and payment gate rejections verified manually.
- [ ] Success page + webhook together create only one payment.
- [ ] Seed data is live and demo accounts work.
