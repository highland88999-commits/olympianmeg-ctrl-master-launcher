// Miles' vault — item validation and Supabase storage operations.
//
// The vault NEVER handles plaintext passphrases beyond the encrypt/decrypt
// call: passphrases live only in the page's memory for the moment they are
// used. What goes to Supabase: ciphertext, salt, IV, and non-sensitive
// metadata (name, type, date).

import {
  encryptBytes,
  decryptBytes,
  encryptText,
  decryptText,
  u8ToB64,
  b64ToU8,
} from './crypto.js';

export const VAULT_BUCKET = 'babel-vault';
export const ITEM_TYPES = Object.freeze(['photo', 'note', 'credential']);

export const LIMITS = Object.freeze({
  nameMax: 80,
  passphraseMin: 8,
  passphraseMax: 128,
  noteMaxChars: 20000,
  photoMaxBytes: 25 * 1024 * 1024, // 25 MB
  photoMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
});

/**
 * Validate a new vault item before encryption. Returns an array of
 * plain-English error strings (empty = valid).
 */
export function validateItem({ itemType, name, passphrase, confirmPassphrase, textContent, fileInfo }) {
  const errors = [];
  if (!ITEM_TYPES.includes(itemType)) errors.push('Pick what kind of item this is: photo, note, or credential.');
  const cleanName = (name || '').trim();
  if (!cleanName) errors.push('Give the item a name so Miles can find it later.');
  else if (cleanName.length > LIMITS.nameMax) errors.push(`Keep the name under ${LIMITS.nameMax} characters.`);
  if (!passphrase || typeof passphrase !== 'string') {
    errors.push('Set a passphrase for this item — only Miles will know it.');
  } else {
    if (passphrase.length < LIMITS.passphraseMin)
      errors.push(`Make the passphrase at least ${LIMITS.passphraseMin} characters long.`);
    if (passphrase.length > LIMITS.passphraseMax)
      errors.push('That passphrase is too long — keep it under 128 characters.');
    if (passphrase !== confirmPassphrase) errors.push('The two passphrases do not match.');
  }
  if (itemType === 'note' || itemType === 'credential') {
    const t = textContent || '';
    if (!t.trim()) errors.push('Write something first — the item is empty.');
    else if (t.length > LIMITS.noteMaxChars)
      errors.push(`Keep it under ${LIMITS.noteMaxChars.toLocaleString()} characters.`);
  }
  if (itemType === 'photo') {
    if (!fileInfo) errors.push('Choose a photo to upload.');
    else {
      if (!LIMITS.photoMimeTypes.includes(fileInfo.type))
        errors.push('That file is not a supported photo (JPEG, PNG, WebP, GIF, or HEIC).');
      if (fileInfo.size > LIMITS.photoMaxBytes)
        errors.push('That photo is over 25 MB — pick a smaller one.');
      if (fileInfo.size <= 0) errors.push('That file looks empty.');
    }
  }
  return errors;
}

/**
 * Create a vault item: encrypt client-side, then store ciphertext.
 * Photos: ciphertext bytes -> storage bucket, row keeps the path.
 * Notes/credentials: ciphertext text -> table row.
 * Returns the inserted row (metadata only).
 */
export async function createVaultItem({ supabase, userId, itemType, name, passphrase, textContent, fileBytes, mimeType }) {
  const cleanName = name.trim();
  if (itemType === 'photo') {
    const { ciphertext, iv, salt } = await encryptBytes(fileBytes, passphrase);
    // Insert the row first to get an id for the storage path.
    const { data: row, error: rowError } = await supabase
      .from('babel_vault_items')
      .insert({
        owner_id: userId,
        item_type: 'photo',
        name: cleanName,
        ciphertext: null,
        iv: u8ToB64(iv),
        salt: u8ToB64(salt),
        mime_type: mimeType,
        storage_path: null,
      })
      .select()
      .single();
    if (rowError) throw new Error('Could not save the vault entry. Please try again.');
    const storagePath = `${userId}/${row.id}.enc`;
    const { error: upError } = await supabase.storage
      .from(VAULT_BUCKET)
      .upload(storagePath, ciphertext, { contentType: 'application/octet-stream', upsert: false });
    if (upError) {
      await supabase.from('babel_vault_items').delete().eq('id', row.id);
      throw new Error('Could not upload the encrypted photo. Please try again.');
    }
    const { data: updated, error: updError } = await supabase
      .from('babel_vault_items')
      .update({ storage_path: storagePath })
      .eq('id', row.id)
      .select()
      .single();
    if (updError) throw new Error('Saved the photo but could not link it. Contact support.');
    return updated;
  }
  // note / credential
  const { ciphertextB64, ivB64, saltB64 } = await encryptText(textContent, passphrase);
  const { data, error } = await supabase
    .from('babel_vault_items')
    .insert({
      owner_id: userId,
      item_type: itemType,
      name: cleanName,
      ciphertext: ciphertextB64,
      iv: ivB64,
      salt: saltB64,
      mime_type: 'text/plain',
      storage_path: null,
    })
    .select()
    .single();
  if (error) throw new Error('Could not save the vault entry. Please try again.');
  return data;
}

export async function listVaultItems({ supabase, userId }) {
  const { data, error } = await supabase
    .from('babel_vault_items')
    .select('id, item_type, name, mime_type, created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load the vault. Please try again.');
  return data || [];
}

async function getItemSecrets({ supabase, itemId }) {
  const { data, error } = await supabase
    .from('babel_vault_items')
    .select('id, item_type, iv, salt, ciphertext, storage_path, mime_type')
    .eq('id', itemId)
    .single();
  if (error || !data) throw new Error('Could not find that item.');
  return data;
}

/**
 * Decrypt one item with its passphrase.
 * Returns { kind: 'text', text } or { kind: 'photo', blob, mimeType }.
 * Throws a clean "wrong passphrase" error when decryption fails.
 */
export async function openVaultItem({ supabase, itemId, passphrase }) {
  const item = await getItemSecrets({ supabase, itemId });
  const iv = b64ToU8(item.iv);
  const salt = b64ToU8(item.salt);
  let plainBytes;
  try {
    if (item.item_type === 'photo') {
      const { data, error } = await supabase.storage.from(VAULT_BUCKET).download(item.storage_path);
      if (error || !data) throw new Error('Could not download the encrypted photo.');
      const buf = new Uint8Array(await data.arrayBuffer());
      plainBytes = await decryptBytes(buf, passphrase, iv, salt);
      const blob = new Blob([plainBytes], { type: item.mime_type || 'image/jpeg' });
      return { kind: 'photo', blob, mimeType: item.mime_type };
    }
    const text = await decryptText(item.ciphertext, passphrase, item.iv, item.salt);
    return { kind: 'text', text };
  } catch (e) {
    if (e && (e.name === 'OperationError' || /decrypt|passphrase/i.test(e.message || ''))) {
      throw new Error('Wrong passphrase — this item stays locked.');
    }
    throw e;
  }
}

export async function deleteVaultItem({ supabase, itemId }) {
  const item = await getItemSecrets({ supabase, itemId });
  if (item.item_type === 'photo' && item.storage_path) {
    await supabase.storage.from(VAULT_BUCKET).remove([item.storage_path]);
  }
  const { error } = await supabase.from('babel_vault_items').delete().eq('id', itemId);
  if (error) throw new Error('Could not delete that item. Please try again.');
}

export function describeItemType(t) {
  return t === 'photo' ? 'Photo' : t === 'credential' ? 'Account credential' : 'Note';
}
