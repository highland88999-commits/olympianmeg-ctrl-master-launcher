'use client';
import React, { useMemo, memo } from 'react';
import * as THREE from 'three';
import ProceduralRoads from './ProceduralRoads';

const BLOCK_SIZE = 100; 
const ROAD_WIDTH = 12;  
const GRID_SIZE = 40; // 40x40 city blocks

// GLOBAL MATERIALS: 1,000 city blocks will only use 1 material in GPU memory.
const slabMaterial = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.9, metalness: 0.1 });
const lineMaterial = new THREE.LineBasicMaterial({ color: "#00ffff", transparent: true, opacity: 0.3 });

// 🚀 OPTIMIZATION: React.memo prevents existing plots from re-rendering when Omega Mind calls a new one
export const Plot = memo(({ gridX, gridZ, spanX = 1, spanZ = 1, name, children }) => {
    
    // MEMOIZED GEOMETRY: Locks math into the GPU cache
    const { posX, posZ, slabGeo, edgesGeo } = useMemo(() => {
        const pX = gridX * BLOCK_SIZE + ((spanX - 1) * BLOCK_SIZE) / 2;
        const pZ = gridZ * BLOCK_SIZE + ((spanZ - 1) * BLOCK_SIZE) / 2;
        
        const parcelWidth = spanX * BLOCK_SIZE - ROAD_WIDTH;
        const parcelDepth = spanZ * BLOCK_SIZE - ROAD_WIDTH;

        const baseGeo = new THREE.BoxGeometry(parcelWidth, 0.5, parcelDepth);
        const lineBaseGeo = new THREE.BoxGeometry(parcelWidth, 0, parcelDepth);
        const edgeGeo = new THREE.EdgesGeometry(lineBaseGeo);

        return { posX: pX, posZ: pZ, slabGeo: baseGeo, edgesGeo: edgeGeo };
    }, [gridX, gridZ, spanX, spanZ]);

    return (
        <group position={[posX, 0, posZ]} name={`Plot_${name}`}>
            <mesh position={[0, 0.25, 0]} geometry={slabGeo} material={slabMaterial} receiveShadow />
            <lineSegments position={[0, 0.51, 0]} geometry={edgesGeo} material={lineMaterial} />
            <group position={[0, 0.5, 0]}>
                {children}
            </group>
        </group>
    );
});

Plot.displayName = 'Plot';

// 📡 OMEGA MIND AUTO-CALLER ALGORITHM
// Wire this into Supabase: Pass it your active ZoneRegistry, and it will return a random empty coordinate set
export const allocateFreePlot = (occupiedPlots = [], spanX = 1, spanZ = 1) => {
    const halfGrid = Math.floor(GRID_SIZE / 2);
    const freeSpots = [];

    // Scan every coordinate in the city limits
    for (let x = -halfGrid; x <= halfGrid; x++) {
        for (let z = -halfGrid; z <= halfGrid; z++) {
            let isFree = true;
            
            // Check for geometric collisions against existing zones
            for (const plot of occupiedPlots) {
                const plotRight = plot.x + (plot.w || plot.spanX || 1) - 1;
                const plotBottom = plot.z + (plot.h || plot.spanZ || 1) - 1;
                const candRight = x + spanX - 1;
                const candBottom = z + spanZ - 1;

                // AABB Overlap Formula: If they overlap, this coordinate is dead
                if (!(x > plotRight || candRight < plot.x || z > plotBottom || candBottom < plot.z)) {
                    isFree = false;
                    break;
                }
            }

            if (isFree) freeSpots.push({ x, z });
        }
    }

    if (freeSpots.length === 0) {
        console.warn("[OMEGA MIND] Critical Density Reached. No free plots available.");
        return null;
    }

    // Randomly assign one of the available sectors
    const assigned = freeSpots[Math.floor(Math.random() * freeSpots.length)];
    return assigned; // Returns { x: int, z: int }
};

export default function GridMaster({ children }) {
    return (
        <group>
            {/* The infinite asphalt matrix */}
            <ProceduralRoads gridSize={GRID_SIZE} blockSize={BLOCK_SIZE} />
            {children}
        </group>
    );
}
