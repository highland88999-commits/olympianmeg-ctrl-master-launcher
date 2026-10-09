// Cloud Phone — seed app catalog.
// These are real open-source Android apps a user could sideload today.
// The same rows are seeded by supabase/cloud_phone.sql; this copy is the
// client-side fallback when the catalog table has not been migrated yet.
// apk_size_mb is approximate and honest: it is what the app would occupy
// on-device. On Cloud Phone it always costs the user 0 MB of phone storage.

export const CLOUD_PHONE_CATALOG = [
  {
    app_id: 'vlc',
    name: 'VLC',
    description: 'Plays every video and audio format you throw at it.',
    category: 'Media',
    apk_size_mb: 40,
    source: 'fdroid',
  },
  {
    app_id: 'firefox',
    name: 'Firefox',
    description: 'Private, extensible web browser from Mozilla.',
    category: 'Browser',
    apk_size_mb: 90,
    source: 'direct-apk',
  },
  {
    app_id: 'signal',
    name: 'Signal',
    description: 'Encrypted messaging and calls, no ads, no trackers.',
    category: 'Communication',
    apk_size_mb: 70,
    source: 'direct-apk',
  },
  {
    app_id: 'telegram',
    name: 'Telegram',
    description: 'Fast cloud messaging with channels and large groups.',
    category: 'Communication',
    apk_size_mb: 60,
    source: 'direct-apk',
  },
  {
    app_id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Your own private cloud for files, photos and docs.',
    category: 'Files',
    apk_size_mb: 45,
    source: 'fdroid',
  },
  {
    app_id: 'antennapod',
    name: 'AntennaPod',
    description: 'Podcast manager and player, free forever.',
    category: 'Audio',
    apk_size_mb: 25,
    source: 'fdroid',
  },
  {
    app_id: 'newpipe',
    name: 'NewPipe',
    description: 'Lightweight video streaming without the bloat.',
    category: 'Media',
    apk_size_mb: 12,
    source: 'fdroid',
  },
  {
    app_id: 'keepassdx',
    name: 'KeePassDX',
    description: 'Offline password vault that never phones home.',
    category: 'Security',
    apk_size_mb: 15,
    source: 'fdroid',
  },
  {
    app_id: 'osmand',
    name: 'OsmAnd',
    description: 'Offline maps and navigation for the whole planet.',
    category: 'Maps',
    apk_size_mb: 120,
    source: 'fdroid',
  },
  {
    app_id: 'joplin',
    name: 'Joplin',
    description: 'Note-taking with sync you control.',
    category: 'Productivity',
    apk_size_mb: 35,
    source: 'direct-apk',
  },
  {
    app_id: 'thunderbird-android',
    name: 'Thunderbird',
    description: 'Full-featured email from the Mozilla family.',
    category: 'Productivity',
    apk_size_mb: 20,
    source: 'fdroid',
  },
  {
    app_id: 'syncthing',
    name: 'Syncthing',
    description: 'Peer-to-peer file sync with no cloud in the middle.',
    category: 'Files',
    apk_size_mb: 18,
    source: 'fdroid',
  },
];

export const CATALOG_SOURCES = {
  fdroid: 'F-Droid',
  'direct-apk': 'Publisher APK',
  publisher: 'Publisher partner',
};

export function catalogById(appId) {
  return CLOUD_PHONE_CATALOG.find((a) => a.app_id === appId) || null;
}
