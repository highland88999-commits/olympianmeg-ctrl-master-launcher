'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Phone, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import {
  CONTACTS_TABLE,
  CONTACTS_MISSING_MESSAGE,
  CONTACTS_OFFLINE_MESSAGE,
  validateContact,
  isMissingTableError,
  buildContactRow,
  type Contact,
} from '@/lib/phone-home/contacts';

type LoadState = 'loading' | 'missing' | 'offline' | 'ready';

interface Props {
  userId: string;
  // Tap-to-call: dials through the page's existing Twilio device flow.
  onCall: (phoneNumber: string) => void;
}

export default function ContactsTab({ userId, onCall }: Props) {
  const [state, setState] = useState<LoadState>('loading');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const { data, error } = await supabase
        .from(CONTACTS_TABLE)
        .select('id,user_id,name,phone_number,created_at,updated_at')
        .order('name', { ascending: true });
      if (error) {
        if (isMissingTableError(error)) {
          setState('missing');
        } else {
          setState('offline');
        }
        return;
      }
      setContacts((data ?? []) as Contact[]);
      setState('ready');
    } catch {
      // Network down, auth hiccup — honest note, never a crash.
      setState('offline');
    }
  }, []);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const resetForm = () => {
    setNameInput('');
    setPhoneInput('');
    setEditingId(null);
    setFormError('');
  };

  const startEdit = (c: Contact) => {
    setNameInput(c.name);
    setPhoneInput(c.phone_number);
    setEditingId(c.id);
    setFormError('');
  };

  const saveContact = async () => {
    if (saving) return;
    const result = validateContact(nameInput, phoneInput);
    // 'in'-narrowing: the project's tsconfig is non-strict, where `!result.ok`
    // does not discriminate the ContactValidation union. This is equivalent.
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from(CONTACTS_TABLE)
          .update({ name: result.name, phone_number: result.phone_number, updated_at: new Date().toISOString() })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(CONTACTS_TABLE)
          .insert(buildContactRow(userId, result.name, result.phone_number));
        if (error) throw error;
      }
      resetForm();
      await load();
    } catch (e) {
      if (isMissingTableError(e)) {
        setState('missing');
      } else {
        setFormError('Could not save — check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = async (c: Contact) => {
    if (!window.confirm(`Remove ${c.name} from your contacts?`)) return;
    try {
      const { error } = await supabase.from(CONTACTS_TABLE).delete().eq('id', c.id);
      if (error) throw error;
      if (editingId === c.id) resetForm();
      await load();
    } catch (e) {
      if (isMissingTableError(e)) setState('missing');
      // Otherwise the list simply stays as-is; the offline note covers it.
    }
  };

  return (
    <div className="w-full rounded-3xl border border-white/15 bg-black/40 backdrop-blur-3xl p-6 flex flex-col gap-4 shadow-2xl">
      <div className="text-center">
        <h2 className="text-sm font-light tracking-widest uppercase text-slate-100">Contacts</h2>
        <p className="text-[11px] text-slate-400 font-light mt-1">Your people — tap to call</p>
      </div>

      {state === 'loading' && (
        <p className="text-[11px] text-slate-500 text-center py-8 font-light">Loading your contacts…</p>
      )}

      {state === 'missing' && (
        <p className="text-[11px] text-slate-400 text-center py-8 px-4 font-light leading-relaxed">
          {CONTACTS_MISSING_MESSAGE}
        </p>
      )}

      {state === 'offline' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-[11px] text-slate-400 text-center px-4 font-light">{CONTACTS_OFFLINE_MESSAGE}</p>
          <button
            onClick={load}
            className="px-5 py-2.5 rounded-xl border border-white/20 bg-black/30 text-xs tracking-widest uppercase text-slate-200 hover:border-slate-300 transition"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1 max-h-64">
            {contacts.length === 0 ? (
              <p className="text-[11px] text-slate-500 text-center mt-4 px-4 font-light">
                No contacts yet — add someone below and tap to call them through the dialer.
              </p>
            ) : (
              contacts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 flex items-center gap-2"
                >
                  <button
                    onClick={() => onCall(c.phone_number)}
                    className="w-10 h-10 shrink-0 rounded-full border border-white/20 bg-black/40 flex items-center justify-center text-slate-200 hover:border-slate-300 active:scale-95 transition"
                    aria-label={`Call ${c.name}`}
                  >
                    <Phone className="w-4 h-4 stroke-1" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-100 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-500 tabular-nums truncate">{c.phone_number}</p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center text-slate-500 hover:text-slate-200 transition"
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5 stroke-1" />
                  </button>
                  <button
                    onClick={() => deleteContact(c)}
                    className="w-8 h-8 shrink-0 flex items-center justify-center text-slate-500 hover:text-red-300 transition"
                    aria-label={`Remove ${c.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 stroke-1" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-slate-400 stroke-1" />
              <span className="text-[10px] uppercase tracking-widest text-slate-400">
                {editingId ? 'Edit contact' : 'Add contact'}
              </span>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-200 transition"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Name"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              maxLength={120}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-300 transition"
            />
            <input
              type="tel"
              inputMode="tel"
              placeholder="Phone number"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="w-full bg-black/40 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-300 transition tabular-nums"
            />
            {formError && (
              <p className="text-[10px] text-red-300/90 font-light px-1">{formError}</p>
            )}
            <button
              onClick={saveContact}
              disabled={saving}
              className="w-full py-2.5 rounded-xl border border-white/20 bg-black/30 text-xs tracking-widest uppercase text-slate-200 hover:border-slate-300 transition disabled:opacity-50"
            >
              {saving ? 'Saving' : editingId ? 'Save changes' : 'Add contact'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
