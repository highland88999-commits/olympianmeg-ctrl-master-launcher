// lib/phone-home/contacts.ts — Pure helpers for the /phone-home contacts tab.
//
// Everything here is dependency-free and headless-testable: phone-number
// normalization/validation, the "table doesn't exist yet" detector used for
// honest degradation, and the row builder for inserts. All Supabase I/O lives
// in app/phone-home/contacts-tab.tsx.

export const CONTACTS_TABLE = 'phone_home_contacts';

// Shown when the contacts table hasn't been created in the database yet.
// The table is queued with the other pending migrations — this message is
// honest, never an error dump, and the page never crashes.
export const CONTACTS_MISSING_MESSAGE = 'Contacts arrive with the next database update.';

export const CONTACTS_OFFLINE_MESSAGE = 'Contacts are offline right now — check your connection.';

export const MAX_NAME_LENGTH = 120;
// E.164 caps numbers at 15 digits; allow as few as 3 so short local
// numbers and short codes still save.
export const MIN_PHONE_DIGITS = 3;
export const MAX_PHONE_DIGITS = 16;

export interface ValidatedContact {
  ok: true;
  name: string;
  phone_number: string;
}

export interface InvalidContact {
  ok: false;
  error: string;
}

export type ContactValidation = ValidatedContact | InvalidContact;

// Normalize a phone number: keep a single leading "+", strip every other
// non-digit character. Returns the normalized string (may be empty).
export function normalizePhoneNumber(raw: string): string {
  const input = String(raw ?? '').trim();
  const hasPlus = input.startsWith('+');
  const digits = input.replace(/\D/g, '');
  return (hasPlus ? '+' : '') + digits;
}

function digitCount(normalized: string): number {
  return normalized.replace(/\D/g, '').length;
}

export function validateContact(name: string, phone: string): ContactValidation {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) {
    return { ok: false, error: 'Give the contact a name.' };
  }
  if (cleanName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Keep names under ${MAX_NAME_LENGTH} characters.` };
  }
  const normalized = normalizePhoneNumber(phone);
  const digits = digitCount(normalized);
  if (!digits) {
    return { ok: false, error: 'Enter a phone number.' };
  }
  if (digits < MIN_PHONE_DIGITS) {
    return { ok: false, error: 'That number looks too short — check it and try again.' };
  }
  if (digits > MAX_PHONE_DIGITS) {
    return { ok: false, error: 'That number looks too long — check it and try again.' };
  }
  return { ok: true, name: cleanName, phone_number: normalized };
}

// True when a Supabase/PostgREST error means the contacts table itself does
// not exist yet (queued migration, not yet run). Everything else — network
// failures, auth problems — returns false so the caller can show the
// honest offline note instead.
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  const mentionsTable = /phone_home_contacts/i.test(msg);
  // The client only ever queries this one table, so a 42P01 here is only
  // trusted when the error names the table — anything else is an honest
  // offline note, never the "arrives with the next update" note.
  if (e.code === '42P01') return mentionsTable;
  return mentionsTable && /does not exist|not exist|undefined_table/i.test(msg);
}

export interface ContactRow {
  user_id: string;
  name: string;
  phone_number: string;
}

export function buildContactRow(userId: string, name: string, phone_number: string): ContactRow {
  return { user_id: userId, name, phone_number };
}

export interface Contact extends ContactRow {
  id: string;
  created_at: string;
  updated_at: string;
}
