# Kotka security

How Kotka protects accounts, trading data and conversations, and how to report a problem. No secrets are kept in this file or anywhere in the repository.

## Reporting a vulnerability

Email the Kotka team at the support address shown on the sign-in help page, with "Security" in the subject. Include what you found, how to reproduce it, and what an attacker could do. Please don't access other people's data, disrupt the service or run automated scanners against production. We aim to reply within 3 working days.

## Authentication

- **Passwords** are hashed with bcrypt at cost 12 (`server/src/lib/passwords.js`). Older, cheaper hashes are upgraded automatically at the next sign-in. New passwords must be at least 8 characters, must not be a commonly breached password, and must not be built from the person's email or name.
- **Sign-in** always takes the same time and returns the same message whether or not the email exists.
- **Brute force:** failed sign-ins are counted per email and per IP in the database (`AuthAttempt`). After 8 failures for one email in 15 minutes (or 40 from one IP), sign-in pauses. Sign-ups are limited per IP per hour.
- **Two-step verification** (optional, strongly recommended for staff) uses an authenticator app (TOTP, RFC 6238). It lives in `server/src/lib/totp.js` and `server/src/routes/account.js`.
  - The secret is stored encrypted.
  - Each code works once: the last-used time step is recorded and updated atomically.
  - 10 single-use recovery codes are shown once and stored hashed.
  - After the password step, the server issues a 5-minute challenge token. It is signed with a key derived only for that purpose, so it can never be used as a session.
- **Password reset by email** (`server/src/routes/auth.js`, `server/src/lib/email/`):
  - "Forgot password?" emails a single-use link that works for 30 minutes.
  - The token exists only in the email; the database stores its SHA-256 hash. Asking again cancels older links.
  - The reply is identical whether or not the email has an account, and the email is sent after responding, so neither the answer nor its timing reveals who has an account.
  - Requests are limited to 3 per email per hour and 10 per IP per hour.
  - The new password must meet the usual rules; a weak one is refused without using up the link.
  - A successful reset changes the password, confirms the email and signs out every session, then emails the owner. Two-step verification still applies at the next sign-in.
- **Email confirmation:** sign-up sends a welcome email with a 48-hour single-use confirmation link (stored hashed). Unconfirmed accounts see a reminder, with a rate-limited resend. Sign-up also refuses addresses whose domain can't receive email (DNS check; any lookup error lets the sign-up through).
- **Security alerts** are emailed on: a sign-in from a device not seen on the account in the last 90 days, a password change or reset, and two-step verification being turned on or off.
- **Email delivery:** account emails come from `no-reply@kotkafinance.online` through Resend (domain verified, with SPF/DKIM handled by Resend). INBOX Notify is the backup. Emails contain no tracking pixels or remote images, and every value in them is escaped. The INBOX API only signs in with the INBOX account email and password; they are stored encrypted in Connected services like every other key.
- **Newsletter:** opt-in only (unticked at sign-up, switchable in Settings). Opted-in addresses are added to the INBOX list chosen in Connected services and removed when someone opts out or deletes their account.

## Sessions

- The session cookie `kotka_session` is `HttpOnly`, `SameSite=Lax` and `Secure` in production. It holds a signed JWT (HS256 only; `alg: none` and other algorithms are refused) with the user id and a random session id.
- Every sign-in creates a new row in the `Session` table. Only a SHA-256 hash of the session id is stored.
- Sessions are checked on every request (cached for 30 seconds per server instance) and can be revoked:
  - **Signing out** revokes that session.
  - **Changing the password** revokes every other session; **resetting it by email** revokes all of them.
  - **Turning on two-step verification** revokes every other session.
  - **Suspending or banning an account** revokes all of its sessions.
  - **Settings → Password & security** lists signed-in devices and can sign any of them out.
- Sessions last 7 days. Cookies from before revocable sessions (no session id) are upgraded to a real session on first use, and rejected after a password change or "sign out everywhere" (`User.sessionsValidAfter`).
- Account status and role are re-read from the database on every request (cached up to 60 seconds). Roles are never taken from the cookie or the request.

## Authorization

- Every API route requires sign-in except a short, explicit public list. An automated test walks the whole Express app and fails if any other route answers without a session (`server/test/security/integrity.test.js`).
- **Admin APIs:** `requireRole` reads the role from the database on each request. The role levels are:
  - trader and premium;
  - moderator: Community moderation only;
  - admin: users, verification, announcements, research, statistics;
  - super admin: roles, connected services, platform settings.
- **Rank rules:**
  - Staff can only moderate accounts ranked below them. For example, a moderator can't pause an admin's posting or remove an admin's post.
  - Nobody can change their own role, status or plan.
  - Only super admins can act on other admins.
- **Object ownership:** every query for private data is scoped to the signed-in user. This covers:
  - journal entries, checklists, goals, check-ins and achievements;
  - share links, Kotka AI chats, saved items, notifications, push devices and sessions.

  Private chats and groups go through one access check, `conversationAccess` (`server/src/lib/community/access.js`). That check covers reading, sending, searching, reacting, pinning, polls, saving, reporting, fact-checking and chat images. Removed or departed members lose access immediately.
- **Live updates** (Server-Sent Events): private chats are delivered only on each member's own `user:<id>` channel. Clients can subscribe only to public room, market and community channels.

## Input validation and output

- Request bodies are limited to 1 MB. Only three routes accept up to 6 MB, because they carry an image: media upload, Kotka AI chat and share cards.
- Server-side validation:
  - Journal, checklist, goals, Community and Kotka AI inputs are checked for type, length, format and allowed values. Unknown fields are ignored, so a request can't set owners, roles, verification or achievements.
  - Database access goes through Prisma. The few raw queries use tagged templates, which Prisma parameterizes.
  - Links from news feeds are stored only if they are `http(s)`. The browser also only renders `http(s)` links (`src/lib/safeHref.js`).
- **No HTML rendering of user content:** React escapes all text, there is no `dangerouslySetInnerHTML`, and links inside posts are recognized only as `http(s)` URLs (`RichText.jsx`).
- **Errors** shown to people are plain messages. Stack traces, database errors and provider responses are logged on the server only.

## Uploads (charts, photos, voice notes)

`server/src/lib/media.js` and `server/src/lib/imageSafety.js`:

- The file type is read from the bytes, never from the name or the declared type. Only PNG, JPEG, WebP, GIF, WebM, Ogg and MP4 audio are accepted. SVG and HTML are refused.
- Image dimensions are read from the file headers. Anything over 12,000 px per side or 50 megapixels is refused, which blocks decompression bombs.
- Photo metadata is removed on the server: EXIF and GPS, XMP, IPTC and comments from JPEG; text and EXIF chunks from PNG; EXIF and XMP from WebP.
- Files are stored in Postgres under random ids and served only with a random 24-byte token. Responses carry `nosniff`, `Content-Disposition: inline` and a `sandbox` CSP, so an upload opened directly can't run anything.
- Uploads are rate-limited per user.

## Kotka AI

- Each request is limited to the signed-in user's own data. Tools receive the user id from the session, never from the model or the request. A test checks that tool arguments can't point at another person's journal.
- The system prompt sets trust boundaries. Tool results, news, research text and other traders' posts are data, not instructions. The model can't claim permissions or reveal its prompt. Community AI actions have the same rules.
- **Cost controls:**
  - A per-user burst limit.
  - A daily cap, reserved up front under a per-user Postgres advisory lock, so parallel requests can't slip past it.
  - Messages up to 6,000 characters, chats limited to the last 30 messages, and only the newest image sent in full.
  - Images are cleaned and limited to PNG, JPEG or WebP under 4 MB.

## Rate limits

`server/src/lib/rateLimit.js`: sliding windows in Postgres (`RateLimitHit`), shared by every serverless instance. They cover:
- reactions, follows, saves;
- journal, checklist, goals and check-ins;
- joining and creating chats;
- Kotka AI, Community AI, profile and push changes;
- password change, two-step verification, KYC submission and account deletion.

Posts, comments, messages, reports and uploads have their own content-based limits (`server/src/lib/community/throttle.js`). There is also a per-instance ceiling of 300 requests per minute per user, and per-IP ceilings on sign-in and public pages.

## Browser protections

- **Content Security Policy** (`vercel.json`, applied to the whole site):
  - scripts only from Kotka's own origin, plus Cloudflare's Web Analytics beacon (Cloudflare sits in front of the site and injects it);
  - no inline scripts, plugins, frames or embedding (`frame-ancestors 'none'`, plus `X-Frame-Options: DENY`);
  - form posts and base URLs only to Kotka.

  `vite preview` serves the build with the same headers, for local checks.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, and a Permissions Policy that allows only the microphone (for voice notes). HTTPS is enforced with HSTS by Vercel.
- **Cross-site request forgery:**
  - `SameSite=Lax` cookies.
  - Every `POST`/`PUT`/`PATCH`/`DELETE` to `/api` must come from one of Kotka's own origins (`Origin` header, or `Sec-Fetch-Site`). See `server/src/middleware/security.js`.
- **CORS** allows only Kotka's own origins (`server/src/lib/origins.js`) and never reflects an arbitrary origin.
- The API sends no `X-Powered-By` header.

## Secrets

- Secrets live only in environment variables (Vercel, and local `.env` files that git ignores) or, for connected-service keys, encrypted with AES-256-GCM in the `Integration` table.
- Keys are never sent to the browser: admins see only the last four characters.
- Provider keys are sent in request headers, not URLs, wherever the provider allows it. FRED only accepts a URL parameter.
- The hourly job's token is stored only as a hash and compared in constant time.
- Git history has been scanned for committed credentials; none were found.

## Payments and webhooks

There is no checkout and no webhook endpoint yet: paid plans are off and Paystack is used only for a connection test. Before checkout is built, it must:
- verify every payment server-side with Paystack's transaction verification API;
- verify webhook signatures (HMAC-SHA512 of the raw body with the secret key);
- reject replays, and make processing idempotent by transaction reference;
- never trust amounts or status sent by the browser.

## Audit log

Security events are recorded (`server/src/lib/audit.js`) with device and IP:
- sign-ins, failed and blocked sign-ins, sign-outs, password changes;
- two-step verification on or off, recovery-code use, session revocations;
- role, status and plan changes;
- connected-service and platform-setting changes;
- KYC views and decisions, moderation actions.

Passwords, tokens and keys are never logged.

## Testing

`server/test/security/` holds automated tests:
- authentication, sessions, two-step verification and cross-site request checks;
- role and ownership checks, including one-user-reading-another's-data (IDOR) tests;
- private chat isolation, uploads and headers;
- Goal Room integrity, share links, Kotka AI isolation and quota;
- the check that every route requires sign-in.

They create and delete their own data. **They refuse to run against production**: they need `KOTKA_TEST_DB=1` and a `DATABASE_URL` for a separate database, such as a Neon branch.

```
cd server
KOTKA_TEST_DB=1 DATABASE_URL="<test branch url>" npm run test:security
npm run test:unit   # no database needed
```

Never run `prisma migrate dev`, `migrate reset`, `db push` or `migrate diff --shadow-database-url` against the production database. Apply schema changes to production only with `prisma migrate deploy`, after testing them on a branch.

## Incident response

1. **Contain:** suspend affected accounts (Admin → Users). This signs them out everywhere. Or switch off the affected connected service.
2. **Rotate:** replace any exposed secret. For the database password, `JWT_SECRET` or `ENCRYPTION_KEY`, update Vercel and the local `.env` files together. Rotating `JWT_SECRET` signs everyone out; rotating `ENCRYPTION_KEY` requires re-entering connected-service keys.
3. **Investigate** with the Audit Log (Admin → Audit Log, per person or by security events) and Vercel logs.
4. **Recover data:** Neon keeps point-in-time history (6 hours on the Free plan). Restore the production branch to a time before the incident. The current state is kept as a branch automatically.
5. **Tell affected users** what happened and what they should do.

## Infrastructure notes

- Vercel preview deployments sit behind Vercel login, but currently share the production database and secrets. Give previews their own Neon branch and secrets.
- The app connects as the database owner role. A separate least-privileged role for the app is recommended.
- Neon history on the Free plan is 6 hours. A paid plan (7–30 days) or regular `pg_dump` backups are recommended, with a restore tested periodically.
