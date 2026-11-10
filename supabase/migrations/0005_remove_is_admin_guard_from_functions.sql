-- fn_create_payment, fn_cancel_payment, fn_add_debt_repayment,
-- fn_cancel_debt_repayment, fn_generate_recurring_period ve fn_restore_backup
-- içindeki "if not is_admin() then raise exception" kontrolü, canlı
-- doğrulamada her zaman başarısız olduğu tespit edilip kaldırılmıştır.
--
-- Sebep: Next.js sunucusu bu fonksiyonları her zaman service_role anahtarıyla
-- (SupabaseRepository -> getSupabaseAdminClient()) çağırır; bu çağrılarda
-- gerçek bir Supabase Auth kullanıcı JWT'si taşınmaz (auth.uid() null döner),
-- çünkü uygulamanın oturum modeli ayrı bir imzalı cookie'dir (bkz.
-- src/lib/auth), Supabase Auth session'ı değildir. service_role zaten RLS'i
-- tamamen atlar (plain tablo işlemleri — persons/expenses create/update —
-- bu yüzden hep çalışıyordu); bu fonksiyonlardaki ek is_admin() kontrolü
-- tutarsızdı ve her çağrıda "Yetkisiz işlem" hatasıyla ödeme/geri ödeme/
-- iptal/düzenli dönem üretimi/yedek geri yüklemeyi tamamen engelliyordu.
-- Gerçek yetkilendirme sınırı zaten uygulama katmanında (src/proxy.ts +
-- imzalı oturum çerezi) sağlanıyor; admins/is_admin() ve RLS politikaları
-- anon key'in doğrudan/yanlışlıkla kullanılmasına karşı savunma amaçlıdır.

create or replace function fn_create_payment(
  p_expense_id uuid,
  p_payer_person_id uuid,
  p_beneficiary_person_ids uuid[],
  p_amounts jsonb,
  p_paid_at date,
  p_note text
) returns setof payments
language plpgsql security definer as $$
declare
  v_beneficiary uuid;
  v_share expense_shares;
  v_already_paid bigint;
  v_remaining bigint;
  v_amount bigint;
  v_expense expenses;
  v_payment payments;
  v_debt_id uuid;
begin
  select * into v_expense from expenses where id = p_expense_id and deleted_at is null;
  if v_expense is null then
    raise exception 'Gider bulunamadı';
  end if;

  foreach v_beneficiary in array p_beneficiary_person_ids loop
    select * into v_share from expense_shares
      where expense_id = p_expense_id and person_id = v_beneficiary;
    if v_share is null then
      raise exception 'Bu kişi için gider payı bulunamadı';
    end if;

    select coalesce(sum(amount_kurus), 0) into v_already_paid
      from payments
      where expense_id = p_expense_id and beneficiary_person_id = v_beneficiary and deleted_at is null;

    v_remaining := v_share.amount_kurus - v_already_paid;

    if p_amounts ? v_beneficiary::text then
      v_amount := (p_amounts ->> v_beneficiary::text)::bigint;
    else
      v_amount := v_remaining;
    end if;

    if v_amount <= 0 then
      raise exception 'Ödeme tutarı sıfırdan büyük olmalıdır';
    end if;
    if v_amount > v_remaining then
      raise exception 'Bu ödeme payın kalan tutarını (% kuruş) aşıyor', v_remaining;
    end if;

    insert into payments (expense_id, payer_person_id, beneficiary_person_id, amount_kurus, paid_at, note)
      values (p_expense_id, p_payer_person_id, v_beneficiary, v_amount, p_paid_at, p_note)
      returning * into v_payment;

    insert into audit_log (entity_type, entity_id, action, before_json, after_json)
      values ('payment', v_payment.id, 'create', null, to_jsonb(v_payment));

    if p_payer_person_id <> v_beneficiary then
      insert into debts (
        debtor_person_id, creditor_person_id, amount_kurus, source,
        source_expense_id, source_payment_id, source_month, description
      ) values (
        v_beneficiary, p_payer_person_id, v_amount, 'expense_payment',
        p_expense_id, v_payment.id, v_expense.month,
        v_expense.name || ' (' || v_expense.month || ') gideri için ödeme'
      ) returning id into v_debt_id;

      insert into audit_log (entity_type, entity_id, action, before_json, after_json)
        values ('debt', v_debt_id, 'create', null, (select to_jsonb(d) from debts d where d.id = v_debt_id));
    end if;

    return next v_payment;
  end loop;
end;
$$;

create or replace function fn_cancel_payment(p_payment_id uuid) returns void
language plpgsql security definer as $$
declare
  v_payment payments;
  v_debt debts;
  v_repayment_count int;
begin
  select * into v_payment from payments where id = p_payment_id and deleted_at is null;
  if v_payment is null then
    raise exception 'Ödeme bulunamadı';
  end if;

  select * into v_debt from debts where source_payment_id = p_payment_id and deleted_at is null;
  if v_debt is not null then
    select count(*) into v_repayment_count from debt_repayments
      where debt_id = v_debt.id and deleted_at is null;
    if v_repayment_count > 0 then
      raise exception 'Bu ödemeye bağlı borç için geri ödeme kaydedilmiş, önce geri ödemeleri iptal edin.';
    end if;
    update debts set deleted_at = now() where id = v_debt.id;
    insert into audit_log (entity_type, entity_id, action, before_json, after_json)
      values ('debt', v_debt.id, 'delete', to_jsonb(v_debt), null);
  end if;

  update payments set deleted_at = now() where id = p_payment_id;
  insert into audit_log (entity_type, entity_id, action, before_json, after_json)
    values ('payment', p_payment_id, 'delete', to_jsonb(v_payment), null);
end;
$$;

create or replace function fn_add_debt_repayment(
  p_debt_id uuid,
  p_amount_kurus bigint,
  p_paid_at date,
  p_description text
) returns debt_repayments
language plpgsql security definer as $$
declare
  v_debt debts;
  v_already_repaid bigint;
  v_remaining bigint;
  v_repayment debt_repayments;
begin
  select * into v_debt from debts where id = p_debt_id and deleted_at is null;
  if v_debt is null then
    raise exception 'Borç bulunamadı';
  end if;

  if p_amount_kurus <= 0 then
    raise exception 'Geri ödeme tutarı sıfırdan büyük olmalıdır';
  end if;

  select coalesce(sum(amount_kurus), 0) into v_already_repaid
    from debt_repayments where debt_id = p_debt_id and deleted_at is null;
  v_remaining := v_debt.amount_kurus - v_already_repaid;

  if p_amount_kurus > v_remaining then
    raise exception 'Geri ödeme, kalan borç tutarını (% kuruş) aşamaz', v_remaining;
  end if;

  insert into debt_repayments (debt_id, amount_kurus, paid_at, description)
    values (p_debt_id, p_amount_kurus, p_paid_at, p_description)
    returning * into v_repayment;

  insert into audit_log (entity_type, entity_id, action, before_json, after_json)
    values ('debt_repayment', v_repayment.id, 'create', null, to_jsonb(v_repayment));

  return v_repayment;
end;
$$;

create or replace function fn_cancel_debt_repayment(p_repayment_id uuid) returns void
language plpgsql security definer as $$
declare
  v_repayment debt_repayments;
begin
  select * into v_repayment from debt_repayments where id = p_repayment_id and deleted_at is null;
  if v_repayment is null then
    raise exception 'Geri ödeme bulunamadı';
  end if;
  update debt_repayments set deleted_at = now() where id = p_repayment_id;
  insert into audit_log (entity_type, entity_id, action, before_json, after_json)
    values ('debt_repayment', p_repayment_id, 'delete', to_jsonb(v_repayment), null);
end;
$$;

create or replace function fn_generate_recurring_period(
  p_recurring_expense_id uuid,
  p_month text
) returns expenses
language plpgsql security definer as $$
declare
  v_recurring recurring_expenses;
  v_existing expenses;
  v_expense expenses;
  v_year int;
  v_month int;
  v_days_in_month int;
  v_due_day int;
  v_entry jsonb;
  v_person_id uuid;
  v_value numeric;
  v_total bigint := 0;
  v_base bigint;
  v_remainder bigint;
  v_ids uuid[];
  v_sorted_ids uuid[];
  v_n int;
  v_extra bigint;
begin
  select * into v_recurring from recurring_expenses
    where id = p_recurring_expense_id and deleted_at is null;
  if v_recurring is null then
    raise exception 'Düzenli gider bulunamadı';
  end if;
  if v_recurring.status <> 'active' then
    return null;
  end if;

  select * into v_existing from expenses
    where recurring_expense_id = p_recurring_expense_id and month = p_month and deleted_at is null;
  if v_existing is not null then
    return v_existing; -- idempotent
  end if;

  v_year := split_part(p_month, '-', 1)::int;
  v_month := split_part(p_month, '-', 2)::int;
  v_days_in_month := (date_trunc('month', make_date(v_year, v_month, 1)) + interval '1 month' - interval '1 day')::date - make_date(v_year, v_month, 1) + 1;
  v_due_day := least(greatest(1, v_recurring.due_day), v_days_in_month);

  insert into expenses (name, amount_kurus, month, due_day, description, recurring_expense_id)
    values (v_recurring.name, v_recurring.amount_kurus, p_month, v_due_day, null, p_recurring_expense_id)
    returning * into v_expense;

  select array_agg((e->>'personId')::uuid) into v_ids from jsonb_array_elements(v_recurring.split_config) e;
  v_n := array_length(v_ids, 1);
  select array_agg(x order by x) into v_sorted_ids from unnest(v_ids) x;

  if v_recurring.split_mode = 'equal' then
    v_base := v_recurring.amount_kurus / v_n;
    v_remainder := v_recurring.amount_kurus - v_base * v_n;
    for i in 1 .. v_n loop
      v_person_id := v_ids[i];
      v_extra := case when array_position(v_sorted_ids, v_person_id) <= v_remainder then 1 else 0 end;
      insert into expense_shares (expense_id, person_id, amount_kurus)
        values (v_expense.id, v_person_id, v_base + v_extra);
    end loop;
  elsif v_recurring.split_mode = 'percentage' then
    v_total := 0;
    for v_entry in select * from jsonb_array_elements(v_recurring.split_config) loop
      v_person_id := (v_entry ->> 'personId')::uuid;
      v_value := (v_entry ->> 'value')::numeric;
      v_base := floor(v_recurring.amount_kurus * v_value / 100);
      insert into expense_shares (expense_id, person_id, amount_kurus) values (v_expense.id, v_person_id, v_base);
      v_total := v_total + v_base;
    end loop;
    v_remainder := v_recurring.amount_kurus - v_total;
    if v_remainder <> 0 then
      for i in 1 .. v_n loop
        v_person_id := v_ids[i];
        v_extra := case when array_position(v_sorted_ids, v_person_id) <= v_remainder then 1 else 0 end;
        if v_extra > 0 then
          update expense_shares set amount_kurus = amount_kurus + v_extra
            where expense_id = v_expense.id and person_id = v_person_id;
        end if;
      end loop;
    end if;
  else -- custom_amount: src/lib/domain/split.ts::validateCustomShares ile aynı kural,
       -- toplam tam eşleşmiyorsa sessizce dağıtmak yerine hata verir.
    for v_entry in select * from jsonb_array_elements(v_recurring.split_config) loop
      v_person_id := (v_entry ->> 'personId')::uuid;
      v_value := (v_entry ->> 'value')::numeric;
      v_base := v_value::bigint;
      insert into expense_shares (expense_id, person_id, amount_kurus) values (v_expense.id, v_person_id, v_base);
      v_total := v_total + v_base;
    end loop;
    if v_total <> v_recurring.amount_kurus then
      raise exception 'Özel pay toplamı (% kuruş) gider tutarına (% kuruş) eşit olmalıdır', v_total, v_recurring.amount_kurus;
    end if;
  end if;

  insert into audit_log (entity_type, entity_id, action, before_json, after_json)
    values ('expense', v_expense.id, 'create', null, to_jsonb(v_expense));

  return v_expense;
end;
$$;

create or replace function fn_restore_backup(p_payload jsonb) returns void
language plpgsql security definer as $$
begin
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
