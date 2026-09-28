// Aetheris business-plan content, adapted from the source repositories.
// Vendor contact emails were intentionally dropped.

export const PLAN_SECTIONS = [
  {
    id: 'vision',
    title: 'Vision',
    tagline: 'Air is life, and cities are suffocating.',
    blocks: [
      'Aetheris Units are towering outdoor purifiers that inhale smog, fine particles, VOCs and dust, and exhale purified air — creating breathable sanctuaries in urban choke zones. Based on proven outdoor-purifier technology (examples below) — the ET-GAP-700 is a design, not a deployed product.',
      'The idea started from a simple image: a phone lock screen showing a sleek cylindrical tower, quietly reminding us that clean air is the battery we are all running out of.',
    ],
    facts: [
      { label: 'Smog Free Tower (Daan Roosegaarde)', value: '7m tall, the world\u2019s first outdoor air purifier. Ozone-free positive ionization. Cleans 30,000 m\u00b3/hour — enough for a park. Installed in Rotterdam, Beijing, Krak\u00f3w, Abu Dhabi.' },
      { label: 'Xi\u2019an Smog Tower (China)', value: 'Over 100m tall — the largest ever built. Solar chimney effect creates a natural updraft. Multi-layer filters reduce PM2.5 across square kilometers.' },
      { label: 'Global examples', value: '30m+ towers in Delhi parks. Tree-like HyperFilter concepts in Russia. Bio-moss integrations emerging. Hyper-local clean-air bubbles are real and scaling.' },
    ],
  },
  {
    id: 'specs',
    title: 'Specs — Model ET-GAP-700',
    tagline: '7-meter breathing towers. Modular, solar-compatible design.',
    blocks: [
      'The ET-GAP-700 is designed to reclaim clean air in cities at scale: parks, plazas, traffic choke points and industrial edges. Five to ten units per km\u00b2 for saturation.',
    ],
    facts: [
      { label: 'Dimensions', value: '7m tall (5m filter column + 2m base), scalable to 10m. 2.5m base tapering to 2m. ~1,200 kg loaded. Aluminum 6061-T6 frame, perforated 304 stainless panels.' },
      { label: 'Filtration', value: 'Hybrid 4-stage: washable pre-filter (10–20\u03bcm) \u2192 5–10kV ionizer (no ozone) \u2192 HEPA H14 (99.97% @ 0.3\u03bcm) + activated carbon for VOCs \u2192 optional UV-C pathogen kill.' },
      { label: 'Airflow', value: '360\u00b0 base intake, upward flow, diffused top exhaust. 30,000 m\u00b3/h nominal, scalable to 100k. 1–3 km\u00b2 coverage bubble, 15–20% PM2.5 drop.' },
      { label: 'Power', value: '1,170W nominal / 1,500W peak. Grid 110–240V + optional 5kW solar + 10kWh Li-ion backup (4–6h runtime).' },
      { label: 'Durability', value: 'IP65, \u221220\u00b0C to 50\u00b0C, UV-resistant coat. 10–15 year life, >80% recyclable.' },
      { label: 'Maintenance', value: 'Filter sets every 6–12 months (~$500–$1k/set). Pre-filter wash and ionizer wipe monthly. Annual service ~$2k.' },
      { label: 'Economics', value: 'Unit cost $150k–$250k (volume target $100k). Operating $10k–$30k/year running 24/7. ROI via carbon credits, sponsorships and health savings.' },
    ],
  },
  {
    id: 'forge',
    title: 'Forge — The Facility',
    tagline: 'Build the factory, don\u2019t buy it.',
    blocks: [
      'Buying farmland outside Redwater, Alberta (Sturgeon County) and building a purpose-built manufacturing facility is smarter long-term than buying an existing one: custom layout, room to expand, lower cost, and potential agricultural/green incentives.',
      'Target: 50–100 acres. Roughly 80 acres at ~$3,500/acre puts land at $250,000–$500,000 all-in with survey, legal, clearing and roads.',
      'Rezoning from agricultural to industrial rural runs 6–18 months through Sturgeon County planning, costing roughly $30,000–$80,000 in fees and consultant reports.',
    ],
    facts: [
      { label: 'Building', value: '20,000 sq ft rectangular steel prefab (100 ft \u00d7 200 ft, 20–25 ft eave, clear-span). Winter-tough, expandable. 5–10 acres developed, 70+ acres buffer.' },
      { label: 'Construction', value: '$160–$300 CAD per sq ft all-in: foundation & site work, steel structure, interior fit-out, utilities, permits and contingency.' },
      { label: 'Layout', value: 'Manufacturing/assembly bay ~60% (high bays, CNC/welding zones), material storage, offices, loading with ~50 parking spots + truck bays.' },
    ],
  },
  {
    id: 'plans',
    title: 'Plans — Site Blueprint',
    tagline: 'Conceptual blueprints for the 20,000 sq ft production facility.',
    blocks: [
      'Overall site plan: building positioned for highway access with gravel driveway, parking and loading, septic, well, stormwater swales and ponds, and large farmland buffers. Setbacks ~30–50m, tree lines preserved, solar tie-in space reserved.',
      'Building floor plan: clear-span layout with the manufacturing and assembly bay taking about 60% — high bays with CNC and welding zones — plus material storage, finishing, offices and staff areas.',
    ],
    facts: [
      { label: 'Site', value: '80-acre layout. Gravel driveway, ~50 parking spots + truck bays, septic + well, stormwater swales/ponds, farmland buffers.' },
      { label: 'Building', value: '100 ft \u00d7 200 ft clear-span steel prefab, 20–25 ft eave height, expandable end walls.' },
      { label: 'Zoning path', value: 'Agricultural \u2192 Industrial Rural (M1/M2). 6–18 months, faster near the Industrial Heartland.' },
    ],
  },
  {
    id: 'tools',
    title: 'Tools — Machinery',
    tagline: 'Core machinery for 50–100 units/year capacity.',
    blocks: [
      'Estimated costs in CAD at 2025–2026 pricing, subject to quotes. Covers CNC & fabrication, welding & assembly, and filter production tooling.',
    ],
    facts: [
      { label: 'CNC & fabrication', value: '5-axis CNC mill ($250k–$400k), CNC lathe ($150k–$250k), 6kW fiber laser cutter ($200k–$350k), plasma cutter ($30k–$60k).' },
      { label: 'Welding & assembly', value: 'TIG welders \u00d74 ($15k–$25k each), 6-axis robotic welding arm ($120k–$200k), 2-ton jib cranes & hoists \u00d76.' },
      { label: 'Filter line', value: 'Panel pleating and framing jigs, media cutting tables, sealant dispensing, test rig for EN 1822 efficiency checks.' },
    ],
  },
  {
    id: 'supply',
    title: 'Supply Chain',
    tagline: 'What goes into a tower — and who makes it.',
    blocks: [
      'Key material categories and the kinds of suppliers needed for production. Specific vendor contact details were removed from this console — reach out with a project brief through normal procurement channels.',
    ],
    facts: [
      { label: 'Filtration media', value: 'HEPA/electrostatic media, ionizer components, activated carbon — industrial filtration manufacturers.' },
      { label: 'Steel & aluminum', value: 'Perforated stainless sheet, aluminum 6061 extrusions — regional metals distributors (Alberta).' },
      { label: 'Electronics', value: 'UL-listed EC fans (3\u00d7500W), PM2.5/CO2/VOC sensors, IoT telemetry modules, motor controllers.' },
      { label: 'Power', value: 'Solar arrays (5kW per unit option), Li-ion battery packs (10kWh), charge controllers.' },
    ],
  },
];
