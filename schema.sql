-- Washwell Concierge Connect — Full Schema
-- Run this once to create all tables from scratch.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Hotels ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(255) NOT NULL,
  slug       VARCHAR(100) UNIQUE NOT NULL,
  address    TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ── Users (mirrors Clerk users) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  email         VARCHAR(255),
  phone         VARCHAR(30),
  role          VARCHAR(20) DEFAULT 'guest',
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ── Hotel Guests ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_guests (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID REFERENCES users(id),
  hotel_id                     UUID REFERENCES hotels(id),
  room_number                  VARCHAR(20),
  check_in_date                DATE,
  check_out_date               DATE,
  total_sustainability_orders  INTEGER DEFAULT 0,
  total_water_saved            DECIMAL(10,2) DEFAULT 0,
  total_energy_saved           DECIMAL(10,3) DEFAULT 0,
  total_co2_avoided            DECIMAL(10,3) DEFAULT 0,
  created_at                   TIMESTAMP DEFAULT NOW()
);

-- ── Order number sequence ─────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 20244;

-- ── Laundry Orders ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS laundry_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          VARCHAR(20) UNIQUE,
  guest_id              UUID REFERENCES hotel_guests(id),
  hotel_id              UUID REFERENCES hotels(id),
  placed_by             VARCHAR(20) DEFAULT 'guest',
  placed_by_user_id     UUID,
  payment_method        VARCHAR(20) DEFAULT 'stripe',
  payment_responsible   VARCHAR(20) DEFAULT 'guest',
  payment_verified      BOOLEAN DEFAULT false,
  payment_confirmed_at  TIMESTAMP,
  status                VARCHAR(50) DEFAULT 'pending',
  special_instructions  TEXT,
  washer_machine_number SMALLINT,
  dryer_machine_number  SMALLINT,
  tier                  VARCHAR(50),
  total_amount          DECIMAL(10,2),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- ── Order Status History ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES laundry_orders(id),
  from_status VARCHAR(50),
  to_status   VARCHAR(50),
  changed_by  VARCHAR(255),
  note        TEXT,
  changed_at  TIMESTAMP DEFAULT NOW()
);

-- ── Audit Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID REFERENCES laundry_orders(id),
  action       VARCHAR(100),
  entity_type  VARCHAR(50),
  payload_after JSONB,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ── Room Charges ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES laundry_orders(id),
  hotel_id    UUID REFERENCES hotels(id),
  guest_id    UUID REFERENCES hotel_guests(id),
  room_number VARCHAR(10),
  amount      DECIMAL(10,2),
  description TEXT,
  charged_by  UUID,
  charged_at  TIMESTAMP DEFAULT NOW(),
  settled     BOOLEAN DEFAULT false
);

-- ── Hotel Account Charges ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_account_charges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES laundry_orders(id),
  hotel_id    UUID REFERENCES hotels(id),
  guest_id    UUID REFERENCES hotel_guests(id),
  room_number VARCHAR(10),
  amount      DECIMAL(10,2),
  description TEXT,
  created_by  UUID,
  created_at  TIMESTAMP DEFAULT NOW(),
  invoiced    BOOLEAN DEFAULT false
);

-- ── Sustainability (global totals) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sustainability_totals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_orders          INTEGER DEFAULT 0,
  water_saved_gallons   DECIMAL(12,2) DEFAULT 0,
  energy_saved_kwh      DECIMAL(12,3) DEFAULT 0,
  co2_avoided_lbs       DECIMAL(12,3) DEFAULT 0,
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Seed one row so the sustainability API always has something to return
INSERT INTO sustainability_totals (total_orders, water_saved_gallons, energy_saved_kwh, co2_avoided_lbs)
VALUES (0, 0, 0, 0)
ON CONFLICT DO NOTHING;

