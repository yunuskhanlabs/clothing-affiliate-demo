-- ============================================================================
-- CLOXTRO — PART 4 — dev-seed: per-store tracking config (§9)
-- ============================================================================
-- Demonstrates that the ClickID query-parameter name is genuinely
-- per-store configuration, not a global constant — each store below uses
-- a different parameter name, matching patterns real affiliate networks
-- use. Dev/test data only, same status as 0002_seed_dev_data.sql.
-- ============================================================================

update stores set affiliate_network = 'generic', tracking_param_name = 'subid1', network_ids = jsonb_build_object('publisher_id', 'cloxtro-001')
  where slug = 'northline-store';
update stores set affiliate_network = 'generic', tracking_param_name = 'clickid', network_ids = jsonb_build_object('campaign_id', 'aster-fw')
  where slug = 'aster-outlet';
update stores set affiliate_network = 'direct', tracking_param_name = 'aff_sub', network_ids = '{}'::jsonb
  where slug = 'fieldstone-direct';
update stores set affiliate_network = 'generic', tracking_param_name = 'custom_id', network_ids = jsonb_build_object('merchant_id', 'MARROW-9921')
  where slug = 'marrow-com';
update stores set affiliate_network = 'direct', tracking_param_name = 'subid1', network_ids = '{}'::jsonb
  where slug = 'kinfolk-shop';

-- Give offers a real (fake-domain) destination instead of the Part 3 '#'
-- placeholder, so the redirect route has something syntactically valid
-- to build a final URL from in local/dev testing. Still not a real
-- merchant — same `example-*.test` convention as 0002's store base_urls.
update offers o
set affiliate_url = st.base_url || '/products/' || o.id
from stores st
where o.store_id = st.id and (o.affiliate_url is null or o.affiliate_url = '#');
