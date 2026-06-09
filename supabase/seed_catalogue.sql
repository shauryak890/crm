-- =====================================================================
--  WHITES & BRIGHTS — SERVICE CATALOGUE / PRICE LIST  (optional seed)
--  This is your real product list pulled from the existing CRM. It is
--  configuration, not transactional data — edit prices to match yours.
--  Run after schema.sql. Re-running won't create duplicates.
-- =====================================================================

insert into public.products (name, price, category) values
  ('Laundry & Iron By KG',        80,  'Laundry'),
  ('Laundry by PC',               25,  'Laundry'),
  ('Saree Heavy',                 120, 'Dry Clean'),
  ('Saree',                       90,  'Dry Clean'),
  ('Suit',                        220, 'Dry Clean'),
  ('Blazer / Jacket',             180, 'Dry Clean'),
  ('Blanket (3 Offer)',           250, 'Household'),
  ('Bedsheet Double',             90,  'Household'),
  ('Bedsheet + Pillow Cover',     70,  'Household'),
  ('Duvet Cover',                 110, 'Household'),
  ('Hand Towel',                  20,  'Household'),
  ('Towel',                       30,  'Household'),
  ('W_Muffler',                   40,  'Winter'),
  ('W_Woolen Shawl',              130, 'Winter'),
  ('W Salwar Kamij Dupatta',      150, 'Laundry'),
  ('W Salwar Kamij Normal',       90,  'Laundry'),
  ('W_Curtain Panel',             140, 'Household'),
  ('W_Quilt Cover XL',            160, 'Household'),
  ('W_Quilt',                     200, 'Household'),
  ('W_Slip On',                   60,  'Footwear'),
  ('W_Cap Leather',               80,  'Accessories'),
  ('W_Shirt Cotton',              35,  'Laundry')
on conflict do nothing;
