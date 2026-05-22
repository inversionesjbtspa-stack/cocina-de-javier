-- Complete remaining bank aliases already confirmed by MASTER PROVEEDORES JESUS.

insert into public.bank_mappings (raw_pattern, bank_name_normalized, bank_code, confidence, needs_review, source)
values
  ('BANCO BBVA SCOTIA BANK AZUL', 'BBVA / SCOTIA BANK AZUL', '504', 1, false, 'master proveedores jesus'),
  ('CORPBANCA', 'CORPBANCA', '27', 1, false, 'master proveedores jesus')
on conflict (raw_pattern) do update set
  bank_name_normalized = excluded.bank_name_normalized,
  bank_code = excluded.bank_code,
  confidence = excluded.confidence,
  needs_review = excluded.needs_review,
  source = excluded.source,
  updated_at = now();

with normalized_accounts as (
  select
    account.id,
    account.bank_name as original_bank_name,
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(upper(account.bank_name), '\[OBJECT OBJECT\]', ' ', 'g'),
            '//', ' ', 'g'
          ),
          '[().]', ' ', 'g'
        ),
        '\s*-\s*', ' - ', 'g'
      ),
      '\s+', ' ', 'g'
    )) as clean_bank_name
  from public.supplier_bank_accounts account
  where account.bank_name is not null
)
update public.supplier_bank_accounts account
set
  bank_raw = coalesce(account.bank_raw, normalized.original_bank_name),
  bank_name = mapping.bank_name_normalized,
  bank_name_normalized = mapping.bank_name_normalized,
  bank_code = coalesce(nullif(account.bank_code, ''), mapping.bank_code),
  bank_mapping_confidence = mapping.confidence,
  bank_mapping_needs_review = false
from normalized_accounts normalized
join public.bank_mappings mapping on mapping.raw_pattern = normalized.clean_bank_name
where account.id = normalized.id
  and mapping.bank_code is not null;
