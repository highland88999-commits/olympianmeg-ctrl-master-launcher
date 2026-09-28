/*
 * Architect Artemis — command engine (pure logic, no DOM, no network).
 *
 * This module is fully local: it parses typed or spoken commands and
 * produces reply lines plus small "actions" the page component carries out
 * (navigate, speak, toggle the microphone, clear the log). Nothing here
 * calls a model or a server — anything that would have needed the old
 * Gemini backend is served by the clearly-labeled `demo` script instead.
 */

export const MODE_LABEL = 'SIMULATED — local demo';

export const LAUNCHABLE_MODULES = [
  { route: '/artemis', name: 'Artemis', blurb: 'The Artemis desktop environment.' },
  { route: '/architect-artemis', name: 'Architect Artemis', blurb: 'This voice-assistant console.' },
  { route: '/agora', name: 'Agora', blurb: 'The community town square.' },
  { route: '/oasis', name: 'Oasis', blurb: 'Multiplayer rooms and gamer profiles.' },
  { route: '/chess', name: 'Chess', blurb: 'Play chess against the house or a friend.' },
  { route: '/basketball', name: 'Basketball', blurb: 'Streetball shootout game.' },
  { route: '/colosseum', name: 'Colosseum', blurb: 'Arena battler.' },
  { route: '/babel', name: 'Babel', blurb: 'Tower of pocket universes.' },
  { route: '/underworld', name: 'Underworld', blurb: 'Game discovery catalog.' },
  { route: '/world-engine', name: 'World Engine', blurb: '3D world-builder studio.' },
];

export const PERSONA = {
  name: 'Architect Artemis',
  tagline: 'A voice-assistant console, rebuilt as an honest local demo.',
  description:
    'Architect Artemis started life as a voice assistant backed by a cloud AI service. ' +
    'This version keeps the console idea — a place where you type or speak commands and ' +
    'get answers — but everything runs in your browser. There is no account, no ' +
    'microphone recording sent anywhere, and no AI model on the other end. ' +
    'Voice input and spoken replies use the speech tools built into your browser, ' +
    'only when you turn them on.',
  principles: [
    'Local first: commands run on your device.',
    'Labeled simulation: the demo script says what it is.',
    'No silent recording: the mic only listens while you hold or toggle it.',
    'Plain answers: no pretending to be a live model.',
  ],
};

const DEMO_SCRIPT = [
  { kind: 'sys', text: '--- Demo script (SIMULATED) ---' },
  { kind: 'out', text: 'Checking the local console…' },
  { kind: 'out', text: 'Console: ready. Voice tools: ' },
  { kind: 'out', text: 'Sample request: "what time is it" → answered from your device clock.' },
  { kind: 'out', text: 'Sample request: "launch oasis" → would open the Oasis room list.' },
  { kind: 'out', text: 'That is the whole trick: scripted replies, labeled as scripted.' },
  { kind: 'sys', text: '--- End of demo script ---' },
];

export function createState() {
  return { mode: 'console', demoIndex: 0 };
}

/**
 * Split raw input into a command name and argument list.
 * Returns { command, args, raw }. Empty input yields command ''.
 */
export function parseCommand(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { command: '', args: [], raw: '' };
  const parts = raw.split(/\s+/);
  return { command: parts[0].toLowerCase(), args: parts.slice(1), raw };
}

/** Suggest known commands that start with the given fragment. */
export function suggestCommands(fragment) {
  if (!fragment) return [];
  const names = COMMANDS.map((c) => c.name);
  const starts = names.filter((n) => n.startsWith(fragment));
  if (starts.length) return starts;
  return names.filter((n) => n.includes(fragment));
}

export const COMMANDS = [
  { name: 'help', usage: 'help', description: 'Show this command list.' },
  { name: 'about', usage: 'about', description: 'What Architect Artemis is.' },
  { name: 'status', usage: 'status', description: 'Local console status.' },
  { name: 'time', usage: 'time', description: 'Show the current time from your device.' },
  { name: 'echo', usage: 'echo <text>', description: 'Repeat text back.' },
  { name: 'modules', usage: 'modules', description: 'List modules you can launch.' },
  { name: 'launch', usage: 'launch <module>', description: 'Open a launcher module by name.' },
  { name: 'demo', usage: 'demo', description: 'Run the labeled simulation script.' },
  { name: 'voice', usage: 'voice on | off', description: 'Turn the microphone on or off.' },
  { name: 'speak', usage: 'speak on | off', description: 'Turn spoken replies on or off.' },
  { name: 'clear', usage: 'clear', description: 'Clear the console.' },
];

function line(text, kind) {
  return { text, kind: kind || 'out' };
}

function helpLines() {
  const rows = COMMANDS.map((c) => `  ${c.usage.padEnd(22, ' ')} ${c.description}`);
  return [line('Available commands:', 'sys'), ...rows.map((r) => line(r, 'out'))];
}

function statusLines(context) {
  const ctx = context || {};
  return [
    line('Console status (local, nothing leaves your device):', 'sys'),
    line(`  Mode: ${MODE_LABEL}`),
    line(`  Voice input supported: ${ctx.voiceInput ? 'yes' : 'no'}`),
    line(`  Spoken replies supported: ${ctx.voiceOutput ? 'yes' : 'no'}`),
    line(`  Microphone: ${ctx.micOn ? 'on' : 'off'}   Spoken replies: ${ctx.speakOn ? 'on' : 'off'}`),
    line(`  Launchable modules: ${LAUNCHABLE_MODULES.length}`),
  ];
}

function findModule(query) {
  const q = String(query || '').toLowerCase().replace(/^\//, '');
  return LAUNCHABLE_MODULES.find(
    (m) => m.name.toLowerCase() === q || m.route.slice(1) === q
  );
}

function demoScript(context) {
  const ctx = context || {};
  const voiceText = ctx.voiceInput ? 'available in this browser' : 'not available in this browser';
  return DEMO_SCRIPT.map((l) =>
    l.text === 'Console: ready. Voice tools: '
      ? line(`Console: ready. Voice tools: ${voiceText}.`, l.kind)
      : line(l.text, l.kind)
  );
}

/**
 * Execute one parsed command. Pure: no DOM, no I/O.
 * Returns { lines, state, action } where action is optional and one of:
 *   { type: 'navigate', to } | { type: 'mic', on } | { type: 'speak', on } |
 *   { type: 'clear' } | { type: 'say', text }
 */
export function executeCommand(state, parsed, context) {
  const next = { mode: state.mode, demoIndex: state.demoIndex };
  const ctx = context || {};
  const respond = (lines, action) => ({ lines, state: next, action: action || null });

  const { command, args } = parsed;
  if (!command) return respond([]);

  switch (command) {
    case 'help':
      return respond(helpLines());

    case 'about':
      return respond([
        line(`${PERSONA.name} — ${PERSONA.tagline}`, 'sys'),
        line(PERSONA.description),
        line('Ground rules:', 'sys'),
        ...PERSONA.principles.map((p) => line(`  • ${p}`)),
      ]);

    case 'status':
      return respond(statusLines(ctx));

    case 'time': {
      const now = ctx.now instanceof Date ? ctx.now : new Date();
      return respond([line(`It is ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}.`)]);
    }

    case 'echo':
      return respond([line(args.join(' ') || '(nothing to repeat)')]);

    case 'modules':
      return respond([
        line('Modules you can launch:', 'sys'),
        ...LAUNCHABLE_MODULES.map((m) => line(`  ${m.name.toLowerCase().padEnd(18, ' ')} ${m.blurb}`)),
        line('Tip: type "launch oasis" to open one.', 'sys'),
      ]);

    case 'launch': {
      const target = findModule(args[0]);
      if (!target) {
        const names = LAUNCHABLE_MODULES.map((m) => m.name.toLowerCase()).join(', ');
        return respond([
          line(`I do not know a module called "${args[0] || ''}".`, 'err'),
          line(`Try one of: ${names}`),
        ]);
      }
      return respond(
        [line(`Opening ${target.name}…`, 'sys')],
        { type: 'navigate', to: target.route }
      );
    }

    case 'demo':
      return respond(demoScript(ctx));

    case 'voice': {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') return respond([line('Microphone on. Speak a command.', 'sys')], { type: 'mic', on: true });
      if (sub === 'off') return respond([line('Microphone off.', 'sys')], { type: 'mic', on: false });
      return respond([line('Usage: voice on | off')]);
    }

    case 'speak': {
      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') return respond([line('Spoken replies on.', 'sys')], { type: 'speak', on: true });
      if (sub === 'off') return respond([line('Spoken replies off.', 'sys')], { type: 'speak', on: false });
      return respond([line('Usage: speak on | off')]);
    }

    case 'clear':
      return respond([], { type: 'clear' });

    default: {
      const suggestions = suggestCommands(command);
      const hint = suggestions.length ? ` Did you mean: ${suggestions.slice(0, 3).join(', ')}?` : '';
      return respond([
        line(`Unknown command "${command}".${hint}`, 'err'),
        line('Type "help" to see what I understand.'),
      ]);
    }
  }
}
