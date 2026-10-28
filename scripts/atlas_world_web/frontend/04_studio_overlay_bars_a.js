function buildAtlasOmniSearchIndex(tatlas) {
  const entries = [];
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const raceSpawns = (tatlas && tatlas.race_spawn_locations) || [];

  // 1. 6 Playable Race Spawns
  raceSpawns.forEach(rs => {
    entries.push({
      id: `race-${rs.race_key}`,
      kind: 'Race Spawn',
      icon: '🧬',
      badgeColor: '#10b981',
      title: `${rs.race_name} — ${rs.starter_shrine_monument}`,
      subtitle: `${rs.starter_town_name} · Lv.1–10 Starter Spawn`,
      keywords: `${rs.race_name} ${rs.race_key} ${rs.starter_town_name} ${rs.starter_shrine_monument} race spawn`,
      actionJs: `focusTownStreetBlueprint('${escapeHtml(rs.starter_town_node_id)}', '${escapeHtml(rs.loc_coord || '')}')`,
      actionLabel: `🏘️ Jump to ${rs.starter_town_name.split('(')[0].trim()}`
    });
  });

  // 2. 15 Towns + 180 Town NPCs (#1..#12) + 105 Town Service Marks (Shop + Refinement +1..+15)
  allTowns.forEach(t => {
    const tb = t.town_blueprint || {};
    const tNode = t.studio_node_id || t.zone_id;
    const tLoc = t.loc_coord || '-84120:243500';
    entries.push({
      id: `town-${t.zone_id}`,
      kind: 'Town Blueprint',
      icon: '🏰',
      badgeColor: '#eab308',
      title: `${t.name} (${t.l2_reference_analog || ''})`,
      subtitle: `Archetype: ${tb.layout_archetype || 'polygonal_walled_keep'} · #1..#12 NPCs & 7 Shops`,
      keywords: `${t.name} ${t.l2_reference_analog || ''} ${tb.layout_archetype || ''} ${t.territory_name || ''} town village castle`,
      actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
      actionLabel: `🏘️ Open Town Blueprint (5.2×)`
    });
    (tb.service_marks || []).forEach(m => {
      const isRefine = m.mark_type === 'blacksmith' || m.mark_type === 'refinement_anvils';
      entries.push({
        id: `mark-${t.zone_id}-${m.mark_id}`,
        kind: 'Town Service Mark',
        icon: m.icon || '🛍️',
        badgeColor: '#f59e0b',
        title: `${m.label} (${m.npc_name || m.mark_type})`,
        subtitle: `${t.name} · Building #${m.building_number}`,
        keywords: `${m.label} ${m.mark_type} ${m.npc_name || ''} ${m.description || ''} ${t.name} ${isRefine ? 'Refinement +1..+15 Anvil Blacksmith Spoil' : ''} ${m.mark_type === 'warehouse' ? 'Warehouse Vault' : 'Shop'}`,
        actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
        actionLabel: `🛍️ Inspect #${m.building_number} in ${t.name.split('(')[0].trim()}`
      });
    });
    (tb.npc_roster || []).forEach(npc => {
      entries.push({
        id: `npc-${t.zone_id}-${npc.building_number}`,
        kind: 'Town NPC (#1..#12)',
        icon: '👤',
        badgeColor: npc.color_hex || '#38bdf8',
        title: `#${npc.building_number} ${npc.name} — ${npc.role_title}`,
        subtitle: `${t.name} · ${npc.role_category}`,
        keywords: `${npc.name} ${npc.role_title} ${npc.role_category} #${npc.building_number} ${t.name} ${npc.role_category === 'warehouse' ? 'Warehouse' : ''} ${npc.role_category === 'merchant' ? 'Shop Refinement +1..+15' : ''}`,
        actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(npc.loc_coord || tLoc)}')`,
        actionLabel: `📍 Locate NPC #${npc.building_number}`
      });
    });
  });

  // 3. 24 Field Hunting Areas & 8 Harbors/ClanHalls/Fortresses
  allFields.forEach(f => {
    entries.push({
      id: `field-${f.zone_id}`,
      kind: 'Field Hunting Area',
      icon: '🏕️',
      badgeColor: '#4ade80',
      title: `${f.name} (${f.l2_reference_analog || ''})`,
      subtitle: `${f.level_header || ''} · Field Tactical Blueprint`,
      keywords: `${f.name} ${f.l2_reference_analog || ''} ${f.territory_name || ''} field hunting zone`,
      actionJs: `focusFieldTacticalBlueprint('${escapeHtml(f.zone_id)}', '${escapeHtml(f.loc_coord || '')}')`,
      actionLabel: `🏕️ Open Field Blueprint (4.8×)`
    });
  });
  allFortresses.forEach(h => {
    entries.push({
      id: `fort-${h.zone_id}`,
      kind: 'Fortress / Harbor',
      icon: '🛡️',
      badgeColor: '#fb923c',
      title: `${h.name} (${h.l2_reference_analog || ''})`,
      subtitle: `${h.category} · ${h.level_header || ''}`,
      keywords: `${h.name} ${h.l2_reference_analog || ''} ${h.category} fortress harbor clanhall`,
      actionJs: `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc_coord || '')}')`,
      actionLabel: `🛡️ Open Fortress Blueprint`
    });
  });

  // 4. 16 Multi-Floor Dungeons (48 Floors B1..B3 / 1F..3F) + Boss Spawns
  allDungeons.forEach(d => {
    (d.floors || []).forEach(fl => {
      entries.push({
        id: `dng-${d.dungeon_id}-${fl.floor_id}`,
        kind: `Dungeon Floor ${fl.floor_id}`,
        icon: d.dungeon_kind === 'vertical_tower' ? '🗼' : '🕳️',
        badgeColor: '#a855f7',
        title: `${d.name} (${d.l2_archetype_alias || ''}) · Floor ${fl.floor_id}`,
        subtitle: `${fl.level_range} · ${fl.boss_tier_highlight || ''}`,
        keywords: `${d.name} ${d.l2_archetype_alias || ''} ${fl.floor_id} ${fl.name} ${fl.boss_tier_highlight || ''} dungeon tower catacomb`,
        actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
        actionLabel: `🕳️ Warp to ${fl.floor_id}`
      });
      (fl.spawns || []).forEach(sp => {
        const isMvp = sp.entity_type === 'MVP';
        const isRaid = sp.entity_type === 'Raid' || sp.entity_type === 'RaidBoss';
        entries.push({
          id: `dng-spawn-${d.dungeon_id}-${fl.floor_id}-${sp.npc_id}`,
          kind: `${sp.entity_type} Spawn`,
          icon: isMvp ? '👑' : (isRaid ? '🔥' : (sp.entity_type === 'Mini-Boss' ? '⚔️' : '👾')),
          badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : '#ef4444'),
          title: `${sp.name} (Lv.${sp.level} ${sp.entity_type})`,
          subtitle: `${d.name} · Floor ${fl.floor_id} · Drops: ${(sp.refinement_drops || []).slice(0, 2).join(', ')}`,
          keywords: `${sp.name} ${sp.entity_type} ${d.name} ${d.l2_archetype_alias || ''} ${fl.floor_id} ${(sp.refinement_drops || []).join(' ')} ${isMvp ? 'MVP Bosses' : ''} ${isRaid ? 'Raid Bosses' : ''}`,
          actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
          actionLabel: `📍 Open ${fl.floor_id}`
        });
      });
    });
  });

  // 7. 6 Primordial Sealed-God 5-Tier Boss Hierarchy Chains
  const bossChains = getAtlasBossHierarchyChains(tatlas);
  bossChains.forEach(ch => {
    const mvpNames = (ch.mvp_apostles || []).map(x => x.name).join(', ');
    const raidNames = (ch.raid_bosses || []).map(x => x.name).join(', ');
    entries.push({
      id: `god-chain-${ch.god_id}`,
      kind: 'Sealed God Chain',
      icon: ch.icon || '🔱',
      badgeColor: ch.theme_color || '#f43f5e',
      title: `${ch.god_name} (${ch.chapter_epoch})`,
      subtitle: `5-Tier Chain: Sealed God → MVP (${mvpNames}) → Raid (${raidNames})`,
      keywords: `${ch.god_id} ${ch.god_name} ${ch.chapter_epoch} ${ch.domain_aspect || ''} ${mvpNames} ${raidNames} Boss Hierarchy Chain Sealed God`,
      actionJs: `setAtlasBossGodChain('${escapeHtml(ch.god_id)}')`,
      actionLabel: `🔱 Trace 5-Tier Chain`
    });
  });

  return entries;
}

function searchAtlasOmniIndex(query, tatlas) {
  const index = buildAtlasOmniSearchIndex(tatlas);
  const raw = String(query || '').trim().toLowerCase();
  if (!raw) {
    return index.slice(0, 8);
  }
  const tokens = raw.split(/\s+/).filter(Boolean);
  return index.filter(item => {
    const hay = `${item.title} ${item.subtitle} ${item.keywords} ${item.kind}`.toLowerCase();
    return tokens.every(tk => hay.includes(tk));
  }).slice(0, 14);
}

function renderAtlasFilteredEntityMatrixHtml(tatlas) {
  const activeFilter = ATLAS_STATE_STORE.filter || 'All';
  const activeBand = ATLAS_STATE_STORE.levelBand || 'All';
  const searchRaw = String(ATLAS_OMNI_SEARCH_QUERY || ATLAS_STATE_STORE.omniSearchQuery || '').trim().toLowerCase();
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const raceSpawns = (tatlas && tatlas.race_spawn_locations) || [];

  const rows = [];

  // 1. Race Spawns
  if (activeFilter === 'All' || activeFilter === 'RaceSpawns') {
    raceSpawns.forEach(rs => {
      if (!matchesAtlasLevelBand([1, 10], activeBand)) return;
      rows.push({
        entityType: 'RaceSpawns',
        badgeLabel: '🧬 Race Spawn',
        badgeColor: '#10b981',
        name: `${rs.race_name} — ${rs.starter_shrine_monument}`,
        zoneOrFloor: `${rs.starter_town_name} · Plaza Shrine #1`,
        level: 1,
        levelDisplay: 'Lv.1–10',
        respawn: 'Starter Sanctuary',
        drops: 'Starter Accord Emblem · Soulshot Pack · Wayfarer Map',
        locCoord: rs.loc_coord || '-84120:243500',
        actionJs: `focusTownStreetBlueprint('${escapeHtml(rs.starter_town_node_id)}', '${escapeHtml(rs.loc_coord || '')}')`,
        actionLabel: '📍 Locate on Map / Open Town'
      });
    });
  }

  // 2. Town NPCs: Shop + Refinement
  if (activeFilter === 'All' || activeFilter === 'TownMarks') {
    allTowns.forEach(t => {
      const tb = t.town_blueprint || {};
      const lvBand = t.level_band || [1, 20];
      if (!matchesAtlasLevelBand(lvBand, activeBand)) return;
      const tNode = t.studio_node_id || t.zone_id;
      const tLoc = t.loc_coord || '-84120:243500';
      (tb.service_marks || []).filter(m => ['equip_shop', 'consumable_shop', 'blacksmith', 'warehouse', 'gatekeeper'].includes(m.mark_type)).slice(0, 3).forEach(m => {
        rows.push({
          entityType: 'TownMarks',
          badgeLabel: '🛍️ Shop + Refinement',
          badgeColor: '#eab308',
          name: `${m.icon || '🛍️'} ${m.label} (${m.npc_name || 'Merchant'})`,
          zoneOrFloor: `${t.name} · Building #${m.building_number}`,
          level: lvBand[0] || 1,
          levelDisplay: `Lv.${lvBand[0]}–${lvBand[1]}`,
          respawn: '24h Town Service',
          drops: '+1..+15 Refinement Anvil · Weapons · Armor · Potions & Soulshots',
          locCoord: tLoc,
          actionJs: `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tLoc)}')`,
          actionLabel: '📍 Locate on Map / Open Shop'
        });
      });
    });
  }

  // 3. Multi-Floor Dungeon Spawns (Monster, Mini-Boss, Raid, MVP across 16 Dungeons / 48 Floors)
  allDungeons.forEach(d => {
    (d.floors || []).forEach(fl => {
      (fl.spawns || []).forEach(sp => {
        const normType = sp.entity_type === 'RaidBoss' ? 'Raid' : sp.entity_type;
        if (activeFilter !== 'All' && normType !== activeFilter) return;
        if (!matchesAtlasLevelBand(sp.level, activeBand)) return;
        const isMvp = normType === 'MVP';
        const isRaid = normType === 'Raid';
        const isMini = normType === 'Mini-Boss';
        rows.push({
          entityType: normType,
          badgeLabel: isMvp ? '👑 MVP' : (isRaid ? '🔥 Raid' : (isMini ? '⚔️ Mini-Boss' : '👾 Monster')),
          badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444')),
          name: sp.name,
          zoneOrFloor: `${d.name} · Floor ${fl.floor_id} (${fl.floor_elevation_meters > 0 ? '+' + fl.floor_elevation_meters : fl.floor_elevation_meters}m)`,
          level: sp.level,
          levelDisplay: `Lv.${sp.level}`,
          respawn: `${sp.respawn_sec}s (×${sp.spawn_count})`,
          drops: (sp.refinement_drops || ['High-Grade Iron Ore', 'Refinement Flux Dust']).join(' · '),
          locCoord: sp.loc_coord || d.entrance_loc || '',
          actionJs: `openDungeonSubMap('${escapeHtml(d.dungeon_id)}', '${escapeHtml(fl.floor_id)}')`,
          actionLabel: `📍 Locate on Map / Open Floor ${fl.floor_id}`
        });
      });
    });
  });

  // 4. Field Hunting Area & Fortress Spawn Territories (Monster, Mini-Boss, Raid, MVP across 24 Fields + 8 Fortresses)
  [...allFields.map(f => ({ entry: f, bp: f.field_tactical_blueprint, isFort: false })), ...allFortresses.map(h => ({ entry: h, bp: h.fortress_blueprint, isFort: true }))].forEach(({ entry, bp, isFort }) => {
    if (!bp) return;
    (bp.spawn_territories || []).forEach(st => {
      if (activeFilter !== 'All' && st.entity_type !== activeFilter) return;
      if (!matchesAtlasLevelBand(st.level, activeBand)) return;
      const isMvp = st.entity_type === 'MVP';
      const isRaid = st.entity_type === 'Raid';
      const isMini = st.entity_type === 'Mini-Boss';
      const fnName = isFort ? 'focusFortressBlueprint' : 'focusFieldTacticalBlueprint';
      rows.push({
        entityType: st.entity_type,
        badgeLabel: isMvp ? '👑 MVP' : (isRaid ? '🔥 Raid' : (isMini ? '⚔️ Mini-Boss' : '👾 Monster')),
        badgeColor: isMvp ? '#eab308' : (isRaid ? '#f97316' : (isMini ? '#a855f7' : '#ef4444')),
        name: st.mob_name,
        zoneOrFloor: `${entry.name} · ${isFort ? 'Fortress Ring' : 'Field Ring'}`,
        level: st.level,
        levelDisplay: `Lv.${st.level}`,
        respawn: `${st.respawn} (×${st.count})`,
        drops: (st.refinement_drops || []).join(' · '),
        locCoord: st.loc_coord || entry.loc_coord || '',
        actionJs: `${fnName}('${escapeHtml(entry.zone_id)}', '${escapeHtml(st.loc_coord || entry.loc_coord || '')}')`,
        actionLabel: '📍 Locate on Map / Open Blueprint'
      });
    });
  });

  const filteredRows = searchRaw
    ? rows.filter(r => `${r.name} ${r.zoneOrFloor} ${r.drops} ${r.badgeLabel}`.toLowerCase().includes(searchRaw))
    : rows;

  const displayRows = filteredRows.slice(0, 18);
  const tabDefs = [
    { id: 'All', label: '🌐 All Entities' },
    { id: 'RaceSpawns', label: '🧬 Race Spawns' },
    { id: 'TownMarks', label: '🛍️ NPCs: Shop + Refinement' },
    { id: 'Monster', label: '👾 Monster' },
    { id: 'Mini-Boss', label: '⚔️ Mini-Boss' },
    { id: 'Raid', label: '🔥 Raid' },
    { id: 'MVP', label: '👑 MVP' }
  ];

  return `
    <div id="studioFilteredEntitySpawnMatrix" style="padding:10px 16px;background:#0c121c;border-top:1px solid rgba(250,204,21,0.28)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:${ATLAS_ENTITY_MATRIX_OPEN ? '8px' : '0px'}">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button type="button" onclick="toggleAtlasEntityMatrix()"
                  style="padding:5px 12px;border-radius:8px;border:1.5px solid #fde047;background:${ATLAS_ENTITY_MATRIX_OPEN ? '#b45309' : '#162032'};color:#fde047;font-size:11.5px;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            📊 Filtered World Entity Matrix (Click to Expand / Collapse) · ${filteredRows.length} Matching ${ATLAS_ENTITY_MATRIX_OPEN ? '▲' : '▼'}
          </button>
          <div>
            <div style="font-size:11.5px;font-weight:900;color:#fde047">
              🎯 LIVE WORLD &amp; DUNGEON SPAWN &amp; REFINEMENT-SPOIL LOCATOR MATRIX (D14 · ${filteredRows.length} MATCHING ENTITIES)
            </div>
            <div style="font-size:10px;color:#94a3b8">
              Synced with Active Filter (${escapeHtml(activeFilter)}) &amp; Level Band (${escapeHtml(activeBand)}) across 16 Multi-Floor Dungeons (48 Floors), 24 Fields, 8 Fortresses &amp; 15 Towns
            </div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${tabDefs.map(tb => {
            const act = activeFilter === tb.id;
            return `
              <button type="button" onclick="setAtlasFilter('${tb.id}')"
                      style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#fde047' : 'rgba(255,255,255,0.14)'};background:${act ? '#d97706' : '#162032'};color:${act ? '#ffffff' : '#cbd5e1'}">
                ${tb.label}
              </button>
            `;
          }).join('')}
        </div>
      </div>
      <div id="studioAtlasFilteredEntityMatrix" style="display:${ATLAS_ENTITY_MATRIX_OPEN ? 'block' : 'none'}">
        ${ATLAS_ENTITY_MATRIX_OPEN ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:7px">
          ${displayRows.map(r => `
            <div style="padding:8px 10px;border-radius:8px;background:#141d2d;border-left:3.5px solid ${r.badgeColor};border-top:1px solid rgba(255,255,255,0.07);border-right:1px solid rgba(255,255,255,0.07);border-bottom:1px solid rgba(255,255,255,0.07);display:flex;flex-direction:column;justify-content:space-between;gap:5px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                  <span style="font-size:11px;font-weight:900;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}</span>
                  <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.9);color:${r.badgeColor};border:1px solid ${r.badgeColor};flex-shrink:0">${escapeHtml(r.badgeLabel)} · ${escapeHtml(r.levelDisplay)}</span>
                </div>
                <div style="font-size:10px;color:#cbd5e1;margin-top:2px;font-weight:700">
                  🗺️ ${escapeHtml(r.zoneOrFloor)} · <span class="mono" style="color:#38bdf8">⏱️ ${escapeHtml(r.respawn)}</span>
                </div>
                <div style="font-size:9.5px;color:#fde68a;margin-top:2px">
                  💎 Drops / Spoils: ${escapeHtml(r.drops)}
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:3px">
                <span class="mono" style="font-size:9px;color:#94a3b8">loc=${escapeHtml(r.locCoord)}</span>
                <button type="button" onclick="${r.actionJs}"
                        style="padding:3px 9px;border-radius:6px;border:1px solid #fde047;background:#1e3a8a;color:#fde047;font-size:9.5px;font-weight:900;cursor:pointer;flex-shrink:0">
                  ${escapeHtml(r.actionLabel)}
                </button>
              </div>
            </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderAtlasBlacksmithRefinementBarHtml(tatlas) {
  const canonGradeCodes = [
    'No-Grade Lv.1–19',
    'D-Grade Lv.20–39',
    'C-Grade Lv.40–51',
    'B-Grade Lv.52–60',
    'A-Grade Lv.61–75',
    'S-Grade Lv.76–99'
  ];
  const grades = (tatlas && tatlas.refinement_grade_matrix && tatlas.refinement_grade_matrix.length)
    ? tatlas.refinement_grade_matrix
    : canonGradeCodes.map(gc => ({ grade_code: gc, safe_refinement_level: 3, max_refinement_level: 15, rates_by_plus: [], required_materials: [], home_blacksmith_towns: [] }));
  if (!grades.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curGradeCode = ATLAS_REFINE_GRADE || ATLAS_STATE_STORE.refineGrade || grades[0].grade_code;
  const activeGrade = grades.find(g => g.grade_code === curGradeCode || g.grade_short_code === curGradeCode) || grades[0];
  const curPlus = Math.max(1, Math.min(15, Number(ATLAS_REFINE_PLUS || ATLAS_STATE_STORE.refinePlus || 3)));
  const rates = activeGrade.rates_by_plus || [];
  const activeStep = rates.find(r => r.plus_level === curPlus) || rates[2] || rates[0] || {
    plus_level: curPlus,
    plus_label: `+${curPlus}`,
    success_rate_pct: 100.0,
    stat_bonus: '+9% P.Atk/M.Atk/P.Def',
    failure_penalty: 'None (100% Safe Tempering Guarantee)',
    required_catalyst: 'Scroll: Enchant Weapon/Armor'
  };

  const isSafe = curPlus <= (activeGrade.safe_refinement_level || 3);
  const rateCol = isSafe ? '#34d399' : (curPlus <= 6 ? '#fde047' : (curPlus <= 9 ? '#38bdf8' : (curPlus <= 12 ? '#f97316' : '#f43f5e')));

  return `
    <div id="atlasBlacksmithRefinementLocatorBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#19130c;border:1px solid rgba(245,158,11,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fbbf24">⚒️ BLACKSMITH REFINEMENT (+1..+15) &amp; SPOIL SOURCE LOCATOR (D19):</span>
          ${grades.map(g => {
            const isAct = g.grade_code === activeGrade.grade_code;
            return `
              <button type="button" onclick="setAtlasRefineGrade('${escapeHtml(g.grade_code)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(245,158,11,0.35)'};background:${isAct ? '#b45309' : '#0f172a'};color:${isAct ? '#ffffff' : '#fde68a'}">
                🛡️ ${escapeHtml(g.grade_code)}
              </button>
            `;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px">
          <span class="mono" style="font-size:9.5px;color:#cbd5e1;font-weight:800">Anvil Step (Safe +${activeGrade.safe_refinement_level || 3}):</span>
          ${rates.map(r => {
            const isAct = r.plus_level === curPlus;
            const stepSafe = r.plus_level <= (activeGrade.safe_refinement_level || 3);
            return `
              <button type="button" onclick="setAtlasRefinePlus(${r.plus_level})"
                      style="min-width:28px;height:22px;padding:0 5px;border-radius:5px;font-size:9.5px;font-weight:900;cursor:pointer;border:1px solid ${isAct ? '#fde047' : (stepSafe ? 'rgba(52,211,153,0.45)' : 'rgba(255,255,255,0.14)')};background:${isAct ? '#d97706' : (stepSafe ? '#064e3b' : '#0f172a')};color:${isAct ? '#ffffff' : (stepSafe ? '#6ee7b7' : '#cbd5e1')}">
                +${r.plus_level}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:7px;align-items:stretch">
        <!-- Selected Grade Weapons/Armor + Active +1..+15 Anvil Rate -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid ${rateCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span style="font-size:10.5px;font-weight:900;color:#fde047">${escapeHtml(activeGrade.grade_code)} · Step ${escapeHtml(activeStep.plus_label)}</span>
            <span class="mono" style="font-size:9.5px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.95);color:${rateCol};border:1px solid ${rateCol};font-weight:900">
              ${activeStep.success_rate_pct}% Success ${isSafe ? '(SAFE)' : ''}
            </span>
          </div>
          <div style="font-size:9.5px;color:#e2e8f0">
            ⚔️ <strong>Weapons:</strong> ${escapeHtml((activeGrade.representative_weapons || []).join(' · '))}
          </div>
          <div style="font-size:9.5px;color:#cbd5e1">
            🛡️ <strong>Armor:</strong> ${escapeHtml((activeGrade.representative_armor || []).join(' · '))}
          </div>
          <div style="font-size:9.5px;color:#6ee7b7;font-weight:700">
            ✨ <strong>Bonus:</strong> ${escapeHtml(activeStep.stat_bonus)} · <span style="color:#fca5a5">${escapeHtml(activeStep.failure_penalty)}</span>
          </div>
          <div class="mono" style="font-size:9px;color:#93c5fd">
            📜 Catalyst: ${escapeHtml(activeStep.required_catalyst)}
          </div>
        </div>

        <!-- Required Refinement Materials & 1-Click Drop Zone / Dungeon Floor Locator -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid #38bdf8;display:flex;flex-direction:column;gap:4px">
          <div class="mono" style="font-size:9.5px;font-weight:900;color:#38bdf8">
            💎 REQUIRED SPOIL &amp; DROP MATERIALS (Highlight Material Drop Zones / Open Dungeon Floor):
          </div>
          ${(activeGrade.required_materials || []).map(mat => `
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;padding:3px 6px;border-radius:5px;background:#162033">
              <div style="min-width:0">
                <div style="font-size:9.8px;font-weight:800;color:#f8fafc">${escapeHtml(mat.material_name)} <span class="mono" style="font-size:8.8px;color:#fde047">(${escapeHtml(mat.used_for_plus_range || '+1..+15')})</span></div>
                <div class="mono" style="font-size:8.5px;color:#94a3b8">${escapeHtml(mat.drop_or_spoil_rate || 'Dwarf Spoil & Boss Drop')}</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:3px">
                ${(mat.drop_zones || []).map(dzId => {
                  const zObj = zoneById[dzId];
                  const zShort = zObj ? zObj.name.split('(')[0].trim().slice(0, 20) : dzId.replace('zone-', '');
                  const isDng = dzId.includes('dungeon') || dzId.includes('catacomb');
                  return `
                    <button type="button" onclick="highlightMaterialDropZonesOrOpenDungeon('${escapeHtml(dzId)}')"
                            title="Highlight Material Drop Zones / Open Dungeon Floor (${escapeHtml(dzId)})"
                            style="padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#c084fc' : '#4ade80'};background:${isDng ? '#3b0764' : '#052e16'};color:#f8fafc;font-size:8.8px;font-weight:800;cursor:pointer">
                      ${isDng ? '🕳️' : '🏕️'} ${escapeHtml(zShort)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Home Blacksmith Towns (1-Click Jump to Blacksmith Town Street Map) -->
        <div style="padding:6px 9px;border-radius:6px;background:#0f172a;border-left:3.5px solid #eab308;display:flex;flex-direction:column;justify-content:space-between;gap:5px">
          <div>
            <div class="mono" style="font-size:9.5px;font-weight:900;color:#fde047">
              🏰 HOME BLACKSMITH ANVIL TOWNS (Jump to Blacksmith Town Street Map):
            </div>
            <div style="font-size:9px;color:#cbd5e1;margin-top:2px">
              Click any town below to zoom to its Tier 3 Street Blueprint (5.2×) and inspect Building #3 (Blacksmith Clan &amp; Refinement Anvil).
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${(activeGrade.home_blacksmith_towns || []).map(tZid => {
              const tObj = zoneById[tZid];
              const tShort = tObj ? tObj.name.split('(')[0].trim() : tZid;
              return `
                <button type="button" onclick="jumpToBlacksmithTownStreetMap('${escapeHtml(tZid)}')"
                        title="Jump to Blacksmith Town Street Map (${escapeHtml(tShort)})"
                        style="padding:3px 8px;border-radius:5px;border:1px solid #fde047;background:#422006;color:#fef08a;font-size:9.2px;font-weight:900;cursor:pointer">
                  ⚒️ Jump to Blacksmith Town Street Map: ${escapeHtml(tShort)}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasBossHierarchyChainBarHtml(tatlas) {
  const chains = (tatlas && tatlas.boss_hierarchy_chains) || [];
  if (!chains.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curGodId = ATLAS_BOSS_GOD_ID || ATLAS_STATE_STORE.bossGodId || chains[0].god_id;
  const activeChain = chains.find(c => c.god_id === curGodId || c.god_short_label === curGodId) || chains[0];
  const isAllGods = curGodId === 'All';

  const godPills = [
    { id: 'All', label: '🌐 All Gods' },
    { id: 'god-sola-hearth-weaver', label: '🔥 Sola' },
    { id: 'god-krono-brass-titan', label: '⚙️ Krono' },
    { id: 'god-vesper-dream-eater', label: '✨ Vesper' },
    { id: 'god-aurelia-dawn-forger', label: '☀️ Aurelia' },
    { id: 'god-thalassa-abyss-tide', label: '🌊 Thalassa' },
    { id: 'god-legendary-dragon', label: '🐉 Legendary Dragon' }
  ];

  const catObj = zoneById[activeChain.seal_catacomb_zone_id];
  const catShort = catObj ? catObj.name.split('(')[0].trim() : activeChain.seal_catacomb_zone_id;

  return `
    <div id="atlasBossHierarchyChainBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#160d1f;border:1px solid rgba(192,132,252,0.5)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">👑 5-TIER BOSS POWER HIERARCHY &amp; SEALED-GOD CHAIN (D21):</span>
          ${godPills.map(gp => {
            const isAct = (isAllGods && gp.id === 'All') || (!isAllGods && activeChain.god_id === gp.id);
            return `
              <button type="button" onclick="setAtlasBossGodChain('${escapeHtml(gp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.4)'};background:${isAct ? '#7e22ce' : '#0f172a'};color:${isAct ? '#ffffff' : '#e9d5ff'}">
                ${escapeHtml(gp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9.2px;color:#fde047;font-weight:800">
          STRICT LAW: [1] SEALED GOD ➔ [2] MVP APOSTLE (B3/3F) ➔ [3] RAID BOSS ➔ [4] MINI-BOSS ➔ [5] MINION FAMILY
        </span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;align-items:stretch">
        <!-- Tier 1: Primordial Sealed God & Seal Catacomb -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #c084fc;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#c084fc">TIER 1 · PRIMORDIAL SEALED GOD</div>
            <div style="font-size:10px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeChain.god_name)}</div>
            <div class="mono" style="font-size:8.6px;color:#94a3b8;margin-top:2px">${escapeHtml(activeChain.chapter_epoch)} · loc=${escapeHtml(activeChain.seal_loc)}</div>
          </div>
          <button type="button" onclick="openDungeonSubMap('${escapeHtml(activeChain.seal_catacomb_zone_id)}', 'B3')"
                  title="Jump to Seal Catacomb (${escapeHtml(catShort)})"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #c084fc;background:#3b0764;color:#f3e8ff;font-size:8.8px;font-weight:900;cursor:pointer;text-align:left">
            🕳️ Jump to Seal Catacomb: ${escapeHtml(catShort)} (B3)
          </button>
        </div>

        <!-- Tier 2: Direct MVP Apostles (B3 / 3F Sanctums) -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #eab308;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#fde047">TIER 2 · DIRECT MVP APOSTLES (SANCTUM B3/3F)</div>
            ${(activeChain.mvp_apostles || []).map(ap => `
              <div style="margin-top:3px;padding:3px 5px;border-radius:4px;background:#162033">
                <div style="font-size:9.4px;font-weight:800;color:#fef08a">👑 ${escapeHtml(ap.name)} (Lv.${ap.level})</div>
                <div class="mono" style="font-size:8.3px;color:#6ee7b7">💎 ${escapeHtml(ap.signature_drop)}</div>
                <button type="button" onclick="openDungeonSubMap('${escapeHtml(ap.dungeon_id)}', '${escapeHtml(ap.floor_id)}')"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.4px;font-weight:800;cursor:pointer">
                  👑 Open MVP Sanctum: ${escapeHtml(ap.dungeon_id.replace('zone-', ''))} (${escapeHtml(ap.floor_id)})
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tier 3: Regional Raid Bosses -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #f97316;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#fb923c">TIER 3 · REGIONAL RAID BOSSES</div>
            ${(activeChain.raid_bosses || []).map(rb => `
              <div style="margin-top:3px;padding:3px 5px;border-radius:4px;background:#162033;display:flex;justify-content:space-between;align-items:center;gap:4px">
                <div style="min-width:0">
                  <div style="font-size:9.3px;font-weight:800;color:#fed7aa">🔥 ${escapeHtml(rb.name)} (Lv.${rb.level})</div>
                  <div class="mono" style="font-size:8.2px;color:#94a3b8">Respawn ${escapeHtml(rb.respawn)} · loc=${escapeHtml(rb.loc)}</div>
                </div>
                <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(rb.zone_id)}', '${escapeHtml(rb.loc)}')"
                        style="padding:2px 6px;border-radius:4px;border:1px solid #fb923c;background:#431407;color:#ffedd5;font-size:8.3px;font-weight:800;cursor:pointer;flex-shrink:0">
                  🔥 Raid Field
                </button>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tier 4 & Tier 5: Mini-Boss Patrols & Minion Ecological Families -->
        <div style="padding:6px 8px;border-radius:6px;background:#0f172a;border-left:3.5px solid #ef4444;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:9px;font-weight:900;color:#f87171">TIER 4 MINI-BOSS &amp; TIER 5 MINION FAMILIES</div>
            ${(activeChain.mini_bosses || []).map(mb => `
              <div style="margin-top:2px;display:flex;justify-content:space-between;align-items:center;gap:4px">
                <span style="font-size:9px;color:#e2e8f0;font-weight:700">⚔️ ${escapeHtml(mb.name)} (Lv.${mb.level})</span>
                <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(mb.zone_id)}', '${escapeHtml(mb.loc)}')"
                        style="padding:1px 5px;border-radius:4px;border:1px solid #a855f7;background:#2e1065;color:#e9d5ff;font-size:8px;font-weight:800;cursor:pointer">
                  ⚔️ Patrol
                </button>
              </div>
            `).join('')}
            <div style="margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,0.08)">
              ${(activeChain.minion_families || []).map(mf => `
                <div style="font-size:8.6px;color:#cbd5e1;margin-top:2px">
                  👾 <strong>${escapeHtml(mf.family_name)}:</strong> ${escapeHtml(mf.representative_mob)}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasQuestTrialOverlayBarHtml(tatlas) {
  const quests = (tatlas && tatlas.quest_trial_chains) || [];
  if (!quests.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curTrack = ATLAS_QUEST_TRACK || ATLAS_STATE_STORE.questTrack || 'All';
  const filteredQuests = curTrack === 'All'
    ? quests
    : quests.filter(q => q.quest_track === curTrack);
  const activeQuest = filteredQuests.find(q => q.quest_id === (ATLAS_ACTIVE_QUEST_ID || ATLAS_STATE_STORE.activeQuestId))
    || filteredQuests[0]
    || quests[0];

  const trackPills = [
    { id: 'All', label: '🌐 All Quests (18)' },
    { id: 'main_story', label: '📜 Main Story (6)' },
    { id: 'class_transfer', label: '⚔️ Class Transfer Lv.20/40/76 (6)' },
    { id: 'racial_heritage', label: '🧬 Racial Side Quests (6)' }
  ];

  const giverZone = zoneById[activeQuest.giver_zone_id];
  const giverTownNodeId = (giverZone && (giverZone.studio_node_id || giverZone.zone_id)) || activeQuest.giver_zone_id;
  const giverShort = giverZone ? giverZone.name.split('(')[0].trim() : activeQuest.giver_zone_id;

  const objZone = zoneById[activeQuest.objective_zone_id];
  const objShort = objZone ? objZone.name.split('(')[0].trim() : activeQuest.objective_zone_id;
  const isDngObj = Boolean(activeQuest.objective_dungeon_id);
  const objJumpCall = isDngObj
    ? `openDungeonSubMap('${escapeHtml(activeQuest.objective_dungeon_id)}', '${escapeHtml(activeQuest.objective_floor_id || 'B1')}')`
    : `focusFieldTacticalBlueprint('${escapeHtml(activeQuest.objective_zone_id)}', '${escapeHtml(activeQuest.objective_loc || '')}')`;

  const turnInZone = zoneById[activeQuest.turn_in_zone_id];
  const turnInTownNodeId = (turnInZone && (turnInZone.studio_node_id || turnInZone.zone_id)) || activeQuest.turn_in_zone_id;
  const turnInShort = turnInZone ? turnInZone.name.split('(')[0].trim() : activeQuest.turn_in_zone_id;

  return `
    <div id="atlasQuestTrialOverlayBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0f1d2e;border:1px solid rgba(56,189,248,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">📜 3-TRACK QUEST &amp; CLASS TRIAL OVERLAY (D23):</span>
          ${trackPills.map(tp => {
            const isAct = curTrack === tp.id;
            return `
              <button type="button" onclick="setAtlasQuestTrack('${escapeHtml(tp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.4)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                ${escapeHtml(tp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9px;color:#94a3b8;font-weight:800">Active Chain:</span>
          <select aria-label="Select Canonical Quest or Class Transfer Trial" onchange="selectAtlasQuestChain(this.value)"
                  style="height:24px;padding:1px 7px;border-radius:6px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.55);font-size:9.8px;font-weight:800;cursor:pointer">
            ${filteredQuests.map(q => {
              const sel = q.quest_id === activeQuest.quest_id ? 'selected' : '';
              const tierTag = q.class_tier && q.class_tier !== 'None' ? ` [${q.class_tier}]` : '';
              return `<option value="${escapeHtml(q.quest_id)}" ${sel}>[${escapeHtml(q.race_id)} Lv.${q.min_level}] ${escapeHtml(q.quest_name)}${escapeHtml(tierTag)}</option>`;
            }).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;align-items:stretch">
        <!-- Step 1: Quest Giver Town & NPC -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #38bdf8;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#38bdf8">STEP 1 · QUEST GIVER TOWN (${escapeHtml(activeQuest.race_id)} · Lv.${activeQuest.min_level})</div>
            <div style="font-size:9.8px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeQuest.giver_npc_name)}</div>
            <div class="mono" style="font-size:8.4px;color:#94a3b8;margin-top:1px">${escapeHtml(giverShort)} · loc=${escapeHtml(activeQuest.giver_loc)}</div>
          </div>
          <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(giverTownNodeId)}', '${escapeHtml(activeQuest.giver_loc)}')"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            🏰 Jump to Giver Town: ${escapeHtml(giverShort)}
          </button>
        </div>

        <!-- Step 2: Hunting / Dungeon Floor Objective -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #f59e0b;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#fde047">
              STEP 2 · OBJECTIVE (${isDngObj ? 'DUNGEON FLOOR ' + escapeHtml(activeQuest.objective_floor_id) : 'FIELD HUNTING GROUND'})
            </div>
            <div style="font-size:9.8px;font-weight:900;color:#fef08a;margin-top:2px">🎯 ${escapeHtml(activeQuest.objective_target)}</div>
            <div class="mono" style="font-size:8.4px;color:#94a3b8;margin-top:1px">${escapeHtml(objShort)} · loc=${escapeHtml(activeQuest.objective_loc)}</div>
          </div>
          <button type="button" onclick="${objJumpCall}"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            ${isDngObj ? `🕳️ Jump to Objective Dungeon: ${escapeHtml(objShort)} (${escapeHtml(activeQuest.objective_floor_id)})` : `🏕️ Jump to Objective Field: ${escapeHtml(objShort)}`}
          </button>
        </div>

        <!-- Step 3: Turn-In NPC & Class/Quest Reward -->
        <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #10b981;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
          <div>
            <div class="mono" style="font-size:8.8px;font-weight:900;color:#34d399">
              STEP 3 · TURN-IN &amp; REWARD ${activeQuest.class_tier !== 'None' ? '(' + escapeHtml(activeQuest.class_tier) + ')' : ''}
            </div>
            <div style="font-size:9.8px;font-weight:900;color:#ecfdf5;margin-top:2px">🏆 ${escapeHtml(activeQuest.turn_in_npc_name)}</div>
            <div class="mono" style="font-size:8.4px;color:#6ee7b7;margin-top:1px">🎁 ${escapeHtml(activeQuest.reward_summary)}</div>
          </div>
          <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(turnInTownNodeId)}', '${escapeHtml(activeQuest.turn_in_loc)}')"
                  style="padding:3px 7px;border-radius:5px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
            🏛️ Jump to Turn-In Town: ${escapeHtml(turnInShort)}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAtlasFarmingHeatmapBarHtml(tatlas) {
  const profiles = (tatlas && tatlas.farming_efficiency_profiles) || [];
  if (!profiles.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
  });

  const curMode = ATLAS_FARMING_MODE || ATLAS_STATE_STORE.farmingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🔥 All 40 Combat Zones' },
    { id: 'solo_grinding', label: '🗡️ Solo Grinding' },
    { id: 'duo_spoil_scavenger', label: '⛏️ Duo Spoil Scavenger' },
    { id: 'full_9p_aoe_party', label: '🛡️ 9-Player AoE Party' },
    { id: 'clan_raid_force', label: '👑 Clan Raid Force' }
  ];

  const matchingProfiles = curMode === 'Off'
    ? []
    : (curMode === 'All' ? profiles : profiles.filter(p => p.recommended_party_mode === curMode));

  const topHotspots = matchingProfiles
    .slice()
    .sort((a, b) => (b.xp_per_hour_index + b.adena_per_hour_index) - (a.xp_per_hour_index + a.adena_per_hour_index))
    .slice(0, 4);

  return `
    <div id="atlasFarmingEfficiencyHeatmapBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#101f18;border:1px solid rgba(52,211,153,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#6ee7b7">⚡ PARTY &amp; FARMING EFFICIENCY HEATMAP (D24 · 40 COMBAT ZONES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFarmingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.4)'};background:${isAct ? '#047857' : '#090d14'};color:${isAct ? '#ffffff' : '#a7f3d0'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          24 FIELD HUNTING AREAS + 16 MULTI-FLOOR DUNGEONS · XP/HR · ADENA/HR · SPOIL GRADE
        </span>
      </div>

      ${topHotspots.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px">
          ${topHotspots.map(hp => {
            const zObj = zoneById[hp.zone_id];
            const locStr = (zObj && zObj.loc_coord) || '72986:113330';
            const isDng = hp.zone_kind === 'dungeon';
            const jumpJs = isDng
              ? `openDungeonSubMap('${escapeHtml(hp.zone_id)}', 'B1')`
              : `focusFieldTacticalBlueprint('${escapeHtml(hp.zone_id)}', '${escapeHtml(locStr)}')`;
            const shortName = hp.zone_name.split('(')[0].trim();
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${isDng ? '#c084fc' : '#34d399'};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:900;color:#f8fafc">${isDng ? '🕳️' : '🏕️'} ${escapeHtml(shortName)}</span>
                    <span class="mono" style="font-size:8.4px;font-weight:900;color:#fde047">${escapeHtml(hp.spoil_grade)}</span>
                  </div>
                  <div class="mono" style="font-size:8.3px;color:#6ee7b7;margin-top:1px">
                    ⚡ XP Idx: ${hp.xp_per_hour_index} · 💰 Adena Idx: ${hp.adena_per_hour_index} · ${escapeHtml(hp.recommended_party_mode)}
                  </div>
                  <div style="font-size:8.2px;color:#cbd5e1;margin-top:1px">
                    💎 ${escapeHtml(hp.key_spoil_material)} · ${escapeHtml(hp.elemental_weakness)}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#c084fc' : '#34d399'};background:${isDng ? '#3b0764' : '#064e3b'};color:#ffffff;font-size:8.4px;font-weight:800;cursor:pointer;text-align:left">
                  ${isDng ? '🕳️ Open Dungeon Sub-Map' : '🏕️ Open Field Blueprint'}: ${escapeHtml(shortName)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSiegeDomainBarHtml(tatlas) {
  const domains = (tatlas && tatlas.castle_siege_domains) || [];
  if (!domains.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curDomId = ATLAS_SIEGE_DOMAIN_ID || ATLAS_STATE_STORE.siegeDomainId || 'All';
  const activeDom = domains.find(d => d.domain_id === curDomId || d.stronghold_zone_id === curDomId) || domains[0];

  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏰 All 8 Domains' }
  ];

  const vassalTowns = (activeDom.vassal_town_ids || []).map(tid => zoneById[tid] || { zone_id: tid, name: tid });
  const vassalFields = (activeDom.vassal_hunting_zone_ids || []).map(fid => zoneById[fid] || { zone_id: fid, name: fid });

  return `
    <div id="atlasCastleSiegeDomainBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#23131b;border:1px solid rgba(251,146,60,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fb923c">🏰 CASTLE SIEGE, TERRITORY TAX &amp; CLAN HALL DOMAIN OVERLAY (D25 · 8 STRONGHOLDS):</span>
          ${modePills.map(mp => {
            const isAct = curDomId === mp.id;
            return `
              <button type="button" onclick="setAtlasSiegeDomain('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#fed7aa'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
          <select aria-label="Select Individual Castle Siege or Clan Hall Domain" onchange="setAtlasSiegeDomain(this.value)"
                  style="height:24px;padding:1px 7px;border-radius:6px;background:#090d14;color:#fde047;border:1px solid rgba(251,146,60,0.55);font-size:9.6px;font-weight:800;cursor:pointer">
            <option value="All" ${curDomId === 'All' ? 'selected' : ''}>— Inspect Individual Stronghold (8) —</option>
            ${domains.map(d => {
              const sel = (d.domain_id === curDomId || d.stronghold_zone_id === curDomId) ? 'selected' : '';
              return `<option value="${escapeHtml(d.domain_id)}" ${sel}>[${escapeHtml(d.domain_tier)} · ${d.tax_rate_pct}% Tax] ${escapeHtml(d.stronghold_name)}</option>`;
            }).join('')}
          </select>
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          STRONGHOLD ➔ VASSAL TOWNS &amp; TAXED HUNTING GROUNDS · MANOR CROPS &amp; SIEGE WINDOWS
        </span>
      </div>

      ${curDomId !== 'Off' ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px;align-items:stretch">
          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #fb923c;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#fb923c">
                🛡️ ${escapeHtml(activeDom.domain_tier)} · ${activeDom.tax_rate_pct}% TERRITORY TAX
              </div>
              <div style="font-size:9.8px;font-weight:900;color:#f8fafc;margin-top:2px">${escapeHtml(activeDom.stronghold_name)}</div>
              <div class="mono" style="font-size:8.3px;color:#cbd5e1;margin-top:1px">
                ⏰ ${escapeHtml(activeDom.siege_window_utc)} · Altar loc=${escapeHtml(activeDom.artifact_altar_loc)}
              </div>
              <div style="font-size:8.2px;color:#fde68a;margin-top:1px">
                🌾 Manor: ${escapeHtml(activeDom.manor_specialty_crop)} · 👑 ${escapeHtml(activeDom.ruling_npc_faction)}
              </div>
            </div>
            <button type="button" onclick="focusFortressBlueprint('${escapeHtml(activeDom.stronghold_zone_id)}', '${escapeHtml(activeDom.artifact_altar_loc)}')"
                    style="padding:3px 7px;border-radius:5px;border:1px solid #fb923c;background:#7c2d12;color:#ffedd5;font-size:8.6px;font-weight:900;cursor:pointer;text-align:left">
              🏰 Open Stronghold Tactical Blueprint (4.8×): ${escapeHtml(activeDom.stronghold_name.split('(')[0].trim())}
            </button>
          </div>

          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #fde047;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#fde047">
                🏘️ VASSAL TAX TOWNS (${vassalTowns.length}) · ${activeDom.tax_rate_pct}% SHOP &amp; ANVIL TARIFF
              </div>
              <div style="font-size:8.6px;color:#e2e8f0;margin-top:2px">
                ${vassalTowns.map(vt => escapeHtml((vt.name || vt.zone_id).split('(')[0].trim())).join(' · ')}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${vassalTowns.map(vt => {
                const tNodeId = vt.studio_node_id || vt.zone_id;
                const tShort = (vt.name || vt.zone_id).split('(')[0].trim();
                return `
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(tNodeId)}', '${escapeHtml(vt.loc_coord || '')}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8.3px;font-weight:800;cursor:pointer">
                    🏘️ Warp ${escapeHtml(tShort)} (5.2×)
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div style="padding:6px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid #34d399;display:flex;flex-direction:column;justify-content:space-between;gap:4px">
            <div>
              <div class="mono" style="font-size:8.6px;font-weight:900;color:#34d399">
                🏕️ TAXED HUNTING &amp; MANOR GROUNDS (${vassalFields.length})
              </div>
              <div style="font-size:8.6px;color:#e2e8f0;margin-top:2px">
                ${vassalFields.map(vf => escapeHtml((vf.name || vf.zone_id).split('(')[0].trim())).join(' · ')}
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${vassalFields.slice(0, 3).map(vf => {
                const fShort = (vf.name || vf.zone_id).split('(')[0].trim();
                return `
                  <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(vf.zone_id)}', '${escapeHtml(vf.loc_coord || '')}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:8.3px;font-weight:800;cursor:pointer">
                    🏕️ ${escapeHtml(fShort)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasBossRadarBarHtml(tatlas) {
  const radarList = (tatlas && tatlas.world_boss_spawn_radar) || [];
  if (!radarList.length) return '';

  const curMode = ATLAS_BOSS_RADAR_MODE || ATLAS_STATE_STORE.bossRadarMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '📡 All 32 Bosses' },
    { id: 'DungeonMVP', label: '👑 16 Dungeon MVPs (B3/3F)' },
    { id: 'OverlandRaid', label: '🔥 16 Overland Raids & Mini-Bosses' }
  ];

  const filteredBosses = curMode === 'Off'
    ? []
    : (curMode === 'DungeonMVP'
      ? radarList.filter(b => b.dungeon_id && b.boss_category === 'MVP')
      : (curMode === 'OverlandRaid'
        ? radarList.filter(b => !b.dungeon_id)
        : radarList));

  const featuredCards = filteredBosses.slice(0, 4);

  return `
    <div id="atlasWorldBossRadarBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e112a;border:1px solid rgba(244,63,94,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fb7185">📡 MVP &amp; RAID RESPAWN RADAR / COMMAND-CHANNEL TELEMETRY (D26 · 32 BOSSES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasBossRadarMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#be123c' : '#090d14'};color:${isAct ? '#ffffff' : '#fecdd3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          16 B3/3F SANCTUM MVPS + 16 OVERLAND/FORTRESS RAIDS · COMMAND CHANNEL &amp; RESPAWN WINDOWS
        </span>
      </div>

      ${featuredCards.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px">
          ${featuredCards.map(b => {
            const isDng = Boolean(b.dungeon_id);
            const jumpJs = isDng
              ? `openDungeonSubMap('${escapeHtml(b.dungeon_id)}', '${escapeHtml(b.floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(b.zone_id)}', '${escapeHtml(b.loc)}')`;
            const statusCol = b.radar_status === 'Window Open'
              ? '#34d399'
              : (b.radar_status === 'Sanctum Active' ? '#fde047' : '#fb923c');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${isDng ? '#f43f5e' : '#f97316'};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">${isDng ? '👑' : '🔥'} ${escapeHtml(b.boss_name.slice(0, 32))} (Lv.${b.level})</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${statusCol}">${escapeHtml(b.radar_status)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#fda4af;margin-top:1px">
                    ⏱️ ${escapeHtml(b.respawn_window)} · 👥 ${escapeHtml(b.command_channel_size)}
                  </div>
                  <div style="font-size:8.1px;color:#cbd5e1;margin-top:1px">
                    💎 ${escapeHtml(b.top_reward_drop)} · loc=${escapeHtml(b.loc)}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${isDng ? '#f43f5e' : '#fb923c'};background:${isDng ? '#881337' : '#7c2d12'};color:#ffffff;font-size:8.3px;font-weight:800;cursor:pointer;text-align:left">
                  ${isDng ? `🕳️ Teleport to ${escapeHtml(b.floor_id)} Boss Sanctum` : `⚔️ Teleport to Raid loc=${escapeHtml(b.loc)}`}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSevenSealsBarHtml(tatlas) {
  const ssList = (tatlas && tatlas.seven_seals_competitions) || [];
  if (!ssList.length) return '';

  const curMode = ATLAS_SEVEN_SEALS_MODE || ATLAS_STATE_STORE.sevenSealsMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚖️ All 16 Sanctums' },
    { id: 'Lords_of_Dawn', label: '☀️ Lords of Dawn' },
    { id: 'Revolutionaries_of_Dusk', label: '🌙 Revolutionaries of Dusk' },
    { id: 'Blacksmith_of_Mammon', label: '⚒️ Blacksmith of Mammon' },
    { id: 'Merchant_of_Mammon', label: '💰 Merchant of Mammon' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'Lords_of_Dawn' || curMode === 'Revolutionaries_of_Dusk'
      ? ssList.filter(s => s.controlling_cabal === curMode)
      : (curMode === 'Blacksmith_of_Mammon' || curMode === 'Merchant_of_Mammon'
        ? ssList.filter(s => s.mammon_visitor_npc === curMode)
        : ssList));

  const featuredSanctums = filteredSanctums.slice(0, 4);

  return `
    <div id="atlasSevenSealsMammonBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1a1528;border:1px solid rgba(168,85,247,0.48)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">⚖️ SEVEN-SEALS DUSK VS. DAWN &amp; MAMMON ROTATION (D27 · 16 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSevenSealsMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(168,85,247,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#e9d5ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          8 SEAL CATACOMBS + 8 ASCENDANT TOWERS · ANCIENT ADENA/HR &amp; MAMMON FLOOR TELEPORT
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isDawn = s.controlling_cabal === 'Lords_of_Dawn';
            const isDusk = s.controlling_cabal === 'Revolutionaries_of_Dusk';
            const cabalCol = isDawn ? '#fde047' : (isDusk ? '#c084fc' : '#38bdf8');
            const isSmith = s.mammon_visitor_npc === 'Blacksmith_of_Mammon';
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cabalCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">${s.sanctum_type === 'Seal_Catacomb' ? '🕳️' : '🗼'} ${escapeHtml(s.dungeon_name.split('(')[0].trim())}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cabalCol}">${escapeHtml(s.controlling_cabal)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#e9d5ff;margin-top:1px">
                    🔱 ${escapeHtml(s.seal_allegiance)} · 💎 ${escapeHtml(s.seal_stone_tier)} · ${s.ancient_adena_per_hour.toLocaleString()} AA/hr
                  </div>
                  <div style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    ${isSmith ? '⚒️' : '💰'} <strong>${escapeHtml(s.mammon_visitor_npc)} (${escapeHtml(s.mammon_active_floor_id)}):</strong> ${escapeHtml(s.mammon_specialty_service)}
                  </div>
                </div>
                <button type="button" onclick="openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.mammon_active_floor_id)}')"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${cabalCol};background:#3b0764;color:#ffffff;font-size:8.3px;font-weight:800;cursor:pointer;text-align:left">
                  ${isSmith ? '⚒️' : '💰'} Teleport to ${escapeHtml(s.mammon_visitor_npc)} on Floor ${escapeHtml(s.mammon_active_floor_id)}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasManorEconomyBarHtml(tatlas) {
  const routes = (tatlas && tatlas.manor_economy_routes) || [];
  if (!routes.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_MANOR_MODE || ATLAS_STATE_STORE.manorMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌾 All 15 Town Manors' },
    { id: 'Low_Patrolled', label: '🛡️ Low-Risk Patrolled' },
    { id: 'High_Frontier_Ambush', label: '🔥 Frontier High-Yield' }
  ];

  const filteredRoutes = curMode === 'Off'
    ? []
    : (curMode === 'Low_Patrolled'
      ? routes.filter(r => r.caravan_route_risk === 'Low_Patrolled')
      : (curMode === 'High_Frontier_Ambush'
        ? routes.filter(r => r.caravan_route_risk === 'High_Frontier_Ambush' || r.caravan_route_risk === 'Medium_Bandit_Road')
        : routes));

  const featuredManors = filteredRoutes.slice(0, 4);

  return `
    <div id="atlasManorEconomyBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#162013;border:1px solid rgba(132,204,22,0.48)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bef264">🌾 15-TOWN MANOR SEED/CROP &amp; CARAVAN TRADE ECONOMY (D28 · 15 MANORS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasManorMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(132,204,22,0.45)'};background:${isAct ? '#3f6212' : '#090d14'};color:${isAct ? '#ffffff' : '#d9f99d'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          TOWN MANOR STEWARD ➔ HUNTING FIELD CROP HARVEST ➔ PARENT STRONGHOLD VAULT
        </span>
      </div>

      ${featuredManors.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredManors.map(r => {
            const tZone = zoneById[r.town_zone_id] || {};
            const fZone = zoneById[r.harvest_field_zone_id] || {};
            const sZone = zoneById[r.parent_stronghold_zone_id] || {};
            const tNode = tZone.studio_node_id || r.town_zone_id;
            const riskCol = r.caravan_route_risk === 'Low_Patrolled'
              ? '#4ade80'
              : (r.caravan_route_risk === 'Medium_Bandit_Road' ? '#fde047' : '#fb923c');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${riskCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.4px;font-weight:900;color:#f8fafc">🌾 ${escapeHtml(r.town_name.split('(')[0].trim())}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${riskCol}">${escapeHtml(r.caravan_route_risk)}</span>
                  </div>
                  <div class="mono" style="font-size:8.2px;color:#bef264;margin-top:1px">
                    🌱 ${escapeHtml(r.seed_name)} ➔ ${escapeHtml(r.crop_name)} (${r.daily_crop_quota.toLocaleString()}/day)
                  </div>
                  <div style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    ⚒️ Reward: <strong>${escapeHtml(r.procure_reward_material)}</strong> · Field (${escapeHtml(r.harvest_level_band)})
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px">
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(tZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #fde047;background:#713f12;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    🏘️ Town
                  </button>
                  <button type="button" onclick="focusFieldTacticalBlueprint('${escapeHtml(r.harvest_field_zone_id)}', '${escapeHtml(fZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #4ade80;background:#14532d;color:#dcfce7;font-size:8px;font-weight:800;cursor:pointer">
                    🏕️ Harvest Field
                  </button>
                  <button type="button" onclick="focusFortressBlueprint('${escapeHtml(r.parent_stronghold_zone_id)}', '${escapeHtml(sZone.loc_coord || '')}')"
                          style="padding:2px 5px;border-radius:4px;border:1px solid #fb923c;background:#7c2d12;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    🏰 Castle Vault
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasOlympiadNetworkBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.noblesse_olympiad_network) || [];
  if (!nodes.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_OLYMPIAD_MODE || ATLAS_STATE_STORE.olympiadMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏆 All 21 Nodes' },
    { id: 'Subclass_Mimir_Sanctum', label: '🧪 Subclass Sanctums' },
    { id: 'Noblesse_Barakiel_Shrine', label: '👑 Noblesse Shrines' },
    { id: 'Olympiad_Monument', label: '🏛️ 15 Olympiad Monuments' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.node_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.node_category === 'Subclass_Mimir_Sanctum').slice(0, 1),
        ...nodes.filter(n => n.node_category === 'Noblesse_Barakiel_Shrine').slice(0, 1),
        ...nodes.filter(n => n.node_category === 'Olympiad_Monument').slice(0, 2)
      ]
    : filteredNodes.slice(0, 4);

  return `
    <div id="atlasOlympiadNetworkBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#231b10;border:1px solid rgba(250,204,21,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🏆 SUBCLASS, NOBLESSE &amp; GRAND OLYMPIAD MONUMENT NETWORK (D29 · 21 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasOlympiadMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#a16207' : '#090d14'};color:${isAct ? '#ffffff' : '#fef08a'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          15 TOWN HERO MONUMENTS + 3 MIMIR SUBCLASS SANCTUMS (B3/3F) + 3 BARAKIEL NOBLESSE SHRINES
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const zObj = zoneById[n.zone_id] || {};
            const tNode = zObj.studio_node_id || n.zone_id;
            const isSub = n.node_category === 'Subclass_Mimir_Sanctum';
            const isNob = n.node_category === 'Noblesse_Barakiel_Shrine';
            const catCol = isSub ? '#c084fc' : (isNob ? '#38bdf8' : '#fde047');
            const catIcon = isSub ? '🧪' : (isNob ? '👑' : '🏛️');
            const jumpAction = n.dungeon_id
              ? `openDungeonSubMap('${escapeHtml(n.dungeon_id)}', '${escapeHtml(n.floor_id || '3F')}')`
              : (isNob
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusTownStreetBlueprint('${escapeHtml(tNode)}', '${escapeHtml(n.loc)}')`);
            const jumpLabel = n.dungeon_id
              ? `🧪 Warp to Floor ${escapeHtml(n.floor_id || '3F')} Sanctum`
              : (isNob ? '👑 Zoom to Noblesse Field Shrine (4.8×)' : '🏛️ Zoom to Town Hero Monument (5.2×)');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">Lv.${n.min_level}+</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    👤 ${escapeHtml(n.npc_steward_name)} · ${escapeHtml(n.ritual_requirement.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🎁 <strong>Reward:</strong> ${escapeHtml(n.heroic_reward)}
                  </div>
                </div>
                <button type="button" onclick="${jumpAction}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#422006;color:#fef9c3;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${jumpLabel}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTransitLinesBarHtml(tatlas) {
  const lines = (tatlas && tatlas.intercontinental_transit_lines) || [];
  if (!lines.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_TRANSIT_MODE || ATLAS_STATE_STORE.transitMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⛵ All 18 Transit Lines' },
    { id: 'Maritime_Ship', label: '⛵ 6 Maritime Ships' },
    { id: 'Brass_Airship', label: '飞 6 Brass Airships' },
    { id: 'Gatekeeper_Trunk', label: '🌀 6 Gatekeeper Trunks' }
  ];

  const filteredLines = curMode === 'Off'
    ? []
    : (curMode === 'All' ? lines : lines.filter(l => l.transit_mode === curMode));

  const featuredLines = curMode === 'All'
    ? [
        ...lines.filter(l => l.transit_mode === 'Maritime_Ship').slice(0, 2),
        ...lines.filter(l => l.transit_mode === 'Brass_Airship').slice(0, 1),
        ...lines.filter(l => l.transit_mode === 'Gatekeeper_Trunk').slice(0, 1)
      ]
    : filteredLines.slice(0, 4);

  const buildZoneJumpJs = (zid, loc) => {
    const z = zoneById[zid] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || zid)}', '${escapeHtml(loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(zid)}', '${escapeHtml(loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(zid)}', '${escapeHtml(loc)}')`;
  };

  return `
    <div id="atlasTransitLinesBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0e1d2b;border:1px solid rgba(56,189,248,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#7dd3fc">⛵ MARITIME SHIP, AIRSHIP &amp; GATEKEEPER TRANSIT SELECTOR (D30 · 18 LINES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTransitMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARITIME HARBOR SHIPS + 6 SKY-DOCK BRASS AIRSHIPS + 6 CAPITAL GATEKEEPER TRUNKS
        </span>
      </div>

      ${featuredLines.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredLines.map(l => {
            const isShip = l.transit_mode === 'Maritime_Ship';
            const isAir = l.transit_mode === 'Brass_Airship';
            const modeCol = isShip ? '#38bdf8' : (isAir ? '#f59e0b' : '#c084fc');
            const modeIcon = isShip ? '⛵' : (isAir ? '飞' : '🌀');
            const origJump = buildZoneJumpJs(l.origin_zone_id, l.origin_loc);
            const destJump = buildZoneJumpJs(l.destination_zone_id, l.destination_loc);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${modeCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${modeIcon} ${escapeHtml(l.route_name.slice(0, 42))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${modeCol}">${escapeHtml(l.departure_interval)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🧭 ${escapeHtml(l.vessel_or_gatekeeper_name)} · Fare: ${l.ticket_cost_adena.toLocaleString()} Adena
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">
                  <button type="button" onclick="${origJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid ${modeCol};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ⚓ Origin Dock/Town
                  </button>
                  <button type="button" onclick="${destJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#1e3a8a;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    🎯 Destination Dock/Town
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSoulCrystalBarHtml(tatlas) {
  const stages = (tatlas && tatlas.soul_crystal_resonance_stages) || [];
  if (!stages.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_SOUL_CRYSTAL_MODE || ATLAS_STATE_STORE.soulCrystalMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💎 All 18 Stages' },
    { id: 'Crimson_Red', label: '🔴 Crimson Red' },
    { id: 'Verdant_Green', label: '🟢 Verdant Green' },
    { id: 'Azure_Blue', label: '🔵 Azure Blue' },
    { id: 'Stage_11_to_13_S_Grade_Boss', label: '👑 Stage 11–13 Boss Sanctums' }
  ];

  const filteredStages = curMode === 'Off'
    ? []
    : (curMode === 'All'
      ? stages
      : (curMode === 'Stage_11_to_13_S_Grade_Boss'
        ? stages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss')
        : stages.filter(s => s.crystal_color === curMode)));

  const featuredStages = curMode === 'All'
    ? [
        ...stages.filter(s => s.crystal_color === 'Crimson_Red').slice(0, 1),
        ...stages.filter(s => s.crystal_color === 'Verdant_Green').slice(0, 1),
        ...stages.filter(s => s.crystal_color === 'Azure_Blue').slice(0, 1),
        ...stages.filter(s => s.stage_band === 'Stage_11_to_13_S_Grade_Boss').slice(0, 1)
      ]
    : filteredStages.slice(0, 4);

  return `
    <div id="atlasSoulCrystalBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#201228;border:1px solid rgba(232,121,249,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f5d0fe">💎 SOUL CRYSTAL (SA) STAGE 1–13 RESONANCE &amp; BOSS ABSORPTION MATRIX (D31 · 18 STAGES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSoulCrystalMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(232,121,249,0.45)'};background:${isAct ? '#86198f' : '#090d14'};color:${isAct ? '#ffffff' : '#f5d0fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 CRIMSON RED + 6 VERDANT GREEN + 6 AZURE BLUE · STAGE 1–13 SPECIAL ABILITIES &amp; BOSS ABSORPTION
        </span>
      </div>

      ${featuredStages.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredStages.map(s => {
            const vZone = zoneById[s.vendor_town_zone_id] || {};
            const vNode = vZone.studio_node_id || s.vendor_town_zone_id;
            const vLoc = vZone.loc_coord || '-84120:243500';
            const isRed = s.crystal_color === 'Crimson_Red';
            const isGreen = s.crystal_color === 'Verdant_Green';
            const colHex = isRed ? '#f87171' : (isGreen ? '#4ade80' : '#38bdf8');
            const colIcon = isRed ? '🔴' : (isGreen ? '🟢' : '🔵');
            const absJump = s.absorption_dungeon_id
              ? `openDungeonSubMap('${escapeHtml(s.absorption_dungeon_id)}', '${escapeHtml(s.absorption_floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(s.absorption_zone_id)}', '${escapeHtml(s.absorption_loc)}')`;
            const absLabel = s.absorption_dungeon_id
              ? `👑 Warp to ${escapeHtml(s.absorption_floor_id || 'B3')} Boss Sanctum`
              : `⚔️ Zoom to Absorption Field (4.8×)`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${colHex};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${colIcon} ${escapeHtml(s.crystal_stage_id)} [${escapeHtml(s.weapon_grade_unlocked)}]</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${colHex}">${s.resonance_chance_pct}% Absorb</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                    🎯 ${escapeHtml(s.absorption_target_name.slice(0, 52))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✨ <strong>SA:</strong> ${escapeHtml((s.special_abilities || []).join(' · '))}
                  </div>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px">
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(vNode)}', '${escapeHtml(vLoc)}')"
                          style="padding:2px 6px;border-radius:4px;border:1px solid #fde047;background:#4a044e;color:#fef08a;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Town Blacksmith
                  </button>
                  <button type="button" onclick="${absJump}"
                          style="padding:2px 6px;border-radius:4px;border:1px solid ${colHex};background:#1e1b4b;color:#e0e7ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${absLabel}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFishingSanctuaryBarHtml(tatlas) {
  const sanctuaries = (tatlas && tatlas.fishing_guild_sanctuaries) || [];
  if (!sanctuaries.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_FISHING_MODE || ATLAS_STATE_STORE.fishingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎣 All 16 Sanctuaries' },
    { id: 'Maritime_Harbor_Pier', label: '⚓ 6 Maritime Piers' },
    { id: 'Luminous_Night_Lake', label: '🌙 5 Nocturnal Luminous Lakes' },
    { id: 'Thermal_Hot_Spring', label: '♨️ 5 Thermal Hot Springs' }
  ];

  const filteredSanctuaries = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctuaries : sanctuaries.filter(s => s.water_category === curMode));

  const featuredSanctuaries = curMode === 'All'
    ? [
        ...sanctuaries.filter(s => s.water_category === 'Maritime_Harbor_Pier').slice(0, 2),
        ...sanctuaries.filter(s => s.water_category === 'Luminous_Night_Lake').slice(0, 1),
        ...sanctuaries.filter(s => s.water_category === 'Thermal_Hot_Spring').slice(0, 1)
      ]
    : filteredSanctuaries.slice(0, 4);

  const buildSanctuaryJumpJs = (s) => {
    const z = zoneById[s.zone_id] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(s.zone_id)}', '${escapeHtml(s.dock_loc)}')`;
  };

  return `
    <div id="atlasFishingSanctuaryBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0a2229;border:1px solid rgba(45,212,191,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#5eead4">🎣 FISHING GUILD, HOT SPRINGS &amp; LUMINOUS NIGHT-BAIT SANCTUARIES (D32 · 16 SANCTUARIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFishingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(45,212,191,0.45)'};background:${isAct ? '#0f766e' : '#090d14'};color:${isAct ? '#ffffff' : '#99f6e4'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARITIME HARBOR PIERS + 5 NOCTURNAL LUMINOUS LAKES + 5 THERMAL HOT SPRINGS
        </span>
      </div>

      ${featuredSanctuaries.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredSanctuaries.map(s => {
            const isPier = s.water_category === 'Maritime_Harbor_Pier';
            const isLake = s.water_category === 'Luminous_Night_Lake';
            const catCol = isPier ? '#38bdf8' : (isLake ? '#a78bfa' : '#fb923c');
            const catIcon = isPier ? '⚓' : (isLake ? '🌙' : '♨️');
            const jumpJs = buildSanctuaryJumpJs(s);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctuary_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.active_time_window)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#99f6e4;margin-top:1px">
                    👤 ${escapeHtml(s.guild_master_npc)} · Lure: ${escapeHtml(s.recommended_lure.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🎁 <strong>Catch:</strong> ${escapeHtml(s.primary_catch_reward.slice(0, 62))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#134e4a;color:#ccfbf1;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Sanctuary Dock / Pool
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasPvpKarmaBarHtml(tatlas) {
  const hotspots = (tatlas && tatlas.cursed_weapon_pvp_hotspots) || [];
  if (!hotspots.length) return '';
  const allZones = getAllAtlas63Zones(tatlas);
  const zoneById = {};
  allZones.forEach(z => {
    zoneById[z.zone_id] = z;
    if (z.studio_node_id) zoneById[z.studio_node_id] = z;
  });

  const curMode = ATLAS_PVP_KARMA_MODE || ATLAS_STATE_STORE.pvpKarmaMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🩸 All 14 Hotspots' },
    { id: 'Cursed_Weapon_Drop_Zone', label: '🗡️ 5 Zariche & Akamanah Zones' },
    { id: 'Black_Judge_Karma_Sanctuary', label: '⚖️ 5 Black Judge Sanctuaries' },
    { id: 'Coliseum_PvP_Arena', label: '🏟️ 4 Coliseum PvP Arenas' }
  ];

  const filteredHotspots = curMode === 'Off'
    ? []
    : (curMode === 'All' ? hotspots : hotspots.filter(h => h.pvp_category === curMode));

  const featuredHotspots = curMode === 'All'
    ? [
        ...hotspots.filter(h => h.pvp_category === 'Cursed_Weapon_Drop_Zone').slice(0, 2),
        ...hotspots.filter(h => h.pvp_category === 'Black_Judge_Karma_Sanctuary').slice(0, 1),
        ...hotspots.filter(h => h.pvp_category === 'Coliseum_PvP_Arena').slice(0, 1)
      ]
    : filteredHotspots.slice(0, 4);

  const buildHotspotJumpJs = (h) => {
    const z = zoneById[h.zone_id] || {};
    if (z.category === 'starting_town' || z.category === 'castle_or_hub_town') {
      return `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || h.zone_id)}', '${escapeHtml(h.loc)}')`;
    }
    if (z.category === 'harbor' || z.category === 'clan_hall' || z.category === 'fortress') {
      return `focusFortressBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`;
    }
    return `focusFieldTacticalBlueprint('${escapeHtml(h.zone_id)}', '${escapeHtml(h.loc)}')`;
  };

  return `
    <div id="atlasPvpKarmaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#2a0a12;border:1px solid rgba(244,63,94,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fda4af">🩸 CURSED WEAPON (ZARICHE &amp; AKAMANAH), PK KARMA &amp; PVP ARENA OVERLAY (D33 · 14 HOTSPOTS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasPvpKarmaMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#9f1239' : '#090d14'};color:${isAct ? '#ffffff' : '#fecdd3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 ZARICHE/AKAMANAH DROPS + 5 BLACK JUDGE SANCTUARIES + 4 COLISEUM ARENAS
        </span>
      </div>

      ${featuredHotspots.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredHotspots.map(h => {
            const isCursed = h.pvp_category === 'Cursed_Weapon_Drop_Zone';
            const isJudge = h.pvp_category === 'Black_Judge_Karma_Sanctuary';
            const catCol = isCursed ? '#ef4444' : (isJudge ? '#c084fc' : '#f59e0b');
            const catIcon = isCursed ? '🗡️' : (isJudge ? '⚖️' : '🏟️');
            const jumpJs = buildHotspotJumpJs(h);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(h.hotspot_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(h.recommended_level_band)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fecdd3;margin-top:1px">
                    🎯 ${escapeHtml(h.featured_artifact_or_npc.slice(0, 48))} · ${escapeHtml(h.ruleset_tag)}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🛡️ ${escapeHtml(h.tactical_note.slice(0, 68))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#4c0519;color:#ffe4e6;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Cursed Drop / Black Judge / PvP Ring
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasRiftSepulcherBarHtml(tatlas) {
  const portals = (tatlas && tatlas.dimensional_rift_sepulchers) || [];
  if (!portals.length) return '';

  const curMode = ATLAS_RIFT_SEPULCHER_MODE || ATLAS_STATE_STORE.riftSepulcherMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌀 All 16 Portals' },
    { id: 'Dimensional_Rift', label: '🌌 6 Dimensional Rifts' },
    { id: 'Four_Sepulchers', label: '⚰️ 6 Four Sepulchers' },
    { id: 'Key_Gated_Chapel', label: '🗝️ 4 Key-Gated Chapels' }
  ];

  const filteredPortals = curMode === 'Off'
    ? []
    : (curMode === 'All' ? portals : portals.filter(p => p.instance_category === curMode));

  const featuredPortals = curMode === 'All'
    ? [
        ...portals.filter(p => p.instance_category === 'Dimensional_Rift').slice(0, 2),
        ...portals.filter(p => p.instance_category === 'Four_Sepulchers').slice(0, 1),
        ...portals.filter(p => p.instance_category === 'Key_Gated_Chapel').slice(0, 1)
      ]
    : filteredPortals.slice(0, 4);

  return `
    <div id="atlasRiftSepulcherBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#13112b;border:1px solid rgba(129,140,248,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#c7d2fe">🌀 DIMENSIONAL RIFT, FOUR SEPULCHERS &amp; KEY-GATED ENDGAME SANCTUM MATRIX (D34 · 16 PORTALS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasRiftSepulcherMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(129,140,248,0.45)'};background:${isAct ? '#3730a3' : '#090d14'};color:${isAct ? '#ffffff' : '#e0e7ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 DIMENSIONAL RIFTS (RECRUIT..HERO) + 6 FOUR SEPULCHERS + 4 KEY-GATED PAGAN/NORNIL CHAPELS
        </span>
      </div>

      ${featuredPortals.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px">
          ${featuredPortals.map(p => {
            const isRift = p.instance_category === 'Dimensional_Rift';
            const isSep = p.instance_category === 'Four_Sepulchers';
            const catCol = isRift ? '#818cf8' : (isSep ? '#f472b6' : '#facc15');
            const catIcon = isRift ? '🌌' : (isSep ? '⚰️' : '🗝️');
            const jumpJs = `openDungeonSubMap('${escapeHtml(p.dungeon_id)}', '${escapeHtml(p.floor_id || 'B3')}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(p.portal_name.slice(0, 38))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">[${escapeHtml(p.floor_id)}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#c7d2fe;margin-top:1px">
                    🔑 ${escapeHtml(p.entry_key_or_token.slice(0, 46))} · ${escapeHtml(p.cycle_window.slice(0, 28))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 <strong>Reward:</strong> ${escapeHtml(p.signature_reward.slice(0, 62))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#1e1b4b;color:#e0e7ff;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Teleport to ${escapeHtml(p.floor_id)} Sanctum Floor
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasAugmentDyeBarHtml(tatlas) {
  const hubs = (tatlas && tatlas.weapon_augmentation_dye_hubs) || [];
  if (!hubs.length) return '';

  const curMode = ATLAS_AUGMENT_DYE_MODE || ATLAS_STATE_STORE.augmentDyeMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🔮 All 15 Hubs' },
    { id: 'Top_High_Life_Stone', label: '💎 Top/High-Grade Life Stones' },
    { id: 'Augment_Anvils', label: '⚡ Augment Anvils' },
    { id: 'Symbol_Dye_Parlors', label: '🎨 Symbol Dye Parlors' }
  ];

  const filteredHubs = curMode === 'Off'
    ? []
    : (curMode === 'Top_High_Life_Stone'
      ? hubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone' || h.life_stone_tier === 'High_Grade_Life_Stone')
      : hubs);

  const featuredHubs = curMode === 'All'
    ? [
        ...hubs.filter(h => h.life_stone_tier === 'Top_Grade_Life_Stone').slice(0, 2),
        ...hubs.filter(h => h.life_stone_tier === 'High_Grade_Life_Stone').slice(0, 1),
        ...hubs.filter(h => h.life_stone_tier === 'Mid_Grade_Life_Stone').slice(0, 1)
      ]
    : filteredHubs.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasAugmentDyeBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f122b;border:1px solid rgba(192,132,252,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">🔮 LIFE STONE WEAPON AUGMENTATION &amp; SYMBOL MAKER DYE PARLOR MATRIX (D35 · 15 TOWN HUBS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasAugmentDyeMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          15 TOWN REFINER ANVILS + 15 SYMBOL MAKER DYE PARLORS (+4/-4 STAT TATTOOS &amp; ITEM SKILLS)
        </span>
      </div>

      ${featuredHubs.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredHubs.map(h => {
            const isTop = h.life_stone_tier === 'Top_Grade_Life_Stone';
            const isHigh = h.life_stone_tier === 'High_Grade_Life_Stone';
            const tierCol = isTop ? '#f43f5e' : (isHigh ? '#c084fc' : '#38bdf8');
            const tz = byZid[h.town_zone_id] || {};
            const townNode = tz.studio_node_id || h.town_zone_id.replace('zone-', '');
            const townJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(h.anvil_loc)}')`;
            const dropJumpJs = `focusFieldTacticalBlueprint('${escapeHtml(h.life_stone_drop_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🔮 ${escapeHtml(h.town_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(h.life_stone_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    ⚒️ ${escapeHtml(h.blacksmith_refiner_npc)} · 🎨 ${escapeHtml(h.symbol_maker_npc)} (${escapeHtml(h.gemstone_cost)})
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml((h.signature_augment_skills || [])[0] || '')} · 🎨 ${escapeHtml((h.signature_dye_combos || [])[0] || '')}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${townJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Town Refiner/Dye
                  </button>
                  <button type="button" onclick="${dropJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    💎 Life Stone Field
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCompanionMountBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.companion_mount_sanctuaries) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_COMPANION_MOUNT_MODE || ATLAS_STATE_STORE.companionMountMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🐉 All 12 Nodes' },
    { id: 'Pet_Manager_Kennel', label: '🐾 4 Pet Kennels' },
    { id: 'Hatchling_Strider_Sanctum', label: '🦎 4 Strider Sanctums' },
    { id: 'Castle_Wyvern_Roost', label: '🐉 4 Castle Wyvern Roosts' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.mount_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.mount_category === 'Pet_Manager_Kennel').slice(0, 1),
        ...nodes.filter(n => n.mount_category === 'Hatchling_Strider_Sanctum').slice(0, 2),
        ...nodes.filter(n => n.mount_category === 'Castle_Wyvern_Roost').slice(0, 1)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasCompanionMountBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0b241c;border:1px solid rgba(52,211,153,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a7f3d0">🐉 PET, STRIDER &amp; CASTLE WYVERN MOUNT SANCTUARY OVERLAY (D36 · 12 SANCTUARIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCompanionMountMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#065f46' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 TOWN PET KENNELS + 4 HATCHLING/STRIDER GROVES + 4 SOVEREIGN CASTLE WYVERN ROOSTS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isPet = n.mount_category === 'Pet_Manager_Kennel';
            const isStrider = n.mount_category === 'Hatchling_Strider_Sanctum';
            const catCol = isPet ? '#38bdf8' : (isStrider ? '#34d399' : '#f59e0b');
            const catIcon = isPet ? '🐾' : (isStrider ? '🦎' : '🐉');
            const z = byZid[n.zone_id] || {};
            const jumpJs = isPet
              ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
              : (isStrider
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">Lv.${n.evolution_level_req}+</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    👤 ${escapeHtml(n.steward_npc_name)} · ${escapeHtml(n.companion_species.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 ${escapeHtml(n.tactical_benefit.slice(0, 66))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#064e3b;color:#ecfdf5;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Kennel / Strider Grove / Wyvern Roost
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasClanAcademyBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.clan_reputation_academies) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_CLAN_ACADEMY_MODE || ATLAS_STATE_STORE.clanAcademyMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🛡️ All 14 Clan Nodes' },
    { id: 'Clan_Academy_Hall', label: '🎓 5 Clan Academies' },
    { id: 'Clan_Ambition_Altar', label: '⚔️ 5 Clan Lv.5–8 Ambition Altars' },
    { id: 'Pledge_Skill_Sanctum', label: '👑 4 Pledge Skill Sanctums' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.pledge_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.pledge_category === 'Clan_Academy_Hall').slice(0, 2),
        ...nodes.filter(n => n.pledge_category === 'Clan_Ambition_Altar').slice(0, 1),
        ...nodes.filter(n => n.pledge_category === 'Pledge_Skill_Sanctum').slice(0, 1)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasClanAcademyBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e160d;border:1px solid rgba(251,191,36,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde68a">🛡️ CLAN REPUTATION, ACADEMY &amp; PLEDGE SKILL ALTAR MATRIX (D37 · 14 CLAN NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasClanAcademyMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,191,36,0.45)'};background:${isAct ? '#b45309' : '#090d14'};color:${isAct ? '#ffffff' : '#fef3c7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 CLAN OATH ACADEMIES + 5 CLAN LV.5–8 AMBITION ALTARS + 4 APELLA &amp; PLEDGE SKILL SANCTUMS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isAcad = n.pledge_category === 'Clan_Academy_Hall';
            const isAmb = n.pledge_category === 'Clan_Ambition_Altar';
            const catCol = isAcad ? '#38bdf8' : (isAmb ? '#f97316' : '#facc15');
            const catIcon = isAcad ? '🎓' : (isAmb ? '⚔️' : '👑');
            const z = byZid[n.zone_id] || {};
            const isTownZone = String(n.zone_id || '').startsWith('zone-town-');
            const isFieldZone = String(n.zone_id || '').startsWith('zone-field-');
            const jumpJs = isTownZone
              ? `focusTownStreetBlueprint('${escapeHtml(z.studio_node_id || n.zone_id.replace('zone-', ''))}', '${escapeHtml(n.loc)}')`
              : (isFieldZone
                ? `focusFieldTacticalBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`
                : `focusFortressBlueprint('${escapeHtml(n.zone_id)}', '${escapeHtml(n.loc)}')`);
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(n.node_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(n.clan_level_tier)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    👤 ${escapeHtml(n.high_prefect_or_grand_master_npc)} · 💎 ${escapeHtml(n.crp_yield_or_cost.slice(0, 38))}
                  </div>
                  <div style="font-size:8px;color:#bfdbfe;margin-top:1px">
                    🛡️ ${escapeHtml(((n.unlocked_pledge_benefits || [])[0] || '').slice(0, 64))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${catCol};background:#451a03;color:#fef3c7;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  ${catIcon} Jump to Grand Master Hall / Ambition Altar
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasHerbBiomeBarHtml(tatlas) {
  const biomes = (tatlas && tatlas.field_herb_elemental_biomes) || [];
  if (!biomes.length) return '';

  const curMode = ATLAS_HERB_BIOME_MODE || ATLAS_STATE_STORE.herbBiomeMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌿 All 24 Field Biomes' },
    { id: 'S_Tier_Zero_Downtime', label: '🧪 S-Tier Zero-Downtime Herbs' },
    { id: 'A_Tier_Mystic_Mana_Rich', label: '💧🔮 A-Tier Mystic Mana Herbs' },
    { id: 'By_Elemental_Weakness', label: '🔥💧🌪️🪨 By Elemental Weakness' }
  ];

  const filteredBiomes = curMode === 'Off'
    ? []
    : (curMode === 'S_Tier_Zero_Downtime' || curMode === 'A_Tier_Mystic_Mana_Rich'
      ? biomes.filter(b => b.herb_drop_tier === curMode)
      : biomes);

  const featuredBiomes = filteredBiomes.slice(0, 4);

  const elemColMap = {
    Fire: '#f97316',
    Water: '#38bdf8',
    Wind: '#34d399',
    Earth: '#eab308',
    Holy: '#fde047',
    Dark: '#c084fc'
  };

  return `
    <div id="atlasHerbBiomeBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0d2115;border:1px solid rgba(74,222,128,0.52)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bbf7d0">🌿 24-FIELD ELEMENTAL ATTRIBUTE &amp; GROUND HERB SUSTAINABILITY BIOME OVERLAY (D38 · 24 FIELDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasHerbBiomeMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(74,222,128,0.45)'};background:${isAct ? '#15803d' : '#090d14'};color:${isAct ? '#ffffff' : '#dcfce7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          24 HUNTING BIOMES · 6 ELEMENTAL ATTRIBUTES (FIRE/WATER/WIND/EARTH/HOLY/DARK) + GROUND HERB RATES
        </span>
      </div>

      ${featuredBiomes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredBiomes.map(b => {
            const elCol = elemColMap[b.dominant_element] || '#4ade80';
            const jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(b.field_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${elCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🌿 ${escapeHtml(b.field_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${elCol}">${escapeHtml(b.dominant_element)} · ${b.herb_drop_rate_pct}% Herb</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bbf7d0;margin-top:1px">
                    ⚡ ${escapeHtml(b.counter_element_bonus.slice(0, 44))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🧪 ${escapeHtml(((b.signature_herbs || []).slice(0, 2).join(' · ')).slice(0, 64))}
                  </div>
                </div>
                <button type="button" onclick="${jumpJs}"
                        style="margin-top:2px;padding:2px 6px;border-radius:4px;border:1px solid ${elCol};background:#14532d;color:#f0fdf4;font-size:8.2px;font-weight:800;cursor:pointer;text-align:left">
                  🌿 Jump to Field Tactical Blueprint (4.8×)
                </button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasWorkshopPlazaBarHtml(tatlas) {
  const plazas = (tatlas && tatlas.soulshot_workshop_plazas) || [];
  if (!plazas.length) return '';

  const curMode = ATLAS_WORKSHOP_MODE || ATLAS_STATE_STORE.workshopMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💥 All 15 Plazas' },
    { id: 'Starter_D_C_Plaza', label: '⚒️ D/C Starter Plazas' },
    { id: 'Regional_B_A_Workshop', label: '⚙️ B/A Guild Workshops' },
    { id: 'Capital_S_Grade_Master_Forge', label: '👑 S-Grade Master Forges' }
  ];

  const filteredPlazas = curMode === 'Off'
    ? []
    : (curMode === 'All' ? plazas : plazas.filter(p => p.workshop_tier === curMode));

  const featuredPlazas = curMode === 'All'
    ? [
        ...plazas.filter(p => p.workshop_tier === 'Capital_S_Grade_Master_Forge').slice(0, 2),
        ...plazas.filter(p => p.workshop_tier === 'Regional_B_A_Workshop').slice(0, 1),
        ...plazas.filter(p => p.workshop_tier === 'Starter_D_C_Plaza').slice(0, 1)
      ]
    : filteredPlazas.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasWorkshopPlazaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#261409;border:1px solid rgba(251,146,60,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fed7aa">💥 15-TOWN SOULSHOT/SPIRITSHOT &amp; DWARVEN PRIVATE MANUFACTURE WORKSHOP MATRIX (D39 · 15 PLAZAS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWorkshopMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffedd5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 D/C STARTER PLAZAS + 5 B/A GUILD WORKSHOPS + 4 S-GRADE MASTER FORGES (CRYSTAL/ORE RATIOS &amp; 60%/100% RECIPES)
        </span>
      </div>

      ${featuredPlazas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredPlazas.map(p => {
            const isCap = p.workshop_tier === 'Capital_S_Grade_Master_Forge';
            const isReg = p.workshop_tier === 'Regional_B_A_Workshop';
            const tierCol = isCap ? '#f59e0b' : (isReg ? '#fb923c' : '#38bdf8');
            const tz = byZid[p.town_zone_id] || {};
            const townNode = tz.studio_node_id || p.town_zone_id.replace('zone-', '');
            const townJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(p.plaza_loc)}')`;
            const spoilJumpJs = `focusFieldTacticalBlueprint('${escapeHtml(p.recipe_spoil_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">💥 ${escapeHtml(p.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(p.workshop_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    ⚒️ ${escapeHtml(p.head_blacksmith_npc)} · 💰 ${Number(p.average_manufacture_fee_adena || 0).toLocaleString()}a Fee
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    📜 ${escapeHtml(p.featured_recipe_tier.slice(0, 56))} · 💎 ${escapeHtml(p.crystal_ore_ratio.slice(0, 44))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${townJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#431407;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Workshop Plaza (5.2×)
                  </button>
                  <button type="button" onclick="${spoilJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    📜 Recipe Spoil Zone
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTerritoryWardBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.territory_ward_supply_nodes) || [];
  if (!nodes.length) return '';

  const curMode = ATLAS_TERRITORY_WARD_MODE || ATLAS_STATE_STORE.territoryWardMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🚩 All 16 Ward/Supply Nodes' },
    { id: 'Sovereign_Territory_Ward', label: '🚩 8 Sovereign Territory Wards' },
    { id: 'Fortress_Codex_Supply_Vault', label: '📖 8 Giant\'s Codex & Epaulette Vaults' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? nodes : nodes.filter(n => n.node_role === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...nodes.filter(n => n.node_role === 'Sovereign_Territory_Ward').slice(0, 2),
        ...nodes.filter(n => n.node_role === 'Fortress_Codex_Supply_Vault').slice(0, 2)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasTerritoryWardBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#240d15;border:1px solid rgba(244,63,94,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fecdd3">🚩 TERRITORY WARD RELIC &amp; FORTRESS GIANT'S CODEX SUPPLY MATRIX (D40 · 16 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTerritoryWardMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,63,94,0.45)'};background:${isAct ? '#be123c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffe4e6'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          8 SOVEREIGN TERRITORY WARD SANCTUMS (+STAT BANNERS) + 8 FORTRESS EPAULETTE &amp; GIANT'S CODEX VAULTS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const isWard = n.node_role === 'Sovereign_Territory_Ward';
            const roleCol = isWard ? '#f43f5e' : '#eab308';
            const roleIcon = isWard ? '🚩' : '📖';
            const vz = byZid[n.linked_vassal_zone_id] || {};
            const isVassalTown = String(n.linked_vassal_zone_id || '').startsWith('zone-town-');
            const strongholdJumpJs = `focusFortressBlueprint('${escapeHtml(n.stronghold_zone_id)}', '${escapeHtml(n.loc)}')`;
            const vassalJumpJs = isVassalTown
              ? `focusTownStreetBlueprint('${escapeHtml(vz.studio_node_id || n.linked_vassal_zone_id.replace('zone-', ''))}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(n.linked_vassal_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${roleCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${roleIcon} ${escapeHtml(n.node_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${roleCol}">${escapeHtml(n.stat_ward_bonus.slice(0, 22))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fecdd3;margin-top:1px">
                    👤 ${escapeHtml(n.mercenary_captain_npc)} · ⏱️ ${escapeHtml(n.territory_battle_window.slice(0, 36))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 ${escapeHtml(n.epaulette_codex_reward.slice(0, 62))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${strongholdJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${roleCol};background:#4c0519;color:#ffe4e6;font-size:8px;font-weight:800;cursor:pointer">
                    ${roleIcon} Stronghold Ward Altar
                  </button>
                  <button type="button" onclick="${vassalJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    🔗 Vassal Supply Line
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasEpicJewelryBarHtml(tatlas) {
  const relics = (tatlas && tatlas.epic_jewelry_sanctums) || [];
  if (!relics.length) return '';

  const curMode = ATLAS_EPIC_JEWELRY_MODE || ATLAS_STATE_STORE.epicJewelryMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💍 All 12 Epic Relics' },
    { id: 'Epic_Ring', label: '💍 4 Epic Rings' },
    { id: 'Epic_Earring', label: '💎 4 Epic Earrings' },
    { id: 'Epic_Necklace', label: '📿 4 Epic Necklaces' }
  ];

  const filteredRelics = curMode === 'Off'
    ? []
    : (curMode === 'All' ? relics : relics.filter(r => r.slot_category === curMode));

  const featuredRelics = curMode === 'All'
    ? [
        ...relics.filter(r => r.slot_category === 'Epic_Ring').slice(0, 2),
        ...relics.filter(r => r.slot_category === 'Epic_Earring').slice(0, 1),
        ...relics.filter(r => r.slot_category === 'Epic_Necklace').slice(0, 1)
      ]
    : filteredRelics.slice(0, 4);

  return `
    <div id="atlasEpicJewelryBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e1033;border:1px solid rgba(192,132,252,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f3e8ff">💍 12-RELIC EPIC BOSS JEWELRY &amp; STATUS RESISTANCE MATRIX (D41 · 12 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasEpicJewelryMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#7e22ce' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 EPIC RINGS + 4 EPIC EARRINGS + 4 EPIC NECKLACES (STUN/HOLD/SLEEP/BLEED/MENTAL RESIST &amp; CRIT/VAMPIRIC/REUSE)
        </span>
      </div>

      ${featuredRelics.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredRelics.map(r => {
            const isRing = r.slot_category === 'Epic_Ring';
            const isEar = r.slot_category === 'Epic_Earring';
            const slotCol = isRing ? '#f59e0b' : (isEar ? '#38bdf8' : '#e879f9');
            const slotIcon = isRing ? '💍' : (isEar ? '💎' : '📿');
            const sanctumJumpJs = r.dungeon_id
              ? `openDungeonSubMap('${escapeHtml(r.dungeon_id)}', '${escapeHtml(r.floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(r.zone_id)}', '${escapeHtml(r.loc)}')`;
            const resistSummary = (r.status_resist_bonuses || []).slice(0, 2).join(' · ');
            const statSummary = (r.combat_stat_bonuses || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${slotCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${slotIcon} ${escapeHtml(r.relic_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${slotCol}">${escapeHtml(r.grade)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    👑 ${escapeHtml(r.boss_guardian_name)} · 🛡️ ${escapeHtml(resistSummary.slice(0, 48))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚔️ ${escapeHtml(statSummary.slice(0, 56))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${sanctumJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${slotCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${slotIcon} Warp to ${r.dungeon_id ? `Sanctum (${escapeHtml(r.floor_id || 'B3')})` : 'Overland Lair'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasVitalityObeliskBarHtml(tatlas) {
  const obelisks = (tatlas && tatlas.adventurer_vitality_obelisks) || [];
  if (!obelisks.length) return '';

  const curMode = ATLAS_VITALITY_OBELISK_MODE || ATLAS_STATE_STORE.vitalityObeliskMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '✨ All 15 Obelisks' },
    { id: 'Starter_Apprentice_Coupon_Hub', label: '🗡️ Starter D/C Shadow Coupons' },
    { id: 'Regional_Shadow_Weapon_Hub', label: '⚡ Lv.6–75 Support Buff Suites' },
    { id: 'Capital_Stage4_Vitality_Sanctuary', label: '🔋 Capital Stage 4 Vitality Sanctuaries' }
  ];

  const filteredObelisks = curMode === 'Off'
    ? []
    : (curMode === 'All' ? obelisks : obelisks.filter(o => o.obelisk_tier === curMode));

  const featuredObelisks = curMode === 'All'
    ? [
        ...obelisks.filter(o => o.obelisk_tier === 'Starter_Apprentice_Coupon_Hub').slice(0, 1),
        ...obelisks.filter(o => o.obelisk_tier === 'Regional_Shadow_Weapon_Hub').slice(0, 1),
        ...obelisks.filter(o => o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary').slice(0, 2)
      ]
    : filteredObelisks.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasVitalityObeliskBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0a221c;border:1px solid rgba(52,211,153,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a7f3d0">✨ 15-TOWN ADVENTURER'S GUIDE BUFF, SHADOW WEAPON &amp; VITALITY OBELISK MATRIX (D42 · 15 TOWNS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasVitalityObeliskMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#059669' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          LV.6–75 SUPPORT BUFF SUITES + D/C/B SHADOW WEAPON COUPONS + STAGE 4 (+300% EXP) VITALITY REST SANCTUARIES
        </span>
      </div>

      ${featuredObelisks.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredObelisks.map(o => {
            const isCap = o.obelisk_tier === 'Capital_Stage4_Vitality_Sanctuary';
            const isReg = o.obelisk_tier === 'Regional_Shadow_Weapon_Hub';
            const tierCol = isCap ? '#34d399' : (isReg ? '#38bdf8' : '#fbbf24');
            const tz = byZid[o.town_zone_id] || {};
            const townNode = tz.studio_node_id || o.town_zone_id.replace('zone-', '');
            const obeliskJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(o.obelisk_loc)}')`;
            const buffSummary = (o.granted_buff_suite || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${tierCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">✨ ${escapeHtml(o.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${tierCol}">${escapeHtml(o.obelisk_tier.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    🧭 ${escapeHtml(o.guide_npc_name)} · 🗡️ ${escapeHtml(o.shadow_weapon_coupon_grade.slice(0, 36))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml(buffSummary.slice(0, 48))} · 🔋 ${escapeHtml(o.vitality_recovery_rate.slice(0, 44))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${obeliskJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${tierCol};background:#064e3b;color:#d1fae5;font-size:8px;font-weight:800;cursor:pointer">
                    ✨ Adventurer's Guide &amp; Vitality Obelisk (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasArmorSetBarHtml(tatlas) {
  const armorSets = (tatlas && tatlas.armor_set_masterwork_forges) || [];
  if (!armorSets.length) return '';

  const curMode = ATLAS_ARMOR_SET_MODE || ATLAS_STATE_STORE.armorSetMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🛡️ All 16 Armor Sets' },
    { id: 'Heavy_Vanguard_Set', label: '⚔️ 6 Heavy Vanguard' },
    { id: 'Light_Skirmisher_Set', label: '🏹 5 Light Skirmisher' },
    { id: 'Mystic_Robe_Set', label: '🔮 5 Mystic Robe' }
  ];

  const filteredSets = curMode === 'Off'
    ? []
    : (curMode === 'All' ? armorSets : armorSets.filter(s => s.armor_weight_class === curMode));

  const featuredSets = curMode === 'All'
    ? [
        ...armorSets.filter(s => s.armor_weight_class === 'Heavy_Vanguard_Set').slice(0, 2),
        ...armorSets.filter(s => s.armor_weight_class === 'Light_Skirmisher_Set').slice(0, 1),
        ...armorSets.filter(s => s.armor_weight_class === 'Mystic_Robe_Set').slice(0, 1)
      ]
    : filteredSets.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasArmorSetBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e1b0e;border:1px solid rgba(250,204,21,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🛡️ 16-SET ARMOR PROGRESSION &amp; MASTERWORK FOUNDATION FORGE MATRIX (D43 · 16 FORGES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasArmorSetMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#a16207' : '#090d14'};color:${isAct ? '#ffffff' : '#fef9c3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 HEAVY VANGUARD + 5 LIGHT SKIRMISHER + 5 MYSTIC ROBE SETS (C/B/A/S/S80-DYNASTY &amp; FOUNDATION RARE BONUSES)
        </span>
      </div>

      ${featuredSets.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSets.map(s => {
            const isHeavy = s.armor_weight_class === 'Heavy_Vanguard_Set';
            const isLight = s.armor_weight_class === 'Light_Skirmisher_Set';
            const weightCol = isHeavy ? '#f59e0b' : (isLight ? '#38bdf8' : '#c084fc');
            const weightIcon = isHeavy ? '⚔️' : (isLight ? '🏹' : '🔮');
            const tz = byZid[s.forge_town_zone_id] || {};
            const townNode = tz.studio_node_id || s.forge_town_zone_id.replace('zone-', '');
            const forgeJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(s.forge_loc)}')`;
            const dropJumpJs = s.key_piece_dungeon_id
              ? `openDungeonSubMap('${escapeHtml(s.key_piece_dungeon_id)}', '${escapeHtml(s.key_piece_floor_id || 'B2')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(s.key_piece_drop_zone_id)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${weightCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${weightIcon} ${escapeHtml(s.set_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${weightCol}">${escapeHtml(s.grade)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    🛡️ ${escapeHtml(s.set_bonus_summary.slice(0, 58))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✨ ${escapeHtml(s.masterwork_foundation_bonus.slice(0, 56))} · ⚒️ ${escapeHtml(s.unseal_blacksmith_npc.slice(0, 28))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${forgeJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${weightCol};background:#422006;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ⚒️ Masterwork Forge (5.2×)
                  </button>
                  <button type="button" onclick="${dropJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${s.key_piece_dungeon_id ? `🕳️ Drop Floor (${escapeHtml(s.key_piece_floor_id || 'B2')})` : '🌾 Key-Piece Field'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasKamalokaBarHtml(tatlas) {
  const instances = (tatlas && tatlas.kamaloka_pailaka_instances) || [];
  if (!instances.length) return '';

  const curMode = ATLAS_KAMALOKA_MODE || ATLAS_STATE_STORE.kamalokaMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌀 All 15 Portals' },
    { id: 'Kamaloka_Abyss_Hall', label: '🕸️ 6 Kamaloka Abyss Halls' },
    { id: 'Pailaka_Vitality_Trial', label: '🐉 5 Pailaka Vitality Trials' },
    { id: 'Seed_Delusion_Conduit', label: '🌌 4 Seed & Delusion Conduits' }
  ];

  const filteredInstances = curMode === 'Off'
    ? []
    : (curMode === 'All' ? instances : instances.filter(i => i.conduit_category === curMode));

  const featuredInstances = curMode === 'All'
    ? [
        ...instances.filter(i => i.conduit_category === 'Kamaloka_Abyss_Hall').slice(0, 2),
        ...instances.filter(i => i.conduit_category === 'Pailaka_Vitality_Trial').slice(0, 1),
        ...instances.filter(i => i.conduit_category === 'Seed_Delusion_Conduit').slice(0, 1)
      ]
    : filteredInstances.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasKamalokaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0d1b2a;border:1px solid rgba(56,189,248,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bae6fd">🌀 15-PORTAL KAMALOKA, PAILAKA &amp; SEED INSTANCE CONDUIT MATRIX (D44 · 15 PORTALS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasKamalokaMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0284c7' : '#090d14'};color:${isAct ? '#ffffff' : '#e0f2fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 KAMALOKA ABYSS HALLS + 5 PAILAKA VITALITY TRIALS + 4 SEED OF INFINITY/DESTRUCTION &amp; DELUSION CONDUITS
        </span>
      </div>

      ${featuredInstances.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredInstances.map(inst => {
            const isKama = inst.conduit_category === 'Kamaloka_Abyss_Hall';
            const isPailaka = inst.conduit_category === 'Pailaka_Vitality_Trial';
            const catCol = isKama ? '#38bdf8' : (isPailaka ? '#34d399' : '#e879f9');
            const catIcon = isKama ? '🕸️' : (isPailaka ? '🐉' : '🌌');
            const zObj = byZid[inst.zone_id] || {};
            const zidStr = String(inst.zone_id || '');
            let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(inst.loc)}')`;
            if (zidStr.startsWith('zone-town-')) {
              const townNode = zObj.studio_node_id || zidStr.replace('zone-', '');
              jumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(inst.loc)}')`;
            } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(inst.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(inst.instance_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(inst.level_bracket)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🧭 ${escapeHtml(inst.pathfinder_npc_name)} · 👥 ${escapeHtml(inst.party_size_rule.slice(0, 32))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⏱️ ${escapeHtml(inst.reset_cooldown)} · 🏆 ${escapeHtml(inst.completion_reward.slice(0, 48))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Warp to Pathfinder / Conduit (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSkillScrollBarHtml(tatlas) {
  const sanctums = (tatlas && tatlas.forgotten_scroll_skill_sanctums) || [];
  if (!sanctums.length) return '';

  const curMode = ATLAS_SKILL_SCROLL_MODE || ATLAS_STATE_STORE.skillScrollMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '📖 All 16 Sanctums' },
    { id: 'Martial_Will_Scroll', label: '⚔️ 6 Martial Wills' },
    { id: 'Arcane_Enlightenment_Scroll', label: '🔮 5 Arcane Enlightenment' },
    { id: 'Ancient_Tome_Codex_Sanctum', label: '📜 5 Ancient Tomes & Codices' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctums : sanctums.filter(s => s.mastery_category === curMode));

  const featuredSanctums = curMode === 'All'
    ? [
        ...sanctums.filter(s => s.mastery_category === 'Martial_Will_Scroll').slice(0, 2),
        ...sanctums.filter(s => s.mastery_category === 'Arcane_Enlightenment_Scroll').slice(0, 1),
        ...sanctums.filter(s => s.mastery_category === 'Ancient_Tome_Codex_Sanctum').slice(0, 1)
      ]
    : filteredSanctums.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasSkillScrollBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1a102c;border:1px solid rgba(192,132,252,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">📖 16-SANCTUM FORGOTTEN SCROLL, ANCIENT TOME &amp; LV.81–83 SKILL MASTERY MATRIX (D45 · 16 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSkillScrollMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#7e22ce' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARTIAL WILLS + 5 ARCANE ENLIGHTENMENT + 5 ANCIENT TOMES &amp; GIANT'S CODEX SANCTUMS (LV.76–83)
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isMartial = s.mastery_category === 'Martial_Will_Scroll';
            const isArcane = s.mastery_category === 'Arcane_Enlightenment_Scroll';
            const catCol = isMartial ? '#f97316' : (isArcane ? '#c084fc' : '#fde047');
            const catIcon = isMartial ? '⚔️' : (isArcane ? '🔮' : '📜');
            const tz = byZid[s.trainer_town_zone_id] || {};
            const townNode = tz.studio_node_id || s.trainer_town_zone_id.replace('zone-', '');
            const trainerJumpJs = `focusTownStreetBlueprint('${escapeHtml(townNode)}', '${escapeHtml(tz.loc_coord || s.loc)}')`;
            const dropJumpJs = s.drop_dungeon_id
              ? `openDungeonSubMap('${escapeHtml(s.drop_dungeon_id)}', '${escapeHtml(s.drop_floor_id || 'B3')}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(s.drop_zone_id)}', '${escapeHtml(s.loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.scroll_or_tome_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">Lv.${escapeHtml(String(s.unlock_level))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    ✨ ${escapeHtml(((s.unlocked_skills && s.unlocked_skills[0]) || '').slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    👾 ${escapeHtml(s.drop_guardian_mob.slice(0, 32))} · 🎲 ${escapeHtml(s.drop_rate_summary.slice(0, 28))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${dropJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${s.drop_dungeon_id ? `🕳️ Drop Sanctum (${escapeHtml(s.drop_floor_id || 'B3')})` : '🌾 Drop Field (4.8×)'}
                  </button>
                  <button type="button" onclick="${trainerJumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    🏛️ Trainer Town (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasElementalQuarryBarHtml(tatlas) {
  const quarries = (tatlas && tatlas.elemental_stone_caravan_quarries) || [];
  if (!quarries.length) return '';

  const curMode = ATLAS_ELEMENTAL_QUARRY_MODE || ATLAS_STATE_STORE.elementalQuarryMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🔥 All 14 Quarries' },
    { id: 'Elemental_Stone_Quarry_150', label: '🔥💧🌪️🪨 6 Elemental Stones (0–150)' },
    { id: 'Elemental_Crystal_Sanctum_300', label: '💎 6 Elemental Crystals (150–300)' },
    { id: 'Caravan_Trust_Oasis', label: '🐪 2 Caravan Trust Oases' }
  ];

  const filteredQuarries = curMode === 'Off'
    ? []
    : (curMode === 'All' ? quarries : quarries.filter(q => q.quarry_category === curMode));

  const featuredQuarries = curMode === 'All'
    ? [
        ...quarries.filter(q => q.quarry_category === 'Elemental_Stone_Quarry_150').slice(0, 2),
        ...quarries.filter(q => q.quarry_category === 'Elemental_Crystal_Sanctum_300').slice(0, 1),
        ...quarries.filter(q => q.quarry_category === 'Caravan_Trust_Oasis').slice(0, 1)
      ]
    : filteredQuarries.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasElementalQuarryBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#24110b;border:1px solid rgba(251,146,60,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fed7aa">🔥 14-NODE ELEMENTAL ATTRIBUTE STONE/CRYSTAL (150/300) &amp; CARAVAN QUARRY MATRIX (D46 · 14 QUARRIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasElementalQuarryMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffedd5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 ELEMENTAL STONE QUARRIES (0–150) + 6 CRYSTAL SANCTUMS (150–300) + 2 CARAVAN TRUST OASES (STAGE 1–11)
        </span>
      </div>

      ${featuredQuarries.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredQuarries.map(q => {
            const isStone = q.quarry_category === 'Elemental_Stone_Quarry_150';
            const isCrystal = q.quarry_category === 'Elemental_Crystal_Sanctum_300';
            const catCol = isStone ? '#fb923c' : (isCrystal ? '#38bdf8' : '#facc15');
            const catIcon = isStone ? '🔥' : (isCrystal ? '💎' : '🐪');
            const zObj = byZid[q.zone_id] || {};
            const zidStr = String(q.zone_id || '');
            let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(q.loc)}')`;
            if (q.dungeon_id) {
              jumpJs = `openDungeonSubMap('${escapeHtml(q.dungeon_id)}', '${escapeHtml(q.floor_id || '3F')}')`;
            } else if (zidStr.startsWith('zone-town-')) {
              jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(q.loc)}')`;
            } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(q.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(q.quarry_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(q.element_type)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    ⚖️ ${escapeHtml(q.attribute_master_npc.slice(0, 30))} · ⛏️ ${escapeHtml(q.hourly_stone_yield.slice(0, 28))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml(q.combat_multiplier_effect.slice(0, 56))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#431407;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    ${q.dungeon_id ? `🕳️ Quarry Floor (${escapeHtml(q.floor_id || '3F')})` : `${catIcon} Warp to Quarry / Oasis (5.2×)`}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasClanHallBarHtml(tatlas) {
  const estates = (tatlas && tatlas.clan_hall_auction_estates) || [];
  if (!estates.length) return '';

  const curMode = ATLAS_CLAN_HALL_MODE || ATLAS_STATE_STORE.clanHallMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏛️ All 16 Estates' },
    { id: 'Town_Luxury_Auction_Hall', label: '💰 10 Town Luxury Auction Halls' },
    { id: 'Contested_Siege_Chateau', label: '⚔️ 6 Contested Siege Chateaus' }
  ];

  const filteredEstates = curMode === 'Off'
    ? []
    : (curMode === 'All' ? estates : estates.filter(e => e.acquisition_mode === curMode));

  const featuredEstates = curMode === 'All'
    ? [
        ...estates.filter(e => e.acquisition_mode === 'Town_Luxury_Auction_Hall').slice(0, 2),
        ...estates.filter(e => e.acquisition_mode === 'Contested_Siege_Chateau').slice(0, 2)
      ]
    : filteredEstates.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasClanHallBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f190b;border:1px solid rgba(250,204,21,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🏛️ 16-ESTATE CLAN HALL AUCTION &amp; SIEGE CHATEAU REAL-ESTATE MATRIX (D47 · 16 ESTATES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasClanHallMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#a16207' : '#090d14'};color:${isAct ? '#ffffff' : '#fef9c3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          10 TOWN LUXURY AUCTION HALLS (B/A-GRADE) + 6 CONTESTED SIEGE CHATEAUS (S-GRADE ZERO-RENT)
        </span>
      </div>

      ${featuredEstates.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredEstates.map(e => {
            const isAuction = e.acquisition_mode === 'Town_Luxury_Auction_Hall';
            const catCol = isAuction ? '#facc15' : '#f43f5e';
            const catIcon = isAuction ? '💰' : '⚔️';
            const zObj = byZid[e.zone_id] || {};
            const zidStr = String(e.zone_id || '');
            let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(e.loc)}')`;
            let jumpBtnLabel = '⚔️ Siege Chateau (4.8×)';
            if (zidStr.startsWith('zone-town-')) {
              jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(e.loc)}')`;
              jumpBtnLabel = '🏛️ Town Auction Hall (5.2×)';
            } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(e.loc)}')`;
              jumpBtnLabel = '🏰 Contested Stronghold (3.8×)';
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(e.estate_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(e.estate_grade.replace(/_/g, ' '))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    📜 ${escapeHtml(e.min_bid_or_siege_rule.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    ✨ ${escapeHtml(e.facility_buff_stage.slice(0, 56))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#422006;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ${jumpBtnLabel}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTransformationBarHtml(tatlas) {
  const sanctums = (tatlas && tatlas.transformation_talisman_sanctums) || [];
  if (!sanctums.length) return '';

  const curMode = ATLAS_TRANSFORMATION_MODE || ATLAS_STATE_STORE.transformationMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🦋 All 15 Sanctums' },
    { id: 'Avant_Garde_Transformation_Sanctum', label: '🦋 6 Avant-Garde Transformations' },
    { id: 'Epaulette_Talisman_Vault', label: '🔮 5 Epaulette Talisman Vaults' },
    { id: 'Agathion_Bracelet_Altar', label: '🧚 4 Agathion Bracelet Altars' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctums : sanctums.filter(s => s.relic_category === curMode));

  const featuredSanctums = curMode === 'All'
    ? [
        ...sanctums.filter(s => s.relic_category === 'Avant_Garde_Transformation_Sanctum').slice(0, 2),
        ...sanctums.filter(s => s.relic_category === 'Epaulette_Talisman_Vault').slice(0, 1),
        ...sanctums.filter(s => s.relic_category === 'Agathion_Bracelet_Altar').slice(0, 1)
      ]
    : filteredSanctums.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasTransformationBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0c1f2c;border:1px solid rgba(56,189,248,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bae6fd">🦋 15-SANCTUM TRANSFORMATION SEALBOOK, TALISMAN &amp; AGATHION SUMMON MATRIX (D48 · 15 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTransformationMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0284c7' : '#090d14'};color:${isAct ? '#ffffff' : '#e0f2fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 AVANT-GARDE SEALBOOKS + 5 EPAULETTE TALISMAN VAULTS + 4 AGATHION BRACELET ALTARS
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isTrans = s.relic_category === 'Avant_Garde_Transformation_Sanctum';
            const isTalisman = s.relic_category === 'Epaulette_Talisman_Vault';
            const catCol = isTrans ? '#38bdf8' : (isTalisman ? '#a855f7' : '#f472b6');
            const catIcon = isTrans ? '🦋' : (isTalisman ? '🔮' : '🧚');
            const zObj = byZid[s.zone_id] || {};
            const zidStr = String(s.zone_id || '');
            let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            if (s.dungeon_id) {
              jumpJs = `openDungeonSubMap('${escapeHtml(s.dungeon_id)}', '${escapeHtml(s.floor_id || '3F')}')`;
            } else if (zidStr.startsWith('zone-town-')) {
              jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
            } else if (zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctum_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.relic_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    ✨ ${escapeHtml(((s.featured_transformations_or_talismans && s.featured_transformations_or_talismans[0]) || '').slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🧙 ${escapeHtml(s.steward_npc_name.slice(0, 30))} · 🔑 ${escapeHtml(s.unlock_requirement.slice(0, 28))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#082f49;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${s.dungeon_id ? `🕳️ Boss Sanctum (${escapeHtml(s.floor_id || '3F')})` : `${catIcon} Warp to Sanctum / Vault`}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasWarehouseBarHtml(tatlas) {
  const vaults = (tatlas && tatlas.warehouse_freight_vaults) || [];
  if (!vaults.length) return '';

  const curMode = ATLAS_WAREHOUSE_MODE || ATLAS_STATE_STORE.warehouseMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '📦 All 15 Vaults' },
    { id: 'Starter_Iron_Gate_Vault', label: '🏦 6 Starter Iron Gate Vaults' },
    { id: 'Regional_Freight_Depot', label: '🚚 5 Regional Freight Depots' },
    { id: 'Capital_Dimensional_Broker', label: '💎 4 Capital Dimensional Brokers' }
  ];

  const filteredVaults = curMode === 'Off'
    ? []
    : (curMode === 'All' ? vaults : vaults.filter(v => v.logistics_tier === curMode));

  const featuredVaults = curMode === 'All'
    ? [
        ...vaults.filter(v => v.logistics_tier === 'Starter_Iron_Gate_Vault').slice(0, 1),
        ...vaults.filter(v => v.logistics_tier === 'Regional_Freight_Depot').slice(0, 1),
        ...vaults.filter(v => v.logistics_tier === 'Capital_Dimensional_Broker').slice(0, 2)
      ]
    : filteredVaults.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasWarehouseBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e160c;border:1px solid rgba(251,146,60,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fed7aa">📦 15-TOWN IRON GATE WAREHOUSE, CLAN VAULT &amp; FREIGHT LOGISTICS NETWORK (D49 · 15 VAULTS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWarehouseMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,146,60,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffedd5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 STARTER IRON GATE VAULTS + 5 REGIONAL FREIGHT DEPOTS + 4 CAPITAL DIMENSIONAL BROKERS
        </span>
      </div>

      ${featuredVaults.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredVaults.map(v => {
            const isStarter = v.logistics_tier === 'Starter_Iron_Gate_Vault';
            const isRegional = v.logistics_tier === 'Regional_Freight_Depot';
            const catCol = isStarter ? '#fbbf24' : (isRegional ? '#fb923c' : '#38bdf8');
            const catIcon = isStarter ? '🏦' : (isRegional ? '🚚' : '💎');
            const zObj = byZid[v.town_zone_id] || {};
            const pObj = byZid[v.freight_corridor_partner_zone_id] || {};
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || String(v.town_zone_id || '').replace('zone-', ''))}', '${escapeHtml(v.vault_loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(v.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${v.freight_fee_per_slot_adena}a/slot</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    📦 ${escapeHtml(v.private_clan_slot_cap.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🚚 Freight ➔ ${escapeHtml((pObj.name || v.freight_corridor_partner_zone_id).slice(0, 26))} · ${escapeHtml(((v.dimensional_broker_services && v.dimensional_broker_services[0]) || '').slice(0, 28))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#431407;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    📦 Town Warehouse #6 (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasMasterTourBarHtml(tatlas) {
  const checkpoints = (tatlas && tatlas.atlas_master_telemetry_checkpoints) || [];
  if (!checkpoints.length) return '';

  const curMode = ATLAS_MASTER_TOUR_MODE || ATLAS_STATE_STORE.masterTourMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🧭 All 18 Checkpoints' },
    { id: 'Race_Origin_To_Awakening', label: '🧬 6 Race Origin Checkpoints' },
    { id: 'Town_Blueprint_And_Economy', label: '🏛️ 6 Town Blueprint Checkpoints' },
    { id: 'Multi_Floor_Dungeon_Sanctum', label: '🕳️ 6 Multi-Floor Dungeon Sanctum Checkpoints' }
  ];

  const filteredCheckpoints = curMode === 'Off'
    ? []
    : (curMode === 'All' ? checkpoints : checkpoints.filter(cp => cp.tour_category === curMode));

  const featuredCheckpoints = curMode === 'All'
    ? [
        ...checkpoints.filter(cp => cp.tour_category === 'Race_Origin_To_Awakening').slice(0, 1),
        ...checkpoints.filter(cp => cp.tour_category === 'Town_Blueprint_And_Economy').slice(0, 2),
        ...checkpoints.filter(cp => cp.tour_category === 'Multi_Floor_Dungeon_Sanctum').slice(0, 1)
      ]
    : filteredCheckpoints.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasMasterTourBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0c1e17;border:1px solid rgba(52,211,153,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#6ee7b7">🧭 18-CHECKPOINT 50-DIMENSION MASTER CARTOGRAPHIC TOUR &amp; STUDIO INSPECTOR (D50 · D1–D50 VERIFIED):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasMasterTourMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#059669' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 RACE ORIGINS (STEPS 1–6) + 6 TOWN BLUEPRINTS (STEPS 7–12) + 6 DUNGEON SANCTUMS (STEPS 13–18)
        </span>
      </div>

      ${featuredCheckpoints.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredCheckpoints.map(cp => {
            const isOrigin = cp.tour_category === 'Race_Origin_To_Awakening';
            const isTown = cp.tour_category === 'Town_Blueprint_And_Economy';
            const catCol = isOrigin ? '#34d399' : (isTown ? '#facc15' : '#c084fc');
            const catIcon = isOrigin ? '🧬' : (isTown ? '🏛️' : '🕳️');
            const zObj = byZid[cp.zone_id] || {};
            const zidStr = String(cp.zone_id || '');
            let jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(cp.loc)}')`;
            if (cp.dungeon_id) {
              jumpJs = `openDungeonSubMap('${escapeHtml(cp.dungeon_id)}', '${escapeHtml(cp.floor_id || '3F')}')`;
            } else if (zidStr.startsWith('zone-town-')) {
              jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(cp.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(cp.checkpoint_title.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">#${cp.step_order} (${cp.target_zoom}×)</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#6ee7b7;margin-top:1px">
                    ✅ Dimensions: ${escapeHtml((cp.verified_dimensions_covered || []).join(' · '))}
                  </div>
                  <div style="font-size:8px;color:#cbd5e1;margin-top:1px">
                    🔍 ${escapeHtml(cp.council_inspection_summary.slice(0, 56))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#064e3b;color:#d1fae5;font-size:8px;font-weight:800;cursor:pointer">
                    ${cp.dungeon_id ? `🕳️ Inspect Floor (${escapeHtml(cp.floor_id || '3F')})` : `🧭 Jump to Checkpoint #${cp.step_order} (${cp.target_zoom}×)`}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFestivalOracleBarHtml(tatlas) {
  const oracles = (tatlas && tatlas.festival_of_darkness_oracles) || [];
  if (!oracles.length) return '';

  const curMode = ATLAS_FESTIVAL_ORACLE_MODE || ATLAS_STATE_STORE.festivalOracleMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🕯️ All 15 Oracles' },
    { id: 'Oracle_of_Dawn_Sanctuary', label: '☀️ 5 Dawn Oracles' },
    { id: 'Oracle_of_Dusk_Sanctuary', label: '🌙 5 Dusk Oracles' },
    { id: 'High_Bracket_Blood_Offering_Altar', label: '🩸 5 High-Bracket Blood Altars' }
  ];

  const filteredOracles = curMode === 'Off'
    ? []
    : (curMode === 'All' ? oracles : oracles.filter(o => o.oracle_category === curMode));

  const featuredOracles = curMode === 'All'
    ? [
        ...oracles.filter(o => o.oracle_category === 'Oracle_of_Dawn_Sanctuary').slice(0, 1),
        ...oracles.filter(o => o.oracle_category === 'Oracle_of_Dusk_Sanctuary').slice(0, 1),
        ...oracles.filter(o => o.oracle_category === 'High_Bracket_Blood_Offering_Altar').slice(0, 2)
      ]
    : filteredOracles.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasFestivalOracleBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1d1124;border:1px solid rgba(232,121,249,0.55)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f5d0fe">🕯️ 15-TOWN FESTIVAL OF DARKNESS &amp; ORACLE OF DAWN/DUSK PARTY ALTAR MATRIX (D51 · 15 ORACLES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFestivalOracleMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(232,121,249,0.45)'};background:${isAct ? '#a21caf' : '#090d14'};color:${isAct ? '#ffffff' : '#fae8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 DAWN ORACLES + 5 DUSK ORACLES + 5 HIGH-BRACKET BLOOD ALTARS (18-MIN SURVIVAL &amp; WITCH SACRIFICE)
        </span>
      </div>

      ${featuredOracles.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredOracles.map(o => {
            const isDawn = o.oracle_category === 'Oracle_of_Dawn_Sanctuary';
            const isDusk = o.oracle_category === 'Oracle_of_Dusk_Sanctuary';
            const catCol = isDawn ? '#facc15' : (isDusk ? '#c084fc' : '#f43f5e');
            const catIcon = isDawn ? '☀️' : (isDusk ? '🌙' : '🩸');
            const zObj = byZid[o.town_zone_id] || {};
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || String(o.town_zone_id || '').replace('zone-', ''))}', '${escapeHtml(o.oracle_loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(o.town_name.slice(0, 30))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(o.festival_level_bracket)} · ${o.blood_offering_target_score} pts</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                    🙏 ${escapeHtml(o.priest_npc_name.slice(0, 32))} · 💰 ${escapeHtml(o.ancient_adena_jackpot_pool.slice(0, 26))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🕯️ ${escapeHtml(o.festival_witch_mechanic.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#4a044e;color:#fae8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Town Oracle Priest (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasLuxuryMarketBarHtml(tatlas) {
  const boutiques = (tatlas && tatlas.luxury_black_market_boutiques) || [];
  if (!boutiques.length) return '';

  const curMode = ATLAS_LUXURY_MARKET_MODE || ATLAS_STATE_STORE.luxuryMarketMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎩 All 12 Boutiques' },
    { id: 'Crystal_Luxury_Armory', label: '💎 4 Crystal Luxury Armories' },
    { id: 'Black_Marketeer_of_Mammon', label: '🕶️ 4 Black Marketeers of Mammon' },
    { id: 'Couture_Emporium', label: '👑 4 Couture Emporiums' }
  ];

  const filteredBoutiques = curMode === 'Off'
    ? []
    : (curMode === 'All' ? boutiques : boutiques.filter(b => b.market_category === curMode));

  const featuredBoutiques = curMode === 'All'
    ? [
        ...boutiques.filter(b => b.market_category === 'Crystal_Luxury_Armory').slice(0, 2),
        ...boutiques.filter(b => b.market_category === 'Black_Marketeer_of_Mammon').slice(0, 1),
        ...boutiques.filter(b => b.market_category === 'Couture_Emporium').slice(0, 1)
      ]
    : filteredBoutiques.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasLuxuryMarketBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f1509;border:1px solid rgba(250,204,21,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🎩 12-NODE LUXURY BOUTIQUE &amp; BLACK MARKETEER OF MAMMON EXCHANGE MATRIX (D52 · 12 BOUTIQUES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasLuxuryMarketMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#b45309' : '#090d14'};color:${isAct ? '#ffffff' : '#fef9c3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 CRYSTAL C/B/A/S LUXURY ARMORIES + 4 NIGHT BLACK MARKETEERS OF MAMMON + 4 HAUTE COUTURE EMPORIUMS
        </span>
      </div>

      ${featuredBoutiques.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredBoutiques.map(b => {
            const isCrystal = b.market_category === 'Crystal_Luxury_Armory';
            const isSmuggler = b.market_category === 'Black_Marketeer_of_Mammon';
            const catCol = isCrystal ? '#38bdf8' : (isSmuggler ? '#f43f5e' : '#facc15');
            const catIcon = isCrystal ? '💎' : (isSmuggler ? '🕶️' : '👑');
            const zObj = byZid[b.zone_id] || {};
            const zidStr = String(b.zone_id || '');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(b.loc)}')`;
            if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(b.boutique_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(b.market_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    🎩 ${escapeHtml(b.proprietor_npc_name.slice(0, 30))} · 💱 ${escapeHtml(b.accepted_currency.slice(0, 26))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🛍️ ${escapeHtml(((b.signature_catalog_items && b.signature_catalog_items[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#451a03;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Boutique / Smuggler Alley (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFactionAllianceBarHtml(tatlas) {
  const camps = (tatlas && tatlas.faction_alliance_war_camps) || [];
  if (!camps.length) return '';

  const curMode = ATLAS_FACTION_ALLIANCE_MODE || ATLAS_STATE_STORE.factionAllianceMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚔️ All 14 Faction Camps' },
    { id: 'Vanguard_Orc_Alliance_Outpost', label: '🐂 5 Vanguard Orc Outposts' },
    { id: 'Shaman_Silenos_Alliance_Stronghold', label: '🦌 5 Silenos Shaman Strongholds' },
    { id: 'Totem_Spirit_Raid_Altar', label: '🔥💧 4 Totem Raid Altars' }
  ];

  const filteredCamps = curMode === 'Off'
    ? []
    : (curMode === 'All' ? camps : camps.filter(c => c.faction_category === curMode));

  const featuredCamps = curMode === 'All'
    ? [
        ...camps.filter(c => c.faction_category === 'Vanguard_Orc_Alliance_Outpost').slice(0, 1),
        ...camps.filter(c => c.faction_category === 'Shaman_Silenos_Alliance_Stronghold').slice(0, 1),
        ...camps.filter(c => c.faction_category === 'Totem_Spirit_Raid_Altar').slice(0, 2)
      ]
    : filteredCamps.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasFactionAllianceBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#23120b;border:1px solid rgba(249,115,22,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fed7aa">⚔️ 14-NODE FACTIONAL ALLIANCE WAR (STAGE 1–5) &amp; TOTEM RAID ALTAR MATRIX (D53 · 14 CAMPS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFactionAllianceMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(249,115,22,0.45)'};background:${isAct ? '#c2410c' : '#090d14'};color:${isAct ? '#ffffff' : '#ffedd5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 VANGUARD ORC OUTPOSTS + 5 SILENOS SHAMAN STRONGHOLDS + 4 ASHUTAR/NASTRON TOTEM RAID ALTARS
        </span>
      </div>

      ${featuredCamps.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredCamps.map(c => {
            const isOrc = c.faction_category === 'Vanguard_Orc_Alliance_Outpost';
            const isSilenos = c.faction_category === 'Shaman_Silenos_Alliance_Stronghold';
            const catCol = isOrc ? '#f97316' : (isSilenos ? '#34d399' : '#38bdf8');
            const catIcon = isOrc ? '🐂' : (isSilenos ? '🦌' : '🔥');
            const zidStr = String(c.zone_id || '');
            const jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(c.camp_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(c.faction_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    🎖️ ${escapeHtml(c.alliance_stage_band.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🏆 ${escapeHtml(c.totem_raid_boss_or_relic.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#431407;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Faction Outpost / Totem Altar (3.8×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFantasyPlazaBarHtml(tatlas) {
  const plazas = (tatlas && tatlas.monster_track_fantasy_plazas) || [];
  if (!plazas.length) return '';

  const curMode = ATLAS_FANTASY_PLAZA_MODE || ATLAS_STATE_STORE.fantasyPlazaMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎪 All 12 Event Plazas' },
    { id: 'Monster_Derby_Race_Track', label: '🏇 4 Monster Derby Tracks' },
    { id: 'Coin_of_Magic_Collector_Lodge', label: '🪙 4 Coin of Magic Lodges' },
    { id: 'Kratei_Cube_Fantasy_Arena', label: '🎡 4 Kratei\'s Cube Arenas' }
  ];

  const filteredPlazas = curMode === 'Off'
    ? []
    : (curMode === 'All' ? plazas : plazas.filter(p => p.activity_category === curMode));

  const featuredPlazas = curMode === 'All'
    ? [
        ...plazas.filter(p => p.activity_category === 'Monster_Derby_Race_Track').slice(0, 1),
        ...plazas.filter(p => p.activity_category === 'Coin_of_Magic_Collector_Lodge').slice(0, 1),
        ...plazas.filter(p => p.activity_category === 'Kratei_Cube_Fantasy_Arena').slice(0, 2)
      ]
    : filteredPlazas.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasFantasyPlazaBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#101f24;border:1px solid rgba(45,212,191,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#99f6e4">🎪 12-NODE MONSTER DERBY RACE TRACK, COIN OF MAGIC &amp; KRATEI'S CUBE PLAZA MATRIX (D54 · 12 PLAZAS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFantasyPlazaMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(45,212,191,0.45)'};background:${isAct ? '#0f766e' : '#090d14'};color:${isAct ? '#ffffff' : '#ccfbf1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 MONSTER DERBY STADIUMS + 4 COIN OF MAGIC ROYAL LODGES + 4 KRATEI'S CUBE / BLOCK CHECKER ARENAS
        </span>
      </div>

      ${featuredPlazas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredPlazas.map(p => {
            const isDerby = p.activity_category === 'Monster_Derby_Race_Track';
            const isCoin = p.activity_category === 'Coin_of_Magic_Collector_Lodge';
            const catCol = isDerby ? '#facc15' : (isCoin ? '#fb923c' : '#2dd4bf');
            const catIcon = isDerby ? '🏇' : (isCoin ? '🪙' : '🎡');
            const zObj = byZid[p.zone_id] || {};
            const zidStr = String(p.zone_id || '');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`;
            if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(p.plaza_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(p.activity_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#99f6e4;margin-top:1px">
                    🎟️ ${escapeHtml(p.entry_token_or_wager.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🎁 ${escapeHtml(((p.featured_rewards && p.featured_rewards[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#134e4a;color:#ccfbf1;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Event Plaza / Arena (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasHeroWeaponBarHtml(tatlas) {
  const exchanges = (tatlas && tatlas.olympiad_hero_weapon_exchanges) || [];
  if (!exchanges.length) return '';

  const curMode = ATLAS_HERO_WEAPON_MODE || ATLAS_STATE_STORE.heroWeaponMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏆 All 15 Exchanges' },
    { id: 'Martial_Infinity_Armory', label: '🗡️ 5 Martial Infinity Hubs' },
    { id: 'Arcane_Infinity_Sanctum', label: '🔮 5 Arcane Infinity Hubs' },
    { id: 'Olympiad_Token_Codex_Exchange', label: '📜 5 Token & Codex Exchanges' }
  ];

  const filteredExchanges = curMode === 'Off'
    ? []
    : (curMode === 'All' ? exchanges : exchanges.filter(e => e.exchange_category === curMode));

  const featuredExchanges = curMode === 'All'
    ? [
        ...exchanges.filter(e => e.exchange_category === 'Martial_Infinity_Armory').slice(0, 1),
        ...exchanges.filter(e => e.exchange_category === 'Arcane_Infinity_Sanctum').slice(0, 1),
        ...exchanges.filter(e => e.exchange_category === 'Olympiad_Token_Codex_Exchange').slice(0, 2)
      ]
    : filteredExchanges.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasHeroWeaponBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#241c09;border:1px solid rgba(250,204,21,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🏆 15-TOWN HERO WEAPON (INFINITY ARMAMENTS) &amp; OLYMPIAD TOKEN EXCHANGE MATRIX (D55 · 15 EXCHANGES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasHeroWeaponMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#a16207' : '#090d14'};color:${isAct ? '#ffffff' : '#fef9c3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 MARTIAL INFINITY ARMORIES + 5 ARCANE INFINITY SANCTUMS + 5 OLYMPIAD TOKEN / CODEX EXCHANGES
        </span>
      </div>

      ${featuredExchanges.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredExchanges.map(e => {
            const isMartial = e.exchange_category === 'Martial_Infinity_Armory';
            const isArcane = e.exchange_category === 'Arcane_Infinity_Sanctum';
            const catCol = isMartial ? '#f59e0b' : (isArcane ? '#c084fc' : '#38bdf8');
            const catIcon = isMartial ? '🗡️' : (isArcane ? '🔮' : '📜');
            const zObj = byZid[e.town_zone_id] || {};
            const zidStr = String(e.town_zone_id || '');
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(e.monument_loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(e.town_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(e.exchange_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                    ⚔️ ${escapeHtml(((e.featured_infinity_weapons && e.featured_infinity_weapons[0]) || '').slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    ✨ ${escapeHtml(((e.heroic_skills_unlocked && e.heroic_skills_unlocked[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#422006;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Town Olympiad Monument (5.2×)
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTreasureChestBarHtml(tatlas) {
  const caches = (tatlas && tatlas.treasure_chest_lockpick_grounds) || [];
  if (!caches.length) return '';

  const curMode = ATLAS_TREASURE_CHEST_MODE || ATLAS_STATE_STORE.treasureChestMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🗝️ All 16 Caches' },
    { id: 'Overland_Pirate_Bandit_Cache', label: '🗝️ 6 Overland Pirate/Bandit Caches' },
    { id: 'Underground_Catacomb_Vault', label: '🕳️ 5 Underground Catacomb Vaults' },
    { id: 'Tower_Sanctum_Coffer_Room', label: '🗼 5 Tower Coffer Rooms' }
  ];

  const filteredCaches = curMode === 'Off'
    ? []
    : (curMode === 'All' ? caches : caches.filter(c => c.cache_environment === curMode));

  const featuredCaches = curMode === 'All'
    ? [
        ...caches.filter(c => c.cache_environment === 'Overland_Pirate_Bandit_Cache').slice(0, 1),
        ...caches.filter(c => c.cache_environment === 'Underground_Catacomb_Vault').slice(0, 1),
        ...caches.filter(c => c.cache_environment === 'Tower_Sanctum_Coffer_Room').slice(0, 2)
      ]
    : filteredCaches.slice(0, 4);

  return `
    <div id="atlasTreasureChestBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e1629;border:1px solid rgba(217,70,239,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f5d0fe">🗝️ 16-ZONE TREASURE CHEST LOCKPICK (GRADE 1–8 KEYS) &amp; MIMIC CACHE MATRIX (D56 · 16 CACHES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTreasureChestMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(217,70,239,0.45)'};background:${isAct ? '#86198f' : '#090d14'};color:${isAct ? '#ffffff' : '#fae8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 OVERLAND PIRATE/BANDIT CACHES + 5 UNDERGROUND CATACOMB VAULTS + 5 TOWER COFFER ROOMS
        </span>
      </div>

      ${featuredCaches.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredCaches.map(c => {
            const isOverland = c.cache_environment === 'Overland_Pirate_Bandit_Cache';
            const isCatacomb = c.cache_environment === 'Underground_Catacomb_Vault';
            const catCol = isOverland ? '#fbbf24' : (isCatacomb ? '#e879f9' : '#38bdf8');
            const catIcon = isOverland ? '🗝️' : (isCatacomb ? '🕳️' : '🗼');
            const zidStr = String(c.zone_id || '');
            const didStr = String(c.dungeon_id || '');
            const fidStr = String(c.floor_id || 'B2');
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(c.cache_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(c.chest_level_bracket)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                    🔓 ${escapeHtml(c.deluxe_key_grade_or_skill.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    💎 ${escapeHtml(((c.jackpot_enchant_drops && c.jackpot_enchant_drops[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#4a044e;color:#fae8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Coffer Floor (${escapeHtml(fidStr)})` : 'Jump to Overland Cache (3.8×)'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasAerialDockBarHtml(tatlas) {
  const docks = (tatlas && tatlas.aerial_star_stone_docks) || [];
  if (!docks.length) return '';

  const curMode = ATLAS_AERIAL_DOCK_MODE || ATLAS_STATE_STORE.aerialDockMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🛸 All 12 Aerial Nodes' },
    { id: 'Clan_Airship_Summon_Dock', label: '⚓ 4 Clan Airship Docks' },
    { id: 'Star_Stone_Extraction_Field', label: '☄️ 4 Star Stone Fields' },
    { id: 'Aerial_Raid_Corridor', label: '🦅 4 Aerial Raid Corridors' }
  ];

  const filteredDocks = curMode === 'Off'
    ? []
    : (curMode === 'All' ? docks : docks.filter(d => d.aerial_category === curMode));

  const featuredDocks = curMode === 'All'
    ? [
        ...docks.filter(d => d.aerial_category === 'Clan_Airship_Summon_Dock').slice(0, 1),
        ...docks.filter(d => d.aerial_category === 'Star_Stone_Extraction_Field').slice(0, 1),
        ...docks.filter(d => d.aerial_category === 'Aerial_Raid_Corridor').slice(0, 2)
      ]
    : filteredDocks.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasAerialDockBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0c1e2e;border:1px solid rgba(56,189,248,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bae6fd">🛸 12-NODE CLAN AIRSHIP SUMMON DOCK, STAR STONE EXTRACTION &amp; AERIAL RAID MATRIX (D57 · 12 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasAerialDockMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#e0f2fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 CLAN AIRSHIP DOCKS + 4 STAR STONE EXTRACTION FIELDS + 4 AERIAL RAID CORRIDORS
        </span>
      </div>

      ${featuredDocks.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredDocks.map(d => {
            const isDock = d.aerial_category === 'Clan_Airship_Summon_Dock';
            const isField = d.aerial_category === 'Star_Stone_Extraction_Field';
            const catCol = isDock ? '#38bdf8' : (isField ? '#f43f5e' : '#facc15');
            const catIcon = isDock ? '⚓' : (isField ? '☄️' : '🦅');
            const zObj = byZid[d.zone_id] || {};
            const zidStr = String(d.zone_id || '');
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
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(d.node_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(d.aerial_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    ⛽ ${escapeHtml(d.star_stone_fuel_or_yield.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🦅 ${escapeHtml(((d.aerial_rewards && d.aerial_rewards[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#082f49;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Aerial Dock / Star Stone Node
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasBeltCloakBarHtml(tatlas) {
  const hubs = (tatlas && tatlas.belt_cloak_weaver_hubs) || [];
  if (!hubs.length) return '';

  const curMode = ATLAS_BELT_CLOAK_MODE || ATLAS_STATE_STORE.beltCloakMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🧥 All 14 Hubs' },
    { id: 'Weaver_Olf_Belt_Loom', label: '🧵 5 Weaver Olf Belt Looms' },
    { id: 'Sovereign_Boss_Cloak_Sanctum', label: '🧥 5 Boss Cloak Sanctums' },
    { id: 'Castle_Knight_Cloak_Armory', label: '🎖️ 4 Castle Knight Cloak Armories' }
  ];

  const filteredHubs = curMode === 'Off'
    ? []
    : (curMode === 'All' ? hubs : hubs.filter(h => h.garment_category === curMode));

  const featuredHubs = curMode === 'All'
    ? [
        ...hubs.filter(h => h.garment_category === 'Weaver_Olf_Belt_Loom').slice(0, 1),
        ...hubs.filter(h => h.garment_category === 'Sovereign_Boss_Cloak_Sanctum').slice(0, 2),
        ...hubs.filter(h => h.garment_category === 'Castle_Knight_Cloak_Armory').slice(0, 1)
      ]
    : filteredHubs.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasBeltCloakBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f1726;border:1px solid rgba(192,132,252,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">🧥 14-NODE WEAVER OLF MITHRIL BELT &amp; SOVEREIGN BOSS/CASTLE CLOAK MATRIX (D58 · 14 HUBS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasBeltCloakMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 WEAVER OLF BELT LOOMS + 5 SOVEREIGN BOSS CLOAK SANCTUMS + 4 CASTLE KNIGHT CLOAK ARMORIES
        </span>
      </div>

      ${featuredHubs.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredHubs.map(h => {
            const isLoom = h.garment_category === 'Weaver_Olf_Belt_Loom';
            const isBoss = h.garment_category === 'Sovereign_Boss_Cloak_Sanctum';
            const catCol = isLoom ? '#facc15' : (isBoss ? '#c084fc' : '#38bdf8');
            const catIcon = isLoom ? '🧵' : (isBoss ? '🧥' : '🎖️');
            const zObj = byZid[h.zone_id] || {};
            const zidStr = String(h.zone_id || '');
            const didStr = String(h.dungeon_id || '');
            const fidStr = String(h.floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(h.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(h.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(h.hub_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(h.garment_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    🪡 ${escapeHtml(((h.featured_belts_or_cloaks && h.featured_belts_or_cloaks[0]) || '').slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🎖️ ${escapeHtml(h.unseal_badge_cost.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Cloak Sanctum (${escapeHtml(fidStr)})` : 'Jump to Weaver / Cloak Armory'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasWeddingBarHtml(tatlas) {
  const sanctuaries = (tatlas && tatlas.wedding_ceremony_cathedrals) || [];
  if (!sanctuaries.length) return '';

  const curMode = ATLAS_WEDDING_MODE || ATLAS_STATE_STORE.weddingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💍 All 12 Sanctuaries' },
    { id: 'Grand_Wedding_Cathedral', label: '💒 4 Grand Cathedrals' },
    { id: 'Formal_Wear_Couture_Tailor', label: '👗 4 Formal Wear Tailors' },
    { id: 'Bridal_Procession_Garden', label: '🏹 4 Bridal Gardens' }
  ];

  const filteredSanctuaries = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctuaries : sanctuaries.filter(s => s.ceremony_category === curMode));

  const featuredSanctuaries = curMode === 'All'
    ? [
        ...sanctuaries.filter(s => s.ceremony_category === 'Grand_Wedding_Cathedral').slice(0, 2),
        ...sanctuaries.filter(s => s.ceremony_category === 'Formal_Wear_Couture_Tailor').slice(0, 1),
        ...sanctuaries.filter(s => s.ceremony_category === 'Bridal_Procession_Garden').slice(0, 1)
      ]
    : filteredSanctuaries.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasWeddingBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#241422;border:1px solid rgba(244,114,182,0.58)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fbcfe8">💍 12-SANCTUARY WEDDING CATHEDRAL, FORMAL WEAR &amp; COUPLE TELEPORT MATRIX (D59 · 12 SANCTUARIES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWeddingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(244,114,182,0.45)'};background:${isAct ? '#be185d' : '#090d14'};color:${isAct ? '#ffffff' : '#fce7f3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 GRAND CATHEDRALS + 4 FORMAL WEAR TAILORS + 4 BRIDAL GARDENS · /COUPLETELEPORT (30S)
        </span>
      </div>

      ${featuredSanctuaries.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctuaries.map(s => {
            const isCathedral = s.ceremony_category === 'Grand_Wedding_Cathedral';
            const isTailor = s.ceremony_category === 'Formal_Wear_Couture_Tailor';
            const catCol = isCathedral ? '#f472b6' : (isTailor ? '#facc15' : '#34d399');
            const catIcon = isCathedral ? '💒' : (isTailor ? '👗' : '🏹');
            const zObj = byZid[s.zone_id] || {};
            const zidStr = String(s.zone_id || '');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
            if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctuary_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.ceremony_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fbcfe8;margin-top:1px">
                    🤵 ${escapeHtml(s.officiant_npc_name.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    💍 ${escapeHtml(((s.couple_privileges_unlocked && s.couple_privileges_unlocked[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#831843;color:#fce7f3;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${zidStr.startsWith('zone-field-') ? 'Jump to Bridal Garden (4.8×)' : 'Jump to Town Cathedral (5.2×)'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCouncilBenchmarkBarHtml(tatlas) {
  const benchmarks = (tatlas && tatlas.studio_council_audit_benchmarks) || [];
  if (!benchmarks.length) return '';

  const curMode = ATLAS_COUNCIL_BENCHMARK_MODE || ATLAS_STATE_STORE.councilBenchmarkMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏛️ All 18 Benchmarks' },
    { id: 'Product_Owner', label: '📋 Product Owner' },
    { id: 'Game_Designer_Lead', label: '🎮 Game Designer' },
    { id: 'Player_Growth_Path_Designer', label: '📈 Growth Path' },
    { id: 'Game_Story_Designer', label: '📖 Story' },
    { id: 'Monster_And_Mob_Designer', label: '👾 Monster/Mob' },
    { id: 'Lead_Systems_Map_Architect', label: '🗺️ Systems Architect' }
  ];

  const filteredBenchmarks = curMode === 'Off'
    ? []
    : (curMode === 'All' ? benchmarks : benchmarks.filter(b => b.council_role === curMode));

  const featuredBenchmarks = curMode === 'All'
    ? [
        ...benchmarks.filter(b => b.council_role === 'Product_Owner').slice(0, 1),
        ...benchmarks.filter(b => b.council_role === 'Game_Designer_Lead').slice(0, 1),
        ...benchmarks.filter(b => b.council_role === 'Player_Growth_Path_Designer').slice(0, 1),
        ...benchmarks.filter(b => b.council_role === 'Lead_Systems_Map_Architect').slice(0, 1)
      ]
    : filteredBenchmarks.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  const roleStyleMap = {
    'Product_Owner': { col: '#fde047', icon: '📋' },
    'Game_Designer_Lead': { col: '#38bdf8', icon: '🎮' },
    'Player_Growth_Path_Designer': { col: '#34d399', icon: '📈' },
    'Game_Story_Designer': { col: '#c084fc', icon: '📖' },
    'Monster_And_Mob_Designer': { col: '#f87171', icon: '👾' },
    'Lead_Systems_Map_Architect': { col: '#fb923c', icon: '🗺️' }
  };

  return `
    <div id="atlasCouncilBenchmarkBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#111d24;border:1px solid rgba(250,204,21,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef08a">🏛️ 60-DIMENSION STUDIO COUNCIL BENCHMARK SELECTOR (D60 · 18 BENCHMARKS ACROSS 6 ROLES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCouncilBenchmarkMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(250,204,21,0.45)'};background:${isAct ? '#0e7490' : '#090d14'};color:${isAct ? '#ffffff' : '#fef9c3'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#34d399;font-weight:800">
          6 STUDIO COUNCIL ROLES × 3 BENCHMARKS = 18/18 EXEMPLARS · D1–D60 = 100.0/100
        </span>
      </div>

      ${featuredBenchmarks.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredBenchmarks.map(b => {
            const rs = roleStyleMap[b.council_role] || { col: '#fde047', icon: '🏛️' };
            const zObj = byZid[b.exemplar_zone_id] || {};
            const zidStr = String(b.exemplar_zone_id || '');
            const didStr = String(b.exemplar_dungeon_id || '');
            const fidStr = String(b.exemplar_floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(b.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(b.loc)}')`;
            }
            const dimsTxt = (b.audited_dimension_ids || []).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${rs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${rs.icon} ${escapeHtml(b.benchmark_title.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${rs.col}">${escapeHtml(b.council_role.replace(/_/g, ' ').slice(0, 14))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    📐 [${escapeHtml(dimsTxt)}] · ${escapeHtml(b.mda_pillar_focus)}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✅ ${escapeHtml(b.verification_evidence.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${rs.col};background:#164e63;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ${rs.icon} ${didStr ? `Inspect Dungeon Floor (${escapeHtml(fidStr)})` : 'Jump to Council Exemplar'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasSeedCycleBarHtml(tatlas) {
  const seedNodes = (tatlas && tatlas.continental_seed_cycles) || [];
  if (!seedNodes.length) return '';

  const curMode = ATLAS_SEED_CYCLE_MODE || ATLAS_STATE_STORE.seedCycleMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌑 All 14 Seed Nodes' },
    { id: 'Seed_of_Infinity_Stage', label: '💀 5 Seed of Infinity Stages' },
    { id: 'Seed_of_Destruction_Stage', label: '🐉 5 Seed of Destruction Stages' },
    { id: 'Energy_Compression_Well', label: '⚡ 4 Energy Compression Wells' }
  ];

  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All' ? seedNodes : seedNodes.filter(s => s.seed_category === curMode));

  const featuredNodes = curMode === 'All'
    ? [
        ...seedNodes.filter(s => s.seed_category === 'Seed_of_Infinity_Stage').slice(0, 2),
        ...seedNodes.filter(s => s.seed_category === 'Seed_of_Destruction_Stage').slice(0, 1),
        ...seedNodes.filter(s => s.seed_category === 'Energy_Compression_Well').slice(0, 1)
      ]
    : filteredNodes.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasSeedCycleBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1a1025;border:1px solid rgba(168,85,247,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">🌑 14-NODE CONTINENTAL SEED CYCLE (STAGE 1–5 EKIMUS/TIAT STATE MACHINE) MATRIX (D61 · 14 NODES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSeedCycleMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(168,85,247,0.45)'};background:${isAct ? '#581c87' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 SEED OF INFINITY (EKIMUS) + 5 SEED OF DESTRUCTION (TIAT) + 4 ENERGY COMPRESSION WELLS
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(s => {
            const isInf = s.seed_category === 'Seed_of_Infinity_Stage';
            const isDest = s.seed_category === 'Seed_of_Destruction_Stage';
            const catCol = isInf ? '#c084fc' : (isDest ? '#f87171' : '#38bdf8');
            const catIcon = isInf ? '💀' : (isDest ? '🐉' : '⚡');
            const zObj = byZid[s.zone_id] || {};
            const zidStr = String(s.zone_id || '');
            const didStr = String(s.dungeon_id || '');
            const fidStr = String(s.floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.node_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.cycle_stage_label.slice(0, 18))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    🎖️ ${escapeHtml(s.officer_npc_name.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    💎 ${escapeHtml(((s.featured_s80_rewards && s.featured_s80_rewards[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#3b0764;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Seed Sanctum (${escapeHtml(fidStr)})` : 'Jump to Seed / Energy Well'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasColiseumTournamentBarHtml(tatlas) {
  const arenas = (tatlas && tatlas.party_coliseum_tournaments) || [];
  if (!arenas.length) return '';

  const curMode = ATLAS_COLISEUM_TOURNAMENT_MODE || ATLAS_STATE_STORE.coliseumTournamentMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏟️ All 12 Tournament Rings' },
    { id: 'Underground_Coliseum_Bracket', label: '⚔️ 5 Underground Coliseum Brackets' },
    { id: 'Clan_War_Tournament_Ring', label: '🏰 4 Clan War Rings' },
    { id: 'Royal_Fame_Exhibition_Arena', label: '👑 3 Royal Fame Arenas' }
  ];

  const filteredArenas = curMode === 'Off'
    ? []
    : (curMode === 'All' ? arenas : arenas.filter(a => a.tournament_category === curMode));

  const featuredArenas = curMode === 'All'
    ? [
        ...arenas.filter(a => a.tournament_category === 'Underground_Coliseum_Bracket').slice(0, 2),
        ...arenas.filter(a => a.tournament_category === 'Clan_War_Tournament_Ring').slice(0, 1),
        ...arenas.filter(a => a.tournament_category === 'Royal_Fame_Exhibition_Arena').slice(0, 1)
      ]
    : filteredArenas.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasColiseumTournamentBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#261215;border:1px solid rgba(248,113,113,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fecaca">🏟️ 12-ARENA UNDERGROUND COLISEUM (PARTY-VS-PARTY) &amp; CLAN TOURNAMENT MATRIX (D62 · 12 ARENAS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasColiseumTournamentMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(248,113,113,0.45)'};background:${isAct ? '#991b1b' : '#090d14'};color:${isAct ? '#ffffff' : '#fee2e2'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 UNDERGROUND COLISEUM BRACKETS + 4 CLAN WAR RINGS + 3 ROYAL FAME ARENAS · LIFE TOWER RESPAWN
        </span>
      </div>

      ${featuredArenas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredArenas.map(a => {
            const isCol = a.tournament_category === 'Underground_Coliseum_Bracket';
            const isClan = a.tournament_category === 'Clan_War_Tournament_Ring';
            const catCol = isCol ? '#f87171' : (isClan ? '#fb923c' : '#fde047');
            const catIcon = isCol ? '⚔️' : (isClan ? '🏰' : '👑');
            const zObj = byZid[a.zone_id] || {};
            const zidStr = String(a.zone_id || '');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(a.loc)}')`;
            if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(a.loc)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(a.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(a.arena_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(a.tournament_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fecaca;margin-top:1px">
                    🗼 ${escapeHtml(a.resurrection_tower_mechanic.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🏆 ${escapeHtml(((a.victory_fame_and_rewards && a.victory_fame_and_rewards[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#7f1d1d;color:#fee2e2;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Coliseum / Tournament Ring
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasElementalJewelBarHtml(tatlas) {
  const sanctums = (tatlas && tatlas.elemental_jewel_rune_sanctums) || [];
  if (!sanctums.length) return '';

  const curMode = ATLAS_ELEMENTAL_JEWEL_MODE || ATLAS_STATE_STORE.elementalJewelMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '💎 All 14 Sanctums' },
    { id: 'Elemental_Jewel_Forge', label: '🔥💧🌪️🪨 6 Elemental Jewel Forges' },
    { id: 'Raid_Rune_Stone_Altar', label: '🪨 4 Raid Rune Stone Altars' },
    { id: 'Ancient_Giants_Relic_Vault', label: '🏛️ 4 Ancient Giant\'s Relic Vaults' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctums : sanctums.filter(s => s.relic_tier_category === curMode));

  const featuredSanctums = curMode === 'All'
    ? [
        ...sanctums.filter(s => s.relic_tier_category === 'Elemental_Jewel_Forge').slice(0, 2),
        ...sanctums.filter(s => s.relic_tier_category === 'Raid_Rune_Stone_Altar').slice(0, 1),
        ...sanctums.filter(s => s.relic_tier_category === 'Ancient_Giants_Relic_Vault').slice(0, 1)
      ]
    : filteredSanctums.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasElementalJewelBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0f1d2e;border:1px solid rgba(56,189,248,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bae6fd">💎 14-SANCTUM ELEMENTAL JEWEL, RAID RUNE STONE &amp; ANCIENT GIANT'S RELIC MATRIX (D63 · 14 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasElementalJewelMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#e0f2fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 ELEMENTAL JEWEL FORGES + 4 RAID RUNE STONE ALTARS (LV.83 SKILLS) + 4 ANCIENT GIANT'S RELIC VAULTS
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isJewel = s.relic_tier_category === 'Elemental_Jewel_Forge';
            const isRune = s.relic_tier_category === 'Raid_Rune_Stone_Altar';
            const catCol = isJewel ? '#38bdf8' : (isRune ? '#c084fc' : '#facc15');
            const catIcon = isJewel ? '💎' : (isRune ? '🪨' : '🏛️');
            const zObj = byZid[s.zone_id] || {};
            const zidStr = String(s.zone_id || '');
            const didStr = String(s.dungeon_id || '');
            const fidStr = String(s.floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            } else if (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')) {
              jumpJs = `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctum_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.relic_tier_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🔮 ${escapeHtml(s.featured_jewel_or_rune.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml(s.infusion_power_bonus.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Sanctum Floor (${escapeHtml(fidStr)})` : 'Jump to Overland Forge / Vault'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

