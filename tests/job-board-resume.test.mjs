// tests/job-board-resume.test.mjs — Resume parsing.
// Run: node --test tests/job-board-resume.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResumeText } from '../lib/job-board/resume.js';

const SAMPLE_RESUME = `
John Smith
Redwater, Alberta T0A 2W0 | john.smith@example.com

EXPERIENCE
Welder at Allied Industrial Dynamics, Calgary, AB
2018 - 2024
- Structural welding, blueprint reading, MIG and TIG welding
- Safety inspection and preventive maintenance on heavy equipment

Apprentice Welder at Northern Metal Works, Edmonton, AB
2016 - 2018

EDUCATION
Welding Diploma, Northern Alberta Institute of Technology, 2016
Red Seal Journeyman Welder certification, 2019

SKILLS
Welding, blueprint reading, forklift operation, first aid, WHMIS,
troubleshooting, safety inspection

SUMMARY
Welder with 8 years of experience in structural metal fabrication.
`;

test('parses skills only from what is in the text', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  for (const skill of ['welding', 'blueprint reading', 'forklift operation', 'first aid', 'whmis', 'troubleshooting', 'safety inspection']) {
    assert.ok(r.skills.includes(skill), `missing skill ${skill}`);
  }
  assert.ok(!r.skills.includes('python'), 'must not invent skills');
});

test('parses job titles from the vocabulary and Experience lines', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  assert.ok(r.titles.some((t) => t.toLowerCase().includes('welder')), `titles: ${r.titles}`);
});

test('computes years of experience from date ranges and explicit phrasing', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  // 2016–2018 (3 calendar years) + 2018–2024 (7) overlap at 2018 → 9 unique years.
  assert.ok(r.experienceYears >= 8, `expected >= 8, got ${r.experienceYears}`);
  assert.ok(r.experienceYears <= 10, `expected <= 10, got ${r.experienceYears}`);
  const explicit = parseResumeText('Welder with 12 years of experience.');
  assert.equal(explicit.experienceYears, 12);
});

test('parses education lines', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  assert.ok(r.education.some((e) => /diploma/i.test(e)), `education: ${r.education}`);
  assert.ok(r.education.some((e) => /red seal/i.test(e)), `education: ${r.education}`);
});

test('parses location from City, Province + postal code', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  assert.equal(r.location.city, 'Redwater');
  assert.equal(r.location.region, 'Alberta');
  assert.equal(r.location.country, 'Canada');
});

test('location is null when the text has none', () => {
  const r = parseResumeText('Welder. Welding, blueprint reading. 2019-2021.');
  assert.equal(r.location, null);
});

test('empty and non-string input never throws', () => {
  assert.deepEqual(parseResumeText('').skills, []);
  assert.deepEqual(parseResumeText(null).titles, []);
  assert.equal(parseResumeText('').experienceYears, 0);
});

test('category is derived from the resume content', () => {
  const r = parseResumeText(SAMPLE_RESUME);
  assert.equal(r.category, 'trades');
  const nurse = parseResumeText('Registered Nurse, patient care, vital signs, 2020-2024.');
  assert.equal(nurse.category, 'healthcare');
});
