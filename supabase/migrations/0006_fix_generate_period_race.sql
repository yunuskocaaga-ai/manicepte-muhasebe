-- fn_generate_recurring_period, eşzamanlı (concurrent) çağrılara karşı
-- korumasızdı: iki çağrı aynı anda "var mı?" kontrolünü geçip ikisi de
-- insert denediğinde uq_expenses_recurring_month unique kısıtı ihlal
-- edilir ve fonksiyon yakalanmamış bir exception fırlatır (sayfa 500 verir).
-- Bu, genel-bakis/giderler sayfalarının her istekte çağırdığı
-- ensureCurrentPeriodsGenerated üzerinden tetiklenebilir (örn. ağ kesintisi
-- sonrası tarayıcının aynı isteği iki kez göndermesi, çift sekme, vb.).
-- Çözüm: unique_violation'ı yakala, var olan satırı sorgulayıp dön — bu da
-- fonksiyonu gerçek anlamda idempotent (yarış güvenli) yapar.
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

  begin
    insert into expenses (name, amount_kurus, month, due_day, description, recurring_expense_id)
      values (v_recurring.name, v_recurring.amount_kurus, p_month, v_due_day, null, p_recurring_expense_id)
      returning * into v_expense;
  exception when unique_violation then
    -- Eşzamanlı başka bir çağrı araya girip aynı donemi az önce olusturdu;
    -- hatayı yutup o kaydı dön (gerçek yarış güvenliği).
    select * into v_existing from expenses
      where recurring_expense_id = p_recurring_expense_id and month = p_month and deleted_at is null;
    return v_existing;
  end;

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
