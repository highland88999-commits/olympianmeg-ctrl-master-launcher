'use client';
import { useState, useEffect, useRef } from 'react';

const portalData = [
    { name: "Inventory Manifest", action: "BACKPACK", type: "gold", icon: "🎒" },
    { name: "Tactical Map", action: "MAP", type: "silver", icon: "🗺️" },
    { name: "System Settings", action: "SETTINGS", type: "gold", icon: "⚙️" },
    { name: "Comms Relay", url: "https://communications-array-iota.vercel.app", type: "silver", icon: "📡" },
    { name: "Dominion Auction", url: "https://dominion-auction-house.vercel.app", type: "gold", icon: "⚖️" },
    { name: "World Forge", url: "https://world-engine-2-0.vercel.app", type: "silver", icon: "⚒️" },
    { name: "Telemetry Network", url: "https://multiverse-tracker-api.vercel.app/", type: "gold", icon: "📊" },
    { name: "Artemis AI", url: "https://architect-artemis-merlin-ambros-projects.vercel.app", type: "silver", icon: "🧠" },
    { name: "Aquarium", url: "https://georgia-aquarium.vercel.app", type: "gold", icon: "🦈" },
    { name: "About Us", url: "https://meet-the-gods.vercel.app", type: "silver", icon: "🏛️" }
];

export default function RadialMenu({ openPortalOverlay, openBackpack, toggleMap, openSettings }) {
    const [isClient, setIsClient] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [pos, setPos] = useState({ x: 20, y: 500 });
    const [ringRotation, setRingRotation] = useState(0); 
    
    const panelDrag = useRef({ isDragging: false, startX: 0, startY: 0, panelX: 0, panelY: 0, hasMoved: false });
    const ringDrag = useRef({ isDragging: false, startAngle: 0, hasMoved: false });

    // 🚀 RADIUS SCALING: Larger menu for 10 buttons
    const discRadius = 160; 

    // Tucks into the bottom-left corner on load
    useEffect(() => {
        setPos({ x: 20, y: window.innerHeight - 110 });
        setIsClient(true);
    }, []);

    const onPanelPointerDown = (e) => {
        panelDrag.current = {
            isDragging: true, hasMoved: false,
            startX: e.clientX, startY: e.clientY,
            panelX: pos.x, panelY: pos.y
        };
        e.target.setPointerCapture(e.pointerId);
    };

    const onPanelPointerMove = (e) => {
        const d = panelDrag.current;
        if (!d.isDragging) return;
        
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.hasMoved = true;

        let newX = d.panelX + dx;
        let newY = d.panelY + dy;
        newX = Math.max(0, Math.min(window.innerWidth - 90, newX));
        newY = Math.max(0, Math.min(window.innerHeight - 90, newY));

        setPos({ x: newX, y: newY });
    };

    const onPanelPointerUp = (e) => {
        const d = panelDrag.current;
        if (d.isDragging) {
            d.isDragging = false;
            e.target.releasePointerCapture(e.pointerId);
            
            // 🚀 SMART AUTO-CENTERING PHYSICS
            if (!d.hasMoved) {
                const willOpen = !isOpen;
                setIsOpen(willOpen);
                
                if (willOpen) {
                    // Glide away from edges so the circle doesn't clip off-screen
                    let safeX = Math.max(pos.x, discRadius + 20);
                    safeX = Math.min(safeX, window.innerWidth - discRadius - 20);
                    
                    let safeY = Math.max(pos.y, discRadius + 20);
                    safeY = Math.min(safeY, window.innerHeight - discRadius - 20);
                    
                    setPos({ x: safeX, y: safeY });
                } else {
                    // Glide back to the corner pocket when closed
                    setPos({ x: 20, y: window.innerHeight - 110 });
                }
            } 
        }
    };

    const onRingPointerDown = (e) => {
        if (!isOpen) return;
        const cx = pos.x + 45; // Adjusted for 90px width
        const cy = pos.y + 45;
        ringDrag.current = {
            isDragging: true, hasMoved: false,
            startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) - ringRotation
        };
        e.target.setPointerCapture(e.pointerId);
    };

    const onRingPointerMove = (e) => {
        const d = ringDrag.current;
        if (!d.isDragging) return;
        d.hasMoved = true;
        const cx = pos.x + 45; 
        const cy = pos.y + 45;
        const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
        setRingRotation(currentAngle - d.startAngle);
    };

    const onRingPointerUp = (e) => {
        if (ringDrag.current.isDragging) {
            ringDrag.current.isDragging = false;
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    // 🚀 UNIVERSAL ROUTING SYSTEM
    const handlePortalClick = (item) => {
        if (ringDrag.current.hasMoved) return; 
        
        setIsOpen(false);
        setPos({ x: 20, y: window.innerHeight - 110 }); // Return to corner

        if (item.action === "BACKPACK") openBackpack(true);
        else if (item.action === "MAP") toggleMap();
        else if (item.action === "SETTINGS") openSettings(true);
        else if (item.url) openPortalOverlay(item.url);
    };

    if (!isClient) return null;

    return (
        <>
            <style>{`
                @keyframes swarmSpin { 100% { transform: translate(-50%, -50%) rotate(360deg); } }
                @keyframes swarmSpinReverse { 100% { transform: translate(-50%, -50%) rotate(-360deg); } }
                
                .particle-base {
                    position: absolute; top: 50%; left: 50%; width: 2px; height: 2px;
                    border-radius: 50%; transform: translate(-50%, -50%);
                }
                
                .gold-swarm {
                    animation: swarmSpin 6s linear infinite;
                    box-shadow: 
                        15px -20px 3px #FFD700, -25px 15px 4px #FFA500, 10px 30px 2px #FFF8DC, 
                        -15px -25px 3px #FFD700, 30px 5px 4px #FFA500, -5px 35px 2px #FFF8DC,
                        25px 20px 3px #FFD700, -30px -10px 4px #FFA500, 0px -35px 2px #FFF8DC;
                }
                .gold-swarm::after {
                    content: ''; position: absolute; top: 50%; left: 50%; width: 3px; height: 3px; border-radius: 50%;
                    animation: swarmSpinReverse 4s linear infinite;
                    box-shadow: 
                        -20px 15px 4px #FFA500, 25px -15px 2px #FFD700, -10px -30px 3px #FFF8DC,
                        15px 25px 4px #FFA500, -30px -5px 2px #FFD700, 5px -35px 3px #FFF8DC;
                }

                .silver-swarm {
                    animation: swarmSpin 6s linear infinite;
                    box-shadow: 
                        15px -20px 3px #E0E0E0, -25px 15px 4px #C0C0C0, 10px 30px 2px #FFFFFF, 
                        -15px -25px 3px #E0E0E0, 30px 5px 4px #C0C0C0, -5px 35px 2px #FFFFFF,
                        25px 20px 3px #E0E0E0, -30px -10px 4px #C0C0C0, 0px -35px 2px #FFFFFF;
                }
                .silver-swarm::after {
                    content: ''; position: absolute; top: 50%; left: 50%; width: 3px; height: 3px; border-radius: 50%;
                    animation: swarmSpinReverse 4s linear infinite;
                    box-shadow: 
                        -20px 15px 4px #C0C0C0, 25px -15px 2px #E0E0E0, -10px -30px 3px #FFFFFF,
                        15px 25px 4px #C0C0C0, -30px -5px 2px #E0E0E0, 5px -35px 3px #FFFFFF;
                }
            `}</style>

            <div style={{ 
                position: 'fixed', left: pos.x, top: pos.y, width: '90px', height: '90px', zIndex: 3000, touchAction: 'none',
                transition: panelDrag.current.isDragging ? 'none' : 'left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)'
            }}>
                {isOpen && (
                    <div 
                        onPointerDown={onRingPointerDown} onPointerMove={onRingPointerMove} onPointerUp={onRingPointerUp} onPointerCancel={onRingPointerUp}
                        style={{ position: 'absolute', top: '-150px', left: '-150px', width: '390px', height: '390px', borderRadius: '50%', cursor: 'grab', zIndex: 3000 }}
                    />
                )}

                <div style={{ position: 'absolute', top: '50%', left: '50%', zIndex: 3001, pointerEvents: 'none', transform: `rotate(${ringRotation}rad)` }}>
                    {portalData.map((item, i) => {
                        const angle = (i / portalData.length) * (Math.PI * 2) - (Math.PI / 2);
                        const tx = isOpen ? Math.cos(angle) * discRadius : 0;
                        const ty = isOpen ? Math.sin(angle) * discRadius : 0;
                        const scale = isOpen ? 1 : 0;
                        const ringColor = item.type === 'gold' ? '#FFD700' : '#E0E0E0';

                        return (
                            <div 
                                key={i}
                                onPointerDown={(e) => e.stopPropagation()} 
                                onClick={() => handlePortalClick(item)}
                                style={{
                                    position: 'absolute', top: '-40px', left: '-40px', width: '80px', height: '80px',
                                    borderRadius: '50%', overflow: 'hidden', border: `1px solid ${ringColor}44`, background: '#050505', cursor: 'pointer',
                                    transform: `translate(${tx}px, ${ty}px) scale(${scale})`, color: ringColor,
                                    boxShadow: `inset 0 0 20px ${ringColor}22`,
                                    transition: isOpen ? `transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) ${i * 30}ms, opacity 0.5s` : 'all 0.3s',
                                    pointerEvents: isOpen ? 'auto' : 'none', opacity: isOpen ? 1 : 0
                                }}
                            >
                                <div className={`particle-base ${item.type}-swarm`} />
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%, -50%) rotate(${-ringRotation}rad)`, fontSize: '28px', zIndex: 10 }}>
                                    {item.icon}
                                </div>

                                {isOpen && (
                                    <div style={{ position: 'absolute', bottom: '-22px', left: '50%', transform: `translateX(-50%) rotate(${-ringRotation}rad)`, background: 'rgba(0,10,20,0.95)', color: ringColor, fontSize: '11px', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${ringColor}88`, whiteSpace: 'nowrap', fontWeight: 'bold' }}>
                                        {item.name}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* 🚀 THE BIGGER NEXUS BUTTON */}
                <div 
                    onPointerDown={onPanelPointerDown} onPointerMove={onPanelPointerMove} onPointerUp={onPanelPointerUp} onPointerCancel={onPanelPointerUp}
                    style={{ 
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                        width: '90px', height: '90px', borderRadius: '50%', background: '#000', border: '3px solid #d4af37',
                        boxShadow: '0 0 35px rgba(212, 175, 55, 0.6), inset 0 0 20px rgba(106, 13, 173, 0.9)',
                        color: '#d4af37', fontSize: '14px', fontWeight: 'bold', textAlign: 'center', lineHeight: '84px',
                        cursor: 'grab', userSelect: 'none', zIndex: 3002, letterSpacing: '2px'
                    }}
                >
                    NEXUS
                </div>
            </div>
        </>
    );
}
