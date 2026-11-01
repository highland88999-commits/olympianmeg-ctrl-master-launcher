// Earth 2 — restless animals (Wave A): the seeded behaviour
// state machine. Merlin's verdict on the old idle life was
// "statues": these tests pin that a creature is always DOING
// something legible — grazing, digging, drinking, sleeping at
// night — and that predators run Merlin's full ecology: hunt,
// chase (losably), kill, eat, walk when full, thirst, repeat.
// THE WALKER IS PREY (Merlin, 2026-10-31 — the old immunity was
// reversed): a vulnerable walker is pinned here as selectable
// prey, an immune one as refused; the guardian's defense law is
// pinned too.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  behaviourCaps, createBehaviour, stepBehaviour, setBehaviourMode,
  behaviourPose, pickPreyTarget, pickGuardianTarget, rollChase, fleePoint, stepToward,
  intentSpeed, seedFor, HUNT,
} from '../lib/earth2/behaviour.js';
import { EARTH2_MODELS } from '../lib/earth2/models.js';

const bySlug = (slug) => EARTH2_MODELS.find((e) => e.slug === slug);
const DAY = { isNight: false, waterNear: true };
const NIGHT = { isNight: true, waterNear: true };

// Simulate a behaviour for `seconds` of world time, recording
// every mode entered. Deterministic — the seeds carry it. The
// one scene-owned transition (arriving at the water ends a
// drink-go) is played by the harness exactly as the world
// plays it, since the machine itself never times scene modes
// out.
function simulate(entry, seconds, ctx, seed = 7) {
  const caps = behaviourCaps(entry);
  const beh = createBehaviour(seed, entry);
  const seen = new Set([beh.mode]);
  for (let s = 0; s < seconds; s += 0.5) {
    stepBehaviour(beh, caps, ctx, 0.5);
    if (beh.mode === 'drink-go') setBehaviourMode(beh, 'drink', 4);
    seen.add(beh.mode);
  }
  return { beh, seen };
}

describe('capabilities come from the manifest, not a second list', () => {
  it('herbivores graze and dig; carnivores hunt; size gates predation', () => {
    const trike = behaviourCaps(bySlug('triceratops'));
    assert.equal(trike.grazer, true);
    assert.equal(trike.digger, true);
    assert.equal(trike.predator, false);
    assert.equal(trike.prey, true);
    const rex = behaviourCaps(bySlug('tyrannosaurus-rex'));
    assert.equal(rex.predator, true);
    assert.equal(rex.grazer, false);
    // Compsognathus is a carnivore but far too small to hunt the
    // herds — it is life, not a predator, in this pass.
    const compy = behaviourCaps(bySlug('compsognathus'));
    assert.equal(compy.predator, false);
    const indominus = behaviourCaps(bySlug('indominus-rex'));
    assert.equal(indominus.predator, true, 'the aquatic apex still reads predator by diet');
  });

  it('the rearing Diplodocus never locomotes; flyers and swimmers stay out of the land machine', () => {
    assert.equal(behaviourCaps(bySlug('diplodocus')).locomotion, false);
    assert.equal(behaviourCaps(bySlug('pteranodon')).land, false);
    assert.equal(behaviourCaps(bySlug('mosasaurus')).land, false);
  });
});

describe('a grazer is always doing something', () => {
  it('over a simulated day it grazes, digs, wanders, alerts and drinks — never statues', () => {
    const { seen } = simulate(bySlug('triceratops'), 3600, DAY);
    for (const m of ['graze', 'dig', 'wander', 'alert']) assert.ok(seen.has(m), `reached ${m}`);
    assert.ok(seen.has('drink') || seen.has('drink-go'), 'found the water');
  });

  it('it never hunts and never grazes grass it cannot eat', () => {
    const { seen } = simulate(bySlug('stegosaurus'), 3600, DAY);
    assert.ok(!seen.has('stalk') && !seen.has('chase') && !seen.has('eat'));
    const rex = simulate(bySlug('tyrannosaurus-rex'), 1800, DAY);
    assert.ok(!rex.seen.has('graze') && !rex.seen.has('dig'), 'a rex does not graze');
  });

  it('night is for sleeping — and dawn breaks it', () => {
    let slept = 0;
    const caps = behaviourCaps(bySlug('triceratops'));
    const beh = createBehaviour(11, bySlug('triceratops'));
    for (let s = 0; s < 1800; s += 0.5) {
      stepBehaviour(beh, caps, NIGHT, 0.5);
      // The scene ends a drink-go on arrival at the shore;
      // play that one transition here too, as simulate() does.
      if (beh.mode === 'drink-go') setBehaviourMode(beh, 'drink', 4);
      if (beh.mode === 'sleep') slept += 0.5;
    }
    assert.ok(slept > 600, `slept ${slept}s of the night half-hour`);
    stepBehaviour(beh, caps, DAY, 0.5);
    assert.notEqual(beh.mode, 'sleep', 'dawn breaks the sleep at once');
  });

  it('the same seed lives the same life — procedural law', () => {
    const a = simulate(bySlug('triceratops'), 600, DAY, 42);
    const b = simulate(bySlug('triceratops'), 600, DAY, 42);
    assert.equal(a.beh.mode, b.beh.mode);
    assert.equal(a.beh.hunger, b.beh.hunger);
    assert.notEqual(seedFor('triceratops', 0), seedFor('triceratops', 1));
  });
});

describe('the poses are legible, not subtle', () => {
  it('graze and drink dips are deep; sleep settles and slows the breath', () => {
    assert.ok(behaviourPose('graze', 2).dip > 0.45);
    assert.ok(behaviourPose('drink', 3.4).dip > 0.55);
    assert.equal(behaviourPose('idle', 1).dip, 0);
    const sleep = behaviourPose('sleep', 1);
    assert.equal(sleep.settle, 1);
    assert.ok(sleep.breathMul < 0.7);
    const eat = behaviourPose('eat', 0.5);
    assert.ok(eat.dip > 0.25, 'tearing reads at distance');
    const dig = behaviourPose('dig', 0.3);
    assert.ok(dig.scrape >= 0 && dig.scrape <= 1);
  });
});

describe('the hunt — Merlin’s predator ecology', () => {
  const rexEntry = () => bySlug('tyrannosaurus-rex');
  const preyAt = (id, x, z, over = {}) => ({
    id, creature: true, prey: true, alive: true, x, z, ...over,
  });

  it('a hungry predator stalks the NEAREST prey in range — and nothing out of range', () => {
    const hunter = { id: 'rex#0', x: 0, z: 0 };
    const near = preyAt('trike#0', 30, 0);
    const far = preyAt('trike#1', 90, 0);
    const out = preyAt('trike#2', HUNT.stalkRangeM + 40, 0);
    assert.equal(pickPreyTarget(hunter, [far, near, out]).id, 'trike#0');
    assert.equal(pickPreyTarget(hunter, [out]), null);
  });

  it('THE WALKER IS PREY (Merlin, 2026-10-31): a vulnerable walker is selectable; an immune one is refused', () => {
    const hunter = { id: 'rex#0', x: 0, z: 0 };
    // Vulnerable: the scene marks walkerImmune === false (not
    // building, not on own parcel). The walker is prey.
    const vulnerable = { id: 'walker', isWalker: true, creature: true, prey: true, alive: true, walkerImmune: false, x: 2, z: 0 };
    assert.equal(pickPreyTarget(hunter, [vulnerable]).id, 'walker');
    // Immune: building or on own parcel. Refused outright.
    const immune = { id: 'walker', isWalker: true, creature: true, prey: true, alive: true, walkerImmune: true, x: 2, z: 0 };
    assert.equal(pickPreyTarget(hunter, [immune]), null);
    // A walker record that omits the flag defaults to immune —
    // the scene must explicitly vouch for vulnerability.
    const unflagged = { id: 'walker', isWalker: true, creature: true, prey: true, alive: true, x: 2, z: 0 };
    assert.equal(pickPreyTarget(hunter, [unflagged]), null);
    // A dead walker is not prey either.
    const dead = { id: 'walker', isWalker: true, creature: true, prey: true, alive: false, walkerImmune: false, x: 2, z: 0 };
    assert.equal(pickPreyTarget(hunter, [dead]), null);
    // Dead prey and fellow predators are not prey either.
    assert.equal(pickPreyTarget(hunter, [preyAt('d#0', 5, 0, { alive: false })]), null);
    assert.equal(pickPreyTarget(hunter, [preyAt('rex#1', 5, 0, { prey: false })]), null);
    // And a predator never selects itself.
    assert.equal(pickPreyTarget(hunter, [preyAt('rex#0', 1, 0)]), null);
  });

  it('THE GUARDIAN (Merlin, 2026-10-31): hunts predators, defends the walker, never hunts prey or the user', () => {
    const guardian = { id: 'spino#0', x: 0, z: 0 };
    const rexNear = { id: 'rex#1', predator: true, alive: true, x: 30, z: 0 };
    const rexFar = { id: 'rex#2', predator: true, alive: true, x: 60, z: 0 };
    const trike = { id: 'trike#0', creature: true, prey: true, alive: true, x: 5, z: 0 };
    const walker = { id: 'walker', isWalker: true, creature: true, prey: true, alive: true, walkerImmune: false, x: 8, z: 0 };
    // Nearest predator wins; prey and the walker are invisible to it.
    assert.equal(pickGuardianTarget(guardian, [trike, walker, rexFar, rexNear]).id, 'rex#1');
    assert.equal(pickGuardianTarget(guardian, [trike, walker]), null);
    // DEFENSE FIRST: a predator hunting the walker outranks a nearer one.
    const hunterRex = { id: 'rex#3', predator: true, alive: true, huntingWalker: true, x: 55, z: 0 };
    assert.equal(pickGuardianTarget(guardian, [rexNear, hunterRex]).id, 'rex#3');
    // Guardians don't hunt guardians, the dead, or themselves.
    const spino2 = { id: 'spino#1', predator: true, guardian: true, alive: true, x: 10, z: 0 };
    const deadRex = { id: 'rex#4', predator: true, alive: false, x: 10, z: 0 };
    assert.equal(pickGuardianTarget(guardian, [spino2, deadRex]), null);
    assert.equal(pickGuardianTarget({ id: 'spino#0', x: 0, z: 0 }, [{ id: 'spino#0', predator: true, alive: true, x: 1, z: 0 }]), null);
  });

  it('the Spinosaurus manifest entry carries the guardian flag', () => {
    const spino = bySlug('spinosaurus');
    assert.equal(spino.guardian, true);
    assert.equal(behaviourCaps(spino).guardian, true);
    assert.equal(behaviourCaps(spino).predator, true);
    // No other land carnivore is a guardian.
    for (const e of EARTH2_MODELS) {
      if (e.kind === 'dinosaur' && e.diet === 'carnivore' && e.slug !== 'spinosaurus') {
        assert.equal(behaviourCaps(e).guardian, false);
      }
    }
  });

  it('chases are losable: across many seeded hunts, prey escapes a real share', () => {
    const caps = behaviourCaps(rexEntry());
    let caught = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const beh = createBehaviour(1000 + i, rexEntry());
      if (rollChase(beh).caught) caught += 1;
    }
    const frac = caught / N;
    assert.ok(frac > 0.3 && frac < 0.6, `caught fraction ${frac}`);
    assert.ok(caps.predator);
  });

  it('the full cycle turns: hunger → (scene hunt) → eat → sated walk → hunger again', () => {
    const entry = rexEntry();
    const caps = behaviourCaps(entry);
    const beh = createBehaviour(99, entry);
    // Starve it: hunger crosses the hunt threshold on its own.
    for (let s = 0; s < 600 && beh.hunger < HUNT.hungerThreshold; s += 0.5) {
      stepBehaviour(beh, caps, DAY, 0.5);
    }
    assert.ok(beh.hunger >= HUNT.hungerThreshold, 'hunger rebuilds over time');
    // The scene runs the stalk and chase; the kill lands here:
    setBehaviourMode(beh, 'eat', 2);
    beh.hunger = 0.08; // the kill itself (the scene sets this)
    stepBehaviour(beh, caps, DAY, 2.5);
    assert.equal(beh.mode, 'sated', 'a finished eat leaves a full predator');
    // Sated is a walk, not a hunt — and it ends back at life.
    for (let s = 0; s < 90 && beh.mode === 'sated'; s += 0.5) stepBehaviour(beh, caps, DAY, 0.5);
    assert.notEqual(beh.mode, 'sated');
  });

  it('flee geometry runs away from the teeth, biased home; steps arrive', () => {
    const p = fleePoint({ x: 0, z: 0 }, { x: -10, z: 0 }, { x: 0, z: 0 });
    assert.ok(p.x > 5, `fled east, away from the predator (${p.x})`);
    const step = stepToward({ x: 0, z: 0 }, { x: 3, z: 4 }, 5, 1);
    assert.equal(step.arrived, true);
    const half = stepToward({ x: 0, z: 0 }, { x: 30, z: 0 }, 10, 1);
    assert.equal(half.arrived, false);
    assert.ok(Math.abs(half.x - 10) < 1e-9);
    assert.ok(intentSpeed(bySlug('tyrannosaurus-rex')) > intentSpeed(bySlug('compsognathus')));
  });
});
