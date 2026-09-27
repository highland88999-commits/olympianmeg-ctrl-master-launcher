// World Engine — shared client state (zustand, persisted to localStorage).
// Ported from nexus-vortex's useEngineStore with:
// - persist key renamed to the module namespace ("world-engine-state"),
// - logic database fetched from the module's public path.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const defaultWorld = {
  sunColor: '#ffffff',
  ambientTint: '#010305',
  elevationScale: 5.0,
  waterLevelRadius: 51.0,
  planetRotationSpeed: 0.001,
  atmosphereDensity: 0.6,
  ambientLightIntensity: 0.8,
  terrainRoughness: 0.8,
  terrainType: 'plains',
  weatherType: 'clear',
  precipitationIntensity: 0.0,
  windSpeed: 0.0,
  objectDensity: 0.5,
};

const defaultObject = {
  scale: { x: 1, y: 1, z: 1 },
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  density: 0.5,
  material: 'standard',
  color: '#00ffcc',
};

const defaultCharacter = {
  scale: { x: 1, y: 1, z: 1 },
  height: 1.8,
  proportions: { head: 1, torso: 1, limbs: 1 },
  position: { x: 0, y: 0, z: 0 },
  rotation: { y: 0 },
  color: '#ffffff',
  animationSet: 'idle',
};

const defaultWeapon = {
  scale: { x: 1, y: 1, z: 1 },
  length: 1.0,
  damage: 10,
  material: 'metal',
  color: '#ffd700',
};

const defaultCreature = {
  scale: { x: 1, y: 1, z: 1 },
  sizeClass: 'medium',
  aggression: 0.5,
  color: '#00ff00',
};

const defaultVehicle = {
  scale: { x: 1, y: 1, z: 1 },
  speed: 50,
  handling: 0.7,
  color: '#ff5500',
};

const defaultWeather = {
  weatherType: 'clear',
  precipitationIntensity: 0.0,
  windSpeed: 0.0,
  particleLimit: 5000,
  fogDensity: 0.0,
};

const defaultAssetLink = {
  url: '',
  type: 'glb',
  scale: { x: 1, y: 1, z: 1 },
};

export const useEngineStore = create(
  persist(
    (set, get) => ({
      world: { ...defaultWorld },
      assetLink: { ...defaultAssetLink },
      object: { ...defaultObject },
      weapon: { ...defaultWeapon },
      character: { ...defaultCharacter },
      creature: { ...defaultCreature },
      vehicle: { ...defaultVehicle },
      weather: { ...defaultWeather },
      activeModule: 'world',

      // Dynamic logic database (never persisted; fetched fresh on boot)
      skyscraperLogic: null,

      loadSkyscraperLogic: async () => {
        if (get().skyscraperLogic) return get().skyscraperLogic;
        try {
          const response = await fetch('/data/world-engine/skyscraper-logic.json');
          if (!response.ok) throw new Error('Failed to load logic database');
          const data = await response.json();
          set({ skyscraperLogic: data });
          return data;
        } catch (error) {
          console.error('Logic Engine Error:', error);
          return null;
        }
      },

      setWorldParams: (params) =>
        set((state) => ({ world: { ...state.world, ...params } })),

      setObjectDimensions: (dims) =>
        set((state) => ({
          object: {
            ...state.object,
            ...dims,
            scale: { ...state.object.scale, ...(dims.scale || {}) },
            position: { ...state.object.position, ...(dims.position || {}) },
            rotation: { ...state.object.rotation, ...(dims.rotation || {}) },
          },
        })),

      setCharacterDimensions: (dims) =>
        set((state) => ({
          character: {
            ...state.character,
            ...dims,
            scale: { ...state.character.scale, ...(dims.scale || {}) },
            position: { ...state.character.position, ...(dims.position || {}) },
            proportions: { ...state.character.proportions, ...(dims.proportions || {}) },
          },
        })),

      setWeaponParams: (params) =>
        set((state) => ({ weapon: { ...state.weapon, ...params } })),
      setCreatureParams: (params) =>
        set((state) => ({ creature: { ...state.creature, ...params } })),
      setVehicleParams: (params) =>
        set((state) => ({ vehicle: { ...state.vehicle, ...params } })),
      setWeatherParams: (params) =>
        set((state) => ({ weather: { ...state.weather, ...params } })),
      setAssetLink: (params) =>
        set((state) => ({ assetLink: { ...state.assetLink, ...params } })),
      setActiveModule: (module) => set({ activeModule: module }),

      applySynthesizedParams: (module, rawParams) => {
        const key = (module || '').toLowerCase();
        if (key === 'world') get().setWorldParams(rawParams);
        else if (key === 'object') get().setObjectDimensions(rawParams);
        else if (key === 'character') get().setCharacterDimensions(rawParams);
        else if (key === 'weapon') get().setWeaponParams(rawParams);
        else if (key === 'creature') get().setCreatureParams(rawParams);
        else if (key === 'vehicle') get().setVehicleParams(rawParams);
        else if (key === 'weather') get().setWeatherParams(rawParams);
        else if (key === 'asset_link' || key === 'assetlink') get().setAssetLink(rawParams);
      },

      resetModule: (module) => {
        const defaults = {
          world: defaultWorld,
          object: defaultObject,
          character: defaultCharacter,
          weapon: defaultWeapon,
          creature: defaultCreature,
          vehicle: defaultVehicle,
          weather: defaultWeather,
          assetLink: defaultAssetLink,
        };
        if (defaults[module]) set({ [module]: { ...defaults[module] } });
      },

      resetAll: () =>
        set({
          world: { ...defaultWorld },
          object: { ...defaultObject },
          character: { ...defaultCharacter },
          weapon: { ...defaultWeapon },
          creature: { ...defaultCreature },
          vehicle: { ...defaultVehicle },
          weather: { ...defaultWeather },
          assetLink: { ...defaultAssetLink },
        }),
    }),
    {
      name: 'world-engine-state',
      partialize: (state) => ({
        world: state.world,
        object: state.object,
        character: state.character,
        weapon: state.weapon,
        creature: state.creature,
        vehicle: state.vehicle,
        weather: state.weather,
        assetLink: state.assetLink,
        activeModule: state.activeModule,
      }),
    }
  )
);
