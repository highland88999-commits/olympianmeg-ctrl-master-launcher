# Cloud Phone — build status (v1 product surface)

Merlin's concept: ONE thin client app on the user's phone that hosts ALL their
apps. Each app runs as the user's own private instance on Merlin's server and
streams to the phone — saving device storage for personal content (music,
photos, files).

## What works today

- **App catalog** (`lib/cloud-phone/catalog.js`, table `cloud_phone_catalog`):
  12 real open-source Android apps (VLC, Firefox, Signal, Telegram, Nextcloud,
  AntennaPod, NewPipe, KeePassDX, OsmAnd, Joplin, Thunderbird, Syncthing) with
  honest on-device sizes and source labels (F-Droid / publisher APK).
- **Install flow**: signed-in users install from the catalog; the API creates a
  per-user instance row (`status = 'provisioning'`). Installing twice is
  idempotent. RLS keeps every user to their own rows; the catalog has no
  client write policies.
- **Instance records**: `cloud_phone_instances` tracks
  provisioning / running / stopped, plus `container_ref` (null until a runtime
  exists) and `last_launched_at`.
- **UI**: `/cloud-phone` — hero, how-it-works strip, storage meter ("X MB of
  phone storage saved", computed from catalog sizes of installed apps), "My
  Cloud Apps" with Launch / Stop / Uninstall, and the catalog grid.
- **Launch viewport**: full-screen placeholder with honest states —
  "Provisioning your instance…" then "Server runtime not connected", explaining
  the instance is reserved and streaming starts once the runtime lands.

## What is NOT built

- **The Android container runtime.** No containers are provisioned, no Android
  runs anywhere, no app binaries are hosted. `container_ref` stays null.
- **WebRTC streaming.** The launch viewport never fakes a stream — there is no
  mock screenshot, no canned video, no fake stream URL. `launch/route.js`
  returns `runtime: { connected: false }` on purpose.
- **The SQL migration has not been executed.** `supabase/cloud_phone.sql` is
  delivered as a file only, per the standing SQL green-light rule.

## The exact infra decision needed next

Pick the container runtime and wire it into the marked TODOs
(`app/api/cloud-phone/install/route.js`, `launch`, `stop`, `uninstall`):

1. **Anbox Cloud (Canonical)** — managed Android-in-containers with streaming
   built in. Fastest path; usage-priced.
2. **DIY** — Android-x86 / ARM containers on our own GPUs + a WebRTC gateway
   (e.g. WebRTC streamer per container). More control, more ops burden.

Either way the contract is the same: provision → store the session/container id
in `container_ref` → flip status to `running` when the runtime reports healthy
→ hand the launch route a real stream endpoint. Until that decision lands,
everything above stays honest and waiting.
