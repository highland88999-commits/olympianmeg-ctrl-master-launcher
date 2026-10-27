// app/social-media-cheat-code/page.jsx
// THE SOCIAL MEDIA CHEAT CODE — the 3D room carousel for the
// town-and-city hashtag list (Merlin, 2026-10-26). Featured on
// every portal entry point: the hub Concourse, the Portal Room,
// and the hub program menu.

import CheatCodeRoom from '@/components/social-media-cheat-code/CheatCodeRoom';

export const metadata = {
  title: 'Social Media Cheat Code — Olympus',
  description:
    'Every town and city hashtag, room by room. Pick a platform, swipe a room, copy its piece, check it off.',
};

export default function SocialMediaCheatCodePage() {
  return <CheatCodeRoom />;
}
