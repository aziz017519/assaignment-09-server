# AGENT.md — FixMate Server (Backend)

Instructions for AI coding agents working on the **FixMate** backend.
Read this fully before writing any code. Follow it strictly.

---

## 1. Project Summary

**FixMate** is an on-demand Smart Device & Home Appliance Repair Service Booking Platform. This repo is the **server only** (Express + MongoDB). The Next.js client is a separate repo.

Roles: **Customer**, **Technician**, **Admin**.
Flow: Technician adds service (pending) → Admin approves → Customer sends repair request → Technician moves job through the status pipeline → Customer pays via Stripe only after completion.

## 2. Tech Stack

| Area | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript (preferred) or JavaScript |
| Database | MongoDB (native driver or Mongoose, pick one) |
| Auth | JWT verification (tokens issued from the BetterAuth session) + role-based middlewares |
| Payment | Stripe (Checkout + Webhook, **test mode only**) |
| Others | cors, dotenv, helmet, morgan (optional), zod (request validation) |

Keep dependencies minimal and list every package in README.md.

## 3. Environment Variables (`.env`)

Never hard-code secrets. Never commit `.env`. Provide `.env.example`.

```
PORT=5000
MONGODB_URI=
DB_NAME=
JWT_SECRET=
BETTER_AUTH_SECRET=
CLIENT_URL=                    # production client origin (CORS)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
IMGBB_API_KEY=                 # only if the server ever uploads images
ADMIN_EMAIL=                   # for seed script
ADMIN_PASSWORD=
```

## 4. Folder Structure

```
src/
  server.ts / index.js         # app bootstrap, CORS, routes, error handler
  config/
    db.ts                      # MongoDB connection + collection getters + indexes
    stripe.ts
    env.ts                     # validated env
  middlewares/
    verifyToken.ts
    verifyCustomer.ts
    verifyTechnician.ts
    verifyAdmin.ts
    errorHandler.ts
    validate.ts                # zod middleware
  routes/
    services.routes.ts
    bookings.routes.ts
    payments.routes.ts
    admin.routes.ts
    users.routes.ts
    webhook.routes.ts
  controllers/                 # one file per route group
  utils/
    statusRules.ts             # allowed status transitions
    objectId.ts                # safe ObjectId parsing
  seed/
    seed.ts                    # admin, technicians, customer, 12+ services, bookings
```

## 5. Database Design (exactly 4 own collections)

BetterAuth auto-creates `session`, `account`, `verification` (not counted). Its `user` collection is our **users** collection.

### users
`_id, name, email (unique), image, role ('customer'|'technician'|'admin', default 'customer'), phone, area, bio`

### services
`_id, title, category, description, image, basePrice (Number), estimatedDuration, serviceMode ('Home Visit'|'Shop Drop-off'), serviceArea, technicianName, technicianEmail, approvalStatus ('pending'|'approved'|'rejected', default 'pending'), isAvailable (Boolean, default true), createdAt (Date)`

Categories: `Smartphone | Laptop & PC | AC | Refrigerator | TV | Washing Machine | Electrical`

### bookings
`_id, serviceId, serviceTitle, serviceImage, category, basePrice, technicianName, technicianEmail, customerName, customerEmail, customerPhone, address, preferredDate (Date), problemDescription, status ('requested'|'accepted'|'rejected'|'in-progress'|'completed'|'cancelled', default 'requested'), finalAmount (default = basePrice), paymentStatus ('unpaid'|'paid', default 'unpaid')`
(Optional: `statusHistory: [{status, changedAt}]`, `rating`, `review`.)

### payments
`_id, bookingId, serviceTitle, customerName, customerEmail, technicianName, technicianEmail, amount, currency ('usd'), transactionId (payment_intent), stripeSessionId (UNIQUE), paymentStatus ('paid'), paidAt (Date)`

### Required indexes
- `users.email` unique
- `payments.stripeSessionId` unique (prevents double-saving)
- `payments.bookingId` unique (one payment per booking)
- `services`: compound on `{ approvalStatus, isAvailable, createdAt }`, plus text/regex-friendly fields `title`, `category`
- `bookings`: `customerEmail`, `technicianEmail`, `{ serviceId, customerEmail, status }`

### Relationships
- `services.technicianEmail = users.email`
- `bookings.serviceId = services._id`
- `bookings.customerEmail / technicianEmail = users.email`
- `payments.bookingId = bookings._id`

## 6. Authentication & Middlewares (Challenge 2)

Implement custom middlewares in `middlewares/`:

| Middleware | Behavior |
|---|---|
| `verifyToken` | Reads `Authorization: Bearer <token>`. Missing/invalid/expired → **401 Unauthorized**. On success sets `req.user = { email, ... }`. |
| `verifyCustomer` | Loads user by `req.user.email` from DB; role must be `customer` else **403 Forbidden**. |
| `verifyTechnician` | Role must be `technician` else **403**. |
| `verifyAdmin` | Role must be `admin` else **403**. |

Rules:
- **Always read the role from the database**, never trust a role sent by the client or stored only in the token.
- **Always use `req.user.email` for ownership**, never an email from the URL/body. A customer must not be able to read another customer's bookings by changing params.
- Order: `verifyToken` first, then the role middleware.

### Route ↔ middleware map

| API | Middlewares |
|---|---|
| `POST /api/bookings`, `PATCH /api/bookings/:id/cancel`, `GET /api/bookings/my`, `POST /api/payments/create-checkout-session`, `GET /api/payments/verify`, `GET /api/payments/my` | `verifyToken, verifyCustomer` |
| `POST /api/services`, `PATCH /api/services/:id`, `DELETE /api/services/:id`, `GET /api/services/my`, `PATCH /api/services/:id/availability`, `GET /api/bookings/technician`, `PATCH /api/bookings/:id/status` | `verifyToken, verifyTechnician` |
| `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/services/:id/approval`, `GET /api/admin/services`, `GET /api/admin/bookings`, `GET /api/admin/payments`, `GET /api/admin/stats` | `verifyToken, verifyAdmin` |
| `PATCH /api/users/profile`, `GET /api/users/me` | `verifyToken` |
| `GET /api/services`, `GET /api/services/:id` | Public |
| `POST /api/webhook/stripe` | Public, verified by Stripe signature (raw body) |

## 7. Business Rules (all enforced on the SERVER)

1. Sign-up role: only `customer` or `technician` allowed. Anything else (including `admin`) is saved as `customer`. Admin is created only by the seed script/database.
2. New service → `approvalStatus: 'pending'`, `isAvailable: true`. `technicianName/Email` come from the logged-in user, not the request body.
3. Public endpoints return only `approvalStatus === 'approved' && isAvailable === true`. `GET /api/services/:id` returns 404 for non-approved/unavailable services.
4. Technician edit of a service → `approvalStatus` resets to `'pending'`. Technician can only edit/delete/toggle **own** services (match `technicianEmail`).
5. Booking creation (customer only):
   - Technician/admin → 403.
   - Service must exist, be approved and available.
   - Technician cannot request own service (`technicianEmail === customerEmail`).
   - **No duplicate active booking**: if the same `customerEmail` + `serviceId` has status `requested|accepted|in-progress` → **409** with message "You already have an active request for this service".
   - Copy service/technician info from the DB service (never trust client-sent price/title). Set `status: 'requested'`, `paymentStatus: 'unpaid'`, `finalAmount = basePrice`.
   - Validate: phone, address, `preferredDate` is today or future, `problemDescription` ≥ 20 chars.
6. Technician sees/updates only bookings where `technicianEmail === req.user.email`. Customer sees only own bookings.
7. Admin cannot change their own role.

## 8. Job Status Pipeline (Challenge 3)

Centralize in `utils/statusRules.ts`:

| Current | Next | Who | Extra rule |
|---|---|---|---|
| requested | accepted | Technician (owner) | — |
| requested | rejected | Technician (owner) | final |
| requested | cancelled | Customer (owner) | final |
| accepted | in-progress | Technician (owner) | — |
| in-progress | completed | Technician (owner) | body must include `finalAmount` (number > 0) |
| completed + unpaid | paymentStatus `paid` | Stripe only | once per booking |

Implementation notes:
- `PATCH /api/bookings/:id/status` body: `{ status, finalAmount? }`. Load booking, check `technicianEmail === req.user.email` (else 403), check transition is allowed (else **400**), validate `finalAmount` when completing.
- Use an atomic conditional update: `updateOne({ _id, status: currentStatus, technicianEmail }, { $set: ... })` to avoid race conditions.
- `PATCH /api/bookings/:id/cancel`: owner customer only, only when `status === 'requested'`.
- Any other change (e.g. requested → completed, editing a cancelled job, technician setting `paid`) → reject with 400/403.
- Clients can **never** set `paymentStatus` directly.
- (Optional) push `{ status, changedAt }` into `statusHistory` on each change.

## 9. Stripe Payment

Test mode only.

### Create session — `POST /api/payments/create-checkout-session`
- Body: `{ bookingId }` only.
- Load booking from DB. Require: owned by `req.user.email`, `status === 'completed'`, `paymentStatus === 'unpaid'`. Otherwise 403/400.
- Create Checkout Session: `mode: 'payment'`, `unit_amount = Math.round(finalAmount * 100)`, `currency: 'usd'`, `success_url = CLIENT_URL/payment/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = CLIENT_URL/payment/cancel`, `metadata: { bookingId, customerEmail }`.
- Never use any amount from the client.
- Return `{ url }`.

### Verify — `GET /api/payments/verify?session_id=...`
- Retrieve session from Stripe. Confirm `payment_status === 'paid'` and `metadata.customerEmail === req.user.email`.
- Save payment via a shared **idempotent** function `savePaymentOnce(session)`:
  - If a payment with the same `stripeSessionId` (or `bookingId`) already exists → return it, do not insert again.
  - Else insert into `payments` and set booking `paymentStatus: 'paid'` (condition: still `unpaid`).
- Return amount + transactionId for the success page.

### Webhook — `POST /api/webhook/stripe` (Challenge 4)
- Mount **before** `express.json()` using `express.raw({ type: 'application/json' })`.
- Verify with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`; bad signature → 400.
- Handle `checkout.session.completed` → call the same `savePaymentOnce(session)`.
- Always respond 200 quickly after handling (Stripe retries on failure). Duplicate events must not create duplicate payments (unique index on `stripeSessionId` + idempotent function; catch duplicate-key errors and treat as success).
- Register the deployed webhook URL in the Stripe Dashboard (test mode) and put the signing secret in `.env`.

## 10. Server-Side Search, Filter, Sort (Challenge 1)

`GET /api/services` query params: `search`, `category`, `serviceMode`, `sort` (`price_asc | price_desc | newest`), optional `page`, `limit`.

- Base filter: `{ approvalStatus: 'approved', isAvailable: true }`.
- `search`: case-insensitive regex on `title` and `category` (escape regex special characters from user input to prevent regex injection).
- `category`, `serviceMode`: exact match, validated against allowed values.
- `sort`: `price_asc → { basePrice: 1 }`, `price_desc → { basePrice: -1 }`, default `newest → { createdAt: -1 }`. Add `_id` as tiebreaker.
- Optional pagination: `.skip((page-1)*limit).limit(limit)` and return `{ data, total, page, totalPages }`.
- Home featured: `limit=6` newest (`.sort({ createdAt: -1 }).limit(6)`).

## 11. Admin APIs

- `GET /api/admin/users` — all users.
- `PATCH /api/admin/users/:id/role` — body `{ role }` in `customer|technician|admin`; reject if target is the requesting admin (403/400).
- `GET /api/admin/services?approvalStatus=` — all services, optional filter.
- `PATCH /api/admin/services/:id/approval` — body `{ approvalStatus: 'approved'|'rejected' }`.
- `GET /api/admin/bookings?status=` — all bookings, optional filter.
- `GET /api/admin/payments` — all payments + total revenue.
- `GET /api/admin/stats` — counts for dashboard cards/charts.

Role-specific stats endpoints (customer/technician overview counts and chart data) must compute from `req.user.email` only.

## 12. Response & Error Conventions

- JSON everywhere. Success: `{ success: true, data, message? }`. Error: `{ success: false, message }`.
- Status codes: `200/201` ok, `400` validation/invalid transition, `401` no/invalid token, `403` wrong role/not owner, `404` not found, `409` duplicate active request, `500` unexpected.
- Central `errorHandler` middleware; never leak stack traces or secrets in production.
- Validate every body/query/param (zod). Validate `ObjectId` before querying (invalid id → 400/404, not a crash).
- Never return sensitive fields. Never log secrets or tokens.
- Use `$set` with an explicit allow-list of fields on updates (no mass assignment: client must not be able to set `role`, `approvalStatus`, `paymentStatus`, `technicianEmail`, etc.).

## 13. CORS & Security

- CORS allowed origins: production client URL (`CLIENT_URL`) + `http://localhost:3000` for dev. Allow `Authorization` header and needed methods. Use `credentials: true` only if cookies are used.
- Use `helmet`. Add a simple rate limit on auth-sensitive routes if time permits.
- Server must not throw CORS / 404 / 504 errors in production. Add a `GET /` health route returning a simple message and a JSON 404 fallback for unknown routes.
- Reuse a single MongoDB connection (important for serverless deployment such as Vercel: cache the client, do not reconnect per request).

## 14. Seed Script

`npm run seed` should create (idempotent, safe to re-run):
- 1 admin (from env), 2+ technicians, 2+ customers (users must also be creatable by BetterAuth; if seeding directly, make sure password hashing matches BetterAuth, or create them through the BetterAuth API).
- 12+ approved, available services across all 7 categories, realistic titles/prices/images.
- A few pending and rejected services.
- Bookings in different statuses (requested, accepted, in-progress, completed unpaid, completed paid, rejected, cancelled) with matching `payments` documents for paid ones.

## 15. Code Conventions

- Thin routes, logic in controllers, reusable helpers in `utils`.
- `async/await` with a wrapper (`asyncHandler`) so errors reach the error handler.
- Consistent naming, no dead code, no `console.log` debug leftovers (a startup log is fine).
- Money: store numbers, convert to cents only for Stripe (`Math.round`).
- Dates: store as `Date` objects, not strings.

## 16. Git & Commit Rules

- **Minimum 12 meaningful commits** with descriptive messages (Conventional Commits):
  - `chore: initialize express server with cors and dotenv`
  - `feat: add mongodb connection and collection indexes`
  - `feat: implement verifyToken and role middlewares`
  - `feat: add services CRUD with ownership checks`
  - `feat: add server-side search, filter and sort for services`
  - `feat: enforce booking status pipeline with atomic updates`
  - `feat: add stripe checkout session creation`
  - `feat: add idempotent payment verification and webhook`
  - `feat: add admin routes for users, approvals and transactions`
  - `chore: add seed script and .env.example`
- One logical change per commit.

## 17. README.md Must Include

Project name, purpose, live server URL, key features, API overview, env variable list (names only), npm packages used, admin/technician/customer test credentials, and the client repo link.

## 18. Deployment Checklist

- [ ] All env vars set on the host (Vercel/Render/Railway). `.env` not committed.
- [ ] Production client domain in CORS allowed origins **and** in BetterAuth `trustedOrigins`.
- [ ] Stripe webhook endpoint (`https://<server>/api/webhook/stripe`) added in Stripe Dashboard (test mode); signing secret in `.env`.
- [ ] No CORS / 404 / 504 errors from the client.
- [ ] MongoDB Atlas network access allows the host (0.0.0.0/0 for serverless).
- [ ] 401 without token, 403 with wrong role, verified manually (Postman/curl).
- [ ] Status pipeline rejects invalid transitions; payment gate rejects non-completed/paid/other-customer bookings.
- [ ] Duplicate payment test: success page + webhook together create only one payment.
- [ ] Seed data live and test accounts work.

## 19. Definition of Done (per endpoint)

1. Correct middleware chain and status codes (401 / 403 / 400 / 404 / 409).
2. Ownership and role checked using DB + `req.user`, never client input.
3. Input validated, allow-listed fields only.
4. Business rules enforced server-side.
5. Tested with at least one success and one failure case.
6. Committed with a descriptive message.