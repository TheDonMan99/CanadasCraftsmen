-- Newer Supabase projects don't grant the API roles access to tables created in SQL.
-- The app's server reaches the database directly, but the service-role key (used for
-- file storage and admin checks over the Supabase API) needs full access too.
-- The public (anon) role gets no table access: customers go through the app's own
-- endpoints, which recalculate prices and check spam protection.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
