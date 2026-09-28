// Forge — save-to-device helpers. Filenames are sanitized so a tab name can
// never escape the download or inject path separators. Blob URLs only.

export function sanitizeFilename(name, ext) {
  let base = String(name == null ? '' : name)
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .slice(0, 80);
  if (!base) base = 'untitled';
  let e = String(ext == null ? '.txt' : ext);
  if (e.charAt(0) !== '.') e = '.' + e;
  e = e.replace(/[\\/:*?"<>|]/g, '').slice(0, 8);
  if (!e || e === '.') e = '.txt';
  return base + e;
}

export function triggerDownload(filename, text) {
  const blob = new Blob([String(text == null ? '' : text)], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
