create table profiles (
  id uuid primary key,
  display_name text not null
);
create table spotted_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  location text not null,
  quantity integer check (quantity is null or quantity >= 0),
  created_at timestamptz not null default now()
);
insert into profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000001', 'Placeholder Shopper');
