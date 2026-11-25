// components/mars2/BuildPanel.jsx
// MARS 2 — BUILD MODE panel (Merlin, Nov 17, 2026).
//
// The DOM side of build mode: what the user taps after tapping a
// plot. Shows the shared materials wallet (the same backpack
// materials the rest of the ecosystem collects), the selected
// plot and what can go on it, every building with its tier,
// accrued output and crew, and the recruit control. All actions
// arrive as callbacks from the page — this panel decides nothing,
// it only shows. Circle orbs for actions (orb law); the panel
// itself is a sheet, not a button.

'use client';
import { MINE_CAPACITY, MINE_CREW_SLOTS, BARRACKS_CREW_CAPACITY, buildCost, upgradeCost, CREW_RECRUIT_COST, EXTRA_MINE_COST, barracksCapacity, crewIdle, mineOutputPerMin } from '@/lib/mars2/build-mode';
import { materialById } from '@/lib/economy/materials';
import OrbButton, { OrbLabel } from '@/components/world/OrbButton';

const ACCENT = '#e07840';

function costText(costs) {
  if (!costs || costs.length === 0) return 'FREE — stake a claim';
  return costs.map((c) => {
    const m = materialById(c.id);
    return `${c.qty} ${m ? m.name : c.id}`;
  }).join(' + ');
}

function walletText(wallet, id) {
  const m = materialById(id);
  return `${m ? m.icon : ''} ${m ? m.name : id}: ${wallet[id] || 0}`;
}

export default function BuildPanel({
  plots, areas, state, wallet, selectedPlotId,
  onSelectPlot, onBuildMine, onBuildBarracks, onUpgrade, onCollect,
  onRecruit, onAssignCrew, onClose, onCollapse, notice, collapsed, onExpand,
}) {
  const selectedPlot = (plots || []).find((p) => p.id === selectedPlotId) || null;
  const selectedBuilding = selectedPlot
    ? (state.buildings || []).find((b) => b.plotId === selectedPlot.id) || null
    : null;
  const selectedArea = selectedPlot && selectedPlot.areaId
    ? (areas || []).find((a) => a.id === selectedPlot.areaId) || null
    : null;
  const selectedMaterial = selectedArea ? materialById(selectedArea.materialId) : null;
  // Whether this mining area already holds a mine: the first claim
  // in an area is free, every further mine costs 20 iron ore — and
  // the MINE button must price the real cost, not always FREE.
  const areaHasMine = selectedPlot && selectedPlot.kind === 'mine' && (state.buildings || []).some((b) => {
    const p = (plots || []).find((pp) => pp.id === b.plotId);
    return b.kind === 'mine' && p && p.areaId === selectedPlot.areaId;
  });

  // Collapsed: a small chip in the same corner — build mode stays
  // on and the plots stay visible, so the user can see the land
  // they are building on. Tapping a plot reopens the full panel.
  if (collapsed) {
    return (
      <div
        role="group"
        aria-label="Mars 2 build mode collapsed"
        style={{
          position: 'absolute', top: 140, right: 10, zIndex: 6,
          background: 'linear-gradient(rgba(16,7,3,0.96), rgba(16,7,3,0.96))',
          border: `1px solid ${ACCENT}`, borderRadius: 999, padding: '4px 6px',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <OrbButton accent={ACCENT} size={44} onClick={onExpand} ariaLabel="Open build panel">
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⬢</span>
          <OrbLabel>BUILD</OrbLabel>
        </OrbButton>
        <OrbButton accent={ACCENT} size={44} onClick={onClose} ariaLabel="Exit build mode">
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
        </OrbButton>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Mars 2 build mode"
      style={{
        position: 'absolute', top: 140, right: 10, zIndex: 6, width: 264,
        maxHeight: 'calc(100% - 300px)', overflowY: 'auto',
        background: 'linear-gradient(rgba(16,7,3,0.96), rgba(16,7,3,0.96))',
        border: `1px solid ${ACCENT}`, borderRadius: 14, padding: '12px 14px',
        color: '#f0dcc8', fontSize: 12, letterSpacing: 0.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ color: ACCENT, letterSpacing: 3, fontSize: 13 }}>⬢ BUILD MODE</b>
        <OrbButton accent={ACCENT} size={44} onClick={onCollapse || onClose} ariaLabel="Collapse build panel">
          <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>✕</span>
        </OrbButton>
      </div>
      <div style={{ color: '#c99a78', marginTop: 4, lineHeight: 1.5 }}>
        Tap a glowing plot to build. Mines go only in the tinted mining areas.
      </div>

      {/* The shared materials wallet — the same backpack materials
          the rest of the ecosystem collects. */}
      <div style={{ marginTop: 10, lineHeight: 1.8, borderTop: '1px solid #5a3220', paddingTop: 8 }}>
        <div style={{ color: ACCENT, letterSpacing: 2, fontSize: 11 }}>MATERIALS</div>
        {['iron-ore', 'silicon', 'titanium-ore', 'water-ice'].map((id) => (
          <div key={id}>{walletText(wallet, id)}</div>
        ))}
        <div style={{ color: '#c99a78' }}>
          Crew {state.crewTotal || 0} · housed {barracksCapacity(state)} · idle {crewIdle(state)}
        </div>
      </div>

      {/* Selected plot */}
      {selectedPlot && (
        <div style={{ marginTop: 10, borderTop: '1px solid #5a3220', paddingTop: 8 }}>
          <div style={{ color: ACCENT, letterSpacing: 2, fontSize: 11 }}>
            {selectedPlot.kind === 'mine' ? `⛏ ${selectedArea ? selectedArea.name : 'MINING PLOT'}` : '▣ BARRACKS PLOT'}
          </div>
          {selectedMaterial && (
            <div style={{ marginTop: 2 }}>Yields {selectedMaterial.icon} {selectedMaterial.name}</div>
          )}
          {!selectedBuilding && selectedPlot.kind === 'mine' && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <OrbButton accent={ACCENT} size={56} onClick={() => onBuildMine(selectedPlot.id)} ariaLabel="Build a mine here">
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>⛏</span>
                <OrbLabel>MINE</OrbLabel>
              </OrbButton>
              <span style={{ color: '#c99a78' }}>{costText(areaHasMine ? [...EXTRA_MINE_COST] : [])}</span>
            </div>
          )}
          {areaHasMine && !selectedBuilding && selectedPlot.kind === 'mine' && (
            <div style={{ color: '#c99a78', marginTop: 4 }}>
              This area already has a mine — another costs 20 iron ore.
            </div>
          )}
          {!selectedBuilding && selectedPlot.kind === 'barracks' && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <OrbButton accent={ACCENT} size={56} onClick={() => onBuildBarracks(selectedPlot.id)} ariaLabel="Build barracks here">
                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>▣</span>
                <OrbLabel>BARRACKS</OrbLabel>
              </OrbButton>
              <span style={{ color: '#c99a78' }}>{costText(buildCost('barracks', 1))}</span>
            </div>
          )}
          {selectedBuilding && (
            <BuildingRow
              building={selectedBuilding} plots={plots} areas={areas}
              onUpgrade={onUpgrade} onCollect={onCollect} onAssignCrew={onAssignCrew}
              compact={false}
            />
          )}
        </div>
      )}

      {/* All buildings */}
      {(state.buildings || []).length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #5a3220', paddingTop: 8 }}>
          <div style={{ color: ACCENT, letterSpacing: 2, fontSize: 11 }}>YOUR BUILDINGS</div>
          {(state.buildings || []).map((b) => (
            <BuildingRow
              key={b.id} building={b} plots={plots} areas={areas}
              onUpgrade={onUpgrade} onCollect={onCollect} onAssignCrew={onAssignCrew}
              onSelectPlot={onSelectPlot} selected={selectedPlotId === b.plotId}
            />
          ))}
        </div>
      )}

      {/* Recruit crew */}
      <div style={{ marginTop: 10, borderTop: '1px solid #5a3220', paddingTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <OrbButton accent={ACCENT} size={56} onClick={onRecruit} ariaLabel="Recruit one crew member">
          <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>👷</span>
          <OrbLabel>RECRUIT</OrbLabel>
        </OrbButton>
        <span style={{ color: '#c99a78' }}>1 crew · {costText([...CREW_RECRUIT_COST])}</span>
      </div>

      {notice && (
        <div style={{ marginTop: 10, color: '#ffd9a0', lineHeight: 1.5 }} role="status">{notice}</div>
      )}
    </div>
  );
}

function BuildingRow({ building, plots, areas, onUpgrade, onCollect, onAssignCrew, onSelectPlot, selected, compact = true }) {
  const plot = (plots || []).find((p) => p.id === building.plotId);
  const area = plot && plot.areaId ? (areas || []).find((a) => a.id === plot.areaId) : null;
  const mat = area ? materialById(area.materialId) : null;
  const cost = upgradeCost(building);
  const accrued = Math.floor(building.accrued || 0);
  return (
    <div
      style={{
        marginTop: 8, padding: 8, borderRadius: 10,
        border: selected ? `1px solid ${ACCENT}` : '1px solid #5a3220',
        background: selected ? 'rgba(224,120,64,0.12)' : 'rgba(0,0,0,0.25)',
        cursor: onSelectPlot ? 'pointer' : 'default',
      }}
      onClick={onSelectPlot ? () => onSelectPlot(building.plotId) : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>{building.kind === 'mine' ? `⛏ Mine — ${area ? area.name : ''}` : '▣ Barracks'}</b>
        <span style={{ color: ACCENT }}>TIER {building.tier}</span>
      </div>
      {building.kind === 'mine' && (
        <div style={{ marginTop: 4, lineHeight: 1.6 }}>
          <div>{mat ? `${mat.icon} ${mat.name}` : ''} · {mineOutputPerMin(building)}/min · holds {accrued}/{MINE_CAPACITY[building.tier - 1]}</div>
          <div>Crew {building.crew || 0}/{MINE_CREW_SLOTS[building.tier - 1]}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <OrbButton accent={ACCENT} size={52} onClick={(e) => { e.stopPropagation(); onCollect(building.id); }} ariaLabel="Collect mined materials">
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⬇</span>
              <OrbLabel>COLLECT</OrbLabel>
            </OrbButton>
            <OrbButton accent={ACCENT} size={52} onClick={(e) => { e.stopPropagation(); onAssignCrew(building.id, 1); }} ariaLabel="Assign one crew to this mine">
              <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>＋</span>
              <OrbLabel>CREW +</OrbLabel>
            </OrbButton>
            {(building.crew || 0) > 0 && (
              <OrbButton accent={ACCENT} size={52} onClick={(e) => { e.stopPropagation(); onAssignCrew(building.id, -1); }} ariaLabel="Pull one crew off this mine">
                <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>－</span>
                <OrbLabel>CREW −</OrbLabel>
              </OrbButton>
            )}
          </div>
        </div>
      )}
      {building.kind === 'barracks' && (
        <div style={{ marginTop: 4, color: '#c99a78' }}>
          Houses {BARRACKS_CREW_CAPACITY[building.tier - 1]} crew
        </div>
      )}
      {cost && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <OrbButton accent={ACCENT} size={52} onClick={(e) => { e.stopPropagation(); onUpgrade(building.id); }} ariaLabel={`Upgrade to tier ${building.tier + 1}`}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⬆</span>
            <OrbLabel>UPGRADE</OrbLabel>
          </OrbButton>
          <span style={{ color: '#c99a78' }}>Tier {building.tier + 1} · {costText(cost)}</span>
        </div>
      )}
      {!cost && (
        <div style={{ marginTop: 4, color: '#9dffb0' }}>Top tier — biggest output.</div>
      )}
    </div>
  );
}
