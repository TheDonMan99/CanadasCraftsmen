-- Before this fix, JSON written by the app (settings saves, catalog edits, orders,
-- the audit log…) was stored as a JSON string holding the JSON text, rather than as
-- the object itself. Unwrap any such values. Rows seeded by SQL were never affected.
do $$
declare
  c record;
begin
  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and data_type = 'jsonb'
  loop
    execute format(
      $f$update %I set %I = (%I #>> '{}')::jsonb where jsonb_typeof(%I) = 'string' and (%I #>> '{}') ~ '^\s*[\[{]'$f$,
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name
    );
  end loop;
end $$;
