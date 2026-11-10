-- ManiCepte Muhasebe — başlangıç şeması
-- Tüm para tutarları integer kuruş (1 TL = 100 kuruş) olarak saklanır.
-- Tek yönetici modeli: public kayıt yoktur, RLS tüm tablolarda yalnızca
-- `admins` tablosundaki auth.uid() değerine izin verir.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin yetkilendirme
-- ---------------------------------------------------------------------------
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql security definer stable as $$
  select exists(select 1 from admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Kişiler
-- ---------------------------------------------------------------------------
create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Düzenli giderler (şablon)
-- ---------------------------------------------------------------------------
create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_kurus bigint not null check (amount_kurus > 0),
  due_day int not null check (due_day between 1 and 31),
  split_mode text not null check (split_mode in ('equal', 'custom_amount', 'percentage')),
  split_config jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  start_month text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Giderler (tekil / düzenli dönem kaydı)
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_kurus bigint not null check (amount_kurus > 0),
  month text not null, -- 'YYYY-MM'
  due_day int not null check (due_day between 1 and 31),
  description text,
  recurring_expense_id uuid references recurring_expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Aynı düzenli gider + ay için iki kayıt açılmasın (idempotent dönem üretimi).
create unique index if not exists uq_expenses_recurring_month
  on expenses (recurring_expense_id, month)
  where recurring_expense_id is not null and deleted_at is null;

create index if not exists idx_expenses_month on expenses (month);

-- ---------------------------------------------------------------------------
-- Gider payları
-- ---------------------------------------------------------------------------
create table if not exists expense_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  person_id uuid not null references persons(id) on delete restrict,
  amount_kurus bigint not null check (amount_kurus >= 0),
  unique (expense_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Ödemeler (pay sahibi ile gerçekte ödeyen ayrı saklanır)
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete restrict,
  payer_person_id uuid not null references persons(id) on delete restrict,
  beneficiary_person_id uuid not null references persons(id) on delete restrict,
  amount_kurus bigint not null check (amount_kurus > 0),
  paid_at date not null,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_payments_expense on payments (expense_id);

-- ---------------------------------------------------------------------------
-- Borçlar (kişiler arası) — gider ödemesinden türeyen veya manuel
-- ---------------------------------------------------------------------------
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  debtor_person_id uuid not null references persons(id) on delete restrict,
  creditor_person_id uuid not null references persons(id) on delete restrict,
  amount_kurus bigint not null check (amount_kurus > 0),
  source text not null check (source in ('expense_payment', 'manual', 'opening_balance')),
  source_expense_id uuid references expenses(id) on delete set null,
  source_payment_id uuid references payments(id) on delete set null,
  source_month text,
  description text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (debtor_person_id <> creditor_person_id)
);

create index if not exists idx_debts_debtor on debts (debtor_person_id);
create index if not exists idx_debts_creditor on debts (creditor_person_id);

create table if not exists debt_repayments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  amount_kurus bigint not null check (amount_kurus > 0),
  paid_at date not null,
  description text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Belgeler (dekont/fatura meta verisi — gerçek dosya Supabase Storage'da)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('expense', 'backup')),
  owner_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Değişiklik geçmişi
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_entity on audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Bildirim logu (tekrar gönderimi önlemek için)
-- ---------------------------------------------------------------------------
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  type text not null check (type in ('before_due', 'overdue')),
  date_key text not null, -- Europe/Istanbul tarihine göre 'YYYY-MM-DD'
  sent_at timestamptz not null default now(),
  simulated boolean not null default true,
  unique (expense_id, type, date_key)
);

-- ---------------------------------------------------------------------------
-- RLS: tüm tablolarda sadece admin okuyabilir/yazabilir
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'persons', 'recurring_expenses', 'expenses', 'expense_shares', 'payments',
    'debts', 'debt_repayments', 'documents', 'audit_log', 'notification_log'
  ]) loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all on %I', t);
    execute format(
      'create policy admin_all on %I for all using (is_admin()) with check (is_admin())',
      t
    );
  end loop;
end $$;

-- admins tablosu kendi RLS'ine sahip: sadece zaten admin olan okuyabilir, yazma yalnızca service role ile (dashboard/CLI).
alter table admins enable row level security;
drop policy if exists admin_read_self on admins;
create policy admin_read_self on admins for select using (is_admin());
