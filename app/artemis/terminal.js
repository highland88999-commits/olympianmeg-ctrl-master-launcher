// Artemis OS — pretend terminal interpreter (pure logic, no DOM).
// Every command is local fiction: no system access, no network.

import { APPS } from './os.js';

const BOOT_TIME = Date.now();

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const sec = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

const HELP_LINES = [
  'ARTEMIS TERMINAL — pretend shell, real keystrokes.',
  '  help              this list',
  '  apps              list installed apps',
  '  launch <app>      open an app (e.g. launch monitor)',
  '  about             what this interface is',
  '  whoami            your illustrious title',
  '  uptime            session uptime',
  '  date              current date/time',
  '  echo <text>       say it back',
  '  clear             clear the screen',
];

// runCommand(input, ctx) -> { lines: string[], action: null | { type: 'launch', appId } | { type: 'clear' } }
export function runCommand(rawInput, ctx = {}) {
  const input = (rawInput || '').trim();
  if (!input) return { lines: [], action: null };
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(' ');
  const c = cmd.toLowerCase();

  switch (c) {
    case 'help':
      return { lines: HELP_LINES, action: null };
    case 'apps': {
      const lines = ['INSTALLED APPS:'];
      for (const a of APPS) lines.push(`  ${a.id.padEnd(10)} ${a.name} — ${a.tagline}`);
      return { lines, action: null };
    }
    case 'launch':
    case 'open':
    case 'start':
    case 'run': {
      const q = arg.toLowerCase();
      const hit = APPS.find(
        (a) => a.id === q || a.name.toLowerCase() === q || a.id.startsWith(q)
      );
      if (!hit) {
        return {
          lines: [`unknown app: "${arg}". try "apps".`],
          action: null,
        };
      }
      return {
        lines: [`launching ${hit.name}…`],
        action: { type: 'launch', appId: hit.id },
      };
    }
    case 'about':
      return {
        lines: [
          'Artemis is a concept interface — a playable sketch of an OS,',
          'not an operating system. It cannot see your files, your',
          'network, or your machine. Everything here is procedural',
          'fiction rendered in this browser tab.',
        ],
        action: null,
      };
    case 'whoami':
      return { lines: ['guest — commander of nothing, admirer of stars.'], action: null };
    case 'uptime':
      return {
        lines: [`session uptime ${formatUptime(Date.now() - (ctx.bootTime ?? BOOT_TIME))}`],
        action: null,
      };
    case 'date':
      return { lines: [new Date().toString()], action: null };
    case 'echo':
      return { lines: [arg], action: null };
    case 'clear':
      return { lines: [], action: { type: 'clear' } };
    case 'motd':
      return { lines: bootLines(), action: null };
    default:
      return {
        lines: [`command not found: ${cmd}. try "help".`],
        action: null,
      };
  }
}

export function bootLines() {
  return [
    'ARTEMIS OS v1.0 — concept build',
    'kernel: imagination-1.0 (pretend)',
    'mounting /dev/wonder … ok',
    'starting window manager … ok',
    'calibrating starfield … ok',
    'type "help" to begin.',
  ];
}
