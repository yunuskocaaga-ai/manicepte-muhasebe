-- Tam yedek geri yükleme: tüm tabloları tek bir transaction içinde
-- (fonksiyon çağrısı = tek transaction) temizleyip yedekteki verilerle
-- yeniden doldurur. Bütünlük kontrolü (checksum) uygulama katmanında
-- (SupabaseRepository.backup.restore) yapılır; bu fonksiyon zaten
-- doğrulanmış veriyi alır.
create or replace function fn_restore_backup(p_payload jsonb) returns void
language plpgsql security definer as $$
begin
  if not is_admin() then
    raise exception 'Yetkisiz işlem';
  end if;

  -- Bağımlılık sırasına göre temizle
  delete from notification_log;
  delete from audit_log;
  delete from documents;
  delete from debt_repayments;
  delete from debts;
  delete from payments;
  delete from expense_shares;
  delete from expenses;
  delete from recurring_expenses;
  delete from persons;

  insert into persons select
    (r->>'id')::uuid, r->>'name', (r->>'isActive')::boolean,
    (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'persons') r;

  insert into recurring_expenses select
    (r->>'id')::uuid, r->>'name', (r->>'amountKurus')::bigint, (r->>'dueDay')::int,
    r->>'splitMode', coalesce(r->'splitConfig', '[]'::jsonb), r->>'status', r->>'startMonth',
    (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'recurringExpenses') r;

  insert into expenses select
    (r->>'id')::uuid, r->>'name', (r->>'amountKurus')::bigint, r->>'month', (r->>'dueDay')::int,
    r->>'description', (r->>'recurringExpenseId')::uuid,
    (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'expenses') r;

  insert into expense_shares select
    (r->>'id')::uuid, (r->>'expenseId')::uuid, (r->>'personId')::uuid, (r->>'amountKurus')::bigint
  from jsonb_array_elements(p_payload->'expenseShares') r;

  insert into payments select
    (r->>'id')::uuid, (r->>'expenseId')::uuid, (r->>'payerPersonId')::uuid, (r->>'beneficiaryPersonId')::uuid,
    (r->>'amountKurus')::bigint, (r->>'paidAt')::date, r->>'note',
    (r->>'createdAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'payments') r;

  insert into debts select
    (r->>'id')::uuid, (r->>'debtorPersonId')::uuid, (r->>'creditorPersonId')::uuid, (r->>'amountKurus')::bigint,
    r->>'source', (r->>'sourceExpenseId')::uuid, (r->>'sourcePaymentId')::uuid, r->>'sourceMonth', r->>'description',
    (r->>'createdAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'debts') r;

  insert into debt_repayments select
    (r->>'id')::uuid, (r->>'debtId')::uuid, (r->>'amountKurus')::bigint, (r->>'paidAt')::date, r->>'description',
    (r->>'createdAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'debtRepayments') r;

  insert into documents select
    (r->>'id')::uuid, r->>'ownerType', (r->>'ownerId')::uuid, r->>'fileName', r->>'storagePath', r->>'mimeType',
    (r->>'sizeBytes')::bigint, (r->>'uploadedAt')::timestamptz, (r->>'deletedAt')::timestamptz
  from jsonb_array_elements(p_payload->'documents') r;

  insert into audit_log select
    (r->>'id')::uuid, r->>'entityType', (r->>'entityId')::uuid, r->>'action',
    r->'beforeJson', r->'afterJson', (r->>'createdAt')::timestamptz
  from jsonb_array_elements(p_payload->'auditLog') r;

  insert into notification_log select
    (r->>'id')::uuid, (r->>'expenseId')::uuid, r->>'type', r->>'dateKey',
    (r->>'sentAt')::timestamptz, (r->>'simulated')::boolean
  from jsonb_array_elements(p_payload->'notificationLog') r;
end;
$$;
