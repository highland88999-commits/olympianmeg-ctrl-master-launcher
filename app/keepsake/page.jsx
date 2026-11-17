// app/keepsake/page.jsx — KEEPSAKE: a treasured photo, kept in a snow globe.
// Upload a photo you hold dear (or try the Cabin, Lake or Garden scenes)
// and it is rebuilt as a layered 3D diorama sealed in glass. Shake the
// phone to stir the snow; the camera stays where you leave it.
'use client';

import KeepsakeGlobe from '@/components/keepsake/KeepsakeGlobe';

export default function KeepsakePage() {
  return <KeepsakeGlobe mode="create" />;
}
