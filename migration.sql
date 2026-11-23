-- Run against production DATABASE_URL
ALTER TABLE laundry_orders
  ADD COLUMN IF NOT EXISTS placed_by           VARCHAR(20) DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS placed_by_user_id   UUID,
  ADD COLUMN IF NOT EXISTS payment_method      VARCHAR(20) DEFAULT 'stripe',
  ADD COLUMN IF NOT EXISTS payment_responsible VARCHAR(20) DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS washer_machine_number SMALLINT,
  ADD COLUMN IF NOT EXISTS dryer_machine_number  SMALLINT;

CREATE TABLE IF NOT EXISTS room_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES laundry_orders(id),
  hotel_id    UUID,
  guest_id    UUID,
  room_number VARCHAR(10),
  amount      DECIMAL(10,2),
  description TEXT,
  charged_by  UUID,
  charged_at  TIMESTAMP,
  settled     BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS hotel_account_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID REFERENCES laundry_orders(id),
  hotel_id            UUID,
  guest_id            UUID,
  room_number         VARCHAR(10),
  amount              DECIMAL(10,2),
  description         TEXT,
  created_by          UUID,
  created_at          TIMESTAMP,
  invoiced            BOOLEAN DEFAULT false
);

ALTER TABLE hotel_guests
  ADD COLUMN IF NOT EXISTS total_sustainability_orders INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_water_saved   DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_energy_saved  DECIMAL(10,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_co2_avoided   DECIMAL(10,3) DEFAULT 0;

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 20244;
