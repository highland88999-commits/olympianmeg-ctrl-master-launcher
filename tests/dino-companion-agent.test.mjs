// tests/dino-companion-agent.test.mjs
// THE COMPANION DINO AGENT (Merlin, 2026-11-26): the dino's
// hunt is an agent decision — PERCEIVE → DECIDE → ACT on the
// shared character-agent runner — and its attacks drive its
// body parts (jaw/head, hips/spine for the tail, legs).
//
// Run: node --test tests/dino-companion-agent.test.mjs (from repo root)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyDinoBones,
  attackPoseFor,
  isEngageable,
  pickCompanionTarget,
  decideCompanionAction,
  createCompanionAgent,
  ATTACK_ANIM_S,
  CHARGE_SPEED,
} from '../lib/dino-companion-agent.js';
import { AGENT_ROLLOUT } from '../lib/world/character-agent.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

const MIXAMO_BABY = [
  'mixamorig:Hips', 'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot',
  'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:HeadTop_End',
];
const ADULT_TREX = ['Pelvis', 'Spine01', 'Spine02', 'NeckTwist01', 'Head', 'FacialBone',
  'L_Thigh', 'L_Calf', 'L_Foot', 'L_ToeBase', 'R_Thigh', 'R_Calf', 'R_Foot',
  'L_Upperarm', 'L_Forearm', 'L_Hand', 'L_Eye', 'R_Eye'];
const ADULT_TRIKE = ['tripo::Root', 'tripo::Spine_0', 'tripo::Spine_1', 'tripo::Spine_2',
  'tripo::Head_0', 'tripo::Head_1', 'tripo::Head_2', 'tripo::Head_3',
  'tripo::0_Left_Limb_0', 'tripo::0_Left_Limb_1', 'tripo::0_Left_Limb_2', 'tripo::0_Left_Limb_3',
  'tripo::0_Right_Limb_0', 'tripo::1_Left_Limb_0', 'tripo::1_Right_Limb_0'];

describe('bone classification (read off the real GLB rigs)', () => {
  it('the Mixamo baby rig has no jaw and no tail bone — the head IS the jaw, the tail rides the hips/spine', () => {
    const c = classifyDinoBones(MIXAMO_BABY);
    assert.deepEqual(c.jaw, []);
    assert.ok(!c.spine.some((n) => /tail/i.test(n)), 'no tail bone exists to drive');
    assert.ok(c.head.includes('mixamorig:Head'), 'bite drives the head');
    assert.ok(c.neck.includes('mixamorig:Neck'), 'bite drives the neck');
    assert.ok(c.hips.includes('mixamorig:Hips'), 'tail swipe drives the hips');
    assert.ok(c.spine.includes('mixamorig:Spine'), 'tail swipe drives the spine');
    assert.ok(c.legs.includes('mixamorig:LeftUpLeg'), 'stomp drives the legs');
    assert.ok(c.arms.includes('mixamorig:LeftArm'), 'arms stay arms, never legs');
  });

  it('the adult T. rex rig classifies the same way (L_Thigh is a leg, Pelvis is hips)', () => {
    const c = classifyDinoBones(ADULT_TREX);
    assert.deepEqual(c.jaw, []);
    assert.ok(c.head.includes('Head'));
    assert.ok(c.neck.includes('NeckTwist01'));
    assert.ok(c.hips.includes('Pelvis'));
    assert.ok(c.legs.includes('L_Thigh'));
    assert.ok(c.legs.includes('R_Calf'));
    assert.ok(!c.legs.includes('L_Upperarm'), 'arms are not legs');
  });

  it('the adult triceratops rig: tripo limb chains are legs, Head_n is head', () => {
    const c = classifyDinoBones(ADULT_TRIKE);
    assert.ok(c.legs.includes('tripo::0_Left_Limb_3'));
    assert.ok(c.legs.includes('tripo::1_Right_Limb_0'));
    assert.ok(c.head.includes('tripo::Head_0'));
    assert.ok(c.spine.includes('tripo::Spine_2'));
  });

  it('a future rig with a real jaw/tail bone is picked up', () => {
    const c = classifyDinoBones(['JawBone', 'Tail_01', 'Tail_02', 'Head', 'LeftUpLeg']);
    assert.deepEqual(c.jaw, ['JawBone']);
    assert.deepEqual(c.spine, ['Tail_01', 'Tail_02']);
  });
});

describe('attack poses drive the body parts', () => {
  it('at rest (phase 0) every pose is zero — the bind pose is untouched', () => {
    for (const kind of ['bite', 'tail', 'stomp', 'charge']) {
      const p = attackPoseFor(kind, 0);
      for (const g of Object.values(p)) assert.deepEqual(g, { x: 0, y: 0, z: 0 });
    }
  });

  it('bite pitches the head down hard (jaw) with the neck and spine following', () => {
    const p = attackPoseFor('bite', 0.5);
    assert.ok(p.head.x > 0.3, `head pitches down: ${p.head.x}`);
    assert.ok(p.jaw.x < 0, 'the jaw opens against the head');
    assert.ok(p.neck.x > 0, 'the neck follows');
    assert.ok(p.spine.x > 0, 'the spine dips');
    assert.equal(p.hips.y, 0, 'bite does not yaw the hips');
  });

  it('tail swipe yaws hips + spine — the tail hangs off those bones', () => {
    const p = attackPoseFor('tail', 0.5);
    assert.ok(p.hips.y > 0.3, `hips sweep: ${p.hips.y}`);
    assert.ok(p.spine.y > 0.3, `spine sweeps: ${p.spine.y}`);
    assert.ok(Math.abs(p.head.x) < 0.01, 'the head stays out of a tail swipe');
  });

  it('stomp lifts the legs, charge runs them with the spine leaned in', () => {
    const s = attackPoseFor('stomp', 0.15);
    assert.ok(s.legs.x < 0, 'legs lift on the wind-up');
    const c = attackPoseFor('charge', 0.25);
    assert.ok(Math.abs(c.legs.x) > 0.4, 'legs cycle on a charge');
    assert.ok(c.spine.x > 0.15, 'the spine leans into the charge');
  });

  it('unknown attacks pose nothing', () => {
    const p = attackPoseFor('???', 0.5);
    for (const g of Object.values(p)) assert.deepEqual(g, { x: 0, y: 0, z: 0 });
  });
});

describe('target picking', () => {
  const orc = (id, x, z, state = 'chase') => ({ id, x, z, state, kind: 'warrior', alive: state !== 'dead' });

  it('never the owner, never itself, never an ally, never the dead', () => {
    assert.equal(isEngageable(orc('o1', 1, 0), 'owner', 'dino'), true);
    assert.equal(isEngageable(orc('owner', 1, 0), 'owner', 'dino'), false);
    assert.equal(isEngageable(orc('dino', 1, 0), 'owner', 'dino'), false);
    assert.equal(isEngageable({ ...orc('o1', 1, 0), isAlly: true }, 'owner', 'dino'), false);
    assert.equal(isEngageable(orc('o1', 1, 0, 'dead'), 'owner', 'dino'), false);
    assert.equal(isEngageable(null, 'owner', 'dino'), false);
  });

  it("the owner's target wins, then the attacker's, then — only if not defensive — the nearest hostile", () => {
    const base = { hostiles: [orc('far', 20, 0), orc('near', 5, 0)], ownerId: 'owner', dinoId: 'dino', chaseRange: 12, dx: 0, dz: 0 };
    const ownerT = orc('boss', 30, 0);
    assert.equal(pickCompanionTarget({ ...base, ownerTarget: ownerT, aggression: 'defensive' }), ownerT);
    const attacker = orc('atk', 25, 0);
    assert.equal(pickCompanionTarget({ ...base, ownerTarget: null, attacker, aggression: 'defensive' }), attacker);
    assert.equal(pickCompanionTarget({ ...base, aggression: 'defensive' }), null);
    assert.equal(pickCompanionTarget({ ...base, aggression: 'opportunistic' }).id, 'near');
    assert.equal(pickCompanionTarget({ ...base, aggression: 'savage' }).id, 'near');
    assert.equal(pickCompanionTarget({ ...base, hostiles: [orc('far', 20, 0)], aggression: 'savage' }), null);
  });
});

describe('decide: heel / chase / attack / return', () => {
  const obs = (over = {}) => ({
    mode: 'heel', x: 0, z: 0, heading: 0,
    ownerX: 0, ownerZ: 0, ownerDist: 2,
    target: null, targetDist: Infinity, nearby: 0,
    attackT: 0, level: 1, stage: 'adult', diet: 'carnivore', posture: 'biped',
    ...over,
  });
  const orc = (x, z) => ({ id: 'orc-1', x, z, alive: true, state: 'chase', kind: 'warrior' });

  it('heels at the owner when there is no fight, and trots back when the owner walks off', () => {
    const idle = decideCompanionAction(obs(), 0.016);
    assert.equal(idle.mode, 'heel');
    assert.equal(idle.move, false);
    const follow = decideCompanionAction(obs({ ownerX: 10, ownerZ: 0, ownerDist: 10 }), 0.016);
    assert.equal(follow.move, true);
    assert.equal(follow.mode, 'heel');
    assert.ok(Math.abs(follow.turnTo - Math.PI / 2) < 1e-9, 'turns toward the owner');
  });

  it('chases the owner’s target — hunt speed from afar, charge for the last 8 m', () => {
    const far = decideCompanionAction(obs({ target: orc(10, 0), targetDist: 10 }), 0.016);
    assert.equal(far.mode, 'chase');
    assert.equal(far.move, true);
    assert.equal(far.speed, 5, 'beyond charge range it closes at hunt speed');
    const charge = decideCompanionAction(obs({ target: orc(6, 0), targetDist: 6 }), 0.016);
    assert.equal(charge.mode, 'chase');
    assert.equal(charge.speed, CHARGE_SPEED);
    const nearer = decideCompanionAction(obs({ target: orc(5, 0), targetDist: 5 }), 0.016);
    assert.equal(nearer.mode, 'chase');
    assert.equal(nearer.speed, CHARGE_SPEED, 'inside 8 m it still charges until bite range');
  });

  it('in bite range it bites — one dinoHit event, level-1 damage, cooldown set', () => {
    const a = decideCompanionAction(obs({ target: orc(1.5, 0), targetDist: 1.5 }), 0.016);
    assert.equal(a.mode, 'attack');
    assert.equal(a.attack, 'bite');
    assert.equal(a.events.length, 1);
    assert.equal(a.events[0].type, 'dinoHit');
    assert.equal(a.events[0].dmg, 6);
    assert.equal(a.events[0].attack, 'bite');
    assert.equal(a.attackT, 1.6);
    assert.equal(a.move, false);
  });

  it('a crowd earns a tail swipe, a herbivore stomps', () => {
    const tail = decideCompanionAction(obs({ target: orc(2, 0), targetDist: 2, nearby: 2 }), 0.016);
    assert.equal(tail.attack, 'tail');
    const stomp = decideCompanionAction(
      obs({ diet: 'herbivore', posture: 'quadruped', target: orc(2, 0), targetDist: 2 }), 0.016,
    );
    assert.equal(stomp.attack, 'stomp');
  });

  it('on cooldown it holds its ground facing the target — no double hit', () => {
    const a = decideCompanionAction(obs({ target: orc(1.5, 0), targetDist: 1.5, attackT: 0.5 }), 0.016);
    assert.equal(a.mode, 'attack');
    assert.equal(a.attack, null);
    assert.deepEqual(a.events, []);
  });

  it('past the 30 m leash it returns to the owner at charge speed, hunt or no hunt', () => {
    const a = decideCompanionAction(obs({ ownerX: 0, ownerZ: 0, ownerDist: 40, target: orc(5, 0), targetDist: 5 }), 0.016);
    assert.equal(a.mode, 'return');
    assert.equal(a.speed, CHARGE_SPEED);
    const home = decideCompanionAction(obs({ mode: 'return', ownerDist: 5 }), 0.016);
    assert.equal(home.mode, 'heel');
  });

  it('a target beyond chase range is not chased — it heels', () => {
    const a = decideCompanionAction(obs({ target: orc(50, 0), targetDist: 50 }), 0.016);
    assert.equal(a.mode, 'heel');
  });
});

describe('the agent runs perceive -> decide -> act end to end', () => {
  const ctxFor = (dino, over = {}) => ({
    dino,
    owner: { x: 0, z: 0 },
    ownerId: 'owner',
    ownerTarget: null,
    attacker: null,
    hostiles: [],
    ...over,
  });

  it('hunts the owner’s target across the ground and lands a bite', () => {
    const dino = {
      x: 0, z: 0, heading: Math.PI / 2, speed: 5, mode: 'heel', attackT: 0,
      level: 1, stage: 'adult', diet: 'carnivore', posture: 'biped',
    };
    const agent = createCompanionAgent({ dinoId: 'dino-1', species: 'tyrannosaurus-rex' });
    const target = { id: 'orc-1', x: 10, z: 0, alive: true, state: 'chase', kind: 'warrior' };
    let hit = null;
    for (let i = 0; i < 200 && !hit; i++) {
      const events = agent.step(ctxFor(dino, { ownerTarget: target, hostiles: [target] }), 0.1);
      hit = events.find((e) => e.type === 'dinoHit');
    }
    assert.ok(hit, 'the dino closes 10 m and bites');
    assert.equal(hit.dmg, 6);
    assert.equal(hit.attack, 'bite');
    assert.equal(hit.dinoId, 'dino-1');
    assert.ok(Math.hypot(dino.x - target.x, dino.z - target.z) <= 2.2, 'it bit from bite range');
    assert.equal(dino.mode, 'attack');
    assert.equal(dino.attackKind, 'bite');
    assert.equal(dino.attackAnimT, ATTACK_ANIM_S);
  });

  it('a level-1 defensive dino ignores a hostile nobody is fighting; a level-6 savage does not', () => {
    const orc = { id: 'orc-9', x: 5, z: 0, alive: true, state: 'idle', kind: 'warrior' };
    const baby = {
      x: 0, z: 0, heading: 0, speed: 5, mode: 'heel', attackT: 0,
      level: 1, stage: 'adult', diet: 'carnivore', posture: 'biped',
    };
    const agent = createCompanionAgent({ dinoId: 'dino-1', species: 'velociraptor' });
    agent.step(ctxFor(baby, { hostiles: [orc] }), 0.1);
    assert.equal(baby.mode, 'heel');
    const grown = { ...baby, level: 6 };
    agent.step(ctxFor(grown, { hostiles: [orc] }), 0.1);
    assert.equal(grown.mode, 'chase');
  });

  it('the runner falls back to heel instead of freezing when the brain throws', () => {
    const agent = createCompanionAgent({ dinoId: 'dino-1', species: 'velociraptor' });
    const dino = {
      x: 0, z: 0, heading: 0, speed: 5, mode: 'chase', attackT: 0,
      level: 1, stage: 'adult', diet: 'carnivore', posture: 'biped',
    };
    const events = agent.step({ dino, owner: null, hostiles: null }, 0.1);
    assert.deepEqual(events, []);
    assert.equal(dino.mode, 'heel');
  });
});

describe('rollout + wiring (source)', () => {
  it('companion dinos sit in the shared rollout right after land-dino graze', () => {
    const i = AGENT_ROLLOUT.indexOf('companion-dinos');
    assert.ok(i > 0, 'companion dinos are in the rollout');
    assert.equal(AGENT_ROLLOUT[i - 1], 'land-dino-graze');
    assert.ok(AGENT_ROLLOUT.indexOf('swamp-run-alligators') < i, 'after the pilot');
  });

  it('the companion module runs the agent and drives the body parts', () => {
    const mod = read('lib/dino-companion.js');
    assert.ok(mod.includes('createCompanionAgent'), 'spawns the agent');
    assert.ok(mod.includes('agent.step'), 'the agent ticks every frame');
    assert.ok(mod.includes('classifyDinoBones'), 'bones are classified for the attacks');
    assert.ok(mod.includes('applyAttackPose'), 'attack poses reach the bones');
    assert.ok(mod.includes('ctx.onEvent'), 'dinoHit events go to the realm engine');
    assert.ok(mod.includes('awardXp'), 'hunting earns XP on the handle');
  });

  it('the spawn scale divides by the loaded model’s own bind length', () => {
    const mod = read('lib/dino-companion.js');
    assert.ok(mod.includes('bindLengthM'), 'the divisor is the loaded model’s bind length');
    assert.ok(mod.includes('babyModel ? 1 : adultScaleM'), 'baby GLB: 1 m, adult GLB: adultScaleM');
    assert.ok(mod.includes("companion-marker"), 'a gold marker rides above the dino');
    assert.ok(mod.includes('0xffc94d'), 'the marker is gold');
  });

  it('Middle-earth feeds the agent its hunt and applies its hits', () => {
    const me = read('app/middle-earth/page.jsx');
    assert.ok(me.includes('applyDinoHit'), 'the page applies dino hits');
    assert.ok(me.includes('damageOrc(target, ev.dmg'), 'dino damage lands through damageOrc');
    assert.ok(me.includes('damageBoss(target, ev.dmg'), 'dino damage lands through damageBoss');
    assert.ok(me.includes('ownerTarget'), 'the owner’s fight is the dino’s target');
    assert.ok(me.includes('XP_ASSIST'), 'assists pay XP');
    assert.ok(me.includes('setDinoXp'), 'XP persists onto the backpack record');
    assert.ok(me.includes('levelOf(dinoItem)'), 'the spawn carries the record’s level');
  });
});
