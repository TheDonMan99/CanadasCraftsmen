-- Phase 6: true-shape nesting. Packing method "best" tries rectangle and true-shape
-- packing and keeps whichever uses fewer panels. Switch saved settings that still
-- have the phase 5 default ("rectangle") over to it.
update settings
   set data = jsonb_set(data, '{nesting,method}', '"best"')
 where data -> 'nesting' ->> 'method' = 'rectangle';
