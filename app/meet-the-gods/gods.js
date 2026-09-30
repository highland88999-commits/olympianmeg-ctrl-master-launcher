// gods.js — the pantheon codex data and its query helpers.
// Fourteen deities of the Greek pantheon with plain-English entries.
// No DOM, no network.

export const GODS = [
  {
    id: 'zeus',
    name: 'Zeus',
    greek: 'Ζεύς',
    roman: 'Jupiter',
    domains: ['Sky', 'Kingship'],
    epithets: ['Cloud-Gatherer', 'Father of Gods and Men'],
    symbols: ['Thunderbolt', 'Eagle', 'Oak'],
    color: '#ffd75e',
    summary:
      'King of the Olympian gods and ruler of the sky. He overthrew his father Cronus, divided the world with his brothers, and keeps order among gods and mortals — often by thunderbolt.',
  },
  {
    id: 'hera',
    name: 'Hera',
    greek: 'Ἥρα',
    roman: 'Juno',
    domains: ['Marriage', 'Family'],
    epithets: ['Queen of Heaven', 'Ox-Eyed'],
    symbols: ['Peacock', 'Diadem', 'Pomegranate'],
    color: '#f2f2f2',
    summary:
      'Queen of the gods and goddess of marriage. Fiercely protective of wedlock and family bonds, she is one of the most powerful voices on Olympus and rarely backs down from a quarrel.',
  },
  {
    id: 'poseidon',
    name: 'Poseidon',
    greek: 'Ποσειδῶν',
    roman: 'Neptune',
    domains: ['Sea', 'Earthquakes'],
    epithets: ['Earth-Shaker', 'Lord of Horses'],
    symbols: ['Trident', 'Horse', 'Dolphin'],
    color: '#38bdf8',
    summary:
      'God of the sea, storms, and earthquakes. He rules the oceans with his trident, calms or raises the waves at will, and is patron of sailors and of horses.',
  },
  {
    id: 'demeter',
    name: 'Demeter',
    greek: 'Δημήτηρ',
    roman: 'Ceres',
    domains: ['Harvest', 'Agriculture'],
    epithets: ['Grain-Mother', 'Bringer of Seasons'],
    symbols: ['Wheat Sheaf', 'Torch', 'Poppy'],
    color: '#a3e635',
    summary:
      'Goddess of grain and the harvest. When her daughter Persephone was taken to the underworld, her grief stopped the crops from growing — the first winter.',
  },
  {
    id: 'athena',
    name: 'Athena',
    greek: 'Ἀθηνᾶ',
    roman: 'Minerva',
    domains: ['Wisdom', 'Warfare'],
    epithets: ['Grey-Eyed', 'Pallas'],
    symbols: ['Owl', 'Olive Branch', 'Aegis'],
    color: '#94a3b8',
    summary:
      'Goddess of wisdom and strategic warfare, born fully armed from the head of Zeus. Patron of Athens, of craftspeople, and of heroes who win by thinking first.',
  },
  {
    id: 'apollo',
    name: 'Apollo',
    greek: 'Ἀπόλλων',
    roman: 'Apollo',
    domains: ['Sun', 'Music', 'Prophecy'],
    epithets: ['Far-Shooter', 'Lord of Delphi'],
    symbols: ['Lyre', 'Laurel', 'Bow'],
    color: '#ffd700',
    summary:
      'God of the sun, music, and prophecy. He drives the sun across the sky, leads the Muses, and speaks through the oracle at Delphi. Twin brother of Artemis.',
  },
  {
    id: 'artemis',
    name: 'Artemis',
    greek: 'Ἄρτεμις',
    roman: 'Diana',
    domains: ['Hunt', 'Moon', 'Wilderness'],
    epithets: ['Mistress of Animals', 'Arrow-Showering'],
    symbols: ['Bow', 'Deer', 'Cypress'],
    color: '#c4b5fd',
    summary:
      'Goddess of the hunt, the moon, and wild places. She roams the forests with her nymphs, protects young creatures, and never misses with her silver bow.',
  },
  {
    id: 'ares',
    name: 'Ares',
    greek: 'Ἄρης',
    roman: 'Mars',
    domains: ['War', 'Courage'],
    epithets: ['Sacker of Cities', 'Bronze-Clad'],
    symbols: ['Spear', 'Helmet', 'Boar'],
    color: '#ef4444',
    summary:
      'God of war in its rawest form — battle-fury, courage, and chaos. The other gods keep their distance from his temper, but soldiers pray to him before every fight.',
  },
  {
    id: 'aphrodite',
    name: 'Aphrodite',
    greek: 'Ἀφροδίτη',
    roman: 'Venus',
    domains: ['Love', 'Beauty'],
    epithets: ['Foam-Born', 'Golden'],
    symbols: ['Dove', 'Rose', 'Mirror'],
    color: '#f9a8d4',
    summary:
      'Goddess of love and beauty, born from sea foam. Her influence moves gods and mortals alike, and few stories on Olympus unfold without her fingerprints.',
  },
  {
    id: 'hephaestus',
    name: 'Hephaestus',
    greek: 'Ἥφαιστος',
    roman: 'Vulcan',
    domains: ['Forge', 'Craft'],
    epithets: ['Smith of the Gods', 'Lame God'],
    symbols: ['Hammer', 'Anvil', 'Tongs'],
    color: '#fb923c',
    summary:
      'God of the forge and master craftsman. Cast from Olympus for his lameness, he built his workshop under a volcano and forged the weapons of gods and heroes.',
  },
  {
    id: 'hermes',
    name: 'Hermes',
    greek: 'Ἑρμῆς',
    roman: 'Mercury',
    domains: ['Messages', 'Travelers', 'Trade'],
    epithets: ['Messenger', 'Guide of Souls'],
    symbols: ['Caduceus', 'Winged Sandals', 'Tortoise'],
    color: '#67e8f9',
    summary:
      'Swift messenger of the gods and guide of travelers, merchants, and thieves. He invented the lyre on the day he was born and can cross any distance in a breath.',
  },
  {
    id: 'dionysus',
    name: 'Dionysus',
    greek: 'Διόνυσος',
    roman: 'Bacchus',
    domains: ['Wine', 'Theatre', 'Ecstasy'],
    epithets: ['Twice-Born', 'Liberator'],
    symbols: ['Grapevine', 'Thyrsus', 'Panther'],
    color: '#c084fc',
    summary:
      'God of wine, theatre, and ecstatic celebration. The youngest Olympian, born twice, he loosens tongues and rules, patron of masks, music, and the stage.',
  },
  {
    id: 'hades',
    name: 'Hades',
    greek: 'ᾍδης',
    roman: 'Pluto',
    domains: ['Underworld', 'Wealth'],
    epithets: ['Host of Many', 'Unseen One'],
    symbols: ['Helm of Darkness', 'Cerberus', 'Cypress'],
    color: '#64748b',
    summary:
      'Ruler of the underworld and keeper of the dead. Stern but fair, he rarely leaves his realm and guards its gates with the three-headed hound Cerberus.',
  },
  {
    id: 'persephone',
    name: 'Persephone',
    greek: 'Περσεφόνη',
    roman: 'Proserpina',
    domains: ['Spring', 'Underworld'],
    epithets: ['Queen of the Dead', 'Maiden'],
    symbols: ['Pomegranate Seeds', 'Narcissus', 'Torch'],
    color: '#f0abfc',
    summary:
      'Daughter of Demeter and queen of the underworld. She spends part of each year below with Hades and part above with her mother — the turning of the seasons.',
  },
];

export const ALL_DOMAINS = [...new Set(GODS.flatMap((g) => g.domains))].sort();

export function getGod(id) {
  return GODS.find((g) => g.id === id) || null;
}

// Plain substring search across name, epithets, domains, and symbols.
export function searchGods(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return GODS;
  return GODS.filter((g) => {
    const hay = [g.name, g.roman, g.greek, ...g.domains, ...g.epithets, ...g.symbols]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function filterByDomain(domain) {
  if (!domain) return GODS;
  return GODS.filter((g) => g.domains.includes(domain));
}

export function searchAndFilter(query, domain) {
  const q = String(query || '').trim().toLowerCase();
  return GODS.filter((g) => {
    const domainOk = !domain || g.domains.includes(domain);
    if (!domainOk) return false;
    if (!q) return true;
    const hay = [g.name, g.roman, g.greek, ...g.domains, ...g.epithets, ...g.symbols]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
