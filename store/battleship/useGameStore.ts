import { create } from 'zustand'
import { fx } from '@/lib/fx'

// Which ship (if any) was NEWLY destroyed by this shot: destroyed now but
// not before. One id — a single shot can only sink one ship.
function newlySunkId(before: ShipData[], after: ShipData[]): string | null {
  const s = after.find((a) => a.destroyed && !before.find((b) => b.id === a.id)?.destroyed);
  return s ? s.id : null;
}

/** Fire the matched FX for a resolved shot. win/lose handled by caller. */
function shotFx(isHit: boolean, sunkId: string | null) {
  try {
    if (sunkId) fx.shipSunk(); // same explosion both directions — one function
    else if (isHit) fx.shipHit(); // medium double-pulse
    else fx.shipMiss(); // light single tick
  } catch {
    /* fx never breaks the game */
  }
}

export type Orientation = 'horizontal' | 'vertical';
export type CellState = 'hit' | 'miss';

export interface ShipData {
  id: string;
  type: string;
  length: number;
  health: number;
  destroyed: boolean;
  position: [number, number, number] | null;
  orientation: Orientation;
}

const INITIAL_FLEET: ShipData[] = [
  { id: 'carrier', type: 'Carrier', length: 5, health: 5, destroyed: false, position: null, orientation: 'horizontal' },
  { id: 'battleship', type: 'Battleship', length: 4, health: 4, destroyed: false, position: null, orientation: 'horizontal' },
  { id: 'cruiser', type: 'Cruiser', length: 3, health: 3, destroyed: false, position: null, orientation: 'horizontal' },
  { id: 'submarine', type: 'Submarine', length: 3, health: 3, destroyed: false, position: null, orientation: 'horizontal' },
  { id: 'destroyer', type: 'Destroyer', length: 2, health: 2, destroyed: false, position: null, orientation: 'horizontal' },
];

interface GameState {
  roomId: string | null;
  isHost: boolean;
  mode: 'pvp' | 'pve';
  status: 'setup' | 'waiting_sync' | 'playing' | 'game_over';
  turn: 'player' | 'opponent';
  viewMode: 'fleet' | 'target'; 
  winner: 'player' | 'opponent' | null;
  playerShips: ShipData[];
  opponentShips: ShipData[];
  playerShots: Record<string, CellState>; 
  opponentShots: Record<string, CellState>;
  placingIndex: number;
  placementOrientation: Orientation;

  setRoomId: (id: string, isHost: boolean) => void;
  setGameMode: (mode: 'pvp' | 'pve') => void;
  setViewMode: (v: 'fleet' | 'target') => void;
  setPlacementOrientation: (o: Orientation) => void;
  toggleOrientation: () => void;
  placeShip: (x: number, z: number) => void;
  confirmFleet: () => void;
  receiveOpponentFleet: (fleet: ShipData[]) => void;
  fireShot: (x: number, z: number) => void;
  receiveShot: (x: number, z: number) => void;
  broadcastShot: (x: number, z: number) => void;
  broadcastFleet: (fleet: ShipData[]) => void;
  aiTurn: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  roomId: null,
  isHost: false,
  mode: 'pve',
  status: 'setup',
  turn: 'player',
  viewMode: 'fleet',
  winner: null,
  playerShips: INITIAL_FLEET.map(ship => ({ ...ship })),
  opponentShips: [],
  playerShots: {},
  opponentShots: {},
  placingIndex: 0,
  placementOrientation: 'horizontal',

  setRoomId: (id, isHost) => set({ 
    roomId: id, isHost, status: 'setup', viewMode: 'fleet', turn: isHost ? 'player' : 'opponent', playerShips: INITIAL_FLEET.map(ship => ({ ...ship })), placingIndex: 0 
  }),
  setGameMode: (mode) => set({ mode }),
  setViewMode: (v) => set({ viewMode: v }),
  setPlacementOrientation: (o) => set({ placementOrientation: o }),
  toggleOrientation: () => set(state => ({ placementOrientation: state.placementOrientation === 'horizontal' ? 'vertical' : 'horizontal' })),

  placeShip: (x, z) => {
    const { placingIndex, placementOrientation, playerShips } = get();
    if (placingIndex >= playerShips.length) return;

    const ship = playerShips[placingIndex];
    const occupied = new Set<string>();

    for (let i = 0; i < ship.length; i++) {
      const cx = placementOrientation === 'horizontal' ? x + i * 2 : x;
      const cz = placementOrientation === 'vertical' ? z + i * 2 : z;
      if (Math.abs(cx) > 9 || Math.abs(cz) > 9) return; 
      occupied.add(`${cx},${cz}`);
    }

    let overlap = false;
    playerShips.forEach((s, idx) => {
      if (idx >= placingIndex || !s.position) return;
      for (let i = 0; i < s.length; i++) {
        const sx = s.orientation === 'horizontal' ? s.position[0] + i * 2 : s.position[0];
        const sz = s.orientation === 'vertical' ? s.position[2] + i * 2 : s.position[2];
        if (occupied.has(`${sx},${sz}`)) overlap = true;
      }
    });

    if (overlap) return;

    set((state) => {
      const newShips = [...state.playerShips];
      newShips[placingIndex] = { ...ship, position: [x, 0, z], orientation: placementOrientation };
      return { playerShips: newShips, placingIndex: state.placingIndex + 1 };
    });
  },

  confirmFleet: () => {
    const { mode, playerShips, broadcastFleet, opponentShips } = get();
    if (mode === 'pve') {
      const aiFleet = INITIAL_FLEET.map(ship => ({ ...ship }));
      const occupied = new Set<string>();
      
      aiFleet.forEach(ship => {
        let placed = false;
        while (!placed) {
          const isHoriz = Math.random() > 0.5;
          const x = Math.floor(Math.random() * 10) * 2 - 9;
          const z = Math.floor(Math.random() * 10) * 2 - 9;
          let valid = true;
          const coords = [];
          
          for (let i = 0; i < ship.length; i++) {
            const cx = isHoriz ? x + i * 2 : x;
            const cz = isHoriz ? z : z + i * 2;
            if (Math.abs(cx) > 9 || Math.abs(cz) > 9 || occupied.has(`${cx},${cz}`)) { valid = false; break; }
            coords.push(`${cx},${cz}`);
          }
          
          if (valid) {
            ship.position = [x, 0, z];
            ship.orientation = isHoriz ? 'horizontal' : 'vertical';
            coords.forEach(c => occupied.add(c));
            placed = true;
          }
        }
      });
      set({ opponentShips: aiFleet, status: 'playing', viewMode: 'target' });
    } else {
      broadcastFleet(playerShips);
      if (opponentShips.length > 0) set({ status: 'playing', viewMode: 'target' });
      else set({ status: 'waiting_sync' });
    }
  },

  receiveOpponentFleet: (fleet) => {
    const { status, broadcastFleet, playerShips, opponentShips } = get();
    if (opponentShips.length === 0 && (status === 'waiting_sync' || status === 'setup')) {
      setTimeout(() => broadcastFleet(playerShips), 500);
    }
    set((state) => {
      if (state.status === 'waiting_sync' || state.status === 'setup') return { opponentShips: fleet, status: 'playing', viewMode: 'target' };
      return { opponentShips: fleet };
    });
  },

  fireShot: (x, z) => {
    const { status, turn, opponentShips, playerShots, mode } = get();
    if (status !== 'playing' || turn !== 'player') return;
    
    const key = `${x},${z}`;
    if (playerShots[key]) return; 

    let hitShipId: string | null = null;
    const newOpponentShips = opponentShips.map(ship => {
      if (!ship.position) return ship;
      for (let i = 0; i < ship.length; i++) {
        const sx = ship.orientation === 'horizontal' ? ship.position[0] + i * 2 : ship.position[0];
        const sz = ship.orientation === 'vertical' ? ship.position[2] + i * 2 : ship.position[2];
        if (sx === x && sz === z) {
          hitShipId = ship.id;
          const health = ship.health - 1;
          return { ...ship, health, destroyed: health <= 0 };
        }
      }
      return ship;
    });

    const isHit = !!hitShipId;
    const allDestroyed = newOpponentShips.every(s => s.destroyed);
    const sunkId = newlySunkId(opponentShips, newOpponentShips);

    set((state) => ({
      playerShots: { ...state.playerShots, [key]: isHit ? 'hit' : 'miss' },
      opponentShips: newOpponentShips,
      turn: 'opponent', 
      winner: allDestroyed ? 'player' : state.winner,
      status: allDestroyed ? 'game_over' : state.status
    }));

    if (allDestroyed) {
      // Final shot: the last ship still gets its explosion (identical to every
      // other sink), then the win fanfare follows after a beat so the two
      // effects don't stack on top of each other.
      shotFx(isHit, sunkId);
      setTimeout(() => { try { fx.gameWin(); } catch { /* noop */ } }, 500);
    } else shotFx(isHit, sunkId);

    if (mode === 'pve' && !allDestroyed) setTimeout(() => get().aiTurn(), 1000);
  },

  receiveShot: (x, z) => {
    const { playerShips } = get();
    let hitShipId: string | null = null;
    
    const newPlayerShips = playerShips.map(ship => {
      if (!ship.position) return ship;
      for (let i = 0; i < ship.length; i++) {
        const sx = ship.orientation === 'horizontal' ? ship.position[0] + i * 2 : ship.position[0];
        const sz = ship.orientation === 'vertical' ? ship.position[2] + i * 2 : ship.position[2];
        if (sx === x && sz === z) {
          hitShipId = ship.id;
          const health = ship.health - 1;
          return { ...ship, health, destroyed: health <= 0 };
        }
      }
      return ship;
    });

    const isHit = !!hitShipId;
    const allDestroyed = newPlayerShips.every(s => s.destroyed);
    const sunkId = newlySunkId(playerShips, newPlayerShips);

    set((state) => ({
      opponentShots: { ...state.opponentShots, [`${x},${z}`]: isHit ? 'hit' : 'miss' },
      playerShips: newPlayerShips,
      turn: 'player', 
      winner: allDestroyed ? 'opponent' : state.winner,
      status: allDestroyed ? 'game_over' : state.status
    }));

    if (allDestroyed) {
      // Final shot: the last ship still gets its explosion (identical to every
      // other sink), then the defeat rumble follows after a beat.
      shotFx(isHit, sunkId);
      setTimeout(() => { try { fx.death(); } catch { /* noop */ } }, 500);
    } else shotFx(isHit, sunkId);
  },

  broadcastShot: (x, z) => get().fireShot(x, z),
  broadcastFleet: (fleet) => {},

  aiTurn: () => {
    const { opponentShots, receiveShot } = get();
    let x, z, coordKey;
    do {
      x = Math.floor(Math.random() * 10) * 2 - 9;
      z = Math.floor(Math.random() * 10) * 2 - 9;
      coordKey = `${x},${z}`;
    } while (opponentShots[coordKey]);
    receiveShot(x, z);
  }
}))


