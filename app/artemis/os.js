// Artemis OS — window manager + app registry (pure logic, no DOM).
// Everything here is testable in Node; the React page consumes it.

export const APPS = [
  {
    id: 'nexus',
    name: 'Nexus Hub',
    icon: '◈',
    tagline: 'Mission dashboard',
    description: 'System overview, quick-launch grid, and session stats.',
  },
  {
    id: 'terminal',
    name: 'Terminal',
    icon: '⌁',
    tagline: 'Command line',
    description: 'A pretend command line. Try: help, apps, launch monitor.',
  },
  {
    id: 'monitor',
    name: 'Monitor',
    icon: '≋',
    tagline: 'System vitals',
    description: 'Live procedural gauges. Simulated, not measured.',
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: '✎',
    tagline: 'Scratchpad',
    description: 'Device-local notes. Nothing leaves this tab.',
  },
  {
    id: 'about',
    name: 'About',
    icon: 'ⓘ',
    tagline: 'What this is',
    description: 'An honest statement about this concept interface.',
  },
];

export function appById(id) {
  return APPS.find((a) => a.id === id) || null;
}

export function createDesktopState() {
  return { windows: [], zTop: 10, seq: 0 };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// Default window geometry, staggered so new windows cascade.
export function defaultGeometry(seq, viewport) {
  const vw = viewport?.w ?? 1200;
  const vh = viewport?.h ?? 800;
  const w = Math.min(560, vw - 32);
  const h = Math.min(380, vh - 140);
  const x = clamp(60 + (seq % 6) * 36, 8, Math.max(8, vw - w - 8));
  const y = clamp(90 + (seq % 6) * 28, 8, Math.max(8, vh - h - 8));
  return { x, y, w, h };
}

export function spawnWindow(state, appId, viewport) {
  const app = appById(appId);
  if (!app) return state;
  const existing = state.windows.find((w) => w.appId === appId && !w.closed);
  // Focus the existing window instead of duplicating it.
  if (existing) return focusWindow({ ...state }, existing.id);
  const seq = state.seq + 1;
  const zTop = state.zTop + 1;
  const geo = defaultGeometry(seq, viewport);
  const win = {
    id: `win_${appId}_${seq}`,
    appId,
    title: app.name,
    ...geo,
    minimized: false,
    closed: false,
    z: zTop,
  };
  return {
    ...state,
    seq,
    zTop,
    windows: [...state.windows.filter((w) => !w.closed), win],
  };
}

export function focusWindow(state, id) {
  const zTop = state.zTop + 1;
  return {
    ...state,
    zTop,
    windows: state.windows.map((w) =>
      w.id === id ? { ...w, z: zTop, minimized: false } : w
    ),
  };
}

export function minimizeWindow(state, id) {
  return {
    ...state,
    windows: state.windows.map((w) =>
      w.id === id ? { ...w, minimized: true } : w
    ),
  };
}

export function closeWindow(state, id) {
  return {
    ...state,
    windows: state.windows.map((w) =>
      w.id === id ? { ...w, closed: true, minimized: false } : w
    ),
  };
}

export function moveWindow(state, id, x, y, viewport) {
  const vw = viewport?.w ?? 1200;
  const vh = viewport?.h ?? 800;
  return {
    ...state,
    windows: state.windows.map((w) => {
      if (w.id !== id) return w;
      return {
        ...w,
        x: clamp(Math.round(x), -w.w + 80, vw - 80),
        y: clamp(Math.round(y), 0, Math.max(0, vh - 60)),
      };
    }),
  };
}

// Snap a window to the left or right half when dropped near an edge.
export function snapWindow(state, id, edge, viewport) {
  const vw = viewport?.w ?? 1200;
  const vh = viewport?.h ?? 800;
  if (edge !== 'left' && edge !== 'right') return state;
  const w = Math.floor(vw / 2);
  return {
    ...state,
    windows: state.windows.map((win) =>
      win.id === id
        ? {
            ...win,
            x: edge === 'left' ? 0 : vw - w,
            y: 0,
            w,
            h: vh,
          }
        : win
    ),
  };
}

// Which edge (if any) a drag position is close enough to snap to.
export function snapEdgeFor(x, viewportW, threshold = 24) {
  if (x <= threshold) return 'left';
  if (x >= viewportW - threshold) return 'right';
  return null;
}

export function visibleWindows(state) {
  return state.windows.filter((w) => !w.closed && !w.minimized);
}

export function minimizedWindows(state) {
  return state.windows.filter((w) => !w.closed && w.minimized);
}

// Resolve a command-bar / omnibox input into an action.
// Returns { action: 'launch', appId } | { action: 'unknown', query } | { action: 'noop' }
export function resolveCommand(rawInput) {
  const q = (rawInput || '').trim().toLowerCase();
  if (!q) return { action: 'noop' };
  const stripped = q.replace(/^(launch|open|start|run)\s+/, '');
  const hit = APPS.find(
    (a) =>
      a.id === stripped ||
      a.name.toLowerCase() === stripped ||
      a.name.toLowerCase().startsWith(stripped) ||
      a.id.startsWith(stripped)
  );
  if (hit) return { action: 'launch', appId: hit.id, query: q };
  return { action: 'unknown', query: q };
}
