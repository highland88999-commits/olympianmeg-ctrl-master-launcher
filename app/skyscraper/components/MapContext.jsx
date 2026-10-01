'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

const MapContext = createContext();

export const MapProvider = ({ children }) => {
    const [scannedObjects, setScannedObjects] = useState({});
    const [selectedTarget, setSelectedTarget] = useState(null);

    const registerPlot = useCallback((obj) => {
        setScannedObjects((prev) => ({ ...prev, [obj.id]: obj }));
    }, []);

    const unregisterPlot = useCallback((id) => {
        setScannedObjects((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    return (
        <MapContext.Provider value={{ 
            mapObjects: Object.values(scannedObjects), 
            registerPlot, 
            unregisterPlot,
            selectedTarget,
            setSelectedTarget
        }}>
            {children}
        </MapContext.Provider>
    );
};

export const useMapObjects = () => useContext(MapContext);
