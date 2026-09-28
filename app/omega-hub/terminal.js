// Simulated local terminal for the Omega Hub.
// The source repo's auth-terminal.js was a cloud sign-in widget
// ("NEURAL LINK / INITIALIZE IDENTITY") plus a cloud-backed inventory.
// Both required live backends and credentials, so they are replaced here:
// this terminal is a pretend shell that runs entirely in the browser and
// says so on its face. Nothing leaves the device.

import { SECTORS, HAZARD_LABEL } from './content.js';

export const TERMINAL_BANNER = [
  'OMEGA TERMINAL v2.1 — LOCAL SIMULATION',
  'No account, no network, no uplink. Type HELP for commands.',
];

export function runCommand(rawInput, ctx) {
  const input = rawInput.trim();
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(' ');
  const c = (cmd || '').toLowerCase();

  switch (c) {
    case '':
      return { lines: [] };
    case 'help':
      return {
        lines: [
          'COMMANDS:',
          '  HELP            this list',
          '  WHOAMI          show the local guest profile',
          '  SECTORS         list known sectors',
          '  SCAN <sector>   run a (simulated) deep scan',
          '  BACKPACK        peek at your local loadout',
          '  CLEAR           wipe the terminal',
          '  ABOUT           what this terminal is',
        ],
      };
    case 'whoami':
      return { lines: [`guest operator — profile "${ctx.guestTag}" (stored on this device only)`] };
    case 'sectors':
      return {
        lines: SECTORS.map(
          (s) => `  ${s.id.padEnd(15)} ${s.name.padEnd(15)} [${HAZARD_LABEL[s.hazard]}]`
        ),
      };
    case 'scan': {
      const sector = SECTORS.find((s) => s.id === arg.toLowerCase().replace(/\s+/g, '-'));
      if (!sector) return { lines: [`SCAN failed: unknown sector "${arg}". Try SECTORS.`] };
      const pct = 60 + ((arg.length * 37) % 40);
      return {
        lines: [
          `SCANNING ${sector.name} ...`,
          `  signal integrity ..... ${pct}%`,
          `  hazard level ......... ${HAZARD_LABEL[sector.hazard]}`,
          `  life signs ........... none detected (simulated)`,
          `  verdict .............. ${sector.hazard === 0 ? 'safe to visit' : 'proceed with care'}`,
        ],
      };
    }
    case 'backpack': {
      const items = ctx.backpackSummary();
      return { lines: items.length === 0 ? ['backpack empty — visit the BACKPACK tab to gear up'] : ['BACKPACK:'].concat(items) };
    }
    case 'clear':
      return { lines: [], clear: true };
    case 'about':
      return {
        lines: [
          'This terminal pretends to be a network console.',
          'Every response is generated locally in your browser.',
          'The original needed a cloud login; this one needs nothing.',
        ],
      };
    default:
      return { lines: [`unknown command "${cmd}". Type HELP.`] };
  }
}
