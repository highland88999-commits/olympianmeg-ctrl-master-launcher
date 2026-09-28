// Olympus B2B — inquiry composer (pure, device-local, no network).

export const MAX_FIELD = 200;
export const MAX_DETAILS = 2000;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

export function validateInquiry({ name, contact, service, details }) {
  const errors = [];
  if (!clean(name, MAX_FIELD)) errors.push('name');
  if (!clean(contact, MAX_FIELD)) errors.push('contact');
  if (!clean(service, MAX_FIELD)) errors.push('service');
  if (!clean(details, MAX_DETAILS)) errors.push('details');
  return { valid: errors.length === 0, errors };
}

export function buildInquiry({ name, contact, service, details }) {
  const n = clean(name, MAX_FIELD);
  const c = clean(contact, MAX_FIELD);
  const s = clean(service, MAX_FIELD);
  const d = clean(details, MAX_DETAILS);
  return [
    'Project inquiry — composed on this device, nothing sent automatically.',
    '',
    `Name / Company: ${n}`,
    `Contact: ${c}`,
    `Service: ${s}`,
    '',
    'Details:',
    d,
    '',
    '---',
    'Send this to Olympus B2B to start the conversation.',
  ].join('\n');
}
