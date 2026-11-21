// tests/job-board-resume-builder.test.mjs — In-house Resume Builder link.
// Run: node --test tests/job-board-resume-builder.test.mjs (from the repo root)
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeTemplateToText, parseResumeText, isJobBoardReturn } from '../lib/job-board/resume.js';

// A filled-in builder template, as stored under localStorage
// 'resume-template' ({ data, accent }).
const BUILDER_DATA = {
  name: 'Jane Doe',
  title: 'Journeyman Welder',
  contact: 'Redwater, Alberta · jane.doe@example.com · (555) 010-4455',
  summary: 'Journeyman welder with 6 years of experience in structural fabrication and shop work.',
  jobs: [
    {
      role: 'Welder',
      company: 'Allied Industrial Dynamics',
      meta: '2020 – 2024 · Redwater, Alberta',
      bullets: [
        'Structural welding, blueprint reading, MIG and TIG welding',
        'Safety inspection and preventive maintenance on heavy equipment',
      ],
    },
    {
      role: 'Welder Apprentice',
      company: 'Northern Metal Works',
      meta: '2018 – 2020 · Edmonton, Alberta',
      bullets: ['Shop welding and forklift operation, first aid on site.'],
    },
  ],
  education: [
    { school: 'Northern Alberta Institute of Technology', detail: 'Welding Diploma' },
    { school: 'Industry Certifications', detail: 'Red Seal Journeyman Welder · WHMIS' },
  ],
  skills: 'Welding, blueprint reading, forklift operation, first aid, WHMIS, troubleshooting, safety inspection.',
};

test('renders the builder template to plain text the parser can read', () => {
  const text = resumeTemplateToText(BUILDER_DATA);
  assert.ok(text.includes('Jane Doe'), text);
  assert.ok(text.includes('Journeyman Welder'), text);
  assert.ok(text.includes('Redwater, Alberta'), text);
  assert.ok(text.includes('Professional Experience'), text);
  assert.ok(text.includes('Welder at Allied Industrial Dynamics'), text);
  assert.ok(text.includes('2020 – 2024'), text);
  assert.ok(text.includes('Structural welding, blueprint reading'), text);
  assert.ok(text.includes('Education'), text);
  assert.ok(text.includes('Northern Alberta Institute of Technology — Welding Diploma'), text);
  assert.ok(text.includes('Skills'), text);
  assert.ok(text.includes('Welding, blueprint reading, forklift operation'), text);
});

test('the parsed render extracts skills, titles, location and years', () => {
  const parsed = parseResumeText(resumeTemplateToText(BUILDER_DATA));
  for (const skill of ['welding', 'blueprint reading', 'forklift operation', 'first aid', 'whmis', 'troubleshooting', 'safety inspection']) {
    assert.ok(parsed.skills.includes(skill), `missing skill ${skill}: ${parsed.skills}`);
  }
  assert.ok(parsed.titles.some((t) => t.toLowerCase().includes('welder')), `titles: ${parsed.titles}`);
  assert.equal(parsed.location.city, 'Redwater');
  assert.equal(parsed.location.region, 'Alberta');
  assert.equal(parsed.location.country, 'Canada');
  // 2018–2020 (3 calendar years) + 2020–2024 (5) overlap at 2020 → 7 unique years.
  assert.ok(parsed.experienceYears >= 6, `expected >= 6, got ${parsed.experienceYears}`);
  assert.ok(parsed.education.some((e) => /diploma/i.test(e)), `education: ${parsed.education}`);
  assert.ok(parsed.education.some((e) => /red seal/i.test(e)), `education: ${parsed.education}`);
});

test('renderer tolerates missing or partial template data', () => {
  assert.equal(typeof resumeTemplateToText(null), 'string');
  assert.equal(resumeTemplateToText({}), '');
  const partial = resumeTemplateToText({ name: 'Sam', jobs: [{ role: 'Cook', company: '', meta: '', bullets: [] }] });
  assert.ok(partial.includes('Sam'), partial);
  assert.ok(partial.includes('Cook'), partial);
});

test('return-param allowlist accepts only the Job Board', () => {
  assert.equal(isJobBoardReturn('/job-board'), true);
  assert.equal(isJobBoardReturn('/job-board?resume=built'), true);
  assert.equal(isJobBoardReturn('/job-board#top'), true);
  assert.equal(isJobBoardReturn('https://evil.example.com'), false);
  assert.equal(isJobBoardReturn('https://evil.example.com/job-board'), false);
  assert.equal(isJobBoardReturn('//evil.example.com'), false);
  assert.equal(isJobBoardReturn('/other'), false);
  assert.equal(isJobBoardReturn('/job-board-evil'), false);
  assert.equal(isJobBoardReturn('/job-boardx'), false);
  assert.equal(isJobBoardReturn(''), false);
  assert.equal(isJobBoardReturn(null), false);
  assert.equal(isJobBoardReturn(undefined), false);
});
