ALTER TABLE public.price_history
    ADD COLUMN IF NOT EXISTS regular_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS promo_price NUMERIC(12, 2);


ALTER TABLE public.price_history
    ADD COLUMN IF NOT EXISTS anomaly_reasons TEXT[]
    NOT NULL DEFAULT '{}';



ALTER TABLE public.price_history
    ADD CONSTRAINT price_history_regular_price_positive
    CHECK (
        regular_price IS NULL
        OR regular_price > 0
    );

ALTER TABLE public.price_history
    ADD CONSTRAINT price_history_promo_price_positive
    CHECK (
        promo_price IS NULL
        OR promo_price > 0
    );



ALTER TABLE public.price_history
    ADD CONSTRAINT price_history_anomaly_reasons_valid
    CHECK (
        anomaly_reasons <@ ARRAY[
            'PRE_SALE_INFLATION',
            'INFLATED_REFERENCE_PRICE',
            'PERPETUAL_SALE'
        ]::TEXT[]
    );



CREATE INDEX IF NOT EXISTS idx_price_history_anomaly_lookup
    ON public.price_history (
        listing_id,
        creation_time DESC
    );