# Clipper — Pre-Launch Marketing Landing Page & Waitlist System

A standalone, high-converting pre-launch marketing landing page for the **Clipper** AI Video Clipper & Fixed-Duration Splitter SaaS, optimized for instant 1-click deployment on **Vercel**.

## Features Included

* **Public Marketing Landing Page**:
  * Hero with exact creator-focused headline & value proposition
  * Problem breakdown & 3-step workflow
  * Distinct feature sections for **AI Clipper** and **Fixed-Duration Video Splitter (0 AI credits)**
  * Realistic product UI preview (clip cards, timestamps, confidence scores)
  * Target audience cards (YouTubers, Podcasters, Creators, Agencies, etc.)
  * Accordion FAQ
* **Waitlist Engine**:
  * Full Name, Email, Role, Videos Published per Month, Optional Phone Number
  * Client & Server-side input validation and email normalization (`name@domain.com`)
  * Duplicate email rejection (`ALREADY_REGISTERED`)
  * In-memory sliding-window rate limiting
  * First-touch and last-touch UTM attribution persistence (`utm_source`, `utm_medium`, etc.) + `document.referrer`
* **Analytics & Tracking (ZERO PII)**:
  * Google Analytics 4 (`NEXT_PUBLIC_GA_MEASUREMENT_ID`)
  * Conversion key event: `waitlist_submitted`
  * Meta Pixel readiness (`NEXT_PUBLIC_META_PIXEL_ID`) with `Lead` event tracking
* **Protected Admin Dashboard (`/admin/waitlist`)**:
  * Password/Secret Key gate (`ADMIN_SECRET_KEY`)
  * Metrics cards: Total Signups, Today, Past 7 Days, This Month
  * Attribution breakdown by Role, Source, and UTM Source
  * Search, filtering by role/frequency, pagination
  * **1-Click RFC 4180 CSV Export** with formula injection protection

---

## Direct 1-Click Vercel Deployment Instructions

### 1. Push Code to GitHub
Push this repository (or just the `landing-page/` directory as its own repo) to GitHub.

### 2. Import into Vercel
1. In your [Vercel Dashboard](https://vercel.com), click **"Add New Project"**.
2. Select your repository.
3. If this repository is a monorepo, set the **Root Directory** to `landing-page`.

### 3. Configure Environment Variables in Vercel
Under **Settings → Environment Variables**, add:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase / Neon / Vercel Postgres) | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| `ADMIN_SECRET_KEY` | Secret key used to log into `/admin/waitlist` | `your_secure_admin_password_2026` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | *(Optional)* Google Analytics 4 ID | `G-XXXXXXXXXX` |
| `NEXT_PUBLIC_META_PIXEL_ID` | *(Optional)* Meta Ads Pixel ID | `123456789012345` |

*Note: If `DATABASE_URL` is omitted, the application runs with an in-memory database store for local testing.*

### 4. Deploy
Click **Deploy**. Vercel will build and serve your landing page globally on the edge with zero additional configuration!

---

## Local Development

```bash
cd landing-page
npm install
npm run dev
```

Visit [http://localhost:3001](http://localhost:3001) to view the landing page.
Visit [http://localhost:3001/admin/waitlist](http://localhost:3001/admin/waitlist) for the admin portal.

---

## Automated Verification Suite

Run the Python verification test against the Next.js API:
```bash
python test_waitlist.py
```
This tests:
1. Valid lead registration
2. Email normalization
3. Duplicate registration handling
4. Required field validation
5. Optional phone handling
6. UTM attribution persistence
7. Rate limiting
8. Admin authentication protection
9. Search, filtering, and pagination
10. CSV export & sanitization
