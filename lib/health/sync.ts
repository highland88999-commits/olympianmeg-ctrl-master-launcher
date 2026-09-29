// lib/health/sync.ts — Phone health step-sync wiring point (STUB).
//
// Status: NOT WIRED. This file is the documented seam where real phone
// step data will enter the app during the MOBILE phase:
//   - iOS: HealthKit step counts (HKQuantityTypeIdentifier.stepCount)
//   - Android: Health Connect steps (androidx.health.connect / StepsRecord)
//
// Until then, step entry in /phone-home is manual, and there is NO fake,
// simulated, or placeholder data anywhere in this file. Callers must treat
// `supported: false` as "do not read from the sensor; use manual entry".

/** Result of a single-day step read attempt from the phone's health store. */
export interface StepReadResult {
  /** True only when a real sensor/health-store read succeeded. */
  supported: boolean;
  /** Step count, present only when supported is true. */
  steps?: number;
  /** Machine-readable reason when unsupported (e.g. 'mobile-phase'). */
  reason?: string;
}

/**
 * A provider that can read steps for one calendar day.
 * date: 'YYYY-MM-DD' in the user's local timezone.
 */
export interface HealthSyncProvider {
  getSteps(date: string): Promise<StepReadResult>;
}

/**
 * Default provider — a stub. Always resolves unsupported.
 *
 * Mobile-phase work (not started):
 *   1. Add the native health permission bridge (HealthKit / Health Connect).
 *   2. Implement a real HealthSyncProvider that queries the day's step count
 *      and returns { supported: true, steps }.
 *   3. Register it here via setHealthSyncProvider() or DI at the call site.
 *
 * Callers (/phone-home and future modules) call getSteps() and fall back to
 * manual entry when supported === false. Never substitute random or static
 * numbers for a real read.
 */
export const mobilePhaseHealthSync: HealthSyncProvider = {
  async getSteps(_date: string): Promise<StepReadResult> {
    return { supported: false, reason: 'mobile-phase' };
  },
};
