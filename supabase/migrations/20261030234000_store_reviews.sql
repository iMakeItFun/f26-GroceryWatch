create table if not exists store_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  store_provider text not null default 'kroger' check (store_provider = 'kroger'),
  external_store_id text not null,
  store_name text not null check (char_length(store_name) between 1 and 120),
  store_address text not null default '' check (char_length(store_address) <= 250),
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists store_reviews_store_created_at_idx
  on store_reviews (store_provider, external_store_id, created_at desc);
