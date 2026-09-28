// Gateway directory data for the Ecosystem Gateway.
// Rebuilt from the Omegalodon repo ("ECOSYSTEM GATEWAY" / ecosystem-gateway).
// The source listed four platforms as outbound links to hosted apps with
// looping video backgrounds and a sign-in button that never signed in
// (plus a hardcoded "Logged in as" name). This version keeps the directory
// idea but everything is local: the Omega Hub card links to the /omega-hub
// route in this build, the other nodes are shown as offline placeholders,
// and sign-in is an explicitly simulated guest session.

export const PLATFORMS = [
  {
    id: 'nexus-world-engine',
    title: 'Nexus World Engine',
    description: 'Explore the digital world map and global directory.',
    status: 'OFFLINE',
    route: null,
    note: 'External node — not linked in this offline build.',
  },
  {
    id: 'omega-hub',
    title: 'Omega Hub',
    description: 'Your central control panel and user dashboard.',
    status: 'ONLINE',
    route: '/omega-hub',
    note: null,
  },
  {
    id: 'dominion-auction-house',
    title: 'Dominion Auction House',
    description: 'Trade, bid, and acquire digital assets.',
    status: 'OFFLINE',
    route: null,
    note: 'External node — not linked in this offline build.',
  },
  {
    id: 'network-messages',
    title: 'Network Messages',
    description: 'Encrypted global and direct communications.',
    status: 'OFFLINE',
    route: null,
    note: 'External node — not linked in this offline build.',
  },
];

export function makeGuestTag() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'Guest-' + s;
}

// Small starter field kit for the gateway backpack panel.
export const FIELD_KIT = [
  { id: 'kit-lantern', name: 'Pulse Lantern' },
  { id: 'kit-chart', name: 'Star Chart' },
  { id: 'kit-flare', name: 'Signal Flare' },
];
