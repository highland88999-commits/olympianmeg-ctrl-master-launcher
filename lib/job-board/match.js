// lib/job-board/match.js — Resume ↔ job scoring for the Omega Job Board.
//
// scoreJob(resume, job) -> { score 0-100, reasons[] }.
// Pure function. Weights: skills 40, title 25, category 15, experience 10,
// location 10. Rules that matter:
// - A candidate is NEVER penalised for having MORE experience than a job asks.
// - Remote jobs always pass the location check.
// - Unknown distance is neutral, never zero.

import { categoryForKeywords } from './taxonomy.js';
import { haversineKm } from './geo.js';

function norm(s) {
  return (s || '').toLowerCase();
}

function jobText(job) {
  return `${job.title || ''} ${job.company || ''} ${job.description || ''} ${job.category || ''}`;
}

// Seniority a job title/description asks for, in years. 0 = no seniority
// signal found (entry-level / unspecified).
export function requiredYearsForJob(job) {
  const t = norm(`${job.title || ''} ${job.description || ''}`);
  if (/\b(chief|vp|vice president|director|head of)\b/.test(t)) return 8;
  if (/\b(lead|principal|manager|senior|sr\.?)\b/.test(t)) return 5;
  if (/\b(intermediate|mid-level|mid level|experienced)\b/.test(t)) return 2;
  if (/\b(junior|jr\.?|entry[- ]level|graduate|apprentice)\b/.test(t)) return 0;
  const m = t.match(/(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s+)?experience/);
  if (m) return parseInt(m[1], 10);
  return 0;
}

export function scoreJob(resume, job) {
  const reasons = [];
  let score = 0;
  const res = resume || {};
  const text = jobText(job);
  const lowerText = norm(text);

  // --- Skills (40) ---
  const resumeSkills = Array.isArray(res.skills) ? res.skills : [];
  const matchedSkills = resumeSkills.filter((s) => {
    const re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(lowerText);
  });
  let skillScore = 0;
  if (resumeSkills.length > 0) {
    skillScore = Math.round((matchedSkills.length / resumeSkills.length) * 40);
    score += skillScore;
    if (matchedSkills.length > 0) {
      reasons.push(
        `Matches ${matchedSkills.length} of your ${resumeSkills.length} skills: ${matchedSkills.slice(0, 5).join(', ')}${matchedSkills.length > 5 ? ', …' : ''}`,
      );
    }
  } else {
    // No skills on the resume: neutral, not a penalty — the other signals
    // still count, scaled to the remaining 60 points.
    skillScore = 0;
  }

  // --- Title (25) ---
  const resumeTitles = Array.isArray(res.titles) ? res.titles : [];
  const jobTitle = norm(job.title || '');
  let titleHit = null;
  for (const t of resumeTitles) {
    const lt = norm(t);
    if (!lt) continue;
    if (jobTitle.includes(lt) || lt.includes(jobTitle)) {
      titleHit = t;
      break;
    }
    // Token overlap: at least one meaningful word shared.
    const jobWords = new Set(jobTitle.split(/[^a-z0-9]+/).filter((w) => w.length > 3));
    const titleWords = lt.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (titleWords.length > 0 && titleWords.some((w) => jobWords.has(w))) {
      titleHit = t;
      break;
    }
  }
  if (titleHit) {
    score += 25;
    reasons.push(`Title match: ${titleHit}`);
  }

  // --- Category (15) ---
  const resumeCategory = res.category || categoryForKeywords(
    `${resumeTitles.join(' ')} ${(res.skills || []).join(' ')}`,
  );
  const jobCategory = job.category || categoryForKeywords(text);
  if (resumeCategory && jobCategory && resumeCategory === jobCategory) {
    score += 15;
    reasons.push('Same job category as your background');
  }

  // --- Experience (10): never penalise MORE experience. ---
  const required = requiredYearsForJob(job);
  const have = typeof res.experienceYears === 'number' ? res.experienceYears : 0;
  if (required <= 0) {
    score += 10;
  } else if (have >= required) {
    score += 10;
    reasons.push(`Experience fits (${have} yrs vs ${required}+ asked)`);
  } else if (have > 0) {
    const partial = Math.round((have / required) * 10);
    score += partial;
    reasons.push(`Some of the experience asked (${have} of ${required}+ yrs)`);
  } else {
    // No experience stated on the resume: neutral half-credit, not zero.
    score += 5;
  }

  // --- Location (10) ---
  const loc = job.location || {};
  const centre = res.locationCoords || null;
  if (loc.remote) {
    score += 10;
    reasons.push('Remote — location is no barrier');
  } else if (centre && loc.lat != null && loc.lon != null) {
    const d = haversineKm(centre, { lat: loc.lat, lon: loc.lon });
    if (d == null) {
      score += 5;
    } else if (d <= 25) {
      score += 10;
      reasons.push(`Close by — about ${Math.round(d)} km away`);
    } else if (d <= 100) {
      score += 7;
      reasons.push(`Within reach — about ${Math.round(d)} km away`);
    } else {
      score += 3;
      reasons.push(`Farther away — about ${Math.round(d)} km`);
    }
  } else {
    // Unknown distance is neutral, never zero.
    score += 5;
    reasons.push('Location unknown — kept in your results');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function matchJobs(resume, jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  return list
    .map((job) => {
      const { score, reasons } = scoreJob(resume, job);
      return { ...job, match: { score, reasons } };
    })
    .sort((a, b) => b.match.score - a.match.score);
}
