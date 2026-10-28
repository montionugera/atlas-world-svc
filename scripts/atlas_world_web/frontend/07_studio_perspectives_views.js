function renderWhcBigPictureSvg(whc, continents) {
  return renderDedicatedWorldAtlas();
}


function getStudioRaceBinding(districtOrTownId) {
  const whc = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.worldHistoryAndConcept) || {};
  const races = (whc.race_taxonomy && whc.race_taxonomy.playable_and_mob_races) || [];
  return races.find(r => r.district_id === districtOrTownId || r.home_town_id === districtOrTownId || r.ancestral_expedition_citadel_id === districtOrTownId) || null;
}

function getStudioConvergenceHub(districtOrTownId) {
  const whc = (DATA && DATA.studioPerspectives && DATA.studioPerspectives.worldHistoryAndConcept) || {};
  const conv = (whc.shared_world_systems && whc.shared_world_systems.cross_race_convergence_hubs) || {};
  const hubs = conv.hubs || [];
  return hubs.find(h => h.district_id === districtOrTownId || h.town_node_id === districtOrTownId) || null;
}

function renderContinentBigPictureSvg(continents, districts, activeContinent) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const allNodes = sp.nodes || [];
  const childDistricts = getSortedContinentDistricts(districts, activeContinent.id);
  const isC01 = activeContinent.id.includes('continent-01');
  const isC02 = activeContinent.id.includes('continent-02');

  // 12 Contiguous District Territory Positions across the 1040x500 Continent Map
  // D01 (index 0) is placed centrally at the Starter Basin heart so roads radiate cleanly!
  const regionCenters = [
    { x: 205, y: 365, poly: '65,295 325,295 335,445 75,450' },
    { x: 455, y: 372, poly: '325,295 575,295 585,450 335,445' },
    { x: 705, y: 372, poly: '575,295 815,300 825,450 585,450' },
    { x: 905, y: 365, poly: '815,300 985,295 985,450 825,450' },
    { x: 195, y: 222, poly: '70,155 315,155 325,295 65,295' },
    { x: 445, y: 222, poly: '315,155 575,155 575,295 325,295' },
    { x: 695, y: 225, poly: '575,155 815,160 815,300 575,295' },
    { x: 905, y: 225, poly: '815,160 985,160 985,295 815,300' },
    { x: 225, y: 92,  poly: '85,35 365,35 315,155 70,155' },
    { x: 495, y: 90,  poly: '365,35 635,35 575,155 315,155' },
    { x: 745, y: 92,  poly: '635,35 865,40 815,160 575,155' },
    { x: 925, y: 95,  poly: '865,40 985,45 985,160 815,160' }
  ];

  // Arterial Continent Highway Network connecting the District Territories (D01 -> D02 -> D03...)
  const roadPairs = [
    [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [3, 7],
    [4, 5], [5, 6], [6, 7], [4, 8], [5, 9], [6, 10], [7, 11],
    [8, 9], [9, 10], [10, 11]
  ];

  const selectedDist = childDistricts.find(d => d.id === STUDIO_SELECTED_DISTRICT_ID) || childDistricts[0] || {};
  const selectedDistIdx = Math.max(0, childDistricts.findIndex(d => d.id === selectedDist.id));
  const selectedDistCode = `D${String(selectedDistIdx + 1).padStart(2, '0')}`;
  const selectedDistNodes = allNodes.filter(n => n.parent_district_id === selectedDist.id);

  const defaultPoi = {
    title: `${selectedDistCode} · ${selectedDist.name || activeContinent.name}`,
    category: `Selected District in ${activeContinent.name} · Lv. ${(selectedDist.level_range || [1, 15]).join('–')}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `${(selectedDist.status || 'canon').toUpperCase()} · ${selectedDistNodes.length} Child Maps Inside This District`,
    summary: selectedDist.core_rationale || activeContinent.core_rationale || '',
    address: `Territory ${selectedDistCode} (${selectedDist.name}) · ${activeContinent.name}`,
    coordinates: `Contains: 🏰 ${selectedDistNodes.filter(n => n.node_type === 'town').length} Town · ⚔️ ${selectedDistNodes.filter(n => n.node_type === 'hunting_area').length} Hunting · 🕳️ ${selectedDistNodes.filter(n => n.node_type === 'dungeon').length} Catacomb`,
    scaleSpecs: (selectedDist.quality_checklist && selectedDist.quality_checklist.character_scale_consistency && selectedDist.quality_checklist.character_scale_consistency.evidence) || '12.5m roads · 4.4m walkways · 0.58m counters',
    drillPerspective: 'district',
    drillOpts: { continentId: activeContinent.id, districtId: selectedDist.id, inspectId: selectedDist.id },
    drillLabel: `Zoom into ${selectedDistCode} ${selectedDist.name} (16×)`,
    inspectId: selectedDist.id,
    connections: selectedDistNodes.map(n => ({
      label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name}`,
      badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${n.status.toUpperCase()}`
    }))
  };

  const terrainHtml = `
    <!-- Crisp Procedural Vector Relief + Authentic L2J.RU Parchment Relief Base Plate -->
    ${renderCleanVectorContinentReliefSvg(isL2)}
    ${ATLAS_RASTER_RELIEF_OVERLAY ? `<image href="${isL2 ? '/studio-maps/c3_continent_parchment_relief.png' : '/studio-maps/all_interlaced_world_grid.png'}" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.48"/>` : ''}
  `;

  // Winding Continent Highways connecting District centers
  const roadsHtml = roadPairs
    .filter(([a, b]) => a < childDistricts.length && b < childDistricts.length)
    .map(([a, b]) => {
      const pa = regionCenters[a];
      const pb = regionCenters[b];
      const isSelEdge = childDistricts[a].id === selectedDist.id || childDistricts[b].id === selectedDist.id;
      return `
        <g pointer-events="none">
          <line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#241c10" stroke-width="${isSelEdge ? 6.5 : 4.5}" stroke-linecap="round"/>
          <line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="${isSelEdge ? '#fde047' : '#cbb989'}" stroke-width="${isSelEdge ? 3.2 : 2.0}" stroke-linecap="round" ${isSelEdge ? '' : 'stroke-dasharray="8 4"'}/>
        </g>
      `;
    }).join('');

  // Render EACH District Territory Polygon + Its Internal Mini-Cluster (🏰 Gold Town, ⚔️ Red Hunting Fortress, 🕳️ Purple Catacomb)
  // Using the EXACT SAME symbol + icon + color as Step 3 District!
  const districtsHtml = childDistricts.map((d, idx) => {
    const rc = regionCenters[idx % regionCenters.length];
    const dCode = `D${String(idx + 1).padStart(2, '0')}`;
    const st = (d.status || 'canon').toLowerCase();
    const isSel = d.id === selectedDist.id;
    const lvRange = (d.level_range || [1, 15]).join('–');
    const dNodes = allNodes.filter(n => n.parent_district_id === d.id);
    const townNode = dNodes.find(n => n.node_type === 'town');
    const huntNodes = dNodes.filter(n => n.node_type === 'hunting_area');
    const dngNode = dNodes.find(n => n.node_type === 'dungeon');
    const raceBind = getStudioRaceBinding(d.id) || (townNode && getStudioRaceBinding(townNode.id));
    const isStarterRaceHome = Boolean(raceBind && raceBind.district_id === d.id);
    const convHub = getStudioConvergenceHub(d.id) || (townNode && getStudioConvergenceHub(townNode.id));
    const roleTag = convHub
      ? `🤝 LV.${(convHub.level_band || [10,20]).join("-")} ALL-RACE GUILD & PARTY HUB`
      : (isStarterRaceHome ? `${raceBind.icon || "🧬"} ${raceBind.name.split(" ")[0].toUpperCase()} HOME (Lv.1–10)` : (raceBind ? `${raceBind.icon || "🧬"} ${raceBind.name.split(" ")[0].toUpperCase()} CITADEL` : ""));

    const poiObj = {
      title: `${dCode} · ${d.name}${roleTag ? " — " + roleTag : ""}`,
      category: `${roleTag ? roleTag + " · " : ""}District Territory · Lv. ${lvRange} (${st.toUpperCase()})`,
      thumb: (townNode && townNode.terrain_tile && townNode.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `${st.toUpperCase()} · Contains: 🏰 ${townNode ? 1 : 0} Town, ⚔️ ${huntNodes.length} Hunting, 🕳️ ${dngNode ? 1 : 0} Catacomb`,
      summary: d.core_rationale || '',
      address: `District ${dCode} (${d.name}) · ${activeContinent.name}`,
      coordinates: `Same Symbols in Lv.3 District: 🏰 Gold Town · ⚔️ Red Hunting · 🕳️ Purple Catacomb`,
      scaleSpecs: (d.quality_checklist && d.quality_checklist.character_scale_consistency && d.quality_checklist.character_scale_consistency.evidence) || '12.5m roads · 4.4m walkways · 0.58m counters',
      drillPerspective: 'district',
      drillOpts: { continentId: activeContinent.id, districtId: d.id, nodeId: (townNode && townNode.id) || (dNodes[0] && dNodes[0].id) || '', inspectId: d.id },
      drillLabel: `Zoom into ${dCode} ${d.name} (16×)`,
      inspectId: d.id,
      svgX: rc.x,
      svgY: rc.y,
      connections: [
        ...(convHub ? (convHub.guilding_and_party_features || []).map(f => ({ label: `🤝 ${f}`, badge: `Lv.${(convHub.level_band || [10,20]).join("-")} HUB` })) : []),
        ...(isStarterRaceHome ? [
          { label: `${raceBind.icon || "🧬"} Race Starter: ${raceBind.name} -> Home Town: ${raceBind.home_town_name}`, badge: "Lv.1–10 START" },
          { label: `🌾 Farming Drops: ${(raceBind.farming_resources || []).join(", ")}`, badge: "CRAFTING" },
          { label: `🤝 Lv.10–20 Convergence Target: Kilnwatch Bastion (Guilding & Party Hub)`, badge: "LV.10–20 HUB" }
        ] : []),
        ...dNodes.map(n => ({
          label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name}`,
          badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${n.status.toUpperCase()}`
        }))
      ]
    };

    const polyFill = isSel
      ? 'rgba(250, 204, 21, 0.20)'
      : (st === 'mystery' ? 'rgba(168, 85, 247, 0.14)' : (st === 'draft' ? 'rgba(234, 179, 8, 0.12)' : 'rgba(24, 20, 12, 0.14)'));
    const polyStroke = isSel ? '#fde047' : (st === 'mystery' ? '#c084fc' : 'rgba(245, 158, 11, 0.55)');

    // Mini child nodes inside the District territory on the Continent map (exact same colors & icons as Step 3 District!)
    // Center = 🏰 Gold Town (#eab308), Left = ⚔️ Red Hunting (#ef4444), Right = 🕳️ Purple Catacomb (#a855f7) or 2nd Hunting
    const miniClusterSvg = st === 'mystery' ? `
      <!-- Mystery District Sigil (#e879f9) -->
      <circle cx="${rc.x}" cy="${rc.y - 4}" r="14" fill="#3b0764" stroke="#e879f9" stroke-width="2" stroke-dasharray="4 2"/>
      <text x="${rc.x}" y="${rc.y + 1}" text-anchor="middle" font-size="12">🌫️</text>
    ` : `
      <!-- Mini Internal District Road connecting Hunting <-> Town <-> Catacomb -->
      <line x1="${rc.x - 36}" y1="${rc.y + 2}" x2="${rc.x + 36}" y2="${rc.y + 2}" stroke="#1c150b" stroke-width="4"/>
      <line x1="${rc.x - 36}" y1="${rc.y + 2}" x2="${rc.x + 36}" y2="${rc.y + 2}" stroke="#d4af37" stroke-width="2"/>

      <!-- Left Mini Node: ⚔️ Hunting Ground (#ef4444 Red Fortress) -->
      <g transform="translate(${rc.x - 36}, ${rc.y + 2})">
        <circle cx="0" cy="0" r="10" fill="#991b1b" stroke="#ef4444" stroke-width="1.8"/>
        <text x="0" y="3.5" text-anchor="middle" font-size="9.5">⚔️</text>
      </g>

      <!-- Center Main Node: 🏰 Town Sanctuary (#eab308 Gold Walled Town) -->
      <g transform="translate(${rc.x}, ${rc.y - 4})">
        <circle cx="0" cy="0" r="${isSel ? 15 : 13}" fill="#854d0e" stroke="#fde047" stroke-width="${isSel ? 2.5 : 2}"/>
        <text x="0" y="4.5" text-anchor="middle" font-size="${isSel ? 13 : 11}">🏰</text>
      </g>

      <!-- Right Mini Node: 🕳️ Catacomb/Dungeon (#a855f7 Violet Obelisk) -->
      <g transform="translate(${rc.x + 36}, ${rc.y + 2})">
        <circle cx="0" cy="0" r="10" fill="#4c1d95" stroke="#c084fc" stroke-width="1.8"/>
        <text x="0" y="3.5" text-anchor="middle" font-size="9.5">${dngNode ? '🕳️' : '⚔️'}</text>
      </g>
    `;

    return `
      <g data-poi-clickable="1" style="cursor:pointer"
         onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)"
         ondblclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <polygon points="${rc.poly}" fill="${polyFill}" stroke="${polyStroke}" stroke-width="${isSel ? 3.2 : 1.6}" ${isSel ? '' : 'stroke-dasharray="7 4"'}/>

        ${convHub ? `
          <!-- Pulsing All-Race Lv.10-20 Convergence Hub Halo & Pill -->
          <circle cx="${rc.x}" cy="${rc.y - 4}" r="30" fill="rgba(234,179,8,0.18)" stroke="#fde047" stroke-width="2" stroke-dasharray="5 3"/>
          <rect x="${rc.x - 92}" y="${rc.y - 66}" width="184" height="17" rx="8" fill="#dc2626" stroke="#fde047" stroke-width="1.5"/>
          <text x="${rc.x}" y="${rc.y - 54}" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="900" font-family="monospace">
            ${escapeHtml(roleTag)}
          </text>
        ` : (roleTag ? `
          <!-- Race Home Town / Citadel Pill -->
          <rect x="${rc.x - 84}" y="${rc.y - 65}" width="168" height="16" rx="8" fill="#0f172a" stroke="#38bdf8" stroke-width="1.3"/>
          <text x="${rc.x}" y="${rc.y - 54}" text-anchor="middle" fill="#7dd3fc" font-size="8.5" font-weight="900" font-family="monospace">
            ${escapeHtml(roleTag)}
          </text>
        ` : "")}
        <!-- District Code & Name Banner -->
        <rect x="${rc.x - 78}" y="${rc.y - 46}" width="156" height="19" rx="4" fill="${isSel ? '#eab308' : 'rgba(18,14,9,0.88)'}" stroke="${isSel ? '#ffffff' : '#f59e0b'}" stroke-width="1.2"/>
        <text x="${rc.x}" y="${rc.y - 33}" text-anchor="middle" fill="${isSel ? '#0f172a' : '#fde68a'}" font-size="9.5" font-weight="900" font-family="monospace">
          ${dCode} · ${escapeHtml(d.name.slice(0, 16))}
        </text>

        ${miniClusterSvg}

        <!-- Sublabel showing child Town name & Level Band -->
        <text x="${rc.x}" y="${rc.y + 23}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:${isSel ? '#fde047' : '#f8f5ec'};font-size:10px;font-weight:800">
          ${townNode ? '🏰 ' + escapeHtml(townNode.name.slice(0, 18)) : (st === 'mystery' ? '🌫️ Uncharted Caldera' : escapeHtml(d.name.slice(0, 18)))}
        </text>
        <text x="${rc.x}" y="${rc.y + 35}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;fill:#e2d5b5;font-size:8.5px;font-weight:700;font-family:monospace">
          Lv.${lvRange} · ${dNodes.length} Maps ${isSel ? '· [SELECTED]' : ''}
        </text>
      </g>
    `;
  }).join('');

  const continentSwitcherHtml = continents.map(c => `
    <button type="button" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(c.id)}', inspectId: '${escapeHtml(c.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:6px 12px;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid ${c.id === activeContinent.id ? '#f59e0b' : 'rgba(255,255,255,0.18)'};background:${c.id === activeContinent.id ? '#292318' : 'rgba(18,16,12,0.86)'};color:${c.id === activeContinent.id ? '#fde047' : '#d6d3d1'}">
      🌍 ${escapeHtml(c.name)}
    </button>
  `).join('') + `
    <button type="button" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(selectedDist.id || '')}', inspectId: '${escapeHtml(selectedDist.id || '')}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:6px 12px;border-radius:6px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#2563eb;color:#ffffff;box-shadow:0 4px 12px rgba(37,99,235,0.45)">
      🔍 Zoom into Selected ${selectedDistCode} (${escapeHtml((selectedDist.name || '').slice(0, 18))}) ➔
    </button>
  `;

  const svgInnerHtml = `
    ${terrainHtml}
    ${roadsHtml}
    ${districtsHtml}
  `;

  return renderCartoShellHtml({
    stepLabel: `🗺️ STEP 2 CONTINENT ATLAS · ${escapeHtml((activeContinent.name || '').toUpperCase())} · SELECTED: ${selectedDistCode} ${escapeHtml((selectedDist.name || '').toUpperCase())}`,
    title: `${escapeHtml(activeContinent.name || '')} — ${childDistricts.length} District Territories (D01–D${String(childDistricts.length).padStart(2, '0')}) with Unified 🏰 Town / ⚔️ Hunting / 🕳️ Catacomb Symbols`,
    subtitle: 'Every District box on the Continent map previews its internal 🏰 Gold Town, ⚔️ Red Hunting Ground & 🕳️ Purple Catacomb — click any District to select it, or double-click to zoom into its Lv.3 District Map',
    activeScaleIndex: 2,
    defaultPoi,
    drillControls: continentSwitcherHtml,
    svgInnerHtml,
    legendItems: [
      { color: '#fde047', label: '[D01..D11] Selected District Territory' },
      { color: '#eab308', label: '🏰 Town Sanctuary (Gold)' },
      { color: '#ef4444', label: '⚔️ Hunting Area (Crimson)' },
      { color: '#a855f7', label: '🕳️ Catacomb / Dungeon (Violet)' },
      { color: '#38bdf8', label: '🌊 River & Highway Network' }
    ]
  });
}

function renderDistrictBigPictureSvg(activeContinent, activeDistrict, allDistrictNodes) {
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const sortedContinentDistricts = getSortedContinentDistricts(sp.districts || [], activeContinent.id);
  const distIdx = Math.max(0, sortedContinentDistricts.findIndex(d => d.id === activeDistrict.id));
  const distCode = `D${String(distIdx + 1).padStart(2, '0')}`;
  const prevDist = distIdx > 0 ? sortedContinentDistricts[distIdx - 1] : null;
  const nextDist = distIdx + 1 < sortedContinentDistricts.length ? sortedContinentDistricts[distIdx + 1] : null;

  const portalEdges = activeDistrict.portal_edges || [];
  const overlandNodes = allDistrictNodes.filter(n => n.node_type !== 'dungeon');
  const dungeonNodes = allDistrictNodes.filter(n => n.node_type === 'dungeon');

  function quadCenter(coords, isDng, idx) {
    if (isDng) return { x: 895, y: 250 + idx * 120, bx: 780, by: 52, bw: 235, bh: 396 };
    const c = coords && coords.length === 2 ? coords : [0, 1];
    const qx = c[0] === 0 ? 235 : 585;
    const qy = c[1] === 0 ? 142 : 348;
    const bx = c[0] === 0 ? 55 : 410;
    const by = c[1] === 0 ? 48 : 252;
    return { x: qx, y: qy, bx, by, bw: 345, bh: 196 };
  }

  const nodePos = {};
  overlandNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, false, i), node: n };
  });
  dungeonNodes.forEach((n, i) => {
    nodePos[n.id] = { ...quadCenter(n.grid_coordinates, true, i), node: n };
  });

  const townNode = overlandNodes.find(n => n.node_type === 'town') || allDistrictNodes[0] || {};
  const totalNpcs = allDistrictNodes.reduce((acc, n) => acc + ((n.resident_npcs || []).length), 0);
  const totalSpawns = allDistrictNodes.reduce((acc, n) => acc + ((n.resident_spawns || []).length), 0);

  const defaultPoi = {
    title: `${distCode} · ${activeDistrict.name || 'District'} (Lv.3 District Atlas)`,
    category: `Part of ${activeContinent.name || 'Continent'} · 8,000m × 8,000m Territory · Lv. ${(activeDistrict.level_range || [1, 15]).join('–')}`,
    thumb: (townNode.terrain_tile && townNode.terrain_tile.preview_thumbnail) || '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `${(activeDistrict.status || 'canon').toUpperCase()} · ${allDistrictNodes.length} Zones · ${totalNpcs} NPCs · ${totalSpawns} Monster Packs`,
    summary: activeDistrict.core_rationale || '',
    address: `Territory ${distCode} (${activeDistrict.name}) · ${activeContinent.name || ''}`,
    coordinates: `Same Symbols as Lv.2 Continent: 🏰 Gold Town · ⚔️ Red Hunting · 🕳️ Purple Catacomb · 🛍️ Green NPCs`,
    scaleSpecs: (activeDistrict.quality_checklist && activeDistrict.quality_checklist.character_scale_consistency && activeDistrict.quality_checklist.character_scale_consistency.evidence) || '12.5m main roads · 4.4m walkways · 0.58m counters',
    drillPerspective: 'town-or-hunting-area',
    drillOpts: { continentId: activeContinent.id, districtId: activeDistrict.id, nodeId: townNode.id, inspectId: townNode.id },
    drillLabel: `Zoom into 🏰 ${townNode.name || 'Town'} (64×)`,
    inspectId: activeDistrict.id,
    connections: [
      ...(prevDist ? [{ label: `⬅ West Continent Highway → D${String(distIdx).padStart(2, '0')} ${prevDist.name}`, badge: 'NEIGHBOR' }] : []),
      ...(nextDist ? [{ label: `➡ East Continent Highway → D${String(distIdx + 2).padStart(2, '0')} ${nextDist.name}`, badge: 'NEIGHBOR' }] : []),
      ...allDistrictNodes.map(n => ({
        label: `${n.node_type === 'town' ? '🏰 TOWN:' : (n.node_type === 'dungeon' ? '🕳️ CATACOMB:' : '⚔️ HUNTING:')} ${n.name} [${(n.grid_coordinates || [0,0]).join(',')}]`,
        badge: `Lv.${(n.level_range || [1, 15]).join('–')} · ${(n.resident_npcs || []).length} NPC / ${(n.resident_spawns || []).length} Mob`
      }))
    ]
  };

  // Render each quadrant with FULL architectural, street, NPC, and Monster Spawn details!
  const sectorsHtml = Object.values(nodePos).map(({ x, y, bx, by, bw, bh, node }) => {
    const isMystery = node.status === 'mystery';
    const isTown = node.node_type === 'town';
    const isDng = node.node_type === 'dungeon';
    const spawns = node.resident_spawns || [];
    const npcs = node.resident_npcs || [];
    const kit = node.asset_kit_bindings || {};
    const tile = node.terrain_tile || {};
    const thumb = isMystery ? '/thumbs/creatures/god-vesper-dream-eater.webp' : (tile.preview_thumbnail || '/thumbs/buildings/tower_round_roof_a.webp');

    // Unified Symbol + Icon + Color matching Lv.2 Continent & Lv.4 Street!
    const unifiedBadgeCol = isMystery ? '#e879f9' : (isTown ? '#eab308' : (isDng ? '#a855f7' : '#ef4444'));
    const unifiedIcon = isMystery ? '🌫️' : (isTown ? '🏰' : (isDng ? '🕳️' : '⚔️'));
    const unifiedTypeLabel = isMystery ? 'MYSTERY FOG' : (isTown ? 'TOWN SANCTUARY' : (isDng ? 'CATACOMB / DUNGEON B1' : 'HUNTING GROUND'));

    const poiObj = {
      title: `${unifiedIcon} ${node.name} (${unifiedTypeLabel})`,
      category: `Grid [${(node.grid_coordinates || [0,0]).join(', ')}] in ${distCode} ${activeDistrict.name} · 4,000m × 4,000m`,
      thumb,
      hoursOrStatus: isMystery ? 'MYSTERY FRONTIER · Locked behind Fog of Lore' : `CANON · ${isTown ? (npcs.length + ' Resident NPCs · Safe Sanctuary') : (spawns.length + ' Monster Packs Active')}`,
      summary: node.core_rationale || (node.mystery_hook && node.mystery_hook.in_world_rumor) || '',
      address: `${node.name} [${(node.grid_coordinates || [0,0]).join(', ')}] · ${distCode} ${activeDistrict.name} · ${activeContinent.name || ''}`,
      coordinates: `Map ID: ${node.map_id || 'uncharted (mystery)'} · Lv. ${(node.level_range || [1, 15]).join('–')} · Water: ${tile.water_feature || 'Canal'}`,
      scaleSpecs: isMystery ? 'Locked behind Fog of Lore gate' : `Main Road: ${kit.main_road_width_meters || 12.5}m · Walkway: ${kit.footpath_width_meters || 4.4}m · Counter: ${kit.shop_counter_height_meters || 0.58}m · Riser: ${kit.stair_riser_height_meters || 0.14}m`,
      drillPerspective: 'town-or-hunting-area',
      drillOpts: { continentId: activeContinent.id, districtId: activeDistrict.id, nodeId: node.id, inspectId: node.id },
      drillLabel: `Zoom to ${node.name} Street Map (64×)`,
      inspectId: node.id,
      svgX: x,
      svgY: y,
      connections: [
        ...npcs.map(npc => ({ label: `🛍️ NPC: ${npc.name} (${npc.role})`, badge: `${npc.counter_height_meters || 0.58}m counter` })),
        ...spawns.map(sp => ({ label: `⚔️ ${sp.monster_name} ×${sp.spawn_count}`, badge: `Lv.${sp.level} · ${sp.element}` }))
      ]
    };

    const sectorFill = isL2
      ? (isMystery ? '#3a2547' : (isTown ? '#766b46' : (isDng ? '#261b30' : '#62593b')))
      : (isMystery ? '#221a36' : (isTown ? '#285249' : (isDng ? '#2c1d38' : '#234f3e')));

    // Rich internal detail inside each sector so District is packed with readable geography!
    let internalDetailSvg = '';
    if (isTown) {
      internalDetailSvg = `
        <!-- Town Castle Curtain Wall + 4 Corner Bastions + Internal Streets + 2D Building Roofs -->
        <rect x="${bx + 24}" y="${by + 28}" width="${bw - 48}" height="${bh - 42}" rx="12" fill="rgba(20,16,10,0.32)" stroke="#eab308" stroke-width="2.2" stroke-dasharray="12 4"/>
        <circle cx="${bx + 24}" cy="${by + 28}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + bw - 24}" cy="${by + 28}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + 24}" cy="${by + bh - 14}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <circle cx="${bx + bw - 24}" cy="${by + bh - 14}" r="5" fill="#eab308" stroke="#120d07" stroke-width="1.2"/>
        <!-- Internal Cross Streets & Roundabout Plaza -->
        <line x1="${bx + 26}" y1="${y}" x2="${bx + bw - 26}" y2="${y}" stroke="#cbb989" stroke-width="5" opacity="0.65"/>
        <line x1="${x}" y1="${by + 30}" x2="${x}" y2="${by + bh - 16}" stroke="#cbb989" stroke-width="5" opacity="0.65"/>
        <circle cx="${x}" cy="${y}" r="22" fill="rgba(234,179,8,0.22)" stroke="#fde047" stroke-width="1.5"/>
        <!-- 2D Building Footprints around Plaza -->
        <rect x="${bx + 42}" y="${by + 40}" width="58" height="28" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + bw - 100}" y="${by + 40}" width="58" height="28" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + 42}" y="${by + bh - 54}" width="64" height="26" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <rect x="${bx + bw - 106}" y="${by + bh - 54}" width="64" height="26" rx="3" fill="#4a3820" stroke="#d4af37" stroke-width="1"/>
        <!-- Resident NPC Shop Pins (#10b981 Emerald) directly visible in District view! -->
        ${npcs.slice(0, 2).map((npc, ni) => {
          const nx = ni === 0 ? bx + 72 : bx + bw - 72;
          const ny = ni === 0 ? by + 54 : by + bh - 41;
          return `
            <g transform="translate(${nx}, ${ny})">
              <rect x="-48" y="-9" width="96" height="18" rx="9" fill="#064e3b" stroke="#10b981" stroke-width="1.2"/>
              <text x="0" y="3" text-anchor="middle" fill="#a7f3d0" font-size="8.5" font-weight="800">🛍️ ${escapeHtml(npc.name.slice(0, 12))}</text>
            </g>
          `;
        }).join('')}
      `;
    } else if (isDng) {
      internalDetailSvg = `
        <!-- Subterranean Catacomb Chambers, Pillars & Boss Altar -->
        <rect x="${bx + 18}" y="${by + 36}" width="${bw - 36}" height="${bh - 54}" rx="10" fill="rgba(15,10,24,0.55)" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="6 4"/>
        <line x1="${x}" y1="${by + 45}" x2="${x}" y2="${by + bh - 30}" stroke="#7e22ce" stroke-width="8" stroke-dasharray="10 6"/>
        <circle cx="${x}" cy="${by + 95}" r="24" fill="rgba(168,85,247,0.18)" stroke="#c084fc" stroke-width="1.5"/>
        <text x="${x}" y="${by + 70}" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-family="monospace">UPPER VAULT HALL</text>
        <circle cx="${x}" cy="${by + bh - 85}" r="28" fill="rgba(239,68,68,0.2)" stroke="#f97316" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="${x}" y="${by + bh - 45}" text-anchor="middle" fill="#fed7aa" font-size="8.5" font-family="monospace">🔥 SUMP ALTAR CHAMBER</text>
        ${spawns.slice(0, 2).map((sp, si) => {
          const sy = si === 0 ? by + 95 : by + bh - 85;
          return `
            <g transform="translate(${x}, ${sy})">
              <rect x="-68" y="14" width="136" height="18" rx="9" fill="#3b0764" stroke="#c084fc" stroke-width="1.2"/>
              <text x="0" y="26" text-anchor="middle" fill="#f3e8ff" font-size="8.5" font-weight="800">🕳️ ${escapeHtml(sp.monster_name.slice(0, 13))} ×${sp.spawn_count} (Lv.${sp.level})</text>
            </g>
          `;
        }).join('')}
      `;
    } else if (isMystery) {
      internalDetailSvg = `
        <ellipse cx="${x}" cy="${y}" rx="115" ry="58" fill="rgba(168,85,247,0.18)" stroke="#e879f9" stroke-width="2" stroke-dasharray="6 4"/>
        <text x="${x}" y="${y - 32}" text-anchor="middle" fill="#f5d0fe" font-size="9.5" font-weight="800">🌫️ SEALED BY FOG OF LORE</text>
        <text x="${x}" y="${y + 48}" text-anchor="middle" fill="#e9d5ff" font-size="8.5" font-style="italic">${escapeHtml(((node.mystery_hook && node.mystery_hook.visual_silhouette) || 'Uncharted frontier silhouette').slice(0, 42))}...</text>
      `;
    } else {
      // Hunting Area: Mountain Ridges, Forest Groves, Watchtower & Monster Habitat Rings + Badges!
      internalDetailSvg = `
        ${drawL2MountainRangeSvg(`${bx + 35},${by + 58} ${bx + 115},${by + 42} ${bx + 195},${by + 60}`, 0.85)}
        <ellipse cx="${bx + 78}" cy="${by + 138}" rx="48" ry="24" fill="rgba(26,56,36,0.55)" stroke="rgba(74,222,128,0.35)" stroke-width="1"/>
        <ellipse cx="${bx + bw - 78}" cy="${by + 138}" rx="52" ry="26" fill="rgba(239,68,68,0.18)" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="4 3"/>
        <!-- Monster Pack Badges directly visible in District view! -->
        ${spawns.slice(0, 2).map((sp, si) => {
          const sx = si === 0 ? bx + 85 : bx + bw - 85;
          const sy = si === 0 ? by + bh - 26 : by + 48;
          return `
            <g transform="translate(${sx}, ${sy})">
              <rect x="-66" y="-9" width="132" height="18" rx="9" fill="#7f1d1d" stroke="#ef4444" stroke-width="1.2"/>
              <text x="0" y="3" text-anchor="middle" fill="#fecaca" font-size="8.5" font-weight="800">⚔️ ${escapeHtml(sp.monster_name.slice(0, 12))} ×${sp.spawn_count} Lv.${sp.level}</text>
            </g>
          `;
        }).join('')}
      `;
    }

    const l2Kind = isTown ? 'town' : (isDng ? 'catacomb' : (isMystery ? 'tower' : 'fortress'));
    const subText = `Lv.${(node.level_range || [1, 15]).join('–')} · ${isTown ? (npcs.length + ' NPCs') : (spawns.length + ' Monster Packs')}`;

    return `
      <g data-poi-clickable="1" style="cursor:pointer"
         onclick="selectStudioMapPoi('${encodePoiAttr(poiObj)}', event)"
         ondblclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(node.id)}', inspectId: '${escapeHtml(node.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${sectorFill}" stroke="${unifiedBadgeCol}" stroke-width="${STUDIO_SELECTED_NODE_ID === node.id ? 3.2 : 2}" ${isMystery ? 'stroke-dasharray="7 4"' : ''}/>
        <!-- Unified Color Header Pill -->
        <rect x="${bx + 10}" y="${by + 8}" width="${bw - 20}" height="18" rx="4" fill="rgba(12,10,7,0.82)" stroke="${unifiedBadgeCol}" stroke-width="1"/>
        <text x="${bx + 18}" y="${by + 20}" fill="${unifiedBadgeCol}" font-size="9.5" font-weight="900" font-family="monospace">
          ${unifiedIcon} [${(node.grid_coordinates || [0,0]).join(', ')}] ${unifiedTypeLabel} · ${escapeHtml((tile.biome_palette || 'biome').replace(/_/g, ' ').slice(0, 18).toUpperCase())}
        </text>
        ${internalDetailSvg}
      </g>
      ${drawL2LandmarkSvg({
        kind: l2Kind,
        x,
        y: y - 4,
        label: node.name,
        sublabel: subText,
        flagColor: unifiedBadgeCol,
        isSelected: STUDIO_SELECTED_NODE_ID === node.id || STUDIO_ACTIVE_INSPECT_ID === node.id,
        poiObj
      })}
    `;
  }).join('');

  // Render arterial highways & bridges connecting the quadrants
  const roadsHtml = portalEdges.map((edge) => {
    const a = nodePos[edge.from_node_id];
    const b = nodePos[edge.to_node_id];
    if (!a || !b) return '';
    const isFog = edge.gate_state === 'fog_of_lore';
    const isDng = edge.from_direction === 'Dungeon' || edge.to_direction === 'Dungeon';
    const mx = Math.round((a.x + b.x) / 2);
    const my = Math.round((a.y + b.y) / 2);
    const stroke = isFog ? '#e879f9' : (isDng ? '#a855f7' : '#d4af37');
    return `
      <g pointer-events="none">
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#1c150b" stroke-width="9" stroke-linecap="round"/>
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="4.5" ${isFog || isDng ? 'stroke-dasharray="8 5"' : ''}/>
        <rect x="${mx - 58}" y="${my - 10}" width="116" height="19" rx="4" fill="#120d07" stroke="${stroke}" stroke-width="1.2"/>
        <text x="${mx}" y="${my + 3}" text-anchor="middle" fill="#fde68a" font-size="8.5" font-weight="800" font-family="monospace">
          ${isFog ? '🌫️ FOG GATE' : (isDng ? '🕳️ CATACOMB STAIR' : `🛤️ ${edge.from_direction}⇄${edge.to_direction} ROAD`)}
        </text>
      </g>
    `;
  }).join('');

  // Neighboring District Highway Banners on West & East edges so Continent <-> District link is crystal clear!
  const neighborGatesSvg = `
    ${prevDist ? `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(prevDist.id)}', inspectId: '${escapeHtml(prevDist.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="6" y="218" width="44" height="68" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text x="28" y="242" text-anchor="middle" fill="#fde047" font-size="12" font-weight="900">⬅</text>
        <text x="28" y="256" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">D${String(distIdx).padStart(2, '0')}</text>
        <text x="28" y="268" text-anchor="middle" fill="#93c5fd" font-size="7.5" font-family="monospace">WEST</text>
      </g>
    ` : ''}
    ${nextDist ? `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(nextDist.id)}', inspectId: '${escapeHtml(nextDist.id)}' }); STUDIO_MAP_SELECTED_POI=null;">
        <rect x="730" y="218" width="44" height="68" rx="6" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <text x="752" y="242" text-anchor="middle" fill="#fde047" font-size="12" font-weight="900">➡</text>
        <text x="752" y="256" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">D${String(distIdx + 2).padStart(2, '0')}</text>
        <text x="752" y="268" text-anchor="middle" fill="#93c5fd" font-size="7.5" font-family="monospace">EAST</text>
      </g>
    ` : ''}
  `;

  const distRaceBind = getStudioRaceBinding(activeDistrict.id);
  const distConvHub = getStudioConvergenceHub(activeDistrict.id);
  // Top-left District Switcher pills so you can jump between D01..D11 inside the District view too!
  const districtControlsHtml = `
    <button type="button" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(activeDistrict.id)}', inspectId: '${escapeHtml(activeDistrict.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:5px 10px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:1px solid #38bdf8;background:rgba(15,23,42,0.92);color:#7dd3fc">
      ⬅ Back to 🌍 ${escapeHtml(activeContinent.name)} (${distCode} Highlighted)
    </button>
    <button type="button" onclick="setStudioPerspective('district', { continentId: 'continent-01-hearthbloom-basin', districtId: 'district-kilnfire-terraces', nodeId: 'town-kilnwatch-bastion', inspectId: 'district-kilnfire-terraces' }); STUDIO_MAP_SELECTED_POI=null;"
            style="padding:5px 10px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#dc2626;color:#ffffff">
      🤝 Lv.10–20 All-Race Guild Hub (Kilnwatch Bastion) ➔
    </button>
  ` + sortedContinentDistricts.slice(0, 6).map((d, i) => {
    const code = `D${String(i + 1).padStart(2, '0')}`;
    const active = d.id === activeDistrict.id;
    return `
      <button type="button" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' }); STUDIO_MAP_SELECTED_POI=null;"
              style="padding:5px 9px;border-radius:6px;font-size:10.5px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#fde047' : 'rgba(255,255,255,0.16)'};background:${active ? '#d97706' : 'rgba(18,16,12,0.85)'};color:${active ? '#ffffff' : '#cbd5e1'}">
        ${code} ${escapeHtml(d.name.slice(0, 12))}
      </button>
    `;
  }).join('');

  const hasNW = overlandNodes.some(n => (n.grid_coordinates || [0,0])[0] === 0 && (n.grid_coordinates || [0,0])[1] === 0);
  const svgInnerHtml = `
    <!-- Outer Golden District Boundary Box matching the [D01..D11] Territory Box from Lv.2 Continent! -->
    <rect x="44" y="38" width="978" height="420" rx="14" fill="none" stroke="#f59e0b" stroke-width="3" stroke-dasharray="12 5"/>

    ${!hasNW ? `
      <!-- [0,0] NW Highland Watershed & Caldera Rim Reserve -->
      <rect x="55" y="48" width="345" height="196" rx="10" fill="${isL2 ? '#554e35' : '#1d4436'}" stroke="rgba(212,175,55,0.35)" stroke-width="1.5" stroke-dasharray="5 4"/>
      ${drawL2MountainRangeSvg('90,115 180,88 270,112 360,92', 1.15)}
      ${drawL2MountainRangeSvg('110,175 220,155 330,178', 1.0)}
      <text x="228" y="136" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3.5px;fill:#e2d5b5;font-size:11px;font-weight:800">⛰️ ${escapeHtml((activeDistrict.name || '').toUpperCase())} HIGHLAND RIDGE [0, 0]</text>
      <text x="228" y="152" text-anchor="middle" style="paint-order:stroke fill;stroke:#120d07;stroke-width:3px;fill:#a7f3d0;font-size:9px;font-family:monospace">Headwaters feeding ${escapeHtml((townNode.terrain_tile && townNode.terrain_tile.water_feature) || 'District Waterway')}</text>
    ` : ''}

    <!-- Continuous Regional River (#38bdf8 / #314e52) flowing across [0,0] -> [0,1] -> [1,1] -->
    <path d="M 115,48 Q 210,165 235,285 T 585,365 L 765,380" fill="none" stroke="${isL2 ? '#314e52' : '#1d4ed8'}" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
    <path d="M 115,48 Q 210,165 235,285 T 585,365 L 765,380" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-dasharray="10 6" opacity="0.65"/>

    ${roadsHtml}
    ${sectorsHtml}
    ${neighborGatesSvg}
  `;

  return renderCartoShellHtml({
    stepLabel: `🏙️ STEP 3 DISTRICT TERRITORY ATLAS · ${distCode} ${escapeHtml((activeDistrict.name || '').toUpperCase())} (IN ${escapeHtml((activeContinent.name || '').toUpperCase())})`,
    title: `${distCode} · ${escapeHtml(activeDistrict.name || '')} — Detailed 🏰 Town Walls & NPCs, ⚔️ Hunting Grounds & Monster Packs, 🕳️ Catacomb B1`,
    subtitle: 'Shares exact same symbols & colors as Lv.2 Continent: click any 🏰 Gold Town, ⚔️ Red Hunting Area, 🕳️ Purple Catacomb, 🛍️ NPC, or ⚔️ Monster Pack (double-click to zoom to Lv.4 Street)',
    activeScaleIndex: 3,
    defaultPoi,
    drillControls: districtControlsHtml,
    svgInnerHtml,
    legendItems: [
      { color: '#eab308', label: '🏰 Town Sanctuary & Walls [1,1]' },
      { color: '#ef4444', label: '⚔️ Hunting Ground & Mob Packs [0,1]' },
      { color: '#a855f7', label: '🕳️ Catacomb / Dungeon (Floor -1)' },
      { color: '#10b981', label: '🛍️ Resident NPC Shops' },
      { color: '#38bdf8', label: '🌊 River & Neighbor District Gates' }
    ]
  });
}

function renderTownOrHuntingAreaBigPictureSvg(activeDistrict, activeNode, activeMonster) {
  const tile = activeNode.terrain_tile || {};
  const dims = tile.dimensions_meters || { width: 4000, height: 4000 };
  const portals = activeNode.portals || {};
  const kit = activeNode.asset_kit_bindings || {};
  const spawns = activeNode.resident_spawns || [];
  const npcs = activeNode.resident_npcs || [];
  const assets = kit.three_dimensional_assets || [];
  const isTown = activeNode.node_type === 'town';
  const isDng = activeNode.node_type === 'dungeon';
  const isMystery = activeNode.status === 'mystery';
  const thumb = tile.preview_thumbnail || '/thumbs/buildings/tower_round_roof_a.webp';

  const roadWidth = kit.main_road_width_meters || 12.5;
  const pathWidth = kit.footpath_width_meters || 4.4;
  const counterH = kit.shop_counter_height_meters || 0.58;
  const riserH = kit.stair_riser_height_meters || 0.14;
  const doorH = (kit.doorway_clearance_meters && kit.doorway_clearance_meters.height) || 2.15;
  const doorW = (kit.doorway_clearance_meters && kit.doorway_clearance_meters.width) || 1.6;

  // Build clickable street-level POIs (Walkways, River & Bridge, Castle/Town Wall, Central Statue, Buildings, NPC Shops, Monster Habitats, Portals)
  const poiStatue = {
    title: isTown ? `Central Founders Statue & Plaza (${activeNode.name})` : (isDng ? `Central Vault Resonance Pillar` : `Ancient Titan Relic Monument`),
    category: isTown ? 'Monument Statue & Central Sanctuary Plaza' : 'Landmark Monument & Survey Anchor',
    thumb: assets[0] ? `/thumbs/buildings/${assets[0].split('/').pop().replace('.glb', '.webp')}` : thumb,
    hoursOrStatus: 'Open 24 Hours · 1.05m Kid Sightline Landmark',
    summary: `Central architectural focal point at [2000m, 2000m] surrounded by a ${roadWidth}m wide stone roundabout and ${pathWidth}m pedestrian walkways.`,
    address: `2000m E, 2000m N · Central Plaza · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `Map ID: ${activeNode.map_id || activeNode.id} · Elevation Step ≤ ${tile.max_terrace_step_meters || 0.14}m`,
    scaleSpecs: `Pedestal Riser: ${riserH}m (≤0.15m toddler law) · Plaza Road: ${roadWidth}m · Walkway: ${pathWidth}m · Unobstructed 12m camera sightline`,
    inspectId: activeNode.id,
    connections: [
      { label: `🛣️ Main Artery: ${activeNode.name} Grand Avenue (${roadWidth}m)`, badge: '2-WAY' },
      { label: `🚶 Pedestrian Ring Walkway (${pathWidth}m)`, badge: 'SAFE' },
      { label: `🎨 3D Asset: ${(assets[0] || 'tower_round_roof_a.glb').split('/').pop()}`, badge: 'GLB' }
    ]
  };

  const poiWall = {
    title: isTown ? `${activeNode.name} Castle & Town Perimeter Wall` : `${activeNode.name} Canyon Rim & Retaining Wall`,
    category: 'Fortified Wall, Gate Towers & Archways',
    thumb: '/thumbs/buildings/wall_arched.webp',
    hoursOrStatus: 'CANON · Fortified Perimeter & Gate Bastions',
    summary: `Arched masonry perimeter wall protecting ${activeNode.name}, featuring ${doorH}m × ${doorW}m gate arches sized for 90–120cm Star-Kindled characters.`,
    address: `Perimeter Ring [600m..3400m] · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `3D Asset: res://assets/buildings/wall_arched.glb · 4 Gate Bastions`,
    scaleSpecs: `Gate Archway: ${doorH}m H × ${doorW}m W · Rampart Step Riser: ${riserH}m · Bastion Walkway: ${pathWidth}m`,
    inspectId: activeNode.id,
    connections: Object.entries(portals).filter(([, v]) => v).map(([dir, p]) => ({
      label: `🚪 ${dir} Gate → ${p.target_node_id}`,
      badge: p.gate_state.toUpperCase()
    }))
  };

  const poiRiver = {
    title: tile.water_feature || 'Terraced River & Stone Bridge Crossing',
    category: 'Waterway, Canal & Bridge Infrastructure',
    thumb: '/thumbs/buildings/bridge_wood.webp',
    hoursOrStatus: 'Active Waterway · Crossed by 2 Bridges',
    summary: `${tile.water_feature || 'Warm mineral waterway'} flowing through ${activeNode.name}, spanned by ${roadWidth}m main highway bridges and ${pathWidth}m footbridges.`,
    address: `Waterway Corridor · ${activeNode.name} · ${activeDistrict.name || ''}`,
    coordinates: `Span: 4,000m Waterway · Bridge Clearance: ${roadWidth}m Wide`,
    scaleSpecs: `Bridge Parapet: 0.60m (chest-high safety rail for 1.05m kids) · Bridge Approach Riser: ${riserH}m`,
    inspectId: activeNode.id,
    connections: [
      { label: '🌉 Central Stone Highway Bridge', badge: `${roadWidth}m` },
      { label: '🌉 East Pedestrian Footbridge', badge: `${pathWidth}m` }
    ]
  };

  // NPC Shop Building POIs
  const npcBlocks = npcs.map((npc, idx) => {
    const bx = idx === 0 ? 375 : 575;
    const by = idx === 0 ? 155 : 275;
    const poiNpc = {
      title: `${npc.name} — ${npc.role}`,
      category: `NPC Shop, Guild Building & Counter`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: 'Every Day, Open 24 Hours · Safe Town Service',
      summary: `"${npc.dialogue_greeting || 'Welcome to our workshop!'}"`,
      address: `${Math.round((npc.position_meters && npc.position_meters.x) || 1980)}m E, ${Math.round((npc.position_meters && npc.position_meters.y) || 2010)}m N · ${activeNode.name}`,
      coordinates: `NPC ID: ${npc.npc_id} · Counter Height: ${npc.counter_height_meters || counterH}m`,
      scaleSpecs: `Shop Counter: ${npc.counter_height_meters || counterH}m (0.55–0.65m toddler law) · Doorway: ${doorH}m × ${doorW}m · Frontage Walkway: ${pathWidth}m`,
      inspectId: activeNode.id,
      connections: [
        { label: `🛍️ Service Role: ${npc.role}`, badge: 'OPEN' },
        { label: `🚶 Frontage: ${activeNode.name} Market Street`, badge: `${pathWidth}m` }
      ]
    };
    return { bx, by, npc, poiNpc };
  });

  // Monster Spawn Territory POIs
  const spawnBlocks = spawns.map((sp, idx) => {
    const sx = idx === 0 ? 275 : 715;
    const sy = idx === 0 ? 155 : 335;
    const drop0 = (sp.item_drops && sp.item_drops[0]) || null;
    const card = sp.monster_card_drop || null;
    const poiMob = {
      title: `${sp.monster_name} Territory (×${sp.spawn_count})`,
      category: `Monster Habitat · Lv.${sp.level} ${sp.element} · ${sp.size} ${sp.race} (${sp.family})`,
      thumb: `/thumbs/creatures/${sp.monster_id}.webp`,
      hoursOrStatus: `Respawn Cadence: Every ${sp.respawn_seconds}s · Active Pack: ×${sp.spawn_count}`,
      summary: `Ecological ${sp.family} territory patrolling the ${tile.biome_palette || 'regional'} walkways and terraces of ${activeNode.name}.`,
      address: `Sector ${idx === 0 ? 'North-West Terrace' : 'South-East Grounds'} · ${activeNode.name} · ${activeDistrict.name || ''}`,
      coordinates: `Monster ID: ${sp.monster_id} · Spawn ID: ${sp.spawn_id}`,
      scaleSpecs: `Foliage Law: Grass ≤ ${kit.max_grass_height_meters || 0.2}m, Bushes ≤ ${kit.max_bush_height_meters || 0.44}m so 1.05m player heads & mob silhouettes never clip`,
      inspectId: activeNode.id,
      connections: [
        ...(drop0 ? [{ label: `🎁 Drop: ${drop0.item_name}`, badge: `${drop0.drop_chance_percent}%` }] : []),
        ...(card ? [{ label: `🃏 Card: ${card.card_name}`, badge: `${card.drop_chance_percent}%` }] : [])
      ]
    };
    return { sx, sy, sp, poiMob };
  });

  // Portal Gate POIs
  const portalDefs = [
    { dir: 'North', x: 520, y: 36, labelPos: 'bottom' },
    { dir: 'South', x: 520, y: 462, labelPos: 'top' },
    { dir: 'West',  x: 68,  y: 250, labelPos: 'right' },
    { dir: 'East',  x: 972, y: 250, labelPos: 'left' },
    { dir: 'Dungeon', x: 645, y: 215, labelPos: 'bottom' },
    { dir: 'Exit',    x: 215, y: 395, labelPos: 'top' }
  ];

  const portalsSvg = portalDefs.map(pd => {
    const p = portals[pd.dir];
    if (!p) return '';
    const isFog = p.gate_state === 'fog_of_lore';
    const col = isFog ? '#c084fc' : '#2563eb';
    const poiPortal = {
      title: `${pd.dir} Portal Gate → ${p.target_node_id || 'Uncharted Frontier'}`,
      category: `${pd.dir} Highway & Boundary Gate (${p.gate_state.toUpperCase()})`,
      thumb: '/thumbs/buildings/wall_arched.webp',
      hoursOrStatus: isFog ? 'LOCKED · Fog of Lore Gate' : 'OPEN 24 HOURS · Bidirectional Portal',
      summary: isFog ? (p.lock_message || 'Sealed by Fog of Lore.') : `Connects ${activeNode.name} (${pd.dir}) directly to ${p.target_node_id} (${p.target_direction}).`,
      address: `Trigger Box: X=${(p.trigger_box_meters && p.trigger_box_meters.x) || 2000}m, Y=${(p.trigger_box_meters && p.trigger_box_meters.y) || 160}m · ${activeNode.name}`,
      coordinates: `Portal ID: ${p.portal_id} · Target Map: ${p.target_map_id || 'null (mystery)'}`,
      scaleSpecs: `Gate Trigger Width: ${(p.trigger_box_meters && p.trigger_box_meters.width) || 12}m × ${(p.trigger_box_meters && p.trigger_box_meters.height) || 24}m · Approach Road: ${roadWidth}m`,
      drillPerspective: 'town-or-hunting-area',
      drillOpts: { districtId: activeDistrict.id, nodeId: p.target_node_id, inspectId: p.target_node_id },
      drillLabel: `Traverse to ${p.target_node_id}`,
      inspectId: p.target_node_id || activeNode.id,
      connections: [
        { label: `🧭 Direction: ${pd.dir} ➔ ${p.target_direction}`, badge: p.gate_state.toUpperCase() },
        { label: `📍 Arrival: X=${(p.arrival_point_meters && p.arrival_point_meters.x) || 2000}m, Y=${(p.arrival_point_meters && p.arrival_point_meters.y) || 200}m`, badge: 'ARRIVAL' }
      ]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiPortal)}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${pd.x}" cy="${pd.y}" r="14" fill="${col}" stroke="#ffffff" stroke-width="2.5"/>
        <text x="${pd.x}" y="${pd.y + 4}" text-anchor="middle" font-size="12">${isFog ? '🌫️' : (pd.dir === 'Dungeon' ? '🕳️' : '🚪')}</text>
        <rect x="${pd.x - 78}" y="${pd.y + (pd.y > 400 ? -34 : 16)}" width="156" height="20" rx="4" fill="rgba(15,23,42,0.94)" stroke="${col}" stroke-width="1.2"/>
        <text x="${pd.x}" y="${pd.y + (pd.y > 400 ? -21 : 29)}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="800" font-family="monospace">${pd.dir.toUpperCase()}: ${escapeHtml((p.target_node_id || '').replace('hunting-area-', '').replace('town-', '').replace('dungeon-', '').slice(0, 16))} ➔</text>
      </g>
    `;
  }).join('');

  // Urban building footprints (slanted/grid blocks like Screenshot 5!)
  const buildingsSvg = `
    <!-- City / Zone Blocks (Dark Slate Parcel Lots like Google Maps Street View) -->
    <g opacity="0.92">
      <!-- NW Block -->
      <polygon points="155,75 465,75 465,205 155,205" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="175" y="92" width="82" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="272" y="92" width="95" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="382" y="92" width="66" height="92" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="175" y="150" width="115" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- NE Block (with Park Lawn) -->
      <polygon points="575,75 885,75 885,205 575,205" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="592" y="90" width="125" height="55" rx="4" fill="#1e4d3b" stroke="#34d399" stroke-width="1"/>
      <text x="654" y="121" text-anchor="middle" fill="#86efac" font-size="9.5" font-weight="700">🌳 Terrace Garden</text>
      <rect x="735" y="90" width="132" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="735" y="148" width="132" height="44" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- SW Block -->
      <polygon points="155,295 465,295 465,425 155,425" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="175" y="312" width="92" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="282" y="312" width="84" height="48" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="380" y="312" width="68" height="95" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="175" y="372" width="188" height="38" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>

      <!-- SE Block -->
      <polygon points="575,295 885,295 885,425 575,425" fill="#2c394b" stroke="#3b4c63" stroke-width="1.5"/>
      <rect x="595" y="312" width="105" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="715" y="312" width="152" height="46" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="595" y="370" width="135" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
      <rect x="745" y="370" width="122" height="42" rx="3" fill="#465870" stroke="#64748b" stroke-width="1"/>
    </g>
  `;

  const svgInnerHtml = `
    <!-- Base Emerald Ground Terrain -->
    <rect x="20" y="15" width="1000" height="470" rx="14" fill="#214e3f"/>

    ${buildingsSvg}

    <!-- River / Canal Waterway cutting across map + Clickable Bridges -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiRiver)}', event)">
      <path d="M 35,345 Q 265,285 520,295 T 1005,225" fill="none" stroke="#0f172a" stroke-width="26" stroke-linecap="round" opacity="0.45"/>
      <path d="M 35,345 Q 265,285 520,295 T 1005,225" fill="none" stroke="#1d4ed8" stroke-width="20" stroke-linecap="round"/>
      <text x="265" y="314" fill="#93c5fd" font-size="9.5" font-weight="700" font-style="italic" letter-spacing="0.08em">🌊 ${escapeHtml((tile.water_feature || 'Mineral Canal').slice(0, 38))}</text>
    </g>

    <!-- Castle / Town Perimeter Wall & Gate Towers (Clickable!) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiWall)}', event)">
      <rect x="125" y="55" width="790" height="390" rx="18" fill="none" stroke="#94a3b8" stroke-width="8" stroke-dasharray="28 8"/>
      <rect x="125" y="55" width="790" height="390" rx="18" fill="none" stroke="#e2e8f0" stroke-width="2"/>
      <!-- 4 Corner Castle Wall Towers -->
      <circle cx="125" cy="55" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="915" cy="55" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="125" cy="445" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <circle cx="915" cy="445" r="11" fill="#64748b" stroke="#f8fafc" stroke-width="2"/>
      <rect x="148" y="44" width="215" height="18" rx="4" fill="#0f172a" stroke="#94a3b8" stroke-width="1"/>
      <text x="255" y="56" text-anchor="middle" fill="#e2e8f0" font-size="9" font-weight="800" font-family="monospace">🧱 CASTLE / TOWN WALL (${doorH}m ARCHES)</text>
    </g>

    <!-- Street & Walkway Network (Main East-West & North-South Avenues + Side Sois + Directional Arrows) -->
    <g pointer-events="none">
      <!-- West-East Main Highway (12.5m-13.0m) -->
      <line x1="68" y1="250" x2="972" y2="250" stroke="#1e293b" stroke-width="28"/>
      <line x1="68" y1="250" x2="972" y2="250" stroke="#334155" stroke-width="22"/>
      <line x1="68" y1="250" x2="972" y2="250" stroke="#64748b" stroke-width="1.2" stroke-dasharray="10 8"/>
      <text x="315" y="245" text-anchor="middle" fill="#cbd5e1" font-size="8.5" font-weight="800" letter-spacing="0.12em">← GRAND AVENUE (${roadWidth}M MAIN ROAD) →</text>
      <text x="735" y="245" text-anchor="middle" fill="#cbd5e1" font-size="8.5" font-weight="800" letter-spacing="0.12em">← EAST GATEWAY ROAD (${roadWidth}M) →</text>

      <!-- North-South Main Avenue -->
      <line x1="520" y1="36" x2="520" y2="462" stroke="#1e293b" stroke-width="24"/>
      <line x1="520" y1="36" x2="520" y2="462" stroke="#334155" stroke-width="18"/>
      <text x="515" y="145" text-anchor="middle" transform="rotate(-90 515 145)" fill="#cbd5e1" font-size="8" font-weight="700" letter-spacing="0.1em">↑ NORTH SANCTUARY WALKWAY (${pathWidth}M)</text>

      <!-- Secondary Pedestrian Walkways (Soi / Footpaths 4.4m) -->
      <line x1="155" y1="145" x2="885" y2="145" stroke="#1e293b" stroke-width="10"/>
      <line x1="155" y1="145" x2="885" y2="145" stroke="#475569" stroke-width="6"/>
      <text x="320" y="143" text-anchor="middle" fill="#e2e8f0" font-size="7.5" font-family="monospace">SOI ARTISAN WALKWAY (${pathWidth}m) →</text>

      <line x1="155" y1="362" x2="885" y2="362" stroke="#1e293b" stroke-width="10"/>
      <line x1="155" y1="362" x2="885" y2="362" stroke="#475569" stroke-width="6"/>
      <text x="710" y="360" text-anchor="middle" fill="#e2e8f0" font-size="7.5" font-family="monospace">← LANTERN MARKET WALKWAY (${pathWidth}m)</text>

      <!-- Highway Route Shield in Center-West -->
      <rect x="418" y="241" width="28" height="18" rx="3" fill="#f8fafc" stroke="#0f172a" stroke-width="1.2"/>
      <text x="432" y="253" text-anchor="middle" fill="#0f172a" font-size="9" font-weight="800" font-family="monospace">12</text>
    </g>

    <!-- Central Roundabout Plaza & Monument Statue (Clickable!) -->
    <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiStatue)}', event)" filter="url(#cartoDropShadow)">
      <circle cx="520" cy="250" r="42" fill="#334155" stroke="#eab308" stroke-width="3"/>
      <circle cx="520" cy="250" r="26" fill="#1e293b" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="4 3"/>
      <circle cx="520" cy="250" r="14" fill="#eab308" stroke="#ffffff" stroke-width="2"/>
      <text x="520" y="255" text-anchor="middle" font-size="13">🗽</text>
      <rect x="442" y="296" width="156" height="20" rx="5" fill="rgba(15,23,42,0.94)" stroke="#ffd166" stroke-width="1.2"/>
      <text x="520" y="310" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="800">★ Statue &amp; Central Plaza</text>
    </g>

    <!-- Clickable NPC Shop & Guild Pins (Orange/Gold Google Maps Retail/Food Pins) -->
    ${npcBlocks.map(({ bx, by, npc, poiNpc }) => `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiNpc)}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${bx}" cy="${by}" r="13" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
        <text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="11">🛍️</text>
        <text x="${bx + 18}" y="${by - 2}" fill="#fde68a" font-size="10.5" font-weight="800">${escapeHtml(npc.name)}</text>
        <text x="${bx + 18}" y="${by + 10}" fill="#cbd5e1" font-size="9" font-family="monospace">${escapeHtml(npc.role.slice(0, 24))} (${npc.counter_height_meters || counterH}m)</text>
      </g>
    `).join('')}

    <!-- Clickable Monster Spawn Territory Pins (Crimson/Amber Pins with Portrait) -->
    ${spawnBlocks.map(({ sx, sy, sp, poiMob }) => `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr(poiMob)}', event)" filter="url(#cartoDropShadow)">
        <ellipse cx="${sx}" cy="${sy}" rx="56" ry="30" fill="rgba(239,68,68,0.16)" stroke="#f87171" stroke-width="1.5" stroke-dasharray="5 3"/>
        <circle cx="${sx - 28}" cy="${sy}" r="14" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
        <text x="${sx - 28}" y="${sy + 4}" text-anchor="middle" font-size="11">⚔️</text>
        <text x="${sx - 8}" y="${sy - 3}" fill="#ffffff" font-size="10.5" font-weight="800">${escapeHtml(sp.monster_name.slice(0, 18))}</text>
        <text x="${sx - 8}" y="${sy + 10}" fill="#fca5a5" font-size="9" font-family="monospace">Lv.${sp.level} · ×${sp.spawn_count} (${sp.respawn_seconds}s)</text>
      </g>
    `).join('')}

    <!-- Clickable North / South / East / West / Dungeon / Exit Portal Gates -->
    ${portalsSvg}
    ${renderAtlasOverviewMiniMapPipSvg(activeNode, null, 'step4')}
  `;

  const defaultPoi = activeMonster
    ? (spawnBlocks.find(b => b.sp.monster_id === activeMonster.monster_id)?.poiMob || spawnBlocks[0]?.poiMob || poiStatue)
    : (npcBlocks[0]?.poiNpc || spawnBlocks[0]?.poiMob || poiStatue);

  return renderCartoShellHtml({
    stepLabel: `🏘️ STEP 4 STREET, WALKWAY & BUILDING FOOTPRINT MAP · ${dims.width}m × ${dims.height}m`,
    title: `${escapeHtml(activeNode.name || '')} (${escapeHtml(activeNode.map_id || activeNode.id || '')}) — 2D Building Footprints, Castle Walls, Statue Plaza, Rivers & POIs`,
    subtitle: 'Styled like Google/Apple Street Maps: click any Building, Statue, Castle Wall, River Bridge, NPC Shop, Monster Territory, or Portal Gate to explore',
    activeScaleIndex: 4,
    defaultPoi,
    svgInnerHtml,
    legendItems: [
      { color: '#465870', label: '2D Building Footprints' },
      { color: '#94a3b8', label: 'Castle / Town Perimeter Wall' },
      { color: '#eab308', label: 'Central Statue & Plaza' },
      { color: '#f59e0b', label: 'NPC Shop & Counter' },
      { color: '#dc2626', label: 'Monster Spawn Territory' },
      { color: '#2563eb', label: 'River & Portal Gates' }
    ]
  });
}

function renderStudioWorldHistoryPerspective(whc, continents) {
  const scale = whc.character_scale_law || {};
  const metrics = scale.environment_metrics || {};
  const premise = whc.player_arrival_premise || {};
  const gods = (whc.primordial_gods || []).filter(g => STUDIO_STATUS_FILTER === 'all' || g.status === STUDIO_STATUS_FILTER);
  const epochs = whc.historical_epochs || [];
  const bindings = whc.starter_town_bindings || [];
  const isNotesOpen = Boolean(ATLAS_STUDIO_NOTES_OPEN);

  return `
    ${renderWhcBigPictureSvg(whc, continents)}
    <div style="margin-bottom:10px;padding:8px 14px;border-radius:10px;background:#111b2b;border:1px solid rgba(218,179,98,0.35);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="font-size:11.5px;font-weight:800;color:#fde68a">
        📚 Studio Canon Reference, 63-Zone Directory &amp; 4-Perspective Tables (Step 1 · World History, 6 Gods, Scale Law &amp; GOV-01..GOV-06)
      </div>
      <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${isNotesOpen ? 'true' : 'false'}" onclick="toggleAtlasStudioNotes()">
        ${isNotesOpen ? 'Hide Studio Reference Dock' : 'Show Studio Reference Dock'}
      </button>
    </div>
    <div id="atlasStudioNotesReferenceDock" class="studio-split-layout" style="display:${isNotesOpen ? 'grid' : 'none'}">
      ${isNotesOpen ? `
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 1 · WORLD HISTORY AND CONCEPT</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(whc.world_title || whc.name || '')}</h2>
            </div>
            ${renderStatusBadgeHtml(whc.status)}
          </div>
          <p style="margin:8px 0 14px;color:var(--joy-text-secondary);line-height:1.5">${escapeHtml(whc.core_rationale || '')}</p>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">PLAYER IDENTITY</div>
              <div style="font-size:12px;margin-top:4px;font-weight:600">${escapeHtml(premise.player_identity || '')}</div>
            </div>
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">WHY PLAYERS ENTER THE WORLD</div>
              <div style="font-size:12px;margin-top:4px">${escapeHtml(premise.why_enter_world || '')}</div>
            </div>
            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
              <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">INCITING PHENOMENON</div>
              <div style="font-size:12px;margin-top:4px">${escapeHtml(premise.inciting_phenomenon || '')}</div>
            </div>
          </div>

          <h3 style="margin:0 0 10px;font-size:1rem">Primordial Gods and Planetary Scars</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
            ${gods.map(g => `
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px ${g.status === 'mystery' ? 'dashed rgba(168,85,247,0.55)' : 'solid var(--joy-border-default)'}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
                  <strong>${escapeHtml(g.name)}</strong>
                  ${renderStatusBadgeHtml(g.status)}
                </div>
                <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">Domain: ${escapeHtml(g.domain)}</div>
                <div style="font-size:12px;margin-bottom:6px"><strong>Core Rationale:</strong> ${escapeHtml(g.core_rationale)}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary)"><strong>Geographical Scar:</strong> ${escapeHtml(g.geographical_scar)}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-top:4px"><strong>Architectural Imprint:</strong> ${escapeHtml(g.architectural_imprint)}</div>
                ${g.mystery_hook ? `
                  <div style="margin-top:8px;padding:8px;border-radius:6px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.35);font-size:11px">
                    <div><strong>🌫️ In-World Rumor:</strong> ${escapeHtml(g.mystery_hook.in_world_rumor)}</div>
                    <div style="margin-top:3px"><strong>Unanswered Question:</strong> ${escapeHtml(g.mystery_hook.unanswered_question)}</div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </section>

        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <h3 style="margin:0 0 10px;font-size:1rem">Historical Epochs and Great War Scars (Click to Drill into Continent)</h3>
          ${epochs.map(ep => `
            <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>Era ${ep.era_order}: ${escapeHtml(ep.name)} (${escapeHtml(ep.kind)})</strong>
                ${renderStatusBadgeHtml(ep.status)}
              </div>
              <p style="font-size:12px;color:var(--joy-text-secondary);margin:6px 0 10px">${escapeHtml(ep.core_rationale)}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
                ${(ep.world_scars || []).map(sc => `
                  <div style="padding:10px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle)">
                    <div style="font-weight:700;font-size:12px">${escapeHtml(sc.name)}</div>
                    <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:2px 0 6px">${escapeHtml(sc.scar_id)}</div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-bottom:8px">${escapeHtml(sc.description)}</div>
                    ${(sc.spawned_continent_ids || []).map(cid => `
                      <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(cid)}', inspectId: '${escapeHtml(cid)}' })">
                        Drill into ${escapeHtml(cid)} ➔
                      </button>
                    `).join(' ')}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </section>

        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <h3 style="margin:0 0 8px;font-size:1rem">90 to 120 Centimeter Cute Toddler and Kid Character Scale Law Visualizer</h3>
          <p style="font-size:12px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(scale.head_to_body_ratio || '')}</p>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;align-items:end;height:130px;padding:14px;background:var(--joy-surface-sunken);border-radius:8px;border:1px solid var(--joy-border-subtle)">
            <div style="text-align:center"><div style="height:22px;background:#22c55e;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Grass ≤ ${metrics.max_grass_height_meters || 0.35}m</div></div>
            <div style="text-align:center"><div style="height:38px;background:#10b981;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Bush ≤ ${metrics.max_bush_height_meters || 0.65}m</div></div>
            <div style="text-align:center"><div style="height:36px;background:#eab308;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Counter 0.60m</div></div>
            <div style="text-align:center"><div style="height:64px;background:#3b82f6;border-radius:4px 4px 0 0"></div><div style="font-size:10px;font-weight:700;margin-top:4px">Kid ${scale.reference_height_meters || 1.05}m</div></div>
            <div style="text-align:center"><div style="height:95px;background:#6366f1;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Door ≥ ${metrics.min_doorway_height_meters || 2.0}m</div></div>
            <div style="text-align:center"><div style="height:18px;background:#f97316;border-radius:4px 4px 0 0"></div><div style="font-size:10px;margin-top:4px">Step ≤ ${metrics.max_stair_riser_meters || 0.15}m</div></div>
          </div>
          <div style="margin-top:12px">
            <strong style="font-size:12px">6 Racial Starter Town Arrival Bindings:</strong>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-top:6px">
              ${bindings.map(b => {
                const tId = b.town_id || b.town_node_id || "";
                const tLabel = b.town_name || b.race_name || tId;
                const narr = b.spawn_rationale || b.arrival_narrative || "";
                return `
                <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);font-size:12px">
                  <div><strong>🏰 ${escapeHtml(tLabel)}</strong> <span class="mono" style="font-size:10px;color:var(--joy-text-secondary)">(${escapeHtml(tId)})</span> · ${renderStatusBadgeHtml(b.status || "canon")}</div>
                  <div style="color:var(--joy-text-secondary);font-size:11.5px;margin:4px 0">${escapeHtml(narr)}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(tId)}', inspectId: '${escapeHtml(tId)}' })">
                      🏰 Home Town ➔
                    </button>
                    ${b.hunting_area_id ? `
                      <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(b.hunting_area_id)}', inspectId: '${escapeHtml(b.hunting_area_id)}' })">
                        ⚔️ Hunting Area ➔
                      </button>
                    ` : ""}
                    ${b.farming_area_id ? `
                      <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(b.continent_id)}', districtId: '${escapeHtml(b.district_id)}', nodeId: '${escapeHtml(b.farming_area_id)}', inspectId: '${escapeHtml(b.farming_area_id)}' })">
                        🌾 Farming Area ➔
                      </button>
                    ` : ""}
                  </div>
                </div>
              `;}).join('')}
            </div>
          </div>
        </section>

        ${(() => {
          const tax = whc.race_taxonomy || {};
          const playableRaces = tax.playable_and_mob_races || [];
          const monsterRaces = tax.monster_ecology_races || [];
          const godEntities = tax.god_tier_entities || [];
          const sys = whc.shared_world_systems || {};
          const smith = sys.blacksmith_clan || {};
          const guild = sys.adventure_guild || {};
          const qloop = sys.quest_progression_loop || {};
          const bhier = sys.boss_power_hierarchy || {};
          return `
            <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
              <div class="mono" style="font-size:11px;color:#38bdf8">MULTI-RACE COSMOLOGY · 6 PLAYABLE/MOB RACES + 6 MONSTER ECOLOGIES + 6 SEALED GODS</div>
              <h3 style="margin:4px 0 10px;font-size:1.05rem">6 Playable & Mob Races (Racial Home Towns, Niched Stories, Hunting & Farming Loops)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;margin-bottom:16px">
                ${playableRaces.map(r => `
                  <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                      <strong>🧬 ${escapeHtml(r.name)}</strong>
                      <span class="mono" style="font-size:10px;padding:2px 6px;border-radius:999px;background:rgba(56,189,248,0.16);color:#38bdf8">Player + Mob</span>
                    </div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(r.archetype_reference || "")}</div>
                    <div style="font-size:11.5px;margin:6px 0"><strong>Home Town:</strong> 🏰 ${escapeHtml(r.home_town_name)} (<span class="mono">${escapeHtml(r.home_town_id)}</span>)</div>
                    <div style="font-size:11.5px;margin:4px 0"><strong>Niched Story:</strong> ${escapeHtml(r.niched_story)}</div>
                    <div style="font-size:11px;color:#eab308;margin:4px 0"><strong>🌾 Farming Drops:</strong> ${escapeHtml((r.farming_resources || []).join(", "))}</div>
                    <div style="font-size:11px;color:#10b981"><strong>⚡ Racial Trait:</strong> ${escapeHtml(r.combat_trait || "")}</div>
                  </div>
                `).join("")}
              </div>

              <h3 style="margin:12px 0 8px;font-size:1rem">6 Monster-Only Ecology Races (Other Race for Mobs)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:16px">
                ${monsterRaces.map(m => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>👾 ${escapeHtml(m.name)}</strong>
                      <span class="mono" style="font-size:10px;color:#ef4444">Mob Only</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(m.ecological_niche)}</div>
                    <div style="font-size:11px;color:#eab308"><strong>Drops:</strong> ${escapeHtml((m.signature_drops || []).join(", "))}</div>
                  </div>
                `).join("")}
              </div>

              <h3 style="margin:12px 0 8px;font-size:1rem">6 God-Tier Entities (Sealed by The Architect in Chapter 1.4 God Seal Magic)</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px">
                ${godEntities.map(g => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(168,85,247,0.4)">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>✨ ${escapeHtml(g.name)}</strong>
                      <span class="mono" style="font-size:10px;color:#c084fc">${escapeHtml((g.elements || []).join(" / "))}</span>
                    </div>
                    <div style="font-size:11px;color:#38bdf8;margin:4px 0"><strong>Seal Status:</strong> ${escapeHtml(g.seal_state)}</div>
                    <div style="font-size:11px;color:#f87171;margin:4px 0"><strong>Direct MVP Subordinate:</strong> 👑 ${escapeHtml(g.direct_mvp_subordinate)}</div>
                    <div style="font-size:11.5px;color:var(--joy-text-secondary)">${escapeHtml(g.lore_summary)}</div>
                  </div>
                `).join("")}
              </div>
            </section>

            <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
              <div class="mono" style="font-size:11px;color:#eab308">LV.10–20 ALL-RACE CONVERGENCE CITIES · SHARED INSTITUTIONS · QUEST LOOP · BOSS HIERARCHY</div>
              ${(() => {
                const conv = sys.cross_race_convergence_hubs || {};
                const hubs = conv.hubs || [];
                if (!hubs.length) return "";
                return `
                  <div style="margin:8px 0 14px;padding:12px;border-radius:8px;background:rgba(220,38,38,0.10);border:1.5px solid rgba(250,204,21,0.55)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13px;color:#fde047">🤝 Level ${(conv.target_level_band || [10,20]).join("–")} Cross-Race Convergence Hubs (Guilding, Party Matchmaking & Quest Trading)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#dc2626;color:#ffffff">ALL 6 RACES UNITE AT LV.10–20</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:4px 0 10px">${escapeHtml(conv.convergence_rule || "")}</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px">
                      ${hubs.map(h => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                          <div style="font-weight:700;font-size:12px">🏰 ${escapeHtml(h.town_name)}</div>
                          <div class="mono" style="font-size:10px;color:#38bdf8;margin:2px 0 6px">Lv.${(h.level_band || [10,20]).join("–")} · ${escapeHtml(h.district_id)}</div>
                          <div style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">${escapeHtml(h.hub_role)}</div>
                          <ul style="margin:0 0 8px;padding-left:16px;font-size:10.5px;color:#fde68a">
                            ${(h.guilding_and_party_features || []).map(f => `<li>${escapeHtml(f)}</li>`).join("")}
                          </ul>
                          <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(h.continent_id)}', districtId: '${escapeHtml(h.district_id)}', nodeId: '${escapeHtml(h.town_node_id)}', inspectId: '${escapeHtml(h.town_node_id)}' })">
                            🤝 Inspect Convergence Hub (${escapeHtml(h.town_node_id)}) ➔
                          </button>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              })()}

              ${(() => {
                const sp = (DATA && DATA.studioPerspectives) || {};
                const tatlas = sp.tShapedWorldAtlas || {};
                const zdir = tatlas.t_breadth_zone_directory || {};
                const deep = tatlas.t_deep_validation_slice || {};
                const dtown = deep.deep_town || {};
                const dfield = deep.deep_field_zone || {};
                const ddung = deep.deep_dungeon || {};
                const dmobs = deep.deep_mob_database || [];
                if (!tatlas.id) return "";
                return `
                  <div style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.5)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#10b981">🧭 L2J.RU / L2Hub / PMFun Top-Down T-Shaped World Atlas (T-Breadth Directory + T-Depth D01 Slice)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#059669;color:#ffffff;font-weight:800">GOV-10 VERIFIED</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(tatlas.design_philosophy || "")}</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#fde047;font-weight:800">STARTING TOWNS (${(zdir.starting_towns || []).length})</div>
                        ${(zdir.starting_towns || []).map(z => `<div style="font-size:10.5px;margin-top:3px"><strong>${escapeHtml(z.level_header)}</strong> <span class="mono" style="color:#38bdf8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#38bdf8;font-weight:800">CASTLE & HUB TOWNS (${(zdir.other_castle_and_hub_towns || []).length})</div>
                        ${(zdir.other_castle_and_hub_towns || []).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#94a3b8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#4ade80;font-weight:800">FIELDS & AREAS (${(zdir.fields_and_hunting_areas || []).length})</div>
                        ${(zdir.fields_and_hunting_areas || []).slice(0, 8).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#94a3b8">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                      <div style="padding:8px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800">DUNGEONS & CATACOMBS (${(zdir.regular_dungeons || []).length + (zdir.seven_signs_seal_catacombs || []).length})</div>
                        ${(zdir.regular_dungeons || []).slice(0, 5).concat((zdir.seven_signs_seal_catacombs || []).slice(0, 3)).map(z => `<div style="font-size:10.5px;margin-top:3px">${escapeHtml(z.level_header)} <span class="mono" style="color:#c084fc">[${escapeHtml(z.grid_sector)}]</span></div>`).join("")}
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#fde047;margin:10px 0 6px">🗺️ Authentic L2J.RU / L2Hub / PMFun Top-Down Cartographic Plates (Interlaced Grid + Parchment Relief + Enlarged Dual Zone & Dungeon Maps)</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:#1a140c;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10.5px;color:#f3dfa5;font-weight:800;margin-bottom:4px">1. Master Interlaced World Grid [10.10–26.25] (all_interlaced.jpg Standard)</div>
                        <img src="/studio-maps/all_interlaced_world_grid.png" alt="Interlaced World Grid" style="width:100%;height:auto;border-radius:6px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#1a140c;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10.5px;color:#f3dfa5;font-weight:800;margin-bottom:4px">2. Continent Antique Parchment Relief Map (c3_aden.jpg Standard · 48 Landmarks)</div>
                        <img src="/studio-maps/c3_continent_parchment_relief.png" alt="Parchment Relief Map" style="width:100%;height:auto;border-radius:6px;border:1px solid #5d4127;display:block"/>
                      </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#fde047;font-weight:800;margin-bottom:4px">3A. Field Common Map (zone_map_enlarged · 185 Red Pins)</div>
                        <img src="/studio-maps/d01_field_common_map.png" alt="Field Common Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;margin-bottom:6px;display:block"/>
                        <div class="mono" style="font-size:10px;color:#38bdf8;font-weight:800;margin-bottom:4px">3B. Field Orthographic Radar Map (zone_map_enlarged_radar)</div>
                        <img src="/studio-maps/d01_field_radar_map.png" alt="Field Radar Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800;margin-bottom:4px">4A. Kiln Cellar Ruins Common Strip (Elven Ruins id=53)</div>
                        <img src="/studio-maps/d01_dungeon_common_map.png" alt="Dungeon Common Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;margin-bottom:6px;display:block"/>
                        <div class="mono" style="font-size:10px;color:#f87171;font-weight:800;margin-bottom:4px">4B. Underground 8-Room Stone Labyrinth Radar Blueprint</div>
                        <img src="/studio-maps/d01_dungeon_radar_map.png" alt="Dungeon Radar Map" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                      <div style="padding:8px;border-radius:8px;background:#241a0e;border:1.5px solid #d0a559">
                        <div class="mono" style="font-size:10px;color:#4ade80;font-weight:800;margin-bottom:4px">5. Lantern Hollow Village Blueprint (PMFun Detailed Town Map)</div>
                        <img src="/studio-maps/d01_town_detailed_blueprint.png" alt="Town Detailed Blueprint" style="width:100%;height:auto;border-radius:4px;border:1px solid #5d4127;display:block"/>
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#10b981;margin-bottom:6px">T-Depth Vertical Validation Slice (100% L2J.RU Dual-Map + 8-Column Spawn Table + Mob Drop/Spoil Sheets)</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px">
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(250,204,21,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#fde047">🏰 ${escapeHtml(dtown.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(dtown.grid_sector || "")} · loc=${escapeHtml(dtown.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">${(dtown.town_landmarks || []).length} landmarks · ${(dtown.gatekeeper_routes || []).length} Gatekeeper routes · ${(dtown.npc_and_guard_table || []).length} NPC/Guard rows</div>
                      </div>
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(74,222,128,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#4ade80">🌿 ${escapeHtml(dfield.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(dfield.grid_sector || "")} · loc=${escapeHtml(dfield.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">Dual Parchment + Radar Map · ${(dfield.spawn_table || []).length} L2J 8-column spawn rows</div>
                      </div>
                      <div style="padding:9px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid rgba(248,113,113,0.45)">
                        <div style="font-weight:800;font-size:11.5px;color:#f87171">⛩️ ${escapeHtml(ddung.header_title || "")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8">Grid ${escapeHtml(ddung.grid_sector || "")} · loc=${escapeHtml(ddung.loc_coord || "")}</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:4px">Side-by-Side Entrance + 4-Room Underground Map · ${(ddung.spawn_table || []).length} spawn rows · ${dmobs.length} Mob Drop/Spoil Sheets</div>
                      </div>
                    </div>
                  </div>
                `;
              })()}
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:8px;margin-bottom:14px">
                <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                  <div style="font-weight:700;font-size:13px">🛡️ ${escapeHtml(guild.name || "Adventure Guild")} (<span class="mono">${escapeHtml(guild.allegiance || "neutral_no_side")}</span>)</div>
                  <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:6px 0">${escapeHtml(guild.neutrality_charter || "")}</p>
                  <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--joy-text-secondary)">
                    ${(guild.core_services || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                  </ul>
                </div>
                <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                  <div style="font-weight:700;font-size:13px">⚒️ ${escapeHtml(smith.name || "Blacksmith Clan")}</div>
                  <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:6px 0">${escapeHtml(smith.core_role || "")}</p>
                  <ul style="margin:0;padding-left:16px;font-size:11px;color:var(--joy-text-secondary)">
                    ${(smith.forging_systems || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}
                  </ul>
                </div>
              </div>

              <h4 style="margin:10px 0 6px;font-size:0.95rem">📜 3-Track Quest Progression Loop (Main + Job + Side Quests)</h4>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
                ${(qloop.tracks || []).map(t => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                    <div style="font-weight:700;font-size:12px">${escapeHtml(t.name)}</div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(t.purpose)}</div>
                    <div style="font-size:10.5px;color:#10b981"><strong>Rewards:</strong> ${escapeHtml(t.reward_focus)}</div>
                  </div>
                `).join("")}
              </div>

              <h4 style="margin:10px 0 6px;font-size:0.95rem">👑 Strict Boss Power Hierarchy: <span class="mono" style="color:#f87171">${escapeHtml(bhier.strict_order_law || "")}</span></h4>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-bottom:16px">
                ${(bhier.tiers || []).map(bt => `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="font-weight:700;font-size:12px">Rank ${bt.rank} · ${escapeHtml(bt.name)}</div>
                    <div style="font-size:11px;color:var(--joy-text-secondary);margin:4px 0">${escapeHtml(bt.power_relationship)}</div>
                    <div style="font-size:10.5px;color:#eab308"><strong>Loot:</strong> ${escapeHtml(bt.loot_tier)}</div>
                  </div>
                `).join("")}
              </div>

              ${(() => {
                const lgp = sys.level_growth_path || {};
                const phases = lgp.phases || [];
                const deep = lgp.early_focus_1_to_25_deep_dive || {};
                if (!phases.length) return "";
                return `
                  <div style="padding:14px;border-radius:10px;background:rgba(16,185,129,0.08);border:1.5px solid rgba(16,185,129,0.45)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#10b981">📈 Level 1–99 Growth Path (Stages A–L) · Priority Focus: Levels 1–25 (Stages A, B, C)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#10b981;color:#052e16;font-weight:800">LV. 1–25 FOCUS</span>
                    </div>
                    <div class="mono" style="font-size:11px;color:#fde047;margin-bottom:8px">${escapeHtml(lgp.path_formula || "")}</div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 12px">${escapeHtml(deep.summary || "")}</p>
                    ${phases.map(ph => `
                      <div style="margin-bottom:10px">
                        <div style="font-weight:800;font-size:12px;color:#38bdf8;margin-bottom:6px">${escapeHtml(ph.name)}</div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
                          ${(ph.segments || []).map(seg => `
                            <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid ${seg.priority_focus ? "#10b981" : "var(--joy-border-default)"}">
                              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                                <strong>[${escapeHtml(seg.segment_code)}] Lv.${(seg.level_range || []).join("–")}</strong>
                                <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:999px;background:${seg.priority_focus ? "rgba(16,185,129,0.22)" : "rgba(148,163,184,0.16)"};color:${seg.priority_focus ? "#10b981" : "#94a3b8"}">${seg.priority_focus ? "LV.1–25 FOCUS" : "ROADMAP"}</span>
                              </div>
                              <div style="font-size:11.5px;font-weight:700;margin:4px 0">${escapeHtml(seg.title)}</div>
                              <div style="font-size:10.5px;color:var(--joy-text-secondary)"><strong>Class:</strong> ${escapeHtml(seg.class_milestone)}</div>
                              <div style="font-size:10.5px;color:#38bdf8"><strong>Quest:</strong> ${escapeHtml(seg.adventure_quest_tier)}</div>
                              <div style="font-size:10.5px;color:#eab308"><strong>Equip:</strong> ${escapeHtml(seg.equipment_unlock)}</div>
                              <div style="font-size:10.5px;color:#10b981"><strong>Skills:</strong> ${escapeHtml(seg.skill_unlocks)}</div>
                              <div style="font-size:10.5px;color:#c084fc"><strong>Items:</strong> ${escapeHtml(seg.consumable_unlocks)}</div>
                              <div style="font-size:10.5px;color:#f87171"><strong>Boss:</strong> ${escapeHtml(seg.boss_milestone)}</div>
                            </div>
                          `).join("")}
                        </div>
                      </div>
                    `).join("")}
                  </div>
                `;
              })()}

              ${(() => {
                const wcmc = sys.world_continent_map_chain || {};
                const ef = wcmc.early_focus_hub_and_spoke_1_to_25 || {};
                const spokes = ef.stage_a_spokes_1_to_10 || [];
                const sb = ef.stage_b_convergence_hub_10_to_20 || {};
                const sc = ef.stage_c_boss_and_bridge_20_to_25 || {};
                const sd = ef.stage_d_trial_frontier_25_to_30 || {};
                const cchains = wcmc.continent_chains || [];
                const bridges = wcmc.inter_continent_bridges || [];
                if (!spokes.length) return "";
                return `
                  <div style="margin-top:14px;padding:14px;border-radius:10px;background:rgba(56,189,248,0.08);border:1.5px solid rgba(56,189,248,0.45)">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
                      <strong style="font-size:13.5px;color:#38bdf8">🗺️ World Continent Area Map Chain (Lv. 1–25 Hub-and-Spoke ➔ 3-Continent 64-Map Chain)</strong>
                      <span class="mono" style="font-size:10px;padding:2px 8px;border-radius:999px;background:#0284c7;color:#ffffff;font-weight:800">GOV-09 VERIFIED</span>
                    </div>
                    <p style="font-size:11.5px;color:var(--joy-text-secondary);margin:0 0 10px">${escapeHtml(wcmc.chain_architecture_law || "")}</p>
                    <div style="font-weight:800;font-size:12px;color:#fde047;margin-bottom:6px">Stage A (Lv. 1–10) · 6 Racial Starter Spokes ➔ Open-Portal Route into Kilnwatch Bastion (Stage B Lv. 10–20)</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:8px;margin-bottom:12px">
                      ${spokes.map(sp => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                            <strong>🧬 ${escapeHtml(sp.race_name)}</strong>
                            <span class="mono" style="font-size:9.5px;color:#38bdf8">${escapeHtml(sp.district_id)}</span>
                          </div>
                          <div style="font-size:10.5px;color:var(--joy-text-secondary);margin:4px 0">
                            <strong>Home:</strong> <span class="mono">${escapeHtml(sp.home_town_id)}</span> · <strong>Hunt:</strong> <span class="mono">${escapeHtml(sp.hunting_node_id)}</span> · <strong>Catacomb:</strong> <span class="mono">${escapeHtml(sp.tutorial_catacomb_id)}</span>
                          </div>
                          <div class="mono" style="font-size:10px;color:#10b981;line-height:1.45;background:rgba(15,23,42,0.55);padding:6px;border-radius:6px">
                            ${(sp.portal_chain_to_kilnwatch || []).map(n => escapeHtml(n)).join(" ➔ ")}
                          </div>
                        </div>
                      `).join("")}
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px;margin-bottom:12px">
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(250,204,21,0.55)">
                        <div style="font-weight:800;font-size:11.5px;color:#fde047">🤝 Stage B (Lv. 10–20) · Convergence Hub (${escapeHtml(sb.hub_town_id || "")})</div>
                        <div style="font-size:10.5px;color:var(--joy-text-secondary);margin:4px 0"><strong>Party Grounds:</strong> ${(sb.connected_party_hunting_grounds || []).map(escapeHtml).join(", ")}</div>
                        <div style="font-size:10.5px;color:#c084fc"><strong>Catacombs:</strong> ${(sb.connected_catacomb_dungeons || []).map(escapeHtml).join(", ")}</div>
                      </div>
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(248,113,113,0.5)">
                        <div style="font-weight:800;font-size:11.5px;color:#f87171">⚔️ Stage C (Lv. 20–25) · Raid Boss & Continental Bridge</div>
                        <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:4px 0"><strong>West Raid:</strong> ${(sc.west_river_raid_branch || []).map(escapeHtml).join(" ➔ ")}</div>
                        <div class="mono" style="font-size:10px;color:#38bdf8"><strong>East Bridge:</strong> ${(sc.east_continental_bridge_branch || []).map(escapeHtml).join(" ➔ ")}</div>
                      </div>
                      <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid rgba(168,85,247,0.5)">
                        <div style="font-weight:800;font-size:11.5px;color:#c084fc">⚙️ Stage D (Lv. 25–30) · Prepare 2nd Class [Learn & Try]</div>
                        <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin:4px 0">${(sd.portal_chain || []).map(escapeHtml).join(" ➔ ")}</div>
                      </div>
                    </div>
                    <div style="font-weight:800;font-size:12px;color:#38bdf8;margin-bottom:6px">Full 3-Continent Mainline Node Chains (64 Overland Maps + Inter-Continent Bridges)</div>
                    <div style="display:grid;grid-template-columns:1fr;gap:8px">
                      ${cchains.map(cc => `
                        <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                          <div style="display:flex;justify-content:space-between;align-items:center">
                            <strong>🌍 ${escapeHtml(cc.continent_name)} (<span class="mono">${escapeHtml(cc.continent_id)}</span>)</strong>
                            <span class="mono" style="font-size:10px;color:#eab308">Lv.${(cc.level_band || []).join("–")} · Stages ${(cc.growth_stages || []).join(", ")} · ${(cc.ordered_mainline_node_chain || []).length} maps</span>
                          </div>
                          <div style="font-size:11px;color:var(--joy-text-secondary);margin:3px 0">${escapeHtml(cc.topology_pattern || "")}</div>
                          <div class="mono" style="font-size:10px;color:#93c5fd;line-height:1.45;background:rgba(15,23,42,0.55);padding:6px;border-radius:6px">
                            ${(cc.ordered_mainline_node_chain || []).map(escapeHtml).join(" ➔ ")}
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              })()}
            </section>
          `;
        })()}
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(whc.name || '')}</h3>
        ${renderStatusBadgeHtml(whc.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(whc.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(whc)}
        <div style="margin-top:14px;padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:10.5px;color:#10b981;font-weight:700;margin-bottom:6px">LONG-TERM GOVERNANCE CHECKLIST (GOV-01..GOV-06)</div>
          ${(whc.long_term_governance_checklist || []).map(g => `
            <div style="padding:8px;border-radius:6px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);margin-bottom:6px;font-size:11px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong>${escapeHtml(g.gate_id)} · ${escapeHtml(g.title)}</strong>
                <span class="mono" style="font-size:10px;padding:1px 6px;border-radius:999px;background:${g.verified ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"};color:${g.verified ? "#10b981" : "#ef4444"}">${g.verified ? "PASS" : "CHECK"}</span>
              </div>
              <div style="color:var(--joy-text-secondary);font-size:10.5px;margin:3px 0">${escapeHtml(g.evidence)}</div>
              <div class="mono" style="font-size:9.5px;color:#38bdf8">${escapeHtml(g.cli_command)}</div>
            </div>
          `).join("")}
        </div>
      </aside>
      ` : ''}
    </div>
  `;
}

function renderStudioContinentPerspective(whc, continents, districts, activeContinent) {
  const filteredContinents = continents.filter(c => STUDIO_STATUS_FILTER === 'all' || c.status === STUDIO_STATUS_FILTER);
  const childDistricts = districts.filter(d => d.parent_continent_id === activeContinent.id);
  const causes = activeContinent.parent_world_history_causes || {};

  return `
    ${renderContinentBigPictureSvg(continents, districts, activeContinent)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 2 · CONTINENT MACRO ATLAS</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeContinent.name || '')}</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${filteredContinents.map(c => `
                <button type="button" class="joy-button ${c.id === activeContinent.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('continent', { continentId: '${escapeHtml(c.id)}', inspectId: '${escapeHtml(c.id)}' })">
                  ${escapeHtml(c.name)} (${escapeHtml(c.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>Parent World History Scar Provenance</strong>
              ${renderStatusBadgeHtml(activeContinent.status)}
            </div>
            <div style="font-size:12px;margin-bottom:4px"><strong>Core Rationale:</strong> ${escapeHtml(activeContinent.core_rationale || '')}</div>
            <div style="font-size:12px;color:var(--joy-text-secondary)"><strong>Causal Summary:</strong> ${escapeHtml(causes.causal_summary || '')} (Scars: ${escapeHtml((causes.war_scar_ids || []).join(', '))})</div>
          </div>

          ${activeContinent.status === 'mystery' && activeContinent.mystery_hook ? `
            <div style="padding:16px;border-radius:10px;background:rgba(168,85,247,0.12);border:1px dashed rgba(168,85,247,0.55);margin-bottom:14px">
              <div style="font-weight:700;font-size:13px;color:#c084fc;margin-bottom:6px">🌫️ Intentional Mystery / Fog of Lore Continent</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>In-World Rumor:</strong> ${escapeHtml(activeContinent.mystery_hook.in_world_rumor)}</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>Visual Silhouette:</strong> ${escapeHtml(activeContinent.mystery_hook.visual_silhouette)}</div>
              <div style="font-size:12px"><strong>Unanswered Question:</strong> ${escapeHtml(activeContinent.mystery_hook.unanswered_question)}</div>
            </div>
          ` : `
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px">
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">CLIMATE AND LEVEL BAND</div>
                <div style="font-size:12px;font-weight:700;margin-top:4px">Levels ${(activeContinent.level_band || {}).min_level || 1} to ${(activeContinent.level_band || {}).max_level || 15}</div>
                <div style="font-size:12px;margin-top:4px">${escapeHtml((activeContinent.climate_profile || {}).macro_biome || '')}</div>
                <div style="font-size:11px;color:var(--joy-text-secondary);margin-top:4px">Skybox: ${escapeHtml((activeContinent.climate_profile || {}).skybox_palette || '')}</div>
              </div>
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">90 TO 120 CENTIMETER ARCHITECTURE ADAPTATION</div>
                <div style="font-size:12px;font-weight:700;margin-top:4px">${escapeHtml((activeContinent.civilization_style || {}).architecture_motif || '')}</div>
                <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-top:4px">${escapeHtml((activeContinent.civilization_style || {}).character_scale_adaptation || '')}</div>
              </div>
            </div>
          `}

          <h3 style="margin:0 0 8px;font-size:1rem">Child Districts in ${escapeHtml(activeContinent.name || '')}</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px">
            ${childDistricts.length ? childDistricts.map(d => `
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <strong>${escapeHtml(d.name)}</strong>
                  ${renderStatusBadgeHtml(d.status)}
                </div>
                <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-bottom:6px">${escapeHtml(d.level_band_label || '')} · Families: ${escapeHtml((d.ecological_monster_families || []).join(', '))}</div>
                <div style="font-size:12px;margin-bottom:8px">${escapeHtml(d.core_rationale)}</div>
                <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(activeContinent.id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' })">
                  Drill into District ${escapeHtml(d.name)} ➔
                </button>
              </div>
            `).join('') : '<div style="padding:12px;color:var(--joy-text-secondary);font-size:12px">No child Districts required while Continent status is Mystery (Fog of Lore).</div>'}
          </div>
        </section>
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeContinent.name || '')}</h3>
        ${renderStatusBadgeHtml(activeContinent.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeContinent.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeContinent)}
      </aside>
    </div>
  `;
}

function computeStudioElementalModifiers(elementName) {
  const el = (elementName || 'Neutral');
  const table = {
    Fire:    { Neutral: 100, Water: 150, Earth: 90,  Fire: 25,  Wind: 100, Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Earth:   { Neutral: 100, Water: 100, Earth: 25,  Fire: 150, Wind: 90,  Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Wind:    { Neutral: 100, Water: 90,  Earth: 150, Fire: 100, Wind: 25,  Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Water:   { Neutral: 100, Water: 25,  Earth: 100, Fire: 90,  Wind: 150, Poison: 100, Holy: 100, Shadow: 100, Ghost: 100, Undead: 100 },
    Shadow:  { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50,  Holy: 150, Shadow: 0,   Ghost: 100, Undead: 0   },
    Holy:    { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 0,   Shadow: 150, Ghost: 100, Undead: 150 },
    Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Shadow: 100, Ghost: 70,  Undead: 100 }
  };
  return table[el] || table.Neutral;
}

function renderStudioDistrictPerspective(activeContinent, districts, nodes, activeDistrict) {
  const filteredDistricts = districts.filter(d => STUDIO_STATUS_FILTER === 'all' || d.status === STUDIO_STATUS_FILTER);
  const districtNodes = nodes
    .filter(n => n.parent_district_id === activeDistrict.id)
    .filter(n => STUDIO_STATUS_FILTER === 'all' || n.status === STUDIO_STATUS_FILTER);
  const allDistrictNodes = nodes.filter(n => n.parent_district_id === activeDistrict.id);
  const nodeById = {};
  allDistrictNodes.forEach(n => { nodeById[n.id] = n; });

  const levelBands = [
    'Levels 1 to 20',
    'Levels 21 to 40',
    'Levels 41 to 60',
    'Levels 61 to 80',
    'Levels 81 to 100'
  ];

  // Collect all monsters across this district's child nodes
  const monsterCatalogMap = {};
  allDistrictNodes.forEach(n => {
    (n.resident_spawns || []).forEach(sp => {
      if (!monsterCatalogMap[sp.monster_id]) {
        monsterCatalogMap[sp.monster_id] = {
          ...sp,
          habitats: []
        };
      }
      monsterCatalogMap[sp.monster_id].habitats.push({
        node_id: n.id,
        node_name: n.name,
        grid_coordinates: n.grid_coordinates || [0, 0],
        spawn_count: sp.spawn_count,
        respawn_seconds: sp.respawn_seconds
      });
    });
  });
  const districtMonsters = Object.values(monsterCatalogMap);
  if (!STUDIO_PINNED_MONSTER_ID && districtMonsters.length > 0) {
    STUDIO_PINNED_MONSTER_ID = districtMonsters[0].monster_id;
  }

  const cols = (activeDistrict.grid_dimensions && activeDistrict.grid_dimensions.columns) || 3;
  const rows = (activeDistrict.grid_dimensions && activeDistrict.grid_dimensions.rows) || 3;
  const portalEdges = activeDistrict.portal_edges || [];

  // Build 2D matrix cells [col, row]
  const matrixCellsHtml = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellNodes = districtNodes.filter(n => {
        const coords = n.grid_coordinates || [0, 0];
        return coords[0] === c && coords[1] === r;
      });
      if (cellNodes.length === 0) {
        matrixCellsHtml.push(`
          <div style="min-height:190px;padding:12px;border-radius:10px;background:rgba(15,23,42,0.35);border:1px dashed var(--joy-border-subtle);display:flex;flex-direction:column;justify-content:center;align-items:center;color:var(--joy-text-muted);font-size:11px">
            <span class="mono">[Column ${c}, Row ${r}]</span>
            <span style="margin-top:4px">Unassigned Frontier Cell</span>
          </div>
        `);
      } else {
        const cardsHtml = cellNodes.map(n => {
          const isMystery = n.status === 'mystery';
          const thumb = (n.terrain_tile && n.terrain_tile.preview_thumbnail) || '/thumbs/nature/pine_tree_1.webp';
          const spawns = n.resident_spawns || [];
          const pinnedSpawn = spawns.find(sp => sp.monster_id === STUDIO_PINNED_MONSTER_ID);
          const connectedEdges = portalEdges.filter(e => e.from_node_id === n.id || e.to_node_id === n.id);
          const typeLabel = n.node_type === 'town' ? '🏰 Town' : (n.node_type === 'dungeon' ? '💀 Dungeon (Floor ' + (n.floor_index || -1) + ')' : '🌿 Hunting Area');

          return `
            <div style="padding:12px;border-radius:10px;background:var(--joy-surface-sunken);border:2px ${pinnedSpawn ? 'solid #ffd166' : (isMystery ? 'dashed rgba(168,85,247,0.65)' : 'solid var(--joy-border-default)')};margin-bottom:${cellNodes.length > 1 ? '8px' : '0'};position:relative">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px">
                <span class="mono" style="font-size:10.5px;color:var(--joy-text-secondary)">[${c}, ${r}] · ${typeLabel}</span>
                ${renderStatusBadgeHtml(n.status)}
              </div>
              <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
                <div style="width:52px;height:52px;border-radius:8px;background:var(--joy-surface-card);border:1px solid var(--joy-border-subtle);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                  ${isMystery
                    ? '<span style="font-size:22px">🌫️</span>'
                    : `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(n.name)}" style="width:46px;height:46px;object-fit:contain" />`}
                </div>
                <div style="min-width:0;flex:1">
                  <div style="font-weight:800;font-size:13.5px;color:var(--joy-text-primary)">${escapeHtml(n.name)}</div>
                  <div class="mono" style="font-size:11px;color:#ffd166">Levels ${(n.level_range || [1, 1]).join(' to ')}</div>
                  ${pinnedSpawn ? `
                    <div style="margin-top:3px;display:inline-block;padding:2px 7px;border-radius:999px;background:rgba(255,209,102,0.2);border:1px solid #ffd166;color:#ffd166;font-size:10.5px;font-weight:700">
                      📌 Pinned: ${escapeHtml(pinnedSpawn.monster_name)} ×${pinnedSpawn.spawn_count}
                    </div>
                  ` : ''}
                </div>
              </div>

              <div style="font-size:11.5px;color:var(--joy-text-secondary);margin-bottom:8px;line-height:1.4">
                ${escapeHtml(n.core_rationale || '')}
              </div>

              ${isMystery && n.mystery_hook ? `
                <div style="padding:8px;border-radius:6px;background:rgba(168,85,247,0.14);border:1px solid rgba(168,85,247,0.4);font-size:11px;margin-bottom:8px">
                  <div><strong>🌫️ Fog of Lore Rumor:</strong> ${escapeHtml(n.mystery_hook.in_world_rumor)}</div>
                </div>
              ` : ''}

              ${spawns.length > 0 ? `
                <div style="margin-bottom:8px">
                  <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">RESIDENT MONSTERS (${spawns.length}):</div>
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    ${spawns.map(sp => `
                      <button type="button" class="joy-button ${STUDIO_PINNED_MONSTER_ID === sp.monster_id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', monsterId: '${escapeHtml(sp.monster_id)}', inspectId: '${escapeHtml(n.id)}' })">
                        ${escapeHtml(sp.monster_name)} (Level ${sp.level} · ×${sp.spawn_count})
                      </button>
                    `).join('')}
                  </div>
                </div>
              ` : (n.node_type === 'town' ? `<div class="mono" style="font-size:10.5px;color:#34d399;margin-bottom:8px">🛡️ Peaceful Safe Zone (Zero Hostile Spawns)</div>` : '')}

              <div style="margin-bottom:8px">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-bottom:4px">DIRECTIONAL PORTAL BRIDGES (${connectedEdges.length}):</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  ${connectedEdges.map(edge => {
                    const isFrom = edge.from_node_id === n.id;
                    const dir = isFrom ? edge.from_direction : edge.to_direction;
                    const targetId = isFrom ? edge.to_node_id : edge.from_node_id;
                    const targetNode = nodeById[targetId] || { name: targetId };
                    const isFog = edge.gate_state === 'fog_of_lore';
                    return `
                      <span class="mono" style="font-size:10px;padding:2px 6px;border-radius:4px;cursor:pointer;background:${isFog ? 'rgba(168,85,247,0.18)' : 'var(--joy-surface-card)'};border:1px solid ${isFog ? 'rgba(168,85,247,0.5)' : 'var(--joy-border-subtle)'};color:${isFog ? '#c084fc' : 'var(--joy-text-primary)'}" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(targetId)}', inspectId: '${escapeHtml(targetId)}' })" title="${escapeHtml(edge.lock_reason || ('Road width ' + edge.road_width_meters + ' meters'))}">
                        ${escapeHtml(dir)} ➔ ${escapeHtml(targetNode.name)} ${isFog ? '(Fog of Lore)' : ''}
                      </span>
                    `;
                  }).join('')}
                </div>
              </div>

              <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', monsterId: '${escapeHtml((spawns[0] && spawns[0].monster_id) || '')}', inspectId: '${escapeHtml(n.id)}' })">
                Inspect ${escapeHtml(n.name)} ➔
              </button>
            </div>
          `;
        }).join('');
        matrixCellsHtml.push(`<div>${cardsHtml}</div>`);
      }
    }
  }

  return `
    ${renderDistrictBigPictureSvg(activeContinent, activeDistrict, allDistrictNodes)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <!-- Maxion Level-Band Tabs & Monster Pinning Toolbar -->
        <section class="panel" style="padding:14px 18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary)">MAXION LEVEL-BAND MONSTER PINNING:</span>
              ${levelBands.map(lb => `
                <button type="button" class="joy-button ${STUDIO_LEVEL_BAND === lb ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { districtId: '${escapeHtml(activeDistrict.id)}', levelBand: '${escapeHtml(lb)}' })">
                  <span>${escapeHtml(lb)}</span>
                  ${lb === activeDistrict.level_band_label ? '<span class="mono" style="font-size:9.5px;margin-left:4px;color:#ffd166">● ACTIVE</span>' : ''}
                </button>
              `).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ECOLOGICAL MONSTER FAMILIES:</span>
              ${(activeDistrict.ecological_monster_families || []).map(fam => `
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(fam)}</span>
              `).join('')}
            </div>
          </div>

          <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:8px">
            CLICK MONSTER TO PIN SPAWNS ON GRID (${districtMonsters.length})
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
            ${districtMonsters.length ? districtMonsters.map(mob => {
              const isPinned = STUDIO_PINNED_MONSTER_ID === mob.monster_id;
              const totalSpawns = mob.habitats.reduce((acc, h) => acc + (h.spawn_count || 0), 0);
              return `
                <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1.5px solid ${isPinned ? '#ffd166' : 'var(--joy-border-default)'};cursor:pointer" onclick="setStudioPerspective('district', { districtId: '${escapeHtml(activeDistrict.id)}', pinnedMonsterId: '${escapeHtml(mob.monster_id)}' })">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                    <strong style="font-size:12.5px;color:${isPinned ? '#ffd166' : 'var(--joy-text-primary)'}">${isPinned ? '📌 ' : ''}${escapeHtml(mob.monster_name)}</strong>
                    <span class="joy-badge joy-badge--brand joy-badge--sm">Level ${mob.level}</span>
                  </div>
                  <div class="mono" style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:3px">
                    ${escapeHtml(mob.element)} · ${escapeHtml(mob.size)} · ${escapeHtml(mob.race)} (${escapeHtml(mob.family)})
                  </div>
                  <div style="font-size:11px;color:#34d399;margin-top:4px">
                    Spawns: ×${totalSpawns} across ${mob.habitats.map(h => h.node_name).join(', ')}
                  </div>
                  <div style="margin-top:6px">
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="event.stopPropagation();setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(mob.habitats[0].node_id)}', monsterId: '${escapeHtml(mob.monster_id)}', inspectId: '${escapeHtml(mob.habitats[0].node_id)}' })">
                      Open Monster/1035 Sheet ➔
                    </button>
                  </div>
                </div>
              `;
            }).join('') : '<div style="font-size:11.5px;color:var(--joy-text-secondary)">Select a District with Canon/Draft child hunting areas to pin monster spawns.</div>'}
          </div>
        </section>

        <!-- District 2D Connected Map Matrix -->
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 3 · DISTRICT ORTHOGONAL CONNECTED MAP MATRIX (${escapeHtml(activeDistrict.level_band_label || '')})</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeDistrict.name || '')} (${cols} × ${rows} Connected Grid)</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${filteredDistricts.map(d => `
                <button type="button" class="joy-button ${d.id === activeDistrict.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('district', { continentId: '${escapeHtml(d.parent_continent_id)}', districtId: '${escapeHtml(d.id)}', inspectId: '${escapeHtml(d.id)}' })">
                  ${escapeHtml(d.name)} (${escapeHtml(d.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:10px 12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px;font-size:12px">
            <div><strong>Core Rationale:</strong> ${escapeHtml(activeDistrict.core_rationale || '')}</div>
            <div style="margin-top:4px;color:var(--joy-text-secondary)"><strong>Local Conflict:</strong> ${escapeHtml(activeDistrict.local_conflict || '')}</div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(${cols}, minmax(0, 1fr));gap:12px;margin-bottom:16px">
            ${matrixCellsHtml.join('')}
          </div>

        <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
          <div class="mono" style="font-size:11px;font-weight:700;margin-bottom:8px">SYMMETRIC PORTAL EDGE TOPOLOGY (${portalEdges.length} BRIDGES)</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">
            ${portalEdges.map(edge => `
              <div style="padding:8px 10px;border-radius:6px;background:var(--joy-surface-card);border:1px solid ${edge.gate_state === 'fog_of_lore' ? 'rgba(168,85,247,0.5)' : 'var(--joy-border-subtle)'};font-size:11.5px">
                <div style="font-weight:700">${escapeHtml(edge.from_node_id)} (${escapeHtml(edge.from_direction)}) ⇄ ${escapeHtml(edge.to_node_id)} (${escapeHtml(edge.to_direction)})</div>
                <div class="mono" style="font-size:10.5px;color:var(--joy-text-secondary);margin-top:3px">
                  Gate: ${escapeHtml(edge.gate_state)} · Road Width: ${edge.road_width_meters} meters
                </div>
                ${edge.lock_reason ? `<div style="font-size:11px;color:#c084fc;margin-top:3px">🌫️ ${escapeHtml(edge.lock_reason)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        </section>
      </div>

      <!-- Right Column: Core Rationale & Five-Pillar Quality Checklist Drawer -->
      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeDistrict.name || '')}</h3>
        ${renderStatusBadgeHtml(activeDistrict.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeDistrict.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeDistrict)}
      </aside>
    </div>
  `;
}

function renderStudioTownOrHuntingAreaPerspective(activeDistrict, nodes, activeNode) {
  const districtNodes = nodes
    .filter(n => n.parent_district_id === activeDistrict.id)
    .filter(n => STUDIO_STATUS_FILTER === 'all' || n.status === STUDIO_STATUS_FILTER);
  const isMystery = activeNode.status === 'mystery';
  const tile = activeNode.terrain_tile || {};
  const dims = tile.dimensions_meters || { width: 4000, height: 4000 };
  const portals = activeNode.portals || {};
  const portalDirs = ['North', 'South', 'East', 'West', 'Dungeon', 'Exit'];
  const kit = activeNode.asset_kit_bindings || {};
  const spawns = activeNode.resident_spawns || [];

  // Select active monster for Monster/1035 detail inspector
  let activeMonster = spawns.find(sp => sp.monster_id === STUDIO_SELECTED_MONSTER_ID) || spawns[0] || null;
  if (!activeMonster) {
    // Fallback to first monster in the district so Town viewers can also inspect nearby District fauna if desired
    for (const dn of nodes.filter(x => x.parent_district_id === activeDistrict.id)) {
      if ((dn.resident_spawns || []).length > 0) {
        activeMonster = dn.resident_spawns[0];
        break;
      }
    }
  }

  let monsterDetailHtml = '';
  if (activeMonster) {
    const lv = activeMonster.level || 1;
    const hp = lv * 68 + 45;
    const hitFlee = `${100 + lv * 3} / ${95 + lv * 2}`;
    const baseJobExp = `${lv * 24} / ${lv * 16}`;
    const elemMods = computeStudioElementalModifiers(activeMonster.element);
    const elemOrder = ['Neutral', 'Water', 'Earth', 'Fire', 'Wind', 'Poison', 'Holy', 'Shadow', 'Ghost', 'Undead'];
    const card = activeMonster.monster_card_drop || {};

    monsterDetailHtml = `
      <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div>
            <div class="mono" style="font-size:11px;color:#38bdf8">MAXION MONSTER/1035 DETAIL INSPECTOR</div>
            <h3 style="margin:2px 0 0;font-size:1.15rem">${escapeHtml(activeMonster.monster_name)} (${escapeHtml(activeMonster.monster_id)})</h3>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${spawns.map(sp => `
              <button type="button" class="joy-button ${sp.monster_id === activeMonster.monster_id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(activeNode.id)}', monsterId: '${escapeHtml(sp.monster_id)}', inspectId: '${escapeHtml(activeNode.id)}' })">
                ${escapeHtml(sp.monster_name)} (Level ${sp.level})
              </button>
            `).join('')}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:192px 1fr;gap:16px;align-items:start">
          <!-- 192x192 Portrait Stage -->
          <div style="width:192px;height:192px;border-radius:12px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;text-align:center">
            <img src="/thumbs/creatures/${escapeHtml(activeMonster.monster_id)}.webp" alt="${escapeHtml(activeMonster.monster_name)}" style="width:112px;height:112px;object-fit:contain;margin-bottom:8px" />
            <div style="font-weight:800;font-size:12px">${escapeHtml(activeMonster.monster_name)}</div>
            <div class="mono" style="font-size:10px;color:#ffd166">Spawn ×${activeMonster.spawn_count} · Every ${activeMonster.respawn_seconds}s</div>
          </div>

          <div style="display:flex;flex-direction:column;gap:12px">
            <!-- 4 Property Pills -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ELEMENT</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.element)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">SIZE</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.size)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">RACE</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.race)}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">ECOLOGY FAMILY</div>
                <div style="font-weight:800;font-size:13px;margin-top:2px">${escapeHtml(activeMonster.family)}</div>
              </div>
            </div>

            <!-- 4 Stat Boxes: Level, Health Points, Hit and Flee, Base and Job Experience -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">LEVEL</div>
                <div class="mono" style="font-weight:800;font-size:13px;color:#ffd166;margin-top:2px">Level ${lv}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">HEALTH POINTS</div>
                <div class="mono" style="font-weight:800;font-size:13px;color:#34d399;margin-top:2px">${hp} Health Points</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">100% HIT / 95% FLEE</div>
                <div class="mono" style="font-weight:800;font-size:13px;margin-top:2px">${hitFlee}</div>
              </div>
              <div style="padding:8px 10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;color:var(--joy-text-secondary)">BASE / JOB EXPERIENCE</div>
                <div class="mono" style="font-weight:800;font-size:13px;margin-top:2px">${baseJobExp}</div>
              </div>
            </div>

            <!-- 2x5 Elemental Modifiers Grid -->
            <div>
              <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">2 × 5 ELEMENTAL DAMAGE MODIFIERS GRID (PERCENTAGE)</div>
              <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
                ${elemOrder.map(el => {
                  const pct = elemMods[el] !== undefined ? elemMods[el] : 100;
                  const color = pct > 100 ? '#34d399' : (pct < 100 ? '#f87171' : 'var(--joy-text-primary)');
                  return `
                    <div style="padding:6px 8px;border-radius:6px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:11px">
                      <span>${el}</span>
                      <strong class="mono" style="color:${color}">${pct}%</strong>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <!-- Item Drops & Monster Card Drop -->
            <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:10px">
              <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">ITEM DROPS WITH PERCENTAGE BADGES</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  ${(activeMonster.item_drops || []).map(it => `
                    <span class="joy-badge joy-badge--neutral joy-badge--sm">
                      ${escapeHtml(it.item_name)} <strong class="mono" style="color:#ffd166;margin-left:4px">${it.drop_chance_percent}%</strong>
                    </span>
                  `).join('')}
                </div>
              </div>
              <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle)">
                <div class="mono" style="font-size:10px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">MONSTER CARD DROP</div>
                <div style="font-size:12px;font-weight:700;color:#ffd166">🃏 ${escapeHtml(card.card_name || 'None')} (${card.drop_chance_percent || 0.01}%)</div>
                <div style="font-size:11px;color:var(--joy-text-secondary);margin-top:2px">Slot: ${escapeHtml(card.equipment_slot || 'Accessory')} · ${escapeHtml(card.modifier_summary || '')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    ${renderTownOrHuntingAreaBigPictureSvg(activeDistrict, activeNode, activeMonster)}
    <div class="studio-split-layout">
      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <section class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-default);border-radius:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <div>
              <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">STEP 4 · TOWN OR HUNTING AREA INSPECTOR (${escapeHtml(activeNode.node_type || '')})</div>
              <h2 style="margin:2px 0 0;font-size:1.25rem">${escapeHtml(activeNode.name || '')} [${(activeNode.grid_coordinates || [0,0]).join(', ')}]</h2>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${districtNodes.map(n => `
                <button type="button" class="joy-button ${n.id === activeNode.id ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(n.id)}', inspectId: '${escapeHtml(n.id)}' })">
                  ${escapeHtml(n.name)} (${escapeHtml(n.status)})
                </button>
              `).join('')}
            </div>
          </div>

          <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-subtle);margin-bottom:14px;font-size:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <strong>Core Rationale (Linked to District ${escapeHtml(activeDistrict.name || '')})</strong>
              ${renderStatusBadgeHtml(activeNode.status)}
            </div>
            <div>${escapeHtml(activeNode.core_rationale || '')}</div>
          </div>

          ${isMystery && activeNode.mystery_hook ? `
            <div style="padding:16px;border-radius:10px;background:rgba(168,85,247,0.14);border:1px dashed rgba(168,85,247,0.6)">
              <div style="font-weight:800;font-size:13.5px;color:#c084fc;margin-bottom:6px">🌫️ Intentional Mystery / Fog of Lore Leaf Node (Not Compiled to Playable Map)</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>In-World Rumor:</strong> ${escapeHtml(activeNode.mystery_hook.in_world_rumor)}</div>
              <div style="font-size:12px;margin-bottom:6px"><strong>Visual Silhouette:</strong> ${escapeHtml(activeNode.mystery_hook.visual_silhouette)}</div>
              <div style="font-size:12px"><strong>Unanswered Question:</strong> ${escapeHtml(activeNode.mystery_hook.unanswered_question)}</div>
            </div>
          ` : `
            <!-- Topographic & Directional Portal Blueprint -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">TOPOGRAPHIC TERRAIN TILE</div>
                <div style="font-size:12px"><strong>Map Identifier:</strong> <code>${escapeHtml(activeNode.map_id || '')}</code></div>
                <div style="font-size:12px;margin-top:3px"><strong>Dimensions:</strong> ${dims.width} × ${dims.height} meters</div>
                <div style="font-size:12px;margin-top:3px"><strong>Biome Palette:</strong> <code>${escapeHtml(tile.biome_palette || '')}</code></div>
                <div style="font-size:12px;margin-top:3px"><strong>Maximum Terrace Step:</strong> ${tile.max_terrace_step_meters || 0.18} meters (≤ 0.25 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Water Feature:</strong> ${escapeHtml(tile.water_feature || '')}</div>
              </div>

              <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                <div class="mono" style="font-size:10.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:6px">90 TO 120 CENTIMETER SCALE AND THREE-DIMENSIONAL ASSET KIT</div>
                <div style="font-size:12px"><strong>Player Scale Band:</strong> ${(kit.player_scale_band_meters || [0.9, 1.2]).join(' to ')} meters</div>
                <div style="font-size:12px;margin-top:3px"><strong>Grass Height Cap:</strong> ${kit.max_grass_height_meters || 0.28} meters (≤ 0.35 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Bush Height Cap:</strong> ${kit.max_bush_height_meters || 0.58} meters (≤ 0.65 meters)</div>
                <div style="font-size:12px;margin-top:3px"><strong>Road / Footpath Width:</strong> ${kit.main_road_width_meters || 12.0} meters / ${kit.footpath_width_meters || 4.0} meters</div>
                <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
                  ${(kit.three_dimensional_assets || []).map(glb => `<span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(glb)}</span>`).join('')}
                </div>
              </div>
            </div>

            <h3 style="margin:0 0 8px;font-size:1rem">Directional Portal Triggers (North / South / East / West / Dungeon / Exit)</h3>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
              ${portalDirs.map(dir => {
                const p = portals[dir];
                if (!p) {
                  return `
                    <div style="padding:10px;border-radius:8px;background:rgba(15,23,42,0.35);border:1px dashed var(--joy-border-subtle);font-size:11.5px;color:var(--joy-text-muted)">
                      <strong>${dir}:</strong> Natural Boundary (Closed)
                    </div>
                  `;
                }
                const isFog = p.gate_state === 'fog_of_lore';
                const tb = p.trigger_box_meters || {};
                return `
                  <div style="padding:10px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid ${isFog ? 'rgba(168,85,247,0.55)' : 'var(--joy-border-default)'};font-size:11.5px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>${dir} Portal</strong>
                      <span class="mono" style="font-size:10px;color:${isFog ? '#c084fc' : '#34d399'}">${escapeHtml(p.gate_state)}</span>
                    </div>
                    <div style="margin-top:4px">Target: <code>${escapeHtml(p.target_node_id)}</code> (${escapeHtml(p.target_direction)})</div>
                    <div class="mono" style="font-size:10px;color:var(--joy-text-secondary);margin-top:2px">Trigger Box: (${tb.x}, ${tb.y}) ${tb.width}×${tb.height} meters</div>
                    ${p.lock_message ? `<div style="font-size:10.5px;color:#c084fc;margin-top:4px">🌫️ ${escapeHtml(p.lock_message)}</div>` : ''}
                    <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="setStudioPerspective('town-or-hunting-area', { districtId: '${escapeHtml(activeDistrict.id)}', nodeId: '${escapeHtml(p.target_node_id)}', inspectId: '${escapeHtml(p.target_node_id)}' })">
                      Traverse ${dir} ➔
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </section>

        ${monsterDetailHtml}
      </div>

      <aside class="panel" style="padding:18px;background:var(--joy-surface-card);border:1px solid var(--joy-border-strong);border-radius:10px;position:sticky;top:72px">
        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">CORE RATIONALE AND QUALITY GATE</div>
        <h3 style="margin:4px 0 8px;font-size:1.1rem">${escapeHtml(activeNode.name || '')}</h3>
        ${renderStatusBadgeHtml(activeNode.status)}
        <div style="margin-top:10px;padding:10px;border-radius:6px;background:var(--joy-surface-sunken);font-size:12px">
          <strong>Core Rationale:</strong> ${escapeHtml(activeNode.core_rationale || '')}
        </div>
        ${renderQualityChecklistCardHtml(activeNode)}
      </aside>
    </div>
  `;
}

function inspectBtnHtml(kind, title, obj) {
  const encoded = encodeURIComponent(JSON.stringify(obj));
  const safeTitle = escapeHtml(title).replace(/'/g, "\\'");
  return `<button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="openInspector('${kind}', '${safeTitle}', JSON.parse(decodeURIComponent('${encoded}')))">JSONB</button>`;
}


/* ============================================================================
 * 0. AI ASSET & MAP STUDIO — STEP 3 REVIEW GATE INBOX & BIOME BRUSH COMPOSER
 * ========================================================================== */
function renderChibiLineupSvg(proposal) {
  if (proposal.kind === 'db_entity') {
    const selIdx = proposal.selectedTakeIdx || 0;
    const activeTake = (proposal.takes || [])[selIdx] || {};
    const bossH = activeTake.heightM || (proposal.embeddedInputs && proposal.embeddedInputs.targetHeightM) || 2.10;
    const ratio = (bossH / 1.05).toFixed(2);
    const bossTopY = Math.max(24, Math.round(158 - (bossH / 2.10) * 120));
    const headY = bossTopY + 15;
    const bodyY = bossTopY + 30;
    const bodyH = Math.max(40, 158 - bodyY);
    const shortAsset = (activeTake.assetPath || 'orc_brute.glb').split('/').pop();
    return `
      <svg width="100%" height="185" viewBox="0 0 520 185" style="border-radius:8px;background:#121b28;border:1px solid var(--joy-border-strong)">
        <line x1="20" y1="158" x2="500" y2="158" stroke="#4a5d78" stroke-width="2"/>
        <!-- 0.55m Small Mob -->
        <line x1="20" y1="127" x2="500" y2="127" stroke="rgba(126,217,135,0.25)" stroke-dasharray="3 3"/>
        <text x="26" y="123" fill="#7ed987" font-size="10" font-family="monospace">0.55m Small Mob</text>
        <!-- 1.05m Chibi Player Reference Line -->
        <line x1="20" y1="98" x2="500" y2="98" stroke="#ffd166" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="26" y="93" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">1.05m Chibi Toddler Player Anchor [0.90m-1.20m]</text>
        <!-- Dynamic MVP Boss Line -->
        <line x1="20" y1="${bossTopY}" x2="500" y2="${bossTopY}" stroke="#ff6b6b" stroke-width="1.2" stroke-dasharray="4 3"/>
        <text x="26" y="${Math.max(14, bossTopY - 5)}" fill="#ff6b6b" font-size="10.5" font-weight="bold" font-family="monospace">${bossH.toFixed(2)}m MVP Boss (${ratio}x Chibi · ${escapeHtml(shortAsset)})</text>

        <!-- Small Poring (0.55m) -->
        <ellipse cx="145" cy="143" rx="18" ry="15" fill="#5ec27e" stroke="#a8f0be" stroke-width="1.5"/>
        <text x="145" y="174" text-anchor="middle" fill="#a8f0be" font-size="10" font-family="monospace">Poring (0.55m)</text>

        <!-- Chibi Player Dummy (1.05m, 2.5 head-to-body ratio) -->
        <circle cx="265" cy="112" r="13" fill="#ffd166" stroke="#fff" stroke-width="1.5"/>
        <rect x="253" y="125" width="24" height="33" rx="7" fill="#3b82f6" stroke="#93c5fd" stroke-width="1.5"/>
        <text x="265" y="174" text-anchor="middle" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">Chibi Player (1.05m)</text>

        <!-- Dynamic Orc Warlord MVP -->
        <circle cx="405" cy="${headY}" r="16" fill="#e63946" stroke="#ffb4a2" stroke-width="1.5"/>
        <rect x="381" y="${bodyY}" width="48" height="${bodyH}" rx="9" fill="#9d0208" stroke="#ff6b6b" stroke-width="2"/>
        <path d="M 432 ${headY} L 456 148" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/>
        <text x="405" y="174" text-anchor="middle" fill="#ff6b6b" font-size="10.5" font-weight="bold" font-family="monospace">Orc Warlord (${bossH.toFixed(2)}m)</text>
      </svg>
    `;
  }
  if (proposal.kind === 'ground_palette') {
    return `
      <svg width="100%" height="185" viewBox="0 0 520 185" style="border-radius:8px;background:#112218;border:1px solid var(--joy-border-strong)">
        <line x1="20" y1="156" x2="500" y2="156" stroke="#529e47" stroke-width="2"/>
        <!-- 0.35m Grass Cap -->
        <line x1="20" y1="136" x2="310" y2="136" stroke="#7ed987" stroke-dasharray="3 2"/>
        <text x="25" y="132" fill="#7ed987" font-size="10" font-family="monospace">0.35m Knee-High Grass Cap</text>
        <!-- 0.65m Bush Cap -->
        <line x1="20" y1="118" x2="310" y2="118" stroke="#5ec27e" stroke-dasharray="3 2"/>
        <text x="25" y="114" fill="#5ec27e" font-size="10" font-family="monospace">0.65m Chest-High Bush Cap (Head Visible!)</text>
        <!-- 1.05m Chibi Player -->
        <line x1="20" y1="95" x2="500" y2="95" stroke="#ffd166" stroke-width="1.4" stroke-dasharray="4 3"/>
        <text x="25" y="90" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">1.05m Chibi Player Head Always Above Foliage</text>

        <!-- Grass (0.35m) -->
        <rect x="95" y="136" width="22" height="20" rx="4" fill="#529e47"/>
        <text x="106" y="172" text-anchor="middle" fill="#7ed987" font-size="10" font-family="monospace">Grass 0.35m</text>

        <!-- Bush (0.65m) -->
        <ellipse cx="185" cy="137" rx="24" ry="19" fill="#346e36" stroke="#7ed987" stroke-width="1.2"/>
        <text x="185" y="172" text-anchor="middle" fill="#7ed987" font-size="10" font-family="monospace">Bush 0.65m</text>

        <!-- Chibi Player (1.05m) -->
        <circle cx="275" cy="109" r="13" fill="#ffd166" stroke="#fff" stroke-width="1.5"/>
        <rect x="263" y="122" width="24" height="34" rx="6" fill="#3b82f6" stroke="#93c5fd" stroke-width="1.5"/>
        <text x="275" y="172" text-anchor="middle" fill="#ffd166" font-size="10.5" font-weight="bold" font-family="monospace">Chibi 1.05m</text>

        <!-- Pine Canopy Tree: 0.45m Red Trunk Collider vs 1.85m Green Walkable Canopy Overhang -->
        <ellipse cx="410" cy="64" rx="64" ry="44" fill="rgba(82,158,71,0.34)" stroke="#7ed987" stroke-width="1.5" stroke-dasharray="4 2"/>
        <text x="410" y="55" text-anchor="middle" fill="#a8f0be" font-size="9.5" font-family="monospace">1.85m Walkable Canopy</text>
        <text x="410" y="68" text-anchor="middle" fill="#a8f0be" font-size="9" font-family="monospace">(Auto-fades at alpha 0.22)</text>
        <rect x="397" y="102" width="26" height="54" fill="rgba(235,87,87,0.45)" stroke="#ff6b6b" stroke-width="2"/>
        <text x="410" y="172" text-anchor="middle" fill="#ff6b6b" font-size="10" font-weight="bold" font-family="monospace">0.45m Trunk Collider</text>
      </svg>
    `;
  }
  const pilotMap = (DATA.maps || [])[0];
  return pilotMap ? `<div style="display:flex;justify-content:center">${renderMinimapSvg(pilotMap)}</div>` : '';
}

async function submitReviewVerdict(propId, verdict, takeIdx) {
  const fbInput = document.getElementById('fb-input-' + propId);
  const feedbackText = fbInput ? fbInput.value.trim() : '';
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Applying Review Verdict...';

  const res = await fetch('/api/review-queue/verdict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: propId, verdict, selectedTakeIdx: takeIdx, feedbackText })
  });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? `Verdict: ${out.verdict.toUpperCase()}` : 'Verdict Error';
  renderSidebar();
  render();
}

async function selectProposalTake(propId, takeIdx) {
  const prop = ((DATA.reviewQueue && DATA.reviewQueue.proposals) || []).find(p => p.id === propId);
  if (prop) prop.selectedTakeIdx = takeIdx;
  render();
}

async function togglePaletteAsset(paletteId, ruleName, assetPath, weightVal) {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Updating Palette Brush...';
  const payload = { paletteId, ruleName };
  if (assetPath) payload.assetPath = assetPath;
  if (weightVal !== undefined && weightVal !== null) payload.weight = parseFloat(weightVal);
  await fetch('/api/palette/toggle-asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = `Updated ${paletteId}.${ruleName}`;
  renderSidebar();
  render();
}

async function undoStudioSnapshot() {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = 'Restoring Snapshot...';
  const res = await fetch('/api/studio/undo', { method: 'POST' });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? `Restored ${out.restoredSnapshot}` : (out.error || 'Nothing to undo');
  renderSidebar();
  render();
}

let LAST_AI_AGENT_RESULT = null;

async function launch3dClient(mode) {
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = mode === 'map_builder' ? '🗺️ Launching 3D Map Builder...' : '🎮 Launching 3D Game Client...';
  const res = await fetch('/api/studio/launch-3d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });
  const out = await res.json();
  if (statusEl) statusEl.textContent = out.ok ? `Launched ${out.script}` : ('Launch Error: ' + (out.error || ''));
}

async function runAiStudioAgent(presetPrompt) {
  const inp = document.getElementById('aiStudioPromptInput');
  const prompt = (presetPrompt !== undefined && presetPrompt !== null)
    ? String(presetPrompt)
    : (inp ? inp.value.trim() : '');
  if (!prompt) return;
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = '🤖 AI Agent applying edit...';

  const res = await fetch('/api/studio/ai-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt })
  });
  const out = await res.json();
  if (out.ok && out.agentAction) {
    LAST_AI_AGENT_RESULT = out.agentAction;
  }
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? '✨ AI Agent Edit Committed' : 'AI Edit Error';
  renderSidebar();
  render();
}

async function applyInteractiveMapStructure(prefix) {
  const gv = (id) => {
    const el = document.getElementById(prefix + '-' + id);
    return el ? parseFloat(el.value) : null;
  };
  const payload = {
    highwayWidth: gv('hw'),
    spurWidth: gv('spur'),
    watchtowerX: gv('wtx'),
    watchtowerZ: gv('wtz'),
    watchtowerRadius: gv('wtr'),
    watchtower2F: gv('wt2f'),
    caveX: gv('cvx'),
    caveZ: gv('cvz'),
    caveRadius: gv('cvr'),
    reason: 'Interactive Map Structure & Route Update via AI Studio Agent'
  };
  const statusEl = document.getElementById('topbarStatus');
  if (statusEl) statusEl.textContent = '🤖 Updating Map Structure...';
  const res = await fetch('/api/map/update-structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  const bRes = await fetch('/api/bundle');
  DATA = await bRes.json();
  buildThumbIndex();
  if (statusEl) statusEl.textContent = out.ok ? '✨ Map Blueprint Updated' : 'Map Update Error';
  renderSidebar();
  render();
}

function renderMapStructureEditor(m, prefix) {
  if (!m) return '';
  const hw = ((m.routes || []).find(r => r.id === 'prontera_south_highway') || {}).width ?? 5.2;
  const spur = ((m.routes || []).find(r => r.id === 'watchtower_east_spur') || {}).width ?? 3.6;
  const wt = (m.structures || []).find(s => s.id === 'freja_west_watchtower_01') || { x: -9.5, z: -2, radius: 3.6, upperFloorHeight: 3.2 };
  const cv = (m.structures || []).find(s => s.id === 'freja_east_crystal_cave_01') || { x: 10.5, z: -3, radius: 4.2 };

  return `
    <div style="padding:12px;border-radius:8px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-strong);display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:12px;font-weight:700;color:var(--joy-accent-text)">
          🛠️ Interactive Map Structure &amp; Route Editor (Wrapped by AI Chibi Guardrails)
        </div>
        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="applyInteractiveMapStructure('${escapeHtml(prefix)}')">
          ✨ Apply Structure Changes
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px;font-size:11.5px">
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Highway Width (m)</span><strong class="mono">${hw}m</strong></div>
          <input id="${escapeHtml(prefix)}-hw" type="range" min="3.5" max="10.0" step="0.1" value="${hw}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">East Spur Width (m)</span><strong class="mono">${spur}m</strong></div>
          <input id="${escapeHtml(prefix)}-spur" type="range" min="2.5" max="7.0" step="0.1" value="${spur}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Watchtower X / Z</span><strong class="mono">(${wt.x}, ${wt.z})</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-wtx" class="joy-input mono" type="number" step="0.5" value="${wt.x}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-wtz" class="joy-input mono" type="number" step="0.5" value="${wt.z}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Watchtower r / 2F</span><strong class="mono">r=${wt.radius}m · 2F=${wt.upperFloorHeight || 3.2}m</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-wtr" class="joy-input mono" type="number" step="0.2" value="${wt.radius}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-wt2f" class="joy-input mono" type="number" step="0.1" value="${wt.upperFloorHeight || 3.2}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Crystal Cave X / Z</span><strong class="mono">(${cv.x}, ${cv.z})</strong></div>
          <div style="display:flex;gap:4px">
            <input id="${escapeHtml(prefix)}-cvx" class="joy-input mono" type="number" step="0.5" value="${cv.x}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
            <input id="${escapeHtml(prefix)}-cvz" class="joy-input mono" type="number" step="0.5" value="${cv.z}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
          </div>
        </label>
        <label class="gate-pill-row" style="flex-direction:column;align-items:stretch;gap:4px">
          <div style="display:flex;justify-content:space-between"><span class="mono">Crystal Cave Radius</span><strong class="mono">${cv.radius}m</strong></div>
          <input id="${escapeHtml(prefix)}-cvr" type="range" min="3.0" max="7.0" step="0.2" value="${cv.radius}" onchange="applyInteractiveMapStructure('${escapeHtml(prefix)}')" />
        </label>
      </div>
    </div>
  `;
}

function renderAiCopilotBar() {
  const rq = DATA.reviewQueue || {};
  const logs = rq.agentEditLog || [];
  const latestLog = LAST_AI_AGENT_RESULT || logs[0] || null;
  const snaps = DATA.studioSnapshots || [];

  const presets = [
    { label: '✨ Entity: Orc Warlord -> Raider 1.95m (Take A)', prompt: 'Swap Orc Warlord to Take A Orc Raider at 1.95m' },
    { label: '✨ Entity: Orc Warlord -> Colossal Golem 2.20m + 1800 HP', prompt: 'Swap Orc Warlord to Colossal Golem 2.20m and set HP to 1800' },
    { label: '✨ Entity: Orc Warlord -> Brute 2.10m (Recommended)', prompt: 'Reset Orc Warlord to Take B Orc Brute 2.10m and HP 1445' },
    { label: '✨ Brush: Sunlit Woods (Tree 2.5% + Exclude Dead Pine)', prompt: 'Open sunlit sparse woods: set pine tree density to 2.5% and disable dead pine' },
    { label: '✨ Brush: Balanced Border (Tree 4.0%, Bush 10%)', prompt: 'Set pine forest border to balanced 4.0% canopy tree and exclude dead pine' },
    { label: '✨ Map: Widen Highway to 7.5m + Expand Watchtower', prompt: 'Widen highway to 7.5m and expand Watchtower 2F to 3.5m at (-11.0, -2.5)' },
    { label: '✨ Map: Move Crystal Cave to (13.5, -4.0) r=5.0m', prompt: 'Move Crystal Cave to (13.5, -4.0) with radius 5.0m' },
  ];

  return `
    <div class="observatory-card" style="background:linear-gradient(135deg, rgba(212,175,55,0.12), rgba(19,34,56,0.92));border:1px solid var(--joy-border-strong);padding:14px 18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div class="page-hero__eyebrow" style="margin-bottom:2px">🤖 AI STUDIO CO-PILOT AGENT · NATURAL-LANGUAGE EDIT WRAPPER (3 PILLARS)</div>
          <div style="font-size:13px;color:var(--joy-text-secondary)">
            Type any natural-language instruction (or click a 1-click preset below) to edit <strong>3D Entities &amp; Stats</strong>, <strong>Biome Brushes</strong>, or <strong>Map Routes &amp; 3D Structures</strong>. Automatically validates Chibi <code>1.05m</code> scale guardrails and saves a 1-click Undo snapshot.
          </div>
        </div>
        <div class="chip-row">
          <span class="joy-badge joy-badge--success joy-badge--sm">Chibi 1.05m Guardrail Active</span>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="launch3dClient('map_builder')">
            🗺️ Preview in 3D Map Builder
          </button>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="launch3dClient('game')">
            🎮 Preview in 3D Game Client
          </button>
          <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
            ↩ Undo Last AI Edit (${snaps.length})
          </button>
        </div>
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
        <input
          id="aiStudioPromptInput"
          class="joy-input"
          type="text"
          placeholder="Tell the AI Agent what to edit (e.g., 'Swap Orc Warlord to Golem 2.20m with 1800 HP', 'Widen highway to 7.5m and move Watchtower to (-11, -2.5)', 'Set pine tree density to 2.5% and disable dead pine')..."
          style="flex:1;min-width:280px;height:36px;font-size:12.5px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();runAiStudioAgent();}"
        />
        <button type="button" class="joy-button joy-button--solid" onclick="runAiStudioAgent()">
          ✨ Edit via AI Agent
        </button>
      </div>

      <div class="chip-row" style="margin-top:4px">
        ${presets.map(pr => `
          <button
            type="button"
            class="joy-button joy-button--outline joy-button--sm"
            style="font-size:11px;height:26px;padding:0 9px"
            onclick="runAiStudioAgent('${escapeHtml(pr.prompt.replace(/'/g, "\'"))}')"
          >
            ${escapeHtml(pr.label)}
          </button>
        `).join('')}
      </div>

      ${latestLog ? `
        <div style="margin-top:6px;padding:9px 12px;border-radius:7px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px">
          <div>
            <span class="joy-badge joy-badge--brand joy-badge--sm">${escapeHtml(latestLog.mode || 'AI Agent')}</span>
            <strong style="margin-left:6px;color:var(--joy-accent-text)">${escapeHtml(latestLog.summary || '')}</strong>
            <div class="mono" style="font-size:11px;color:var(--joy-text-secondary);margin-top:3px">
              Prompt: "${escapeHtml(latestLog.prompt || '')}" · Files: ${escapeHtml((latestLog.files || []).join(', '))}
            </div>
          </div>
          <div class="chip-row">
            ${(latestLog.guardrails || []).map(g => `<span class="joy-badge joy-badge--success joy-badge--sm">✓ ${escapeHtml(g)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderReviewInbox() {
  const rq = DATA.reviewQueue || {};
  const proposals = (rq.proposals || []).filter(matchesSearch);
  const snaps = DATA.studioSnapshots || [];
  const scaleAnchor = rq.playerScaleAnchor || { heightRangeM: [0.90, 1.20], referenceHeightM: 1.05 };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">99% AUTOMATED PIPELINE · 1% HUMAN APPROVAL &amp; FEEDBACK GATE</div>
        <h1 class="page-hero__title">Step 3 Review Gate Inbox — 1-Map Pilot (<code>prontera_south_field</code>)</h1>
        <p class="page-hero__sub">
          Every asset, biome brush, and map blueprint embeds the <strong>Chibi Toddler Player Scale Anchor (${scaleAnchor.heightRangeM[0].toFixed(2)}m–${scaleAnchor.heightRangeM[1].toFixed(2)}m, Ref ${scaleAnchor.referenceHeightM.toFixed(2)}m)</strong>
          into its generator contract and passes automated machine gates before reaching this inbox.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">Chibi Player: ${scaleAnchor.referenceHeightM.toFixed(2)}m</span>
        <span class="joy-badge joy-badge--success">${proposals.filter(p => p.status === 'approved').length}/${proposals.length} Approved</span>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
          ↩ Undo Last Commit (${snaps.length})
        </button>
      </div>
    </div>

    ${renderAiCopilotBar()}

    <div class="studio-pipeline-banner">
      <div>
        <strong style="color:var(--joy-accent-text)">3-Stage Review Flow:</strong>
        <span class="mono" style="font-size:12px;margin-left:8px">
          [1. Embedded Generator Inputs] ➔ [2. Machine Must-Pass Gates (Auto-Reject Broken Output)] ➔ [3. Human 10-Second Visual Check &amp; Approve/Re-Roll]
        </span>
      </div>
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="switchTab('brushes')">
          Open Biome Brush &amp; Tag Pools ▸
        </button>
      </div>
    </div>

    <div class="rms-list">
      ${proposals.map(prop => {
        const selIdx = prop.selectedTakeIdx || 0;
        const takes = prop.takes || [];
        const activeTake = takes[selIdx] || takes[0] || {};
        const statusBadge = prop.status === 'approved'
          ? 'joy-badge--success'
          : (prop.status === 'rejected' ? 'joy-badge--danger' : 'joy-badge--warning');

        const palId = prop.kind === 'ground_palette' ? prop.targetId : null;
        const livePal = palId && DATA.groundPalettes ? DATA.groundPalettes[palId] : null;
        const canopyRule = livePal && livePal.scatter ? livePal.scatter.canopy_tree : null;
        const allCanopyAssets = canopyRule
          ? Array.from(new Set([...(canopyRule.assets || []), ...(canopyRule.disabledAssets || [])]))
          : [];

        return `
          <div class="rms-sheet" id="entity-${escapeHtml(prop.id)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(activeTake.thumbUrl ? { thumbUrl: activeTake.thumbUrl, name: prop.title } : prop.targetId, '✨')}
                <span class="rms-sheet__title">${escapeHtml(prop.title)}</span>
                <span class="joy-badge ${statusBadge} joy-badge--sm">${escapeHtml((prop.status || 'pending_review').toUpperCase())}</span>
                <span class="rms-sheet__id"><code>${escapeHtml(prop.id)}</code> · Target: <code>${escapeHtml(prop.targetFile || '')}</code></span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(prop.pillar || prop.kind)}</span>
                ${inspectBtnHtml('proposal', prop.title, prop)}
              </div>
            </div>

            <div class="review-3col-grid">
              <!-- COLUMN 1: EMBEDDED GENERATOR INPUTS -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>1. Embedded Generator Inputs</span>
                  <span class="joy-badge joy-badge--brand joy-badge--sm">Auto-Injected</span>
                </div>
                <div class="observatory-card__meta">
                  Criteria embedded directly into the generator contract before building:
                </div>
                <div style="display:flex;flex-direction:column;gap:5px">
                  ${Object.entries(prop.embeddedInputs || {}).map(([k, v]) => `
                    <div class="gate-pill-row">
                      <span class="mono" style="color:var(--joy-text-secondary)">${escapeHtml(k)}</span>
                      <strong class="mono" style="font-size:11.5px;text-align:right">${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</strong>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- COLUMN 2: MACHINE MUST-PASS GATES -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>2. Machine Must-Pass Gates</span>
                  <span class="joy-badge joy-badge--success joy-badge--sm">${(prop.machineGates || []).length}/${(prop.machineGates || []).length} PASS</span>
                </div>
                <div class="observatory-card__meta">
                  Verified automatically by <code>validate.mjs</code>, <code>balance_sim</code> &amp; spatial hash:
                </div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  ${(prop.machineGates || []).map(g => `
                    <div class="gate-pill-row">
                      <div>
                        <div style="font-weight:600">${escapeHtml(g.gate)}</div>
                        <div class="mono" style="font-size:11px;color:var(--joy-text-secondary)">${escapeHtml(g.value)}</div>
                      </div>
                      <span class="joy-badge joy-badge--success joy-badge--sm">PASS</span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- COLUMN 3: HUMAN 10-SECOND IN-CONTEXT VISUAL CHECK & VERDICT -->
              <div class="review-col">
                <div class="review-col__head">
                  <span>3. Human In-Context Visual Check &amp; Verdict</span>
                  <span class="joy-badge joy-badge--warning joy-badge--sm">10s Spot-Check</span>
                </div>

                <!-- Visual Scale / Cutaway / Blueprint Diagram -->
                ${renderChibiLineupSvg(prop)}

                <!-- Multi-Take Picker -->
                <div>
                  <div style="font-size:11.5px;font-weight:700;color:var(--joy-text-secondary);margin-bottom:5px">
                    Candidate Takes (Pick Best Variant or Re-Roll with Feedback):
                  </div>
                  <div class="take-selector-bar">
                    ${takes.map((tk, idx) => `
                      <button type="button" class="take-btn ${idx === selIdx ? 'active' : ''}" onclick="selectProposalTake('${escapeHtml(prop.id)}', ${idx})">
                        ${tk.thumbUrl ? `<img src="${escapeHtml(tk.thumbUrl)}" alt="" style="width:22px;height:22px;object-fit:contain;border-radius:4px"/>` : '🎯'}
                        <span>${escapeHtml(tk.label)}</span>
                      </button>
                    `).join('')}
                  </div>
                  <div class="observatory-card__meta" style="margin-top:5px">
                    Selected: <strong>${escapeHtml(activeTake.label || '')}</strong> — ${escapeHtml(activeTake.notes || '')}
                  </div>
                </div>

                ${canopyRule ? `
                  <div style="padding:10px;border-radius:7px;background:var(--joy-surface-sunken);border:1px solid var(--joy-border-default)">
                    <div style="font-size:11.5px;font-weight:700;color:var(--joy-accent-text);margin-bottom:6px">
                      Smart Tag Pool Override (<code>biome:freja_pine + role:canopy_tree</code>) — Uncheck any unwanted 3D asset:
                    </div>
                    <div class="tag-pool-grid">
                      ${allCanopyAssets.map(sp => {
                        const isDisabled = (canopyRule.disabledAssets || []).includes(sp);
                        const shortName = sp.replace('res://assets/nature/', '');
                        const tUrl = (DATA.assetSceneThumbs && DATA.assetSceneThumbs[sp]) || '';
                        return `
                          <label class="tag-asset-card ${isDisabled ? 'disabled' : ''}" onclick="togglePaletteAsset('${escapeHtml(palId)}', 'canopy_tree', '${escapeHtml(sp)}')">
                            <input type="checkbox" ${!isDisabled ? 'checked' : ''} onclick="event.stopPropagation(); togglePaletteAsset('${escapeHtml(palId)}', 'canopy_tree', '${escapeHtml(sp)}')" />
                            ${tUrl ? `<img src="${escapeHtml(tUrl)}" alt="${escapeHtml(shortName)}" />` : ''}
                            <div>
                              <div class="mono" style="font-weight:600;font-size:11.5px">${escapeHtml(shortName)}</div>
                              <div class="observatory-card__meta">${isDisabled ? 'Excluded from scatter' : 'Active in chunk scatter'}</div>
                            </div>
                          </label>
                        `;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}

                ${prop.kind === 'map_blueprint' ? renderMapStructureEditor((DATA.maps || [])[0], 'rev-map') : ''}

                <!-- Nice-to-Have Human Checklist -->
                <div class="chip-row">
                  ${(prop.niceToHaveChecks || []).map(chk => `
                    <span class="joy-badge joy-badge--neutral joy-badge--sm">✓ ${escapeHtml(chk)}</span>
                  `).join('')}
                </div>

                <!-- Reviewer Feedback Input + Approve / Re-Roll / Reject Bar -->
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;padding-top:8px;border-top:1px solid var(--joy-border-subtle)">
                  <input
                    id="fb-input-${escapeHtml(prop.id)}"
                    class="joy-input"
                    type="text"
                    placeholder="Optional feedback note (e.g., 'Make tusks 20% larger' or 'Lower bush height to 0.55m')..."
                    value="${escapeHtml(prop.lastFeedback || '')}"
                    style="flex:1;min-width:220px;height:32px;font-size:12px"
                  />
                  <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'approve', ${selIdx})">
                    ✓ Approve &amp; Commit
                  </button>
                  <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'feedback', ${selIdx})">
                    ↻ Send Feedback &amp; Re-Roll
                  </button>
                  <button type="button" class="joy-button joy-button--ghost joy-button--sm" onclick="submitReviewVerdict('${escapeHtml(prop.id)}', 'reject', ${selIdx})">
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

