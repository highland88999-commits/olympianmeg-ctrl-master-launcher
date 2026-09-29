// lib/renewal-plan.js — Merlin's written product roadmap, verbatim.
//
// Source: "OLYMPUS MEET THE GODS RENEWAL PLAN // RENEWAL PLAN TIMELINE
// (ZIG-ZAG)" — the renewalTimeline array from his Gemini history.
// Titles, descriptions, demo videos, and original prototype links below are
// his words and his originals: do not rewrite them.
//
// Each node maps to a launcher module route where one exists. Nodes without
// a module keep their original prototype link only; the future node (8) has
// neither — it is marked honestly as unbuilt.

export const PLAN_TITLE = 'OLYMPUS MEET THE GODS RENEWAL PLAN';
export const PLAN_SUBTITLE = 'RENEWAL PLAN TIMELINE (ZIG-ZAG)';
export const PLAN_ROUTE = '/renewal-plan';

export const RENEWAL_PLAN_NODES = [
  {
    id: 'node-1',
    index: 1,
    title: 'OUTDOOR AIR PURIFIERS',
    description:
      'Air purifiers that utilize tensegrity technology and filter pollutants out of the air and push out clean air.',
    video: 'https://files.catbox.moe/dwurko.mp4',
    originalLink: 'https://air-filter-model.vercel.app',
    module: '/aetheris',
    status: 'built',
  },
  {
    id: 'node-2',
    index: 2,
    title: 'PURIFIER INSTALLATION TRACKING SYSTEM',
    description:
      'A system designed to track aetheris model installations and maintenance data.',
    video: 'https://files.catbox.moe/nfbuhd.mp4',
    originalLink: 'https://olympus-aetheris.vercel.app',
    module: '/olympus-aetheris',
    status: 'built',
  },
  {
    id: 'node-3',
    index: 3,
    title: 'AETHERIS BUSINESS MODEL',
    description: 'The detailed spec analysis of Aetheris.',
    video: 'https://files.catbox.moe/ssl22k.mp4',
    originalLink: 'https://aetheris-business-model.vercel.app',
    module: '/aetheris',
    status: 'built',
  },
  {
    id: 'node-4',
    index: 4,
    title: 'AURA GENESIS',
    description:
      'A car that uses wind turbine, solar panel and electric recycling technologies along with wind streaming tunnels built dynamically into the vehicle to allow less resistance, light weight travel with no combustion engine present.',
    video: 'https://files.catbox.moe/gibhfj.mp4',
    originalLink: 'https://aura-genesis.vercel.app',
    module: null,
    status: 'prototype',
  },
  {
    id: 'node-5',
    index: 5,
    title: 'LAND/WATER WASTE EXTRACTION',
    description: 'Extraction for Smelting and Repurposing through Mordor Facility.',
    video: 'https://files.catbox.moe/9c64ot.mp4',
    originalLink: 'https://waste-extraction.vercel.app',
    module: '/waste-extraction',
    status: 'built',
  },
  {
    id: 'node-6',
    index: 6,
    title: 'MORDOR',
    description:
      'A smelting facility that refines waste into a reusable Karbonite material, to be formed into various products, starting with the foundation for Atlantis.',
    video: 'https://files.catbox.moe/xt9bwl.mp4',
    originalLink: 'https://mordor-smelting.vercel.app',
    module: '/mordor-smelting',
    status: 'built',
  },
  {
    id: 'node-7',
    index: 7,
    title: 'ATLANTIS',
    description:
      'A 40 Billion Kilogram floating island with a storm dome, housing a floating forest, residential and commercial facilities to act as a tourist hotspot.',
    video: 'https://files.catbox.moe/fudw8l.mp4',
    originalLink: 'https://atlantis-pi.vercel.app',
    module: '/atlantis',
    status: 'built',
  },
  {
    id: 'node-8',
    index: 8,
    title: 'BEYOND THE GODS',
    description:
      'A space resource mining program made to mine extraterrestrial resources for the purpose of growing international economies and finding stronger and replenishing resources.',
    video: 'https://files.catbox.moe/nn50cs.mp4',
    originalLink: null,
    module: null,
    status: 'future',
  },
];

/** Look up a node by its anchor id (e.g. "node-3"). */
export function getNode(id) {
  return RENEWAL_PLAN_NODES.find((n) => n.id === id) || null;
}

/** True when the node has a live launcher module. */
export function isBuilt(node) {
  return !!node && !!node.module && node.status === 'built';
}

/** The in-page anchor for a node, e.g. "#node-3". */
export function nodeAnchor(node) {
  return `#${node.id}`;
}

/** Nodes that have a live launcher module (for cross-link badges). */
export function builtNodes() {
  return RENEWAL_PLAN_NODES.filter(isBuilt);
}
