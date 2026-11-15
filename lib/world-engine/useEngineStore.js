// World Engine — shared client state (zustand, persisted to localStorage).
// Ported from nexus-vortex's useEngineStore with:
// - persist key renamed to the module namespace ("world-engine-state"),
// - logic database fetched from the module's public path.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// Store defaults live in the per-builder datasheets
// (lib/world-engine/datasheets/*.js) — the single source of truth.
import { WORLD_STORE_DEFAULTS } from './datasheets/world.js';
import { WEAPON_STORE_DEFAULTS } from './datasheets/weapons.js';
import { OBJECT_STORE_DEFAULTS } from './datasheets/objects.js';
import { CHARACTER_STORE_DEFAULTS, CREATURE_STORE_DEFAULTS } from './datasheets/characters.js';
import { VEHICLE_STORE_DEFAULTS } from './datasheets/vehicles.js';
import { WEATHER_STORE_DEFAULTS } from './datasheets/weather.js';
import { ASSET_LINK_STORE_DEFAULTS } from './datasheets/uplink.js';

const defaultWorld = WORLD_STORE_DEFAULTS;
const defaultWeapon = WEAPON_STORE_DEFAULTS;
const defaultObject = OBJECT_STORE_DEFAULTS;
const defaultCharacter = CHARACTER_STORE_DEFAULTS;
const defaultCreature = CREATURE_STORE_DEFAULTS;
const defaultVehicle = VEHICLE_STORE_DEFAULTS;
const defaultWeather = WEATHER_STORE_DEFAULTS;
const defaultAssetLink = ASSET_LINK_STORE_DEFAULTS;

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
