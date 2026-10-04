'use client';

// components/live-recordings/ShareRecording.jsx
// Per-card share + TikTok attribution controls for the Live Recordings feed.
//
// Contracts (sibling-owned — imported, never redefined):
//   import { buildShareText, recordingShareUrl, displayTikTokHandle } from '@/lib/tiktok-attribution'
//   Supabase browser client: import { supabase } from '@/lib/supabase'
// The tiktok_post_queue table is created by a not-yet-run migration; a missing
// table surfaces as an honest "not set up yet" message, never a crash.
//
// v1 TikTok path: the Web Share sheet can't target TikTok directly on most
// devices, and https://www.tiktok.com/upload accepts no caption-prefill query
// params, so "Post to TikTok" either opens the native share sheet (where
// TikTok may appear as a target, e.g. Android) or copies the attribution
// caption and opens the TikTok upload page. Labeled honestly as opening TikTok.

import { useCallback, useEffect, useState } from 'react';
import {
  buildShareText,
  recordingShareUrl,
  displayTikTokHandle,
} from '@/lib/tiktok-attribution';
import {
  buildFeaturePayload,
  isMissingTableError,
  TIKTOK_POST_QUEUE_TABLE,
} from '@/lib/live-recordings-queue';
import { supabase } from '@/lib/supabase';

const TIKTOK_UPLOAD_URL = 'https://www.tiktok.com/upload';

/** Copy text to the clipboard, with a legacy fallback for older browsers. */
async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    ta.remove();
  }
  if (!ok) throw new Error('clipboard is unavailable in this browser');
}

function shareInputs(recording) {
  const title = recording?.title?.trim() || 'A live recording';
  const text = buildShareText({ title, tiktokHandle: recording?.tiktok_handle });
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const url = recordingShareUrl(origin, recording?.id);
  return { title, text, url };
}

export default function ShareRecording({ recording, isOwner }) {
  const [notice, setNotice] = useState(null); // { kind: 'ok'|'info'|'error', text }
  const [busy, setBusy] = useState(null); // 'share' | 'feature' | 'post' | null
  const [ownerResolved, setOwnerResolved] = useState(
    typeof isOwner === 'boolean' ? isOwner : null
  );

  // Default ownership check: the signed-in user vs the recording's owner id.
  // If the page knows better it passes isOwner explicitly.
  useEffect(() => {
    if (typeof isOwner === 'boolean') {
      setOwnerResolved(isOwner);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id ?? null;
        const ownerId = recording?.owner_id ?? recording?.user_id ?? null;
        if (!cancelled) setOwnerResolved(!!userId && !!ownerId && userId === ownerId);
      } catch {
        if (!cancelled) setOwnerResolved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner, recording?.owner_id, recording?.user_id]);

  const onShare = useCallback(async () => {
    setNotice(null);
    setBusy('share');
    const { title, text, url } = shareInputs(recording);
    const sharePayload = url ? { title, text, url } : { title, text };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(sharePayload);
        setNotice({ kind: 'ok', text: 'Shared — thanks for spreading the word.' });
      } else {
        await copyToClipboard(url ? `${text}\n${url}` : text);
        setNotice({ kind: 'ok', text: 'Link copied to your clipboard.' });
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setNotice({ kind: 'info', text: 'Share cancelled — nothing was sent.' });
      } else {
        setNotice({
          kind: 'error',
          text: `Couldn't share: ${err?.message || 'unknown error'}.`,
        });
      }
    } finally {
      setBusy(null);
    }
  }, [recording]);

  const onFeature = useCallback(async () => {
    setNotice(null);
    setBusy('feature');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setNotice({ kind: 'error', text: 'Sign in to request a TikTok feature.' });
        return;
      }
      const payload = buildFeaturePayload(recording, user.id);
      const { error } = await supabase.from(TIKTOK_POST_QUEUE_TABLE).insert(payload);
      if (error) {
        if (isMissingTableError(error)) {
          setNotice({
            kind: 'info',
            text: "TikTok features aren't set up yet — the posting queue hasn't been created. Check back soon.",
          });
        } else {
          setNotice({
            kind: 'error',
            text: `Couldn't queue the feature request: ${error.message || 'unknown error'}.`,
          });
        }
        return;
      }
      setNotice({
        kind: 'ok',
        text: 'Queued for a TikTok feature — it will post when the TikTok integration goes live.',
      });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: `Couldn't queue the feature request: ${err?.message || 'unknown error'}.`,
      });
    } finally {
      setBusy(null);
    }
  }, [recording]);

  const onPostToTikTok = useCallback(async () => {
    setNotice(null);
    setBusy('post');
    const { title, text, url } = shareInputs(recording);
    const sharePayload = url ? { title, text, url } : { title, text };
    const copyBody = url ? `${text}\n${url}` : text;
    try {
      // Where the OS share sheet offers TikTok as a target (e.g. Android with
      // TikTok installed), this is the true native path — caption included.
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(sharePayload);
        setNotice({
          kind: 'ok',
          text: 'Opened your share sheet — pick TikTok to post with the caption.',
        });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setNotice({ kind: 'info', text: 'Share cancelled — nothing was sent.' });
        setBusy(null);
        return;
      }
      // Any other share failure: fall through to the upload page below.
    }
    try {
      // tiktok.com/upload can't receive a caption via the URL, so put the
      // attribution caption on the clipboard for pasting.
      await copyToClipboard(copyBody);
      window.open(TIKTOK_UPLOAD_URL, '_blank', 'noopener,noreferrer');
      setNotice({
        kind: 'ok',
        text: 'Opening TikTok upload — your caption is copied and ready to paste.',
      });
    } catch (err) {
      window.open(TIKTOK_UPLOAD_URL, '_blank', 'noopener,noreferrer');
      setNotice({
        kind: 'info',
        text: `Opening TikTok upload — couldn't copy the caption automatically (${err?.message || 'clipboard unavailable'}). Copy it from the share button instead.`,
      });
    } finally {
      setBusy(null);
    }
  }, [recording]);

  const handle = recording?.tiktok_handle || null;
  const showFeature = ownerResolved === true;

  return (
    <div className="live-rec-share" aria-label="Share this recording">
      {handle && (
        <p className="live-rec-share__credit" style={{ fontSize: '0.8rem', opacity: 0.75, margin: '0 0 0.5rem' }}>
          Captured by {displayTikTokHandle(handle)}
        </p>
      )}
      <div
        className="live-rec-share__actions"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
      >
        <button
          type="button"
          onClick={onShare}
          disabled={busy !== null}
          aria-busy={busy === 'share'}
        >
          {busy === 'share' ? 'Sharing…' : 'Share'}
        </button>
        <button
          type="button"
          onClick={onPostToTikTok}
          disabled={busy !== null}
          aria-busy={busy === 'post'}
          title="Opens TikTok so you can post this recording"
        >
          {busy === 'post' ? 'Opening…' : 'Post to TikTok'}
        </button>
        {showFeature && (
          <button
            type="button"
            onClick={onFeature}
            disabled={busy !== null}
            aria-busy={busy === 'feature'}
            title="Request this recording be featured on our TikTok"
          >
            {busy === 'feature' ? 'Queueing…' : 'Feature on TikTok'}
          </button>
        )}
      </div>
      {notice && (
        <p
          role="status"
          aria-live="polite"
          className={`live-rec-share__notice live-rec-share__notice--${notice.kind}`}
          style={{
            fontSize: '0.85rem',
            margin: '0.5rem 0 0',
            opacity: notice.kind === 'error' ? 1 : 0.9,
            color:
              notice.kind === 'error'
                ? '#ff8a8a'
                : notice.kind === 'ok'
                  ? '#8affc1'
                  : 'inherit',
          }}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
