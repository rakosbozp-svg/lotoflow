import { createClient } from '@supabase/supabase-js'

// Veřejná adresa projektu a publishable klíč – bezpečné mít v prohlížeči,
// přístup k datům hlídá přihlášení a pravidla v databázi (RLS).
export const SUPABASE_URL = 'https://qmripplpcpvsxxliffcq.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LVIRcISbmVe-6e0Ee8n2ew__wJCPZUK'

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  const e = error as { message?: string }
  const msg = e.message ?? String(error)
  if (msg.includes('Invalid login credentials')) return 'Nesprávný e-mail nebo heslo.'
  if (msg.includes('Email not confirmed')) return 'E-mail zatím není potvrzený. Otevřete odkaz z potvrzovacího e-mailu.'
  if (msg.includes('User already registered')) return 'Tento e-mail už je zaregistrovaný. Přihlaste se.'
  if (msg.includes('Password should be')) return 'Heslo musí mít alespoň 6 znaků.'
  if (msg.includes('lotos_one_open_per_equipment')) return 'Na zařízení už probíhá LOTO.'
  if (msg.includes('equipment_company_id_code_key')) return 'Tento kód už používá jiné zařízení.'
  if (msg.includes('row-level security') || msg.includes('permission denied')) return 'K této akci nemáte oprávnění.'
  if (msg.includes('Failed to fetch')) return 'Nelze se spojit se serverem. Zkontrolujte připojení.'
  return msg
}
