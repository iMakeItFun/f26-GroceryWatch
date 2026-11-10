alter table public.spotted_products
  add column if not exists barcode text,
  add column if not exists external_store_id text;
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  location text not null,
  quantity integer check (quantity is null or quantity >= 0),
  barcode text,
  external_store_id text,
  created_at timestamptz not null default now()
);
insert into public.shopping_list_items (
  id,
  user_id,
  name,
  price,
  location,
  quantity,
  barcode,
  external_store_id,
  created_at
)
select
  id,
  user_id,
  name,
  price,
  location,
  quantity,
  barcode,
  external_store_id,
  created_at
from public.spotted_products
on conflict (id) do nothing;
create index shopping_list_items_user_created_at_idx
  on public.shopping_list_items (user_id, created_at desc);
