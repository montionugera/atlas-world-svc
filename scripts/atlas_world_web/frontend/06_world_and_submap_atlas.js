function renderAtlasOverviewMiniMapPipSvg(activeZoneOrId, tatlas, viewKind = 'town') {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const atlasDoc = tatlas || sp.tShapedWorldAtlas || {};
  const allZones = getAllAtlas63Zones(atlasDoc);
  const byId = {};
  allZones.forEach(z => {
    byId[z.zone_id] = z;
    if (z.studio_node_id) byId[z.studio_node_id] = z;
  });

  const targetId = typeof activeZoneOrId === 'string'
    ? activeZoneOrId
    : ((activeZoneOrId && (activeZoneOrId.zone_id || activeZoneOrId.studio_node_id || activeZoneOrId.dungeon_id || activeZoneOrId.id)) || 'zone-town-lantern-hollow');
  const activeZone = byId[targetId] || allZones[0] || {
    zone_id: 'zone-town-lantern-hollow',
    studio_node_id: 'town-lantern-hollow',
    name: 'Lantern Hollow Village',
    loc_coord: '-84120:243500',
    connected_zone_ids: ['zone-field-clover-south-gate', 'zone-dungeon-kiln-cellar']
  };
  const activeLocStr = activeZone.loc_coord
    || (activeZoneOrId && (activeZoneOrId.entrance_loc || activeZoneOrId.loc_coord))
    || `${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`;
  const activeCoord = resolveAtlasFocusLoc(activeLocStr, activeZone.zone_id, activeZone.studio_node_id, targetId);

  // Place PiP in bottom-left when in dungeon sub-map (since vertical cutaway occupies right) or bottom-right in Town/Field/Fortress views
  const pipW = 248;
  const pipH = 148;
  const pipX = viewKind === 'dungeon' ? 16 : 776;
  const pipY = 304;
  const mapX = pipX + 8;
  const mapY = pipY + 24;
  const mapW = pipW - 16;
  const mapH = 92;

  const toMiniXY = (svgX, svgY) => ({
    mx: Math.round(mapX + (Math.max(20, Math.min(1020, svgX)) / 1040) * mapW),
    my: Math.round(mapY + (Math.max(20, Math.min(480, svgY)) / 500) * mapH)
  });

  const actMini = toMiniXY(activeCoord.svgX, activeCoord.svgY);
  const neighborIds = (activeZone.connected_zone_ids || []).slice(0, 5);
  const neighborPins = neighborIds
    .map(nid => byId[nid])
    .filter(Boolean)
    .map(nb => {
      const nc = clampWorldLocCoord(nb.loc_coord || '-84120:243500');
      const mpos = toMiniXY(nc.svgX, nc.svgY);
      return { nb, ...mpos };
    });

  const neighborEdgesSvg = neighborPins.map(np => `
    <line x1="${actMini.mx}" y1="${actMini.my}" x2="${np.mx}" y2="${np.my}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3 2"/>
  `).join('');

  const neighborDotsSvg = neighborPins.map(np => {
    const clickCall = np.nb.actionType === 'dungeon'
      ? `openDungeonSubMap('${escapeHtml(np.nb.zone_id)}', 'B1')`
      : (np.nb.actionType === 'town'
        ? `focusTownStreetBlueprint('${escapeHtml(np.nb.studio_node_id || np.nb.zone_id)}', '${escapeHtml(np.nb.loc_coord || '')}')`
        : `focusFieldTacticalBlueprint('${escapeHtml(np.nb.zone_id)}', '${escapeHtml(np.nb.loc_coord || '')}')`);
    return `
      <g style="cursor:pointer" onclick="${clickCall}">
        <circle cx="${np.mx}" cy="${np.my}" r="4.2" fill="#0284c7" stroke="#bae6fd" stroke-width="1.2"/>
      </g>
    `;
  }).join('');

  const shortZoneTitle = (activeZone.name || targetId).split('(')[0].trim().slice(0, 22);

  return `
    <g id="studioOverviewMiniMapPip" filter="url(#cartoDropShadow)">
      <rect x="${pipX}" y="${pipY}" width="${pipW}" height="${pipH}" rx="10" fill="rgba(9,13,22,0.94)" stroke="#fde047" stroke-width="1.8"/>
      <text x="${pipX + 10}" y="${pipY + 16}" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
        🛰️ PiP WORLD RADAR · ${escapeHtml(shortZoneTitle)}
      </text>

      <!-- Mini World Map Canvas showing 3 Continents -->
      <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" rx="6" fill="#0c1928" stroke="rgba(56,189,248,0.45)" stroke-width="1"/>
      <image href="/studio-maps/c3_continent_parchment_relief.png" x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" preserveAspectRatio="xMidYMid meet" opacity="0.45"/>

      <!-- 3 Continent Silhouette Zones (C01 Hearthbloom, C02 Steppe, C03 Shattered Halo) -->
      <ellipse cx="${mapX + Math.round(mapW * 0.44)}" cy="${mapY + Math.round(mapH * 0.76)}" rx="52" ry="16" fill="rgba(16,185,129,0.18)" stroke="#34d399" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.24)}" y="${mapY + Math.round(mapH * 0.88)}" fill="#6ee7b7" font-size="6.8" font-weight="800" font-family="monospace">C01 HEARTHBLOOM</text>

      <ellipse cx="${mapX + Math.round(mapW * 0.74)}" cy="${mapY + Math.round(mapH * 0.50)}" rx="38" ry="15" fill="rgba(245,158,11,0.18)" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.64)}" y="${mapY + Math.round(mapH * 0.54)}" fill="#fde68a" font-size="6.8" font-weight="800" font-family="monospace">C02 STEPPE</text>

      <ellipse cx="${mapX + Math.round(mapW * 0.64)}" cy="${mapY + Math.round(mapH * 0.22)}" rx="44" ry="13" fill="rgba(192,132,252,0.18)" stroke="#c084fc" stroke-width="1" stroke-dasharray="3 2"/>
      <text x="${mapX + Math.round(mapW * 0.50)}" y="${mapY + Math.round(mapH * 0.24)}" fill="#e9d5ff" font-size="6.8" font-weight="800" font-family="monospace">C03 HALO</text>

      ${neighborEdgesSvg}
      ${neighborDotsSvg}

      <!-- Active Zone Pulsing Radar Pin -->
      <circle cx="${actMini.mx}" cy="${actMini.my}" r="9" fill="rgba(250,204,21,0.28)" stroke="#fde047" stroke-width="1.4">
        <animate attributeName="r" values="6;12;6" dur="1.6s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${actMini.mx}" cy="${actMini.my}" r="4.8" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>

      <!-- Bottom Coordinate Readout & 1-Click Expand to World Map (1.0x) Button -->
      <text x="${pipX + 10}" y="${pipY + pipH - 11}" fill="#93c5fd" font-size="7.8" font-weight="800" font-family="monospace">
        loc=${escapeHtml(activeLocStr)}
      </text>
      <g style="cursor:pointer" onclick="zoomStudioMap(0, true)">
        <rect x="${pipX + 108}" y="${pipY + pipH - 24}" width="132" height="19" rx="5" fill="#0284c7" stroke="#fde047" stroke-width="1.2"/>
        <text x="${pipX + 174}" y="${pipY + pipH - 12}" text-anchor="middle" fill="#ffffff" font-size="7.8" font-weight="900" font-family="monospace">
          🌍 Expand to World Map (1.0×)
        </text>
      </g>
    </g>
  `;
}

function renderDungeonVerticalCutawaySvg(dng, activeFloor) {
  const floors = dng.floors || [];
  const isTower = dng.dungeon_kind === 'vertical_tower';
  const orderedFloors = isTower ? floors.slice().reverse() : floors.slice();
  const total = orderedFloors.length;
  const panelX = 768;
  const panelY = 50;
  const panelW = 258;
  const panelH = 420;
  const shaftX = panelX + 38;

  const fmtElev = (fl) => typeof fl.floor_elevation_meters === 'number'
    ? (fl.floor_elevation_meters > 0 ? `+${fl.floor_elevation_meters}m` : `${fl.floor_elevation_meters}m`)
    : (isTower ? `+${fl.floor_index * 55}m` : `-${fl.floor_index * 60}m`);
  const firstFloor = floors[0] || { floor_id: isTower ? '1F' : 'B1' };
  const lastFloor = floors[floors.length - 1] || { floor_id: isTower ? '3F' : 'B3' };
  const topFloorId = lastFloor.floor_id;
  const deepestFloorId = lastFloor.floor_id;
  // More than 4 floors: show a sliding 4-floor detail window plus a 1-click ladder of every floor.
  const laddered = total > 4;
  const winSize = laddered ? 4 : total;
  const activeIdx = Math.max(0, orderedFloors.findIndex(f => f.floor_id === activeFloor.floor_id));
  const winStart = laddered ? Math.max(0, Math.min(total - winSize, activeIdx - 1)) : 0;
  const windowFloors = orderedFloors.slice(winStart, winStart + winSize);
  const slabStep = total <= 3 ? 102 : 78;
  const slabW = panelW - 24 - (laddered ? 36 : 0);
  const chain = total > 3 ? `${firstFloor.floor_id}${isTower ? '⬆…⬆' : '⬇…⬇'}${lastFloor.floor_id}` : floors.map(f => f.floor_id).join(isTower ? '⬆' : '⬇');

  const surfaceOrRoofBanner = isTower ? `
    <g style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(topFloorId)}')">
      <rect x="${panelX + 12}" y="${panelY + 34}" width="${panelW - 24}" height="24" rx="5" fill="#1e3a8a" stroke="#fde047" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 49}" text-anchor="middle" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
        🗼 ${escapeHtml(topFloorId)} ROOFTOP APEX (${escapeHtml(fmtElev(lastFloor))}) ⬆ ${escapeHtml(firstFloor.floor_id)}
      </text>
    </g>
  ` : `
    <g style="cursor:pointer" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')">
      <rect x="${panelX + 12}" y="${panelY + 34}" width="${panelW - 24}" height="24" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 49}" text-anchor="middle" fill="#ecfdf5" font-size="8.8" font-weight="900" font-family="monospace">
        🌲 SURFACE ENTRANCE (0m) ➔ ${escapeHtml(chain.replace(/⬇/g, ' ➔ '))}
      </text>
    </g>
  `;

  const floorSlabsSvg = windowFloors.map((fl, idx) => {
    const slabY = panelY + 72 + idx * slabStep;
    const isCur = fl.floor_id === activeFloor.floor_id;
    const elevVal = fmtElev(fl);
    const bossHl = fl.boss_tier_highlight || `${fl.floor_id} Sanctum (${fl.level_range})`;
    const isBossFloor = fl.floor_id === lastFloor.floor_id;
    const strokeCol = isCur ? '#fde047' : (isBossFloor ? '#f59e0b' : '#c084fc');
    const bgFill = isCur
      ? (isTower ? 'rgba(30,64,175,0.95)' : 'rgba(107,33,168,0.95)')
      : 'rgba(15,23,42,0.92)';
    const nextFloor = windowFloors[idx + 1];
    const warpShaftSvg = nextFloor ? `
      <g style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(nextFloor.floor_id)}')">
        <line x1="${shaftX}" y1="${slabY + 68}" x2="${shaftX}" y2="${slabY + slabStep}" stroke="#38bdf8" stroke-width="4" stroke-dasharray="4 3"/>
        <circle cx="${shaftX}" cy="${slabY + 68 + (slabStep - 68) / 2}" r="${slabStep > 90 ? 9 : 5}" fill="#0f172a" stroke="#fde047" stroke-width="1.5"/>
        ${slabStep > 90 ? `<text x="${shaftX}" y="${slabY + 88}" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900">${isTower ? '⬆' : '⬇'}</text>` : ''}
      </g>
    ` : '';

    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(fl.floor_id)}')">
        <rect x="${panelX + 12}" y="${slabY}" width="${slabW}" height="68" rx="8" fill="${bgFill}" stroke="${strokeCol}" stroke-width="${isCur ? 2.5 : 1.4}"/>
        <circle cx="${shaftX}" cy="${slabY + 22}" r="12" fill="${isCur ? '#eab308' : '#1e293b'}" stroke="#ffffff" stroke-width="1.5"/>
        <text x="${shaftX}" y="${slabY + 26}" text-anchor="middle" fill="${isCur ? '#0f172a' : '#fde047'}" font-size="${fl.floor_id.length > 2 ? 8 : 9.5}" font-weight="900" font-family="monospace">${escapeHtml(fl.floor_id)}</text>
        <text x="${panelX + 58}" y="${slabY + 19}" fill="#ffffff" font-size="9.5" font-weight="900" font-family="monospace">
          ${escapeHtml(fl.floor_id)} (${escapeHtml(elevVal)}) · ${escapeHtml(fl.level_range)}
        </text>
        <text x="${panelX + 58}" y="${slabY + 34}" fill="${isCur ? '#fde047' : '#cbd5e1'}" font-size="8.2" font-weight="800" font-family="monospace">
          ${escapeHtml(bossHl.slice(0, laddered ? 26 : 30))}
        </text>
        <text x="${panelX + 58}" y="${slabY + 49}" fill="#93c5fd" font-size="8" font-family="monospace">
          ${(fl.rooms || []).length} Chambers · ${(fl.warp_points || []).length} Warps${laddered ? '' : ' · Click to Jump'}
        </text>
        ${isCur ? `<rect x="${panelX + 12 + slabW - 52}" y="${slabY + 52}" width="42" height="13" rx="4" fill="#fde047"/><text x="${panelX + 12 + slabW - 31}" y="${slabY + 62}" text-anchor="middle" fill="#0f172a" font-size="7.5" font-weight="900" font-family="monospace">ACTIVE</text>` : ''}
      </g>
      ${warpShaftSvg}
    `;
  }).join('');

  // Full-spire ladder: every floor is one click away; the bracket marks the detailed window.
  const ladderCellH = 19;
  const ladderStep = 21;
  const ladderX = panelX + panelW - 34;
  const ladderSvg = laddered ? `
    <g id="dungeonFloorLadder">
      <text x="${ladderX + 12}" y="${panelY + 68}" text-anchor="middle" fill="#93c5fd" font-size="7" font-weight="900" font-family="monospace">${total}F</text>
      <rect x="${ladderX - 3}" y="${panelY + 71 + winStart * ladderStep - 1}" width="30" height="${winSize * ladderStep + 1}" rx="4" fill="none" stroke="#fde047" stroke-width="1.2" stroke-dasharray="3 2"/>
      ${orderedFloors.map((fl, idx) => {
        const cy = panelY + 72 + idx * ladderStep;
        const isCur = fl.floor_id === activeFloor.floor_id;
        return `
          <g data-poi-clickable="1" data-floor-ladder="${escapeHtml(fl.floor_id)}" style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(fl.floor_id)}')">
            <rect x="${ladderX}" y="${cy}" width="24" height="${ladderCellH}" rx="3" fill="${isCur ? '#eab308' : '#1e293b'}" stroke="${isCur ? '#ffffff' : '#475569'}" stroke-width="1"/>
            <text x="${ladderX + 12}" y="${cy + 13}" text-anchor="middle" fill="${isCur ? '#0f172a' : '#e2e8f0'}" font-size="7.6" font-weight="900" font-family="monospace">${escapeHtml(fl.floor_id)}</text>
          </g>`;
      }).join('')}
    </g>
  ` : '';

  const bottomExitBanner = isTower ? `
    <g style="cursor:pointer" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')">
      <rect x="${panelX + 12}" y="${panelY + panelH - 36}" width="${panelW - 24}" height="24" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + panelH - 21}" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="900" font-family="monospace">
        🚪 GROUND LEVEL BASE (0m) · Overland Exit
      </text>
    </g>
  ` : `
    <g style="cursor:pointer" onclick="switchDungeonFloor('${escapeHtml(deepestFloorId)}')">
      <rect x="${panelX + 12}" y="${panelY + panelH - 36}" width="${panelW - 24}" height="24" rx="5" fill="#451a03" stroke="#f59e0b" stroke-width="1.4"/>
      <text x="${panelX + panelW / 2}" y="${panelY + panelH - 21}" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="900" font-family="monospace">
        👑 ${escapeHtml(deepestFloorId)} ABYSSAL MVP SANCTUM (${escapeHtml(fmtElev(lastFloor))})
      </text>
    </g>
  `;

  return `
    <g id="dungeonVerticalCutawayDiagram">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="12" fill="rgba(9,11,19,0.94)" stroke="${isTower ? '#38bdf8' : '#c084fc'}" stroke-width="2" filter="url(#cartoDropShadow)"/>
      <text x="${panelX + panelW / 2}" y="${panelY + 20}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">
        ${isTower ? '🗼 VERTICAL TOWER CUTAWAY' : '🕳️ UNDERGROUND DESCENT CUTAWAY'} (${escapeHtml(chain)})
      </text>
      ${surfaceOrRoofBanner}
      ${floorSlabsSvg}
      ${ladderSvg}
      ${bottomExitBanner}
    </g>
  `;
}

function renderDungeonSubMapAtlas(dng, tatlas) {
  const floors = dng.floors || [];
  const activeFloor = floors.find(f => f.floor_id === ATLAS_STATE_STORE.activeFloorId) || floors[0] || { floor_id: 'B1', name: 'Floor 1', rooms: [], warp_points: [], spawns: [] };
  const isTower = dng.dungeon_kind === 'vertical_tower';
  const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'dungeon').effective;

  const filteredSpawns = (activeFloor.spawns || []).filter(sp => {
    if (!matchesAtlasLevelBand(sp.level)) return false;
    if (fFilter === 'All') return true;
    if (fFilter === 'Monster') return sp.entity_type === 'Monster';
    if (fFilter === 'Mini-Boss') return sp.entity_type === 'Mini-Boss';
    if (fFilter === 'Raid') return sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
    if (fFilter === 'MVP') return sp.entity_type === 'MVP';
    return false;
  });

  const rooms = activeFloor.rooms || [];
  const warps = activeFloor.warp_points || [];

  // Connect rooms in sequence with orthogonal L2J stone-slate corridors (rectilinear H+V stone halls)
  const corridorLinesSvg = rooms.map((rm, idx) => {
    if (idx === 0) return '';
    const prev = rooms[idx - 1];
    const x1 = Math.round(((prev.x_pct + prev.w_pct / 2) / 100) * 1040);
    const y1 = Math.round(((prev.y_pct + prev.h_pct / 2) / 100) * 500);
    const x2 = Math.round(((rm.x_pct + rm.w_pct / 2) / 100) * 1040);
    const y2 = Math.round(((rm.y_pct + rm.h_pct / 2) / 100) * 500);
    const orthoPath = `M ${x1},${y1} L ${x2},${y1} L ${x2},${y2}`;
    return `
      <g pointer-events="none">
        <path d="${orthoPath}" fill="none" stroke="#142224" stroke-width="28" stroke-linecap="square" stroke-linejoin="miter"/>
        <path d="${orthoPath}" fill="none" stroke="${isTower ? '#60a5fa' : '#88b8b4'}" stroke-width="22" stroke-linecap="square" stroke-linejoin="miter"/>
        <path d="${orthoPath}" fill="none" stroke="${isTower ? '#1e3a8a' : '#35585a'}" stroke-width="16" stroke-linecap="square" stroke-linejoin="miter"/>
        <path d="${orthoPath}" fill="none" stroke="${isTower ? '#93c5fd' : '#99f6e4'}" stroke-width="1.4" stroke-dasharray="6 6"/>
      </g>
    `;
  }).join('');

  const roomsSvg = rooms.map((rm, rIdx) => {
    const rx = Math.round((rm.x_pct / 100) * 1040);
    const ry = Math.round((rm.y_pct / 100) * 500);
    const rw = Math.round((rm.w_pct / 100) * 1040);
    const rh = Math.round((rm.h_pct / 100) * 500);
    const isBossRoom = rIdx === rooms.length - 1;
    const roomSpawns = (activeFloor.spawns || []).filter((_, sIdx) => (sIdx % Math.max(1, rooms.length)) === rIdx);
    const roomDrops = Array.from(new Set(roomSpawns.flatMap(sp => sp.refinement_drops || []))).slice(0, 4);
    const roomMobSummary = roomSpawns.map(sp => `${sp.name} (Lv.${sp.level} ${sp.entity_type} · HP ${sp.hp_multiplier || '1x'})`).join(' · ')
      || (rm.key_mobs || []).join(', ');
    const poiRoom = {
      title: `${activeFloor.floor_id} · ${rm.name}`,
      category: `${dng.name} (${dng.l2_archetype_alias || ''}) · ${rm.level_range}`,
      thumb: '/thumbs/buildings/wall_arched.webp',
      hoursOrStatus: `ACTIVE FLOOR ${activeFloor.floor_id} · Corridor Width: ${rm.corridor_width_meters}m (>=6.0m Scale Law)`,
      summary: `Tactical Brief: ${roomMobSummary}. +1..+15 Refinement Drops: ${roomDrops.join(', ') || 'Orichalcum Ore, Flux Dust'}. Connected via ${rm.corridor_width_meters}m stone gallery corridors.`,
      address: `${rm.name} (${rm.room_id}) · ${activeFloor.name}`,
      coordinates: `Dungeon Entrance: loc=${dng.entrance_loc} · Floor ${activeFloor.floor_index} of ${floors.length}`,
      scaleSpecs: `Corridor Clearance: ${rm.corridor_width_meters}m (>=6.0m law) · Ceiling Clearance >=4.5m for 1.05m camera`,
      inspectId: dng.studio_node_id,
      connections: [
        ...(rm.key_mobs || []).map(m => ({ label: `👾 ${m}`, badge: rm.level_range })),
        ...roomDrops.map(dr => ({ label: `💎 +1..+15 Refinement Drop: ${dr}`, badge: activeFloor.floor_id }))
      ]
    };
    const p1x = rx + 18, p1y = ry + 38, p2x = rx + rw - 18, p2y = ry + rh - 22;
    const pillarsPath = `M ${p1x - 5},${p1y} h 10 M ${p1x},${p1y - 5} v 10 M ${p2x - 5},${p1y} h 10 M ${p2x},${p1y - 5} v 10 M ${p1x - 5},${p2y} h 10 M ${p1x},${p2y - 5} v 10 M ${p2x - 5},${p2y} h 10 M ${p2x},${p2y - 5} v 10`;
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDungeonRoomPoi('${encodePoiAttr({ ...poiRoom, svgX: rx + Math.round(rw / 2), svgY: ry + Math.round(rh / 2) })}', event); selectStudioMapPoi('${encodePoiAttr({ ...poiRoom, svgX: rx + Math.round(rw / 2), svgY: ry + Math.round(rh / 2) })}', event)">
        <rect x="${rx - 3}" y="${ry - 3}" width="${rw + 6}" height="${rh + 6}" fill="#142224"/>
        <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="${isTower ? 6 : 0}"
              fill="${isTower ? 'rgba(23,43,77,0.88)' : (isBossRoom ? 'rgba(52,86,88,0.92)' : 'rgba(44,74,76,0.90)')}"
              stroke="${isBossRoom ? '#fde047' : (isTower ? '#60a5fa' : '#94c6c2')}" stroke-width="3"/>
        <rect x="${rx + 4}" y="${ry + 4}" width="${rw - 8}" height="${rh - 8}" fill="none" stroke="#1c3032" stroke-width="1.4"/>
        <path d="${pillarsPath}" stroke="#a7f3d0" stroke-width="3.2" stroke-linecap="square"/>
        <rect x="${rx + 8}" y="${ry + 8}" width="${rw - 16}" height="20" rx="2" fill="rgba(15,26,28,0.92)" stroke="${isBossRoom ? '#fde047' : 'rgba(148,198,194,0.65)'}" stroke-width="1"/>
        <text x="${rx + 14}" y="${ry + 21}" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">
          [${activeFloor.floor_id} · RM-${rIdx + 1}] ${escapeHtml(rm.name.slice(0, 28))} (${escapeHtml(rm.level_range)})
        </text>
        <text x="${rx + 14}" y="${ry + rh - 8}" fill="#e2e8f0" font-size="8.5" font-family="monospace">
          Corridor: ${rm.corridor_width_meters}m · +Pillars · Mobs: ${escapeHtml((rm.key_mobs || []).join(', ').slice(0, 30))}
        </text>
      </g>
    `;
  }).join('');

  // Render filtered Monster / Mini-Boss / Raid / MVP spawn pins on the active floor
  const spawnsSvg = filteredSpawns.map((sp, sIdx) => {
    const rm = rooms[sIdx % Math.max(1, rooms.length)] || { x_pct: 35, y_pct: 35, w_pct: 25, h_pct: 25, corridor_width_meters: 8.5 };
    const sx = Math.round(((rm.x_pct + 6 + ((sIdx * 9) % Math.max(8, rm.w_pct - 10))) / 100) * 1040);
    const sy = Math.round(((rm.y_pct + 10 + ((sIdx * 11) % Math.max(8, rm.h_pct - 14))) / 100) * 500);
    const isMvp = sp.entity_type === 'MVP';
    const isRaid = sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
    const isMini = sp.entity_type === 'Mini-Boss';
    const pinCol = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
    const pinIcon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const refDrops = sp.refinement_drops || ['Refinement Flux Dust', 'High-Grade Orichalcum'];
    const poiSpawn = {
      title: `${pinIcon} ${sp.name} (Lv.${sp.level} ${sp.entity_type})`,
      category: `${sp.race_badge} · HP ${sp.hp_multiplier} · ×${sp.spawn_count} Spawns (${sp.respawn_sec}s)`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `Floor ${activeFloor.floor_id} · Aggro: ${sp.aggro} · Corridor Clearance: ${rm.corridor_width_meters || 8.5}m (>=6.0m)`,
      summary: `Protections: ${(sp.protections || []).join(', ')} | Weaknesses: ${(sp.weaknesses || []).join(', ')} | +1..+15 Refinement Drops: ${refDrops.join(', ')}`,
      address: `${rm.name || activeFloor.name} · ${activeFloor.name} · ${dng.name}`,
      coordinates: `NPC ID: ${sp.npc_id} · loc=${sp.loc_coord}`,
      scaleSpecs: `Chamber Corridor Clearance: ${rm.corridor_width_meters || 8.5}m (>=6.0m) · Strict Hierarchy: GOD_SEALED > MVP > RAID > MINI_BOSS > MONSTER`,
      inspectId: dng.studio_node_id,
      connections: [
        { label: `🛡️ Protections: ${(sp.protections || []).join(', ')}`, badge: sp.hp_multiplier },
        { label: `⚡ Weaknesses: ${(sp.weaknesses || []).join(', ')}`, badge: `Lv.${sp.level}` },
        ...refDrops.map(dr => ({ label: `💎 +1..+15 Refinement Drop: ${dr}`, badge: sp.entity_type }))
      ]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDungeonRoomPoi('${encodePoiAttr({ ...poiSpawn, svgX: sx, svgY: sy })}', event); selectStudioMapPoi('${encodePoiAttr({ ...poiSpawn, svgX: sx, svgY: sy })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${sx}" cy="${sy}" r="${isMvp || isRaid ? 16 : 13}" fill="${pinCol}" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${sx}" y="${sy + 4}" text-anchor="middle" font-size="${isMvp || isRaid ? 13 : 11}">${pinIcon}</text>
        <rect x="${sx - 78}" y="${sy + 17}" width="156" height="18" rx="4" fill="rgba(9,7,14,0.92)" stroke="${pinCol}" stroke-width="1.2"/>
        <text x="${sx}" y="${sy + 29}" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(sp.name.slice(0, 19))} (Lv.${sp.level} ×${sp.spawn_count})
        </text>
      </g>
    `;
  }).join('');

  // Render clickable inter-floor Warp Portals (B1 <-> B2 <-> B3 / 1F <-> 2F <-> 3F / Overland Exit)
  const warpsSvg = warps.map(wp => {
    const wx = Math.round((wp.x_pct / 100) * 1040);
    const wy = Math.round((wp.y_pct / 100) * 500);
    const isExit = wp.warp_type === 'overland_exit' || wp.target_floor_id === 'OVERLAND';
    const isBoss = wp.warp_type === 'boss_sanctum_warp';
    const wCol = isExit ? '#10b981' : (isBoss ? '#f59e0b' : '#38bdf8');
    const wIcon = isExit ? '🚪' : (isBoss ? '🔥' : (wp.warp_type === 'floor_up' ? '🪜' : '🕳️'));
    const clickCall = isExit
      ? `exitDungeonSubMap('${escapeHtml(wp.target_loc || dng.entrance_loc || '')}')`
      : `switchDungeonFloor('${escapeHtml(wp.target_floor_id)}', '${escapeHtml(wp.target_loc || '')}')`;
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(wp.label)}"
         style="cursor:pointer" onclick="${clickCall}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${clickCall};}"
         filter="url(#cartoDropShadow)">
        <circle cx="${wx}" cy="${wy}" r="22" fill="rgba(56,189,248,0.18)" stroke="${wCol}" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="${wx}" cy="${wy}" r="15" fill="#0f172a" stroke="${wCol}" stroke-width="2.5"/>
        <text x="${wx}" y="${wy + 5}" text-anchor="middle" font-size="13">${wIcon}</text>
        <rect x="${wx - 110}" y="${wy - 38}" width="220" height="20" rx="6" fill="#0f172a" stroke="${wCol}" stroke-width="1.5"/>
        <text x="${wx}" y="${wy - 25}" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
          ${escapeHtml(wp.label.slice(0, 34))}
        </text>
      </g>
    `;
  }).join('');

  const toastSvg = ATLAS_STATE_STORE.toastMessage ? `
    <g>
      <rect x="310" y="14" width="420" height="26" rx="6" fill="rgba(220,38,38,0.92)" stroke="#fde047" stroke-width="1.5"/>
      <text x="520" y="31" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800" font-family="monospace">
        ⚠️ ${escapeHtml(ATLAS_STATE_STORE.toastMessage)}
      </text>
    </g>
  ` : '';

  const cutawaySvg = renderDungeonVerticalCutawaySvg(dng, activeFloor);
  const dungeonRasterPlate = isTower
    ? '/studio-maps/dungeon_vertical_tower_1f_3f_radar.png'
    : '/studio-maps/dungeon_underground_b1_b3_radar.png';

  const svgInnerHtml = `
    <rect x="0" y="0" width="1040" height="500" fill="${isTower ? '#0d1829' : '#20363a'}"/>
    <image href="${dungeonRasterPlate}" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.86"/>
    <image href="/studio-maps/d01_dungeon_radar_map.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.12"/>
    <g transform="translate(-85, 0) scale(0.84, 1)">
      ${corridorLinesSvg}
      ${roomsSvg}
      ${spawnsSvg}
      ${warpsSvg}
    </g>
    ${cutawaySvg}
    ${renderAtlasOverviewMiniMapPipSvg(dng, tatlas, 'dungeon')}
    ${toastSvg}
  `;

  const floorControlsHtml = `
    <button type="button" onclick="exitDungeonSubMap('${escapeHtml(dng.entrance_loc || '')}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #10b981;background:#064e3b;color:#ecfdf5;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
      🚪 Exit to Overland World Map (Esc)
    </button>
    <button type="button" onclick="stepDungeonFloor(-1)" title="Previous floor (PgUp)"
            style="min-height:28px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #38bdf8;background:#0c4a6e;color:#e0f2fe">
      ⬆ Prev Floor
    </button>
    <button type="button" onclick="stepDungeonFloor(1)" title="Next floor (PgDn)"
            style="min-height:28px;padding:5px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #38bdf8;background:#0c4a6e;color:#e0f2fe">
      ⬇ Next Floor
    </button>
    <span style="display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:100%">
    ${floors.map(f => {
      const isCur = f.floor_id === activeFloor.floor_id;
      const compact = floors.length > 4;
      return `
        <button type="button" data-floor-pill="${escapeHtml(f.floor_id)}" onclick="switchDungeonFloor('${escapeHtml(f.floor_id)}')" title="${escapeHtml(f.name || f.floor_id)}"
                style="min-height:28px;padding:5px ${compact ? 7 : 11}px;border-radius:7px;font-size:${compact ? 10.5 : 11}px;font-weight:900;cursor:pointer;border:1.5px solid ${isCur ? '#fde047' : 'rgba(192,132,252,0.5)'};background:${isCur ? '#7e22ce' : 'rgba(15,23,42,0.92)'};color:${isCur ? '#ffffff' : '#e9d5ff'}">
          ${compact ? escapeHtml(f.floor_id) : `${isTower ? '🗼' : '🕳️'} Floor ${escapeHtml(f.floor_id)} (${escapeHtml(f.level_range)})`}
        </button>
      `;
    }).join('')}
    </span>
  `;

  const defaultPoi = {
    title: `${dng.name} — Floor ${activeFloor.floor_id}`,
    category: `${dng.l2_archetype_alias} · ${activeFloor.level_range}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `MULTI-FLOOR ${isTower ? 'TOWER' : 'LABYRINTH'} (${floors.length ? `${floors[0].floor_id}⇄${floors[floors.length - 1].floor_id}` : ''}, ${floors.length} floors) · ${rooms.length} Rooms · ${filteredSpawns.length} Active Spawn Groups`,
    summary: `Click any green/blue/gold Warp Point on the floor map (or the Floor buttons above) to traverse between ${floors.map(f => f.floor_id).join(' ⇄ ')} or return to the Overland Entrance.`,
    address: `${activeFloor.name} · Entrance loc=${dng.entrance_loc}`,
    coordinates: `Active Floor: ${activeFloor.floor_id} · ${warps.length} Warp Portals`,
    scaleSpecs: `Corridors ≥7.5m–12.0m wide · Unobstructed camera sightlines for 90–120cm characters`,
    inspectId: dng.studio_node_id,
    connections: warps.map(w => ({ label: w.label, badge: w.target_floor_id }))
  };

  return renderCartoShellHtml({
    stepLabel: `🕳️ MULTI-FLOOR DUNGEON & TOWER SUB-MAP · ${escapeHtml(dng.name.toUpperCase())} · FLOOR ${escapeHtml(activeFloor.floor_id)}`,
    title: `${escapeHtml(dng.name)} (${escapeHtml(dng.l2_archetype_alias || '')}) — ${escapeHtml(activeFloor.name)}`,
    subtitle: 'Click any Inter-Floor Warp Portal (🕳️ Descend / 🪜 Ascend / 🔥 Boss Sanctum / 🚪 Overland Exit) to warp between floors immediately',
    activeScaleIndex: 3,
    defaultPoi,
    drillControls: floorControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(filteredSpawns.length),
    bottomPanelHtml: renderAtlasFilteredEntityMatrixHtml(tatlas),
    svgInnerHtml,
    legendItems: [
      { color: '#a855f7', label: 'Subterranean / Tower Room Chamber' },
      { color: '#38bdf8', label: '🕳️ / 🪜 Clickable Inter-Floor Warp Portal' },
      { color: '#ef4444', label: '👾 Normal Monster Spawn' },
      { color: '#f97316', label: '⚔️ Mini-Boss & 🔥 Raid Boss' },
      { color: '#eab308', label: '👑 Floor 3 MVP God-Subordinate Sanctum' }
    ]
  });
}

function renderTownArchetypeBackdropSvg(layoutArchetype, wallPts) {
  if (layoutArchetype === 'radial_moat_sanctuary') {
    // Screenshot 3: Dark Elven / Elven Village with concentric water moat + 4 causeway bridges + central octagon
    return `
      <g id="townArchetypeRadialMoatSanctuary" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#10212b"/>
        <image href="/studio-maps/town_radial_moat_parchment.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.38"/>
        <!-- Outer & Inner Concentric Water Moats -->
        <ellipse cx="520" cy="250" rx="430" ry="215" fill="#0c4a6e" stroke="#38bdf8" stroke-width="4" fill-opacity="0.72"/>
        <ellipse cx="520" cy="250" rx="355" ry="172" fill="#1e293b" stroke="#7dd3fc" stroke-width="3" stroke-dasharray="10 6" fill-opacity="0.72"/>
        <ellipse cx="520" cy="250" rx="285" ry="138" fill="#083344" stroke="#22d3ee" stroke-width="2.5" fill-opacity="0.72"/>
        <!-- 4 Cardinal Stone Causeway Bridges across the Moat -->
        <rect x="492" y="20" width="56" height="460" fill="#334155" stroke="#eab308" stroke-width="2"/>
        <rect x="75" y="226" width="890" height="48" fill="#334155" stroke="#eab308" stroke-width="2"/>
        <!-- Central Sacred Octagon Sanctuary -->
        <polygon points="440,145 600,145 665,205 665,295 600,355 440,355 375,295 375,205"
                 fill="rgba(15,23,42,0.88)" stroke="#fde047" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="520" cy="250" r="64" fill="rgba(6,182,212,0.18)" stroke="#67e8f9" stroke-width="2" stroke-dasharray="5 4"/>
      </g>
    `;
  }
  if (layoutArchetype === 'harbor_fortress_plaza') {
    // Coastal Harbor / Maritime Pier Town with Sea-Gate, 3 Wooden Timber Piers & Breakwater Wall
    return `
      <g id="townArchetypeHarborFortressPlaza" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#1a2e26"/>
        <image href="/studio-maps/d01_town_detailed_blueprint.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.32"/>
        <!-- Southern & Western Coastal Harbor Bay Water -->
        <path d="M 0,340 Q 280,320 540,360 T 1040,335 L 1040,500 L 0,500 Z" fill="#0369a1" stroke="#38bdf8" stroke-width="3"/>
        <path d="M 0,375 Q 320,355 620,390 T 1040,370" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="10 6"/>
        <!-- 3 Harbor Timber Piers & Sea-Gate Quay -->
        <rect x="210" y="335" width="44" height="125" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="2"/>
        <rect x="498" y="345" width="48" height="135" rx="4" fill="#78350f" stroke="#fde047" stroke-width="2.5"/>
        <rect x="760" y="335" width="44" height="125" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="2"/>
        <text x="522" y="472" text-anchor="middle" fill="#bae6fd" font-size="9.5" font-weight="900" font-family="monospace">⚓ HARBOR SEA-GATE &amp; MARITIME QUAY PIERS</text>
        <polygon points="140,60 900,60 930,220 880,355 160,355 110,220"
                 fill="rgba(30,41,59,0.78)" stroke="#fb923c" stroke-width="4.5" stroke-linejoin="round"/>
      </g>
    `;
  }
  if (layoutArchetype === 'schematic_grid_blueprint') {
    // Screenshot 5: Oren by Cheese Crisp Architectural Grid Corridor Backdrop
    return `
      <g id="townArchetypeSchematicGrid" pointer-events="none">
        <rect x="0" y="0" width="1040" height="500" fill="#18202c"/>
        <image href="/studio-maps/town_oren_schematic_plate.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.36"/>
        <polygon points="110,48 930,48 930,452 110,452" fill="rgba(15,23,42,0.78)" stroke="#94a3b8" stroke-width="4"/>
        <rect x="132" y="66" width="776" height="368" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="8 4"/>
        <!-- Architectural Staircases on N/S/E/W Corridors -->
        <g stroke="#cbd5e1" stroke-width="1.5">
          <line x1="495" y1="50" x2="545" y2="50"/><line x1="495" y1="56" x2="545" y2="56"/><line x1="495" y1="62" x2="545" y2="62"/>
          <line x1="495" y1="438" x2="545" y2="438"/><line x1="495" y1="444" x2="545" y2="444"/><line x1="495" y1="450" x2="545" y2="450"/>
        </g>
      </g>
    `;
  }
  // Default: "polygonal_walled_keep" (Screenshot 4 Gludin / Talking Island with hexagonal stone wall + river bridge + north temple)
  return `
    <g id="townArchetypePolygonalWalledKeep" pointer-events="none">
      <rect x="0" y="0" width="1040" height="500" fill="#233729"/>
      <image href="/studio-maps/town_polygonal_keep_parchment.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.38"/>
      <image href="/studio-maps/d01_town_detailed_blueprint.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.18"/>
      <!-- Exterior River Channel & Southern Stone Bridge (Screenshot 4 Gludin / Talking Island style) -->
      <path d="M 0,435 Q 290,415 520,445 T 1040,425" fill="none" stroke="#0284c7" stroke-width="28"/>
      <path d="M 0,435 Q 290,415 520,445 T 1040,425" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-dasharray="8 6"/>
      <rect x="488" y="416" width="64" height="48" rx="4" fill="#475569" stroke="#fde047" stroke-width="2"/>
      <!-- North Temple Sanctuary Terrace -->
      <rect x="370" y="42" width="300" height="72" rx="6" fill="rgba(30,41,59,0.9)" stroke="#eab308" stroke-width="2.5"/>
      <polygon points="${wallPts}" fill="rgba(30,41,59,0.68)" stroke="#eab308" stroke-width="5" stroke-linejoin="round"/>
    </g>
  `;
}

function renderOrenSchematicBlueprintSvg(bp, townNode, visibleMarks, spawnPinSvg) {
  // Screenshot 5: "Oren by Cheese" Architectural CAD Schematic with crisp room blocks, stairs, 1..12 numbered rooms, colored NPC dots & right-hand numbered legend
  const mapW = 750;
  const scaleX = px => Math.round((px / 100) * mapW);
  const scaleY = py => Math.round((py / 100) * 500);
  const npcByBldg = {};
  (bp.npc_roster || []).forEach(n => {
    npcByBldg[n.building_number] = n;
  });

  const schematicStreetsSvg = (bp.streets || []).map(st => {
    const pts = (st.path_pct || []).map(([px, py]) => `${scaleX(px)},${scaleY(py)}`).join(' ');
    const sw = Math.max(12, Math.round((st.width_meters || 12) * 1.5));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#090d14" stroke-width="${sw + 6}" stroke-linecap="square"/>
        <polyline points="${pts}" fill="none" stroke="#475569" stroke-width="${sw}" stroke-linecap="square"/>
        <polyline points="${pts}" fill="none" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="4 4"/>
      </g>
    `;
  }).join('');

  const schematicRoomsSvg = (bp.buildings || []).map(b => {
    const bx = scaleX(b.x_pct);
    const by = scaleY(b.y_pct);
    const bw = Math.max(54, scaleX(b.w_pct));
    const bh = Math.max(38, scaleY(b.h_pct));
    const npc = npcByBldg[b.building_number] || {};
    const dotCol = npc.color_hex || '#eab308';
    const bldgCatalogTab = b.building_number === 7 ? 'equip_shop' : (b.building_number === 8 ? 'consumable_shop' : (b.building_number === 3 ? 'blacksmith' : 'all'));
    const poiBldg = {
      title: `${b.name} (Oren by Cheese Schematic #${b.building_number})`,
      category: `Architectural Room #${b.building_number} · ${npc.name || ''} (${npc.role_title || ''})`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `SCHEMATIC ROOM #${b.building_number} · NPC: ${npc.name || 'Resident'}`,
      summary: b.function || 'Town service building and artisan counter.',
      address: `Room #${b.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `loc=${npc.loc_coord || ''} · Archetype: ${bp.layout_archetype || 'schematic_grid_blueprint'}`,
      scaleSpecs: `Doorway: 2.15m × 1.60m · Counter: 0.58m · Step Riser: 0.14m`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: bldgCatalogTab,
      connections: [{ label: `🏛️ ${b.function}`, badge: `#${b.building_number}` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiBldg, svgX: bx + Math.round(bw / 2), svgY: by + Math.round(bh / 2) })}', event)">
        <!-- Crisp Architectural CAD Room Block with Double Wall & Stair Ticks -->
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#263142" stroke="#e2e8f0" stroke-width="2"/>
        <rect x="${bx + 3}" y="${by + 3}" width="${bw - 6}" height="${bh - 6}" fill="#1b2432" stroke="#64748b" stroke-width="1"/>
        <!-- Doorway Cutout + Architectural Stair Ticks -->
        <rect x="${bx + Math.round(bw / 2) - 8}" y="${by + bh - 4}" width="16" height="6" fill="#475569" stroke="#fde047" stroke-width="0.9"/>
        <!-- Color-coded NPC Dot inside Room (Oren by Cheese style) -->
        <circle cx="${bx + bw - 12}" cy="${by + 12}" r="6.5" fill="${dotCol}" stroke="#ffffff" stroke-width="1.5"/>
        <!-- Large Bold Room Number 1..12 -->
        <text x="${bx + 14}" y="${by + 18}" fill="#ffffff" font-size="12" font-weight="900" font-family="monospace">${b.building_number}</text>
        <text x="${bx + Math.round(bw / 2)}" y="${by + Math.round(bh / 2) + 8}" text-anchor="middle" fill="#cbd5e1" font-size="8.2" font-weight="800" font-family="monospace">
          ${escapeHtml(b.name.replace(/^[0-9]+\.\s*/, '').slice(0, 16))}
        </text>
      </g>
    `;
  }).join('');

  // Right-hand Numbered 1..12 Legend Sidebar inside the SVG (Screenshot 5 "Oren by Cheese")
  const sidebarSvg = `
    <g id="orenByCheeseSchematicLegend">
      <rect x="762" y="14" width="264" height="472" rx="8" fill="#0d131d" stroke="#fde047" stroke-width="1.8"/>
      <text x="894" y="34" text-anchor="middle" fill="#fde047" font-size="10.5" font-weight="900" font-family="monospace">
        📐 "OREN BY CHEESE" SCHEMATIC
      </text>
      <text x="894" y="48" text-anchor="middle" fill="#94a3b8" font-size="8.2" font-weight="700" font-family="monospace">
        NUMBERED ROOMS 1..12 &amp; COLORED NPC DOTS
      </text>
      ${(bp.npc_roster || []).map((npc, idx) => {
        const ry = 62 + idx * 33;
        return `
          <g style="cursor:pointer" onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(npc.loc_coord)}'); render();">
            <rect x="772" y="${ry}" width="244" height="28" rx="4" fill="#161f2e" stroke="rgba(255,255,255,0.1)"/>
            <circle cx="786" cy="${ry + 14}" r="6" fill="${npc.color_hex}" stroke="#ffffff" stroke-width="1.2"/>
            <text x="798" y="${ry + 13}" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
              #${npc.building_number} ${escapeHtml(npc.name.slice(0, 24))}
            </text>
            <text x="798" y="${ry + 24}" fill="#cbd5e1" font-size="7.8" font-family="monospace">
              ${escapeHtml(npc.role_title.slice(0, 28))} (${escapeHtml(npc.role_category)})
            </text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  return `
    <rect x="0" y="0" width="1040" height="500" fill="#111722"/>
    <image href="/studio-maps/town_oren_schematic_plate.png" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.42"/>
    <polygon points="48,28 730,28 730,472 48,472" fill="rgba(27,34,48,0.78)" stroke="#94a3b8" stroke-width="4"/>
    ${schematicStreetsSvg}
    ${schematicRoomsSvg}
    ${sidebarSvg}
  `;
}

function renderTownStreetBlueprintAtlas(townNode, tatlas, whc) {
  const bp = getTownBlueprintData(townNode, tatlas);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const activeTownId = (townNode && (townNode.id || townNode.studio_node_id || townNode.zone_id)) || bp.studio_node_id || ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow';
  const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'town').effective;
  const layoutArchetype = bp.layout_archetype || 'polygonal_walled_keep';
  const isSchematicMode = ATLAS_STATE_STORE.townBlueprintMode === 'schematic';
  const wallPts = (bp.wall_polygon_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');

  const streetsSvg = (bp.streets || []).map(st => {
    const pts = (st.path_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');
    const sw = Math.max(10, Math.round((st.width_meters || 12) * 1.4));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#1e293b" stroke-width="${sw + 6}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#64748b" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="8 6"/>
      </g>
    `;
  }).join('');

  const buildingsSvg = (bp.buildings || []).map(b => {
    const bx = Math.round((b.x_pct / 100) * 1040);
    const by = Math.round((b.y_pct / 100) * 500);
    const bw = Math.round((b.w_pct / 100) * 1040);
    const bh = Math.round((b.h_pct / 100) * 500);
    const bldgCatalogTab = b.building_number === 7 ? 'equip_shop' : (b.building_number === 8 ? 'consumable_shop' : (b.building_number === 3 ? 'blacksmith' : 'all'));
    const poiBldg = {
      title: `${b.name}`,
      category: `Town Blueprint Building #${b.building_number} · ${bp.archetype_subtitle}`,
      thumb: '/thumbs/buildings/tower_round_roof_a.webp',
      hoursOrStatus: `OPEN 24 HOURS · Safe Town Building #${b.building_number}`,
      summary: b.function || 'Town service building and artisan counter.',
      address: `Building #${b.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `Footprint: ${b.w_pct}% × ${b.h_pct}% · Roof: ${b.roof_color}`,
      scaleSpecs: `Doorway: 2.15m × 1.60m · Counter: 0.58m · Step Riser: 0.14m (90–120cm scale law)`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: bldgCatalogTab,
      connections: [{ label: `🏛️ Function: ${b.function}`, badge: `#${b.building_number}` }]
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiBldg, svgX: bx + Math.round(bw / 2), svgY: by + Math.round(bh / 2) })}', event)">
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="${b.roof_color || '#475569'}" stroke="#fde68a" stroke-width="1.8"/>
        <circle cx="${bx + 14}" cy="${by + 14}" r="10" fill="#0f172a" stroke="#fde047" stroke-width="1.5"/>
        <text x="${bx + 14}" y="${by + 18}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">${b.building_number}</text>
        <text x="${bx + Math.round(bw / 2)}" y="${by + Math.round(bh / 2) + 4}" text-anchor="middle"
              style="paint-order:stroke fill;stroke:#0f172a;stroke-width:3px;fill:#ffffff;font-size:9px;font-weight:800">
          ${escapeHtml(b.name.replace(/^[0-9]+\.\s*/, '').slice(0, 20))}
        </text>
      </g>
    `;
  }).join('');

  // 7 Canonical Service Marks (equip_shop, consumable_shop, blacksmith, temple, warehouse, guild, gatekeeper)
  const visibleMarks = (bp.service_marks || []).filter(() => fFilter === 'All' || fFilter === 'TownMarks');
  const marksSvg = visibleMarks.map(m => {
    const mx = Math.round((m.x_pct / 100) * 1040);
    const my = Math.round((m.y_pct / 100) * 500);
    const isShopOrRefine = ['equip_shop', 'consumable_shop', 'blacksmith', 'refinement_anvils'].includes(m.mark_type);
    const poiMark = {
      title: `${m.icon} ${m.label} (${m.mark_type})`,
      category: `Town Service Mark · Building #${m.building_number} · ${m.npc_name}`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: `SERVICE MARK: ${m.mark_type.toUpperCase()} · Building #${m.building_number}`,
      summary: `${m.description} ${isShopOrRefine ? 'Inspect concrete Shop Stock (Weapons, Armor, Potions) and +1 to +15 Refinement Anvil Rates & Material Spoils below!' : ''}`,
      address: `Building #${m.building_number} · ${bp.archetype_subtitle}`,
      coordinates: `Mark ID: ${m.mark_id} · NPC: ${m.npc_name}`,
      scaleSpecs: `0.58m Shop/Forge Counter · 4.4m Artisan Walkway`,
      inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
      shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
      activeCatalogTab: isShopOrRefine ? m.mark_type : 'all',
      connections: [{ label: `🛍️ Resident NPC: ${m.npc_name}`, badge: m.mark_type }]
    };
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(m.label)}"
         style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiMark, svgX: mx, svgY: my })}', event)"
         filter="url(#cartoDropShadow)">
        <circle cx="${mx}" cy="${my}" r="15" fill="#0f172a" stroke="#fde047" stroke-width="2.2"/>
        <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="13">${m.icon}</text>
        <rect x="${mx - 68}" y="${my + 17}" width="136" height="17" rx="4" fill="rgba(15,23,42,0.94)" stroke="#fde047" stroke-width="1"/>
        <text x="${mx}" y="${my + 28}" text-anchor="middle" fill="#fde047" font-size="8.5" font-weight="800" font-family="monospace">
          #${m.building_number} ${escapeHtml(m.mark_type)}
        </text>
      </g>
    `;
  }).join('');

  // 4 Town Gates (linking to adjacent hunting grounds or dungeons)
  const gatesSvg = (bp.gates || []).map(g => {
    const gx = Math.round((g.x_pct / 100) * 1040);
    const gy = Math.round((g.y_pct / 100) * 500);
    const isDngGate = g.target_zone_id && (g.target_zone_id.includes('dungeon') || g.target_zone_id.includes('catacomb'));
    const isTownGate = g.target_zone_id && g.target_zone_id.includes('zone-town-');
    const clickAct = isDngGate
      ? `openDungeonSubMap('${escapeHtml(g.target_zone_id)}')`
      : (isTownGate
        ? `focusTownStreetBlueprint('${escapeHtml(g.target_zone_id)}')`
        : `zoomStudioMap(0, false, 2.5)`);
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickAct}" filter="url(#cartoDropShadow)">
        <circle cx="${gx}" cy="${gy}" r="15" fill="${isDngGate ? '#7e22ce' : '#1d4ed8'}" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${gx}" y="${gy + 4}" text-anchor="middle" font-size="12">${isDngGate ? '🕳️' : '🚪'}</text>
        <rect x="${gx - 88}" y="${gy + (gy > 400 ? -34 : 17)}" width="176" height="18" rx="4" fill="#0f172a" stroke="#93c5fd" stroke-width="1.2"/>
        <text x="${gx}" y="${gy + (gy > 400 ? -22 : 29)}" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(g.name.slice(0, 28))}
        </text>
      </g>
    `;
  }).join('');

  // Central Player Race Spawn / Shrine Monument inside the Town Plaza
  const raceBind = getStudioRaceBinding(activeTownId) || {
    name: (bp.race_spawn_point && bp.race_spawn_point.shrine_name) ? `${bp.race_spawn_point.race_key} (${bp.race_spawn_point.shrine_name})` : 'Accord Shrine',
    icon: '🧬'
  };
  const spawnX = Math.round((((bp.race_spawn_point && bp.race_spawn_point.x_pct) || 50) / 100) * 1040);
  const spawnY = Math.round((((bp.race_spawn_point && bp.race_spawn_point.y_pct) || 49) / 100) * 500);
  const spawnPinSvg = (fFilter === 'All' || fFilter === 'RaceSpawns' || fFilter === 'TownMarks') ? `
    <g data-poi-clickable="1" style="cursor:pointer" transform="translate(${spawnX}, ${spawnY})">
      <circle cx="0" cy="0" r="24" fill="rgba(16,185,129,0.25)" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3"/>
      <circle cx="0" cy="0" r="14" fill="#065f46" stroke="#fde047" stroke-width="2.2"/>
      <text x="0" y="5" text-anchor="middle" font-size="13">🧬</text>
      <rect x="-98" y="-36" width="196" height="18" rx="5" fill="#064e3b" stroke="#34d399" stroke-width="1.2"/>
      <text x="0" y="-24" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="900" font-family="monospace">
        🧬 SPAWN SHRINE: ${escapeHtml(((bp.race_spawn_point && bp.race_spawn_point.shrine_name) || raceBind.name).slice(0, 22).toUpperCase())}
      </text>
    </g>
  ` : '';

  // Oren by Cheese 1..12 Color-Coded NPC Roster Panel below the blueprint canvas
  const roleColors = {
    trainer: { label: 'Red = Trainer / Guild Master', hex: '#ef4444' },
    merchant: { label: 'Yellow = Merchant (Shop + Refinement)', hex: '#eab308' },
    warehouse: { label: 'Green = Warehouse Keeper', hex: '#22c55e' },
    guard: { label: 'Blue = Town Gate Guard', hex: '#3b82f6' },
    gatekeeper: { label: 'Purple = Gatekeeper Teleporter', hex: '#a855f7' },
    priest: { label: 'Cyan = Temple High Priest', hex: '#06b6d4' }
  };

  const bottomRosterHtml = `
    <div style="padding:12px 16px;background:#0f1520;border-top:1px solid rgba(255,255,255,0.12)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:900;color:#fde047">
          🏛️ TOWN STREET BLUEPRINT SERVICE MARKS (7) &amp; NUMBERED 1..12 NPC ROSTER ("OREN BY CHEESE" COLOR STANDARD)
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px">
          ${Object.values(roleColors).map(rc => `
            <span style="display:inline-flex;align-items:center;gap:4px;color:#cbd5e1">
              <span style="width:9px;height:9px;border-radius:999px;background:${rc.hex};display:inline-block"></span>
              <span>${escapeHtml(rc.label)}</span>
            </span>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:6px">
        ${(bp.npc_roster || []).map(npc => `
          <div onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(npc.loc_coord)}'); render();"
               style="padding:6px 9px;border-radius:6px;background:#161f2e;border-left:3.5px solid ${npc.color_hex};border-top:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:6px">
            <div style="min-width:0">
              <div style="font-size:11px;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                <span class="mono" style="color:#fde047">#${npc.building_number}</span> ${escapeHtml(npc.name)}
              </div>
              <div style="font-size:10px;color:#94a3b8">${escapeHtml(npc.role_title)} (<span class="mono">${escapeHtml(npc.role_category)}</span>)</div>
            </div>
            <span class="mono" style="font-size:9.5px;color:#38bdf8;flex-shrink:0">${escapeHtml(npc.loc_coord)}</span>
          </div>
        `).join('')}
      </div>
      <!-- Lineage II Library Quest Codex (legacy-lineage2.com/Knowledge/quest.html Standard) -->
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(250,204,21,0.22)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
          <span style="font-size:11.5px;font-weight:900;color:#fde047">📜 LINEAGE II LIBRARY STARTER QUEST CODEX (NPC-ANCHORED ONE-TIME &amp; REPEATABLE CONTRACTS · MAX LEVEL GAP ≤6)</span>
          <span class="mono" style="font-size:10px;color:#34d399">Ref: legacy-lineage2.com/Knowledge/quest.html</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">
          ${(((DATA && DATA.studioPerspectives && DATA.studioPerspectives.biomeThemesCatalog && DATA.studioPerspectives.biomeThemesCatalog.starter_quest_codex && DATA.studioPerspectives.biomeThemesCatalog.starter_quest_codex.quests) || [])).map(q => {
            const isDngQ = String(q.target_hunting_zone_id || '').includes('dungeon');
            const qClick = isDngQ
              ? `openDungeonSubMap('${escapeHtml(q.target_hunting_zone_id)}', 'B1')`
              : `focusFieldTacticalBlueprint('${escapeHtml(q.target_hunting_zone_id)}', '')`;
            return `
              <div onclick="${qClick}" style="padding:7px 10px;border-radius:6px;background:#131c2b;border-left:3.5px solid ${q.repeatable ? '#38bdf8' : '#fde047'};cursor:pointer">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:11px;font-weight:800;color:#f8fafc">📜 [!] ${escapeHtml(q.title)}</span>
                  <span class="mono" style="font-size:9px;padding:1px 5px;border-radius:4px;background:${q.repeatable ? '#0369a1' : '#854d0e'};color:#ffffff">${q.repeatable ? 'REPEATABLE' : 'ONE-TIME'} · Lv.${(q.recommended_level_range || [1,6]).join('–')}</span>
                </div>
                <div style="font-size:9.8px;color:#fde68a;margin-top:2px">Giver: <strong>#${q.giver_building_number} ${escapeHtml(q.giver_npc_name)}</strong> (<span class="mono">loc=${escapeHtml(q.giver_loc_coord)}</span>)</div>
                <div style="font-size:9.5px;color:#cbd5e1;margin-top:2px">Hunt: ${escapeHtml((q.target_monsters || []).join(', '))} ➔ Drop: <strong>${escapeHtml((q.quest_item_drop && q.quest_item_drop.item_name) || '')}</strong></div>
                <div style="font-size:9.2px;color:#4ade80;margin-top:2px">🎁 Reward: ${(q.rewards && q.rewards.adena) || 0} Adena + ${escapeHtml(((q.rewards && q.rewards.items) || []).join(', '))}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  const archetypeLabels = {
    radial_moat_sanctuary: '🌊 Radial Moat Sanctuary (Screenshot 3 Dark Elven / Elven Village)',
    polygonal_walled_keep: '🏰 Polygonal Walled Keep (Screenshot 4 Gludin / Talking Island)',
    schematic_grid_blueprint: '📐 Architectural Grid Blueprint (Screenshot 5 "Oren by Cheese")',
    harbor_fortress_plaza: '⚓ Coastal Harbor & Fortress Plaza (Pier & Sea-Gate Archetype)'
  };
  const activeArchetypeLabel = archetypeLabels[layoutArchetype] || archetypeLabels.polygonal_walled_keep;

  const pipWorldRadarSvg = renderAtlasOverviewMiniMapPipSvg(activeTownId, tatlas, 'town');
  const svgInnerHtml = isSchematicMode
    ? `${renderOrenSchematicBlueprintSvg(bp, townNode, visibleMarks, spawnPinSvg)}${pipWorldRadarSvg}`
    : `
      ${renderTownArchetypeBackdropSvg(layoutArchetype, wallPts)}
      ${streetsSvg}
      ${buildingsSvg}
      ${marksSvg}
      ${gatesSvg}
      ${spawnPinSvg}
      <g pointer-events="none">
        <rect x="16" y="432" width="380" height="24" rx="6" fill="rgba(15,23,42,0.92)" stroke="#fde047" stroke-width="1.2"/>
        <text x="206" y="448" text-anchor="middle" fill="#fde047" font-size="9" font-weight="900" font-family="monospace">
          ARCHETYPE: ${escapeHtml(layoutArchetype.toUpperCase())}
        </text>
      </g>
      ${pipWorldRadarSvg}
    `;

  const defaultPoi = {
    title: bp.archetype_subtitle,
    category: `Tier 3 Semantic Zoom (4.5×–12.0×) · ${activeArchetypeLabel}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `ARCHETYPE: ${layoutArchetype.toUpperCase()} · 7 SERVICE MARKS · 12 BUILDINGS & NPCS`,
    summary: 'Click any ⚔️ Equip Shop, 🧪 Consumable Shop, or ⚒️ Refinement & Blacksmith on the Town Blueprint to inspect concrete Shop Stock (Weapons, Armor, Potions) and +1 to +15 Refinement Anvil Rates & Material Spoils.',
    address: bp.archetype_subtitle,
    coordinates: `Zoom: ${STUDIO_MAP_ZOOM.toFixed(2)}× · loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y}`,
    scaleSpecs: `Layout Archetype: ${layoutArchetype} · Main Avenue: 14.0m · Crossway: 12.5m · Shop Counters: 0.58m`,
    inspectId: (townNode && townNode.id) || 'town-lantern-hollow',
    shopAndRefinementCatalog: bp.shop_and_refinement_catalog || null,
    activeCatalogTab: 'all',
    connections: (bp.service_marks || []).map(m => ({ label: `${m.icon} #${m.building_number} ${m.label} (${m.npc_name})`, badge: m.mark_type }))
  };

  const linkedDngGate = (bp.gates || []).find(g => g.target_zone_id && (g.target_zone_id.includes('dungeon') || g.target_zone_id.includes('catacomb')));
  const linkedDngId = (linkedDngGate && linkedDngGate.target_zone_id) || 'zone-dungeon-kiln-cellar';

  const townControlsHtml = `
    <button type="button" onclick="stepOutSubMapToOverlandRegional(2.6)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #38bdf8;background:#0c4a6e;color:#e0f2fe"
            title="Smooth multi-level transition to Regional Overland (2.6×) anchored on this town with zero position shift">
      ⤴ Step Out to Regional Map (2.6× · Zero-Shift)
    </button>
    <button type="button" onclick="zoomStudioMap(0, true)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#0f172a;color:#fde047">
      ⬅ Zoom Out to Overland World Map (1.0×)
    </button>
    <select aria-label="Switch Active Town Street Blueprint" onchange="if(this.value){const [tid,loc]=this.value.split('|');focusTownStreetBlueprint(tid,loc);}"
            style="min-height:28px;padding:4px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #4ade80;background:#064e3b;color:#ecfdf5">
      ${allTowns.map(t => {
        const sel = (t.studio_node_id === activeTownId || t.zone_id === activeTownId) ? 'selected' : '';
        const tArch = (t.town_blueprint && t.town_blueprint.layout_archetype) || 'polygonal_walled_keep';
        return `<option value="${escapeHtml(t.studio_node_id)}|${escapeHtml(t.loc_coord || '')}" ${sel}>🏰 ${escapeHtml(t.name)} [${escapeHtml(tArch)}]</option>`;
      }).join('')}
    </select>
    <div style="display:inline-flex;background:#0f172a;padding:2px;border-radius:8px;border:1.5px solid #fde047">
      <button type="button" onclick="setTownBlueprintMode('parchment')"
              style="min-height:24px;padding:3px 9px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:none;background:${!isSchematicMode ? '#d97706' : 'transparent'};color:${!isSchematicMode ? '#ffffff' : '#cbd5e1'}">
        📜 Parchment Town Map (Screenshots 3 &amp; 4)
      </button>
      <button type="button" onclick="setTownBlueprintMode('schematic')"
              style="min-height:24px;padding:3px 9px;border-radius:6px;font-size:10.5px;font-weight:900;cursor:pointer;border:none;background:${isSchematicMode ? '#2563eb' : 'transparent'};color:${isSchematicMode ? '#ffffff' : '#cbd5e1'}">
        📐 Architectural Schematic ("Oren by Cheese" Screenshot 5)
      </button>
    </div>
    <button type="button" onclick="openDungeonSubMap('${escapeHtml(linkedDngId)}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff">
      🕳️ Warp to Connected Dungeon (${escapeHtml(linkedDngId)}) ➔
    </button>
  `;

  return renderCartoShellHtml({
    stepLabel: `🏘️ TIER 3 SEMANTIC ZOOM (${STUDIO_MAP_ZOOM.toFixed(2)}×) · TOWN STREET, BUILDING & SERVICE-MARK BLUEPRINT`,
    title: `${escapeHtml(bp.archetype_subtitle)} — Streets, #1..#12 Buildings, 7 Shop/Refinement Marks & NPC Roster`,
    subtitle: 'Inspired by Lineage II Gludin/Dark Elven Village & Oren by Cheese: click any Building #1..#12, Service Mark (⚔️/🧪/⚒️/🏛️/📦/🛡️/🌀), or Gate',
    activeScaleIndex: 4,
    defaultPoi,
    drillControls: townControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(visibleMarks.length),
    bottomPanelHtml: `${bottomRosterHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`,
    svgInnerHtml,
    legendItems: [
      { color: '#ef4444', label: 'Trainer / Guild (#1,#2,#9)' },
      { color: '#eab308', label: 'Merchant: Equip, Grocery & Blacksmith (#3,#7,#8)' },
      { color: '#22c55e', label: 'Warehouse Vault (#6)' },
      { color: '#a855f7', label: 'Gatekeeper Teleport (#5)' },
      { color: '#06b6d4', label: 'Temple High Priest (#4)' },
      { color: '#3b82f6', label: 'Town Gate Guards (#10,#11,#12)' }
    ]
  });
}

function renderFieldOrFortressTacticalBlueprintAtlas(targetIdOrEntry, tatlas) {
  const resolved = getFieldOrFortressBlueprintData(targetIdOrEntry, tatlas);
  if (!resolved) {
    return '';
  }
  const { kind, entry, bp } = resolved;
  const isFort = kind === 'fortress';
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'field').effective;

  const perimArr = bp.terrain_perimeter_pct || bp.bastion_wall_pct || [[10, 14], [88, 12], [92, 48], [86, 86], [14, 88], [8, 50]];
  const perimPts = perimArr.map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');

  const trailsSvg = (bp.patrol_trails || []).map(tr => {
    const pts = (tr.path_pct || []).map(([px, py]) => `${Math.round((px / 100) * 1040)},${Math.round((py / 100) * 500)}`).join(' ');
    const sw = Math.max(8, Math.round((tr.width_meters || 9) * 1.3));
    return `
      <g pointer-events="none">
        <polyline points="${pts}" fill="none" stroke="#1c1917" stroke-width="${sw + 5}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#78716c" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="${pts}" fill="none" stroke="#fde047" stroke-width="1.5" stroke-dasharray="7 5"/>
      </g>
    `;
  }).join('');

  // Camp & Shrine Marks (Supply Camp, Wayfarer Shrine, Gatekeeper Waypoint, Refinement Ore Vein)
  const visibleMarks = (bp.camp_and_shrine_marks || []).filter(() => fFilter === 'All' || fFilter === 'TownMarks');
  const marksSvg = visibleMarks.map(m => {
    const mx = Math.round((m.x_pct / 100) * 1040);
    const my = Math.round((m.y_pct / 100) * 500);
    const poiMark = {
      title: `${m.icon} ${m.label} (${m.mark_type})`,
      category: `${isFort ? 'Fortress / Harbor' : 'Field Hunting Area'} Tactical Mark · ${m.npc_or_node}`,
      thumb: '/thumbs/props/chest.webp',
      hoursOrStatus: `ACTIVE ${m.mark_type.toUpperCase()} · ${entry.name}`,
      summary: m.description,
      address: `${m.label} · ${bp.archetype_subtitle}`,
      coordinates: `Mark ID: ${m.mark_id} · Node: ${m.npc_or_node}`,
      scaleSpecs: `Clearance ≥6.0m · Wayfarer & Refinement Vein Access`,
      inspectId: entry.studio_node_id,
      connections: [{ label: `📍 ${m.npc_or_node}`, badge: m.mark_type }]
    };
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(m.label)}"
         style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiMark, svgX: mx, svgY: my })}', event)"
         filter="url(#cartoDropShadow)">
        <circle cx="${mx}" cy="${my}" r="15" fill="#064e3b" stroke="#fde047" stroke-width="2.2"/>
        <text x="${mx}" y="${my + 5}" text-anchor="middle" font-size="13">${m.icon}</text>
        <rect x="${mx - 74}" y="${my + 17}" width="148" height="17" rx="4" fill="rgba(6,78,59,0.94)" stroke="#34d399" stroke-width="1"/>
        <text x="${mx}" y="${my + 28}" text-anchor="middle" fill="#ecfdf5" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(m.mark_type.slice(0, 20))}
        </text>
      </g>
    `;
  }).join('');

  // Spawn Territories (Monster Pack Rings, Mini-Boss Patrols, Raid Boss Arenas, MVP Sanctums + Refinement Drop Badges)
  const visibleTerritories = (bp.spawn_territories || []).filter(st => {
    if (!matchesAtlasLevelBand(st.level)) return false;
    if (fFilter === 'All') return true;
    return st.entity_type === fFilter;
  });

  const territoriesSvg = visibleTerritories.map(st => {
    const sx = Math.round((st.x_pct / 100) * 1040);
    const sy = Math.round((st.y_pct / 100) * 500);
    const rPx = Math.max(32, Math.round((st.radius_pct / 100) * 500));
    const isMvp = st.entity_type === 'MVP';
    const isRaid = st.entity_type === 'Raid';
    const isMini = st.entity_type === 'Mini-Boss';
    const col = isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444'));
    const fillRgba = isMvp ? 'rgba(234,179,8,0.18)' : (isRaid ? 'rgba(249,115,22,0.18)' : (isMini ? 'rgba(168,85,247,0.18)' : 'rgba(239,68,68,0.16)'));
    const icon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const ringKindLabel = isMvp ? 'MVP Boss Sanctum' : (isRaid ? 'Raid Boss Arena' : (isMini ? 'Mini-Boss Patrol' : 'Monster Pack Ring'));
    const dropsStr = (st.refinement_drops || []).join(' · ');
    const poiTerr = {
      title: `${icon} ${st.mob_name} (Lv.${st.level} ${st.entity_type})`,
      category: `${ringKindLabel} · ×${st.count} (${st.respawn}) · loc=${st.loc_coord}`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `${ringKindLabel.toUpperCase()} · Respawn ${st.respawn}`,
      summary: `Refinement Drops: ${dropsStr}`,
      address: `${entry.name} · loc=${st.loc_coord}`,
      coordinates: `Territory: ${st.territory_id} · Radius: ${st.radius_pct}%`,
      scaleSpecs: `Refinement Drops: ${dropsStr}`,
      inspectId: entry.studio_node_id,
      connections: (st.refinement_drops || []).map(d => ({ label: `💎 Refinement Drop: ${d}`, badge: st.entity_type }))
    };
    return `
      <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiTerr, svgX: sx, svgY: sy })}', event)" filter="url(#cartoDropShadow)">
        <circle cx="${sx}" cy="${sy}" r="${rPx}" fill="${fillRgba}" stroke="${col}" stroke-width="2.2" stroke-dasharray="${isMvp || isRaid ? 'none' : '6 4'}"/>
        <circle cx="${sx}" cy="${sy}" r="14" fill="${col}" stroke="#ffffff" stroke-width="2"/>
        <text x="${sx}" y="${sy + 4}" text-anchor="middle" font-size="12">${icon}</text>
        <rect x="${sx - 88}" y="${sy + 17}" width="176" height="17" rx="4" fill="rgba(9,13,20,0.92)" stroke="${col}" stroke-width="1.2"/>
        <text x="${sx}" y="${sy + 28}" text-anchor="middle" fill="#f8fafc" font-size="8.5" font-weight="800" font-family="monospace">
          ${escapeHtml(st.mob_name.slice(0, 21))} (Lv.${st.level} ×${st.count})
        </text>
        <rect x="${sx - 84}" y="${sy + 36}" width="168" height="15" rx="4" fill="rgba(30,27,75,0.92)" stroke="#38bdf8" stroke-width="1"/>
        <text x="${sx}" y="${sy + 46}" text-anchor="middle" fill="#bae6fd" font-size="7.8" font-weight="800" font-family="monospace">
          💎 ${escapeHtml(((st.refinement_drops && st.refinement_drops[0]) || 'Refinement Ore').slice(0, 24))}
        </text>
      </g>
    `;
  }).join('');

  // Clickable Dungeon Entrance Warps (calling openDungeonSubMap(dungeonId, 'B1' / '1F'))
  const warpsSvg = (bp.dungeon_entrance_warps || []).map(dw => {
    const wx = Math.round((dw.x_pct / 100) * 1040);
    const wy = Math.round((dw.y_pct / 100) * 500);
    const clickCall = `openDungeonSubMap('${escapeHtml(dw.dungeon_id)}', '${escapeHtml(dw.floor_id || 'B1')}')`;
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(dw.label)}"
         style="cursor:pointer" onclick="${clickCall}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${clickCall};}"
         filter="url(#cartoDropShadow)">
        <circle cx="${wx}" cy="${wy}" r="24" fill="rgba(168,85,247,0.28)" stroke="#fde047" stroke-width="2.2" stroke-dasharray="4 3"/>
        <circle cx="${wx}" cy="${wy}" r="16" fill="#581c87" stroke="#ffffff" stroke-width="2.2"/>
        <text x="${wx}" y="${wy + 5}" text-anchor="middle" font-size="13">🕳️</text>
        <rect x="${wx - 108}" y="${wy - 38}" width="216" height="20" rx="6" fill="#3b0764" stroke="#fde047" stroke-width="1.5"/>
        <text x="${wx}" y="${wy - 25}" text-anchor="middle" fill="#fde047" font-size="8.8" font-weight="900" font-family="monospace">
          ${escapeHtml(dw.label.slice(0, 34))}
        </text>
      </g>
    `;
  }).join('');

  const primaryWarp = (bp.dungeon_entrance_warps && bp.dungeon_entrance_warps[0]) || { dungeon_id: 'zone-dungeon-kiln-cellar', floor_id: 'B1', label: '🕳️ Enter Connected Dungeon (B1)' };

  const drillControlsHtml = `
    <button type="button" onclick="stepOutSubMapToOverlandRegional(2.6)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #38bdf8;background:#0c4a6e;color:#e0f2fe"
            title="Smooth multi-level transition to Regional Overland (2.6×) anchored on this zone with zero position shift">
      ⤴ Step Out to Regional Map (2.6× · Zero-Shift)
    </button>
    <button type="button" onclick="zoomStudioMap(0, true)"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #fde047;background:#0f172a;color:#fde047">
      ⬅ Zoom Out to Overland World Map (1.0×)
    </button>
    <select aria-label="Switch Active Field Tactical Blueprint" onchange="if(this.value){const [fid,loc]=this.value.split('|');focusFieldTacticalBlueprint(fid,loc);}"
            style="min-height:28px;padding:4px 9px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #86efac;background:#052e16;color:#f0fdf4">
      ${allFields.map(f => {
        const sel = (f.zone_id === entry.zone_id || f.studio_node_id === entry.studio_node_id) ? 'selected' : '';
        return `<option value="${escapeHtml(f.zone_id)}|${escapeHtml(f.loc_coord || '')}" ${sel}>🏕️ ${escapeHtml(f.name)}</option>`;
      }).join('')}
      ${allForts.map(h => {
        const sel = (h.zone_id === entry.zone_id) ? 'selected' : '';
        return `<option value="${escapeHtml(h.zone_id)}|${escapeHtml(h.loc_coord || '')}" ${sel}>🛡️ ${escapeHtml(h.name)}</option>`;
      }).join('')}
    </select>
    <button type="button" onclick="openDungeonSubMap('${escapeHtml(primaryWarp.dungeon_id)}', '${escapeHtml(primaryWarp.floor_id || 'B1')}')"
            style="min-height:28px;padding:5px 11px;border-radius:7px;font-size:11px;font-weight:900;cursor:pointer;border:1.5px solid #e9d5ff;background:#7e22ce;color:#ffffff">
      🕳️ Dungeon Entrance Warp: ${escapeHtml(primaryWarp.dungeon_id)} (${escapeHtml(primaryWarp.floor_id || 'B1')}) ➔
    </button>
  `;

  const bottomTacticalPanelHtml = `
    <div style="padding:12px 16px;background:#0f1520;border-top:1px solid rgba(255,255,255,0.12)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:900;color:#86efac">
          🏕️ FIELD &amp; FORTRESS TACTICAL BLUEPRINT — MONSTER PACK RINGS, MINI-BOSS PATROLS, RAID ARENAS, REFINEMENT DROPS &amp; DUNGEON WARPS
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${(bp.dungeon_entrance_warps || []).map(dw => `
            <button type="button" onclick="openDungeonSubMap('${escapeHtml(dw.dungeon_id)}', '${escapeHtml(dw.floor_id || 'B1')}')"
                    style="padding:3px 9px;border-radius:6px;border:1px solid #fde047;background:#581c87;color:#fde047;font-size:10px;font-weight:800;cursor:pointer">
              ${escapeHtml(dw.label)} (${escapeHtml(dw.dungeon_id)} · ${escapeHtml(dw.floor_id || 'B1')})
            </button>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px">
        ${(bp.spawn_territories || []).map(st => `
          <div onclick="STUDIO_MAP_LOC=clampWorldLocCoord('${escapeHtml(st.loc_coord)}'); render();"
               style="padding:7px 10px;border-radius:6px;background:#161f2e;border-left:3.5px solid ${st.entity_type === 'MVP' ? '#eab308' : (st.entity_type === 'Raid' ? '#f97316' : (st.entity_type === 'Mini-Boss' ? '#a855f7' : '#ef4444'))};cursor:pointer">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:800;color:#f8fafc">${escapeHtml(st.mob_name)}</span>
              <span class="mono" style="font-size:9.5px;color:#fde047">Lv.${st.level} · ${escapeHtml(st.entity_type)}</span>
            </div>
            <div style="font-size:10px;color:#bae6fd;margin-top:3px">
              💎 Refinement Drops: ${escapeHtml((st.refinement_drops || []).join(', '))}
            </div>
          </div>
        `).join('')}
      </div>
      <!-- 6-Layer Composable Map Pipeline (Edit Walkway / River / Tree Grove Without Rebuilding Full Map) -->
      <div style="margin-top:10px;padding:9px 12px;border-radius:8px;background:#0b1320;border:1px solid rgba(56,189,248,0.35)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
          <span style="font-size:11.5px;font-weight:900;color:#38bdf8">🧩 6-LAYER COMPOSABLE CARTOGRAPHIC PIPELINE (ISOLATED SVG LAYER HOT-PATCH · ZERO FULL-MAP REBUILD)</span>
          <span id="atlasComposablePatchReadout" class="mono" style="font-size:10px;color:#4ade80">Incremental Patches: ${ATLAS_INCREMENTAL_LAYER_PATCH_COUNT} · Full Rebuilds: 0 (Isolated Layer &lt;5ms)</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <button type="button" onclick="addIncrementalComposableFeature('walkways')" style="padding:4px 9px;border-radius:6px;border:1px solid #fde047;background:#422006;color:#fef08a;font-size:10px;font-weight:800;cursor:pointer">+ Add Small Walkway (Layer 3 Only)</button>
          <button type="button" onclick="addIncrementalComposableFeature('rivers')" style="padding:4px 9px;border-radius:6px;border:1px solid #38bdf8;background:#082f49;color:#e0f2fe;font-size:10px;font-weight:800;cursor:pointer">+ Add River Tributary (Layer 1 Only)</button>
          <button type="button" onclick="addIncrementalComposableFeature('trees')" style="padding:4px 9px;border-radius:6px;border:1px solid #4ade80;background:#052e16;color:#dcfce7;font-size:10px;font-weight:800;cursor:pointer">+ Add Tree Canopy Grove (Layer 4 Only)</button>
          <button type="button" onclick="addIncrementalComposableFeature('quest_rings')" style="padding:4px 9px;border-radius:6px;border:1px solid #f59e0b;background:#451a03;color:#fde68a;font-size:10px;font-weight:800;cursor:pointer">+ Add l2sanctum Quest Ring (Layer 5 Only)</button>
          <button type="button" onclick="undoLastIncrementalComposableFeature()" style="padding:4px 9px;border-radius:6px;border:1px solid #f87171;background:#450a0a;color:#fecaca;font-size:10px;font-weight:800;cursor:pointer">↩️ Undo Last</button>
          <button type="button" onclick="saveIncrementalComposableFeaturesToDisk()" style="padding:4px 9px;border-radius:6px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:10px;font-weight:800;cursor:pointer">💾 Save Layer Diff to JSON</button>
          <span style="font-size:9.5px;color:#94a3b8;margin-left:4px">Toggle Layers:</span>
          ${[
            ['layer_1_hydrology_splines', '🌊 L1 Rivers'],
            ['layer_2_topography_cliffs_and_highlands', '⛰️ L2 Highlands/Cliffs'],
            ['layer_3_road_and_walkway_network', '🛤️ L3 Walkways'],
            ['layer_4_foliage_and_canopy_scatters', '🌲 L4 Trees'],
            ['layer_5_architectural_compounds_and_quest_rings', '🏛️ L5 Ruins/Quest Ring']
          ].map(([lid, lbl]) => `
            <button type="button" onclick="toggleAtlasComposableLayer('${lid}')" style="padding:3px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.22);background:#1e293b;color:#e2e8f0;font-size:9.5px;font-weight:700;cursor:pointer">${lbl}</button>
          `).join('')}
        </div>
      </div>
      <!-- 10 Canonical Area Biome Themes (Lineage II Background Making / Interlude Environmental Standard) -->
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(74,222,128,0.22)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px">
          <span style="font-size:11.5px;font-weight:900;color:#86efac">🌍 10 CANONICAL AREA BIOME THEMES (2D CARTOGRAPHIC SHADER + 3D .GLB KIT + 1.05M CHIBI SCALE LAW)</span>
          <span class="mono" style="font-size:10px;color:#fde047">Ref: legacy-lineage2.com/background/making.html &amp; interludelist.html</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:6px">
          ${(((DATA && DATA.studioPerspectives && DATA.studioPerspectives.biomeThemesCatalog && DATA.studioPerspectives.biomeThemesCatalog.biome_themes) || [])).map(bt => {
            const pal = bt.cartographic_2d_shader || {};
            const kit = bt.environment_3d_kit || {};
            return `
              <div onclick="setAtlasActiveBiomeTheme('${escapeHtml(bt.biome_id)}')" style="padding:6px 9px;border-radius:6px;background:#121d28;border-left:4px solid ${pal.primary_fill_hex || '#4ade80'};border:1px solid ${ATLAS_ACTIVE_BIOME_THEME_ID === bt.biome_id ? '#fde047' : 'rgba(255,255,255,0.08)'};cursor:pointer">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:10.5px;font-weight:900;color:#f8fafc">${escapeHtml(bt.display_name)}</span>
                  <span class="mono" style="font-size:8.8px;color:#fde047">${escapeHtml(bt.biome_id)}</span>
                </div>
                <div style="font-size:9.2px;color:#93c5fd;margin-top:2px">L2 Ref: ${escapeHtml(((bt.lineage2_reference_zones || [])[0] || '').slice(0, 34))}</div>
                <div style="font-size:9px;color:#bbf7d0;margin-top:2px">Scale: Grass ≤${kit.max_grass_blade_height_meters || 0.35}m · Path ≥${kit.min_road_or_corridor_width_meters || 8.0}m</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  const svgInnerHtml = `
    ${renderFieldComposableLayersSvg(entry, bp, isFort)}
    ${territoriesSvg}
    ${marksSvg}
    ${warpsSvg}
    ${renderAtlasOverviewMiniMapPipSvg(entry, tatlas, kind)}
  `;

  const defaultPoi = {
    title: bp.archetype_subtitle,
    category: `${isFort ? '🛡️ Harbor / Clan Hall / Fortress Blueprint' : '🏕️ Field Hunting Area Tactical Blueprint'} · ${entry.level_header || ''}`,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: `4 SPAWN TERRITORIES (MONSTER/MINI-BOSS/RAID/MVP) · 4 CAMP/SHRINE/ORE MARKS · DUNGEON WARP`,
    summary: `Features Monster Pack Rings, Mini-Boss Patrols, Raid Boss Arenas, Refinement Drop Badges, and a clickable Dungeon Entrance Warp to ${primaryWarp.dungeon_id} (${primaryWarp.floor_id}).`,
    address: `${entry.name} · ${entry.territory_name || ''}`,
    coordinates: `loc=${entry.loc_coord} · Grid ${entry.grid_sector || ''}`,
    scaleSpecs: `Patrol Trails: 7.5m–9.5m · Dungeon Entrance Warp: ${primaryWarp.dungeon_id} (${primaryWarp.floor_id})`,
    dungeonWarpId: primaryWarp.dungeon_id,
    dungeonFloorId: primaryWarp.floor_id || 'B1',
    drillLabel: `Warp to ${primaryWarp.dungeon_id} (${primaryWarp.floor_id || 'B1'})`,
    inspectId: entry.studio_node_id,
    connections: [
      ...(bp.dungeon_entrance_warps || []).map(w => ({ label: w.label, badge: `${w.dungeon_id} (${w.floor_id})` })),
      ...(bp.camp_and_shrine_marks || []).map(m => ({ label: `${m.icon} ${m.label}`, badge: m.mark_type }))
    ]
  };

  return renderCartoShellHtml({
    stepLabel: `${isFort ? '🛡️ FORTRESS, HARBOR & CLAN HALL' : '🏕️ FIELD HUNTING AREA'} TACTICAL BLUEPRINT (${STUDIO_MAP_ZOOM.toFixed(2)}×)`,
    title: `${escapeHtml(bp.archetype_subtitle)} — Monster Pack Rings, Mini-Boss Patrols, Raid Arenas, Refinement Drops & Dungeon Entrance Warps`,
    subtitle: 'Click any Spawn Ring (👾/⚔️/🔥/👑) for Refinement Drops, Camp/Shrine/Ore Mark (⛺/⛩️/🌀/💎), or 🕳️ Dungeon Entrance Warp to open the Connected Dungeon Sub-Map',
    activeScaleIndex: 4,
    defaultPoi,
    drillControls: drillControlsHtml,
    filterBarHtml: renderAtlasFilterBarHtml(visibleTerritories.length + visibleMarks.length),
    bottomPanelHtml: `${bottomTacticalPanelHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`,
    svgInnerHtml,
    legendItems: [
      { color: '#ef4444', label: '👾 Monster Pack Ring' },
      { color: '#a855f7', label: '⚔️ Mini-Boss Patrol' },
      { color: '#f97316', label: '🔥 Raid Boss Arena' },
      { color: '#eab308', label: '👑 MVP Sanctum' },
      { color: '#38bdf8', label: '💎 Refinement Drop / Ore Vein' },
      { color: '#c084fc', label: '🕳️ Clickable Dungeon Entrance Warp' }
    ]
  });
}

function renderDedicatedWorldAtlas() {
  // Pan is in the coordinate space of the map being shown; entering/leaving a blueprint or sub-map recentres.
  const panSpace = ATLAS_STATE_STORE.activeDungeonId
    ? 'dungeon:' + ATLAS_STATE_STORE.activeDungeonId
    : (ATLAS_STATE_STORE.activeFieldOrFortId
      ? 'field:' + ATLAS_STATE_STORE.activeFieldOrFortId
      : (STUDIO_MAP_TOWN_INTERIOR ? 'town:' + (ATLAS_STATE_STORE.activeTownId || '') : 'overland'));
  if (STUDIO_MAP_PAN_SPACE !== null && STUDIO_MAP_PAN_SPACE !== panSpace) {
    if (panSpace === 'overland' && STUDIO_MAP_ZOOM > 1.05) {
      const prevSubId = String(STUDIO_MAP_PAN_SPACE).split(':')[1] || '';
      anchorOverlandCameraOnCurrentZone(STUDIO_MAP_ZOOM, prevSubId);
    } else {
      STUDIO_MAP_PAN_X = 0;
      STUDIO_MAP_PAN_Y = 0;
    }
  }
  STUDIO_MAP_PAN_SPACE = panSpace;
  const isL2 = STUDIO_CARTO_THEME === 'l2hub';
  const sp = (DATA && DATA.studioPerspectives) || {};
  const whc = sp.worldHistoryAndConcept || {};
  const continents = sp.continents || [];
  const nodes = sp.nodes || [];
  const tatlas = sp.tShapedWorldAtlas || {};
  const dungeons = tatlas.multi_floor_dungeons || [];

  // 1. If a Multi-Floor Dungeon / Tower Sub-Map is active, render the interactive floor stack
  if (ATLAS_STATE_STORE.activeDungeonId) {
    const activeDng = dungeons.find(d => d.dungeon_id === ATLAS_STATE_STORE.activeDungeonId || d.studio_node_id === ATLAS_STATE_STORE.activeDungeonId) || dungeons[0];
    if (activeDng) {
      return renderDungeonSubMapAtlas(activeDng, tatlas);
    }
  }

  // 2. If a Field Hunting Area (24) or Harbor/ClanHall/Fortress (8) Tactical Blueprint is active (or selected at zoom >= 3.5x), render it!
  const lodTier = getSemanticZoomLodTier(STUDIO_MAP_ZOOM);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allForts = getAllAtlasFortressEntries(tatlas);
  const matchedFieldOrFort = resolveActiveFieldOrFortEntry();
  if (matchedFieldOrFort) {
    return renderFieldOrFortressTacticalBlueprintAtlas(matchedFieldOrFort, tatlas);
  }
  // A stale/bogus field id must not leave a half-state behind (overland render, field scale).
  ATLAS_STATE_STORE.activeFieldOrFortId = '';

  // 3. Town Street, Building & Service-Mark Blueprint: only when explicitly entered (5.2x lens / focusTownStreetBlueprint)
  if (STUDIO_MAP_TOWN_INTERIOR) {
    const allTownEntries = getAllAtlasTownEntries(tatlas);
    const targetTownId = ATLAS_STATE_STORE.activeTownId || ATLAS_FOCUSED_TOWN_ID || STUDIO_SELECTED_NODE_ID || 'town-lantern-hollow';
    const activeTown = nodes.find(n => n.id === targetTownId)
      || allTownEntries.find(t => t.studio_node_id === targetTownId || t.zone_id === targetTownId)
      || nodes.find(n => n.node_type === 'town');
    return renderTownStreetBlueprintAtlas(activeTown, tatlas, whc);
  }

  // 3. Otherwise render the continuous Overland World Atlas (Tier 1 Macro 1.0x-2.2x + Tier 2 Regional 2.2x-4.5x)
  const fFilter = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, 'overland').effective;
  const c01 = continents[0] || { id: 'continent-01-hearthbloom-basin', name: 'Hearthbloom Basin' };
  const c02 = continents[1] || { id: 'continent-02-clockwork-steppe', name: 'The Clockwork Steppe' };
  const c03 = continents[2] || { id: 'continent-03-shattered-halo', name: 'The Shattered Halo' };

  // Iconic Overland Landmarks with dual Canon + Lineage II Archetype names & priority AABB label ranks
  const overlandLandmarks = [
    {
      id: 'town-lantern-hollow',
      kind: 'town',
      priority: 1,
      lv: [1, 10],
      loc: '-84120:243500',
      label: 'Lantern Hollow (Gludin / Talking Island)',
      sublabel: '🧬 Human Spawn · Lv.1–10 Starter Town',
      raceName: 'Human (Hearth-Born)',
      isRaceSpawn: true,
      townBlueprintId: 'town-lantern-hollow',
      flagColor: '#eab308',
      continentId: c01.id,
      districtId: 'district-teacup-meadows'
    },
    {
      id: 'town-porcelain-loom-sanctuary',
      kind: 'town',
      priority: 2,
      lv: [1, 10],
      loc: '45800:41200',
      label: 'Porcelain Loom (Elven Village)',
      sublabel: '🧬 Lunar Spawn · Lv.1–10 Starter Town',
      raceName: 'Lunar (Moon-Weavers)',
      isRaceSpawn: true,
      townBlueprintId: 'town-porcelain-loom-sanctuary',
      flagColor: '#38bdf8',
      continentId: c01.id,
      districtId: 'district-porcelain-cradle'
    },
    {
      id: 'town-draft-kiln-post',
      kind: 'fortress',
      priority: 2,
      lv: [1, 10],
      loc: '-44800:-113200',
      label: 'Draft-Kiln Post (Orc Village)',
      sublabel: '🧬 Ogre/Orc Spawn · Lv.1–10 Starter Town',
      raceName: 'Ogre / Orc (Bellows-Kin)',
      isRaceSpawn: true,
      townBlueprintId: 'town-draft-kiln-post',
      flagColor: '#f97316',
      continentId: c01.id,
      districtId: 'district-ash-bellows-trench'
    },
    {
      id: 'town-root-train-roundhouse',
      kind: 'town',
      priority: 2,
      lv: [1, 10],
      loc: '115100:-178200',
      label: 'Root-Train Roundhouse (Dwarven Village)',
      sublabel: '🧬 Dwarf Spawn · Lv.1–10 Starter Town',
      raceName: 'Dwarf (Anvil-Forged)',
      isRaceSpawn: true,
      townBlueprintId: 'town-root-train-roundhouse',
      flagColor: '#eab308',
      continentId: c01.id,
      districtId: 'district-amber-root-hollows'
    },
    {
      id: 'town-carillon-hearth-belfry',
      kind: 'town',
      priority: 2,
      lv: [1, 10],
      loc: '12400:16800',
      label: 'Carillon Belfry (Dark Elven Village)',
      sublabel: '🧬 Dark-Lunar Spawn · Lv.1–10 Starter Town',
      raceName: 'Dark-Lunar (Chime-forged)',
      isRaceSpawn: true,
      townBlueprintId: 'town-carillon-hearth-belfry',
      flagColor: '#a855f7',
      continentId: c01.id,
      districtId: 'district-terracotta-wind-chimes'
    },
    {
      id: 'town-cinnamon-mill-haven',
      kind: 'windmill',
      priority: 2,
      lv: [1, 10],
      loc: '-118200:46800',
      label: 'Cinnamon-Mill Haven (Kamael Village)',
      sublabel: '🧬 Furral Spawn · Lv.1–10 Starter Town',
      raceName: 'Furral (Wind-Tail)',
      isRaceSpawn: true,
      townBlueprintId: 'town-cinnamon-mill-haven',
      flagColor: '#22c55e',
      continentId: c01.id,
      districtId: 'district-cinnamon-bellows-bluff'
    },
    {
      id: 'town-kilnwatch-bastion',
      kind: 'castle',
      priority: 1,
      lv: [10, 20],
      loc: '18600:145200',
      label: 'Kilnwatch Bastion (Town of Dion / Gludio)',
      sublabel: '🤝 Lv.10–20 All-Race Convergence Castle Hub',
      townBlueprintId: 'town-kilnwatch-bastion',
      flagColor: '#dc2626',
      continentId: c01.id,
      districtId: 'district-kilnfire-terraces'
    },
    {
      id: 'zone-dungeon-kiln-cellar',
      kind: 'catacomb',
      priority: 1,
      lv: [9, 22],
      loc: '-113490:235526',
      label: 'Kiln Cellar Ruins (The Ant Nest)',
      sublabel: '🕳️ Click to Warp: Underground B1 ⇄ B2 ⇄ B3 (Lv.9–22)',
      dungeonWarpId: 'zone-dungeon-kiln-cellar',
      dungeonFloorId: 'B1',
      flagColor: '#a855f7',
      continentId: c01.id,
      districtId: 'district-teacup-meadows'
    },
    {
      id: 'town-pinion-terminus',
      kind: 'castle',
      priority: 1,
      lv: [18, 25],
      loc: '82900:53200',
      label: 'Pinion Terminus (Town of Oren)',
      sublabel: '⚙️ Lv.18–25 Clockwork Steppe Hub Town',
      townBlueprintId: 'town-pinion-terminus',
      flagColor: '#dc2626',
      continentId: c02.id,
      districtId: 'district-pinion-terminus'
    },
    {
      id: 'zone-dungeon-pendulum-shaft',
      kind: 'tower',
      priority: 1,
      lv: [20, 30],
      loc: '85400:144200',
      label: 'Pendulum Shaft (Cruma Tower)',
      sublabel: '🗼 Click to Warp: Vertical Spire 1F ⇄ 2F ⇄ 3F (Lv.20–30)',
      dungeonWarpId: 'zone-dungeon-pendulum-shaft',
      dungeonFloorId: '1F',
      flagColor: '#38bdf8',
      continentId: c02.id,
      districtId: 'district-pinion-terminus'
    },
    {
      id: 'zone-dungeon-chronometer-foundry',
      kind: 'tower',
      priority: 1,
      lv: [25, 35],
      loc: '84800:56400',
      label: 'Chronometer Foundry (Tower of Insolence)',
      sublabel: '🗼 Click to Warp: Escapement Spire 1F ⇄ 2F ⇄ 3F (Lv.25–35)',
      dungeonWarpId: 'zone-dungeon-chronometer-foundry',
      dungeonFloorId: '1F',
      flagColor: '#f59e0b',
      continentId: c02.id,
      districtId: 'district-mainspring-caldera'
    },
    {
      id: 'town-starfall-haven',
      kind: 'castle',
      priority: 1,
      lv: [38, 55],
      loc: '-14200:-124000',
      label: 'Starfall Haven (Aden / Gracia Sky-Harbor)',
      sublabel: '✨ Lv.38–55 Shattered Halo Capital',
      townBlueprintId: 'town-starfall-haven',
      flagColor: '#38bdf8',
      continentId: c03.id,
      districtId: 'district-starfall-haven'
    },
    {
      id: 'citadel-crown-lens',
      kind: 'lair',
      priority: 2,
      lv: [60, 99],
      loc: '142000:-198000',
      label: 'Crown-Beacon Astrolabe (Seed of Infinity)',
      sublabel: '👑 Lv.60–99 Sovereign Seal Sanctum',
      flagColor: '#eab308',
      continentId: c03.id,
      districtId: 'district-starfall-haven'
    }
  ].map(lm => {
    // F-155: coordinates come only from ATLAS_OVERLAND_LANDMARK_ANCHORS (shared with OpenLayers).
    const anchor = getAtlasLandmarkAnchor(lm.id);
    return anchor ? { ...lm, x: anchor.x, y: anchor.y } : null;
  }).filter(Boolean);

  registerAtlasOverlandPinAnchors(overlandLandmarks, tatlas);

  // Overland Monster / Mini-Boss / Raid / MVP Spawn Pins (table shared with the 3D blockout, F-158)
  const overlandMobPins = ATLAS_OVERLAND_MOB_PINS;

  const visibleLandmarks = overlandLandmarks.filter(lm => {
    if (!matchesAtlasLevelBand(lm.lv)) return false;
    if (fFilter === 'All' || fFilter === 'TownMarks') return true;
    if (fFilter === 'RaceSpawns') return Boolean(lm.isRaceSpawn);
    return false;
  });

  const visibleMobPins = overlandMobPins.filter(mp => {
    if (!matchesAtlasLevelBand(mp.lv)) return false;
    if (fFilter === 'All') return true;
    if (fFilter === 'Monster') return mp.type === 'Monster';
    if (fFilter === 'Mini-Boss') return mp.type === 'Mini-Boss';
    if (fFilter === 'Raid') return mp.type === 'Raid';
    if (fFilter === 'MVP') return mp.type === 'MVP';
    return false;
  });

  // Travel Highways (shared with OpenLayers via ATLAS_OVERLAND_HIGHWAYS, F-155)
  const travelHighways = ATLAS_OVERLAND_HIGHWAYS;

  const lmById = {};
  overlandLandmarks.forEach(l => { lmById[l.id] = l; });

  const highwaysSvg = '';

  // D9: 6-Race Starter-to-Endgame Travel Path Highlighter (Animated Golden Travel Path on World Canvas)
  const raceRoutes = tatlas.race_growth_routes || [];
  const activeRaceRouteLabel = ATLAS_STATE_STORE.raceGrowthRoute || 'All';
  const activeRaceRouteObj = activeRaceRouteLabel !== 'All'
    ? (raceRoutes.find(r => r.race_label === activeRaceRouteLabel || r.race_key === activeRaceRouteLabel) || null)
    : null;

  // F-162: single 63-zone canonical placement table (getAtlasPlacedZonePoints) shared across SVG, OL, 3D, D9 growth routes, and D17 BFS routes.
  const zoneSvgAnchorMap = getAtlasPlacedZonePoints(tatlas, getAllAtlas63Zones(tatlas));

  let raceGrowthPathSvg = '';
  let bottomRaceGrowthPanelHtml = '';
  if (activeRaceRouteObj && Array.isArray(activeRaceRouteObj.waypoints)) {
    const wps = activeRaceRouteObj.waypoints.map((wp, idx) => {
      const anchor = zoneSvgAnchorMap[wp.zone_id] || resolveAtlasFocusLoc(wp.loc, wp.zone_id);
      const sx = anchor.x !== undefined && anchor.x <= 1040 ? anchor.x : (anchor.svgX || 520);
      const sy = anchor.y !== undefined && anchor.y <= 500 ? anchor.y : (anchor.svgY || 250);
      return { ...wp, sx, sy, idx };
    });

    const segsSvg = wps.map((wp, idx) => {
      if (idx === 0) return '';
      const prev = wps[idx - 1];
      const mx = Math.round((prev.sx + wp.sx) / 2);
      const my = Math.round((prev.sy + wp.sy) / 2) - 14;
      return `
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${wp.sx},${wp.sy}" fill="none" stroke="rgba(250,204,21,0.32)" stroke-width="11" stroke-linecap="round"/>
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${wp.sx},${wp.sy}" fill="none" stroke="#fde047" stroke-width="4.2" stroke-linecap="round" stroke-dasharray="10 6">
          <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.4s" repeatCount="indefinite"/>
        </path>
      `;
    }).join('');

    const wpNodesSvg = wps.map(wp => {
      const poiWp = {
        title: `🛤️ Stage ${wp.stage_code} (Step ${wp.step_index}): ${wp.name}`,
        category: `${activeRaceRouteObj.race_name} Growth Route · ${wp.level_range} · ${wp.travel_mode}`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `STAGE ${wp.stage_code} WAYPOINT #${wp.step_index} · Mode: ${wp.travel_mode.toUpperCase()}`,
        summary: wp.milestone_goal,
        address: `${wp.name} (${wp.l2_alias})`,
        coordinates: `Zone: ${wp.zone_id} · loc=${wp.loc}`,
        scaleSpecs: `Recommended Level: ${wp.level_range} · Travel Mode: ${wp.travel_mode}`,
        locCoord: wp.loc,
        townBlueprintId: wp.zone_id.startsWith('zone-town-') ? wp.zone_id : '',
        fieldTacticalBlueprintId: wp.zone_id.startsWith('zone-field-') ? wp.zone_id : '',
        dungeonWarpId: wp.zone_id.startsWith('zone-dungeon-') ? wp.zone_id : '',
        inspectId: wp.zone_id,
        connections: [{ label: `🎯 Milestone: ${wp.milestone_goal}`, badge: wp.stage_code }]
      };
      return `
        <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiWp, svgX: wp.sx, svgY: wp.sy })}', event)" filter="url(#cartoDropShadow)">
          <circle cx="${wp.sx}" cy="${wp.sy}" r="14" fill="#b45309" stroke="#fde047" stroke-width="2.5"/>
          <text x="${wp.sx}" y="${wp.sy + 4}" text-anchor="middle" fill="#ffffff" font-size="9.5" font-weight="900" font-family="monospace">${escapeHtml(wp.stage_code)}</text>
        </g>
      `;
    }).join('');

    raceGrowthPathSvg = `<g id="studioRaceGrowthRouteOverlay">${segsSvg}${wpNodesSvg}</g>`;
    bottomRaceGrowthPanelHtml = `
      <div style="padding:10px 16px;background:#14110b;border-top:1px solid rgba(250,204,21,0.35)">
        <div style="font-size:11.5px;font-weight:900;color:#fde047;margin-bottom:6px">
          🛤️ ${escapeHtml(activeRaceRouteObj.race_name.toUpperCase())} STARTER-TO-ENDGAME GROWTH ROUTE (STAGES A..L · 12 WAYPOINTS)
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px">
          ${wps.map(wp => `
            <div onclick="STUDIO_MAP_LOC=resolveAtlasFocusLoc('${escapeHtml(wp.loc)}', '${escapeHtml(wp.zone_id)}'); resolveNearestZoneFromPanAndLoc(STUDIO_MAP_ZOOM, STUDIO_MAP_LOC, 0, 0); render();"
                 style="padding:6px 8px;border-radius:6px;background:#1c1917;border-left:3px solid #fde047;cursor:pointer">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">[Stage ${escapeHtml(wp.stage_code)} · #${wp.step_index}] ${escapeHtml(wp.level_range)}</span>
                <span class="mono" style="font-size:9px;color:#38bdf8">${escapeHtml(wp.travel_mode)}</span>
              </div>
              <div style="font-size:10.5px;font-weight:800;color:#f8fafc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(wp.name)}</div>
              <div style="font-size:9.5px;color:#cbd5e1;margin-top:2px;line-height:1.3">${escapeHtml(wp.milestone_goal)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // D17: Interactive Point-to-Point BFS Travel Path & Gatekeeper Route Calculator
  let travelRouteOverlaySvg = '<g id="studioTravelRouteCalculatorOverlay"></g>';
  let bottomTravelItineraryPanelHtml = '';
  if (ATLAS_ROUTE_PLANNER_OPEN) {
    const activeRouteRes = computeShortestAtlasZonePath(
      ATLAS_ROUTE_FROM_ID || ATLAS_STATE_STORE.routeFromId || 'zone-town-lantern-hollow',
      ATLAS_ROUTE_TO_ID || ATLAS_STATE_STORE.routeToId || 'zone-dungeon-kiln-cellar',
      tatlas
    );
    const routeHopsWithSvg = (activeRouteRes.hops || []).map(h => {
      const anchor = zoneSvgAnchorMap[h.zoneId];
      return {
        ...h,
        sx: anchor ? anchor.x : h.svgX,
        sy: anchor ? anchor.y : h.svgY
      };
    });

    const routeSplinesSvg = routeHopsWithSvg.map((hop, idx) => {
      if (idx === 0) return '';
      const prev = routeHopsWithSvg[idx - 1];
      const mx = Math.round((prev.sx + hop.sx) / 2);
      const my = Math.round((prev.sy + hop.sy) / 2) - 16;
      return `
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${hop.sx},${hop.sy}" fill="none" stroke="rgba(56,189,248,0.34)" stroke-width="10" stroke-linecap="round"/>
        <path d="M ${prev.sx},${prev.sy} Q ${mx},${my} ${hop.sx},${hop.sy}" fill="none" stroke="#38bdf8" stroke-width="3.8" stroke-linecap="round" stroke-dasharray="9 5">
          <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1.2s" repeatCount="indefinite"/>
        </path>
      `;
    }).join('');

    const routeBadgesSvg = routeHopsWithSvg.map(hop => {
      const isFinal = hop.hopIndex === routeHopsWithSvg.length;
      const poiHop = {
        title: `🧭 Hop #${hop.hopIndex}: ${hop.name}`,
        category: `${hop.travelMode} · ${hop.levelBand} · Fee: ${hop.adenaFee} Adena`,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `TRAVEL ROUTE HOP ${hop.hopIndex} OF ${routeHopsWithSvg.length} · loc=${hop.locCoord}`,
        summary: `L2 Reference: ${hop.l2Analog}. Mode: ${hop.travelMode} (${hop.adenaFee > 0 ? hop.adenaFee.toLocaleString() + ' Adena Gatekeeper Fee' : '0 Adena Walking Road'}).`,
        address: `${hop.name} (${hop.zoneId})`,
        coordinates: `loc=${hop.locCoord} · ${hop.levelBand}`,
        scaleSpecs: `Connected 63-Zone Graph Hop #${hop.hopIndex}`,
        locCoord: hop.locCoord,
        townBlueprintId: hop.zone.actionType === 'town' ? (hop.zone.studio_node_id || hop.zoneId) : '',
        fieldTacticalBlueprintId: hop.zone.actionType === 'field' || hop.zone.actionType === 'fortress' ? hop.zoneId : '',
        dungeonWarpId: hop.zone.actionType === 'dungeon' ? hop.zoneId : '',
        dungeonFloorId: hop.zone.actionType === 'dungeon' ? 'B1' : '',
        inspectId: hop.zone.studio_node_id || hop.zoneId,
        connections: [{ label: `${hop.travelMode}`, badge: `${hop.adenaFee} Adena` }]
      };
      return `
        <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudioMapPoi('${encodePoiAttr({ ...poiHop, svgX: hop.sx, svgY: hop.sy })}', event)" filter="url(#cartoDropShadow)">
          <circle cx="${hop.sx}" cy="${hop.sy}" r="13" fill="${isFinal ? '#0284c7' : '#0f172a'}" stroke="#38bdf8" stroke-width="2.5"/>
          <text x="${hop.sx}" y="${hop.sy + 4}" text-anchor="middle" fill="#fde047" font-size="9.5" font-weight="900" font-family="monospace">${hop.hopIndex}</text>
        </g>
      `;
    }).join('');

    travelRouteOverlaySvg = `<g id="studioTravelRouteCalculatorOverlay">${routeSplinesSvg}${routeBadgesSvg}</g>`;
    const finalHop = routeHopsWithSvg[routeHopsWithSvg.length - 1] || null;
    const finalHopBtnLabel = finalHop
      ? (finalHop.zone.actionType === 'dungeon'
        ? `🕳️ Open Final Hop Dungeon Sub-Map (${finalHop.name.split('(')[0].trim()})`
        : (finalHop.zone.actionType === 'town'
          ? `🏘️ Open Final Hop Town Street Blueprint (${finalHop.name.split('(')[0].trim()})`
          : `🏕️ Open Final Hop Tactical Blueprint (${finalHop.name.split('(')[0].trim()})`))
      : '🗺️ Open Destination Blueprint';

    bottomTravelItineraryPanelHtml = routeHopsWithSvg.length > 0 ? `
      <div id="studioTravelItineraryPanel" style="padding:10px 16px;background:#0d1624;border-top:1px solid rgba(56,189,248,0.38)">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:7px">
          <div>
            <div style="font-size:11.5px;font-weight:900;color:#38bdf8">
              🧭 TRAVEL ITINERARY &amp; 30-MIN TOWN-TO-TOWN RUN CALCULATOR (D17 · ${routeHopsWithSvg.map(h => h.hopIndex).join(' -> ')} HOPS · 🏃 ~${activeRouteRes.totalRunMinutes || 30} MIN FOOT RUN · ${activeRouteRes.totalRoadKm || 8.0} KM ROAD · GK FEE: ${activeRouteRes.totalAdenaFee.toLocaleString()} ADENA)
            </div>
            <div style="font-size:10px;color:#cbd5e1">
              Shortest 63-Zone BFS Path from <strong>${escapeHtml((activeRouteRes.origin && activeRouteRes.origin.name) || '')}</strong> ➔ <strong>${escapeHtml((activeRouteRes.destination && activeRouteRes.destination.name) || '')}</strong>
            </div>
          </div>
          ${finalHop ? `
            <button type="button" onclick="openAtlasRouteFinalHop('${escapeHtml(finalHop.zoneId)}')"
                    style="padding:5px 11px;border-radius:7px;border:1.5px solid #fde047;background:#0284c7;color:#ffffff;font-size:10.5px;font-weight:900;cursor:pointer;box-shadow:0 4px 12px rgba(2,132,199,0.4)">
              ${escapeHtml(finalHopBtnLabel)} ➔
            </button>
          ` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:6px">
          ${routeHopsWithSvg.map(hop => `
            <div onclick="openAtlasRouteFinalHop('${escapeHtml(hop.zoneId)}')"
                 style="padding:6px 9px;border-radius:6px;background:#131f33;border-left:3.5px solid ${hop.hopIndex === routeHopsWithSvg.length ? '#fde047' : '#38bdf8'};cursor:pointer">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">Hop #${hop.hopIndex} · ${escapeHtml(hop.levelBand)}</span>
                <span class="mono" style="font-size:9.5px;color:#4ade80">${hop.adenaFee > 0 ? hop.adenaFee.toLocaleString() + ' Adena' : '0 Adena (Walk)'}</span>
              </div>
              <div style="font-size:10.5px;font-weight:800;color:#f8fafc;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(hop.name)}</div>
              <div style="font-size:9.5px;color:#93c5fd;margin-top:2px">${escapeHtml(hop.travelMode)} · <span class="mono">${hop.runMinutes > 0 ? `🏃 ~${hop.runMinutes}m run (${hop.roadKm}km) · ` : ''}loc=${escapeHtml(hop.locCoord)}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';
  }

  const regionalOverlaySvg = '';

  // Priority AABB Label Culling at Macro & Regional Zoom (lodTier <= 2) so labels never collide
  const cullInvZoom = 1 / Math.max(1, getStudioMapEffScale(STUDIO_MAP_ZOOM));
  const placedBoxes = [];
  function tryPlaceAtlasBox(box, ax, ay) {
    const b = { x1: ax + (box.x1 - ax) * cullInvZoom, y1: ay + (box.y1 - ay) * cullInvZoom, x2: ax + (box.x2 - ax) * cullInvZoom, y2: ay + (box.y2 - ay) * cullInvZoom };
    const collides = placedBoxes.some(pb => !(b.x2 < pb.x1 || b.x1 > pb.x2 || b.y2 < pb.y1 || b.y1 > pb.y2));
    if (!collides) placedBoxes.push(b);
    return !collides;
  }
  const sortedLandmarks = visibleLandmarks.slice().sort((a, b) => a.priority - b.priority);
  const landmarkCollides = new Map(sortedLandmarks.map(lm => {
    const cleanTitle = lm.label.split(' (')[0];
    const halfW = Math.max(46, Math.round(cleanTitle.length * 3.4 + 10));
    const box = { x1: lm.x - halfW, y1: lm.y - 16, x2: lm.x + halfW, y2: lm.y + 28 };
    return [lm.id, !lm.dungeonWarpId && lodTier <= 2 && !tryPlaceAtlasBox(box, lm.x, lm.y)];
  }));
  const landmarksSvg = sortedLandmarks
    .map(lm => {
      const displayLabel = lm.label.split(' (')[0];

      const poiObj = {
        title: lm.label,
        category: lm.sublabel,
        thumb: '/thumbs/buildings/tower_round_roof_a.webp',
        hoursOrStatus: `Lv.${lm.lv[0]}–${lm.lv[1]} · loc=${lm.loc}`,
        summary: lm.dungeonWarpId
          ? `Multi-Floor Dungeon / Tower. Click "Enter Dungeon Map" to open the interactive ${lm.sublabel} floor map.`
          : `Click "Zoom to Street Map" (or zoom >= 4.5×) to inspect the Town Street, #1..#12 Buildings, Shop/Refinement Service Marks, and NPC Roster.`,
        address: `${lm.label} · ${lm.districtId}`,
        coordinates: `World Coordinate: loc=${lm.loc}`,
        scaleSpecs: `12.5m–14.0m Main Roads · 4.4m Walkways · 0.58m Counters`,
        locCoord: lm.loc,
        townBlueprintId: lm.townBlueprintId || '',
        dungeonWarpId: lm.dungeonWarpId || '',
        dungeonFloorId: lm.dungeonFloorId || '',
        drillLabel: lm.dungeonWarpId ? 'Enter Dungeon Map' : 'Zoom to Street Map',
        drillPerspective: 'town-or-hunting-area',
        drillOpts: { continentId: lm.continentId, districtId: lm.districtId, nodeId: lm.id, inspectId: lm.id },
        inspectId: lm.id,
        connections: [
          ...(lm.isRaceSpawn ? [{ label: `🧬 Playable Race Spawn: ${lm.raceName}`, badge: 'STARTER SPAWN' }] : []),
          ...(lm.dungeonWarpId ? [{ label: `🕳️ Multi-Floor Warp: ${lm.sublabel}`, badge: 'SUB-MAP' }] : []),
          ...(lm.townBlueprintId ? [{ label: `🏘️ 7 Service Marks & 1..12 NPC Blueprint`, badge: 'ZOOM ≥4.5×' }] : [])
        ]
      };

      const canPlaceRaceBadge = Boolean(lm.isRaceSpawn) && fFilter === 'RaceSpawns';
      const raceSpawnBadgeSvg = canPlaceRaceBadge ? `
        <g class="atlas-screen-pin" style="transform-origin:${lm.x}px ${lm.y}px" pointer-events="none">
          <rect x="${lm.x - 36}" y="${lm.y - 29}" width="72" height="12" rx="5" fill="rgba(6,78,59,0.88)" stroke="#34d399" stroke-width="0.9"/>
          <text x="${lm.x}" y="${lm.y - 20.5}" text-anchor="middle" fill="#ecfdf5" font-size="6.4" font-weight="900" font-family="monospace">
            🧬 ${escapeHtml(lm.raceName.split(' ')[0].toUpperCase())} SPAWN
          </text>
        </g>
      ` : '';

      return `
        ${drawL2LandmarkSvg({
          kind: lm.kind,
          x: lm.x,
          y: lm.y,
          label: displayLabel,
          sublabel: '',
          flagColor: lm.flagColor,
          isSelected: STUDIO_ACTIVE_INSPECT_ID === lm.id,
          poiObj
        })}
        ${raceSpawnBadgeSvg}
      `;
    }).join('');

  const mobPinsSvg = visibleMobPins.map(mp => {
    const isMvp = mp.type === 'MVP';
    const isRaid = mp.type === 'Raid';
    const isMini = mp.type === 'Mini-Boss';
    const col = isMvp ? '#b48a3e' : (isRaid ? '#9e472a' : (isMini ? '#785288' : '#8c3b3b'));
    const icon = isMvp ? '👑' : (isRaid ? '🔥' : (isMini ? '⚔️' : '👾'));
    const poiMob = {
      title: `${icon} ${mp.name} (Lv.${mp.lv})`,
      category: `${mp.type} Spawn Pin · ${mp.zone}`,
      thumb: '/thumbs/creatures/god-sola-hearth-weaver.webp',
      hoursOrStatus: `ACTIVE ${mp.type.toUpperCase()} · loc=${mp.loc}`,
      summary: mp.dungeonWarpId
        ? `Spawns inside ${mp.zone}. Click "Enter Dungeon Map" to warp directly to Floor ${mp.dungeonFloorId}!`
        : `Overland ${mp.type} habitat in ${mp.zone}.`,
      address: `${mp.zone} · loc=${mp.loc}`,
      coordinates: `Level ${mp.lv} · Tier: ${mp.type}`,
      dungeonWarpId: mp.dungeonWarpId || '',
      dungeonFloorId: mp.dungeonFloorId || '',
      drillLabel: mp.dungeonWarpId ? `Warp to ${mp.zone}` : 'Zoom Closer',
      inspectId: mp.id,
      connections: [{ label: `📍 Habitat: ${mp.zone}`, badge: `Lv.${mp.lv}` }]
    };
    const encMobPoi = encodePoiAttr({ ...poiMob, svgX: mp.x, svgY: mp.y });
    const showMobLabel = (fFilter !== 'All' || STUDIO_MAP_ZOOM >= 4.5) && tryPlaceAtlasBox({ x1: mp.x - 56, y1: mp.y - 22, x2: mp.x + 56, y2: mp.y - 6 }, mp.x, mp.y);
    const pinR = fFilter !== 'All' ? (isMvp ? 9.5 : 8) : (isMvp ? 5.2 : 4.2);
    return `
      <g data-poi-clickable="1" tabindex="0" role="button" aria-label="${escapeHtml(poiMob.title)}" class="atlas-screen-pin" style="cursor:pointer;transform-origin:${mp.x}px ${mp.y}px" onclick="selectStudioMapPoi('${encMobPoi}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectStudioMapPoi('${encMobPoi}', event);}">
        ${atlasPinHitRect(mp.x, mp.y)}
        <circle cx="${mp.x}" cy="${mp.y}" r="${pinR}" fill="${col}" fill-opacity="${fFilter !== 'All' ? 0.92 : 0.72}" stroke="#1c150b" stroke-width="1.2"/>
        ${fFilter !== 'All' ? `<text x="${mp.x}" y="${mp.y + 3}" text-anchor="middle" font-size="8">${icon}</text>` : ''}
        ${showMobLabel ? `
          <text x="${mp.x}" y="${mp.y - 8}" text-anchor="middle" fill="#f5efe0" font-size="8" font-weight="700" font-family="Georgia, serif" style="paint-order:stroke fill;stroke:#0c0905;stroke-width:2.6px">
            ${escapeHtml(mp.name.replace(/^\[(?:Raid|MVP|Mini)\]\s*/i, '').slice(0, 18))} (Lv.${mp.lv})
          </text>
        ` : ''}
      </g>
    `;
  }).join('');

  // F-155: 2D SVG zone layer - exactly the zones atlasZoneMatchesFilter passes (the same set OpenLayers draws and the
  // badge counts), at the same placed points. One counter-scaled circle per zone, never culled, at every zoom.
  const zoneFilterModel = getAtlasOverlandZoneFilterModel();
  const zoneTierFilter = ['Monster', 'Mini-Boss', 'Raid', 'MVP'].includes(zoneFilterModel.effFilter);
  const zoneTierCol = { Monster: '#ef4444', 'Mini-Boss': '#a855f7', Raid: '#f97316', MVP: '#eab308' }[zoneFilterModel.effFilter];
  const zoneFilterLayerSvg = `
    <g id="atlasSvgZoneFilterLayer" data-filter="${escapeHtml(zoneFilterModel.effFilter)}" data-zone-count="${zoneFilterModel.matching.length}">
      ${zoneFilterModel.matching.map(z => {
        const p = zoneFilterModel.placedById[z.zone_id];
        const baseCol = z.actionType === 'town' ? '#d4b46a' : (z.actionType === 'dungeon' ? '#a3825c' : (z.actionType === 'fortress' ? '#b87b4b' : '#c9ba93'));
        const col = zoneTierFilter ? zoneTierCol : baseCol;
        return `<circle class="atlas-zone-mark" data-zone-id="${escapeHtml(z.zone_id)}" cx="${p.x}" cy="${p.y}" r="${zoneTierFilter ? 6 : 2.3}" fill="${zoneTierFilter ? 'rgba(9,13,20,0.55)' : col}" fill-opacity="${zoneTierFilter ? 1 : 0.65}" stroke="${zoneTierFilter ? col : '#171109'}" stroke-width="${zoneTierFilter ? 2.4 : 0.9}" style="transform-origin:${p.x}px ${p.y}px;cursor:pointer" onclick="selectAtlasZoneMark('${escapeHtml(z.zone_id)}', event)"><title>${escapeHtml((z.name || z.zone_id).split(' (')[0])}</title></circle>`;
      }).join('')}
    </g>
  `;

  const bossChains = getAtlasBossHierarchyChains(tatlas);
  const activeBossChain = bossChains.find(c => c.god_id === (ATLAS_BOSS_GOD_ID || ATLAS_STATE_STORE.activeBossGodId || 'god-sola-hearth-weaver')) || bossChains[0] || null;
  let bossHierarchyOverlaySvg = '<g id="studioBossHierarchyChainOverlay"></g>';
  if (activeBossChain && shouldRenderStudioSvgOverlay('boss_hierarchy')) {
    const godCoord = clampWorldLocCoord(activeBossChain.seal_loc || '-72400:256800');
    const themeCol = activeBossChain.theme_color || '#f43f5e';
    const mvpNodes = (activeBossChain.mvp_apostles || []).map((m, idx) => {
      const c = clampWorldLocCoord(m.loc || m.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...m, sx: c.svgX + (idx * 18 - 9), sy: c.svgY - 14 };
    });
    const raidNodes = (activeBossChain.raid_bosses || []).map((r, idx) => {
      const c = clampWorldLocCoord(r.loc || r.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...r, sx: c.svgX + (idx * 22 - 11), sy: c.svgY + 12 };
    });
    const miniNodes = (activeBossChain.mini_bosses || []).map((mb, idx) => {
      const c = clampWorldLocCoord(mb.loc || mb.loc_coord || activeBossChain.seal_loc || '-72400:256800');
      return { ...mb, sx: c.svgX + (idx * 16 - 8), sy: c.svgY + 20 };
    });

    const linesSvg = [];
    mvpNodes.forEach(m => {
      linesSvg.push(`<line x1="${godCoord.svgX}" y1="${godCoord.svgY}" x2="${m.sx}" y2="${m.sy}" stroke="${themeCol}" stroke-width="2.6" stroke-dasharray="6 4" opacity="0.88"/>`);
    });
    raidNodes.forEach((r, idx) => {
      const src = mvpNodes[idx % Math.max(1, mvpNodes.length)] || { sx: godCoord.svgX, sy: godCoord.svgY };
      linesSvg.push(`<line x1="${src.sx}" y1="${src.sy}" x2="${r.sx}" y2="${r.sy}" stroke="#f97316" stroke-width="2" stroke-dasharray="4 3" opacity="0.82"/>`);
    });
    miniNodes.forEach((mb, idx) => {
      const src = raidNodes[idx % Math.max(1, raidNodes.length)] || { sx: godCoord.svgX, sy: godCoord.svgY };
      linesSvg.push(`<line x1="${src.sx}" y1="${src.sy}" x2="${mb.sx}" y2="${mb.sy}" stroke="#a855f7" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.76"/>`);
    });

    bossHierarchyOverlaySvg = `
      <g id="studioBossHierarchyChainOverlay">
        ${linesSvg.join('')}
        <g data-poi-clickable="1" style="cursor:pointer" onclick="openDungeonSubMap('${escapeHtml(activeBossChain.seal_catacomb_zone_id || activeBossChain.seal_catacomb_id || '')}', '${escapeHtml(activeBossChain.seal_floor_id || 'B3')}')" filter="url(#cartoDropShadow)">
          <circle cx="${godCoord.svgX}" cy="${godCoord.svgY}" r="18" fill="rgba(244,63,94,0.25)" stroke="${themeCol}" stroke-width="2.2" stroke-dasharray="4 2"/>
          <circle cx="${godCoord.svgX}" cy="${godCoord.svgY}" r="12" fill="#090d16" stroke="${themeCol}" stroke-width="2.4"/>
          <text x="${godCoord.svgX}" y="${godCoord.svgY + 4}" text-anchor="middle" font-size="11">${activeBossChain.icon || '🔱'}</text>
          <rect x="${godCoord.svgX - 88}" y="${godCoord.svgY - 32}" width="176" height="16" rx="5" fill="rgba(9,13,22,0.94)" stroke="${themeCol}" stroke-width="1.2"/>
          <text x="${godCoord.svgX}" y="${godCoord.svgY - 21}" text-anchor="middle" fill="#fde047" font-size="8" font-weight="900" font-family="monospace">
            TIER 5 SEALED GOD: ${escapeHtml((activeBossChain.god_name || '').slice(0, 18))}
          </text>
        </g>
      </g>
    `;
  }

  // D23: 3-Track Quest & Class Transfer Trial Map Overlay (`studioQuestTrialChainOverlay`)
  const questChains = (tatlas && tatlas.quest_trial_chains) || [];
  const activeQuestObj = questChains.find(q => q.quest_id === (ATLAS_ACTIVE_QUEST_ID || ATLAS_STATE_STORE.activeQuestId)) || questChains[0] || null;
  let questTrialOverlaySvg = '<g id="studioQuestTrialChainOverlay"></g>';
  if (activeQuestObj && shouldRenderStudioSvgOverlay('quest_trials')) {
    const gCoord = clampWorldLocCoord(activeQuestObj.giver_loc || '-84120:243500');
    const oCoord = clampWorldLocCoord(activeQuestObj.objective_loc || '75410:116820');
    const tCoord = clampWorldLocCoord(activeQuestObj.turn_in_loc || '-14200:123500');
    const isDngObj = Boolean(activeQuestObj.objective_dungeon_id);
    const objClick = isDngObj
      ? `openDungeonSubMap('${escapeHtml(activeQuestObj.objective_dungeon_id)}', '${escapeHtml(activeQuestObj.objective_floor_id || 'B1')}')`
      : `focusFieldTacticalBlueprint('${escapeHtml(activeQuestObj.objective_zone_id)}', '${escapeHtml(activeQuestObj.objective_loc || '')}')`;
    questTrialOverlaySvg = `
      <g id="studioQuestTrialChainOverlay">
        <line x1="${gCoord.svgX}" y1="${gCoord.svgY}" x2="${oCoord.svgX}" y2="${oCoord.svgY}" stroke="#38bdf8" stroke-width="2.6" stroke-dasharray="6 3" opacity="0.9"/>
        <line x1="${oCoord.svgX}" y1="${oCoord.svgY}" x2="${tCoord.svgX}" y2="${tCoord.svgY}" stroke="#34d399" stroke-width="2.6" stroke-dasharray="6 3" opacity="0.9"/>
        <g data-poi-clickable="1" style="cursor:pointer" onclick="${objClick}" filter="url(#cartoDropShadow)">
          <circle cx="${oCoord.svgX}" cy="${oCoord.svgY}" r="14" fill="rgba(245,158,11,0.28)" stroke="#fde047" stroke-width="2.2"/>
          <text x="${oCoord.svgX}" y="${oCoord.svgY + 4}" text-anchor="middle" font-size="10">📜</text>
          <rect x="${oCoord.svgX - 82}" y="${oCoord.svgY + 15}" width="164" height="15" rx="4" fill="rgba(9,13,22,0.92)" stroke="#fde047" stroke-width="1"/>
          <text x="${oCoord.svgX}" y="${oCoord.svgY + 25}" text-anchor="middle" fill="#fde047" font-size="7.6" font-weight="900" font-family="monospace">
            QUEST OBJ: ${escapeHtml((activeQuestObj.quest_name || '').slice(0, 22))}
          </text>
        </g>
      </g>
    `;
  }

  // D24: Party & Farming Efficiency Heatmap Overlay (`studioFarmingEfficiencyHeatmapOverlay`)
  const farmingProfiles = (tatlas && tatlas.farming_efficiency_profiles) || [];
  const curFarmMode = ATLAS_FARMING_MODE || ATLAS_STATE_STORE.farmingMode || 'All';
  const activeFarmProfiles = curFarmMode === 'Off'
    ? []
    : (curFarmMode === 'All' ? farmingProfiles.slice(0, 12) : farmingProfiles.filter(fp => fp.recommended_party_mode === curFarmMode));
  const allZonesById = {};
  getAllAtlas63Zones(tatlas).forEach(z => { allZonesById[z.zone_id] = z; });
  const farmingEfficiencyOverlaySvg = !shouldRenderStudioSvgOverlay('farming_heatmap') ? '<g id="studioFarmingEfficiencyHeatmapOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFarmingEfficiencyHeatmapOverlay">
      ${activeFarmProfiles.map(fp => {
        const zRef = allZonesById[fp.zone_id];
        if (!zRef || !zRef.loc_coord) return '';
        const fc = clampWorldLocCoord(zRef.loc_coord);
        const modeCol = fp.recommended_party_mode === 'clan_raid_force'
          ? '#f43f5e'
          : (fp.recommended_party_mode === 'full_9p_aoe_party'
            ? '#a855f7'
            : (fp.recommended_party_mode === 'duo_spoil_scavenger' ? '#eab308' : '#10b981'));
        return `
          <circle cx="${fc.svgX}" cy="${fc.svgY}" r="22" fill="${modeCol}" fill-opacity="0.16" stroke="${modeCol}" stroke-width="1.4" stroke-dasharray="3 2" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D25: Castle Siege, Territory Tax & Clan Hall Domain Overlay (`studioCastleSiegeDomainOverlay`)
  const siegeDomains = (tatlas && tatlas.castle_siege_domains) || [];
  const curSiegeDomId = ATLAS_SIEGE_DOMAIN_ID || ATLAS_STATE_STORE.siegeDomainId || 'All';
  const activeSiegeDomains = curSiegeDomId === 'Off'
    ? []
    : (curSiegeDomId === 'All'
      ? siegeDomains
      : siegeDomains.filter(sd => sd.domain_id === curSiegeDomId || sd.stronghold_zone_id === curSiegeDomId));
  const castleSiegeDomainOverlaySvg = !shouldRenderStudioSvgOverlay('siege_domain') ? '<g id="studioCastleSiegeDomainOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCastleSiegeDomainOverlay">
      ${activeSiegeDomains.map(sd => {
        const shCoord = clampWorldLocCoord(sd.artifact_altar_loc || '-13800:124100');
        const townLinks = (sd.vassal_town_ids || []).map(tid => {
          const tz = allZonesById[tid];
          if (!tz || !tz.loc_coord) return '';
          const tc = clampWorldLocCoord(tz.loc_coord);
          return `<line x1="${shCoord.svgX}" y1="${shCoord.svgY}" x2="${tc.svgX}" y2="${tc.svgY}" stroke="#fb923c" stroke-width="2.2" stroke-dasharray="5 3" opacity="0.88" pointer-events="none"/>`;
        }).join('');
        const huntLinks = (sd.vassal_hunting_zone_ids || []).slice(0, 2).map(hid => {
          const hz = allZonesById[hid];
          if (!hz || !hz.loc_coord) return '';
          const hc = clampWorldLocCoord(hz.loc_coord);
          return `<line x1="${shCoord.svgX}" y1="${shCoord.svgY}" x2="${hc.svgX}" y2="${hc.svgY}" stroke="#fdba74" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.72" pointer-events="none"/>`;
        }).join('');
        return `
          ${townLinks}
          ${huntLinks}
          <g data-poi-clickable="1" style="cursor:pointer" onclick="focusFortressBlueprint('${escapeHtml(sd.stronghold_zone_id)}', '${escapeHtml(sd.artifact_altar_loc)}')">
            <circle cx="${shCoord.svgX}" cy="${shCoord.svgY}" r="13" fill="rgba(251,146,60,0.26)" stroke="#fb923c" stroke-width="2"/>
            <text x="${shCoord.svgX}" y="${shCoord.svgY - 16}" text-anchor="middle" fill="#fed7aa" font-size="7.4" font-weight="900" font-family="monospace">
              🏰 ${sd.tax_rate_pct}% TAX
            </text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D26: World Boss & MVP Respawn Radar Overlay (`studioWorldBossSpawnRadarOverlay`)
  const bossRadarEntries = (tatlas && tatlas.world_boss_spawn_radar) || [];
  const curBossRadarMode = ATLAS_BOSS_RADAR_MODE || ATLAS_STATE_STORE.bossRadarMode || 'All';
  const activeRadarBosses = curBossRadarMode === 'Off'
    ? []
    : (curBossRadarMode === 'DungeonMVP'
      ? bossRadarEntries.filter(b => b.dungeon_id && b.boss_category === 'MVP').slice(0, 10)
      : (curBossRadarMode === 'OverlandRaid'
        ? bossRadarEntries.filter(b => !b.dungeon_id).slice(0, 10)
        : bossRadarEntries.slice(0, 10)));
  const worldBossSpawnRadarOverlaySvg = !shouldRenderStudioSvgOverlay('boss_radar') ? '<g id="studioWorldBossSpawnRadarOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWorldBossSpawnRadarOverlay">
      ${activeRadarBosses.map(b => {
        const bc = clampWorldLocCoord(b.loc || '53100:242600');
        const isDng = Boolean(b.dungeon_id);
        const clickAct = isDng
          ? `openDungeonSubMap('${escapeHtml(b.dungeon_id)}', '${escapeHtml(b.floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(b.zone_id)}', '${escapeHtml(b.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickAct}">
            <circle cx="${bc.svgX}" cy="${bc.svgY}" r="11" fill="rgba(244,63,94,0.24)" stroke="#f43f5e" stroke-width="1.6" stroke-dasharray="2 2"/>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D27: Seven-Seals Dusk vs. Dawn Catacomb/Tower Competition & Mammon Rotation Overlay (`studioSevenSealsOverlay`)
  const sevenSealsEntries = (tatlas && tatlas.seven_seals_competitions) || [];
  const curSevenSealsMode = ATLAS_SEVEN_SEALS_MODE || ATLAS_STATE_STORE.sevenSealsMode || 'All';
  const activeSevenSeals = curSevenSealsMode === 'Off'
    ? []
    : (curSevenSealsMode === 'Lords_of_Dawn' || curSevenSealsMode === 'Revolutionaries_of_Dusk'
      ? sevenSealsEntries.filter(s => s.controlling_cabal === curSevenSealsMode)
      : (curSevenSealsMode === 'Blacksmith_of_Mammon' || curSevenSealsMode === 'Merchant_of_Mammon'
        ? sevenSealsEntries.filter(s => s.mammon_visitor_npc === curSevenSealsMode)
        : sevenSealsEntries.slice(0, 10)));
  const sevenSealsOverlaySvg = !shouldRenderStudioSvgOverlay('seven_seals') ? '<g id="studioSevenSealsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioSevenSealsOverlay">
      ${activeSevenSeals.map(s => {
        const sc = clampWorldLocCoord(s.mammon_loc || '48550:248400');
        const cabalCol = s.controlling_cabal === 'Lords_of_Dawn'
          ? '#fde047'
          : (s.controlling_cabal === 'Revolutionaries_of_Dusk' ? '#c084fc' : '#38bdf8');
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.mammon_active_floor_id)}')">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="12" fill="rgba(168,85,247,0.24)" stroke="${cabalCol}" stroke-width="1.8" stroke-dasharray="4 2"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.5}" text-anchor="middle" font-size="9">${s.mammon_visitor_npc === 'Blacksmith_of_Mammon' ? '⚒️' : '💰'}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D28: 15-Town Manor Seed/Crop & Regional Caravan Trade Economy Overlay (`studioManorEconomyOverlay`)
  const manorRoutes = (tatlas && tatlas.manor_economy_routes) || [];
  const curManorMode = ATLAS_MANOR_MODE || ATLAS_STATE_STORE.manorMode || 'All';
  const activeManorRoutes = curManorMode === 'Off'
    ? []
    : (curManorMode === 'Low_Patrolled'
      ? manorRoutes.filter(r => r.caravan_route_risk === 'Low_Patrolled')
      : (curManorMode === 'High_Frontier_Ambush'
        ? manorRoutes.filter(r => r.caravan_route_risk !== 'Low_Patrolled')
        : manorRoutes.slice(0, 8)));
  const manorEconomyOverlaySvg = !shouldRenderStudioSvgOverlay('manor_economy') ? '<g id="studioManorEconomyOverlay" data-lens-gated="1"></g>' : `
    <g id="studioManorEconomyOverlay">
      ${activeManorRoutes.map(r => {
        const tz = allZonesById[r.town_zone_id];
        const fz = allZonesById[r.harvest_field_zone_id];
        const sz = allZonesById[r.parent_stronghold_zone_id];
        if (!tz || !fz || !sz || !tz.loc_coord || !fz.loc_coord || !sz.loc_coord) return '';
        const tc = clampWorldLocCoord(tz.loc_coord);
        const fc = clampWorldLocCoord(fz.loc_coord);
        const sc = clampWorldLocCoord(sz.loc_coord);
        const riskCol = r.caravan_route_risk === 'Low_Patrolled' ? '#4ade80' : '#fde047';
        return `
          <line x1="${tc.svgX}" y1="${tc.svgY}" x2="${fc.svgX}" y2="${fc.svgY}" stroke="${riskCol}" stroke-width="1.8" stroke-dasharray="4 2" opacity="0.82" pointer-events="none"/>
          <line x1="${fc.svgX}" y1="${fc.svgY}" x2="${sc.svgX}" y2="${sc.svgY}" stroke="#bef264" stroke-width="1.6" stroke-dasharray="3 3" opacity="0.76" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D29: Subclass, Noblesse & Grand Olympiad Monument Network Overlay (`studioNoblesseOlympiadOverlay`)
  const olympiadNodes = (tatlas && tatlas.noblesse_olympiad_network) || [];
  const curOlympiadMode = ATLAS_OLYMPIAD_MODE || ATLAS_STATE_STORE.olympiadMode || 'All';
  const activeOlympiadNodes = curOlympiadMode === 'Off'
    ? []
    : (curOlympiadMode === 'All'
      ? olympiadNodes.slice(0, 12)
      : olympiadNodes.filter(n => n.node_category === curOlympiadMode));
  const noblesseOlympiadOverlaySvg = !shouldRenderStudioSvgOverlay('olympiad') ? '<g id="studioNoblesseOlympiadOverlay" data-lens-gated="1"></g>' : `
    <g id="studioNoblesseOlympiadOverlay">
      ${activeOlympiadNodes.map(n => {
        const nc = clampWorldLocCoord(n.loc || '-84120:243500');
        const isSub = n.node_category === 'Subclass_Mimir_Sanctum';
        const isNob = n.node_category === 'Noblesse_Barakiel_Shrine';
        const strokeCol = isSub ? '#c084fc' : (isNob ? '#38bdf8' : '#fde047');
        const iconTxt = isSub ? '🧪' : (isNob ? '👑' : '🏆');
        const zObj = allZonesById[n.zone_id] || {};
        const tNode = zObj.studio_node_id || n.zone_id;
        const clickJs = n.dungeon_id
          ? `openDungeonSubMap('${escapeHtml(n.dungeon_id)}', '${escapeHtml(n.floor_id || '3F')}')`
          : (isNob
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${nc.svgX}" cy="${nc.svgY}" r="11" fill="rgba(250,204,21,0.22)" stroke="${strokeCol}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${nc.svgX}" y="${nc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D30: Inter-Continental Maritime Ship, Airship & Gatekeeper Transit Overlay (`studioIntercontinentalTransitOverlay`)
  const transitLines = (tatlas && tatlas.intercontinental_transit_lines) || [];
  const curTransitMode = ATLAS_TRANSIT_MODE || ATLAS_STATE_STORE.transitMode || 'All';
  const activeTransitLines = curTransitMode === 'Off'
    ? []
    : (curTransitMode === 'All'
      ? transitLines
      : transitLines.filter(l => l.transit_mode === curTransitMode));
  const intercontinentalTransitOverlaySvg = !shouldRenderStudioSvgOverlay('transit_lines') ? '<g id="studioIntercontinentalTransitOverlay" data-lens-gated="1"></g>' : `
    <g id="studioIntercontinentalTransitOverlay">
      ${activeTransitLines.map(l => {
        const oc = clampWorldLocCoord(l.origin_loc || '-84120:243500');
        const dc = clampWorldLocCoord(l.destination_loc || '82400:148600');
        const isShip = l.transit_mode === 'Maritime_Ship';
        const isAir = l.transit_mode === 'Brass_Airship';
        const lineCol = isShip ? '#38bdf8' : (isAir ? '#f59e0b' : '#c084fc');
        const dashPat = isShip ? '6 3' : (isAir ? '8 4' : '3 3');
        const midX = Math.round((oc.svgX + dc.svgX) / 2);
        const midY = Math.round((oc.svgY + dc.svgY) / 2 - (isAir ? 26 : (isShip ? -18 : 12)));
        return `
          <path d="M ${oc.svgX} ${oc.svgY} Q ${midX} ${midY} ${dc.svgX} ${dc.svgY}" fill="none" stroke="${lineCol}" stroke-width="2" stroke-dasharray="${dashPat}" opacity="0.85" pointer-events="none"/>
        `;
      }).join('')}
    </g>
  `;

  // D31: Soul Crystal (SA) Stage 1–13 Resonance & Boss Absorption Matrix Overlay (`studioSoulCrystalResonanceOverlay`)
  const soulCrystalStages = (tatlas && tatlas.soul_crystal_resonance_stages) || [];
  const curSoulCrystalMode = ATLAS_SOUL_CRYSTAL_MODE || ATLAS_STATE_STORE.soulCrystalMode || 'All';
  const activeSoulCrystalStages = curSoulCrystalMode === 'Off'
    ? []
    : (curSoulCrystalMode === 'All'
      ? soulCrystalStages.slice(0, 12)
      : (curSoulCrystalMode === 'Stage_11_to_13_S_Grade_Boss'
        ? soulCrystalStages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss')
        : soulCrystalStages.filter(s => s.crystal_color === curSoulCrystalMode)));
  const soulCrystalOverlaySvg = !shouldRenderStudioSvgOverlay('soul_crystal') ? '<g id="studioSoulCrystalResonanceOverlay" data-lens-gated="1"></g>' : `
    <g id="studioSoulCrystalResonanceOverlay">
      ${activeSoulCrystalStages.map(s => {
        const vZone = allZonesById[s.vendor_town_zone_id] || {};
        const vc = clampWorldLocCoord(vZone.loc_coord || '-84120:243500');
        const ac = clampWorldLocCoord(s.absorption_loc || '75410:116820');
        const isRed = s.crystal_color === 'Crimson_Red';
        const isGreen = s.crystal_color === 'Verdant_Green';
        const colHex = isRed ? '#f87171' : (isGreen ? '#4ade80' : '#38bdf8');
        const clickJs = s.absorption_dungeon_id
          ? `openDungeonSubMap('${escapeHtml(s.absorption_dungeon_id)}', '${escapeHtml(s.absorption_floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(s.absorption_zone_id)}', '${escapeHtml(s.absorption_loc)}')`;
        return `
          <line x1="${vc.svgX}" y1="${vc.svgY}" x2="${ac.svgX}" y2="${ac.svgY}" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="4 3" opacity="0.82" pointer-events="none"/>
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="9.5" fill="rgba(134,25,143,0.28)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.2}" text-anchor="middle" font-size="8">💎</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D32: Fishing Guild, Hot Springs & Luminous Night-Bait Sanctuary Overlay (`studioFishingSanctuaryOverlay`)
  const fishingSanctuaries = (tatlas && tatlas.fishing_guild_sanctuaries) || [];
  const curFishingMode = ATLAS_FISHING_MODE || ATLAS_STATE_STORE.fishingMode || 'All';
  const activeFishingSanctuaries = curFishingMode === 'Off'
    ? []
    : (curFishingMode === 'All'
      ? fishingSanctuaries
      : fishingSanctuaries.filter(s => s.water_category === curFishingMode));
  const fishingSanctuaryOverlaySvg = !shouldRenderStudioSvgOverlay('fishing_sanctuary') ? '<g id="studioFishingSanctuaryOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFishingSanctuaryOverlay">
      ${activeFishingSanctuaries.map(s => {
        const sc = clampWorldLocCoord(s.dock_loc || '-96200:258400');
        const isPier = s.water_category === 'Maritime_Harbor_Pier';
        const isLake = s.water_category === 'Luminous_Night_Lake';
        const colHex = isPier ? '#38bdf8' : (isLake ? '#a78bfa' : '#fb923c');
        const iconTxt = isPier ? '⚓' : (isLake ? '🌙' : '♨️');
        const z = allZonesById[s.zone_id] || {};
        const clickJs = (z.category === 'starting_town' || z.category === 'castle_or_hub_town')
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || s.zone_id)}', '${escapeHtml(s.dock_loc)}')`
          : ((z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress')
            ? `focusFortressBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`
            : `focusFieldTacticalBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.5" fill="rgba(15,118,110,0.28)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D33: Cursed Weapon, PK Karma Sanctuary & Open-World PvP Arena Overlay (`studioCursedWeaponPvpOverlay`)
  const pvpHotspots = (tatlas && tatlas.cursed_weapon_pvp_hotspots) || [];
  const curPvpMode = ATLAS_PVP_KARMA_MODE || ATLAS_STATE_STORE.pvpKarmaMode || 'All';
  const activePvpHotspots = curPvpMode === 'Off'
    ? []
    : (curPvpMode === 'All'
      ? pvpHotspots
      : pvpHotspots.filter(h => h.pvp_category === curPvpMode));
  const cursedWeaponPvpOverlaySvg = !shouldRenderStudioSvgOverlay('pvp_karma') ? '<g id="studioCursedWeaponPvpOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCursedWeaponPvpOverlay">
      ${activePvpHotspots.map(h => {
        const hc = clampWorldLocCoord(h.loc || '25180:136540');
        const isCursed = h.pvp_category === 'Cursed_Weapon_Drop_Zone';
        const isJudge = h.pvp_category === 'Black_Judge_Karma_Sanctuary';
        const colHex = isCursed ? '#ef4444' : (isJudge ? '#c084fc' : '#f59e0b');
        const iconTxt = isCursed ? '🗡️' : (isJudge ? '⚖️' : '🏟️');
        const z = allZonesById[h.zone_id] || {};
        const clickJs = (z.category === 'starting_town' || z.category === 'castle_or_hub_town')
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || h.zone_id)}', '${escapeHtml(h.loc)}')`
          : ((z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress')
            ? `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`
            : `focusFieldTacticalBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${hc.svgX}" cy="${hc.svgY}" r="11" fill="rgba(159,18,57,0.3)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="4 2"/>
            <text x="${hc.svgX}" y="${hc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D34: Dimensional Rift, Four Sepulchers & Key-Gated Endgame Sanctum Overlay (`studioDimensionalRiftOverlay`)
  const riftPortals = (tatlas && tatlas.dimensional_rift_sepulchers) || [];
  const curRiftMode = ATLAS_RIFT_SEPULCHER_MODE || ATLAS_STATE_STORE.riftSepulcherMode || 'All';
  const activeRiftPortals = curRiftMode === 'Off'
    ? []
    : (curRiftMode === 'All'
      ? riftPortals
      : riftPortals.filter(p => p.instance_category === curRiftMode));
  const dimensionalRiftOverlaySvg = !shouldRenderStudioSvgOverlay('rift_sepulcher') ? '<g id="studioDimensionalRiftOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDimensionalRiftOverlay">
      ${activeRiftPortals.map(p => {
        const pc = clampWorldLocCoord(p.loc || '75410:116820');
        const isRift = p.instance_category === 'Dimensional_Rift';
        const isSep = p.instance_category === 'Four_Sepulchers';
        const colHex = isRift ? '#818cf8' : (isSep ? '#f472b6' : '#facc15');
        const iconTxt = isRift ? '🌌' : (isSep ? '⚰️' : '🗝️');
        const clickJs = `openDungeonSubMap('${escapeHtml(p.dungeon_id)}', '${escapeHtml(p.floor_id || 'B3')}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${pc.svgX}" cy="${pc.svgY}" r="10.5" fill="rgba(55,48,163,0.32)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="3 2"/>
            <text x="${pc.svgX}" y="${pc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D35: Interactive Life Stone Weapon Augmentation & Symbol Maker Dye Parlor Overlay (`studioWeaponAugmentationDyeOverlay`)
  const augDyeHubs = (tatlas && tatlas.weapon_augmentation_dye_hubs) || [];
  const curAugMode = ATLAS_AUGMENT_DYE_MODE || ATLAS_STATE_STORE.augmentDyeMode || 'All';
  const activeAugDyeHubs = curAugMode === 'Off'
    ? []
    : (curAugMode === 'Top_High_Life_Stone'
      ? augDyeHubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone' || h.life_stone_tier === 'High_Grade_Life_Stone')
      : augDyeHubs);
  const weaponAugmentationDyeOverlaySvg = !shouldRenderStudioSvgOverlay('augment_dye') ? '<g id="studioWeaponAugmentationDyeOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWeaponAugmentationDyeOverlay">
      ${activeAugDyeHubs.map(h => {
        const ac = clampWorldLocCoord(h.anvil_loc || '-84120:243500');
        const dz = allZonesById[h.life_stone_drop_zone_id] || {};
        const tz = allZonesById[h.town_zone_id] || {};
        const dc = clampWorldLocCoord(dz.loc_coord || '-68180:228620');
        const isTop = h.life_stone_tier === 'Top_Grade_Life_Stone';
        const isHigh = h.life_stone_tier === 'High_Grade_Life_Stone';
        const colHex = isTop ? '#f43f5e' : (isHigh ? '#c084fc' : '#38bdf8');
        const iconTxt = curAugMode === 'Symbol_Dye_Parlors' ? '🎨' : '🔮';
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || h.town_zone_id.replace('zone-', ''))}', '${escapeHtml(h.anvil_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <line x1="${dc.svgX}" y1="${dc.svgY}" x2="${ac.svgX}" y2="${ac.svgY}" stroke="${colHex}" stroke-width="1.6" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="10.5" fill="rgba(107,33,168,0.34)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D36: Interactive Pet, Strider & Castle Wyvern Mount Sanctuary Overlay (`studioCompanionMountOverlay`)
  const companionNodes = (tatlas && tatlas.companion_mount_sanctuaries) || [];
  const curCompMode = ATLAS_COMPANION_MOUNT_MODE || ATLAS_STATE_STORE.companionMountMode || 'All';
  const activeCompanionNodes = curCompMode === 'Off'
    ? []
    : (curCompMode === 'All'
      ? companionNodes
      : companionNodes.filter(n => n.mount_category === curCompMode));
  const companionMountOverlaySvg = !shouldRenderStudioSvgOverlay('companion_mount') ? '<g id="studioCompanionMountOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCompanionMountOverlay">
      ${activeCompanionNodes.map(n => {
        const cc = clampWorldLocCoord(n.loc || '-83880:243720');
        const isPet = n.mount_category === 'Pet_Manager_Kennel';
        const isStrider = n.mount_category === 'Hatchling_Strider_Sanctum';
        const colHex = isPet ? '#38bdf8' : (isStrider ? '#34d399' : '#f59e0b');
        const iconTxt = isPet ? '🐾' : (isStrider ? '🦎' : '🐉');
        const z = allZonesById[n.zone_id] || {};
        const clickJs = isPet
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
          : (isStrider
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="11" fill="rgba(6,95,70,0.34)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="3 2"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D37: Interactive Clan Reputation, Academy & Pledge Skill Altar Overlay (`studioClanAcademyOverlay`)
  const clanNodes = (tatlas && tatlas.clan_reputation_academies) || [];
  const curClanMode = ATLAS_CLAN_ACADEMY_MODE || ATLAS_STATE_STORE.clanAcademyMode || 'All';
  const activeClanNodes = curClanMode === 'Off'
    ? []
    : (curClanMode === 'All'
      ? clanNodes
      : clanNodes.filter(n => n.pledge_category === curClanMode));
  const clanAcademyOverlaySvg = !shouldRenderStudioSvgOverlay('clan_academy') ? '<g id="studioClanAcademyOverlay" data-lens-gated="1"></g>' : `
    <g id="studioClanAcademyOverlay">
      ${activeClanNodes.map(n => {
        const cc = clampWorldLocCoord(n.loc || '-84320:243280');
        const isAcad = n.pledge_category === 'Clan_Academy_Hall';
        const isAmb = n.pledge_category === 'Clan_Ambition_Altar';
        const colHex = isAcad ? '#38bdf8' : (isAmb ? '#f97316' : '#facc15');
        const iconTxt = isAcad ? '🎓' : (isAmb ? '⚔️' : '👑');
        const z = allZonesById[n.zone_id] || {};
        const isTownZone = String(n.zone_id || '').startsWith('zone-town-');
        const isFieldZone = String(n.zone_id || '').startsWith('zone-field-');
        const clickJs = isTownZone
          ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
          : (isFieldZone
            ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
            : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.8" fill="rgba(180,83,9,0.34)" stroke="${colHex}" stroke-width="1.9" stroke-dasharray="3 2"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D38: Interactive 24-Field Elemental Attribute & Ground Herb Sustainability Biome Overlay (`studioHerbElementalBiomeOverlay`)
  const herbBiomes = (tatlas && tatlas.field_herb_elemental_biomes) || [];
  const curHerbMode = ATLAS_HERB_BIOME_MODE || ATLAS_STATE_STORE.herbBiomeMode || 'All';
  const activeHerbBiomes = curHerbMode === 'Off'
    ? []
    : (curHerbMode === 'S_Tier_Zero_Downtime' || curHerbMode === 'A_Tier_Mystic_Mana_Rich'
      ? herbBiomes.filter(b => b.herb_drop_tier === curHerbMode)
      : herbBiomes);
  const elemHexByType = {
    Fire: '#f97316',
    Water: '#38bdf8',
    Wind: '#34d399',
    Earth: '#eab308',
    Holy: '#fde047',
    Dark: '#c084fc'
  };
  const herbElementalBiomeOverlaySvg = !shouldRenderStudioSvgOverlay('herb_biome') ? '<g id="studioHerbElementalBiomeOverlay" data-lens-gated="1"></g>' : `
    <g id="studioHerbElementalBiomeOverlay">
      ${activeHerbBiomes.map(b => {
        const fz = allZonesById[b.field_zone_id] || {};
        const fc = clampWorldLocCoord(fz.loc_coord || '72986:113330');
        const colHex = elemHexByType[b.dominant_element] || '#4ade80';
        const iconTxt = b.herb_drop_tier === 'S_Tier_Zero_Downtime' ? '🧪' : (b.herb_drop_tier === 'A_Tier_Mystic_Mana_Rich' ? '💧' : '🌿');
        const clickJs = `focusFieldTacticalBlueprint('${escapeHtml(b.field_zone_id)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${clickJs}">
            <circle cx="${fc.svgX}" cy="${fc.svgY}" r="11.5" fill="rgba(21,128,61,0.28)" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="2 2"/>
            <text x="${fc.svgX}" y="${fc.svgY + 3.5}" text-anchor="middle" font-size="8.2">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D39: Interactive 15-Town Soulshot/Spiritshot & Dwarven Private Manufacture Workshop Overlay (`studioSoulshotWorkshopOverlay`)
  const workshopPlazas = (tatlas && tatlas.soulshot_workshop_plazas) || [];
  const curWorkshopMode = ATLAS_WORKSHOP_MODE || ATLAS_STATE_STORE.workshopMode || 'All';
  const activeWorkshopPlazas = curWorkshopMode === 'Off'
    ? []
    : (curWorkshopMode === 'All'
      ? workshopPlazas
      : workshopPlazas.filter(p => p.workshop_tier === curWorkshopMode));
  const soulshotWorkshopOverlaySvg = !shouldRenderStudioSvgOverlay('workshop_plaza') ? '<g id="studioSoulshotWorkshopOverlay" data-lens-gated="1"></g>' : `
    <g id="studioSoulshotWorkshopOverlay">
      ${activeWorkshopPlazas.map(p => {
        const pc = clampWorldLocCoord(p.plaza_loc || '-84120:243500');
        const sz = allZonesById[p.recipe_spoil_zone_id] || {};
        const tz = allZonesById[p.town_zone_id] || {};
        const sc = clampWorldLocCoord(sz.loc_coord || '-68180:228620');
        const isCap = p.workshop_tier === 'Capital_S_Grade_Master_Forge';
        const isReg = p.workshop_tier === 'Regional_B_A_Workshop';
        const colHex = isCap ? '#f59e0b' : (isReg ? '#fb923c' : '#38bdf8');
        const iconTxt = isCap ? '👑' : (isReg ? '⚙️' : '⚒️');
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || p.town_zone_id.replace('zone-', ''))}', '${escapeHtml(p.plaza_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <line x1="${sc.svgX}" y1="${sc.svgY}" x2="${pc.svgX}" y2="${pc.svgY}" stroke="${colHex}" stroke-width="1.6" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${pc.svgX}" cy="${pc.svgY}" r="10.6" fill="rgba(194,65,12,0.34)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${pc.svgX}" y="${pc.svgY + 3.5}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D40: Interactive Territory Ward Relic & Fortress Giant's Codex Supply Overlay (`studioTerritoryWardOverlay`)
  const territoryWardNodes = (tatlas && tatlas.territory_ward_supply_nodes) || [];
  const curWardMode = ATLAS_TERRITORY_WARD_MODE || ATLAS_STATE_STORE.territoryWardMode || 'All';
  const activeTerritoryWardNodes = curWardMode === 'Off'
    ? []
    : (curWardMode === 'All'
      ? territoryWardNodes
      : territoryWardNodes.filter(n => n.node_role === curWardMode));
  const territoryWardOverlaySvg = !shouldRenderStudioSvgOverlay('territory_ward') ? '<g id="studioTerritoryWardOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTerritoryWardOverlay">
      ${activeTerritoryWardNodes.map(n => {
        const wc = clampWorldLocCoord(n.loc || '-96020:258560');
        const vz = allZonesById[n.linked_vassal_zone_id] || {};
        const vc = clampWorldLocCoord(vz.loc_coord || '-84120:243500');
        const isWard = n.node_role === 'Sovereign_Territory_Ward';
        const colHex = isWard ? '#f43f5e' : '#eab308';
        const iconTxt = isWard ? '🚩' : '📖';
        const fortClickJs = `focusFortressBlueprint('${escapeHtml(n.stronghold_zone_id)}', '${escapeHtml(n.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${fortClickJs}">
            <line x1="${wc.svgX}" y1="${wc.svgY}" x2="${vc.svgX}" y2="${vc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.75"/>
            <circle cx="${wc.svgX}" cy="${wc.svgY}" r="10.8" fill="rgba(190,18,60,0.34)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${wc.svgX}" y="${wc.svgY + 3.5}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D41: Interactive 12-Relic Epic Boss Jewelry & Status Resistance Overlay (`studioEpicJewelryOverlay`)
  const epicJewelryRows = (tatlas && tatlas.epic_jewelry_sanctums) || [];
  const curJewelryMode = ATLAS_EPIC_JEWELRY_MODE || ATLAS_STATE_STORE.epicJewelryMode || 'All';
  const activeEpicJewelryRows = curJewelryMode === 'Off'
    ? []
    : (curJewelryMode === 'All'
      ? epicJewelryRows
      : epicJewelryRows.filter(r => r.slot_category === curJewelryMode));
  const epicJewelryOverlaySvg = !shouldRenderStudioSvgOverlay('epic_jewelry') ? '<g id="studioEpicJewelryOverlay" data-lens-gated="1"></g>' : `
    <g id="studioEpicJewelryOverlay">
      ${activeEpicJewelryRows.map(r => {
        const jc = clampWorldLocCoord(r.loc || '-113190:235226');
        const isRing = r.slot_category === 'Epic_Ring';
        const isEar = r.slot_category === 'Epic_Earring';
        const colHex = isRing ? '#f59e0b' : (isEar ? '#38bdf8' : '#e879f9');
        const iconTxt = isRing ? '💍' : (isEar ? '💎' : '📿');
        const jumpJs = r.dungeon_id
          ? `openDungeonSubMap('${escapeHtml(r.dungeon_id)}', '${escapeHtml(r.floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(r.zone_id)}', '${escapeHtml(r.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${jc.svgX}" cy="${jc.svgY}" r="11.4" fill="rgba(88,28,135,0.42)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${jc.svgX}" y="${jc.svgY + 3.5}" text-anchor="middle" font-size="8.6">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D42: Interactive 15-Town Adventurer's Guide Buff, Shadow Weapon & Vitality Obelisk Overlay (`studioVitalityObeliskOverlay`)
  const vitalityObeliskRows = (tatlas && tatlas.adventurer_vitality_obelisks) || [];
  const curObeliskMode = ATLAS_VITALITY_OBELISK_MODE || ATLAS_STATE_STORE.vitalityObeliskMode || 'All';
  const activeVitalityObelisks = curObeliskMode === 'Off'
    ? []
    : (curObeliskMode === 'All'
      ? vitalityObeliskRows
      : vitalityObeliskRows.filter(o => o.obelisk_tier === curObeliskMode));
  const vitalityObeliskOverlaySvg = !shouldRenderStudioSvgOverlay('vitality_obelisk') ? '<g id="studioVitalityObeliskOverlay" data-lens-gated="1"></g>' : `
    <g id="studioVitalityObeliskOverlay">
      ${activeVitalityObelisks.map(o => {
        const oc = clampWorldLocCoord(o.obelisk_loc || '-84120:243500');
        const tz = allZonesById[o.town_zone_id] || {};
        const isCap = o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary';
        const isReg = o.obelisk_tier === 'Regional_Shadow_Weapon_Hub';
        const colHex = isCap ? '#34d399' : (isReg ? '#38bdf8' : '#fbbf24');
        const iconTxt = isCap ? '🔋' : (isReg ? '⚡' : '✨');
        const townClickJs = `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || o.town_zone_id.replace('zone-', ''))}', '${escapeHtml(o.obelisk_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${townClickJs}">
            <circle cx="${oc.svgX}" cy="${oc.svgY}" r="10.4" fill="rgba(6,78,59,0.42)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${oc.svgX}" y="${oc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D43: Interactive 16-Set Armor Progression & Masterwork Foundation Forge Overlay (`studioArmorSetMasterworkOverlay`)
  const armorSetRows = (tatlas && tatlas.armor_set_masterwork_forges) || [];
  const curArmorSetMode = ATLAS_ARMOR_SET_MODE || ATLAS_STATE_STORE.armorSetMode || 'All';
  const activeArmorSetRows = curArmorSetMode === 'Off'
    ? []
    : (curArmorSetMode === 'All'
      ? armorSetRows
      : armorSetRows.filter(s => s.armor_weight_class === curArmorSetMode));
  const armorSetMasterworkOverlaySvg = !shouldRenderStudioSvgOverlay('armor_set') ? '<g id="studioArmorSetMasterworkOverlay" data-lens-gated="1"></g>' : `
    <g id="studioArmorSetMasterworkOverlay">
      ${activeArmorSetRows.map(s => {
        const fc = clampWorldLocCoord(s.forge_loc || '-84120:243500');
        const dz = allZonesById[s.key_piece_drop_zone_id] || {};
        const tz = allZonesById[s.forge_town_zone_id] || {};
        const dc = clampWorldLocCoord(dz.loc_coord || '-113190:235226');
        const isHeavy = s.armor_weight_class === 'Heavy_Vanguard_Set';
        const isLight = s.armor_weight_class === 'Light_Skirmisher_Set';
        const colHex = isHeavy ? '#f59e0b' : (isLight ? '#38bdf8' : '#c084fc');
        const iconTxt = isHeavy ? '⚔️' : (isLight ? '🏹' : '🔮');
        const jumpJs = s.key_piece_dungeon_id
          ? `openDungeonSubMap('${escapeHtml(s.key_piece_dungeon_id)}', '${escapeHtml(s.key_piece_floor_id || 'B2')}')`
          : `focusTownStreetBlueprint('${escapeHtml(tz.studio_node_id || s.forge_town_zone_id.replace('zone-', ''))}', '${escapeHtml(s.forge_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${dc.svgX}" y1="${dc.svgY}" x2="${fc.svgX}" y2="${fc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${fc.svgX}" cy="${fc.svgY}" r="10.6" fill="rgba(161,98,7,0.38)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${fc.svgX}" y="${fc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D44: Interactive 15-Portal Kamaloka, Pailaka & Seed Instance Conduit Overlay (`studioKamalokaPailakaOverlay`)
  const kamalokaRows = (tatlas && tatlas.kamaloka_pailaka_instances) || [];
  const curKamalokaMode = ATLAS_KAMALOKA_MODE || ATLAS_STATE_STORE.kamalokaMode || 'All';
  const activeKamalokaRows = curKamalokaMode === 'Off'
    ? []
    : (curKamalokaMode === 'All'
      ? kamalokaRows
      : kamalokaRows.filter(i => i.conduit_category === curKamalokaMode));
  const kamalokaPailakaOverlaySvg = !shouldRenderStudioSvgOverlay('kamaloka') ? '<g id="studioKamalokaPailakaOverlay" data-lens-gated="1"></g>' : `
    <g id="studioKamalokaPailakaOverlay">
      ${activeKamalokaRows.map(inst => {
        const ic = clampWorldLocCoord(inst.loc || '-84120:243500');
        const zObj = allZonesById[inst.zone_id] || {};
        const zidStr = String(inst.zone_id || '');
        const isKama = inst.conduit_category === 'Kamaloka_Abyss_Hall';
        const isPailaka = inst.conduit_category === 'Pailaka_Vitality_Trial';
        const colHex = isKama ? '#38bdf8' : (isPailaka ? '#34d399' : '#e879f9');
        const iconTxt = isKama ? '🕸️' : (isPailaka ? '🐉' : '🌌');
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(inst.loc)}')`;
        if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(inst.loc)}')`;
        } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(inst.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${ic.svgX}" cy="${ic.svgY}" r="10.8" fill="rgba(2,132,199,0.36)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${ic.svgX}" y="${ic.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D45: Interactive 16-Sanctum Forgotten Scroll, Ancient Tome & Lv.81–83 Skill Mastery Overlay (`studioForgottenScrollOverlay`)
  const scrollSanctumRows = (tatlas && tatlas.forgotten_scroll_skill_sanctums) || [];
  const curSkillScrollMode = ATLAS_SKILL_SCROLL_MODE || ATLAS_STATE_STORE.skillScrollMode || 'All';
  const activeScrollSanctums = curSkillScrollMode === 'Off'
    ? []
    : (curSkillScrollMode === 'All'
      ? scrollSanctumRows
      : scrollSanctumRows.filter(s => s.mastery_category === curSkillScrollMode));
  const forgottenScrollOverlaySvg = !shouldRenderStudioSvgOverlay('skill_scroll') ? '<g id="studioForgottenScrollOverlay" data-lens-gated="1"></g>' : `
    <g id="studioForgottenScrollOverlay">
      ${activeScrollSanctums.map(s => {
        const sc = clampWorldLocCoord(s.loc || '-84120:243500');
        const tz = allZonesById[s.trainer_town_zone_id] || {};
        const tc = clampWorldLocCoord(tz.loc_coord || '-84120:243500');
        const isMartial = s.mastery_category === 'Martial_Will_Scroll';
        const isArcane = s.mastery_category === 'Arcane_Enlightenment_Scroll';
        const colHex = isMartial ? '#f97316' : (isArcane ? '#c084fc' : '#fde047');
        const iconTxt = isMartial ? '⚔️' : (isArcane ? '🔮' : '📜');
        const jumpJs = s.drop_dungeon_id
          ? `openDungeonSubMap('${escapeHtml(s.drop_dungeon_id)}', '${escapeHtml(s.drop_floor_id || 'B3')}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(s.drop_zone_id)}', '${escapeHtml(s.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${sc.svgX}" y1="${sc.svgY}" x2="${tc.svgX}" y2="${tc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="4 2" opacity="0.78"/>
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.6" fill="rgba(88,28,135,0.40)" stroke="${colHex}" stroke-width="1.8"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D46: Interactive 14-Node Elemental Attribute Stone/Crystal (150/300) & Caravan Quarry Overlay (`studioElementalQuarryOverlay`)
  const quarryRows = (tatlas && tatlas.elemental_stone_caravan_quarries) || [];
  const curQuarryMode = ATLAS_ELEMENTAL_QUARRY_MODE || ATLAS_STATE_STORE.elementalQuarryMode || 'All';
  const activeQuarries = curQuarryMode === 'Off'
    ? []
    : (curQuarryMode === 'All'
      ? quarryRows
      : quarryRows.filter(q => q.quarry_category === curQuarryMode));
  const elementalQuarryOverlaySvg = !shouldRenderStudioSvgOverlay('elemental_quarry') ? '<g id="studioElementalQuarryOverlay" data-lens-gated="1"></g>' : `
    <g id="studioElementalQuarryOverlay">
      ${activeQuarries.map(q => {
        const qc = clampWorldLocCoord(q.loc || '-84120:243500');
        const zObj = allZonesById[q.zone_id] || {};
        const zidStr = String(q.zone_id || '');
        const isStone = q.quarry_category === 'Elemental_Stone_Quarry_150';
        const isCrystal = q.quarry_category === 'Elemental_Crystal_Sanctum_300';
        const colHex = isStone ? '#fb923c' : (isCrystal ? '#38bdf8' : '#facc15');
        const iconTxt = isStone ? '🔥' : (isCrystal ? '💎' : '🐪');
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(q.loc)}')`;
        if (q.dungeon_id) {
          jumpJs = `openDungeonSubMap('${escapeHtml(q.dungeon_id)}', '${escapeHtml(q.floor_id || '3F')}')`;
        } else if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(q.loc)}')`;
        } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(q.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${qc.svgX}" cy="${qc.svgY}" r="10.8" fill="rgba(194,65,12,0.38)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${qc.svgX}" y="${qc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D47: Interactive 16-Estate Clan Hall Auction & Siege Chateau Overlay (`studioClanHallAuctionOverlay`)
  const clanHallRows = (tatlas && tatlas.clan_hall_auction_estates) || [];
  const curClanHallMode = ATLAS_CLAN_HALL_MODE || ATLAS_STATE_STORE.clanHallMode || 'All';
  const activeClanHalls = curClanHallMode === 'Off'
    ? []
    : (curClanHallMode === 'All'
      ? clanHallRows
      : clanHallRows.filter(e => e.acquisition_mode === curClanHallMode));
  const clanHallAuctionOverlaySvg = !shouldRenderStudioSvgOverlay('clan_hall') ? '<g id="studioClanHallAuctionOverlay" data-lens-gated="1"></g>' : `
    <g id="studioClanHallAuctionOverlay">
      ${activeClanHalls.map(e => {
        const ec = clampWorldLocCoord(e.loc || '-84120:243500');
        const zObj = allZonesById[e.zone_id] || {};
        const zidStr = String(e.zone_id || '');
        const isAuction = e.acquisition_mode === 'Town_Luxury_Auction_Hall';
        const colHex = isAuction ? '#facc15' : '#f43f5e';
        const iconTxt = isAuction ? '💰' : '⚔️';
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(e.loc)}')`;
        if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(e.loc)}')`;
        } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(e.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${ec.svgX}" cy="${ec.svgY}" r="10.8" fill="rgba(161,98,7,0.38)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${ec.svgX}" y="${ec.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D48: Interactive 15-Sanctum Transformation Sealbook, Talisman & Agathion Summon Overlay (`studioTransformationTalismanOverlay`)
  const transSanctumRows = (tatlas && tatlas.transformation_talisman_sanctums) || [];
  const curTransMode = ATLAS_TRANSFORMATION_MODE || ATLAS_STATE_STORE.transformationMode || 'All';
  const activeTransSanctums = curTransMode === 'Off'
    ? []
    : (curTransMode === 'All'
      ? transSanctumRows
      : transSanctumRows.filter(s => s.relic_category === curTransMode));
  const transformationTalismanOverlaySvg = !shouldRenderStudioSvgOverlay('transformation') ? '<g id="studioTransformationTalismanOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTransformationTalismanOverlay">
      ${activeTransSanctums.map(s => {
        const sc = clampWorldLocCoord(s.loc || '-84120:243500');
        const zObj = allZonesById[s.zone_id] || {};
        const zidStr = String(s.zone_id || '');
        const isTrans = s.relic_category === 'Avant_Garde_Transformation_Sanctum';
        const isTalisman = s.relic_category === 'Epaulette_Talisman_Vault';
        const colHex = isTrans ? '#38bdf8' : (isTalisman ? '#a855f7' : '#f472b6');
        const iconTxt = isTrans ? '🦋' : (isTalisman ? '🔮' : '🧚');
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        if (s.dungeon_id) {
          jumpJs = `openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.floor_id || '3F')}')`;
        } else if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
        } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.8" fill="rgba(2,132,199,0.38)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D49: Interactive 15-Town Iron Gate Warehouse, Clan Vault & Freight Logistics Overlay (`studioWarehouseFreightOverlay`)
  const warehouseRows = (tatlas && tatlas.warehouse_freight_vaults) || [];
  const curWarehouseMode = ATLAS_WAREHOUSE_MODE || ATLAS_STATE_STORE.warehouseMode || 'All';
  const activeWarehouses = curWarehouseMode === 'Off'
    ? []
    : (curWarehouseMode === 'All'
      ? warehouseRows
      : warehouseRows.filter(v => v.logistics_tier === curWarehouseMode));
  const warehouseFreightOverlaySvg = !shouldRenderStudioSvgOverlay('warehouse') ? '<g id="studioWarehouseFreightOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWarehouseFreightOverlay">
      ${activeWarehouses.map(v => {
        const vc = clampWorldLocCoord(v.vault_loc || '-84120:243500');
        const zObj = allZonesById[v.town_zone_id] || {};
        const pObj = allZonesById[v.freight_corridor_partner_zone_id] || {};
        const pc = clampWorldLocCoord(pObj.loc_coord || v.vault_loc || '-84120:243500');
        const isStarter = v.logistics_tier === 'Starter_Iron_Gate_Vault';
        const isRegional = v.logistics_tier === 'Regional_Freight_Depot';
        const colHex = isStarter ? '#fbbf24' : (isRegional ? '#fb923c' : '#38bdf8');
        const iconTxt = isStarter ? '🏦' : (isRegional ? '🚚' : '💎');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || String(v.town_zone_id || '').replace('zone-', ''))}', '${escapeHtml(v.vault_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${vc.svgX}" y1="${vc.svgY}" x2="${pc.svgX}" y2="${pc.svgY}" stroke="${colHex}" stroke-width="1.4" stroke-dasharray="3 3" opacity="0.55"/>
            <circle cx="${vc.svgX}" cy="${vc.svgY}" r="10.8" fill="rgba(194,65,12,0.38)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${vc.svgX}" y="${vc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D50: Interactive 18-Checkpoint Master Cartographic Tour & 50-Dimension Studio Inspector Overlay (`studioMasterTourOverlay`)
  const masterTourRows = (tatlas && tatlas.atlas_master_telemetry_checkpoints) || [];
  const curMasterTourMode = ATLAS_MASTER_TOUR_MODE || ATLAS_STATE_STORE.masterTourMode || 'All';
  const activeMasterTourCps = curMasterTourMode === 'Off'
    ? []
    : (curMasterTourMode === 'All'
      ? masterTourRows
      : masterTourRows.filter(cp => cp.tour_category === curMasterTourMode));
  const masterTourOverlaySvg = !shouldRenderStudioSvgOverlay('master_tour') ? '<g id="studioMasterTourOverlay" data-lens-gated="1"></g>' : `
    <g id="studioMasterTourOverlay">
      ${activeMasterTourCps.map((cp, idx) => {
        const cc = clampWorldLocCoord(cp.loc || '-84120:243500');
        const nextCp = activeMasterTourCps[idx + 1];
        const nc = nextCp ? clampWorldLocCoord(nextCp.loc || '-84120:243500') : null;
        const zObj = allZonesById[cp.zone_id] || {};
        const zidStr = String(cp.zone_id || '');
        const isOrigin = cp.tour_category === 'Race_Origin_To_Awakening';
        const isTown = cp.tour_category === 'Town_Blueprint_And_Economy';
        const colHex = isOrigin ? '#34d399' : (isTown ? '#facc15' : '#c084fc');
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(cp.loc)}')`;
        if (cp.dungeon_id) {
          jumpJs = `openDungeonSubMap('${escapeHtml(cp.dungeon_id)}', '${escapeHtml(cp.floor_id || '3F')}')`;
        } else if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(cp.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            ${nc ? `<line x1="${cc.svgX}" y1="${cc.svgY}" x2="${nc.svgX}" y2="${nc.svgY}" stroke="#34d399" stroke-width="1.3" stroke-dasharray="2 3" opacity="0.5"/>` : ''}
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.2" fill="rgba(5,150,105,0.45)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.2}" text-anchor="middle" font-size="8" font-weight="900" fill="#ffffff">#${cp.step_order}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D51: Interactive 15-Town Festival of Darkness & Oracle of Dawn/Dusk Party Altar Overlay (`studioFestivalOracleOverlay`)
  const festivalOracleRows = (tatlas && tatlas.festival_of_darkness_oracles) || [];
  const curFestivalOracleMode = ATLAS_FESTIVAL_ORACLE_MODE || ATLAS_STATE_STORE.festivalOracleMode || 'All';
  const activeFestivalOracles = curFestivalOracleMode === 'Off'
    ? []
    : (curFestivalOracleMode === 'All'
        ? festivalOracleRows
        : festivalOracleRows.filter(o => o.oracle_category === curFestivalOracleMode));
  const festivalOracleOverlaySvg = !shouldRenderStudioSvgOverlay('festival_oracle') ? '<g id="studioFestivalOracleOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFestivalOracleOverlay">
      ${activeFestivalOracles.map(o => {
        const oc = clampWorldLocCoord(o.oracle_loc || '-84120:243500');
        const zObj = allZonesById[o.town_zone_id] || {};
        const isDawn = o.oracle_category === 'Oracle_of_Dawn_Sanctuary';
        const isDusk = o.oracle_category === 'Oracle_of_Dusk_Sanctuary';
        const colHex = isDawn ? '#facc15' : (isDusk ? '#c084fc' : '#f43f5e');
        const iconTxt = isDawn ? '☀️' : (isDusk ? '🌙' : '🩸');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || String(o.town_zone_id || '').replace('zone-', ''))}', '${escapeHtml(o.oracle_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${oc.svgX}" cy="${oc.svgY}" r="10.5" fill="rgba(162,28,175,0.4)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${oc.svgX}" y="${oc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D52: Interactive 12-Node Luxury Boutique & Black Marketeer of Mammon Exchange Overlay (`studioLuxuryBlackMarketOverlay`)
  const luxuryBoutiqueRows = (tatlas && tatlas.luxury_black_market_boutiques) || [];
  const curLuxuryMarketMode = ATLAS_LUXURY_MARKET_MODE || ATLAS_STATE_STORE.luxuryMarketMode || 'All';
  const activeLuxuryBoutiques = curLuxuryMarketMode === 'Off'
    ? []
    : (curLuxuryMarketMode === 'All'
        ? luxuryBoutiqueRows
        : luxuryBoutiqueRows.filter(b => b.market_category === curLuxuryMarketMode));
  const luxuryBlackMarketOverlaySvg = !shouldRenderStudioSvgOverlay('luxury_market') ? '<g id="studioLuxuryBlackMarketOverlay" data-lens-gated="1"></g>' : `
    <g id="studioLuxuryBlackMarketOverlay">
      ${activeLuxuryBoutiques.map(b => {
        const bc = clampWorldLocCoord(b.loc || '147400:-55200');
        const zObj = allZonesById[b.zone_id] || {};
        const zidStr = String(b.zone_id || '');
        const isCrystal = b.market_category === 'Crystal_Luxury_Armory';
        const isSmuggler = b.market_category === 'Black_Marketeer_of_Mammon';
        const colHex = isCrystal ? '#38bdf8' : (isSmuggler ? '#f43f5e' : '#facc15');
        const iconTxt = isCrystal ? '💎' : (isSmuggler ? '🕶️' : '👑');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(b.loc)}')`;
        if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${bc.svgX}" cy="${bc.svgY}" r="10.5" fill="rgba(180,83,9,0.42)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${bc.svgX}" y="${bc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D53: Interactive 14-Node Factional Alliance War & Totem Raid Altar Overlay (`studioFactionAllianceOverlay`)
  const factionCampRows = (tatlas && tatlas.faction_alliance_war_camps) || [];
  const curFactionAllianceMode = ATLAS_FACTION_ALLIANCE_MODE || ATLAS_STATE_STORE.factionAllianceMode || 'All';
  const activeFactionCamps = curFactionAllianceMode === 'Off'
    ? []
    : (curFactionAllianceMode === 'All'
        ? factionCampRows
        : factionCampRows.filter(c => c.faction_category === curFactionAllianceMode));
  const factionAllianceOverlaySvg = !shouldRenderStudioSvgOverlay('faction_alliance') ? '<g id="studioFactionAllianceOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFactionAllianceOverlay">
      ${activeFactionCamps.map(c => {
        const cc = clampWorldLocCoord(c.loc || '82900:53200');
        const rzObj = allZonesById[c.rival_camp_zone_id] || {};
        const rc = clampWorldLocCoord(rzObj.loc_coord || c.loc || '82900:53200');
        const zidStr = String(c.zone_id || '');
        const isOrc = c.faction_category === 'Vanguard_Orc_Alliance_Outpost';
        const isSilenos = c.faction_category === 'Shaman_Silenos_Alliance_Stronghold';
        const colHex = isOrc ? '#f97316' : (isSilenos ? '#34d399' : '#38bdf8');
        const iconTxt = isOrc ? '🐂' : (isSilenos ? '🦌' : '🔥');
        const jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${cc.svgX}" y1="${cc.svgY}" x2="${rc.svgX}" y2="${rc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.58"/>
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.6" fill="rgba(194,65,12,0.42)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D54: Interactive 12-Node Monster Derby Race Track, Coin of Magic & Kratei's Cube Overlay (`studioFantasyPlazaOverlay`)
  const fantasyPlazaRows = (tatlas && tatlas.monster_track_fantasy_plazas) || [];
  const curFantasyPlazaMode = ATLAS_FANTASY_PLAZA_MODE || ATLAS_STATE_STORE.fantasyPlazaMode || 'All';
  const activeFantasyPlazas = curFantasyPlazaMode === 'Off'
    ? []
    : (curFantasyPlazaMode === 'All'
        ? fantasyPlazaRows
        : fantasyPlazaRows.filter(p => p.activity_category === curFantasyPlazaMode));
  const fantasyPlazaOverlaySvg = !shouldRenderStudioSvgOverlay('fantasy_plaza') ? '<g id="studioFantasyPlazaOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFantasyPlazaOverlay">
      ${activeFantasyPlazas.map(p => {
        const pc = clampWorldLocCoord(p.loc || '18600:145200');
        const zObj = allZonesById[p.zone_id] || {};
        const zidStr = String(p.zone_id || '');
        const isDerby = p.activity_category === 'Monster_Derby_Race_Track';
        const isCoin = p.activity_category === 'Coin_of_Magic_Collector_Lodge';
        const colHex = isDerby ? '#facc15' : (isCoin ? '#fb923c' : '#2dd4bf');
        const iconTxt = isDerby ? '🏇' : (isCoin ? '🪙' : '🎡');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`;
        if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${pc.svgX}" cy="${pc.svgY}" r="10.5" fill="rgba(15,118,110,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${pc.svgX}" y="${pc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D55: Interactive 15-Town Hero Weapon (Infinity Armaments) & Olympiad Token Exchange Overlay (`studioHeroWeaponExchangeOverlay`)
  const heroExchangeRows = (tatlas && tatlas.olympiad_hero_weapon_exchanges) || [];
  const curHeroWeaponMode = ATLAS_HERO_WEAPON_MODE || ATLAS_STATE_STORE.heroWeaponMode || 'All';
  const activeHeroExchanges = curHeroWeaponMode === 'Off'
    ? []
    : (curHeroWeaponMode === 'All'
        ? heroExchangeRows
        : heroExchangeRows.filter(e => e.exchange_category === curHeroWeaponMode));
  const heroWeaponExchangeOverlaySvg = !shouldRenderStudioSvgOverlay('hero_weapon') ? '<g id="studioHeroWeaponExchangeOverlay" data-lens-gated="1"></g>' : `
    <g id="studioHeroWeaponExchangeOverlay">
      ${activeHeroExchanges.map(e => {
        const ec = clampWorldLocCoord(e.monument_loc || '-84120:243500');
        const zObj = allZonesById[e.town_zone_id] || {};
        const zidStr = String(e.town_zone_id || '');
        const isMartial = e.exchange_category === 'Martial_Infinity_Armory';
        const isArcane = e.exchange_category === 'Arcane_Infinity_Sanctum';
        const colHex = isMartial ? '#f59e0b' : (isArcane ? '#c084fc' : '#38bdf8');
        const iconTxt = isMartial ? '🗡️' : (isArcane ? '🔮' : '📜');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(e.monument_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${ec.svgX}" cy="${ec.svgY}" r="10.5" fill="rgba(161,98,7,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${ec.svgX}" y="${ec.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D56: Interactive 16-Zone Treasure Chest Lockpick (Grade 1-8 Keys) & Mimic Cache Overlay (`studioTreasureChestOverlay`)
  const treasureChestRows = (tatlas && tatlas.treasure_chest_lockpick_grounds) || [];
  const curTreasureChestMode = ATLAS_TREASURE_CHEST_MODE || ATLAS_STATE_STORE.treasureChestMode || 'All';
  const activeTreasureCaches = curTreasureChestMode === 'Off'
    ? []
    : (curTreasureChestMode === 'All'
        ? treasureChestRows
        : treasureChestRows.filter(c => c.cache_environment === curTreasureChestMode));
  const treasureChestOverlaySvg = !shouldRenderStudioSvgOverlay('treasure_chest') ? '<g id="studioTreasureChestOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTreasureChestOverlay">
      ${activeTreasureCaches.map(c => {
        const cc = clampWorldLocCoord(c.loc || '48550:248400');
        const zidStr = String(c.zone_id || '');
        const didStr = String(c.dungeon_id || '');
        const fidStr = String(c.floor_id || 'B2');
        const isOverland = c.cache_environment === 'Overland_Pirate_Bandit_Cache';
        const isCatacomb = c.cache_environment === 'Underground_Catacomb_Vault';
        const colHex = isOverland ? '#fbbf24' : (isCatacomb ? '#e879f9' : '#38bdf8');
        const iconTxt = isOverland ? '🗝️' : (isCatacomb ? '🕳️' : '🗼');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.5" fill="rgba(134,25,143,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D57: Interactive 12-Node Clan Airship Summon Dock, Star Stone Extraction & Aerial Raid Overlay (`studioAerialStarStoneOverlay`)
  const aerialDockRows = (tatlas && tatlas.aerial_star_stone_docks) || [];
  const curAerialDockMode = ATLAS_AERIAL_DOCK_MODE || ATLAS_STATE_STORE.aerialDockMode || 'All';
  const activeAerialDocks = curAerialDockMode === 'Off'
    ? []
    : (curAerialDockMode === 'All'
        ? aerialDockRows
        : aerialDockRows.filter(d => d.aerial_category === curAerialDockMode));
  const aerialStarStoneOverlaySvg = !shouldRenderStudioSvgOverlay('aerial_dock') ? '<g id="studioAerialStarStoneOverlay" data-lens-gated="1"></g>' : `
    <g id="studioAerialStarStoneOverlay">
      ${activeAerialDocks.map(d => {
        const ac = clampWorldLocCoord(d.loc || '-84120:243500');
        const czObj = allZonesById[d.connected_dock_zone_id] || {};
        const cc = clampWorldLocCoord(czObj.loc_coord || d.loc || '-84120:243500');
        const zObj = allZonesById[d.zone_id] || {};
        const zidStr = String(d.zone_id || '');
        const isDock = d.aerial_category === 'Clan_Airship_Summon_Dock';
        const isField = d.aerial_category === 'Star_Stone_Extraction_Field';
        const colHex = isDock ? '#38bdf8' : (isField ? '#f43f5e' : '#facc15');
        const iconTxt = isDock ? '⚓' : (isField ? '☄️' : '🦅');
        let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(d.loc)}')`;
        if (zidStr.startsWith('zone-town-')) {
          jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(d.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(d.loc)}')`;
        } else if (zidStr.startsWith('zone-dungeon-') || zidStr.startsWith('zone-catacomb-')) {
          const defFloor = zidStr === 'zone-dungeon-star-heart-nave' ? '3F' : 'B3';
          jumpJs = `openDungeonSubMap('${escapeHtml(zidStr)}', '${defFloor}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${ac.svgX}" y1="${ac.svgY}" x2="${cc.svgX}" y2="${cc.svgY}" stroke="${colHex}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.58"/>
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="10.6" fill="rgba(3,105,161,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D58: Interactive 14-Node Weaver Olf Mithril Belt & Sovereign Boss/Castle Cloak Overlay (`studioBeltCloakWeaverOverlay`)
  const beltCloakRows = (tatlas && tatlas.belt_cloak_weaver_hubs) || [];
  const curBeltCloakMode = ATLAS_BELT_CLOAK_MODE || ATLAS_STATE_STORE.beltCloakMode || 'All';
  const activeBeltCloakHubs = curBeltCloakMode === 'Off'
    ? []
    : (curBeltCloakMode === 'All'
        ? beltCloakRows
        : beltCloakRows.filter(h => h.garment_category === curBeltCloakMode));
  const beltCloakWeaverOverlaySvg = !shouldRenderStudioSvgOverlay('belt_cloak') ? '<g id="studioBeltCloakWeaverOverlay" data-lens-gated="1"></g>' : `
    <g id="studioBeltCloakWeaverOverlay">
      ${activeBeltCloakHubs.map(h => {
        const hc = clampWorldLocCoord(h.loc || '18600:145200');
        const zObj = allZonesById[h.zone_id] || {};
        const zidStr = String(h.zone_id || '');
        const didStr = String(h.dungeon_id || '');
        const fidStr = String(h.floor_id || 'B3');
        const isLoom = h.garment_category === 'Weaver_Olf_Belt_Loom';
        const isBoss = h.garment_category === 'Sovereign_Boss_Cloak_Sanctum';
        const colHex = isLoom ? '#facc15' : (isBoss ? '#c084fc' : '#38bdf8');
        const iconTxt = isLoom ? '🧵' : (isBoss ? '🧥' : '🎖️');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(h.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(h.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${hc.svgX}" cy="${hc.svgY}" r="10.5" fill="rgba(107,33,168,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${hc.svgX}" y="${hc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D59: Interactive 12-Sanctuary Wedding Cathedral, Formal Wear & Couple Teleport Overlay (`studioWeddingCathedralOverlay`)
  const weddingRows = (tatlas && tatlas.wedding_ceremony_cathedrals) || [];
  const curWeddingMode = ATLAS_WEDDING_MODE || ATLAS_STATE_STORE.weddingMode || 'All';
  const activeWeddingSanctuaries = curWeddingMode === 'Off'
    ? []
    : (curWeddingMode === 'All'
        ? weddingRows
        : weddingRows.filter(s => s.ceremony_category === curWeddingMode));
  const weddingCathedralOverlaySvg = !shouldRenderStudioSvgOverlay('wedding') ? '<g id="studioWeddingCathedralOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWeddingCathedralOverlay">
      ${activeWeddingSanctuaries.map(s => {
        const wc = clampWorldLocCoord(s.loc || '147900:26800');
        const zObj = allZonesById[s.zone_id] || {};
        const zidStr = String(s.zone_id || '');
        const isCathedral = s.ceremony_category === 'Grand_Wedding_Cathedral';
        const isTailor = s.ceremony_category === 'Formal_Wear_Couture_Tailor';
        const colHex = isCathedral ? '#f472b6' : (isTailor ? '#facc15' : '#34d399');
        const iconTxt = isCathedral ? '💒' : (isTailor ? '👗' : '🏹');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
        if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${wc.svgX}" cy="${wc.svgY}" r="10.5" fill="rgba(190,24,93,0.44)" stroke="${colHex}" stroke-width="1.9"/>
            <text x="${wc.svgX}" y="${wc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D60: Interactive 18-Benchmark 6-Role Studio Council 60-Dimension Audit Overlay (`studioCouncilBenchmarkOverlay`)
  const councilBenchmarkRows = (tatlas && tatlas.studio_council_audit_benchmarks) || [];
  const curCouncilBenchmarkMode = ATLAS_COUNCIL_BENCHMARK_MODE || ATLAS_STATE_STORE.councilBenchmarkMode || 'All';
  const activeCouncilBenchmarks = curCouncilBenchmarkMode === 'Off'
    ? []
    : (curCouncilBenchmarkMode === 'All'
        ? councilBenchmarkRows
        : councilBenchmarkRows.filter(b => b.council_role === curCouncilBenchmarkMode));
  const councilBenchmarkOverlaySvg = !shouldRenderStudioSvgOverlay('council_benchmark') ? '<g id="studioCouncilBenchmarkOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCouncilBenchmarkOverlay">
      ${activeCouncilBenchmarks.map(b => {
        const bc = clampWorldLocCoord(b.loc || '-84120:243500');
        const zObj = allZonesById[b.exemplar_zone_id] || {};
        const zidStr = String(b.exemplar_zone_id || '');
        const didStr = String(b.exemplar_dungeon_id || '');
        const fidStr = String(b.exemplar_floor_id || 'B3');
        const roleCols = {
          'Product_Owner': '#fde047',
          'Game_Designer_Lead': '#38bdf8',
          'Player_Growth_Path_Designer': '#34d399',
          'Game_Story_Designer': '#c084fc',
          'Monster_And_Mob_Designer': '#f87171',
          'Lead_Systems_Map_Architect': '#fb923c'
        };
        const roleIcons = {
          'Product_Owner': '📋',
          'Game_Designer_Lead': '🎮',
          'Player_Growth_Path_Designer': '📈',
          'Game_Story_Designer': '📖',
          'Monster_And_Mob_Designer': '👾',
          'Lead_Systems_Map_Architect': '🗺️'
        };
        const colHex = roleCols[b.council_role] || '#fde047';
        const iconTxt = roleIcons[b.council_role] || '🏛️';
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(b.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${bc.svgX}" cy="${bc.svgY}" r="10.8" fill="rgba(14,116,144,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${bc.svgX}" y="${bc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D61: Interactive 14-Node Continental Seed Cycle (`Stage 1–5` Ekimus/Tiat State Machine) Overlay (`studioContinentalSeedOverlay`)
  const seedCycleRows = (tatlas && tatlas.continental_seed_cycles) || [];
  const curSeedCycleMode = ATLAS_SEED_CYCLE_MODE || ATLAS_STATE_STORE.seedCycleMode || 'All';
  const activeSeedNodes = curSeedCycleMode === 'Off'
    ? []
    : (curSeedCycleMode === 'All'
        ? seedCycleRows
        : seedCycleRows.filter(s => s.seed_category === curSeedCycleMode));
  const continentalSeedOverlaySvg = !shouldRenderStudioSvgOverlay('seed_cycle') ? '<g id="studioContinentalSeedOverlay" data-lens-gated="1"></g>' : `
    <g id="studioContinentalSeedOverlay">
      ${activeSeedNodes.map(s => {
        const sc = clampWorldLocCoord(s.loc || '-186200:242800');
        const zObj = allZonesById[s.zone_id] || {};
        const zidStr = String(s.zone_id || '');
        const didStr = String(s.dungeon_id || '');
        const fidStr = String(s.floor_id || 'B3');
        const isInf = s.seed_category === 'Seed_of_Infinity_Stage';
        const isDest = s.seed_category === 'Seed_of_Destruction_Stage';
        const colHex = isInf ? '#c084fc' : (isDest ? '#f87171' : '#38bdf8');
        const iconTxt = isInf ? '💀' : (isDest ? '🐉' : '⚡');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.6" fill="rgba(88,28,135,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D62: Interactive 12-Arena Underground Coliseum (`Party-vs-Party`) & Clan Tournament Overlay (`studioColiseumTournamentOverlay`)
  const coliseumTournamentRows = (tatlas && tatlas.party_coliseum_tournaments) || [];
  const curColiseumTournamentMode = ATLAS_COLISEUM_TOURNAMENT_MODE || ATLAS_STATE_STORE.coliseumTournamentMode || 'All';
  const activeColiseumArenas = curColiseumTournamentMode === 'Off'
    ? []
    : (curColiseumTournamentMode === 'All'
        ? coliseumTournamentRows
        : coliseumTournamentRows.filter(a => a.tournament_category === curColiseumTournamentMode));
  const coliseumTournamentOverlaySvg = !shouldRenderStudioSvgOverlay('coliseum_tournament') ? '<g id="studioColiseumTournamentOverlay" data-lens-gated="1"></g>' : `
    <g id="studioColiseumTournamentOverlay">
      ${activeColiseumArenas.map(a => {
        const ac = clampWorldLocCoord(a.loc || '146800:46700');
        const zObj = allZonesById[a.zone_id] || {};
        const zidStr = String(a.zone_id || '');
        const isCol = a.tournament_category === 'Underground_Coliseum_Bracket';
        const isClan = a.tournament_category === 'Clan_War_Tournament_Ring';
        const colHex = isCol ? '#f87171' : (isClan ? '#fb923c' : '#fde047');
        const iconTxt = isCol ? '⚔️' : (isClan ? '🏰' : '👑');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(a.loc)}')`;
        if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(a.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(a.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${ac.svgX}" cy="${ac.svgY}" r="10.6" fill="rgba(153,27,27,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${ac.svgX}" y="${ac.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D63: Interactive 14-Sanctum Elemental Jewel, Raid Rune Stone & Ancient Giant's Relic Overlay (`studioElementalJewelOverlay`)
  const jewelRuneRows = (tatlas && tatlas.elemental_jewel_rune_sanctums) || [];
  const curElementalJewelMode = ATLAS_ELEMENTAL_JEWEL_MODE || ATLAS_STATE_STORE.elementalJewelMode || 'All';
  const activeJewelSanctums = curElementalJewelMode === 'Off'
    ? []
    : (curElementalJewelMode === 'All'
        ? jewelRuneRows
        : jewelRuneRows.filter(s => s.relic_tier_category === curElementalJewelMode));
  const elementalJewelOverlaySvg = !shouldRenderStudioSvgOverlay('elemental_jewel') ? '<g id="studioElementalJewelOverlay" data-lens-gated="1"></g>' : `
    <g id="studioElementalJewelOverlay">
      ${activeJewelSanctums.map(s => {
        const jc = clampWorldLocCoord(s.loc || '146800:46700');
        const zObj = allZonesById[s.zone_id] || {};
        const zidStr = String(s.zone_id || '');
        const didStr = String(s.dungeon_id || '');
        const fidStr = String(s.floor_id || 'B3');
        const isJewel = s.relic_tier_category === 'Elemental_Jewel_Forge';
        const isRune = s.relic_tier_category === 'Raid_Rune_Stone_Altar';
        const colHex = isJewel ? '#38bdf8' : (isRune ? '#c084fc' : '#facc15');
        const iconTxt = isJewel ? '💎' : (isRune ? '🪨' : '🏛️');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${jc.svgX}" cy="${jc.svgY}" r="10.6" fill="rgba(12,74,110,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${jc.svgX}" y="${jc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D64: Interactive 15-Town Reputation Manager (`Rapidus / Scipio`) Fame & PvP Infusion Monument Overlay (`studioFameMonumentOverlay`)
  const fameMonumentRows = (tatlas && tatlas.reputation_fame_monuments) || [];
  const curFameMonumentMode = ATLAS_FAME_MONUMENT_MODE || ATLAS_STATE_STORE.fameMonumentMode || 'All';
  const activeFameMonuments = curFameMonumentMode === 'Off'
    ? []
    : (curFameMonumentMode === 'All'
        ? fameMonumentRows
        : fameMonumentRows.filter(m => m.fame_service_category === curFameMonumentMode));
  const fameMonumentOverlaySvg = !shouldRenderStudioSvgOverlay('fame_monument') ? '<g id="studioFameMonumentOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFameMonumentOverlay">
      ${activeFameMonuments.map(m => {
        const mc = clampWorldLocCoord(m.monument_loc || '-84120:243500');
        const zObj = allZonesById[m.town_zone_id] || {};
        const tidStr = String(zObj.studio_node_id || String(m.town_zone_id || '').replace('zone-', ''));
        const isWep = m.fame_service_category === 'PvP_Weapon_Infusion_Obelisk';
        const isArm = m.fame_service_category === 'PvP_Armor_Mirage_Obelisk';
        const colHex = isWep ? '#f87171' : (isArm ? '#60a5fa' : '#fbbf24');
        const iconTxt = isWep ? '⚔️' : (isArm ? '🛡️' : '⚖️');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tidStr)}', '${escapeHtml(m.monument_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${mc.svgX}" cy="${mc.svgY}" r="10.6" fill="rgba(120,53,15,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${mc.svgX}" y="${mc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D65: Interactive 12-Conduit Delusion Chamber & Aenkinel Raid Overlay (`studioDelusionChamberOverlay`)
  const delusionConduitRows = (tatlas && tatlas.delusion_chamber_conduits) || [];
  const curDelusionChamberMode = ATLAS_DELUSION_CHAMBER_MODE || ATLAS_STATE_STORE.delusionChamberMode || 'All';
  const activeDelusionConduits = curDelusionChamberMode === 'Off'
    ? []
    : (curDelusionChamberMode === 'All'
        ? delusionConduitRows
        : delusionConduitRows.filter(c => c.delusion_category === curDelusionChamberMode));
  const delusionChamberOverlaySvg = !shouldRenderStudioSvgOverlay('delusion_chamber') ? '<g id="studioDelusionChamberOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDelusionChamberOverlay">
      ${activeDelusionConduits.map(c => {
        const dc = clampWorldLocCoord(c.loc || '146800:46700');
        const zObj = allZonesById[c.zone_id] || {};
        const zidStr = String(c.zone_id || '');
        const didStr = String(c.dungeon_id || '');
        const fidStr = String(c.floor_id || 'B3');
        const isSeal = c.delusion_category === 'Seal_Delusion_Chamber';
        const isTower = c.delusion_category === 'Great_Tower_Of_Seal_Chamber';
        const colHex = isSeal ? '#c084fc' : (isTower ? '#f472b6' : '#34d399');
        const iconTxt = isSeal ? '🚪' : (isTower ? '🗼' : '🍃');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(c.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${dc.svgX}" cy="${dc.svgY}" r="10.6" fill="rgba(88,28,135,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${dc.svgX}" y="${dc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D66: Interactive 14-Sanctum Zaken Candlelight, Ice Queen Freya & Frintezza Organ Command-Channel Raid Overlay (`studioCommandChannelRaidOverlay`)
  const commandRaidRows = (tatlas && tatlas.command_channel_raid_sanctums) || [];
  const curCommandRaidMode = ATLAS_COMMAND_RAID_MODE || ATLAS_STATE_STORE.commandRaidMode || 'All';
  const activeCommandRaidSanctums = curCommandRaidMode === 'Off'
    ? []
    : (curCommandRaidMode === 'All'
        ? commandRaidRows
        : commandRaidRows.filter(s => s.expedition_wing === curCommandRaidMode));
  const commandChannelRaidOverlaySvg = !shouldRenderStudioSvgOverlay('command_raid') ? '<g id="studioCommandChannelRaidOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCommandChannelRaidOverlay">
      ${activeCommandRaidSanctums.map(s => {
        const rc = clampWorldLocCoord(s.loc || '146800:46700');
        const zObj = allZonesById[s.zone_id] || {};
        const zidStr = String(s.zone_id || '');
        const didStr = String(s.dungeon_id || '');
        const fidStr = String(s.floor_id || 'B3');
        const isZaken = s.expedition_wing === 'Zaken_Candlelight_Cavern';
        const isFreya = s.expedition_wing === 'Ice_Queen_Freya_Palace';
        const colHex = isZaken ? '#f59e0b' : (isFreya ? '#38bdf8' : '#f43f5e');
        const iconTxt = isZaken ? '🏴‍☠️' : (isFreya ? '❄️' : '🎻');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${rc.svgX}" cy="${rc.svgY}" r="10.6" fill="rgba(12,74,110,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${rc.svgX}" y="${rc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D67: Interactive 15-Town Nevit's Blessing Hourglass & Hunting Helper Companion Overlay (`studioNevitBlessingOverlay`)
  const nevitBlessingRows = (tatlas && tatlas.nevit_blessing_sanctuaries) || [];
  const curNevitBlessingMode = ATLAS_NEVIT_BLESSING_MODE || ATLAS_STATE_STORE.nevitBlessingMode || 'All';
  const activeNevitSanctuaries = curNevitBlessingMode === 'Off'
    ? []
    : (curNevitBlessingMode === 'All'
        ? nevitBlessingRows
        : nevitBlessingRows.filter(s => s.blessing_category === curNevitBlessingMode));
  const nevitBlessingOverlaySvg = !shouldRenderStudioSvgOverlay('nevit_blessing') ? '<g id="studioNevitBlessingOverlay" data-lens-gated="1"></g>' : `
    <g id="studioNevitBlessingOverlay">
      ${activeNevitSanctuaries.map(s => {
        const nc = clampWorldLocCoord(s.sanctuary_loc || '-84120:243500');
        const zObj = allZonesById[s.town_zone_id] || {};
        const tidStr = String(zObj.studio_node_id || String(s.town_zone_id || '').replace('zone-', ''));
        const isNevit = s.blessing_category === 'Nevit_Hourglass_Altar';
        const isFairy = s.blessing_category === 'Arcane_Fairy_Helper_Sanctuary';
        const colHex = isNevit ? '#fbbf24' : (isFairy ? '#f472b6' : '#34d399');
        const iconTxt = isNevit ? '⏳' : (isFairy ? '🧚' : '🐢');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tidStr)}', '${escapeHtml(s.sanctuary_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${nc.svgX}" cy="${nc.svgY}" r="10.6" fill="rgba(120,53,15,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${nc.svgX}" y="${nc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D68: Interactive 24-Record 8-Hour Studio Council Complete D1–D68 Sign-Off Ledger Overlay (`studioCouncilSignoffOverlay`)
  const councilSignoffRows = (tatlas && tatlas.eight_hour_council_signoff_ledger) || [];
  const curCouncilSignoffMode = ATLAS_COUNCIL_SIGNOFF_MODE || ATLAS_STATE_STORE.councilSignoffMode || 'All';
  const activeCouncilSignoffs = curCouncilSignoffMode === 'Off'
    ? []
    : (curCouncilSignoffMode === 'All'
        ? councilSignoffRows
        : councilSignoffRows.filter(r => r.council_role === curCouncilSignoffMode));
  const councilSignoffOverlaySvg = !shouldRenderStudioSvgOverlay('council_signoff') ? '<g id="studioCouncilSignoffOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCouncilSignoffOverlay">
      ${activeCouncilSignoffs.map(r => {
        const sc = clampWorldLocCoord(r.loc || '-84120:243500');
        const zObj = allZonesById[r.zone_id] || {};
        const zidStr = String(r.zone_id || '');
        const didStr = String(r.dungeon_id || '');
        const fidStr = String(r.floor_id || 'B3');
        let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(r.loc)}')`;
        if (didStr) {
          jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
        } else if (zidStr.startsWith('zone-field-')) {
          jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(r.loc)}')`;
        } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
          jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(r.loc)}')`;
        }
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.8" fill="rgba(6,95,70,0.48)" stroke="#34d399" stroke-width="2.0"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.4}" text-anchor="middle" font-size="8.4">🏆</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D69: Interactive 16-Zone Champion Mob Aura (Blue 10x / Red 50x) & Group Herd Leader Overlay (`studioChampionMobOverlay`)
  const championMobRows = (tatlas && tatlas.champion_mob_herd_grounds) || [];
  const curChampionMobMode = ATLAS_CHAMPION_MOB_MODE || ATLAS_STATE_STORE.championMobMode || 'All';
  const activeChampionGrounds = curChampionMobMode === 'Off'
    ? []
    : (curChampionMobMode === 'All'
        ? championMobRows
        : championMobRows.filter(g => g.champion_category === curChampionMobMode));
  const championMobOverlaySvg = !shouldRenderStudioSvgOverlay('champion_mob') ? '<g id="studioChampionMobOverlay" data-lens-gated="1"></g>' : `
    <g id="studioChampionMobOverlay">
      ${activeChampionGrounds.map(g => {
        const cc = clampWorldLocCoord(g.loc || '-84120:243500');
        const zidStr = String(g.zone_id || '');
        const didStr = String(g.dungeon_id || '');
        const fidStr = String(g.floor_id || 'B2');
        const isBlue = g.champion_category === 'Blue_Aura_10x_Champion_Field';
        const isCrimson = g.champion_category === 'Crimson_Aura_50x_Champion_Sanctum';
        const colHex = isBlue ? '#38bdf8' : (isCrimson ? '#ef4444' : '#fbbf24');
        const iconTxt = isBlue ? '🔵' : (isCrimson ? '🔴' : '🐺');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${cc.svgX}" cy="${cc.svgY}" r="10.8" fill="rgba(127,29,29,0.46)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${cc.svgX}" y="${cc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D70: Interactive 15-Town Dualsword Craft Stamp & Maestro Ishuma S80/S84 Unseal Forge Overlay (`studioDualswordForgeOverlay`)
  const dualswordForgeRows = (tatlas && tatlas.dualsword_craft_unseal_forges) || [];
  const curDualswordForgeMode = ATLAS_DUALSWORD_FORGE_MODE || ATLAS_STATE_STORE.dualswordForgeMode || 'All';
  const activeDualswordForges = curDualswordForgeMode === 'Off'
    ? []
    : (curDualswordForgeMode === 'All'
        ? dualswordForgeRows
        : dualswordForgeRows.filter(f => f.dualsword_tier_category === curDualswordForgeMode));
  const dualswordForgeOverlaySvg = !shouldRenderStudioSvgOverlay('dualsword_forge') ? '<g id="studioDualswordForgeOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDualswordForgeOverlay">
      ${activeDualswordForges.map(f => {
        const dc = clampWorldLocCoord(f.anvil_loc || '-84120:243500');
        const zObj = allZonesById[f.town_zone_id] || {};
        const tidStr = String(zObj.studio_node_id || String(f.town_zone_id || '').replace('zone-', ''));
        const isStarter = f.dualsword_tier_category === 'Starter_C_B_Dualsword_Anvil';
        const isStamp = f.dualsword_tier_category === 'A_S_Grade_Craft_Stamp_Forge';
        const colHex = isStarter ? '#38bdf8' : (isStamp ? '#f59e0b' : '#c084fc');
        const iconTxt = isStarter ? '🗡️' : (isStamp ? '📜' : '🛸');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tidStr)}', '${escapeHtml(f.anvil_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${dc.svgX}" cy="${dc.svgY}" r="10.6" fill="rgba(59,7,100,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${dc.svgX}" y="${dc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D71: Interactive 16-Node [Stage 2: Asset & Build] Technical Artist Pipeline Overlay (`studioTechArtPipelineOverlay`)
  const techArtRows = (tatlas && tatlas.tech_art_asset_pipeline_gates) || [];
  const curTechArtMode = ATLAS_TECH_ART_PIPELINE_MODE || ATLAS_STATE_STORE.techArtPipelineMode || 'All';
  const activeTechArtGates = curTechArtMode === 'Off'
    ? []
    : (curTechArtMode === 'All'
        ? techArtRows
        : techArtRows.filter(g => g.pipeline_stage_category === curTechArtMode));
  const techArtPipelineOverlaySvg = !shouldRenderStudioSvgOverlay('tech_art') ? '<g id="studioTechArtPipelineOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTechArtPipelineOverlay">
      ${activeTechArtGates.map(g => {
        const tc = clampWorldLocCoord(g.loc || '-84120:243500');
        const zidStr = String(g.zone_id || '');
        const didStr = String(g.dungeon_id || '');
        const fidStr = String(g.floor_id || 'B3');
        const zObj = allZonesById[zidStr] || {};
        const isGlb = g.pipeline_stage_category === 'Three_Tier_GLB_Asset_Gate';
        const isVal = g.pipeline_stage_category === 'Polygon_Bone_Shader_Validator';
        const colHex = isGlb ? '#34d399' : (isVal ? '#f472b6' : '#38bdf8');
        const iconTxt = isGlb ? '📦' : (isVal ? '📐' : '🗺️');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(g.loc)}')`
              : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                  ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${tc.svgX}" cy="${tc.svgY}" r="10.6" fill="rgba(6,78,59,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${tc.svgX}" y="${tc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D72: Interactive 16-Node [Stage 3: Server & Simulation] 10k-Bot Swarm & Spatial Partition Overlay (`studioBotSwarmSimOverlay`)
  const botSwarmRows = (tatlas && tatlas.backend_bot_swarm_simulation_sectors) || [];
  const curBotSwarmMode = ATLAS_BOT_SWARM_SIM_MODE || ATLAS_STATE_STORE.botSwarmSimMode || 'All';
  const activeBotSwarmSectors = curBotSwarmMode === 'Off'
    ? []
    : (curBotSwarmMode === 'All'
        ? botSwarmRows
        : botSwarmRows.filter(s => s.simulation_category === curBotSwarmMode));
  const botSwarmSimOverlaySvg = !shouldRenderStudioSvgOverlay('bot_swarm') ? '<g id="studioBotSwarmSimOverlay" data-lens-gated="1"></g>' : `
    <g id="studioBotSwarmSimOverlay">
      ${activeBotSwarmSectors.map(s => {
        const sc = clampWorldLocCoord(s.loc || '-84120:243500');
        const zidStr = String(s.zone_id || '');
        const didStr = String(s.dungeon_id || '');
        const fidStr = String(s.floor_id || 'B3');
        const zObj = allZonesById[zidStr] || {};
        const isSwarm = s.simulation_category === 'Headless_10k_Bot_Swarm_Sector';
        const isSpatial = s.simulation_category === 'Spatial_Grid_AOI_Partition_Cell';
        const colHex = isSwarm ? '#38bdf8' : (isSpatial ? '#a855f7' : '#fbbf24');
        const iconTxt = isSwarm ? '🤖' : (isSpatial ? '🕸️' : '⏪');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`
              : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                  ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${sc.svgX}" cy="${sc.svgY}" r="10.6" fill="rgba(12,74,110,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${sc.svgX}" y="${sc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D73: Interactive 15-Node [Stage 4: LiveOps, Build & GM Portal] Stuck-Character Rescue, Rollback Audit & Hot-Config Overlay (`studioLiveopsGmOverlay`)
  const liveopsGmRows = (tatlas && tatlas.liveops_gm_control_anchors) || [];
  const curLiveopsGmMode = ATLAS_LIVEOPS_GM_MODE || ATLAS_STATE_STORE.liveopsGmMode || 'All';
  const activeLiveopsGmAnchors = curLiveopsGmMode === 'Off'
    ? []
    : (curLiveopsGmMode === 'All'
        ? liveopsGmRows
        : liveopsGmRows.filter(a => a.liveops_category === curLiveopsGmMode));
  const liveopsGmOverlaySvg = !shouldRenderStudioSvgOverlay('liveops_gm') ? '<g id="studioLiveopsGmOverlay" data-lens-gated="1"></g>' : `
    <g id="studioLiveopsGmOverlay">
      ${activeLiveopsGmAnchors.map(a => {
        const lc = clampWorldLocCoord(a.loc || '-84120:243500');
        const tidStr = String(a.town_zone_id || '');
        const zObj = allZonesById[tidStr] || {};
        const isRescue = a.liveops_category === 'GM_Stuck_Character_Rescue_Anchor';
        const isRollback = a.liveops_category === 'Inventory_Rollback_Audit_Vault';
        const colHex = isRescue ? '#34d399' : (isRollback ? '#c084fc' : '#fb923c');
        const iconTxt = isRescue ? '🛟' : (isRollback ? '🔐' : '🔥');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || tidStr.replace('zone-', ''))}', '${escapeHtml(a.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${lc.svgX}" cy="${lc.svgY}" r="10.6" fill="rgba(124,45,18,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${lc.svgX}" y="${lc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D74: Interactive 20-Tool [4-Domain × 5-Role Platform & Tools Squad] Unified Studio Pipeline Registry Overlay (`studioToolsSquadOverlay`)
  const toolsSquadRows = (tatlas && tatlas.platform_tools_squad_registry) || [];
  const curToolsSquadMode = ATLAS_TOOLS_SQUAD_MODE || ATLAS_STATE_STORE.toolsSquadMode || 'All';
  const activeToolsSquadItems = curToolsSquadMode === 'Off'
    ? []
    : (curToolsSquadMode === 'All'
        ? toolsSquadRows
        : toolsSquadRows.filter(t => t.tooling_domain === curToolsSquadMode || t.owner_squad_role === curToolsSquadMode));
  const toolsSquadOverlaySvg = !shouldRenderStudioSvgOverlay('tools_squad') ? '<g id="studioToolsSquadOverlay" data-lens-gated="1"></g>' : `
    <g id="studioToolsSquadOverlay">
      ${activeToolsSquadItems.map(t => {
        const tsc = clampWorldLocCoord(t.loc || '-84120:243500');
        const zidStr = String(t.exemplar_zone_id || '');
        const didStr = String(t.exemplar_dungeon_id || '');
        const fidStr = String(t.exemplar_floor_id || 'B3');
        const zObj = allZonesById[zidStr] || {};
        const dom = t.tooling_domain;
        const colHex = dom === 'Stage_1_Content_And_World'
          ? '#fde047'
          : (dom === 'Stage_2_Asset_And_Build_Pipeline'
              ? '#34d399'
              : (dom === 'Stage_3_Server_And_Simulation' ? '#38bdf8' : '#fb923c'));
        const iconTxt = dom === 'Stage_1_Content_And_World'
          ? '🗺️'
          : (dom === 'Stage_2_Asset_And_Build_Pipeline'
              ? '🎨'
              : (dom === 'Stage_3_Server_And_Simulation' ? '🤖' : '🛟'));
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(t.loc)}')`
              : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                  ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(t.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(t.loc)}')`));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${tsc.svgX}" cy="${tsc.svgY}" r="10.6" fill="rgba(112,26,117,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${tsc.svgX}" y="${tsc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D75: Interactive 18-Graph [Role 2: Content & World Tools Engineer] Branching Dialogue DAG & EN/TH Localization Validator Overlay (`studioDialogueGraphOverlay`)
  const dialogueGraphRows = (tatlas && tatlas.dialogue_localization_graphs) || [];
  const curDialogueGraphMode = ATLAS_DIALOGUE_GRAPH_MODE || ATLAS_STATE_STORE.dialogueGraphMode || 'All';
  const activeDialogueGraphs = curDialogueGraphMode === 'Off'
    ? []
    : (curDialogueGraphMode === 'All'
        ? dialogueGraphRows
        : dialogueGraphRows.filter(g => g.graph_category === curDialogueGraphMode));
  const dialogueGraphOverlaySvg = !shouldRenderStudioSvgOverlay('dialogue_dag') ? '<g id="studioDialogueGraphOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDialogueGraphOverlay">
      ${activeDialogueGraphs.map(g => {
        const dgc = clampWorldLocCoord(g.loc || '-84120:243500');
        const zidStr = String(g.zone_id || '');
        const didStr = String(g.dungeon_id || '');
        const fidStr = String(g.floor_id || 'B2');
        const zObj = allZonesById[zidStr] || {};
        const cat = g.graph_category;
        const colHex = cat === 'Main_Story_Dialogue_DAG'
          ? '#38bdf8'
          : (cat === 'Class_Trial_Branching_Tree' ? '#f472b6' : '#34d399');
        const iconTxt = cat === 'Main_Story_Dialogue_DAG'
          ? '📖'
          : (cat === 'Class_Trial_Branching_Tree' ? '⚔️' : '🌐');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(g.loc)}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${dgc.svgX}" cy="${dgc.svgY}" r="10.4" fill="rgba(12,74,110,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${dgc.svgX}" y="${dgc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // D76: Interactive 16-Zone [Role 1 & 2: Visual Spawner & Economy Balancer Suite] Visual Spawner, Monte-Carlo Loot Balancer & Hot-Reload SSOT Write-Back Overlay (`studioSpawnerBalancerOverlay`)
  const spawnerBalancerRows = (tatlas && tatlas.spawner_loot_balancer_suites) || [];
  const curSpawnerBalancerMode = ATLAS_SPAWNER_BALANCER_MODE || ATLAS_STATE_STORE.spawnerBalancerMode || 'All';
  const activeSpawnerBalancers = curSpawnerBalancerMode === 'Off'
    ? []
    : (curSpawnerBalancerMode === 'All'
        ? spawnerBalancerRows
        : spawnerBalancerRows.filter(s => s.balancer_category === curSpawnerBalancerMode));
  const spawnerBalancerOverlaySvg = !shouldRenderStudioSvgOverlay('spawner_balancer') ? '<g id="studioSpawnerBalancerOverlay" data-lens-gated="1"></g>' : `
    <g id="studioSpawnerBalancerOverlay">
      ${activeSpawnerBalancers.map(s => {
        const sbc = clampWorldLocCoord(s.loc || '-84120:243500');
        const zidStr = String(s.zone_id || '');
        const didStr = String(s.dungeon_id || '');
        const fidStr = String(s.floor_id || 'B3');
        const zObj = allZonesById[zidStr] || {};
        const cat = s.balancer_category;
        const colHex = cat === 'Visual_Spawner_Leash_Editor'
          ? '#a3e635'
          : (cat === 'Monte_Carlo_Loot_Inflation_Balancer' ? '#facc15' : '#c084fc');
        const iconTxt = cat === 'Visual_Spawner_Leash_Editor'
          ? '📍'
          : (cat === 'Monte_Carlo_Loot_Inflation_Balancer' ? '🎲' : '🔄');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${sbc.svgX}" cy="${sbc.svgY}" r="10.4" fill="rgba(54,83,20,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${sbc.svgX}" y="${sbc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Combat Skill Timeline & Boss Telegraph Profiles Overlay (D77)
  const atlas = tatlas || {};
  const skillTimelineProfiles = Array.isArray(atlas.combat_skill_timeline_profiles) ? atlas.combat_skill_timeline_profiles : [];
  const skillTimelineOverlaySvg = (!ATLAS_SKILL_TIMELINE_MODE || !shouldRenderStudioSvgOverlay('skill_timelines')) ? '<g id="studioSkillTimelineOverlay" data-lens-gated="1"></g>' : `
    <g id="studioSkillTimelineOverlay">
      ${skillTimelineProfiles.map((p, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const dMap = {};
        (atlas.dungeons || []).forEach(d => { dMap[d.id] = d; });
        const zidStr = p.zone_id || '';
        const didStr = p.dungeon_id || '';
        const fidStr = p.floor_id || '';
        const zObj = zMap[zidStr] || {};
        const dObj = dMap[didStr] || {};
        const rawX = typeof zObj.x === 'number' ? zObj.x : (typeof dObj.x === 'number' ? dObj.x : -14000);
        const rawY = typeof zObj.y === 'number' ? zObj.y : (typeof dObj.y === 'number' ? dObj.y : 123500);
        const stc = locToAtlasSvg(rawX + ((idx % 4) - 1.5) * 2850, rawY - 2950);
        const cat = p.timeline_category || 'Martial_Combo_Hitbox_Timeline';
        const colHex = cat === 'Martial_Combo_Hitbox_Timeline'
          ? '#f87171'
          : (cat === 'Arcane_Cast_Interrupt_Timeline' ? '#38bdf8' : '#facc15');
        const iconTxt = cat === 'Martial_Combo_Hitbox_Timeline'
          ? '⚔️'
          : (cat === 'Arcane_Cast_Interrupt_Timeline' ? '✨' : '🎯');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${stc.svgX}" cy="${stc.svgY}" r="10.4" fill="rgba(127,29,29,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${stc.svgX}" y="${stc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Automated Build Farm & Delta Binary Patch CDN Nodes Overlay (D78)
  const buildFarmNodes = Array.isArray(atlas.build_farm_patch_cdn_nodes) ? atlas.build_farm_patch_cdn_nodes : [];
  const buildFarmOverlaySvg = (!ATLAS_BUILD_FARM_MODE || !shouldRenderStudioSvgOverlay('build_farm')) ? '<g id="studioBuildFarmOverlay" data-lens-gated="1"></g>' : `
    <g id="studioBuildFarmOverlay">
      ${buildFarmNodes.map((n, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = n.zone_id || '';
        const zObj = zMap[zidStr] || {};
        const rawX = typeof zObj.x === 'number' ? zObj.x : -14000;
        const rawY = typeof zObj.y === 'number' ? zObj.y : 123500;
        const bfc = locToAtlasSvg(rawX + ((idx % 3) - 1) * 3200, rawY + 3150);
        const cat = n.build_node_category || 'Godot_Client_Pak_Cooker_Node';
        const colHex = cat === 'Godot_Client_Pak_Cooker_Node'
          ? '#fb923c'
          : (cat === 'Server_Rs_Linux_Musl_Build_Runner' ? '#38bdf8' : '#34d399');
        const iconTxt = cat === 'Godot_Client_Pak_Cooker_Node'
          ? '📦'
          : (cat === 'Server_Rs_Linux_Musl_Build_Runner' ? '🦀' : '🌐');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${bfc.svgX}" cy="${bfc.svgY}" r="10.4" fill="rgba(124,45,18,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${bfc.svgX}" y="${bfc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Architect DX, Cross-Tool Undo/Redo & Codegen Drift-Gate Overlay (D79)
  const architectDxGates = Array.isArray(atlas.architect_dx_codegen_gates) ? atlas.architect_dx_codegen_gates : [];
  const architectDxOverlaySvg = (!ATLAS_ARCHITECT_DX_MODE || !shouldRenderStudioSvgOverlay('architect_dx')) ? '<g id="studioArchitectDxOverlay" data-lens-gated="1"></g>' : `
    <g id="studioArchitectDxOverlay">
      ${architectDxGates.map((g, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = g.town_zone_id || '';
        const zObj = zMap[zidStr] || {};
        const rawX = typeof zObj.x === 'number' ? zObj.x : -14000;
        const rawY = typeof zObj.y === 'number' ? zObj.y : 123500;
        const dxc = locToAtlasSvg(rawX + ((idx % 3) - 1) * 3350, rawY - 3100);
        const cat = g.architect_dx_category || 'Unified_SSO_Editor_Session_Hub';
        const colHex = cat === 'Unified_SSO_Editor_Session_Hub'
          ? '#a78bfa'
          : (cat === 'Cross_Tool_Undo_Redo_Command_Stack' ? '#fbbf24' : '#34d399');
        const iconTxt = cat === 'Unified_SSO_Editor_Session_Hub'
          ? '🔐'
          : (cat === 'Cross_Tool_Undo_Redo_Command_Stack' ? '↩️' : '🛡️');
        const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(g.hub_loc)}')`;
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${dxc.svgX}" cy="${dxc.svgY}" r="10.4" fill="rgba(12,74,110,0.48)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${dxc.svgX}" y="${dxc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Two-Ring Studio 11-Role Complete D1-D80 Sign-Off Matrix Overlay (D80)
  const twoRingSignoffRecords = Array.isArray(atlas.two_ring_studio_80d_signoff_matrix) ? atlas.two_ring_studio_80d_signoff_matrix : [];
  const twoRingSignoffOverlaySvg = (!ATLAS_TWO_RING_SIGNOFF_MODE || !shouldRenderStudioSvgOverlay('two_ring_80d')) ? '<g id="studioTwoRingSignoffOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTwoRingSignoffOverlay">
      ${twoRingSignoffRecords.map((r, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = r.zone_id || '';
        const didStr = r.dungeon_id || '';
        const fidStr = r.floor_id || 'B1';
        const zObj = zMap[zidStr] || {};
        const rawX = typeof zObj.x === 'number' ? zObj.x : -14000;
        const rawY = typeof zObj.y === 'number' ? zObj.y : 123500;
        const trc = locToAtlasSvg(rawX + ((idx % 4) - 1.5) * 3100, rawY + 3400);
        const sring = r.studio_ring || 'Ring_A_Creative_Council';
        const colHex = sring === 'Ring_A_Creative_Council' ? '#f472b6' : '#38bdf8';
        const iconTxt = sring === 'Ring_A_Creative_Council' ? '🎨' : '🛠️';
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(r.loc)}')`
              : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(r.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${trc.svgX}" cy="${trc.svgY}" r="10.6" fill="rgba(66,32,6,0.52)" stroke="${colHex}" stroke-width="2.1"/>
            <text x="${trc.svgX}" y="${trc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic Weather, Day/Night Shader & Spatial Audio Acoustic Reverb Overlay (D81)
  const weatherAcousticProfiles = Array.isArray(atlas.weather_shader_acoustic_profiles) ? atlas.weather_shader_acoustic_profiles : [];
  const weatherAcousticOverlaySvg = (!ATLAS_WEATHER_ACOUSTIC_MODE || !shouldRenderStudioSvgOverlay('weather_shader')) ? '<g id="studioWeatherAcousticOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWeatherAcousticOverlay">
      ${weatherAcousticProfiles.map((p, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = p.zone_id || '';
        const didStr = p.dungeon_id || '';
        const fidStr = p.floor_id || 'B3';
        const zObj = zMap[zidStr] || {};
        const rawX = typeof zObj.x === 'number' ? zObj.x : -14000;
        const rawY = typeof zObj.y === 'number' ? zObj.y : 123500;
        const wac = locToAtlasSvg(rawX + ((idx % 4) - 1.5) * 3200, rawY - 3500);
        const cat = p.atmosphere_category || 'Town_Symphony_And_Tavern_Reverb';
        const colHex = cat === 'Town_Symphony_And_Tavern_Reverb'
          ? '#fbbf24'
          : (cat === 'Nocturnal_Curse_Fog_And_Blood_Rain_Field' ? '#c084fc' : '#34d399');
        const iconTxt = cat === 'Town_Symphony_And_Tavern_Reverb'
          ? '🎶'
          : (cat === 'Nocturnal_Curse_Fog_And_Blood_Rain_Field' ? '🌙' : '🕳️');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`
              : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${wac.svgX}" cy="${wac.svgY}" r="10.5" fill="rgba(30,27,75,0.52)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${wac.svgX}" y="${wac.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Server-Mesh Authority Handoff, Redis Stream Bus & PostgreSQL Write-Behind WAL Overlay (D82)
  const serverMeshCorridors = Array.isArray(atlas.server_mesh_persistence_corridors) ? atlas.server_mesh_persistence_corridors : [];
  const serverMeshOverlaySvg = (!ATLAS_SERVER_MESH_MODE || !shouldRenderStudioSvgOverlay('server_mesh')) ? '<g id="studioServerMeshOverlay" data-lens-gated="1"></g>' : `
    <g id="studioServerMeshOverlay">
      ${serverMeshCorridors.map((c, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const ozidStr = c.origin_zone_id || '';
        const dzidStr = c.destination_zone_id || '';
        const ozObj = zMap[ozidStr] || {};
        const dzObj = zMap[dzidStr] || {};
        const ox = typeof ozObj.x === 'number' ? ozObj.x : -14000;
        const oy = typeof ozObj.y === 'number' ? ozObj.y : 123500;
        const dx = typeof dzObj.x === 'number' ? dzObj.x : 18800;
        const dy = typeof dzObj.y === 'number' ? dzObj.y : 145200;
        const oc = locToAtlasSvg(ox + ((idx % 3) - 1) * 1800, oy + 1800);
        const dc = locToAtlasSvg(dx + ((idx % 3) - 1) * 1800, dy + 1800);
        const cat = c.infra_category || 'Zero_Loading_Zone_Boundary_Handoff';
        const colHex = cat === 'Zero_Loading_Zone_Boundary_Handoff'
          ? '#34d399'
          : (cat === 'Redis_Stream_Cross_Realm_Event_Bus' ? '#fb923c' : '#a78bfa');
        const iconTxt = cat === 'Zero_Loading_Zone_Boundary_Handoff'
          ? '🔄'
          : (cat === 'Redis_Stream_Cross_Realm_Event_Bus' ? '📡' : '🗄️');
        const jumpJs = ozidStr.startsWith('zone-town-')
          ? `focusTownStreetBlueprint('${escapeHtml(ozObj.studio_node_id || ozidStr.replace('zone-', ''))}', '${escapeHtml(c.loc)}')`
          : (ozidStr.startsWith('zone-dungeon-') || ozidStr.startsWith('zone-catacomb-')
              ? `openDungeonSubMap('${escapeHtml(ozidStr)}', 'B3')`
              : `focusFieldOrFortressBlueprint('${escapeHtml(ozidStr)}', '${escapeHtml(c.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <line x1="${oc.svgX}" y1="${oc.svgY}" x2="${dc.svgX}" y2="${dc.svgY}" stroke="${colHex}" stroke-width="1.8" stroke-dasharray="5 3" opacity="0.82"/>
            <circle cx="${oc.svgX}" cy="${oc.svgY}" r="10.4" fill="rgba(6,78,59,0.52)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${oc.svgX}" y="${oc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Anti-Bot / RMT Telemetry, Macro Captcha & Economy Anomaly Sentinel Matrix Overlay (D83)
  const antiBotSentinelRecords = Array.isArray(atlas.anti_bot_economy_sentinels) ? atlas.anti_bot_economy_sentinels : [];
  const antiBotSentinelOverlaySvg = (!ATLAS_ANTI_BOT_MODE || !shouldRenderStudioSvgOverlay('anti_bot')) ? '<g id="studioAntiBotSentinelOverlay" data-lens-gated="1"></g>' : `
    <g id="studioAntiBotSentinelOverlay">
      ${antiBotSentinelRecords.map((s, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = s.zone_id || '';
        const didStr = s.dungeon_id || '';
        const fidStr = s.floor_id || 'B3';
        const zObj = zMap[zidStr] || {};
        const wx = typeof s.world_x === 'number' ? s.world_x : (typeof zObj.x === 'number' ? zObj.x : -14000);
        const wy = typeof s.world_y === 'number' ? s.world_y : (typeof zObj.y === 'number' ? zObj.y : 123500);
        const abc = locToAtlasSvg(wx + ((idx % 4) - 1.5) * 2600, wy - 2800);
        const cat = s.sentinel_category || 'Field_Macro_Bot_Captcha_Trap';
        const colHex = cat === 'Field_Macro_Bot_Captcha_Trap'
          ? '#f87171'
          : (cat === 'Dungeon_Teleport_Speedhack_Interdictor' ? '#fb923c' : '#f43f5e');
        const iconTxt = cat === 'Field_Macro_Bot_Captcha_Trap'
          ? '🤖'
          : (cat === 'Dungeon_Teleport_Speedhack_Interdictor' ? '⚡' : '💸');
        const jumpJs = didStr
          ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
          : (zidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`
              : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${abc.svgX}" cy="${abc.svgY}" r="10.4" fill="rgba(127,29,29,0.52)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${abc.svgX}" y="${abc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Godot Tool-Scene Storybook & 3D Kitbash Prefab Inspector Matrix Overlay (D84)
  const godotStorybookRecords = Array.isArray(atlas.godot_storybook_prefab_nodes) ? atlas.godot_storybook_prefab_nodes : [];
  const godotStorybookOverlaySvg = (!ATLAS_GODOT_STORYBOOK_MODE || !shouldRenderStudioSvgOverlay('godot_storybook')) ? '<g id="studioGodotStorybookOverlay" data-lens-gated="1"></g>' : `
    <g id="studioGodotStorybookOverlay">
      ${godotStorybookRecords.map((p, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = p.zone_id || '';
        const zObj = zMap[zidStr] || {};
        const wx = typeof p.world_x === 'number' ? p.world_x : (typeof zObj.x === 'number' ? zObj.x : -14000);
        const wy = typeof p.world_y === 'number' ? p.world_y : (typeof zObj.y === 'number' ? zObj.y : 123500);
        const gsc = locToAtlasSvg(wx + ((idx % 3) - 1) * 2800, wy + 2900);
        const cat = p.prefab_category || 'Town_Kitbash_Building_Prefab';
        const colHex = cat === 'Town_Kitbash_Building_Prefab'
          ? '#818cf8'
          : (cat === 'Dungeon_Modular_Vault_Tile_Kit' ? '#38bdf8' : '#a78bfa');
        const iconTxt = cat === 'Town_Kitbash_Building_Prefab'
          ? '🏛️'
          : (cat === 'Dungeon_Modular_Vault_Tile_Kit' ? '🧱' : '✨');
        const jumpJs = zidStr.startsWith('zone-town-')
          ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`
          : (zidStr.startsWith('zone-dungeon-') || zidStr.startsWith('zone-catacomb-')
              ? `openDungeonSubMap('${escapeHtml(zidStr)}', 'B3')`
              : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`);
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="${jumpJs}">
            <circle cx="${gsc.svgX}" cy="${gsc.svgY}" r="10.4" fill="rgba(30,27,75,0.52)" stroke="${colHex}" stroke-width="2.0"/>
            <text x="${gsc.svgX}" y="${gsc.svgY + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // 3D NavMesh Pathfinding, Jump-Link & Dynamic Door/Bridge Obstacle Matrix Overlay (D85)
  const navmeshObstacleRecords = Array.isArray(atlas.navmesh_obstacle_sectors) ? atlas.navmesh_obstacle_sectors : [];
  const navmeshObstacleOverlaySvg = (!ATLAS_NAVMESH_MODE || !shouldRenderStudioSvgOverlay('navmesh')) ? '<g id="studioNavmeshObstacleOverlay" data-lens-gated="1"></g>' : `
    <g id="studioNavmeshObstacleOverlay">
      ${navmeshObstacleRecords.map((n, idx) => {
        const zMap = {};
        (atlas.zones || []).forEach(z => { zMap[z.id] = z; });
        const zidStr = n.zone_id || '';
        const didStr = n.dungeon_id || '';
        const zObj = zMap[zidStr] || {};
        const wx = typeof n.world_x === 'number' ? n.world_x : (typeof zObj.x === 'number' ? zObj.x : 520);
        const wy = typeof n.world_y === 'number' ? n.world_y : (typeof zObj.y === 'number' ? zObj.y : 280);
        const colHex = n.accent || '#10b981';
        const stype = n.sector_type || 'Dynamic Siege Gate Obstacle';
        const iconTxt = stype === 'Dynamic Siege Gate Obstacle'
          ? '🏰'
          : (stype === 'Vertical Jump-Link & Drop Ledge'
              ? '🧗'
              : (stype === 'Boss Room Seal Door' ? '🚪' : '🌉'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectNavmeshObstacleSector('${escapeHtml(n.navmesh_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(6,78,59,0.58)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // LiveOps Seasonal World Event, Double-EXP / Drop Hot-Config & Feature Flag Matrix Overlay (D86)
  const liveopsEventFlagRecords = Array.isArray(atlas.liveops_event_flag_nodes) ? atlas.liveops_event_flag_nodes : [];
  const liveopsEventFlagsOverlaySvg = (!ATLAS_LIVEOPS_FLAGS_MODE || !shouldRenderStudioSvgOverlay('event_flags')) ? '<g id="studioLiveopsEventFlagsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioLiveopsEventFlagsOverlay">
      ${liveopsEventFlagRecords.map((f, idx) => {
        const wx = typeof f.world_x === 'number' ? f.world_x : 500;
        const wy = typeof f.world_y === 'number' ? f.world_y : 300;
        const colHex = f.accent || '#f59e0b';
        const ecat = f.event_category || 'Seasonal World Festival';
        const iconTxt = ecat === 'Seasonal World Festival'
          ? '🏮'
          : (ecat === 'Dynamic EXP / Drop Multiplier'
              ? '⚡'
              : (ecat === 'Canary Feature Flag Rollout' ? '🐤' : '🛑'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectLiveopsEventFlag('${escapeHtml(f.event_flag_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(120,53,15,0.58)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // In-Game Cutscene Camera Rail, Boss Intro Cinematics & Story Trigger Matrix Overlay (D87)
  const cinematicRailRecords = Array.isArray(atlas.cinematic_camera_rails) ? atlas.cinematic_camera_rails : [];
  const cinematicRailsOverlaySvg = (!ATLAS_CINEMATIC_RAILS_MODE || !shouldRenderStudioSvgOverlay('camera_rails')) ? '<g id="studioCinematicRailsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCinematicRailsOverlay">
      ${cinematicRailRecords.map((r, idx) => {
        const wx = typeof r.world_x === 'number' ? r.world_x : 520;
        const wy = typeof r.world_y === 'number' ? r.world_y : 310;
        const colHex = r.accent || '#ec4899';
        const ccat = r.cinematic_category || 'Raid Boss Awakening Intro';
        const iconTxt = ccat === 'Raid Boss Awakening Intro'
          ? '🐉'
          : (ccat === 'Town First-Arrival Flythrough'
              ? '🏰'
              : (ccat === 'Main Quest Story Revelation' ? '📜' : '⚔️'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectCinematicCameraRail('${escapeHtml(r.rail_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(131,24,67,0.58)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Client GPU Frame-Time Profiler, Draw-Call Instancing & VRAM Pool Budget Matrix Overlay (D88)
  const clientGpuBudgetRecords = Array.isArray(atlas.client_gpu_vram_budgets) ? atlas.client_gpu_vram_budgets : [];
  const clientGpuBudgetOverlaySvg = (!ATLAS_GPU_BUDGET_MODE || !shouldRenderStudioSvgOverlay('gpu_vram')) ? '<g id="studioClientGpuBudgetOverlay" data-lens-gated="1"></g>' : `
    <g id="studioClientGpuBudgetOverlay">
      ${clientGpuBudgetRecords.map((b, idx) => {
        const wx = typeof b.world_x === 'number' ? b.world_x : 510;
        const wy = typeof b.world_y === 'number' ? b.world_y : 290;
        const colHex = b.accent || '#06b6d4';
        const ptier = b.profile_tier || '200-Player Siege Ultra Crowd';
        const iconTxt = ptier === '200-Player Siege Ultra Crowd'
          ? '⚔️'
          : (ptier === '150-Merchant Town Market'
              ? '🏪'
              : (ptier === 'Dense Foliage & Water Shader Hub' ? '🌿' : '🌋'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectClientGpuBudget('${escapeHtml(b.gpu_budget_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(22,78,99,0.58)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Automated Headless QA Playtest Matrix, CI Smoke Bot-Routes & Golden-Snapshot Regression Suites Overlay (D89)
  const automatedQaSuiteRecords = Array.isArray(atlas.automated_qa_smoke_suites) ? atlas.automated_qa_smoke_suites : [];
  const automatedQaSuitesOverlaySvg = (!ATLAS_QA_SUITES_MODE || !shouldRenderStudioSvgOverlay('headless_qa')) ? '<g id="studioAutomatedQaSuitesOverlay" data-lens-gated="1"></g>' : `
    <g id="studioAutomatedQaSuitesOverlay">
      ${automatedQaSuiteRecords.map((s, idx) => {
        const wx = typeof s.world_x === 'number' ? s.world_x : 515;
        const wy = typeof s.world_y === 'number' ? s.world_y : 295;
        const colHex = s.accent || '#22c55e';
        const scat = s.suite_category || 'CI Pre-Merge Headless Playtest';
        const iconTxt = scat === 'CI Pre-Merge Headless Playtest'
          ? '🧪'
          : (scat === 'Economy & Escrow Invariant Fuzzing'
              ? '💰'
              : (scat === 'Raid & Siege Deterministic Stress' ? '⚔️' : '🖼️'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectAutomatedQaSuite('${escapeHtml(s.qa_suite_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(20,83,45,0.58)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // 90D Grand Studio Architecture Milestone Master Sign-Off & Telemetry Ledger Overlay (D90)
  const studio90dLedgerRecords = Array.isArray(atlas.studio_90d_master_ledger) ? atlas.studio_90d_master_ledger : [];
  const studio90dMasterLedgerOverlaySvg = (!ATLAS_STUDIO_90D_MODE || !shouldRenderStudioSvgOverlay('studio_90d')) ? '<g id="studio90dMasterLedgerOverlay" data-lens-gated="1"></g>' : `
    <g id="studio90dMasterLedgerOverlay">
      ${studio90dLedgerRecords.map((l, idx) => {
        const wx = typeof l.world_x === 'number' ? l.world_x : 525;
        const wy = typeof l.world_y === 'number' ? l.world_y : 285;
        const colHex = l.accent || '#facc15';
        const iconTxt = String(l.ring || '').includes('Ring A') ? '👑' : '🏆';
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectStudio90dLedger('${escapeHtml(l.ledger_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(113,63,18,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic Faction Reputation, NPC Disposition & Town Guard Hostility Matrix Overlay (D91)
  const factionDispositionRecords = Array.isArray(atlas.faction_reputation_dispositions) ? atlas.faction_reputation_dispositions : [];
  const factionDispositionOverlaySvg = (!ATLAS_FACTION_DISPOSITION_MODE || !shouldRenderStudioSvgOverlay('faction_dispositions')) ? '<g id="studioFactionDispositionOverlay" data-lens-gated="1"></g>' : `
    <g id="studioFactionDispositionOverlay">
      ${factionDispositionRecords.map((d, idx) => {
        const wx = typeof d.world_x === 'number' ? d.world_x : 530;
        const wy = typeof d.world_y === 'number' ? d.world_y : 280;
        const colHex = d.accent || '#f97316';
        const fcat = d.faction_category || 'Mutual-Exclusivity Tribal War';
        const iconTxt = fcat === 'Mutual-Exclusivity Tribal War'
          ? '⚔️'
          : (fcat === 'Progressive Zone Unlock Trust'
              ? '🔓'
              : (fcat === 'Chaotic PK Guard Kill-On-Sight' ? '💀' : '🤝'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectFactionDisposition('${escapeHtml(d.disposition_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(124,45,18,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Cross-Realm Auction House, Escrow Settlement & Market Price-Circuit-Breaker Matrix Overlay (D92)
  const crossRealmEscrowRecords = Array.isArray(atlas.cross_realm_auction_escrows) ? atlas.cross_realm_auction_escrows : [];
  const crossRealmEscrowOverlaySvg = (!ATLAS_AUCTION_ESCROW_MODE || !shouldRenderStudioSvgOverlay('auction_escrow')) ? '<g id="studioCrossRealmEscrowOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCrossRealmEscrowOverlay">
      ${crossRealmEscrowRecords.map((e, idx) => {
        const wx = typeof e.world_x === 'number' ? e.world_x : 535;
        const wy = typeof e.world_y === 'number' ? e.world_y : 275;
        const colHex = e.accent || '#14b8a6';
        const mtier = e.market_tier || 'Continental Central Clearinghouse';
        const iconTxt = mtier === 'Continental Central Clearinghouse'
          ? '🏛️'
          : (mtier === 'Regional Craft & Material Hub'
              ? '⚒️'
              : (mtier === 'Starter Town Micro-Consignment' ? '📦' : '⚖️'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectCrossRealmEscrow('${escapeHtml(e.escrow_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(19,78,74,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic World Boss Invasion, Rift Incursion & Zone-Wide Emergency Quest Matrix Overlay (D93)
  const worldInvasionIncursionRecords = Array.isArray(atlas.world_invasion_incursions) ? atlas.world_invasion_incursions : [];
  const worldIncursionOverlaySvg = (!ATLAS_WORLD_INCURSION_MODE || !shouldRenderStudioSvgOverlay('world_incursions')) ? '<g id="studioWorldIncursionOverlay" data-lens-gated="1"></g>' : `
    <g id="studioWorldIncursionOverlay">
      ${worldInvasionIncursionRecords.map((w, idx) => {
        const wx = typeof w.world_x === 'number' ? w.world_x : 530;
        const wy = typeof w.world_y === 'number' ? w.world_y : 270;
        const colHex = w.accent || '#f43f5e';
        const icat = w.incursion_category || 'Abyssal Rift Tear Assault';
        const iconTxt = icat === 'Abyssal Rift Tear Assault'
          ? '☄️'
          : (icat === 'Titan World-Boss Roaming March'
              ? '🐉'
              : (icat === 'Faction Border Siege Vanguard' ? '🛡️' : '⚡'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectWorldInvasionIncursion('${escapeHtml(w.incursion_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(136,19,55,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Guild / Clan Treasury Ledger, Siege Mercenary Payroll & Tax Dividend Audit Matrix Overlay (D94)
  const clanTreasuryLedgerRecords = Array.isArray(atlas.clan_treasury_payroll_ledgers) ? atlas.clan_treasury_payroll_ledgers : [];
  const clanTreasuryOverlaySvg = (!ATLAS_CLAN_TREASURY_MODE || !shouldRenderStudioSvgOverlay('clan_treasury')) ? '<g id="studioClanTreasuryOverlay" data-lens-gated="1"></g>' : `
    <g id="studioClanTreasuryOverlay">
      ${clanTreasuryLedgerRecords.map((l, idx) => {
        const wx = typeof l.world_x === 'number' ? l.world_x : 540;
        const wy = typeof l.world_y === 'number' ? l.world_y : 280;
        const colHex = l.accent || '#eab308';
        const ltier = l.ledger_tier || 'Sovereign Castle Tax Vault';
        const iconTxt = ltier === 'Sovereign Castle Tax Vault'
          ? '👑'
          : (ltier === 'Fortress Mercenary Payroll Escrow'
              ? '⚔️'
              : (ltier === 'Clan Hall Raid Dividend Pool' ? '💎' : '📜'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectClanTreasuryLedger('${escapeHtml(l.ledger_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(113,63,18,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Player Housing, Clan Citadel Interior Customization & Trophy Taxidermy Matrix Overlay (D95)
  const playerHousingEstateRecords = Array.isArray(atlas.player_housing_trophy_estates) ? atlas.player_housing_trophy_estates : [];
  const playerHousingEstateOverlaySvg = (!ATLAS_HOUSING_ESTATES_MODE || !shouldRenderStudioSvgOverlay('housing_estates')) ? '<g id="studioPlayerHousingEstateOverlay" data-lens-gated="1"></g>' : `
    <g id="studioPlayerHousingEstateOverlay">
      ${playerHousingEstateRecords.map((h, idx) => {
        const wx = typeof h.world_x === 'number' ? h.world_x : 545;
        const wy = typeof h.world_y === 'number' ? h.world_y : 285;
        const colHex = h.accent || '#10b981';
        const etier = h.estate_tier || 'Sovereign Clan Citadel Interior';
        const iconTxt = etier === 'Sovereign Clan Citadel Interior'
          ? '🏰'
          : (etier === 'Noble Manor Villa & Garden'
              ? '🏡'
              : (etier === 'Artisan Townhouse Workshop' ? '🔨' : '⛺'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectPlayerHousingEstate('${escapeHtml(h.estate_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(6,78,59,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Global CDN Region Routing, Anycast DDoS Scrubbing & Voice-Chat WebRTC Relay Matrix Overlay (D96)
  const globalCdnRelayRecords = Array.isArray(atlas.global_cdn_webrtc_relays) ? atlas.global_cdn_webrtc_relays : [];
  const globalCdnRelayOverlaySvg = (!ATLAS_CDN_WEBRTC_MODE || !shouldRenderStudioSvgOverlay('cdn_webrtc')) ? '<g id="studioGlobalCdnRelayOverlay" data-lens-gated="1"></g>' : `
    <g id="studioGlobalCdnRelayOverlay">
      ${globalCdnRelayRecords.map((r, idx) => {
        const wx = typeof r.world_x === 'number' ? r.world_x : 550;
        const wy = typeof r.world_y === 'number' ? r.world_y : 290;
        const colHex = r.accent || '#0ea5e9';
        const stier = r.edge_service_tier || 'Anycast L4/L7 Game Ingress Scrubbing';
        const iconTxt = stier === 'Anycast L4/L7 Game Ingress Scrubbing'
          ? '🛡️'
          : (stier === 'WebRTC Spatial Voice SFU Mesh'
              ? '🎙️'
              : (stier === 'Delta-Pak CDN Origin Shield' ? '📦' : '🌐'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectGlobalCdnRelay('${escapeHtml(r.relay_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(12,74,110,0.62)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic Caravan Trade Routes, Bandit Ambush Escorts & Regional Commodity Arbitrage Matrix Overlay (D97)
  const caravanTradeRouteRecords = Array.isArray(atlas.caravan_trade_routes) ? atlas.caravan_trade_routes : [];
  const caravanTradeRoutesOverlaySvg = (!ATLAS_CARAVAN_ROUTES_MODE || !shouldRenderStudioSvgOverlay('caravan_routes')) ? '<g id="studioCaravanTradeRoutesOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCaravanTradeRoutesOverlay">
      ${caravanTradeRouteRecords.map((c, idx) => {
        const wx = typeof c.world_x === 'number' ? c.world_x : 540;
        const wy = typeof c.world_y === 'number' ? c.world_y : 295;
        const colHex = c.accent || '#f59e0b';
        const rcat = c.route_category || 'Armored Bullion Wagon';
        const iconTxt = rcat === 'Armored Bullion Wagon'
          ? '🛡️'
          : (rcat === 'Pack-Strider Express'
              ? '🐪'
              : (rcat === 'Smuggler Night-Run' ? '🌙' : '⛵'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectCaravanTradeRoute('${escapeHtml(c.caravan_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(69,26,3,0.68)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Automated Localization Voice-Over (EN/TH/JP/KR), Lip-Sync Phoneme & Subtitle Timing Matrix Overlay (D98)
  const localizationVoBankRecords = Array.isArray(atlas.localization_voiceover_banks) ? atlas.localization_voiceover_banks : [];
  const localizationVoBanksOverlaySvg = (!ATLAS_LOCALIZATION_VO_MODE || !shouldRenderStudioSvgOverlay('localization_vo')) ? '<g id="studioLocalizationVoBanksOverlay" data-lens-gated="1"></g>' : `
    <g id="studioLocalizationVoBanksOverlay">
      ${localizationVoBankRecords.map((v, idx) => {
        const wx = typeof v.world_x === 'number' ? v.world_x : 545;
        const wy = typeof v.world_y === 'number' ? v.world_y : 300;
        const colHex = v.accent || '#ec4899';
        const solver = v.lipsync_viseme_solver || '22-Phoneme Facial BlendShape';
        const iconTxt = solver === '22-Phoneme Facial BlendShape'
          ? '🎙️'
          : (solver === '15-Viseme Oculus + Jaw-Bone Curve' ? '🗣️' : '🔊');
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectLocalizationVoBank('${escapeHtml(v.vo_bank_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.4" fill="rgba(80,7,36,0.68)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Cross-Tool Hot-Reload WebSocket Bus, Undo/Redo Command Journal & Godot Live-Sync Bridge Matrix Overlay (D99)
  const crossToolBridgeRecords = Array.isArray(atlas.cross_tool_hot_reload_bridges) ? atlas.cross_tool_hot_reload_bridges : [];
  const crossToolBridgesOverlaySvg = (!ATLAS_HOT_RELOAD_BRIDGE_MODE || !shouldRenderStudioSvgOverlay('hot_reload_bridge')) ? '<g id="studioCrossToolBridgesOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCrossToolBridgesOverlay">
      ${crossToolBridgeRecords.map((b, idx) => {
        const wx = typeof b.world_x === 'number' ? b.world_x : 550;
        const wy = typeof b.world_y === 'number' ? b.world_y : 300;
        const colHex = b.accent || '#06b6d4';
        const syncMode = b.godot_live_sync_mode || 'WebSocket JSON-Patch Push';
        const iconTxt = syncMode === 'WebSocket JSON-Patch Push'
          ? '⚡'
          : (syncMode === 'SceneTree Node Hot-Swap' ? '🔄' : '📡');
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectCrossToolBridge('${escapeHtml(b.bridge_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(8,51,68,0.72)" stroke="${escapeHtml(colHex)}" stroke-width="2.0"/>
            <text x="${wx}" y="${wy + 3.4}" text-anchor="middle" font-size="8.4">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Two-Ring 11-Role Studio Grand Centennial D1–D100 Sign-Off & Guided Tour Matrix Overlay (D100)
  const centennial100dCharterRecords = Array.isArray(atlas.centennial_100d_studio_charters) ? atlas.centennial_100d_studio_charters : [];
  const centennial100dChartersOverlaySvg = (!ATLAS_CENTENNIAL_100D_MODE || !shouldRenderStudioSvgOverlay('centennial_100d')) ? '<g id="studioCentennial100dChartersOverlay" data-lens-gated="1"></g>' : `
    <g id="studioCentennial100dChartersOverlay">
      ${centennial100dCharterRecords.map((c, idx) => {
        const wx = typeof c.world_x === 'number' ? c.world_x : 540;
        const wy = typeof c.world_y === 'number' ? c.world_y : 295;
        const colHex = c.accent || '#eab308';
        const isCouncil = (c.studio_ring || c.ring || '').includes('Creative Council');
        const iconTxt = isCouncil ? '👑' : '🛠️';
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectCentennial100dCharter('${escapeHtml(c.charter_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.8" fill="rgba(113,63,18,0.74)" stroke="${escapeHtml(colHex)}" stroke-width="2.2"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.6">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic World Weather-Triggered Rare Spawns, Nocturnal Hunt & Eclipse Affix Matrix Overlay (D101)
  const nocturnalAffixSpawnRecords = Array.isArray(atlas.nocturnal_weather_affix_spawns) ? atlas.nocturnal_weather_affix_spawns : [];
  const nocturnalAffixSpawnsOverlaySvg = (!ATLAS_NOCTURNAL_AFFIX_MODE || !shouldRenderStudioSvgOverlay('nocturnal_affix')) ? '<g id="studioNocturnalAffixSpawnsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioNocturnalAffixSpawnsOverlay">
      ${nocturnalAffixSpawnRecords.map((s) => {
        const wx = typeof s.world_x === 'number' ? s.world_x : 540;
        const wy = typeof s.world_y === 'number' ? s.world_y : 295;
        const colHex = s.accent || '#8b5cf6';
        const trig = s.trigger_condition || '';
        const iconTxt = trig.includes('Midnight') ? '🌙' : (trig.includes('Thunderstorm') ? '⛈️' : (trig.includes('Full Moon') ? '🌑' : '🌋'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectNocturnalAffixSpawn('${escapeHtml(s.affix_spawn_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(46,16,101,0.76)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Deterministic Combat Replay Verifier, Anti-Cheat Desync Audit & Tick-by-Tick Hash Chain Matrix Overlay (D102)
  const deterministicCombatReplayRecords = Array.isArray(atlas.deterministic_combat_replays) ? atlas.deterministic_combat_replays : [];
  const deterministicCombatReplaysOverlaySvg = (!ATLAS_COMBAT_REPLAY_MODE || !shouldRenderStudioSvgOverlay('combat_replay')) ? '<g id="studioDeterministicCombatReplaysOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDeterministicCombatReplaysOverlay">
      ${deterministicCombatReplayRecords.map((r) => {
        const wx = typeof r.world_x === 'number' ? r.world_x : 540;
        const wy = typeof r.world_y === 'number' ? r.world_y : 295;
        const colHex = r.accent || '#10b981';
        const scope = r.verification_scope || '';
        const iconTxt = scope.includes('Olympiad') ? '⚔️' : (scope.includes('Siege') ? '🏰' : (scope.includes('Raid') ? '🐉' : '🔐'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDeterministicCombatReplay('${escapeHtml(r.replay_sector_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(6,78,59,0.76)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic World Lore Codex, Archaeological Relic Excavation & Bestiary Mastery Matrix Overlay (D103)
  const archaeologicalLoreCodexRecords = Array.isArray(atlas.archaeological_lore_codices) ? atlas.archaeological_lore_codices : [];
  const archaeologicalLoreCodicesOverlaySvg = (!ATLAS_LORE_CODEX_MODE || !shouldRenderStudioSvgOverlay('lore_codex')) ? '<g id="studioArchaeologicalLoreCodicesOverlay" data-lens-gated="1"></g>' : `
    <g id="studioArchaeologicalLoreCodicesOverlay">
      ${archaeologicalLoreCodexRecords.map((c) => {
        const wx = typeof c.world_x === 'number' ? c.world_x : 540;
        const wy = typeof c.world_y === 'number' ? c.world_y : 295;
        const colHex = c.accent || '#f59e0b';
        const cat = c.codex_category || '';
        const iconTxt = cat.includes('Giant') ? '⚙️' : (cat.includes('Elmoreden') ? '📜' : (cat.includes('Bestiary') ? '🦁' : '🏺'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectArchaeologicalCodex('${escapeHtml(c.codex_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(120,53,15,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Procedural Foliage Wind-Field, Interactive Water Ripple & Destructible Environment Physics Matrix Overlay (D104)
  const destructiblePhysicsBiomeRecords = Array.isArray(atlas.destructible_physics_biomes) ? atlas.destructible_physics_biomes : [];
  const destructiblePhysicsBiomesOverlaySvg = (!ATLAS_PHYSICS_BIOME_MODE || !shouldRenderStudioSvgOverlay('physics_biomes')) ? '<g id="studioDestructiblePhysicsBiomesOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDestructiblePhysicsBiomesOverlay">
      ${destructiblePhysicsBiomeRecords.map((b) => {
        const wx = typeof b.world_x === 'number' ? b.world_x : 540;
        const wy = typeof b.world_y === 'number' ? b.world_y : 295;
        const colHex = b.accent || '#06b6d4';
        const tier = b.physics_interaction_tier || '';
        const iconTxt = tier.includes('SWE') ? '🌊' : (tier.includes('Voronoi') ? '💥' : (tier.includes('Wind') ? '🍃' : '🪨'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDestructiblePhysicsBiome('${escapeHtml(b.physics_biome_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(8,51,68,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic Bounty Hunter Contracts, Chaotic PK Manhunt & High-Value Target Tracking Matrix Overlay (D105)
  const bountyManhuntContractRecords = Array.isArray(atlas.bounty_manhunt_contracts) ? atlas.bounty_manhunt_contracts : [];
  const bountyManhuntContractsOverlaySvg = (!ATLAS_BOUNTY_MANHUNT_MODE || !shouldRenderStudioSvgOverlay('bounty_manhunt')) ? '<g id="studioBountyManhuntContractsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioBountyManhuntContractsOverlay">
      ${bountyManhuntContractRecords.map((b) => {
        const wx = typeof b.world_x === 'number' ? b.world_x : 540;
        const wy = typeof b.world_y === 'number' ? b.world_y : 295;
        const colHex = b.accent || '#ef4444';
        const cat = b.contract_category || '';
        const iconTxt = cat.includes('PK') ? '🎯' : (cat.includes('Bandit') ? '🗡️' : (cat.includes('Caravan') ? '🛡️' : '💀'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectBountyManhuntContract('${escapeHtml(b.bounty_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(127,29,29,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Distributed World-State Snapshot Backup, Point-in-Time Recovery (PITR) & Disaster-Recovery Chaos Drill Matrix Overlay (D106)
  const disasterRecoveryDrillRecords = Array.isArray(atlas.disaster_recovery_pitr_drills) ? atlas.disaster_recovery_pitr_drills : [];
  const disasterRecoveryDrillsOverlaySvg = (!ATLAS_PITR_CHAOS_MODE || !shouldRenderStudioSvgOverlay('pitr_chaos')) ? '<g id="studioDisasterRecoveryDrillsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioDisasterRecoveryDrillsOverlay">
      ${disasterRecoveryDrillRecords.map((d) => {
        const wx = typeof d.world_x === 'number' ? d.world_x : 540;
        const wy = typeof d.world_y === 'number' ? d.world_y : 295;
        const colHex = d.accent || '#38bdf8';
        const fault = d.chaos_fault_scenario || '';
        const iconTxt = fault.includes('Postgres') ? '🛡️' : (fault.includes('Redis') ? '⚡' : (fault.includes('AZ') ? '🌐' : '⏪'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectDisasterRecoveryDrill('${escapeHtml(d.pitr_drill_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(12,74,110,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Dynamic World Tavern Mini-Games, Bardic Music Buffs & Social Mercenary Recruitment Matrix Overlay (D107)
  const tavernSocialHubRecords = Array.isArray(atlas.tavern_social_hubs) ? atlas.tavern_social_hubs : [];
  const tavernSocialHubsOverlaySvg = (!ATLAS_TAVERN_HUBS_MODE || !shouldRenderStudioSvgOverlay('tavern_hubs')) ? '<g id="studioTavernSocialHubsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioTavernSocialHubsOverlay">
      ${tavernSocialHubRecords.map((t) => {
        const wx = typeof t.world_x === 'number' ? t.world_x : 540;
        const wy = typeof t.world_y === 'number' ? t.world_y : 295;
        const colHex = t.accent || '#fb923c';
        const game = t.signature_minigame || '';
        const iconTxt = game.includes('Dice') ? '🎲' : (game.includes('Tarot') ? '🃏' : (game.includes('Chess') ? '♟️' : '🍺'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectTavernSocialHub('${escapeHtml(t.tavern_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(124,45,18,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  // Player Sentiment Telemetry, Net-Promoter In-Game Survey & Rage-Quit Churn Intervention Matrix Overlay (D108)
  const churnInterventionRecords = Array.isArray(atlas.churn_sentiment_interventions) ? atlas.churn_sentiment_interventions : [];
  const churnInterventionsOverlaySvg = (!ATLAS_CHURN_INTERVENTION_MODE || !shouldRenderStudioSvgOverlay('churn_care')) ? '<g id="studioChurnInterventionsOverlay" data-lens-gated="1"></g>' : `
    <g id="studioChurnInterventionsOverlay">
      ${churnInterventionRecords.map((c) => {
        const wx = typeof c.world_x === 'number' ? c.world_x : 540;
        const wy = typeof c.world_y === 'number' ? c.world_y : 295;
        const colHex = c.accent || '#f43f5e';
        const trig = c.churn_trigger_archetype || '';
        const iconTxt = trig.includes('Enchant') ? '💔' : (trig.includes('Solo') ? '🤝' : (trig.includes('PK') ? '🕊️' : '💓'));
        return `
          <g data-poi-clickable="1" style="cursor:pointer" onclick="selectChurnIntervention('${escapeHtml(c.intervention_id)}')">
            <circle cx="${wx}" cy="${wy}" r="10.6" fill="rgba(136,19,55,0.78)" stroke="${escapeHtml(colHex)}" stroke-width="2.1"/>
            <text x="${wx}" y="${wy + 3.5}" text-anchor="middle" font-size="8.5">${iconTxt}</text>
          </g>
        `;
      }).join('')}
    </g>
  `;

  const svgInnerHtml = `
    ${renderCleanVectorContinentReliefSvg(isL2)}
    ${ATLAS_RASTER_RELIEF_OVERLAY ? `<image href="${isL2 ? '/studio-maps/c3_continent_parchment_relief.png' : '/studio-maps/all_interlaced_world_grid.png'}" x="0" y="0" width="1040" height="500" preserveAspectRatio="xMidYMid meet" opacity="0.48"/>` : ''}
    <rect x="0" y="0" width="1040" height="500" fill="none" stroke="#fde047" stroke-width="2" opacity="0.4"/>
    ${gateStudioOverlaySvg('farming_heatmap', farmingEfficiencyOverlaySvg)}
    ${gateStudioOverlaySvg('siege_domain', castleSiegeDomainOverlaySvg)}
    ${gateStudioOverlaySvg('boss_radar', worldBossSpawnRadarOverlaySvg)}
    ${gateStudioOverlaySvg('seven_seals', sevenSealsOverlaySvg)}
    ${gateStudioOverlaySvg('manor_economy', manorEconomyOverlaySvg)}
    ${gateStudioOverlaySvg('olympiad', noblesseOlympiadOverlaySvg)}
    ${gateStudioOverlaySvg('transit_lines', intercontinentalTransitOverlaySvg)}
    ${gateStudioOverlaySvg('soul_crystal', soulCrystalOverlaySvg)}
    ${gateStudioOverlaySvg('fishing_sanctuary', fishingSanctuaryOverlaySvg)}
    ${gateStudioOverlaySvg('pvp_karma', cursedWeaponPvpOverlaySvg)}
    ${gateStudioOverlaySvg('rift_sepulcher', dimensionalRiftOverlaySvg)}
    ${gateStudioOverlaySvg('augment_dye', weaponAugmentationDyeOverlaySvg)}
    ${gateStudioOverlaySvg('companion_mount', companionMountOverlaySvg)}
    ${gateStudioOverlaySvg('clan_academy', clanAcademyOverlaySvg)}
    ${gateStudioOverlaySvg('herb_biome', herbElementalBiomeOverlaySvg)}
    ${gateStudioOverlaySvg('workshop_plaza', soulshotWorkshopOverlaySvg)}
    ${gateStudioOverlaySvg('territory_ward', territoryWardOverlaySvg)}
    ${gateStudioOverlaySvg('epic_jewelry', epicJewelryOverlaySvg)}
    ${gateStudioOverlaySvg('vitality_obelisk', vitalityObeliskOverlaySvg)}
    ${gateStudioOverlaySvg('armor_set', armorSetMasterworkOverlaySvg)}
    ${gateStudioOverlaySvg('kamaloka', kamalokaPailakaOverlaySvg)}
    ${gateStudioOverlaySvg('skill_scroll', forgottenScrollOverlaySvg)}
    ${gateStudioOverlaySvg('elemental_quarry', elementalQuarryOverlaySvg)}
    ${gateStudioOverlaySvg('clan_hall', clanHallAuctionOverlaySvg)}
    ${gateStudioOverlaySvg('transformation', transformationTalismanOverlaySvg)}
    ${gateStudioOverlaySvg('warehouse', warehouseFreightOverlaySvg)}
    ${gateStudioOverlaySvg('master_tour', masterTourOverlaySvg)}
    ${gateStudioOverlaySvg('festival_oracle', festivalOracleOverlaySvg)}
    ${gateStudioOverlaySvg('luxury_market', luxuryBlackMarketOverlaySvg)}
    ${gateStudioOverlaySvg('faction_alliance', factionAllianceOverlaySvg)}
    ${gateStudioOverlaySvg('fantasy_plaza', fantasyPlazaOverlaySvg)}
    ${gateStudioOverlaySvg('hero_weapon', heroWeaponExchangeOverlaySvg)}
    ${gateStudioOverlaySvg('treasure_chest', treasureChestOverlaySvg)}
    ${gateStudioOverlaySvg('aerial_dock', aerialStarStoneOverlaySvg)}
    ${gateStudioOverlaySvg('belt_cloak', beltCloakWeaverOverlaySvg)}
    ${gateStudioOverlaySvg('wedding', weddingCathedralOverlaySvg)}
    ${gateStudioOverlaySvg('council_benchmark', councilBenchmarkOverlaySvg)}
    ${gateStudioOverlaySvg('seed_cycle', continentalSeedOverlaySvg)}
    ${gateStudioOverlaySvg('coliseum_tournament', coliseumTournamentOverlaySvg)}
    ${gateStudioOverlaySvg('elemental_jewel', elementalJewelOverlaySvg)}
    ${gateStudioOverlaySvg('fame_monument', fameMonumentOverlaySvg)}
    ${gateStudioOverlaySvg('delusion_chamber', delusionChamberOverlaySvg)}
    ${gateStudioOverlaySvg('command_raid', commandChannelRaidOverlaySvg)}
    ${gateStudioOverlaySvg('nevit_blessing', nevitBlessingOverlaySvg)}
    ${gateStudioOverlaySvg('council_signoff', councilSignoffOverlaySvg)}
    ${gateStudioOverlaySvg('champion_mob', championMobOverlaySvg)}
    ${gateStudioOverlaySvg('dualsword_forge', dualswordForgeOverlaySvg)}
    ${gateStudioOverlaySvg('tech_art', techArtPipelineOverlaySvg)}
    ${gateStudioOverlaySvg('bot_swarm', botSwarmSimOverlaySvg)}
    ${gateStudioOverlaySvg('liveops_gm', liveopsGmOverlaySvg)}
    ${gateStudioOverlaySvg('tools_squad', toolsSquadOverlaySvg)}
    ${gateStudioOverlaySvg('dialogue_dag', dialogueGraphOverlaySvg)}
    ${gateStudioOverlaySvg('spawner_balancer', spawnerBalancerOverlaySvg)}
    ${gateStudioOverlaySvg('skill_timelines', skillTimelineOverlaySvg)}
    ${gateStudioOverlaySvg('build_farm', buildFarmOverlaySvg)}
    ${gateStudioOverlaySvg('architect_dx', architectDxOverlaySvg)}
    ${gateStudioOverlaySvg('two_ring_80d', twoRingSignoffOverlaySvg)}
    ${gateStudioOverlaySvg('weather_shader', weatherAcousticOverlaySvg)}
    ${gateStudioOverlaySvg('server_mesh', serverMeshOverlaySvg)}
    ${gateStudioOverlaySvg('anti_bot', antiBotSentinelOverlaySvg)}
    ${gateStudioOverlaySvg('godot_storybook', godotStorybookOverlaySvg)}
    ${gateStudioOverlaySvg('navmesh', navmeshObstacleOverlaySvg)}
    ${gateStudioOverlaySvg('event_flags', liveopsEventFlagsOverlaySvg)}
    ${gateStudioOverlaySvg('camera_rails', cinematicRailsOverlaySvg)}
    ${gateStudioOverlaySvg('gpu_vram', clientGpuBudgetOverlaySvg)}
    ${gateStudioOverlaySvg('headless_qa', automatedQaSuitesOverlaySvg)}
    ${gateStudioOverlaySvg('studio_90d', studio90dMasterLedgerOverlaySvg)}
    ${gateStudioOverlaySvg('faction_dispositions', factionDispositionOverlaySvg)}
    ${gateStudioOverlaySvg('auction_escrow', crossRealmEscrowOverlaySvg)}
    ${gateStudioOverlaySvg('world_incursions', worldIncursionOverlaySvg)}
    ${gateStudioOverlaySvg('clan_treasury', clanTreasuryOverlaySvg)}
    ${gateStudioOverlaySvg('housing_estates', playerHousingEstateOverlaySvg)}
    ${gateStudioOverlaySvg('cdn_webrtc', globalCdnRelayOverlaySvg)}
    ${gateStudioOverlaySvg('caravan_routes', caravanTradeRoutesOverlaySvg)}
    ${gateStudioOverlaySvg('localization_vo', localizationVoBanksOverlaySvg)}
    ${gateStudioOverlaySvg('hot_reload_bridge', crossToolBridgesOverlaySvg)}
    ${gateStudioOverlaySvg('centennial_100d', centennial100dChartersOverlaySvg)}
    ${gateStudioOverlaySvg('nocturnal_affix', nocturnalAffixSpawnsOverlaySvg)}
    ${gateStudioOverlaySvg('combat_replay', deterministicCombatReplaysOverlaySvg)}
    ${gateStudioOverlaySvg('lore_codex', archaeologicalLoreCodicesOverlaySvg)}
    ${gateStudioOverlaySvg('physics_biomes', destructiblePhysicsBiomesOverlaySvg)}
    ${gateStudioOverlaySvg('bounty_manhunt', bountyManhuntContractsOverlaySvg)}
    ${gateStudioOverlaySvg('pitr_chaos', disasterRecoveryDrillsOverlaySvg)}
    ${gateStudioOverlaySvg('tavern_hubs', tavernSocialHubsOverlaySvg)}
    ${gateStudioOverlaySvg('churn_care', churnInterventionsOverlaySvg)}
    ${regionalOverlaySvg}
    ${renderOverlandInlineMicroBlueprintsSvg(overlandLandmarks, STUDIO_MAP_ZOOM)}
    ${highwaysSvg}
    ${travelRouteOverlaySvg}
    ${raceGrowthPathSvg}
    ${gateStudioOverlaySvg('boss_hierarchy', bossHierarchyOverlaySvg)}
    ${gateStudioOverlaySvg('quest_trials', questTrialOverlaySvg)}
    ${zoneFilterLayerSvg}
    ${landmarksSvg}
    ${mobPinsSvg}
    ${(() => {
      if (!ATLAS_STATE_STORE.toastMessage) return '';
      const tw = atlasSvgToWorldPoint(520, 27);
      return `
        <g class="atlas-screen-pin" data-atlas-toast="1" style="transform-origin:${tw.x}px ${tw.y}px" pointer-events="none">
          <rect x="${tw.x - 210}" y="${tw.y - 13}" width="420" height="26" rx="6" fill="rgba(220,38,38,0.92)" stroke="#fde047" stroke-width="1.5"/>
          <text x="${tw.x}" y="${tw.y + 4}" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800" font-family="monospace">⚠️ ${escapeHtml(ATLAS_STATE_STORE.toastMessage)}</text>
        </g>`;
    })()}
  `;

  // F-155: the badge counts ZONES (same predicate as OpenLayers), not landmark + mob pins.
  const matchCount = zoneFilterModel.matching.length;
  const defaultLm = visibleLandmarks[0] || overlandLandmarks[0];
  const defaultPoi = {
    title: defaultLm.label,
    category: defaultLm.sublabel,
    thumb: '/thumbs/buildings/tower_round_roof_a.webp',
    hoursOrStatus: 'CANON · 3 Continents · 6 Race Spawns · 3 Multi-Floor Dungeons',
    summary: 'Uncluttered continuous geography with travel highways, 6 Playable Race Spawn markers, automatic 3-tier Semantic Zoom (1.0× Macro → 2.2× Regional → 4.5×+ Town Street Blueprint), and clickable Multi-Floor Dungeon Warps.',
    address: `Lantern Hollow (Gludin Archetype) · Teacup Meadows · Hearthbloom Basin`,
    coordinates: `loc=${STUDIO_MAP_LOC.x}:${STUDIO_MAP_LOC.y} · Semantic Zoom: ${STUDIO_MAP_ZOOM.toFixed(2)}×`,
    scaleSpecs: '13.0m Main Plaza Road · 4.4m Cobblestone Walkways · 0.58m Counters · 0.14m Steps',
    townBlueprintId: 'town-lantern-hollow',
    locCoord: '-84120:243500',
    drillLabel: 'Zoom to Street Map (5.2×)',
    inspectId: 'town-lantern-hollow',
    connections: [
      { label: '🏘️ Lantern Hollow (Gludin) Street & Shop Blueprint', badge: 'ZOOM ≥4.5×' },
      { label: '🕳️ Kiln Cellar (The Ant Nest) B1 ⇄ B2 ⇄ B3', badge: 'SUB-MAP' },
      { label: '🗼 Pendulum Shaft (Cruma Tower) 1F ⇄ 2F ⇄ 3F', badge: 'SUB-MAP' }
    ]
  };

  return renderCartoShellHtml({
    stepLabel: `🧭 DEDICATED SEMANTIC-ZOOM WORLD, TOWN & MULTI-FLOOR DUNGEON ATLAS · LOD TIER ${lodTier} (${STUDIO_MAP_ZOOM.toFixed(2)}×)`,
    title: 'Cradle of Embers Continuous World Map — Travel Highways, 6 Playable Race Spawns, Town Street Blueprints & Dungeon Sub-Maps',
    subtitle: 'Scroll/zoom ≥2.2× for Regional Roads & Dungeon Warp Portals · Zoom ≥4.5× (or click a Town) for Street, #1..#12 Building & Shop/Refinement Marks · Click any Dungeon to warp B1⇄B2⇄B3 / 1F⇄2F⇄3F',
    activeScaleIndex: lodTier,
    defaultPoi,
    filterBarHtml: renderAtlasFilterBarHtml(matchCount),
    bottomPanelHtml: `<div data-testid="overland-composable-layer-toolbar" style="padding:8px 14px;background:rgba(15,23,42,0.96);border-bottom:1px solid rgba(16,185,129,0.35);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span style="font-size:10px;font-weight:800;color:#6ee7b7;letter-spacing:0.06em;">🗺️ 6-LAYER COMPOSABLE TERRAIN (RIVERS · MOUNTAINS · TREES · WALKWAYS):</span>
        <button type="button" class="btn" onclick="addIncrementalComposableFeature('walkway')" style="font-size:10px;padding:3px 8px;background:rgba(217,119,6,0.22);border-color:#f59e0b;color:#fde68a;">+ Add Walkway</button>
        <button type="button" class="btn" onclick="addIncrementalComposableFeature('river')" style="font-size:10px;padding:3px 8px;background:rgba(14,165,233,0.22);border-color:#38bdf8;color:#bae6fd;">+ Add River Tributary</button>
        <button type="button" class="btn" onclick="addIncrementalComposableFeature('tree')" style="font-size:10px;padding:3px 8px;background:rgba(22,163,74,0.22);border-color:#4ade80;color:#bbf7d0;">+ Add Tree Canopy Grove</button>
        <button type="button" class="btn" onclick="addIncrementalComposableFeature('quest_ring')" style="font-size:10px;padding:3px 8px;background:rgba(239,68,68,0.22);border-color:#f87171;color:#fecaca;">+ Add Quest Ring</button>
        <button type="button" class="btn" onclick="openDungeonSubMap('zone-dungeon-kiln-cellar', 'B1')" style="font-size:10px;padding:3px 9px;background:rgba(88,28,135,0.45);border-color:#fde047;color:#fde047;font-weight:800;">🐜 Enter The Ant Nest (Click B1 ⇄ B2 ⇄ B3 Floors)</button>
        <button type="button" class="btn" onclick="focusZoneOnUnifiedWorldMap('zone-field-clover-south-gate', 4.6)" style="font-size:10px;padding:3px 9px;background:rgba(16,185,129,0.28);border-color:#34d399;color:#ecfdf5;font-weight:800;">🔍 Zoom In-Place to Field (4.6×)</button>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
        ${[
          { id: "layer_1_hydrology_splines", label: "L1 Rivers" },
          { id: "layer_2_topography_cliffs_and_highlands", label: "L2 Mountain Ranges" },
          { id: "layer_3_road_and_walkway_network", label: "L3 Walkways" },
          { id: "layer_4_foliage_and_canopy_scatters", label: "L4 Tree Canopies" },
          { id: "layer_5_architectural_compounds_and_quest_rings", label: "L5 Ruins/Quests" }
        ].map(l => {
          const isOn = ATLAS_COMPOSABLE_LAYER_VISIBILITY[l.id] !== false;
          return `<button type="button" class="btn" onclick="toggleComposableFieldLayer('${l.id}')" style="font-size:9px;padding:2px 6px;background:${isOn ? "rgba(16,185,129,0.22)" : "rgba(30,41,59,0.6)"};border-color:${isOn ? "#34d399" : "#475569"};color:${isOn ? "#a7f3d0" : "#94a3b8"};">${isOn ? "👁️" : "🚫"} ${l.label}</button>`;
        }).join("")}
      </div>
    </div>${bottomTravelItineraryPanelHtml}${bottomRaceGrowthPanelHtml}${renderAtlasFilteredEntityMatrixHtml(tatlas)}`, 
    svgInnerHtml,
    legendItems: [
      { color: '#10b981', label: '🧬 6 Playable Race Spawns' },
      { color: '#eab308', label: '🏰 Towns (Zoom ≥4.5× for Shops)' },
      { color: '#fde047', label: '🛤️ 6-Race Growth Route (A..L)' },
      { color: '#a855f7', label: '🕳️ / 🗼 Multi-Floor Dungeon Warp' },
      { color: '#ef4444', label: '👾 Monster / ⚔️ Mini-Boss' },
      { color: '#f97316', label: '🔥 Raid / 👑 MVP Boss' }
    ]
  });
}

