// lib/agora/validation.js
// Pure validation for AGORA inputs. Returns null when valid, or a plain-English
// error message when not.

import { isValidCategory } from './categories.js';

const LIMITS = {
  titleMin: 4,
  titleMax: 120,
  bodyMin: 1,
  bodyMax: 5000,
  commentMin: 1,
  commentMax: 1000,
  nameMin: 2,
  nameMax: 30,
  bioMax: 300,
};

export { LIMITS };

function checkLength(value, min, max, label) {
  const len = (value || '').trim().length;
  if (len < min) return `${label} is too short (minimum ${min} characters).`;
  if (len > max) return `${label} is too long (maximum ${max} characters).`;
  return null;
}

export function validatePost({ title, body, category }) {
  const t = checkLength(title, LIMITS.titleMin, LIMITS.titleMax, 'Title');
  if (t) return t;
  const b = checkLength(body, LIMITS.bodyMin, LIMITS.bodyMax, 'Post');
  if (b) return b;
  if (!isValidCategory(category)) return 'Please choose a valid category.';
  return null;
}

export function validateComment({ body }) {
  return checkLength(body, LIMITS.commentMin, LIMITS.commentMax, 'Comment');
}

export function validateProfile({ displayName, bio }) {
  const n = checkLength(displayName, LIMITS.nameMin, LIMITS.nameMax, 'Display name');
  if (n) return n;
  if (!/^[a-zA-Z0-9 _.'-]+$/.test(displayName.trim())) {
    return 'Display name can only use letters, numbers, spaces, and . _ \' -';
  }
  const b = checkLength(bio || '', 0, LIMITS.bioMax, 'Bio');
  if (b) return b;
  return null;
}

export function sanitizeText(value, max) {
  return (value || '').trim().slice(0, max);
}
