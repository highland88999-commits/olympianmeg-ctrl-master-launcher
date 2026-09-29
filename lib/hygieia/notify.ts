// lib/hygieia/notify.ts — Notification DELIVERY stub for HYGIEIA.
//
// STUB ONLY — nothing here schedules, sends, or queues a phone push
// notification. There is no fake scheduling anywhere in this module.
//
// Why: phone push needs the mobile app shell (device tokens, a push
// gateway, user permission prompts). That arrives in the mobile phase.
// Until then, reminders "show in-app for now": the Hygieia page lists due
// reminders while it's open, computed honestly from local time by
// isDue()/dueReminders() in lib/hygieia/schedule.js — plain local math,
// never presented as a phone notification.
//
// The UI repeats the honest line verbatim so nobody infers push exists:
//   "Reminders show in-app for now — phone notifications come with the
//    mobile app."
//
// When the mobile phase lands, the real implementation replaces
// scheduleLocalReminder() below and keeps the same return shape.

export interface ScheduleResult {
  scheduled: boolean;
  /** Human-readable reason, safe to show in the UI. */
  reason: string;
}

/**
 * Intended signature for the mobile phase. Today it always declines and
 * says why — the reminder is still stored and shown in-app.
 */
export function scheduleLocalReminder(reminder: {
  id?: string;
  title: string;
  schedule_type: 'once' | 'daily' | 'weekly';
  remind_time: string | null;
}): ScheduleResult {
  void reminder;
  return {
    scheduled: false,
    reason: 'Reminders show in-app for now — phone notifications come with the mobile app.',
  };
}

/** The exact honest line the UI shows wherever delivery is mentioned. */
export const NOTIFICATION_NOTE =
  'Reminders show in-app for now — phone notifications come with the mobile app.';
