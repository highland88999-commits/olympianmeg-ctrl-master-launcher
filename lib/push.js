// lib/push.js — push notification registration for the Capacitor shell.
//
// Mobile App v2 (2026-09-30). Graceful by design:
// - On web / server, every function is a documented no-op ({ ok: false }).
// - In the native shell with NO push credentials configured yet, registerPush()
//   fails cleanly via the plugin's registrationError path — nothing crashes,
//   nothing retries in a loop.
// - Permission is requested ONLY from an explicit user action (a future
//   settings toggle calls registerPush()). NEVER call this on launch or on
//   first paint — iOS will punish launch-time permission prompts and users
//   will too.
//
// What still needs Merlin / native work before push actually delivers
// (documented, not done here — see reports/mobile-v2-plugins-2026-09-30.md):
//   iOS:  APNs key (.p8) from App Store Connect, Push Notifications capability
//         in the Xcode project (CI-generated ios/ folder), and the FCM/APNs
//         server key on whatever fan-out service sends the pushes.
//   Android: google-services.json from the Firebase console (project under
//         olympiannexus@gmail.com), FCM server key for fan-out.
//   Server: a fan-out endpoint (e.g. app/api/push/send) storing device tokens
//         per account and sending via FCM/APNs. Token storage table folds
//         into the frozen consolidated Supabase SQL — not built here.
import { Capacitor } from '@capacitor/core';

/** True only inside the real Capacitor native shell. */
export function isPushAvailable() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let _pushMod = null;
let _registrationStarted = false;

async function pushPlugin() {
  if (!isPushAvailable()) return null;
  if (!_pushMod) {
    try {
      _pushMod = await import('@capacitor/push-notifications');
    } catch {
      return null;
    }
  }
  return _pushMod && _pushMod.PushNotifications ? _pushMod.PushNotifications : null;
}

/**
 * Read the current push permission state without prompting. Never throws.
 * @returns {Promise<'granted'|'denied'|'prompt'|'prompt-with-rationale'|'unavailable'>}
 */
export async function getPushPermissionStatus() {
  try {
    const P = await pushPlugin();
    if (!P) return 'unavailable';
    const { receive } = await P.checkPermissions();
    return receive || 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Register for push notifications. CALL ONLY FROM AN EXPLICIT USER ACTION
 * (settings toggle). Never on launch.
 *
 * Flow: check permission -> request if needed -> attach listeners -> register().
 * The resulting FCM/APNs token is handed to onToken for server fan-out
 * (not implemented yet — see header).
 *
 * @param {{onToken?: (token: string) => void, onNotification?: (n: object) => void, onError?: (err: object) => void}} opts
 * @returns {Promise<{ok: boolean, reason?: string, error?: string}>}
 *   ok:false reasons: 'not-native' | 'permission-denied' | 'already-registered'
 *   | 'unavailable' | 'error'
 */
export async function registerPush({ onToken, onNotification, onError } = {}) {
  if (!isPushAvailable()) return { ok: false, reason: 'not-native' };
  if (_registrationStarted) return { ok: false, reason: 'already-registered' };
  try {
    const P = await pushPlugin();
    if (!P) return { ok: false, reason: 'unavailable' };

    let { receive } = await P.checkPermissions();
    if (receive !== 'granted') {
      const req = await P.requestPermissions();
      receive = req.receive;
    }
    if (receive !== 'granted') {
      return { ok: false, reason: 'permission-denied' };
    }

    _registrationStarted = true;

    await P.addListener('registration', (token) => {
      try {
        if (onToken && token && token.value) onToken(token.value);
      } catch {
        // token handoff must never break the launcher
      }
    });
    await P.addListener('registrationError', (err) => {
      // No APNs/FCM credentials configured yet -> lands here, cleanly.
      _registrationStarted = false;
      try {
        if (onError) onError(err || {});
      } catch {
        // ignore
      }
    });
    await P.addListener('pushNotificationReceived', (notification) => {
      try {
        if (onNotification) onNotification(notification || {});
      } catch {
        // ignore
      }
    });
    await P.addListener('pushNotificationActionPerformed', (action) => {
      try {
        if (onNotification && action && action.notification) onNotification(action.notification);
      } catch {
        // ignore
      }
    });

    await P.register();
    return { ok: true };
  } catch (err) {
    _registrationStarted = false;
    return { ok: false, reason: 'error', error: String((err && err.message) || err) };
  }
}

/**
 * Unregister and reset local registration state. Never throws.
 * @returns {Promise<{ok: boolean}>}
 */
export async function unregisterPush() {
  try {
    const P = await pushPlugin();
    if (P) {
      try {
        await P.removeAllListeners();
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  _registrationStarted = false;
  return { ok: true };
}
