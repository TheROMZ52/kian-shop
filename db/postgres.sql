-- Postgres (Supabase) — همه جدول‌ها در schema اختصاصی kian تا با پروژه‌های دیگر قاطی نشوند
create schema if not exists kian;
create table if not exists kian.users(
  id bigserial primary key, name text not null default '', phone text unique, email text unique,
  password_hash text, google_id text unique, role text not null default 'customer',
  province text default '', city text default '', address text default '', postal_code text default '',
  blocked integer not null default 0, created_at bigint not null);
create table if not exists kian.sessions(
  token_hash text primary key, user_id bigint not null references kian.users(id) on delete cascade, expires_at bigint not null);
create table if not exists kian.categories(id bigserial primary key, name text not null unique, sort integer not null default 0);
create table if not exists kian.products(
  id bigserial primary key, category_id bigint references kian.categories(id) on delete set null,
  name text not null, description text not null default '', price bigint not null, old_price bigint,
  stock integer not null default 0, images text not null default '[]', active integer not null default 1,
  created_at bigint not null, updated_at bigint not null);
create index if not exists idx_products_cat on kian.products(category_id);
create table if not exists kian.orders(
  id bigserial primary key, code text not null unique, user_id bigint references kian.users(id) on delete set null,
  name text not null, phone text not null, province text not null, city text not null, address text not null,
  postal_code text not null default '', note text not null default '',
  subtotal bigint not null, shipping bigint not null, total bigint not null,
  status text not null default 'pending', created_at bigint not null, updated_at bigint not null);
create index if not exists idx_orders_user on kian.orders(user_id);
create index if not exists idx_orders_status on kian.orders(status);
create table if not exists kian.order_items(
  id bigserial primary key, order_id bigint not null references kian.orders(id) on delete cascade,
  product_id bigint references kian.products(id) on delete set null, name text not null, price bigint not null, qty integer not null);
create table if not exists kian.order_events(
  id bigserial primary key, order_id bigint not null references kian.orders(id) on delete cascade,
  status text not null, note text not null default '', actor text not null default '', created_at bigint not null);
create table if not exists kian.settings(key text primary key, value text not null default '');
