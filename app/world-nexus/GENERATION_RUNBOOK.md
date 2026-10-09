# World Nexus — 3D Asset Generation Runbook

How to generate the hub's 3D assets with Merlin's text-to-3D pipeline and land
them where the hub expects them. **No generation has been run** — this is the
plan awaiting his green light.

## The pipeline (his June 2026 setup)

- **API:** Meshy AI — `POST https://api.meshy.ai/openapi/v2/text-to-3d`
- **Auth:** `Authorization: Bearer <MESHY_API_KEY>` (generate at meshy.ai → Settings → API)
- **Output:** GLB (the hub requires GLB — matches his standing "must produce glb files" rule)
- **Flow:** async — POST returns `task_id` → poll `GET openapi/v2/text-to-3d/{task_id}` until `status: SUCCEEDED` → download from `model_urls.glb`

## The asset list

`app/world-nexus/generation-manifest.json` — **25 assets**, each `{id, prompt, category, district, placement notes}`:

| # | Group | Assets |
|---|-------|--------|
| 11 | District gate arches | one per god-category district (ARES … UTILITIES) |
| 1 | Centerpiece | `nexus-core` — floating crystal obelisk over the plaza |
| 5 | Landscape | `nexus-rock`, `nexus-tree`, `nexus-crystal`, `nexus-floating-isle`, `nexus-lantern` |
| 8 | Objects & decor | `statue-guardian`, `obelisk-rune`, `fountain-light`, `brazier-flame`, `bench-stone`, `banner-pole`, `sundial`, `arch-small` |

Prompts are written for game-ready output: centered origin, standing on y=0,
clean topology, under ~150k triangles.

## Where files land

```
public/models/world-nexus/<id>.glb     # filename MUST match the manifest id exactly
```

The hub's `lib/world-nexus/asset-loader.js` loads from exactly this path. If a
GLB is missing, the hub renders a clean procedural stand-in (solid, colliding)
— so generation can run in batches and the hub stays complete throughout.

## Running it

### Option A — the script (recommended)

`scripts/generate_world_nexus.py` (to be written at run time — kept out of the
repo until the API key exists):

```python
import json, time, urllib.request

API = "https://api.meshy.ai/openapi/v2/text-to-3d"
KEY = input("Meshy API key: ").strip()   # never stored, never committed
manifest = json.load(open("app/world-nexus/generation-manifest.json"))

def call(method, url, body=None):
    req = urllib.request.Request(url, method=method,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body else None)
    return json.load(urllib.request.urlopen(req))

import os
os.makedirs("public/models/world-nexus", exist_ok=True)

for a in manifest["assets"]:
    out = f"public/models/world-nexus/{a['id']}.glb"
    if os.path.exists(out):
        print(f"SKIP {a['id']} (already generated)"); continue
    task = call("POST", API, {
        "mode": "preview",               # fast pass first; re-run "refine" on keepers
        "prompt": a["prompt"],
        "art_style": "realistic",
        "should_remesh": True,
    })
    tid = task["result"]
    while True:
        s = call("GET", f"{API}/{tid}")
        if s["status"] == "SUCCEEDED": break
        if s["status"] in ("FAILED", "CANCELED"): raise SystemExit(f"{a['id']} failed: {s}")
        time.sleep(10)
    glb = s["model_urls"]["glb"]
    urllib.request.urlretrieve(glb, out)
    print(f"DONE {a['id']} -> {out}")
print("All assets generated. Publish public/models/world-nexus/*.glb to go live.")
```

Run: `python3 scripts/generate_world_nexus.py` from the repo worktree.
The script is idempotent — re-running skips assets already on disk.

### Option B — by hand in the Meshy web UI

1. meshy.ai → Text to 3D.
2. Paste one prompt from the manifest, generate, download the **GLB**.
3. Rename to `<id>.glb`, drop into `public/models/world-nexus/`.

## Estimated cost

- Meshy's text-to-3D runs roughly **~10 credits per model** on current plans
  (his June notes: ~100 free credits/month ≈ 10 models).
- **25 assets ≈ ~250 credits.**
- Free tier covers ~10 models/month — so the full set wants either a paid
  month or pay-as-you-go credits. Check current pricing at meshy.ai/pricing
  before running; do not assume these numbers at checkout.

## After generation

1. Verify each GLB opens (any glTF viewer) and looks right.
2. Publish `public/models/world-nexus/*.glb` via the normal explicit-file
   GitHub API publish (large blobs → temp-body-file pattern).
3. The hub picks them up automatically — no code change needed. Bad model?
   Delete its GLB and the procedural stand-in returns instantly.

## What the hub needs from the other agents

- `lib/world/walk-controls.js` (walk-mode agent): when it lands, `scene.js`
  documents the unification seam at the top of the file — swap the inline
  controls for the shared module, keeping the collider contract
  (`{x, z, r}` circles, push-out on the scene side).
- `worlds-registry.json` (registry agent): the hub built from
  `lib/god-menus.js` + `lib/i18n/satellites.ts` directly (154 portals). If the
  registry supersedes them, `app/world-nexus/world-names.js` regenerates from
  it with the same shape `{key, title, route, god}`.
