'use client';
import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useMapObjects } from './MapContext';

export default function MiniMap({ onClose }) {
    const { camera } = useThree();
    const { mapObjects, selectedTarget, setSelectedTarget } = useMapObjects();
    const playerDotRef = useRef();

    // Floor is 4000x4000, so extent from 0 is 2000
    const WORLD_EXTENT = 2000; 

    useFrame(() => {
        if (playerDotRef.current) {
            const px = ((camera.position.x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * 100;
            const py = ((camera.position.z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * 100;
            
            playerDotRef.current.style.left = `${Math.max(0, Math.min(100, px))}%`;
            playerDotRef.current.style.top = `${Math.max(0, Math.min(100, py))}%`;
            
            const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            playerDotRef.current.style.transform = `translate(-50%, -50%) rotate(${-euler.y}rad)`;
        }
    });

    return (
        <Html fullscreen zIndexRange={[5000, 0]}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,10,20,0.85)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '90vw', maxWidth: '500px', background: '#050505', border: '2px solid #00ffff', borderRadius: '12px', padding: '20px', position: 'relative', boxShadow: '0 0 40px rgba(0,255,255,0.2)' }}>
                    <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#ff0044', fontSize: '28px', cursor: 'pointer', textShadow: '0 0 10px #ff0044' }}>×</button>
                    <h2 style={{ color: '#00ffff', marginTop: 0, textAlign: 'center', letterSpacing: '4px', textShadow: '0 0 10px #00ffff' }}>TACTICAL MAP</h2>
                    
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: '#020202', border: '1px solid #333', overflow: 'hidden', backgroundImage: 'radial-gradient(#00ffff22 1px, transparent 1px)', backgroundSize: '20px 20px', borderRadius: '8px' }}>
                        
                        {mapObjects.map(obj => {
                            const left = ((obj.x + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * 100;
                            const top = ((obj.z + WORLD_EXTENT) / (WORLD_EXTENT * 2)) * 100;
                            const isSelected = selectedTarget?.id === obj.id;
                            
                            return (
                                <div 
                                    key={obj.id} 
                                    onClick={() => { setSelectedTarget(obj); onClose(); }} 
                                    style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', zIndex: isSelected ? 10 : 1 }}
                                >
                                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: obj.color, boxShadow: `0 0 15px ${obj.color}`, border: isSelected ? '3px solid #fff' : '2px solid #000' }} />
                                    <span style={{ color: '#fff', fontSize: '10px', marginTop: '6px', whiteSpace: 'nowrap', textShadow: '0 0 4px #000, 0 0 8px #000', fontWeight: 'bold' }}>{obj.name}</span>
                                </div>
                            )
                        })}

                        <div ref={playerDotRef} style={{ position: 'absolute', width: '0', height: '0', borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '20px solid #39ff14', filter: 'drop-shadow(0 0 8px #39ff14)', transition: 'top 0.1s, left 0.1s', zIndex: 20 }} />
                    </div>

                    {selectedTarget ? (
                        <div style={{ marginTop: '20px', textAlign: 'center', color: '#39ff14', fontSize: '14px', letterSpacing: '2px', fontWeight: 'bold', textShadow: '0 0 10px #39ff14' }}>
                            TARGET LOCKED: {selectedTarget.name.toUpperCase()}
                        </div>
                    ) : (
                        <div style={{ marginTop: '20px', textAlign: 'center', color: '#888', fontSize: '12px', letterSpacing: '1px' }}>
                            Select a destination to set guidance vector.
                        </div>
                    )}
                </div>
            </div>
        </Html>
    );
}
