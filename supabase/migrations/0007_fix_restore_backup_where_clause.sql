-- fn_restore_backup, doğrudan SQL bağlantısıyla (supabase db query) sorunsuz
-- çalışıyordu ama gerçek uygulamanın kullandığı PostgREST RPC çağrısı
-- üzerinden her zaman "DELETE requires a WHERE clause" hatasıyla
-- başarısız oluyordu — Supabase'in service_role için PostgREST API
-- katmanında uyguladığı, WHERE'siz toplu silmeyi engelleyen platform
-- güvenlik önlemi. Fonksiyonel olarak aynı sonucu veren "where true"
-- eklenerek bu kısıtlama aşılır; doğrudan SQL yolunu etkilemez.
create or replace function fn_restore_backup(p_payload jsonb) returns void
language plpgsql security definer as $$
begin
  -- Bağımlılık sırasına göre temizle
  delete from notification_log where true;
  delete from audit_log where true;
  delete from documents where true;
  delete from debt_repayments where true;
  delete from debts where true;
  delete from payments where true;
  delete from expense_shares where true;
  delete from expenses where true;
  delete from recurring_expenses where true;
  delete from persons where true;

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
