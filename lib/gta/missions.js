// lib/gta/missions.js — Simple mission framework.
// Objective types: goto, collect, deliver, timed. HUD markers + completion.

export const MISSION_STATE = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

export function createMission(id, def) {
  return {
    id,
    title: def.title,
    briefing: def.briefing,
    objectives: def.objectives.map(o => ({ ...o, done: false })),
    reward: def.reward || 0,
    state: MISSION_STATE.INACTIVE,
    currentObjective: 0,
    timer: def.timeLimit || 0,
    elapsed: 0,
  };
}

// Check objectives against game state
// gameState: { playerX, playerZ, inVehicle, collected: Set }
// Returns events: [{ type: 'objective_complete'|'mission_complete'|'mission_failed', ... }]
export function updateMission(m, gameState, dt) {
  const events = [];
  if (m.state !== MISSION_STATE.ACTIVE) return events;

  if (m.timer > 0) {
    m.elapsed += dt;
    if (m.elapsed >= m.timer) {
      m.state = MISSION_STATE.FAILED;
      events.push({ type: 'mission_failed', reason: 'Time ran out.' });
      return events;
    }
  }

  const obj = m.objectives[m.currentObjective];
  if (!obj) {
    m.state = MISSION_STATE.COMPLETE;
    events.push({ type: 'mission_complete', reward: m.reward });
    return events;
  }

  let done = false;
  const dx = gameState.playerX - obj.x;
  const dz = gameState.playerZ - obj.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  switch (obj.type) {
    case 'goto':
      if (dist < (obj.radius || 6)) done = true;
      break;
    case 'goto_vehicle':
      if (dist < (obj.radius || 6) && gameState.inVehicle) done = true;
      break;
    case 'collect':
      if (gameState.collected && gameState.collected.has(obj.itemId)) done = true;
      break;
    case 'deliver':
      // Must be in vehicle at destination
      if (dist < (obj.radius || 6) && gameState.inVehicle) done = true;
      break;
  }

  // Objective-specific requirements
  if (obj.requireVehicle && !gameState.inVehicle) done = false;
  if (obj.requireOnFoot && gameState.inVehicle) done = false;

  if (done) {
    obj.done = true;
    events.push({ type: 'objective_complete', index: m.currentObjective, objective: obj });
    m.currentObjective++;
    if (m.currentObjective >= m.objectives.length) {
      m.state = MISSION_STATE.COMPLETE;
      events.push({ type: 'mission_complete', reward: m.reward });
    }
  }

  return events;
}

export function startMission(m) {
  m.state = MISSION_STATE.ACTIVE;
  m.currentObjective = 0;
  m.elapsed = 0;
  for (const o of m.objectives) o.done = false;
}

export function currentObjective(m) {
  if (m.state !== MISSION_STATE.ACTIVE) return null;
  return m.objectives[m.currentObjective] || null;
}

// Sample missions for Mega City
export const MEGA_CITY_MISSIONS = [
  {
    id: 'mc-delivery-1',
    title: 'Downtown Delivery',
    briefing: 'Pick up the package downtown and deliver it to the harbor. Keep it under 3 minutes.',
    reward: 150,
    timeLimit: 180,
    objectives: [
      { type: 'goto', x: 40, z: -30, radius: 8, label: 'Pick up the package' },
      { type: 'deliver', x: -60, z: 80, radius: 8, label: 'Deliver to the harbor', requireVehicle: true },
    ],
  },
  {
    id: 'mc-taxi-1',
    title: 'Rush Hour',
    briefing: 'A client needs a ride across town. Get in a car, pick them up, drop them off.',
    reward: 100,
    objectives: [
      { type: 'goto_vehicle', x: 20, z: 20, radius: 8, label: 'Pick up the client (in a car)' },
      { type: 'deliver', x: -40, z: -60, radius: 8, label: 'Drop off the client' },
    ],
  },
];

// Sample missions for BABEL — themed to the tower and the vault.
// (Missions only run deliveries TO the vault door — never touch vault contents.)
export const BABEL_MISSIONS = [
  {
    id: 'bb-courier-1',
    title: 'Tower Courier',
    briefing: 'A sealed package needs to circle the tower. Pick it up at the north gate, drive it to the south gate.',
    reward: 120,
    timeLimit: 150,
    objectives: [
      { type: 'goto', x: 0, z: -75, radius: 8, label: 'Pick up the package (north gate)' },
      { type: 'deliver', x: 0, z: 75, radius: 8, label: 'Deliver to the south gate', requireVehicle: true },
    ],
  },
  {
    id: 'bb-vault-1',
    title: 'Vault Run',
    briefing: 'An urgent deposit for the vault. Get in a car, reach the vault door at the tower base before time runs out.',
    reward: 200,
    timeLimit: 120,
    objectives: [
      { type: 'goto', x: 0, z: 75, radius: 10, label: 'Reach the south gate (in a car)', requireVehicle: true },
      { type: 'goto', x: 0, z: 32, radius: 6, label: 'Deliver to the vault door' },
    ],
  },
];

// Sample missions for Truman
export const TRUMAN_MISSIONS = [
  {
    id: 'tr-errand-1',
    title: 'Morning Errands',
    briefing: 'Henry needs groceries. Walk to the market and pick up the list.',
    reward: 50,
    objectives: [
      { type: 'goto', x: 100, z: 150, radius: 6, label: 'Go to the market', requireOnFoot: true },
      { type: 'collect', itemId: 'groceries', x: 100, z: 150, radius: 6, label: 'Pick up groceries' },
    ],
  },
  {
    id: 'tr-discover-1',
    title: 'Something\'s Off',
    briefing: 'The town feels too perfect today. Visit the observatory and the lighthouse — see what you find.',
    reward: 120,
    objectives: [
      { type: 'goto', x: 0, z: -300, radius: 10, label: 'Visit the observatory' },
      { type: 'goto', x: 250, z: 200, radius: 10, label: 'Check the lighthouse' },
    ],
  },
];
