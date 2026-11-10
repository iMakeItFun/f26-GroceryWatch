create table ingest_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  status text not null
);
