-- ============================================================
-- V5 - DATES POUR LES DEPENSES RECURRENTES
-- A executer dans Supabase SQL Editor
-- ============================================================

alter table public.envelopes
  add column if not exists date date;
