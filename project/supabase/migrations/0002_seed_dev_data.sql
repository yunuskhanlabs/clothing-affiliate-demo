-- ============================================================================
-- CLOXTRO — PART 3 — DEV / TEST SEED DATA (§49)
-- ============================================================================
-- This is NOT real merchant/product data. It exists so Part 3 can be
-- exercised end-to-end (catalog rendering, filters, search, price-history
-- trigger, wishlist, price alerts) without hand-inserting rows.
--
-- Safe to delete/replace wholesale: `delete from products;` cascades
-- through variants/images (CASCADE) and leaves offers/price_history/
-- wishlist orphaned by design (RESTRICT) — so clearing seed data cleanly
-- means deleting child tables first, in this order:
--   price_history → offers → wishlist_items/recently_viewed/price_alerts
--   → product_images/product_variants → products → brands/categories/stores
-- This file is idempotent (ON CONFLICT DO NOTHING) so re-running it after
-- a partial run does not create duplicates.
-- ============================================================================

-- ---- Departments ----
insert into categories (slug, name, kind, sort_order) values
  ('men', 'Men', 'department', 1),
  ('women', 'Women', 'department', 2),
  ('kids', 'Kids', 'department', 3)
on conflict (slug) do nothing;

-- ---- Subcategories (cross-department, per §3 design note) ----
insert into categories (slug, name, kind, sort_order) values
  ('t-shirts', 'T-Shirts', 'subcategory', 1),
  ('shirts', 'Shirts', 'subcategory', 2),
  ('jeans', 'Jeans', 'subcategory', 3),
  ('hoodies', 'Hoodies', 'subcategory', 4),
  ('jackets', 'Jackets', 'subcategory', 5),
  ('trousers', 'Trousers', 'subcategory', 6),
  ('dresses', 'Dresses', 'subcategory', 7),
  ('tops', 'Tops', 'subcategory', 8)
on conflict (slug) do nothing;

-- ---- Brands ----
insert into brands (name, slug, status) values
  ('CLOXTRO Basics', 'cloxtro-basics', 'active'),
  ('Northline', 'northline', 'active'),
  ('Aster & Co', 'aster-co', 'active'),
  ('Fieldstone', 'fieldstone', 'active'),
  ('Marrow', 'marrow', 'active'),
  ('Lucid', 'lucid', 'active'),
  ('Kinfolk', 'kinfolk', 'active'),
  ('Aro Studio', 'aro-studio', 'active')
on conflict (slug) do nothing;

-- ---- Stores / affiliate partners (foundation only, §15) ----
insert into stores (name, slug, base_url, status) values
  ('Northline Store', 'northline-store', 'https://example-northline.test', 'active'),
  ('Aster Outlet', 'aster-outlet', 'https://example-aster.test', 'active'),
  ('Fieldstone Direct', 'fieldstone-direct', 'https://example-fieldstone.test', 'active'),
  ('Marrow.com', 'marrow-com', 'https://example-marrow.test', 'active'),
  ('The Kinfolk Shop', 'kinfolk-shop', 'https://example-kinfolk.test', 'active')
on conflict (slug) do nothing;

-- ---- Products + variants + images + offers ----
-- A small, hand-authored set covering: multiple departments, multiple
-- subcategories, multiple brands/stores, multiple price points, and all
-- three product_status values plus several offer_status values — enough
-- to exercise every filter/sort/search/lifecycle path (§49).

do $$
declare
  v_men uuid; v_women uuid; v_kids uuid;
  v_tshirts uuid; v_shirts uuid; v_jeans uuid; v_hoodies uuid; v_jackets uuid; v_dresses uuid;
  v_brand_rove uuid; v_brand_northline uuid; v_brand_marrow uuid; v_brand_aster uuid; v_brand_fieldstone uuid;
  v_store_northline uuid; v_store_aster uuid; v_store_marrow uuid; v_store_fieldstone uuid;
  v_product uuid;
begin
  select id into v_men from categories where slug = 'men';
  select id into v_women from categories where slug = 'women';
  select id into v_kids from categories where slug = 'kids';
  select id into v_tshirts from categories where slug = 't-shirts';
  select id into v_shirts from categories where slug = 'shirts';
  select id into v_jeans from categories where slug = 'jeans';
  select id into v_hoodies from categories where slug = 'hoodies';
  select id into v_jackets from categories where slug = 'jackets';
  select id into v_dresses from categories where slug = 'dresses';

  select id into v_brand_rove from brands where slug = 'cloxtro-basics';
  select id into v_brand_northline from brands where slug = 'northline';
  select id into v_brand_marrow from brands where slug = 'marrow';
  select id into v_brand_aster from brands where slug = 'aster-co';
  select id into v_brand_fieldstone from brands where slug = 'fieldstone';

  select id into v_store_northline from stores where slug = 'northline-store';
  select id into v_store_aster from stores where slug = 'aster-outlet';
  select id into v_store_marrow from stores where slug = 'marrow-com';
  select id into v_store_fieldstone from stores where slug = 'fieldstone-direct';

  -- 1. Active men's t-shirt, two competing offers (tests best-offer pick)
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Essential Crew Tee', 'essential-crew-tee', 'A soft, everyday cotton crew neck tee.', v_brand_rove, v_men, v_tshirts, 'active', 4.3, 128, '100% Cotton', 'Regular', 'Casual', array['bestseller','new'])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_variants (product_id, sku, color_name, color_hex, size, stock_quantity, is_default) values
      (v_product, 'ECT-BLK-M', 'Black', '#1a1a1a', 'M', 20, true),
      (v_product, 'ECT-BLK-L', 'Black', '#1a1a1a', 'L', 15, false),
      (v_product, 'ECT-WHT-M', 'White', '#f2f0ec', 'M', 10, false);
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=1067&fit=crop&auto=format&q=80', 'Essential Crew Tee', 0, true);
    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url) values
      (v_product, v_store_northline, 499, 799, 'INR', 'available', '#'),
      (v_product, v_store_marrow, 549, 799, 'INR', 'available', '#');
  end if;

  -- 2. Active women's dress, single offer, high rating (search + rating sort coverage)
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Linen Wrap Dress', 'linen-wrap-dress', 'A breathable linen-blend wrap dress for warm days.', v_brand_aster, v_women, v_dresses, 'active', 4.7, 64, 'Linen Blend', 'Relaxed', 'Everyday', array['trending'])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_variants (product_id, sku, color_name, color_hex, size, stock_quantity, is_default) values
      (v_product, 'LWD-SAND-S', 'Sand', '#c9b491', 'S', 8, true),
      (v_product, 'LWD-SAND-M', 'Sand', '#c9b491', 'M', 12, false);
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&h=1067&fit=crop&auto=format&q=80', 'Linen Wrap Dress', 0, true);
    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url) values
      (v_product, v_store_aster, 1899, 2399, 'INR', 'available', '#');
  end if;

  -- 3. Men's jeans — out_of_stock PRODUCT lifecycle state (§7/§19 coverage)
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Straight Fit Jeans', 'straight-fit-jeans', 'Durable straight-fit denim, mid-wash.', v_brand_northline, v_men, v_jeans, 'out_of_stock', 4.1, 52, 'Denim', 'Regular', 'Casual', array[]::text[])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_variants (product_id, sku, color_name, size, stock_quantity) values
      (v_product, 'SFJ-BLU-32', 'Blue', '32', 0);
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1542060748-10c28b62716f?w=800&h=1067&fit=crop&auto=format&q=80', 'Straight Fit Jeans', 0, true);
    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url) values
      (v_product, v_store_northline, 1299, 1599, 'INR', 'out_of_stock', '#');
  end if;

  -- 4. Kids hoodie
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Cozy Pullover Hoodie', 'cozy-pullover-hoodie-kids', 'A warm, soft pullover hoodie for kids.', v_brand_fieldstone, v_kids, v_hoodies, 'active', 4.5, 31, 'Cotton Blend', 'Relaxed', 'Casual', array['new'])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_variants (product_id, sku, color_name, size, stock_quantity) values
      (v_product, 'CPH-NVY-6-7Y', 'Navy', '6-7Y', 18);
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?w=800&h=1067&fit=crop&auto=format&q=80', 'Cozy Pullover Hoodie', 0, true);
    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url) values
      (v_product, v_store_fieldstone, 799, 799, 'INR', 'available', '#');
  end if;

  -- 5. Archived product — must stay out of normal catalog discovery, but
  -- remain a valid foreign-key target (wishlist/price-history tests, §26).
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Discontinued Denim Jacket', 'discontinued-denim-jacket', 'No longer carried — kept for historical/user-data integrity tests.', v_brand_marrow, v_men, v_jackets, 'archived', 3.9, 12, 'Denim', 'Regular', 'Streetwear', array[]::text[])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&h=1067&fit=crop&auto=format&q=80', 'Discontinued Denim Jacket', 0, true);
    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url) values
      (v_product, v_store_marrow, 1999, 2999, 'INR', 'discontinued', '#');
  end if;

  -- 6. Men's shirt with a deliberate multi-step price change, to exercise
  -- the price-history trigger's "multiple sequential changes" test case
  -- (§46 Case 3): 1299 → 999 → 899 → 799.
  insert into products (name, slug, description, brand_id, department_id, subcategory_id, status, rating, review_count, material, fit, occasion, tags)
  values ('Oxford Button-Down Shirt', 'oxford-button-down-shirt', 'A classic oxford weave button-down.', v_brand_northline, v_men, v_shirts, 'active', 4.4, 87, '100% Cotton', 'Tailored', 'Formal', array['bestseller'])
  on conflict (slug) do nothing
  returning id into v_product;
  if v_product is not null then
    insert into product_variants (product_id, sku, color_name, size, stock_quantity) values
      (v_product, 'OBS-WHT-M', 'White', 'M', 25);
    insert into product_images (product_id, url, alt_text, position, is_primary) values
      (v_product, 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&h=1067&fit=crop&auto=format&q=80', 'Oxford Button-Down Shirt', 0, true);

    insert into offers (product_id, store_id, price, original_price, currency, status, affiliate_url)
    values (v_product, v_store_northline, 1299, 1299, 'INR', 'available', '#')
    returning id into v_product; -- reusing v_product var as offer id for the updates below (scoped to this block only)

    update offers set price = 999 where id = v_product;
    update offers set price = 899 where id = v_product;
    update offers set price = 799 where id = v_product;
    -- Expected result per §46: 4 price_history rows for this offer
    -- (initial 1299, then 999, 899, 799) — none duplicated, none skipped.
  end if;
end $$;
