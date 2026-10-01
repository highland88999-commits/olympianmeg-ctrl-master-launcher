'use client';
import React, { useMemo } from 'react';

export default function FloorMenu({ animState, setAnimState, currentFloor, setCurrentFloor }) {
    
    // 🚀 THE FIX: Hooks MUST be declared at the absolute top, before any early returns!
    const floors = useMemo(() => {
        return Array.from({ length: 200 }, (_, i) => i + 1);
    }, []); 

    // Now we can safely hide the UI if the animation state isn't active
    if (animState !== 'UI_ACTIVE') return null;

    const selectFloor = (floorNum) => {
        if (floorNum === currentFloor) return; 
        
        // 1. Instantly swap the pocket universe in the background
        setCurrentFloor(floorNum);
        
        // 2. Trigger the "Warp" sequence
        setAnimState('ELEVATOR_MOVING');
    };

    return (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(340px, 85vw)', height: 'min(520px, 70vh)', border: '2px solid #00ffff', boxShadow: '0 0 25px rgba(0, 255, 255, 0.6), inset 0 0 15px rgba(0, 255, 255, 0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', background: 'rgba(0, 15, 30, 0.85)', backdropFilter: 'blur(6px)', zIndex: 6000, pointerEvents: 'auto', overflow: 'hidden' }}>
            
            <video autoPlay loop muted playsInline style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -1, opacity: 0.65 }}>
                <source src="/media/skyscraper/h1smyy.mov" type="video/mp4" />
            </video>
            
            <h2 style={{ textAlign: 'center', color: '#00ffff', margin: '18px 0 10px 0', fontSize: '22px', letterSpacing: '3px', textShadow: '0 0 10px #00ffff', zIndex: 1 }}>
                SELECT DESTINATION
            </h2>
            
            <ul style={{ flexGrow: 1, overflowY: 'auto', margin: '10px 12px 15px 12px', padding: 0, listStyle: 'none', borderTop: '1px solid rgba(0, 255, 255, 0.4)', borderBottom: '1px solid rgba(0, 255, 255, 0.4)', zIndex: 1, transform: 'translateZ(0)' }}>
                {floors.map(floor => (
                    <li 
                        key={floor} 
                        onClick={() => selectFloor(floor)} 
                        style={{ padding: '14px', textAlign: 'center', color: '#fff', fontSize: '18px', cursor: 'pointer', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(0, 0, 0, 0.4)', transition: 'all 0.2s' }} 
                        onMouseOver={(e) => { e.target.style.background = '#00ffff'; e.target.style.color = '#000'; e.target.style.fontWeight = 'bold'; e.target.style.boxShadow = '0 0 12px #00ffff'; }} 
                        onMouseOut={(e) => { e.target.style.background = 'rgba(0, 0, 0, 0.4)'; e.target.style.color = '#fff'; e.target.style.fontWeight = 'normal'; e.target.style.boxShadow = 'none'; }}
                    >
                        FLOOR {floor}
                    </li>
                ))}
            </ul>
        </div>
    );
}
