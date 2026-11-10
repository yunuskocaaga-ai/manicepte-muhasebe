-- Dekont/fatura dosyaları için private Storage bucket.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists admin_receipts_all on storage.objects;
create policy admin_receipts_all on storage.objects
  for all
  using (bucket_id = 'receipts' and is_admin())
  with check (bucket_id = 'receipts' and is_admin());
