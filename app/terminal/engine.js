// app/terminal/engine.js
// NEON SHELL — pure command engine. No DOM, no network, no side effects.
// Shared by the /terminal console and the /holoframe monitor shells.
// CommonJS so Node headless tests can require() it directly.

'use strict';

const VERSION = '3.5.0';
const HOST = 'neon-shell';

const BOOT_FS = () => ({
  type: 'dir',
  children: {
    'README.md': {
      type: 'file',
      content: [
        '# NEON SHELL',
        '',
        'A pocket console. Everything here lives on this device only.',
        'Type `help` to see what you can do.',
        '',
        'Try: `neofetch`, `cat docs/commands.txt`, `nano notes.txt`',
      ].join('\n'),
    },
    'docs': {
      type: 'dir',
      children: {
        'commands.txt': {
          type: 'file',
          content: [
            'COMMAND REFERENCE',
            '=================',
            'help                 show this reference',
            'ls [path]            list directory contents',
            'cd <dir>             change directory (.., /, ~ supported)',
            'pwd                  print working directory',
            'cat <file>           print file contents',
            'echo <text> [> f]    print text, or write it to a file',
            'touch <file>         create an empty file',
            'mkdir <dir>          create a directory',
            'rm [-r] <path>       delete a file (dirs need -r)',
            'nano <file>          open the file editor',
            'clear                clear the screen',
            'history              show command history',
            'whoami               who is logged in',
            'date                 current date and time',
            'neofetch             system summary card',
            'matrix               falling-code visual (fx)',
            'hack                 dramatic fake hack sequence (fx)',
            'theme <name>         neon | amber | ghost',
            'about                about this console',
            'sudo <cmd>           do not.',
          ].join('\n'),
        },
        'about.txt': {
          type: 'file',
          content: [
            'NEON SHELL v' + VERSION,
            'A self-contained console for the master launcher.',
            'No cloud. No accounts. No telemetry. Just a shell.',
          ].join('\n'),
        },
      },
    },
    'secrets.txt': {
      type: 'file',
      content: 'The real treasure was the commands you typed along the way.',
    },
  },
});

function createState() {
  return {
    user: 'guest',
    host: HOST,
    cwd: '/',
    history: [],
    theme: 'neon',
    fs: BOOT_FS(),
  };
}

function splitPath(p) {
  return String(p).split('/').filter(Boolean);
}

// Quote-aware tokenizer: echo "hello world" > out.txt
function tokenize(input) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur) { tokens.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

// Resolve a path against state.cwd. Returns { node, path } or { error }.
function resolvePath(state, input) {
  const raw = input == null || input === '' ? '.' : String(input);
  let p = raw;
  if (p.startsWith('~')) p = '/' + p.slice(1);
  const abs = p.startsWith('/')
    ? p
    : (state.cwd === '/' ? '/' + p : state.cwd + '/' + p);
  const parts = [];
  for (const seg of splitPath(abs)) {
    if (seg === '.' || seg === '') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  let node = state.fs;
  for (const seg of parts) {
    if (!node || node.type !== 'dir' || !node.children || !node.children[seg]) {
      return { error: 'No such file or directory: ' + raw };
    }
    node = node.children[seg];
  }
  return { node, path: '/' + parts.join('/') };
}

// Resolve the parent dir of a path for creation commands.
function resolveParent(state, input) {
  const raw = String(input);
  let p = raw;
  if (p.startsWith('~')) p = '/' + p.slice(1);
  const abs = p.startsWith('/')
    ? p
    : (state.cwd === '/' ? '/' + p : state.cwd + '/' + p);
  const parts = [];
  for (const seg of splitPath(abs)) {
    if (seg === '.' || seg === '') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  if (parts.length === 0) return { error: 'Invalid path: ' + raw };
  const name = parts.pop();
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return { error: 'Invalid name: ' + name };
  let node = state.fs;
  for (const seg of parts) {
    if (!node || node.type !== 'dir' || !node.children[seg]) {
      return { error: 'No such file or directory: ' + raw };
    }
    node = node.children[seg];
    if (node.type !== 'dir') return { error: 'Not a directory: ' + raw };
  }
  return { parent: node, name, path: '/' + [...parts, name].join('/') };
}

function line(text, cls) {
  return { text: String(text), cls: cls || '' };
}

function lsLines(node) {
  const names = Object.keys(node.children || {}).sort((a, b) => {
    const ta = node.children[a].type === 'dir' ? 0 : 1;
    const tb = node.children[b].type === 'dir' ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });
  if (names.length === 0) return [line('(empty)', 'dim')];
  return names.map((n) => {
    const child = node.children[n];
    const isDir = child.type === 'dir';
    const size = isDir
      ? Object.keys(child.children || {}).length + ' items'
      : (child.content || '').length + ' B';
    return line((isDir ? '[DIR]  ' : '[FILE] ') + n + '   ' + size, isDir ? 'info' : '');
  });
}

function neofetchLines(state) {
  const art = [
    '   .-""""-.',
    '  / .--. \\      NEON SHELL',
    ' | (o)(o) |     ──────────',
    '  \\  --  /      user: ' + state.user + '@' + state.host,
    '   |    |       shell: neon-sh ' + VERSION,
    '  /|    |\\      theme: ' + state.theme,
    ' (_/    \\_)     storage: this device only',
  ];
  return art.map((a) => line(a, 'info'));
}

const HACK_LINES = [
  '> establishing secure channel ............ OK',
  '> spoofing MAC address ................... OK',
  '> bypassing firewall ..................... OK',
  '> injecting payload ...................... OK',
  '> escalating privileges .................. OK',
  '> downloading the entire internet ........ 12%',
  '> downloading the entire internet ........ 87%',
  '> just kidding. nothing happened.',
  '> this console phones home to absolutely no one.',
];

function runCommand(state, rawInput) {
  const raw = String(rawInput == null ? '' : rawInput).trim();
  const out = { lines: [], action: null };
  if (!raw) return out;
  state.history.push(raw);

  const tokens = tokenize(raw);
  const cmd = (tokens[0] || '').toLowerCase();
  const args = tokens.slice(1);

  const ok = (t, c) => out.lines.push(line(t, c || ''));
  const err = (t) => out.lines.push(line(t, 'err'));

  switch (cmd) {
    case 'help':
      ok('NEON SHELL commands:', 'info');
      ok('  help  ls  cd  pwd  cat  echo  touch  mkdir  rm  nano  clear');
      ok('  history  whoami  date  neofetch  matrix  hack  theme  about');
      ok('Tip: `cat docs/commands.txt` for the full reference.', 'dim');
      break;

    case 'ls': {
      const target = args[0] || '.';
      const r = resolvePath(state, target);
      if (r.error) { err(r.error); break; }
      if (r.node.type === 'file') { ok(r.path.split('/').pop(), ''); break; }
      out.lines.push(...lsLines(r.node));
      break;
    }

    case 'cd': {
      const target = args[0] || '/';
      const r = resolvePath(state, target);
      if (r.error) { err(r.error); break; }
      if (r.node.type !== 'dir') { err('Not a directory: ' + target); break; }
      state.cwd = r.path;
      break;
    }

    case 'pwd':
      ok(state.cwd);
      break;

    case 'cat': {
      if (!args[0]) { err('Usage: cat <file>'); break; }
      const r = resolvePath(state, args[0]);
      if (r.error) { err(r.error); break; }
      if (r.node.type !== 'file') { err('Is a directory: ' + args[0]); break; }
      (r.node.content || '').split('\n').forEach((l) => ok(l));
      break;
    }

    case 'echo': {
      const redir = args.indexOf('>');
      if (redir !== -1) {
        const dest = args[redir + 1];
        if (!dest) { err('Usage: echo <text> > <file>'); break; }
        const text = args.slice(0, redir).join(' ');
        const rp = resolveParent(state, dest);
        if (rp.error) { err(rp.error); break; }
        if (rp.parent.children[rp.name] && rp.parent.children[rp.name].type === 'dir') {
          err('Is a directory: ' + dest); break;
        }
        rp.parent.children[rp.name] = { type: 'file', content: text + '\n' };
      } else {
        ok(args.join(' '));
      }
      break;
    }

    case 'touch': {
      if (!args[0]) { err('Usage: touch <file>'); break; }
      const rp = resolveParent(state, args[0]);
      if (rp.error) { err(rp.error); break; }
      if (!rp.parent.children[rp.name]) {
        rp.parent.children[rp.name] = { type: 'file', content: '' };
      }
      break;
    }

    case 'mkdir': {
      if (!args[0]) { err('Usage: mkdir <dir>'); break; }
      const rp = resolveParent(state, args[0]);
      if (rp.error) { err(rp.error); break; }
      if (rp.parent.children[rp.name]) { err('Already exists: ' + args[0]); break; }
      rp.parent.children[rp.name] = { type: 'dir', children: {} };
      ok('created ' + rp.path, 'ok');
      break;
    }

    case 'rm': {
      const flags = args.filter((a) => a.startsWith('-'));
      const target = args.find((a) => !a.startsWith('-'));
      if (!target) { err('Usage: rm [-r] <path>'); break; }
      const rp = resolveParent(state, target);
      if (rp.error) { err(rp.error); break; }
      const node = rp.parent.children[rp.name];
      if (!node) { err('No such file or directory: ' + target); break; }
      if (node.type === 'dir' && !flags.includes('-r')) {
        err('Is a directory (use rm -r): ' + target); break;
      }
      delete rp.parent.children[rp.name];
      ok('removed ' + target, 'ok');
      break;
    }

    case 'nano':
    case 'edit': {
      if (!args[0]) { err('Usage: nano <file>'); break; }
      const rp = resolveParent(state, args[0]);
      if (rp.error) { err(rp.error); break; }
      const existing = rp.parent.children[rp.name];
      if (existing && existing.type === 'dir') { err('Is a directory: ' + args[0]); break; }
      if (!existing) rp.parent.children[rp.name] = { type: 'file', content: '' };
      out.action = { type: 'edit', path: rp.path };
      ok('Opening editor: ' + rp.path, 'info');
      break;
    }

    case 'clear':
      out.action = { type: 'clear' };
      break;

    case 'history':
      state.history.forEach((h, i) => ok('  ' + (i + 1) + '  ' + h, 'dim'));
      break;

    case 'whoami':
      ok(state.user);
      break;

    case 'date':
      ok(new Date().toString());
      break;

    case 'neofetch':
      out.lines.push(...neofetchLines(state));
      break;

    case 'matrix':
      out.action = { type: 'fx', fx: 'matrix' };
      ok('Entering the stream... (close to exit)', 'ok');
      break;

    case 'hack':
      out.action = { type: 'fx', fx: 'hack' };
      HACK_LINES.forEach((l) => ok(l, l.startsWith('> just') || l.startsWith('> this') ? 'warn' : 'ok'));
      break;

    case 'theme': {
      const t = (args[0] || '').toLowerCase();
      if (!['neon', 'amber', 'ghost'].includes(t)) {
        err('Usage: theme <neon|amber|ghost>');
        break;
      }
      state.theme = t;
      out.action = { type: 'theme', theme: t };
      ok('theme: ' + t, 'ok');
      break;
    }

    case 'about':
      ok('NEON SHELL v' + VERSION + ' — a pocket console.', 'info');
      ok('Zero network calls. Files persist on this device only.', 'dim');
      break;

    case 'sudo':
      err('nice try.');
      break;

    case 'exit':
    case 'quit':
    case 'logout':
      ok('There is no escape. (This is a joke. Close the tab.)', 'warn');
      break;

    default:
      err("command not found: " + tokens[0] + "  (try 'help')");
  }

  return out;
}

function promptFor(state) {
  const where = state.user + '@' + state.host + ':' + (state.cwd === '/' ? '~' : state.cwd);
  return where + '$';
}

function serialize(state) {
  return JSON.stringify({ fs: state.fs, history: state.history, theme: state.theme, cwd: state.cwd });
}

function deserialize(json) {
  const data = JSON.parse(json);
  const s = createState();
  if (data && data.fs && data.fs.type === 'dir') s.fs = data.fs;
  if (Array.isArray(data.history)) s.history = data.history.slice(-200);
  if (['neon', 'amber', 'ghost'].includes(data.theme)) s.theme = data.theme;
  if (typeof data.cwd === 'string') {
    const r = resolvePath(s, data.cwd);
    if (!r.error && r.node.type === 'dir') s.cwd = r.path;
  }
  return s;
}

module.exports = {
  VERSION,
  createState,
  tokenize,
  resolvePath,
  resolveParent,
  runCommand,
  promptFor,
  serialize,
  deserialize,
  HACK_LINES,
};
