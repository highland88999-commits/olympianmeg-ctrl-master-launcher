// lib/achievements/catalog.js
// Achievement catalog: every earnable achievement in Olympus.
// Vecna Slayer milestones live separately (lib/hawkins/vecna-slayer.js)
// because of their global ordering + collectible video.

export const ACHIEVEMENTS = {
  'olympian-scholar': {
    title: 'Olympian Scholar',
    description: 'Completed all 12 Olympian Education lessons across the three schools.',
    // Lesson IDs that must all be present for the award to be granted.
    requiresLessonIds: [
      'socratic', 'democracy', 'alphabet', 'stoicism',
      'pythagoras', 'nightsky', 'levers', 'watercycle',
      'binary', 'algorithms', 'webpage', 'pixels',
    ],
  },
};

export function getAchievement(key) {
  return ACHIEVEMENTS[key] || null;
}
