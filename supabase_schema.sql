-- ==============================================================================
-- AI VIDEO CLIPPER: SUPABASE DATABASE & STORAGE SCHEMA
-- Run this in your Supabase Project -> SQL Editor to initialize tables & storage
-- ==============================================================================

-- 1. Create Jobs Table
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    progress_percent INT DEFAULT 5,
    stage TEXT DEFAULT 'video',
    current_message TEXT,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON public.jobs(expires_at);

-- 2. Create Clips Table
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id TEXT REFERENCES public.jobs(job_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    title TEXT NOT NULL,
    duration FLOAT NOT NULL,
    score FLOAT DEFAULT 8.0,
    tags JSONB DEFAULT '[]'::jsonb,
    explanation TEXT,
    reason TEXT,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    storage_path TEXT,
    signed_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_clips_user_id ON public.clips(user_id);
CREATE INDEX IF NOT EXISTS idx_clips_expires_at ON public.clips(expires_at);

-- 3. Initialize Supabase Storage Bucket ('clips')
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'clips',
    'clips',
    false, -- Private bucket (served via 24-hour signed URLs)
    104857600, -- 100MB max per clip
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage Security Policies
-- Allow service role full access
DROP POLICY IF EXISTS "Service role can manage clips" ON storage.objects;
CREATE POLICY "Service role can manage clips"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'clips')
WITH CHECK (bucket_id = 'clips');

-- 5. Helper Function: Purge Expired Clips Older than 24 Hours
CREATE OR REPLACE FUNCTION public.purge_expired_clips()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete records expired past 24h
    DELETE FROM public.clips WHERE expires_at < now();
    DELETE FROM public.jobs WHERE expires_at < now();
END;
$$;

-- ==============================================================================
-- 6. SaaS Credit Accounts & Transactions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT UNIQUE NOT NULL,
    balance FLOAT NOT NULL DEFAULT 100.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_user_id ON public.credit_accounts(user_id);

CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- CREDIT, DEBIT, REFUND, ADJUSTMENT
    amount FLOAT NOT NULL,
    balance_after FLOAT NOT NULL,
    source TEXT NOT NULL, -- PLAN_ALLOCATION, CREDIT_PURCHASE, AI_CLIPPER, TRANSCRIPTION, REFUND, ADMIN_ADJUSTMENT
    reference_id TEXT, -- job_id or payment_id
    metadata_json TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_ref ON public.credit_transactions(reference_id);

CREATE TABLE IF NOT EXISTS public.credit_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation TEXT UNIQUE NOT NULL, -- AI_CLIPPER, TRANSCRIPTION
    unit TEXT DEFAULT 'minute',
    credits_per_unit FLOAT NOT NULL,
    minimum_charge FLOAT DEFAULT 1.0,
    maximum_charge FLOAT,
    active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default credit rules
INSERT INTO public.credit_rules (operation, unit, credits_per_unit, minimum_charge, active)
VALUES
    ('AI_CLIPPER', 'minute', 2.0, 5.0, true),
    ('TRANSCRIPTION', 'minute', 1.0, 2.0, true)
ON CONFLICT (operation) DO NOTHING;

-- ==============================================================================
-- 7. Usage Records & Cost Observability
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    job_id TEXT,
    operation TEXT NOT NULL, -- ai_clipper, transcription, video_splitter
    duration_seconds FLOAT DEFAULT 0.0,
    processing_seconds FLOAT DEFAULT 0.0,
    llm_calls INT DEFAULT 0,
    llm_tokens INT DEFAULT 0,
    clip_count INT DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON public.usage_records(user_id);

-- ==============================================================================
-- 8. Plan Definitions & Subscriptions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.plan_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    monthly_credits FLOAT DEFAULT 100.0,
    max_video_duration_minutes INT DEFAULT 35,
    max_upload_size_mb INT DEFAULT 500,
    price_cents INT DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.plan_definitions (name, monthly_credits, max_video_duration_minutes, price_cents, currency, active)
VALUES
    ('free', 100.0, 35, 0, 'USD', true),
    ('creator', 600.0, 60, 1900, 'USD', true),
    ('pro', 2000.0, 120, 4900, 'USD', true)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    current_period_start TIMESTAMPTZ DEFAULT now(),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

CREATE TABLE IF NOT EXISTS public.credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    credits FLOAT NOT NULL,
    price_cents INT NOT NULL,
    currency TEXT DEFAULT 'USD',
    active BOOLEAN DEFAULT true,
    metadata_json TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.credit_packages (name, credits, price_cents, currency, active)
VALUES
    ('Starter Boost', 100.0, 500, 'USD', true),
    ('Growth Pack', 500.0, 2000, 'USD', true),
    ('Pro Pack', 1500.0, 5000, 'USD', true)
ON CONFLICT DO NOTHING;

