-- supabase/hermes-seed.sql
-- HERMES house seed listings: Merlin's own affiliate links, approved.
-- Idempotent: every insert is guarded by WHERE NOT EXISTS on root_domain,
-- so re-running never duplicates (the partial unique index
-- hermes_links_root_domain_once also guards pending/approved).
-- Tracking URLs are Merlin's verified affiliate links — never altered.
-- House listings carry a 10-year expiry (paid listings get 12 months via
-- the checkout webhook / verify-on-return path).
-- Run via the Supabase Management API. Safe to re-run.

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'Margovil', 'https://margovil.pxf.io/PzNOEj', 'margovil.pxf.io', 'apparel', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'margovil.pxf.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'WHEELTOP', 'https://globaloneclicktechnologycolimited.pxf.io/k4GOEV', 'globaloneclicktechnologycolimited.pxf.io', 'leisure', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'globaloneclicktechnologycolimited.pxf.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'OpenArt AI', 'https://openartai.pxf.io/B5onaJ', 'openartai.pxf.io', 'tech', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'openartai.pxf.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'GearUP', 'https://gearup.sjv.io/L03KL0', 'gearup.sjv.io', 'gaming', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'gearup.sjv.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'Petscosset', 'https://petscosset.pxf.io/QY3j96', 'petscosset.pxf.io', 'pets', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'petscosset.pxf.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'Missacc', 'https://missacccom.pxf.io/oNq1Po', 'missacccom.pxf.io', 'apparel', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'missacccom.pxf.io');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'HelloPrenup', 'https://helloprenupinc.sjv.io/AgXPOa', 'helloprenupinc.sjv.io', 'legal', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'helloprenupinc.sjv.io');

-- Gambling listings carry honest 19+ labeling in the name, same as the
-- billboard rules (19+, play responsibly — no targeting minors).
insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'Stake.com · 19+', 'https://stake.com/?c=1FofAXWx', 'stake.com', 'gaming', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'stake.com');

insert into public.hermes_links (name, url, root_domain, category, payment_status, approved_at, expires_at)
select 'Betty · 19+', 'https://betty.ca/join/richardnsky8g', 'betty.ca', 'gaming', 'approved', now(), now() + interval '10 years'
where not exists (select 1 from public.hermes_links where root_domain = 'betty.ca');
