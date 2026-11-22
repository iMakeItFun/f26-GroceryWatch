-- Stores user privacy preferences for location, telemetry, and deal personalization.
CREATE TABLE IF NOT EXISTS public.user_privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    share_location BOOLEAN NOT NULL DEFAULT true,
    share_analytics BOOLEAN NOT NULL DEFAULT false,
    personalized_deals BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
