'use client';

// Rogers Arena — real event ticket browsing.
// ALL listings come from the live Ticketmaster Discovery API through our own
// server routes (/rogers-arena/api/*). No fake or placeholder events, ever.
// Purchases are never completed here: the flow ends in an honest handoff to
// Ticketmaster's official checkout page, clearly labeled as leaving the app.

import { useCallback, useState } from 'react';
import Image from 'next/image';
import {
  POPULAR_VENUES,
  CATEGORY_LABELS,
  filterByCategory,
  formatEventDate,
  formatPrice,
  OFFLINE_COPY,
} from '@/lib/tickets';

const CATEGORIES = ['all', 'hockey', 'concerts', 'sports', 'arts', 'other'];

// --- DIONYSUS interior treatment: SVG glyphs + styled loading state ---
const RA_T_GLYPHS = {
  back: 'M15.5 4.5 8 12l7.5 7.5 1.8-1.8L11.6 12l5.7-5.7z',
  next: 'M8.5 4.5 16 12l-7.5 7.5-1.8-1.8L12.4 12 6.7 6.3z',
  search: 'M10 2a8 8 0 1 0 4.9 14.3l5 5 1.4-1.4-5-5A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z',
  refresh: 'M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z',
};
function TicketIcon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
      <path d={RA_T_GLYPHS[name]} />
    </svg>
  );
}
function TicketLoader({ text }) {
  return (
    <div className="py-8 text-center" role="status" aria-label={text}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mx-auto animate-spin">
        <circle cx="12" cy="12" r="9" stroke="rgba(0,229,255,0.2)" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#00e5ff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="text-cyan-200/80 text-sm mt-3 tracking-widest uppercase">{text}</p>
    </div>
  );
}

async function apiJson(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default function Tickets() {
  const [view, setView] = useState('search'); // search | events | detail
  const [query, setQuery] = useState('');
  const [venues, setVenues] = useState([]);
  const [venue, setVenue] = useState(null);
  const [events, setEvents] = useState([]);
  const [category, setCategory] = useState('all');
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | offline | error
  const [errorNote, setErrorNote] = useState('');

  const fail = useCallback((res, data) => {
    if (res.status === 503 && data && data.offline) {
      setStatus('offline');
    } else {
      setStatus('error');
      setErrorNote(data && data.error ? String(data.error) : 'Something went wrong.');
    }
  }, []);

  const searchVenues = useCallback(
    async (term) => {
      const q = (term ?? query).trim();
      if (!q) return;
      setStatus('loading');
      setErrorNote('');
      const { res, data } = await apiJson(`/rogers-arena/api/venues?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        fail(res, data);
        return;
      }
      setVenues(Array.isArray(data.venues) ? data.venues : []);
      setStatus('idle');
      setView('search');
    },
    [query, fail]
  );

  const openVenue = useCallback(
    async (v) => {
      setVenue(v);
      setCategory('all');
      setStatus('loading');
      setErrorNote('');
      const { res, data } = await apiJson(
        `/rogers-arena/api/events?venueId=${encodeURIComponent(v.id)}`
      );
      if (!res.ok) {
        fail(res, data);
        return;
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
      setStatus('idle');
      setView('events');
    },
    [fail]
  );

  const openEvent = useCallback(
    async (ev) => {
      setStatus('loading');
      setErrorNote('');
      const { res, data } = await apiJson(`/rogers-arena/api/event?id=${encodeURIComponent(ev.id)}`);
      if (!res.ok) {
        fail(res, data);
        return;
      }
      setDetail(data.event || null);
      setStatus('idle');
      setView('detail');
    },
    [fail]
  );

  const backToEvents = useCallback(() => {
    setDetail(null);
    setView('events');
  }, []);

  const backToSearch = useCallback(() => {
    setVenue(null);
    setEvents([]);
    setDetail(null);
    setView('search');
  }, []);

  const shown = filterByCategory(events, category);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-24">
      {/* Header */}
      <div className="pt-4 sm:pt-6 pb-4">
        <h1 className="text-xl sm:text-2xl font-black tracking-widest uppercase">
          Event Tickets
        </h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">
          Real upcoming events at real stadiums — hockey, concerts, and more.
          Listings come live from Ticketmaster.
        </p>
      </div>

      {status === 'offline' && (
        <section
          className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 sm:p-6 mb-4"
          role="alert"
        >
          <h2 className="font-bold text-amber-200">{OFFLINE_COPY.title}</h2>
          <p className="text-sm text-amber-100/80 mt-2">{OFFLINE_COPY.body}</p>
          <button
            onClick={() => {
              setStatus('idle');
              setView('search');
            }}
            className="mt-4 min-h-[44px] px-5 rounded-xl border border-amber-300/50 text-amber-100 text-sm font-bold uppercase tracking-widest inline-flex items-center gap-2"
          >
            <TicketIcon name="refresh" />
            Try again
          </button>
        </section>
      )}

      {status === 'error' && (
        <section className="rounded-2xl border border-red-400/40 bg-red-400/10 p-5 mb-4" role="alert">
          <h2 className="font-bold text-red-200">Couldn&apos;t load listings</h2>
          <p className="text-sm text-red-100/80 mt-2">
            {errorNote} Please try again in a moment.
          </p>
        </section>
      )}

      {view === 'search' && status !== 'offline' && (
        <section aria-label="Find a stadium">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              searchVenues();
            }}
            className="flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a stadium, e.g. Rogers Arena"
              aria-label="Stadium name"
              className="flex-1 min-h-[48px] rounded-xl bg-white/5 border border-white/15 px-4 text-sm sm:text-base placeholder:text-zinc-500 focus:outline-none focus:border-cyan-400/70"
            />
            <button
              type="submit"
              className="min-h-[48px] px-5 rounded-xl bg-cyan-400/90 text-black text-sm font-bold uppercase tracking-widest flex items-center gap-2"
            >
              <TicketIcon name="search" />
              Search
            </button>
          </form>

          <p className="text-[11px] text-zinc-500 uppercase tracking-widest mt-5 mb-2">
            Popular stadiums
          </p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_VENUES.map((name) => (
              <button
                key={name}
                onClick={() => {
                  setQuery(name);
                  searchVenues(name);
                }}
                className="min-h-[44px] px-4 rounded-full text-xs sm:text-sm border border-white/20 bg-black/60 text-zinc-200 hover:border-cyan-400/60"
              >
                {name}
              </button>
            ))}
          </div>

          {status === 'loading' && (
            <TicketLoader text="Searching stadiums…" />
          )}

          {status === 'idle' && venues.length > 0 && (
            <ul className="mt-6 space-y-2" aria-label="Stadium results">
              {venues.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => openVenue(v)}
                    className="w-full text-left min-h-[56px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:border-cyan-400/60 flex items-center justify-between gap-3"
                  >
                    <span>
                      <span className="block font-bold text-sm sm:text-base">{v.name}</span>
                      <span className="block text-xs text-zinc-400 mt-0.5">
                        {[v.city, v.region, v.country].filter(Boolean).join(', ')}
                        {typeof v.upcomingEvents === 'number'
                          ? ` · ${v.upcomingEvents} upcoming events`
                          : ''}
                      </span>
                    </span>
                    <span className="text-cyan-300" aria-hidden="true"><TicketIcon name="next" size={20} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {status === 'idle' && venues.length === 0 && query.trim() && (
            <p className="text-sm text-zinc-400 mt-6">
              No stadiums found for “{query.trim()}”. Try another name.
            </p>
          )}
        </section>
      )}

      {view === 'events' && venue && (
        <section aria-label={`Events at ${venue.name}`}>
          <button
            onClick={backToSearch}
            className="min-h-[44px] text-sm text-cyan-300 underline underline-offset-4 mb-2 inline-flex items-center gap-1"
          >
            <TicketIcon name="back" size={14} />
            Back to stadium search
          </button>
          <h2 className="text-lg sm:text-xl font-black">{venue.name}</h2>
          <p className="text-xs text-zinc-400 mt-1">
            {[venue.city, venue.region, venue.country].filter(Boolean).join(', ')}
          </p>

          <div className="flex gap-2 mt-4 overflow-x-auto pb-1" role="group" aria-label="Event types">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`min-h-[44px] px-4 rounded-full text-xs sm:text-sm font-bold uppercase tracking-widest border whitespace-nowrap ${
                  category === c
                    ? 'bg-cyan-400/90 text-black border-cyan-300'
                    : 'bg-black/60 text-zinc-300 border-white/20'
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {status === 'loading' && (
            <TicketLoader text="Loading events…" />
          )}

          {status === 'idle' && shown.length === 0 && (
            <p className="text-sm text-zinc-400 mt-6">
              {events.length === 0
                ? `No upcoming events listed for ${venue.name} right now.`
                : `No ${CATEGORY_LABELS[category].toLowerCase()} events at ${venue.name} right now.`}
            </p>
          )}

          <ul className="mt-4 space-y-3" aria-label="Events">
            {shown.map((ev) => (
              <li key={ev.id}>
                <button
                  onClick={() => openEvent(ev)}
                  className="w-full text-left rounded-2xl border border-white/10 bg-white/5 overflow-hidden hover:border-cyan-400/60"
                >
                  {ev.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ev.image}
                      alt=""
                      loading="lazy"
                      className="w-full h-32 sm:h-40 object-cover"
                    />
                  )}
                  <span className="block p-4">
                    <span className="block font-bold text-sm sm:text-base">{ev.name}</span>
                    <span className="block text-xs text-zinc-400 mt-1">
                      {formatEventDate(ev)}
                      {ev.segment ? ` · ${ev.segment}` : ''}
                      {ev.genre ? ` · ${ev.genre}` : ''}
                    </span>
                    {formatPrice(ev.price) && (
                      <span className="block text-sm text-cyan-200 font-semibold mt-2">
                        {formatPrice(ev.price)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'detail' && detail && (
        <EventDetail event={detail} venueName={venue?.name} onBack={backToEvents} />
      )}

      {status === 'loading' && view === 'detail' && !detail && (
        <TicketLoader text="Loading event…" />
      )}
    </div>
  );
}

function EventDetail({ event, venueName, onBack }) {
  const ev = event;
  return (
    <article aria-label={ev.name}>
      <button
        onClick={onBack}
        className="min-h-[44px] text-sm text-cyan-300 underline underline-offset-4 mb-3 inline-flex items-center gap-1"
      >
        <TicketIcon name="back" size={14} />
        Back to events
      </button>

      {ev.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ev.image}
          alt=""
          className="w-full h-44 sm:h-56 object-cover rounded-2xl"
        />
      )}

      <h2 className="text-xl sm:text-2xl font-black mt-4">{ev.name}</h2>
      <p className="text-sm text-zinc-400 mt-2">
        {formatEventDate(ev)}
        {venueName ? ` · ${venueName}` : ''}
      </p>
      {(ev.segment || ev.genre) && (
        <p className="text-xs text-zinc-500 mt-1">
          {[ev.segment, ev.genre].filter(Boolean).join(' · ')}
        </p>
      )}

      {formatPrice(ev.price) && (
        <p className="text-lg text-cyan-200 font-bold mt-4">{formatPrice(ev.price)}</p>
      )}
      <p className="text-[11px] text-zinc-500 mt-1">
        Prices come from Ticketmaster and can change.
      </p>

      {ev.seatmap && (
        <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <summary className="min-h-[44px] cursor-pointer font-bold text-sm flex items-center">
            View seat map
          </summary>
          <Image src={ev.seatmap} alt="Seat map for this event" width={800} height={600} unoptimized className="mt-2 w-full h-auto rounded-lg" />
        </details>
      )}

      {(ev.info || ev.pleaseNote || ev.ticketLimit) && (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300 space-y-2">
          {ev.info && <p>{ev.info}</p>}
          {ev.pleaseNote && <p>{ev.pleaseNote}</p>}
          {ev.ticketLimit && <p className="text-xs text-zinc-500">{ev.ticketLimit}</p>}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-5">
        {ev.ticketUrl ? (
          <>
            <a
              href={ev.ticketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center min-h-[52px] leading-[52px] rounded-xl bg-cyan-400/90 text-black text-sm font-black uppercase tracking-widest"
            >
              Continue to Ticketmaster to complete purchase
            </a>
            <p className="text-[11px] text-zinc-500 mt-3 text-center">
              You&apos;ll leave this app — Ticketmaster sells the tickets and
              handles payment. We never take your card details.
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-300">
            Tickets aren&apos;t listed for this event on Ticketmaster right now.
          </p>
        )}
      </div>
    </article>
  );
}
