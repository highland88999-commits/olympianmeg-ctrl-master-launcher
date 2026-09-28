import { create } from 'zustand';
import * as THREE from 'three';

// Base coordinate arrays from your original architecture
const RAW_PROFILES = {
  pawn: [0,0, 0.20,0, 0.23,0.38, 0.13,0.58, 0.19,0.68],
  rook: [0,0, 0.28,0, 0.28,0.48, 0.22,0.72, 0.32,0.78],
  knight: [0,0, 0.26,0, 0.34,0.38, 0.19,0.58, 0.29,0.74],
  bishop: [0,0, 0.23,0, 0.19,0.58, 0.09,0.85],
  queen: [0,0, 0.31,0, 0.21,0.62, 0.29,0.81, 0.16,0.95],
  king: [0,0, 0.31,0, 0.23,0.57, 0.31,0.80, 0.21,0.97]
};

// Converts raw arrays into THREE.Vector2 paths for LatheGeometry
const generatePoints = (profileData) => {
  const points = [];
  for (let i = 0; i < profileData.length; i += 2) {
    points.push(new THREE.Vector2(profileData[i], profileData[i + 1]));
  }
  return points;
};

export const useGeometryStore = create(() => ({
  pawn: generatePoints(RAW_PROFILES.pawn),
  rook: generatePoints(RAW_PROFILES.rook),
  knight: generatePoints(RAW_PROFILES.knight),
  bishop: generatePoints(RAW_PROFILES.bishop),
  queen: generatePoints(RAW_PROFILES.queen),
  king: generatePoints(RAW_PROFILES.king),
}));


