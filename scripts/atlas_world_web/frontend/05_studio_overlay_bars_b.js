function renderAtlasFameMonumentBarHtml(tatlas) {
  const monuments = (tatlas && tatlas.reputation_fame_monuments) || [];
  if (!monuments.length) return '';

  const curMode = ATLAS_FAME_MONUMENT_MODE || ATLAS_STATE_STORE.fameMonumentMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎖️ All 15 Fame Monuments' },
    { id: 'PvP_Weapon_Infusion_Obelisk', label: '⚔️ 5 PvP Weapon Obelisks' },
    { id: 'PvP_Armor_Mirage_Obelisk', label: '🛡️ 5 PvP Armor Mirage Obelisks' },
    { id: 'PK_Pardon_And_CRP_Monument', label: '⚖️ 5 PK Pardon & CRP Monuments' }
  ];

  const filteredMonuments = curMode === 'Off'
    ? []
    : (curMode === 'All' ? monuments : monuments.filter(m => m.fame_service_category === curMode));

  const featuredMonuments = curMode === 'All'
    ? [
        ...monuments.filter(m => m.fame_service_category === 'PvP_Weapon_Infusion_Obelisk').slice(0, 2),
        ...monuments.filter(m => m.fame_service_category === 'PvP_Armor_Mirage_Obelisk').slice(0, 1),
        ...monuments.filter(m => m.fame_service_category === 'PK_Pardon_And_CRP_Monument').slice(0, 1)
      ]
    : filteredMonuments.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasFameMonumentBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1f160c;border:1px solid rgba(251,191,36,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde68a">🎖️ 15-TOWN REPUTATION MANAGER (RAPIDUS / SCIPIO) FAME &amp; PVP INFUSION MATRIX (D64 · 15 MONUMENTS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFameMonumentMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,191,36,0.45)'};background:${isAct ? '#b45309' : '#090d14'};color:${isAct ? '#ffffff' : '#fef3c7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 PVP WEAPON OBELISKS + 5 PVP ARMOR MIRAGE OBELISKS + 5 PK PARDON &amp; CRP MONUMENTS · RAPIDUS / SCIPIO
        </span>
      </div>

      ${featuredMonuments.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredMonuments.map(m => {
            const isWep = m.fame_service_category === 'PvP_Weapon_Infusion_Obelisk';
            const isArm = m.fame_service_category === 'PvP_Armor_Mirage_Obelisk';
            const catCol = isWep ? '#f87171' : (isArm ? '#60a5fa' : '#fbbf24');
            const catIcon = isWep ? '⚔️' : (isArm ? '🛡️' : '⚖️');
            const zObj = byZid[m.town_zone_id] || {};
            const tidStr = String(zObj.studio_node_id || String(m.town_zone_id || '').replace('zone-', ''));
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tidStr)}', '${escapeHtml(m.monument_loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(m.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(m.fame_point_cost_band.slice(0, 18))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    🎖️ ${escapeHtml(m.reputation_manager_npc.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fed7aa;margin-top:1px">
                    ⚡ ${escapeHtml(((m.pvp_seal_infusions && m.pvp_seal_infusions[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#78350f;color:#fef3c7;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Town Fame Monument (5.2×)
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

function renderAtlasDelusionChamberBarHtml(tatlas) {
  const conduits = (tatlas && tatlas.delusion_chamber_conduits) || [];
  if (!conduits.length) return '';

  const curMode = ATLAS_DELUSION_CHAMBER_MODE || ATLAS_STATE_STORE.delusionChamberMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🌀 All 12 Conduits' },
    { id: 'Seal_Delusion_Chamber', label: '🚪 4 Seal Delusion Chambers' },
    { id: 'Great_Tower_Of_Seal_Chamber', label: '🗼 4 Great & Tower of Seal' },
    { id: 'Guiding_Tea_Leaf_Conduit', label: '🍃 4 Guiding Tea Leaf Conduits' }
  ];

  const filteredConduits = curMode === 'Off'
    ? []
    : (curMode === 'All' ? conduits : conduits.filter(c => c.delusion_category === curMode));

  const featuredConduits = curMode === 'All'
    ? [
        ...conduits.filter(c => c.delusion_category === 'Seal_Delusion_Chamber').slice(0, 2),
        ...conduits.filter(c => c.delusion_category === 'Great_Tower_Of_Seal_Chamber').slice(0, 1),
        ...conduits.filter(c => c.delusion_category === 'Guiding_Tea_Leaf_Conduit').slice(0, 1)
      ]
    : filteredConduits.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasDelusionChamberBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e132c;border:1px solid rgba(192,132,252,0.62)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">🌀 12-CONDUIT DELUSION CHAMBER &amp; AENKINEL RAID MATRIX (D65 · 12 CONDUITS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasDelusionChamberMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#7e22ce' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          4 SEAL CHAMBERS + 4 GREAT/TOWER OF SEAL (AENKINEL LV.81–84) + 4 GUIDING TEA LEAF CONDUITS
        </span>
      </div>

      ${featuredConduits.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredConduits.map(c => {
            const isSeal = c.delusion_category === 'Seal_Delusion_Chamber';
            const isTower = c.delusion_category === 'Great_Tower_Of_Seal_Chamber';
            const catCol = isSeal ? '#c084fc' : (isTower ? '#f472b6' : '#34d399');
            const catIcon = isSeal ? '🚪' : (isTower ? '🗼' : '🍃');
            const zObj = byZid[c.zone_id] || {};
            const zidStr = String(c.zone_id || '');
            const didStr = String(c.dungeon_id || '');
            const fidStr = String(c.floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(c.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(c.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(c.chamber_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(c.delusion_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#e9d5ff;margin-top:1px">
                    🧙 ${escapeHtml(c.guardian_npc_name.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🎁 ${escapeHtml(((c.featured_delusion_drops && c.featured_delusion_drops[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#581c87;color:#f3e8ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Delusion Sanctum (${escapeHtml(fidStr)})` : 'Jump to Town Dream Conduit (5.2×)'}
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

function renderAtlasCommandRaidBarHtml(tatlas) {
  const sanctums = (tatlas && tatlas.command_channel_raid_sanctums) || [];
  if (!sanctums.length) return '';

  const curMode = ATLAS_COMMAND_RAID_MODE || ATLAS_STATE_STORE.commandRaidMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚔️ All 14 Sanctums' },
    { id: 'Zaken_Candlelight_Cavern', label: '🏴‍☠️ 5 Zaken Candlelight Caverns' },
    { id: 'Ice_Queen_Freya_Palace', label: '❄️ 5 Ice Queen Freya Palaces' },
    { id: 'Frintezza_Organ_Concert_Hall', label: '🎻 4 Frintezza Organ Halls' }
  ];

  const filteredSanctums = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctums : sanctums.filter(s => s.expedition_wing === curMode));

  const featuredSanctums = curMode === 'All'
    ? [
        ...sanctums.filter(s => s.expedition_wing === 'Zaken_Candlelight_Cavern').slice(0, 2),
        ...sanctums.filter(s => s.expedition_wing === 'Ice_Queen_Freya_Palace').slice(0, 1),
        ...sanctums.filter(s => s.expedition_wing === 'Frintezza_Organ_Concert_Hall').slice(0, 1)
      ]
    : filteredSanctums.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasCommandRaidBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#112233;border:1px solid rgba(56,189,248,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#bae6fd">⚔️ 14-SANCTUM ZAKEN CANDLELIGHT, ICE QUEEN FREYA &amp; FRINTEZZA ORGAN COMMAND-CHANNEL MATRIX (D66 · 14 SANCTUMS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCommandRaidMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0284c7' : '#090d14'};color:${isAct ? '#ffffff' : '#e0f2fe'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 ZAKEN CANDLELIGHT DECKS + 5 FREYA GLACIAL PALACES + 4 FRINTEZZA PIPE ORGAN HALLS (9–450P CC)
        </span>
      </div>

      ${featuredSanctums.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctums.map(s => {
            const isZaken = s.expedition_wing === 'Zaken_Candlelight_Cavern';
            const isFreya = s.expedition_wing === 'Ice_Queen_Freya_Palace';
            const catCol = isZaken ? '#f59e0b' : (isFreya ? '#38bdf8' : '#f43f5e');
            const catIcon = isZaken ? '🏴‍☠️' : (isFreya ? '❄️' : '🎻');
            const zObj = byZid[s.zone_id] || {};
            const zidStr = String(s.zone_id || '');
            const didStr = String(s.dungeon_id || '');
            const fidStr = String(s.floor_id || 'B3');
            let jumpJs = `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`;
            if (didStr) {
              jumpJs = `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`;
            } else if (zidStr.startsWith('zone-field-')) {
              jumpJs = `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`;
            }
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.sanctum_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.expedition_wing.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🕯️ ${escapeHtml(s.signature_puzzle_mechanic.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    👑 ${escapeHtml(((s.sovereign_expedition_drops && s.sovereign_expedition_drops[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} ${didStr ? `Open Raid Sanctum (${escapeHtml(fidStr)})` : 'Jump to Expedition Guide (5.2×)'}
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

function renderAtlasNevitBlessingBarHtml(tatlas) {
  const sanctuaries = (tatlas && tatlas.nevit_blessing_sanctuaries) || [];
  if (!sanctuaries.length) return '';

  const curMode = ATLAS_NEVIT_BLESSING_MODE || ATLAS_STATE_STORE.nevitBlessingMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⏳ All 15 Sanctuaries' },
    { id: 'Nevit_Hourglass_Altar', label: "⏳ 5 Nevit's Hourglass Altars" },
    { id: 'Arcane_Fairy_Helper_Sanctuary', label: '🧚 5 Arcane Fairy Sanctuaries' },
    { id: 'Martial_Turtle_Helper_Sanctuary', label: '🐢 5 Martial Turtle Sanctuaries' }
  ];

  const filteredSanctuaries = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sanctuaries : sanctuaries.filter(s => s.blessing_category === curMode));

  const featuredSanctuaries = curMode === 'All'
    ? [
        ...sanctuaries.filter(s => s.blessing_category === 'Nevit_Hourglass_Altar').slice(0, 2),
        ...sanctuaries.filter(s => s.blessing_category === 'Arcane_Fairy_Helper_Sanctuary').slice(0, 1),
        ...sanctuaries.filter(s => s.blessing_category === 'Martial_Turtle_Helper_Sanctuary').slice(0, 1)
      ]
    : filteredSanctuaries.slice(0, 4);

  const all63 = getAllAtlas63Zones(tatlas);
  const byZid = {};
  all63.forEach(z => { byZid[z.zone_id] = z; });

  return `
    <div id="atlasNevitBlessingBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#271a0c;border:1px solid rgba(251,191,36,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fef3c7">⏳ 15-TOWN NEVIT'S BLESSING &amp; HUNTING HELPER SELECTOR (D67 · 15/15 TOWNS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasNevitBlessingMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(251,191,36,0.45)'};background:${isAct ? '#b45309' : '#090d14'};color:${isAct ? '#ffffff' : '#fef3c7'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#34d399;font-weight:800">
          5 NEVIT HOURGLASS ALTARS (+50% EXP) + 5 ARCANE FAIRY HELPERS + 5 MARTIAL TURTLE HELPERS
        </span>
      </div>

      ${featuredSanctuaries.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSanctuaries.map(s => {
            const isNevit = s.blessing_category === 'Nevit_Hourglass_Altar';
            const isFairy = s.blessing_category === 'Arcane_Fairy_Helper_Sanctuary';
            const catCol = isNevit ? '#fbbf24' : (isFairy ? '#f472b6' : '#34d399');
            const catIcon = isNevit ? '⏳' : (isFairy ? '🧚' : '🐢');
            const zObj = byZid[s.town_zone_id] || {};
            const tidStr = String(zObj.studio_node_id || String(s.town_zone_id || '').replace('zone-', ''));
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tidStr)}', '${escapeHtml(s.sanctuary_loc)}')`;
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${catCol};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${catIcon} ${escapeHtml(s.town_name.slice(0, 32))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${catCol}">${escapeHtml(s.blessing_category.split('_')[0])}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    🙏 ${escapeHtml(s.nevit_blessing_effect.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                    🐾 ${escapeHtml(((s.featured_hunting_helpers && s.featured_hunting_helpers[0]) || '').slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${catCol};background:#78350f;color:#fef3c7;font-size:8px;font-weight:800;cursor:pointer">
                    ${catIcon} Jump to Town Priest of Blessing (5.2×)
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

function renderAtlasCouncilSignoffBarHtml(tatlas) {
  const records = (tatlas && tatlas.eight_hour_council_signoff_ledger) || [];
  if (!records.length) return '';

  const curMode = ATLAS_COUNCIL_SIGNOFF_MODE || ATLAS_STATE_STORE.councilSignoffMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🏆 All 24 Sign-Off Records' },
    { id: 'Product_Owner', label: '📋 Product Owner' },
    { id: 'Game_Designer_Lead', label: '🎮 Game Designer' },
    { id: 'Player_Growth_Path_Designer', label: '📈 Growth Path' },
    { id: 'Game_Story_Designer', label: '📖 Story' },
    { id: 'Monster_And_Mob_Designer', label: '👾 Monster/Mob' },
    { id: 'Lead_Systems_Map_Architect', label: '🗺️ Systems Architect' }
  ];

  const filteredRecords = curMode === 'Off'
    ? []
    : (curMode === 'All' ? records : records.filter(r => r.council_role === curMode));

  const featuredRecords = curMode === 'All'
    ? [
        ...records.filter(r => r.council_role === 'Product_Owner').slice(-1),
        ...records.filter(r => r.council_role === 'Game_Designer_Lead').slice(-1),
        ...records.filter(r => r.council_role === 'Player_Growth_Path_Designer').slice(-1),
        ...records.filter(r => r.council_role === 'Lead_Systems_Map_Architect').slice(-1)
      ]
    : filteredRecords.slice(0, 4);

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
    <div id="atlasCouncilSignoffBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0c221b;border:1px solid rgba(52,211,153,0.72)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a7f3d0">🏆 68-DIMENSION 8-HOUR STUDIO COUNCIL FINAL SIGN-OFF SELECTOR (D68 · 24/24 RECORDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCouncilSignoffMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#047857' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 STUDIO COUNCIL ROLES × 4 WAVE EPOCHS (WAVES 1–32) = 24/24 APPROVED · D1–D68 = 100.0/100
        </span>
      </div>

      ${ featuredRecords.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredRecords.map(r => {
            const rs = roleStyleMap[r.council_role] || { col: '#34d399', icon: '🏆' };
            const zObj = byZid[r.zone_id] || {};
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
            const dimsTxt = (r.certified_dimensions || []).join('·');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${rs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${rs.icon} ${escapeHtml(r.pillar_domain_title.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${rs.col}">${escapeHtml(r.certified_wave_range.slice(0, 16))}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#6ee7b7;margin-top:1px">
                    ✅ [${escapeHtml(dimsTxt)}] · ${escapeHtml(r.signoff_verdict.slice(0, 36))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    📜 ${escapeHtml(r.architectural_proof_note.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${rs.col};background:#065f46;color:#ecfdf5;font-size:8px;font-weight:800;cursor:pointer">
                    ${rs.icon} ${didStr ? `Open Certified Sanctum (${escapeHtml(fidStr)})` : 'Jump to Certified Zone'}
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

function renderAtlasChampionMobBarHtml(tatlas) {
  const grounds = (tatlas && tatlas.champion_mob_herd_grounds) || [];
  if (!grounds.length) return '';

  const curMode = ATLAS_CHAMPION_MOB_MODE || ATLAS_STATE_STORE.championMobMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚡ All 16 Champion & Herd Grounds' },
    { id: 'Blue_Aura_10x_Champion_Field', label: '🔵 Blue Aura 10× Champion (6)' },
    { id: 'Crimson_Aura_50x_Champion_Sanctum', label: '🔴 Crimson Aura 50× Champion (5)' },
    { id: 'Social_Herd_Leader_Pack_Ground', label: '🐺 Social Herd Leader Packs (5)' }
  ];

  const filteredGrounds = curMode === 'Off'
    ? []
    : (curMode === 'All' ? grounds : grounds.filter(g => g.champion_category === curMode));

  const featuredGrounds = curMode === 'All'
    ? [
        ...grounds.filter(g => g.champion_category === 'Blue_Aura_10x_Champion_Field').slice(0, 2),
        ...grounds.filter(g => g.champion_category === 'Crimson_Aura_50x_Champion_Sanctum').slice(0, 1),
        ...grounds.filter(g => g.champion_category === 'Social_Herd_Leader_Pack_Ground').slice(0, 1)
      ]
    : filteredGrounds.slice(0, 4);

  const catStyleMap = {
    'Blue_Aura_10x_Champion_Field': { col: '#38bdf8', badge: 'BLUE 10×', icon: '🔵' },
    'Crimson_Aura_50x_Champion_Sanctum': { col: '#ef4444', badge: 'RED 50×', icon: '🔴' },
    'Social_Herd_Leader_Pack_Ground': { col: '#fbbf24', badge: 'HERD PACK', icon: '🐺' }
  };

  return `
    <div id="atlasChampionMobBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1e1326;border:1px solid rgba(239,68,68,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fca5a5">⚡ CHAMPION MOB AURA (BLUE 10× / RED 50×) &amp; GROUP HERD LEADER SELECTOR (D69 · 16 GROUNDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasChampionMobMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(239,68,68,0.45)'};background:${isAct ? '#991b1b' : '#090d14'};color:${isAct ? '#ffffff' : '#fecaca'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 BLUE 10× FIELDS · 5 RED 50× SANCTUMS · 5 SOCIAL HERD PACK GROUNDS (BEAST FARM / STAKATO / MAHUM)
        </span>
      </div>

      ${featuredGrounds.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredGrounds.map(g => {
            const cs = catStyleMap[g.champion_category] || { col: '#ef4444', badge: 'CHAMPION', icon: '⚡' };
            const zidStr = String(g.zone_id || '');
            const didStr = String(g.dungeon_id || '');
            const fidStr = String(g.floor_id || 'B2');
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`;
            const jackpotTxt = (g.spoil_and_drop_jackpot || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(g.ground_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}] ${escapeHtml(g.level_bracket)}</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#93c5fd;margin-top:1px">
                    👾 ${escapeHtml(g.signature_champion_mob.slice(0, 52))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    💎 ${escapeHtml(jackpotTxt.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#450a0a;color:#fef2f2;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Open Champion Sanctum (${escapeHtml(fidStr)})` : 'Open Field Blueprint (4.8×)'}
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

function renderAtlasDualswordForgeBarHtml(tatlas) {
  const forges = (tatlas && tatlas.dualsword_craft_unseal_forges) || [];
  if (!forges.length) return '';

  const curMode = ATLAS_DUALSWORD_FORGE_MODE || ATLAS_STATE_STORE.dualswordForgeMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '⚔️ All 15 Town Dualsword Forges' },
    { id: 'Starter_C_B_Dualsword_Anvil', label: '🗡️ Starter C/B Dualsword Anvils (5)' },
    { id: 'A_S_Grade_Craft_Stamp_Forge', label: '📜 A/S Craft Stamp Forges (5)' },
    { id: 'Maestro_Ishuma_S80_S84_Unseal_Dock', label: '🛸 Maestro Ishuma S80/S84 Docks (5)' }
  ];

  const filteredForges = curMode === 'Off'
    ? []
    : (curMode === 'All' ? forges : forges.filter(f => f.dualsword_tier_category === curMode));

  const featuredForges = curMode === 'All'
    ? [
        ...forges.filter(f => f.dualsword_tier_category === 'Starter_C_B_Dualsword_Anvil').slice(0, 1),
        ...forges.filter(f => f.dualsword_tier_category === 'A_S_Grade_Craft_Stamp_Forge').slice(0, 2),
        ...forges.filter(f => f.dualsword_tier_category === 'Maestro_Ishuma_S80_S84_Unseal_Dock').slice(0, 1)
      ]
    : filteredForges.slice(0, 4);

  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });

  const catStyleMap = {
    'Starter_C_B_Dualsword_Anvil': { col: '#38bdf8', badge: 'C/B-GRADE', icon: '🗡️' },
    'A_S_Grade_Craft_Stamp_Forge': { col: '#f59e0b', badge: 'A/S STAMP', icon: '📜' },
    'Maestro_Ishuma_S80_S84_Unseal_Dock': { col: '#c084fc', badge: 'S80/S84 ISHUMA', icon: '🛸' }
  };

  return `
    <div id="atlasDualswordForgeBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#1c162b;border:1px solid rgba(192,132,252,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#e9d5ff">⚔️ 15-TOWN DUALSWORD CRAFT STAMP &amp; MAESTRO ISHUMA S80/S84 UNSEAL SELECTOR (D70):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasDualswordForgeMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(192,132,252,0.45)'};background:${isAct ? '#6b21a8' : '#090d14'};color:${isAct ? '#ffffff' : '#f3e8ff'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 C/B ANVILS (SOP) · 5 A/S CRAFT STAMP FORGES · 5 MAESTRO ISHUMA S80/S84 DOCKS (+4 PASSIVE)
        </span>
      </div>

      ${featuredForges.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredForges.map(f => {
            const cs = catStyleMap[f.dualsword_tier_category] || { col: '#c084fc', badge: 'DUALSWORD', icon: '⚔️' };
            const tObj = byTownId[f.town_zone_id] || {};
            const tNodeId = tObj.studio_node_id || f.town_zone_id.replace('zone-', '');
            const pairTxt = (f.signature_dualsword_pairings || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(f.town_name.split('(')[0].trim())}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#d8b4fe;margin-top:1px">
                    ⚔️ ${escapeHtml(pairTxt.slice(0, 52))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✨ ${escapeHtml(f.plus_four_enchant_passive.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="focusTownStreetBlueprint('${escapeHtml(tNodeId)}', '${escapeHtml(f.anvil_loc)}')"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#3b0764;color:#faf5ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump to Dualsword Anvil (5.2×)
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

function renderAtlasTechArtPipelineBarHtml(tatlas) {
  const gates = (tatlas && tatlas.tech_art_asset_pipeline_gates) || [];
  if (!gates.length) return '';

  const curMode = ATLAS_TECH_ART_PIPELINE_MODE || ATLAS_STATE_STORE.techArtPipelineMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🎨 All 16 Asset Gates' },
    { id: 'Three_Tier_GLB_Asset_Gate', label: '📦 6 3-Tier GLB Gates' },
    { id: 'Polygon_Bone_Shader_Validator', label: '📐 5 Poly/Bone/Shader Validators' },
    { id: 'Godot_World_Chunk_Streaming_Baker', label: '🗺️ 5 Godot Chunk Bakers' }
  ];

  const filteredGates = curMode === 'Off'
    ? []
    : (curMode === 'All' ? gates : gates.filter(g => g.pipeline_stage_category === curMode));

  const featuredGates = curMode === 'All'
    ? [
        ...gates.filter(g => g.pipeline_stage_category === 'Three_Tier_GLB_Asset_Gate').slice(0, 2),
        ...gates.filter(g => g.pipeline_stage_category === 'Polygon_Bone_Shader_Validator').slice(0, 1),
        ...gates.filter(g => g.pipeline_stage_category === 'Godot_World_Chunk_Streaming_Baker').slice(0, 1)
      ]
    : filteredGates.slice(0, 4);

  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });

  const catStyleMap = {
    'Three_Tier_GLB_Asset_Gate': { col: '#34d399', badge: '3-TIER GLB', icon: '📦' },
    'Polygon_Bone_Shader_Validator': { col: '#f472b6', badge: 'POLY/BONE/SHADER', icon: '📐' },
    'Godot_World_Chunk_Streaming_Baker': { col: '#38bdf8', badge: 'CHUNK BAKER', icon: '🗺️' }
  };

  return `
    <div id="atlasTechArtPipelineBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#112224;border:1px solid rgba(52,211,153,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#6ee7b7">🎨 [STAGE 2: ASSET &amp; BUILD PIPELINE] TECHNICAL ARTIST 3-TIER GLB, POLY/BONE &amp; CHUNK BAKER SELECTOR (D71 · 16 GATES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTechArtPipelineMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.45)'};background:${isAct ? '#065f46' : '#090d14'};color:${isAct ? '#ffffff' : '#d1fae5'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 3-TIER GLB GATES · 5 POLY/BONE/90-120CM SCALE VALIDATORS · 5 GODOT 4 CHUNK/NAVMESH BAKERS
        </span>
      </div>

      ${featuredGates.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredGates.map(g => {
            const cs = catStyleMap[g.pipeline_stage_category] || { col: '#34d399', badge: 'TECH ART', icon: '🎨' };
            const zidStr = String(g.zone_id || '');
            const didStr = String(g.dungeon_id || '');
            const fidStr = String(g.floor_id || 'B3');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(g.loc)}')`
                  : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                      ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`
                      : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`));
            const ciTxt = (g.automated_ci_validators || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(g.gate_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    📐 ${escapeHtml(g.polygon_and_bone_budget.slice(0, 54))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✅ ${escapeHtml(ciTxt.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#064e3b;color:#ecfdf5;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Inspect Dungeon Chunk (${escapeHtml(fidStr)})` : 'Inspect Zone Asset Gate'}
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

function renderAtlasBotSwarmSimBarHtml(tatlas) {
  const sectors = (tatlas && tatlas.backend_bot_swarm_simulation_sectors) || [];
  if (!sectors.length) return '';

  const curMode = ATLAS_BOT_SWARM_SIM_MODE || ATLAS_STATE_STORE.botSwarmSimMode || 'All';
  const modePills = [
    { id: 'Off', label: '⏸️ Off' },
    { id: 'All', label: '🤖 All 16 Sim Sectors' },
    { id: 'Headless_10k_Bot_Swarm_Sector', label: '🤖 6 10k-Bot Swarm Sectors' },
    { id: 'Spatial_Grid_AOI_Partition_Cell', label: '🕸️ 5 Spatial Grid AOI Cells' },
    { id: 'Deterministic_Replay_Desync_Probe', label: '⏪ 5 Deterministic Replay Probes' }
  ];

  const filteredSectors = curMode === 'Off'
    ? []
    : (curMode === 'All' ? sectors : sectors.filter(s => s.simulation_category === curMode));

  const featuredSectors = curMode === 'All'
    ? [
        ...sectors.filter(s => s.simulation_category === 'Headless_10k_Bot_Swarm_Sector').slice(0, 2),
        ...sectors.filter(s => s.simulation_category === 'Spatial_Grid_AOI_Partition_Cell').slice(0, 1),
        ...sectors.filter(s => s.simulation_category === 'Deterministic_Replay_Desync_Probe').slice(0, 1)
      ]
    : filteredSectors.slice(0, 4);

  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });

  const catStyleMap = {
    'Headless_10k_Bot_Swarm_Sector': { col: '#38bdf8', badge: '10K BOT SWARM', icon: '🤖' },
    'Spatial_Grid_AOI_Partition_Cell': { col: '#a855f7', badge: 'SPATIAL AOI', icon: '🕸️' },
    'Deterministic_Replay_Desync_Probe': { col: '#fbbf24', badge: 'REPLAY PROBE', icon: '⏪' }
  };

  return `
    <div id="atlasBotSwarmSimBar" style="display:flex;flex-direction:column;gap:6px;padding:7px 10px;border-radius:8px;background:#0f1d2e;border:1px solid rgba(56,189,248,0.68)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#7dd3fc">🤖 [STAGE 3: SERVER &amp; SIMULATION] 10K-BOT SWARM, SPATIAL GRID AOI &amp; REPLAY SELECTOR (D72 · 16 SECTORS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasBotSwarmSimMode('${escapeHtml(mp.id)}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.6px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#090d14'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 10K-BOT SWARM SECTORS (0.503MS/20HZ) · 5 SPATIAL GRID AOI CELLS (&lt;5KB/S) · 5 GOLDEN REPLAY PROBES
        </span>
      </div>

      ${featuredSectors.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSectors.map(s => {
            const cs = catStyleMap[s.simulation_category] || { col: '#38bdf8', badge: 'SIM SECTOR', icon: '🤖' };
            const zidStr = String(s.zone_id || '');
            const didStr = String(s.dungeon_id || '');
            const fidStr = String(s.floor_id || 'B3');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`
                  : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                      ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`
                      : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`));
            const assertTxt = (s.stress_test_assertions || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(s.sector_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#93c5fd;margin-top:1px">
                    ⚡ ${escapeHtml(s.bot_concurrency_and_tick_budget.slice(0, 54))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🔬 ${escapeHtml(assertTxt.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#0c4a6e;color:#f0f9ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Open Sim Dungeon (${escapeHtml(fidStr)})` : 'Jump to Sim Sector'}
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

// D73: Interactive 15-Node [Stage 4: LiveOps, Build & GM Portal] Stuck-Character Rescue, Inventory Rollback Audit & Zero-Restart Hot-Config Bar
function renderAtlasLiveopsGmBarHtml(tatlas) {
  const anchors = (tatlas && tatlas.liveops_gm_control_anchors) || [];
  const curMode = ATLAS_LIVEOPS_GM_MODE || ATLAS_STATE_STORE.liveopsGmMode || 'All';
  const modePills = [
    { id: 'All', label: '🌐 All LiveOps & GM Anchors (15)' },
    { id: 'GM_Stuck_Character_Rescue_Anchor', label: '🛟 GM Stuck-Character Rescue (5)' },
    { id: 'Inventory_Rollback_Audit_Vault', label: '🔐 Inventory Rollback Audit (5)' },
    { id: 'Zero_Restart_Live_Event_Hot_Config', label: '🔥 Zero-Restart Hot-Config (5)' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredAnchors = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? anchors
        : anchors.filter(a => a.liveops_category === curMode));
  const featuredAnchors = filteredAnchors.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const catStyleMap = {
    'GM_Stuck_Character_Rescue_Anchor': { col: '#34d399', badge: 'STUCK RESCUE', icon: '🛟' },
    'Inventory_Rollback_Audit_Vault': { col: '#c084fc', badge: 'ROLLBACK VAULT', icon: '🔐' },
    'Zero_Restart_Live_Event_Hot_Config': { col: '#fb923c', badge: 'HOT-CONFIG', icon: '🔥' }
  };

  return `
    <div id="atlasLiveopsGmBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#fb923c;margin-right:2px">
            🛟 [STAGE 4: LIVEOPS, BUILD &amp; GM PORTAL] (D73):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasLiveopsGmMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#fb923c' : 'rgba(255,255,255,0.14)'};background:${act ? '#7c2d12' : '#0f172a'};color:${act ? '#fff7ed' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 GM STUCK-CHARACTER RESCUE · 5 INVENTORY ROLLBACK VAULTS · 5 ZERO-RESTART HOT-CONFIGS
        </span>
      </div>

      ${featuredAnchors.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredAnchors.map(a => {
            const cs = catStyleMap[a.liveops_category] || { col: '#fb923c', badge: 'LIVEOPS GM', icon: '🛟' };
            const tidStr = String(a.town_zone_id || '');
            const tObj = byTownId[tidStr];
            const locVal = a.anchor_loc || a.loc || '-84120:243500';
            const jumpJs = tObj
              ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || tidStr.replace('zone-', ''))}', '${escapeHtml(locVal)}')`
              : `focusTownStreetBlueprint('${escapeHtml(tidStr.replace('zone-', ''))}', '${escapeHtml(locVal)}')`;
            const anchorTitle = a.anchor_name || a.town_name || a.anchor_id || 'LiveOps GM Anchor';
            const cmdList = Array.isArray(a.gm_portal_command_suite) ? a.gm_portal_command_suite.join(' · ') : (a.gm_portal_action_and_rollback_sla || a.sla_and_build_farm_hook || '');
            const guardTxt = (a.safety_and_audit_guards || a.hot_config_and_audit_features || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(String(anchorTitle).slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fdba74;margin-top:1px">
                    🛡️ ${escapeHtml(String(cmdList).slice(0, 54))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🔒 ${escapeHtml(String(guardTxt).slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#431407;color:#fff7ed;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump to Town LiveOps Anchor
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

// D74: Interactive 20-Tool [4-Domain × 5-Role Platform & Tools Squad] Unified Studio Pipeline Registry Bar
function renderAtlasToolsSquadBarHtml(tatlas) {
  const tools = (tatlas && tatlas.platform_tools_squad_registry) || [];
  const curMode = ATLAS_TOOLS_SQUAD_MODE || ATLAS_STATE_STORE.toolsSquadMode || 'All';
  const modePills = [
    { id: 'All', label: '🌐 All 20 Studio Squad Tools (4D×5R)' },
    { id: 'Stage_1_Content_And_World', label: '🗺️ Stage 1: Content & World (5)' },
    { id: 'Stage_2_Asset_And_Build_Pipeline', label: '🎨 Stage 2: Asset & Build (5)' },
    { id: 'Stage_3_Server_And_Simulation', label: '🤖 Stage 3: Server & Sim (5)' },
    { id: 'Stage_4_LiveOps_And_GM', label: '🛟 Stage 4: LiveOps & GM (5)' },
    { id: 'Lead_Tools_Pipeline_Architect', label: '🏛️ Lead Architect (4)' },
    { id: 'Content_World_Tools_Engineer', label: '🧭 Content/World Eng (4)' },
    { id: 'Technical_Artist_Pipeline_DCC', label: '📐 Tech Artist (4)' },
    { id: 'Backend_Simulation_Infra_Engineer', label: '⚡ Backend Sim Eng (4)' },
    { id: 'LiveOps_Build_GM_Engineer', label: '🚀 LiveOps/GM Eng (4)' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredTools = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? tools
        : tools.filter(t => t.tooling_domain === curMode || t.owner_squad_role === curMode));
  const featuredTools = filteredTools.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const domStyleMap = {
    'Stage_1_Content_And_World': { col: '#fde047', badge: 'STAGE 1 CONTENT', icon: '🗺️' },
    'Stage_2_Asset_And_Build_Pipeline': { col: '#34d399', badge: 'STAGE 2 ASSET', icon: '🎨' },
    'Stage_3_Server_And_Simulation': { col: '#38bdf8', badge: 'STAGE 3 SERVER', icon: '🤖' },
    'Stage_4_LiveOps_And_GM': { col: '#fb923c', badge: 'STAGE 4 LIVEOPS', icon: '🛟' }
  };

  return `
    <div id="atlasToolsSquadBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#e879f9;margin-right:2px">
            🛠️ [4-DOMAIN × 5-ROLE PLATFORM &amp; TOOLS SQUAD REGISTRY] (D74):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasToolsSquadMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#e879f9' : 'rgba(255,255,255,0.14)'};background:${act ? '#701a75' : '#0f172a'};color:${act ? '#fdf4ff' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 TOOLS/STAGE × 4 TOOLS/ROLE · EMBEDDED DX · SSOT SCHEMA · WEB-FIRST SUITE
        </span>
      </div>

      ${featuredTools.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredTools.map(t => {
            const ds = domStyleMap[t.tooling_domain] || { col: '#e879f9', badge: 'SQUAD TOOL', icon: '🛠️' };
            const zidStr = String(t.exemplar_zone_id || '');
            const didStr = String(t.exemplar_dungeon_id || '');
            const fidStr = String(t.exemplar_floor_id || 'B3');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(t.loc)}')`
                  : (zidStr.startsWith('zone-harbor-') || zidStr.startsWith('zone-fortress-') || zidStr.startsWith('zone-clanhall-')
                      ? `focusFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(t.loc)}')`
                      : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(t.loc)}')`));
            const capTxt = (t.capabilities_and_ssot_hooks || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${ds.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${ds.icon} ${escapeHtml(t.tool_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${ds.col}">[${ds.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                    👤 ${escapeHtml(t.owner_squad_role)} · ${escapeHtml(t.architectural_principle_enforced)}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚙️ ${escapeHtml(capTxt.slice(0, 58))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${ds.col};background:#4a044e;color:#fdf4ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${ds.icon} ${didStr ? `Inspect Exemplar Dungeon (${escapeHtml(fidStr)})` : 'Inspect Exemplar Zone'}
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

// D75: Interactive 18-Graph [Role 2: Content & World Tools Engineer] Branching Dialogue DAG & EN/TH Localization Validator Bar
function renderAtlasDialogueGraphBarHtml(tatlas) {
  const graphs = (tatlas && tatlas.dialogue_localization_graphs) || [];
  const curMode = ATLAS_DIALOGUE_GRAPH_MODE || ATLAS_STATE_STORE.dialogueGraphMode || 'All';
  const modePills = [
    { id: 'All', label: '🌐 All 18 Dialogue Graphs' },
    { id: 'Main_Story_Dialogue_DAG', label: '📖 6 Main Story DAGs' },
    { id: 'Class_Trial_Branching_Tree', label: '⚔️ 6 Class Trial Trees' },
    { id: 'Racial_Lore_Localization_Bundle', label: '🌐 6 EN/TH Localization Bundles' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredGraphs = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? graphs
        : graphs.filter(g => g.graph_category === curMode));
  const featuredGraphs = filteredGraphs.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const catStyleMap = {
    'Main_Story_Dialogue_DAG': { col: '#38bdf8', badge: 'MAIN STORY DAG', icon: '📖' },
    'Class_Trial_Branching_Tree': { col: '#f472b6', badge: 'CLASS TRIAL TREE', icon: '⚔️' },
    'Racial_Lore_Localization_Bundle': { col: '#34d399', badge: 'EN/TH I18N BUNDLE', icon: '🌐' }
  };

  return `
    <div id="atlasDialogueGraphBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#38bdf8;margin-right:2px">
            💬 [ROLE 2: CONTENT TOOLS — 18-GRAPH DIALOGUE DAG &amp; EN/TH LOCALIZATION] (D75):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasDialogueGraphMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#38bdf8' : 'rgba(255,255,255,0.14)'};background:${act ? '#0c4a6e' : '#0f172a'};color:${act ? '#f0f9ff' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MAIN STORY DAGS · 6 CLASS TRIAL TREES · 6 EN/TH LOCALIZATION BUNDLES · 2-CLICK NODE DX
        </span>
      </div>

      ${featuredGraphs.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredGraphs.map(g => {
            const cs = catStyleMap[g.graph_category] || { col: '#38bdf8', badge: 'DIALOGUE DAG', icon: '💬' };
            const zidStr = String(g.zone_id || '');
            const didStr = String(g.dungeon_id || '');
            const fidStr = String(g.floor_id || 'B2');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(g.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(g.loc)}')`);
            const valTxt = (g.automated_graph_validators || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(g.graph_title.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    🧬 ${escapeHtml(g.race_id)} · ${escapeHtml(g.dialogue_node_and_branch_count.slice(0, 42))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🌐 ${escapeHtml(g.i18n_key_prefix_and_parity.slice(0, 56))} · ${escapeHtml(valTxt.slice(0, 34))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#082f49;color:#f0f9ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Jump to Trial Dungeon (${escapeHtml(fidStr)})` : 'Jump to Town Dialogue NPC'}
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

// D76: Interactive 16-Zone [Role 1 & 2: Visual Spawner & Economy Balancer Suite] Visual Spawner, Monte-Carlo Loot Balancer & Hot-Reload SSOT Write-Back Bar
function renderAtlasSpawnerBalancerBarHtml(tatlas) {
  const suites = (tatlas && tatlas.spawner_loot_balancer_suites) || [];
  const curMode = ATLAS_SPAWNER_BALANCER_MODE || ATLAS_STATE_STORE.spawnerBalancerMode || 'All';
  const modePills = [
    { id: 'All', label: '🌐 All 16 Balancer Suites' },
    { id: 'Visual_Spawner_Leash_Editor', label: '📍 6 Visual Spawner Editors' },
    { id: 'Monte_Carlo_Loot_Inflation_Balancer', label: '🎲 5 Monte-Carlo Loot Balancers' },
    { id: 'Hot_Reload_SSOT_Writeback_Bridge', label: '🔄 5 Hot-Reload SSOT Bridges' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredSuites = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? suites
        : suites.filter(s => s.balancer_category === curMode));
  const featuredSuites = filteredSuites.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const catStyleMap = {
    'Visual_Spawner_Leash_Editor': { col: '#a3e635', badge: 'VISUAL SPAWNER', icon: '📍' },
    'Monte_Carlo_Loot_Inflation_Balancer': { col: '#facc15', badge: 'MONTE-CARLO LOOT', icon: '🎲' },
    'Hot_Reload_SSOT_Writeback_Bridge': { col: '#c084fc', badge: 'SSOT WRITE-BACK', icon: '🔄' }
  };

  return `
    <div id="atlasSpawnerBalancerBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#a3e635;margin-right:2px">
            ⚖️ [ROLE 1 &amp; 2: SPAWNER &amp; ECONOMY TOOLS — VISUAL SPAWNER &amp; LOOT BALANCER] (D76):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSpawnerBalancerMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#a3e635' : 'rgba(255,255,255,0.14)'};background:${act ? '#365314' : '#0f172a'};color:${act ? '#f7fee7' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 VISUAL SPAWNER EDITORS · 5 MONTE-CARLO LOOT BALANCERS · 5 HOT-RELOAD SSOT BRIDGES
        </span>
      </div>

      ${featuredSuites.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredSuites.map(s => {
            const cs = catStyleMap[s.balancer_category] || { col: '#a3e635', badge: 'BALANCER SUITE', icon: '⚖️' };
            const zidStr = String(s.zone_id || '');
            const didStr = String(s.dungeon_id || '');
            const fidStr = String(s.floor_id || 'B3');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(s.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(s.loc)}')`);
            const invTxt = (s.protected_invariants || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(s.suite_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#d9f99d;margin-top:1px">
                    📊 ${escapeHtml(s.spawner_or_economy_simulation.slice(0, 54))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🔄 ${escapeHtml(s.ssot_writeback_protocol.slice(0, 40))} · ${escapeHtml(invTxt.slice(0, 34))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#1a2e05;color:#f7fee7;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Open Dungeon Spawner (${escapeHtml(fidStr)})` : 'Jump to Spawner/Balancer Zone'}
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

// D77: Interactive 16-Archetype [Role 2: Combat & Skill Timeline Editor] Combat Skill Timeline, Hitbox Frame & Boss Telegraph VFX Bar
function renderAtlasSkillTimelineBarHtml(tatlas) {
  const timelines = (tatlas && tatlas.combat_skill_timeline_profiles) || [];
  const curMode = ATLAS_SKILL_TIMELINE_MODE || ATLAS_STATE_STORE.skillTimelineMode || 'All';
  const modePills = [
    { id: 'All', label: '⚡ All 16 Skill Timelines' },
    { id: 'Martial_Combo_Hitbox_Timeline', label: '🗡️ 6 Martial Combo Timelines' },
    { id: 'Arcane_Cast_Interrupt_Timeline', label: '🔮 5 Arcane Cast Timelines' },
    { id: 'Boss_Telegraph_VFX_Timeline', label: '🐉 5 Boss Telegraph Timelines' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredTimelines = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? timelines
        : timelines.filter(t => t.timeline_category === curMode));
  const featuredTimelines = filteredTimelines.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const catStyleMap = {
    'Martial_Combo_Hitbox_Timeline': { col: '#f97316', badge: 'MARTIAL COMBO', icon: '🗡️' },
    'Arcane_Cast_Interrupt_Timeline': { col: '#38bdf8', badge: 'ARCANE CAST', icon: '🔮' },
    'Boss_Telegraph_VFX_Timeline': { col: '#f43f5e', badge: 'BOSS TELEGRAPH', icon: '🐉' }
  };

  return `
    <div id="atlasSkillTimelineBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#fb923c;margin-right:2px">
            ⚡ [ROLE 2: COMBAT TIMELINE EDITOR — 16-ARCHETYPE SKILL &amp; BOSS TELEGRAPH] (D77):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasSkillTimelineMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#fb923c' : 'rgba(255,255,255,0.14)'};background:${act ? '#7c2d12' : '#0f172a'};color:${act ? '#fff7ed' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 MARTIAL COMBO HITBOX · 5 ARCANE CAST INTERRUPT · 5 BOSS TELEGRAPH VFX · 20HZ TICK LOCK
        </span>
      </div>

      ${featuredTimelines.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredTimelines.map(t => {
            const cs = catStyleMap[t.timeline_category] || { col: '#fb923c', badge: 'SKILL TIMELINE', icon: '⚡' };
            const zidStr = String(t.zone_id || '');
            const didStr = String(t.dungeon_id || '');
            const fidStr = String(t.floor_id || 'B3');
            const tObj = byTownId[zidStr];
            const jumpJs = didStr
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (tObj
                  ? `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(t.loc)}')`
                  : `focusFieldTacticalBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(t.loc)}')`);
            const gateTxt = (t.timeline_validation_gates || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(t.profile_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                    ⏱️ ${escapeHtml(t.frame_window_breakdown.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ✨ ${escapeHtml(t.vfx_and_soulshot_sync_rule.slice(0, 42))} · ${escapeHtml(gateTxt.slice(0, 32))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#431407;color:#fff7ed;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} ${didStr ? `Open Boss Telegraph Sanctum (${escapeHtml(fidStr)})` : 'Jump to Racial Dojo / Arena'}
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

// D78: Interactive 15-Node [Role 5: Automated Multi-Platform Build Farm & Binary Patching] Client/Server Build Farm, Asset Cooker & Delta Patch CDN Bar
function renderAtlasBuildFarmBarHtml(tatlas) {
  const nodes = (tatlas && tatlas.build_farm_patch_cdn_nodes) || [];
  const curMode = ATLAS_BUILD_FARM_MODE || ATLAS_STATE_STORE.buildFarmMode || 'All';
  const modePills = [
    { id: 'All', label: '🏗️ All 15 Build Nodes' },
    { id: 'Godot_Client_Pak_Cooker_Node', label: '📦 5 Godot Pak Cookers' },
    { id: 'Server_Rs_Linux_Musl_Build_Runner', label: '🦀 5 server-rs Build Runners' },
    { id: 'Delta_Binary_Patch_CDN_Edge', label: '🌐 5 Delta Patch CDN Edges' },
    { id: 'Off', label: '🙈 Hide Overlay' }
  ];
  const filteredNodes = curMode === 'Off'
    ? []
    : (curMode === 'All'
        ? nodes
        : nodes.filter(n => n.build_farm_category === curMode));
  const featuredNodes = filteredNodes.slice(0, 6);
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });
  const catStyleMap = {
    'Godot_Client_Pak_Cooker_Node': { col: '#38bdf8', badge: 'GODOT PAK COOKER', icon: '📦' },
    'Server_Rs_Linux_Musl_Build_Runner': { col: '#fb923c', badge: 'SERVER-RS RUNNER', icon: '🦀' },
    'Delta_Binary_Patch_CDN_Edge': { col: '#34d399', badge: 'DELTA PATCH CDN', icon: '🌐' }
  };

  return `
    <div id="atlasBuildFarmBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;font-weight:900;color:#34d399;margin-right:2px">
            🏗️ [ROLE 5: BUILD FARM &amp; PATCH CDN — 15-NODE COOKER &amp; DELTA PATCH] (D78):
          </span>
          ${modePills.map(mp => {
            const act = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasBuildFarmMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${act ? '#34d399' : 'rgba(255,255,255,0.14)'};background:${act ? '#064e3b' : '#0f172a'};color:${act ? '#ecfdf5' : '#cbd5e1'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 GODOT PAK COOKERS · 5 SERVER-RS MUSL RUNNERS · 5 ZSTD DELTA PATCH CDN EDGES
        </span>
      </div>

      ${featuredNodes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredNodes.map(n => {
            const cs = catStyleMap[n.build_farm_category] || { col: '#34d399', badge: 'BUILD NODE', icon: '🏗️' };
            const tzidStr = String(n.town_zone_id || '');
            const tObj = byTownId[tzidStr] || {};
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || tzidStr.replace('zone-', ''))}', '${escapeHtml(n.node_loc)}')`;
            const gateTxt = (n.ci_release_gates || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(n.town_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    🎯 ${escapeHtml(n.target_platforms_and_artifacts.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    ⚡ ${escapeHtml(n.delta_patch_and_rollout_metrics.slice(0, 42))} · ${escapeHtml(gateTxt.slice(0, 32))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#064e3b;color:#ecfdf5;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump to Town Build/CDN Node (5.2×)
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

function renderAtlasArchitectDxBarHtml(tatlas) {
  const gates = (tatlas && tatlas.architect_dx_codegen_gates) || [];
  if (!gates.length) return '';
  const curMode = ATLAS_ARCHITECT_DX_MODE || ATLAS_STATE_STORE.architectDxMode || 'All';
  const allTowns = getAllAtlasTownEntries(tatlas);
  const byTownId = {};
  allTowns.forEach(t => { byTownId[t.zone_id] = t; });

  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🏛️ All 15 Architect DX & Codegen Gates', col: '#38bdf8' },
    { id: 'Unified_SSO_Editor_Session_Hub', label: '🔐 Unified SSO & Context Bus (5)', col: '#a78bfa' },
    { id: 'Cross_Tool_Undo_Redo_Command_Stack', label: '↩️ 500-Step Undo/Redo Stack (5)', col: '#fbbf24' },
    { id: 'Schema_Codegen_Drift_Gate_Watchdog', label: '🛡️ Rust/C# Codegen Drift-Gate (5)', col: '#34d399' }
  ];

  const filteredGates = curMode === 'Off'
    ? []
    : gates.filter(g => {
        if (curMode === 'All') return true;
        return g.architect_dx_category === curMode;
      });
  const featuredGates = filteredGates.slice(0, 4);

  const catStyleMap = {
    'Unified_SSO_Editor_Session_Hub': { col: '#a78bfa', badge: 'SSO & CONTEXT BUS', icon: '🔐' },
    'Cross_Tool_Undo_Redo_Command_Stack': { col: '#fbbf24', badge: 'UNDO/REDO STACK', icon: '↩️' },
    'Schema_Codegen_Drift_Gate_Watchdog': { col: '#34d399', badge: 'CODEGEN DRIFT-GATE', icon: '🛡️' }
  };

  return `
    <div id="atlasArchitectDxBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🏛️ ARCHITECT DX, UNDO/REDO &amp; CODEGEN GATES (D79 · ${gates.length} TOWN HUBS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasArchitectDxMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          5 UNIFIED SSO BUS · 5 RFC-6902 UNDO/REDO STACKS · 5 RUST/C# CODEGEN DRIFT-GATES
        </span>
      </div>

      ${featuredGates.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredGates.map(g => {
            const cs = catStyleMap[g.architect_dx_category] || { col: '#38bdf8', badge: 'ARCHITECT DX', icon: '🏛️' };
            const tzidStr = String(g.town_zone_id || '');
            const tObj = byTownId[tzidStr] || {};
            const jumpJs = `focusTownStreetBlueprint('${escapeHtml(tObj.studio_node_id || tzidStr.replace('zone-', ''))}', '${escapeHtml(g.hub_loc)}')`;
            const stdTxt = (g.enforced_standards || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(g.town_name.slice(0, 34))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    ⚙️ ${escapeHtml(g.dx_and_ssot_protocol.slice(0, 56))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🧹 ${escapeHtml(g.anti_tool_sprawl_consolidation.slice(0, 42))} · ${escapeHtml(stdTxt.slice(0, 32))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#0c4a6e;color:#f0f9ff;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump to Town DX/Codegen Hub (5.2×)
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

function renderAtlasTwoRingSignoffBarHtml(tatlas) {
  const records = (tatlas && tatlas.two_ring_studio_80d_signoff_matrix) || [];
  if (!records.length) return '';
  const curMode = ATLAS_TWO_RING_SIGNOFF_MODE || ATLAS_STATE_STORE.twoRingSignoffMode || 'All';
  const allZones = getAllAtlas63Zones(tatlas);
  const byZoneId = {};
  allZones.forEach(z => { byZoneId[z.zone_id] = z; });

  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🏆 All 22 Two-Ring 80D Sign-Offs (11 Roles)', col: '#fde047' },
    { id: 'Ring_A_Creative_Council', label: '🎨 Ring A: 6-Role Creative Council (12)', col: '#f472b6' },
    { id: 'Ring_B_Platform_Tools_Squad', label: '🛠️ Ring B: 5-Role Platform & Tools Squad (10)', col: '#38bdf8' }
  ];

  const filteredRecords = curMode === 'Off'
    ? []
    : records.filter(r => {
        if (curMode === 'All') return true;
        return r.studio_ring === curMode;
      });
  const featuredRecords = filteredRecords.slice(0, 4);

  const ringStyleMap = {
    'Ring_A_Creative_Council': { col: '#f472b6', badge: 'RING A · CREATIVE', icon: '🎨' },
    'Ring_B_Platform_Tools_Squad': { col: '#38bdf8', badge: 'RING B · TOOLS SQUAD', icon: '🛠️' }
  };

  return `
    <div id="atlasTwoRingSignoffBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fde047">🏆 TWO-RING STUDIO 11-ROLE 80D SIGN-OFF MATRIX (D80 · ${records.length} RECORDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasTwoRingSignoffMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#34d399;font-weight:800">
          12 RING A CREATIVE COUNCIL · 10 RING B PLATFORM/TOOLS SQUAD · D1–D80 = 100.0/100
        </span>
      </div>

      ${featuredRecords.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredRecords.map(r => {
            const rs = ringStyleMap[r.studio_ring] || { col: '#fde047', badge: 'TWO-RING 80D', icon: '🏆' };
            const zidStr = String(r.zone_id || '');
            const didStr = String(r.dungeon_id || '');
            const fidStr = String(r.floor_id || 'B1');
            const zObj = byZoneId[zidStr] || {};
            const isDungeon = Boolean(didStr);
            const jumpJs = isDungeon
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (zidStr.startsWith('zone-town-')
                  ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(r.loc)}')`
                  : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(r.loc)}')`);
            const dimTxt = (r.certified_dimensions || []).slice(0, 3).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${rs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${rs.icon} ${escapeHtml(r.milestone_title.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${rs.col}">[${escapeHtml(r.studio_role.slice(0, 18))}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                    📐 ${escapeHtml(r.tooling_pillar_stage)} · ${escapeHtml(dimTxt.slice(0, 42))}
                  </div>
                  <div style="font-size:8px;color:#a7f3d0;margin-top:1px">
                    ✅ ${escapeHtml(r.verdict_and_evidence.slice(0, 68))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${rs.col};background:#422006;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                    ${rs.icon} Jump to Certified Exemplar (${isDungeon ? escapeHtml(fidStr) : '5.2×'})
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

function renderAtlasWeatherAcousticBarHtml(tatlas) {
  const profiles = (tatlas && tatlas.weather_shader_acoustic_profiles) || [];
  if (!profiles.length) return '';
  const curMode = ATLAS_WEATHER_ACOUSTIC_MODE || ATLAS_STATE_STORE.weatherAcousticMode || 'All';
  const allZones = getAllAtlas63Zones(tatlas);
  const byZoneId = {};
  allZones.forEach(z => { byZoneId[z.zone_id] = z; });

  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🌦️ All 16 Weather, Day/Night & Acoustic Profiles', col: '#38bdf8' },
    { id: 'Town_Symphony_And_Tavern_Reverb', label: '🎶 6 Town Symphony Themes (6)', col: '#fbbf24' },
    { id: 'Nocturnal_Curse_Fog_And_Blood_Rain_Field', label: '🌙 5 Nocturnal Curse/Fog Fields (5)', col: '#c084fc' },
    { id: 'Subterranean_Catacomb_Echo_And_Resonance', label: '🕳️ 5 Subterranean Catacomb Echoes (5)', col: '#34d399' }
  ];

  const filteredProfiles = curMode === 'Off'
    ? []
    : profiles.filter(p => {
        if (curMode === 'All') return true;
        return p.atmosphere_category === curMode;
      });
  const featuredProfiles = filteredProfiles.slice(0, 4);

  const catStyleMap = {
    'Town_Symphony_And_Tavern_Reverb': { col: '#fbbf24', badge: 'TOWN SYMPHONY & REVERB', icon: '🎶' },
    'Nocturnal_Curse_Fog_And_Blood_Rain_Field': { col: '#c084fc', badge: 'NOCTURNAL FOG & SHADER', icon: '🌙' },
    'Subterranean_Catacomb_Echo_And_Resonance': { col: '#34d399', badge: 'CATACOMB ECHO IR', icon: '🕳️' }
  };

  return `
    <div id="atlasWeatherAcousticBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🌦️ [ROLE 3: TECH ART AUDIO/SHADERS] WEATHER, DAY/NIGHT &amp; ACOUSTIC REVERB (D81 · ${profiles.length} PROFILES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWeatherAcousticMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde047;font-weight:800">
          6 TOWN SYMPHONY REVERBS · 5 NOCTURNAL CURSE/FOG FIELDS · 5 SUBTERRANEAN CATACOMB IR ECHOES
        </span>
      </div>

      ${featuredProfiles.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredProfiles.map(p => {
            const cs = catStyleMap[p.atmosphere_category] || { col: '#38bdf8', badge: 'TECH ART AUDIO', icon: '🌦️' };
            const zidStr = String(p.zone_id || '');
            const didStr = String(p.dungeon_id || '');
            const fidStr = String(p.floor_id || 'B3');
            const zObj = byZoneId[zidStr] || {};
            const isDungeon = Boolean(didStr);
            const jumpJs = isDungeon
              ? `openDungeonSubMap('${escapeHtml(didStr)}', '${escapeHtml(fidStr)}')`
              : (zidStr.startsWith('zone-town-')
                  ? `focusTownStreetBlueprint('${escapeHtml(zObj.studio_node_id || zidStr.replace('zone-', ''))}', '${escapeHtml(p.loc)}')`
                  : `focusFieldOrFortressBlueprint('${escapeHtml(zidStr)}', '${escapeHtml(p.loc)}')`);
            const gateTxt = (p.gpu_shader_and_memory_gates || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(p.profile_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                    ☀️ ${escapeHtml(p.day_night_and_weather_cycle.slice(0, 62))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🔊 ${escapeHtml(p.spatial_audio_bus_and_bgm.slice(0, 44))} · ${escapeHtml(gateTxt.slice(0, 32))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#1e1b4b;color:#f8fafc;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump to Acoustic/Shader Zone (${isDungeon ? escapeHtml(fidStr) : '5.2×'})
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

function renderAtlasServerMeshBarHtml(tatlas) {
  const corridors = (tatlas && tatlas.server_mesh_persistence_corridors) || [];
  if (!corridors.length) return '';
  const curMode = ATLAS_SERVER_MESH_MODE || ATLAS_STATE_STORE.serverMeshMode || 'All';
  const allZones = getAllAtlas63Zones(tatlas);
  const byZoneId = {};
  allZones.forEach(z => { byZoneId[z.zone_id] = z; });

  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🖧 All 15 Infra Corridors', col: '#38bdf8' },
    { id: 'Zero_Loading_Zone_Boundary_Handoff', label: '🔄 5 Zero-Load Zone Handoffs (5)', col: '#34d399' },
    { id: 'Redis_Stream_Cross_Realm_Event_Bus', label: '📡 5 Redis Stream Event Buses (5)', col: '#fb923c' },
    { id: 'Postgres_Advisory_Lock_Writebehind_Wal', label: '🗄️ 5 Postgres Write-Behind WALs (5)', col: '#a78bfa' }
  ];

  const filteredCorridors = curMode === 'Off'
    ? []
    : corridors.filter(c => {
        if (curMode === 'All') return true;
        return c.infra_category === curMode;
      });
  const featuredCorridors = filteredCorridors.slice(0, 4);

  const catStyleMap = {
    'Zero_Loading_Zone_Boundary_Handoff': { col: '#34d399', badge: '64M ZERO-LOAD HANDOFF', icon: '🔄' },
    'Redis_Stream_Cross_Realm_Event_Bus': { col: '#fb923c', badge: 'REDIS STREAM BUS', icon: '📡' },
    'Postgres_Advisory_Lock_Writebehind_Wal': { col: '#a78bfa', badge: 'POSTGRES OCC WAL', icon: '🗄️' }
  };

  return `
    <div id="atlasServerMeshBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#34d399">🖧 [ROLE 4: BACKEND INFRA] SERVER-MESH HANDOFF, REDIS STREAM &amp; POSTGRES WAL (D82 · ${corridors.length} CORRIDORS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasServerMeshMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#38bdf8;font-weight:800">
          5 ZERO-LOAD 64M HANDOFFS · 5 REDIS STREAM EVENT BUSES · 5 POSTGRES OCC WRITE-BEHIND WALS
        </span>
      </div>

      ${featuredCorridors.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featuredCorridors.map(c => {
            const cs = catStyleMap[c.infra_category] || { col: '#34d399', badge: 'SERVER MESH', icon: '🖧' };
            const ozidStr = String(c.origin_zone_id || '');
            const dzidStr = String(c.destination_zone_id || '');
            const ozObj = byZoneId[ozidStr] || {};
            const jumpJs = ozidStr.startsWith('zone-town-')
              ? `focusTownStreetBlueprint('${escapeHtml(ozObj.studio_node_id || ozidStr.replace('zone-', ''))}', '${escapeHtml(c.loc)}')`
              : (ozidStr.startsWith('zone-dungeon-') || ozidStr.startsWith('zone-catacomb-')
                  ? `openDungeonSubMap('${escapeHtml(ozidStr)}', 'B3')`
                  : `focusFieldOrFortressBlueprint('${escapeHtml(ozidStr)}', '${escapeHtml(c.loc)}')`);
            const verifTxt = (c.chaos_and_load_verifications || []).slice(0, 2).join(' · ');
            return `
              <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${cs.col};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.3px;font-weight:900;color:#f8fafc">${cs.icon} ${escapeHtml(c.corridor_name.slice(0, 36))}</span>
                    <span class="mono" style="font-size:8px;font-weight:900;color:${cs.col}">[${cs.badge}]</span>
                  </div>
                  <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                    ⚡ ${escapeHtml(c.authority_handoff_and_latency_sla.slice(0, 60))}
                  </div>
                  <div style="font-size:8px;color:#fde68a;margin-top:1px">
                    🔒 ${escapeHtml(c.persistence_and_anti_dupe_contract.slice(0, 44))} · ${escapeHtml(verifTxt.slice(0, 30))}
                  </div>
                </div>
                <div style="display:flex;gap:4px;margin-top:2px">
                  <button type="button" onclick="${jumpJs}"
                          style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${cs.col};background:#064e3b;color:#ecfdf5;font-size:8px;font-weight:800;cursor:pointer">
                    ${cs.icon} Jump ${escapeHtml(ozidStr.replace('zone-', '').slice(0, 14))} ➔ ${escapeHtml(dzidStr.replace('zone-', '').slice(0, 14))}
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

function renderAtlasAntiBotSentinelBarHtml(tatlas) {
  ANTI_BOT_SENTINELS = (tatlas && tatlas.anti_bot_economy_sentinels) || [];
  if (!ANTI_BOT_SENTINELS.length) return '';
  const curMode = ATLAS_ANTI_BOT_MODE || ATLAS_STATE_STORE.antiBotMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🕵️ Anti-Bot & RMT Sentinel (16)', col: '#f43f5e' },
    { id: 'Macro Pathing Entropy', label: '🤖 Macro Pathing Entropy (4)', col: '#fb7185' },
    { id: 'RMT Trade-Graph Ring', label: '🕸️ RMT Trade-Graph Ring (3)', col: '#f97316' },
    { id: 'Packet-Injection Speedhack', label: '⚡ Packet Speedhack (3)', col: '#e11d48' },
    { id: 'Gold-Sink Inflation Spike', label: '📈 Gold-Sink Inflation Spike (3)', col: '#f43f5e' },
    { id: 'Bot-Train Party Healer Loop', label: '⛓️ Bot-Train Healer Loop (3)', col: '#fb7185' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : ANTI_BOT_SENTINELS.filter(s => curMode === 'All' || s.category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasAntiBotSentinelBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f43f5e">🕵️ [ROLE 5: LIVEOPS &amp; CS PORTAL] ANTI-BOT / RMT TELEMETRY &amp; ECONOMY SENTINELS (D83 · ${ANTI_BOT_SENTINELS.length} SENTINELS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasAntiBotMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fda4af;font-weight:800">
          SHANNON ENTROPY 1.8–4.2 BITS · PAGERANK RMT GRAPH CENTRALITY · 99.85%–99.99% FALSE-POSITIVE GUARD
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(s => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(s.accent || '#f43f5e')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🕵️ ${escapeHtml(s.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(s.accent || '#f43f5e')}">[${escapeHtml(s.category)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fecdd3;margin-top:1px">
                  🛡️ ${escapeHtml(s.challenge_action)} · Entropy ≤ ${s.entropy_threshold_bits}b · RMT ≤ ${s.rmt_graph_centrality_max} · Guard ${s.false_positive_guard_pct}%
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  ${escapeHtml(s.notes.slice(0, 76))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectAntiBotSentinel('${escapeHtml(s.sentinel_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(s.accent || '#f43f5e')};background:#4c0519;color:#ffe4e6;font-size:8px;font-weight:800;cursor:pointer">
                  🕵️ Inspect Sentinel (${escapeHtml(s.sentinel_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasGodotStorybookBarHtml(tatlas) {
  GODOT_STORYBOOK_PREFABS = (tatlas && tatlas.godot_storybook_prefab_nodes) || [];
  if (!GODOT_STORYBOOK_PREFABS.length) return '';
  const curMode = ATLAS_GODOT_STORYBOOK_MODE || ATLAS_STATE_STORE.godotStorybookMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🧱 Godot 3D Storybook (15)', col: '#38bdf8' },
    { id: 'Town Plaza & Fountain', label: '⛲ Town Plaza & Fountain (3)', col: '#38bdf8' },
    { id: 'Blacksmith Forge & Anvil', label: '⚒️ Blacksmith Forge & Anvil (3)', col: '#60a5fa' },
    { id: 'Gatekeeper Obelisk', label: '🌀 Gatekeeper Obelisk (3)', col: '#2dd4bf' },
    { id: 'Castle Curtain Wall', label: '🏰 Castle Curtain Wall (3)', col: '#818cf8' },
    { id: 'Underground Dungeon Portal', label: '🕳️ Underground Dungeon Portal (3)', col: '#60a5fa' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : GODOT_STORYBOOK_PREFABS.filter(p => curMode === 'All' || p.kitbash_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasGodotStorybookBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🧱 [ROLE 2 + ROLE 3: GODOT TOOL-SCENE STORYBOOK] 3D KITBASH PREFAB INSPECTOR (D84 · ${GODOT_STORYBOOK_PREFABS.length} PREFABS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasGodotStorybookMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#bae6fd;font-weight:800">
          15 TOWN/DUNGEON .TSCN KITBASH PREFABS · 4–24 SUBMESHES · LIGHTMAP 8–32 TEXELS/M · HOT-RELOAD ≤ 65MS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(p => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(p.accent || '#38bdf8')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🧱 ${escapeHtml(p.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(p.accent || '#38bdf8')}">[${escapeHtml(p.kitbash_category)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                  📐 ${escapeHtml(p.godot_scene_uri)} · ${p.submesh_count} Submeshes · ${escapeHtml(p.collision_shape_type)}
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  💡 Lightmap ${p.baked_lightmap_texel_density} tx/m · ⚡ Hot-Reload ${p.hot_reload_latency_ms}ms · 🖼️ ${escapeHtml(p.webp_preview_uri)}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectGodotStorybookPrefab('${escapeHtml(p.prefab_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(p.accent || '#38bdf8')};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                  🧱 Inspect 3D Prefab (${escapeHtml(p.prefab_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasNavmeshObstacleBarHtml(tatlas) {
  NAVMESH_OBSTACLE_SECTORS = (tatlas && tatlas.navmesh_obstacle_sectors) || [];
  if (!NAVMESH_OBSTACLE_SECTORS.length) return '';
  const curMode = ATLAS_NAVMESH_MODE || ATLAS_STATE_STORE.navmeshMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🧭 3D NavMesh & Doors (16)', col: '#10b981' },
    { id: 'Dynamic Siege Gate Obstacle', label: '🏰 Siege Gate Obstacle (4)', col: '#34d399' },
    { id: 'Vertical Jump-Link & Drop Ledge', label: '🧗 Vertical Jump-Link (4)', col: '#059669' },
    { id: 'Boss Room Seal Door', label: '🚪 Boss Room Seal Door (4)', col: '#14b8a6' },
    { id: 'Multi-Layer Bridge Recast Tile', label: '🌉 Multi-Layer Bridge Tile (4)', col: '#10b981' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : NAVMESH_OBSTACLE_SECTORS.filter(n => curMode === 'All' || n.sector_type === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasNavmeshObstacleBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#10b981">🧭 [ROLE 4: BACKEND INFRA] 3D NAVMESH PATHFINDING, JUMP-LINK &amp; DYNAMIC DOOR/BRIDGE OBSTACLE MATRIX (D85 · ${NAVMESH_OBSTACLE_SECTORS.length} SECTORS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasNavmeshMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#a7f3d0;font-weight:800">
          RECAST VOXEL 0.15–0.35M · STEP 0.40–0.75M · SLOPE 38–55° · RAYCAST LOS 45–220µS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(n => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(n.accent || '#10b981')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🧭 ${escapeHtml(n.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(n.accent || '#10b981')}">[${escapeHtml(n.sector_type)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#a7f3d0;margin-top:1px">
                  📐 Cell ${n.recast_cell_size_m}m · Step ${n.agent_step_height_m}m · Slope ${n.agent_max_slope_deg}° · Obstacles ${n.dynamic_obstacle_count} · LOS ${n.raycast_los_budget_us}µs
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  ${escapeHtml(n.notes.slice(0, 76))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectNavmeshObstacleSector('${escapeHtml(n.navmesh_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(n.accent || '#10b981')};background:#064e3b;color:#d1fae5;font-size:8px;font-weight:800;cursor:pointer">
                  🧭 Inspect NavMesh Sector (${escapeHtml(n.navmesh_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasLiveopsEventFlagsBarHtml(tatlas) {
  LIVEOPS_EVENT_FLAGS = (tatlas && tatlas.liveops_event_flag_nodes) || [];
  if (!LIVEOPS_EVENT_FLAGS.length) return '';
  const curMode = ATLAS_LIVEOPS_FLAGS_MODE || ATLAS_STATE_STORE.liveopsFlagsMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🎪 LiveOps Event Flags (15)', col: '#f59e0b' },
    { id: 'Seasonal World Festival', label: '🏮 Seasonal World Festival (4)', col: '#f59e0b' },
    { id: 'Dynamic EXP / Drop Multiplier', label: '⚡ EXP / Drop Multiplier (4)', col: '#fbbf24' },
    { id: 'Canary Feature Flag Rollout', label: '🐤 Canary Feature Rollout (4)', col: '#eab308' },
    { id: 'Emergency Drop-Table Kill-Switch', label: '🛑 Drop-Table Kill-Switch (3)', col: '#f97316' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : LIVEOPS_EVENT_FLAGS.filter(f => curMode === 'All' || f.event_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasLiveopsEventFlagsBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f59e0b">🎪 [ROLE 5: LIVEOPS &amp; BUILD] SEASONAL WORLD EVENT, DOUBLE-EXP / DROP HOT-CONFIG &amp; FEATURE FLAG MATRIX (D86 · ${LIVEOPS_EVENT_FLAGS.length} FLAGS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasLiveopsFlagsMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde68a;font-weight:800">
          ROLLOUT 10–100% · EXP 1.0–2.5× · DROP 1.0–2.0× · REDIS PUBSUB 12–85MS ZERO-RESTART
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(f => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(f.accent || '#f59e0b')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🎪 ${escapeHtml(f.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(f.accent || '#f59e0b')}">[${escapeHtml(f.event_category)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                  🔑 ${escapeHtml(f.flag_key)} · Rollout ${f.rollout_pct}% · EXP ${f.exp_sp_multiplier}× · Drop ${f.drop_spoil_multiplier}× · ${f.zero_restart_propagation_ms}ms
                </div>
                <div style="font-size:8px;color:#fed7aa;margin-top:1px">
                  🛑 Guard: ${escapeHtml(f.rollback_trigger_rule)} — ${escapeHtml(f.notes.slice(0, 56))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectLiveopsEventFlag('${escapeHtml(f.event_flag_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(f.accent || '#f59e0b')};background:#78350f;color:#fef3c7;font-size:8px;font-weight:800;cursor:pointer">
                  🎪 Inspect Event Flag (${escapeHtml(f.event_flag_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCinematicCameraRailsBarHtml(tatlas) {
  CINEMATIC_CAMERA_RAILS = (tatlas && tatlas.cinematic_camera_rails) || [];
  if (!CINEMATIC_CAMERA_RAILS.length) return '';
  const curMode = ATLAS_CINEMATIC_RAILS_MODE || ATLAS_STATE_STORE.cinematicRailsMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🎬 Cutscene Camera Rails (16)', col: '#ec4899' },
    { id: 'Raid Boss Awakening Intro', label: '🐉 Boss Awakening Intro (9)', col: '#ec4899' },
    { id: 'Town First-Arrival Flythrough', label: '🏰 Town Arrival Flythrough (2)', col: '#f472b6' },
    { id: 'Main Quest Story Revelation', label: '📜 Main Quest Revelation (3)', col: '#db2777' },
    { id: 'Castle Siege Breach Sequence', label: '⚔️ Siege Breach Cam (2)', col: '#a855f7' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : CINEMATIC_CAMERA_RAILS.filter(r => curMode === 'All' || r.cinematic_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasCinematicCameraRailsBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#ec4899">🎬 [ROLE 2: CONTENT &amp; WORLD TOOLS] IN-GAME CUTSCENE CAMERA RAIL, BOSS INTRO CINEMATICS &amp; STORY TRIGGER MATRIX (D87 · ${CINEMATIC_CAMERA_RAILS.length} RAILS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCinematicRailsMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fbcfe8;font-weight:800">
          CATMULL-ROM 6–28 KEYFRAMES · 6.5–24.0S · ANAMORPHIC 2.39:1 · PARTY SKIP GOVERNANCE
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(r => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(r.accent || '#ec4899')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🎬 ${escapeHtml(r.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(r.accent || '#ec4899')}">[${escapeHtml(r.cinematic_category)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fbcfe8;margin-top:1px">
                  🎞️ ${r.spline_keyframe_count} Keyframes · ${r.duration_sec}s · FOV ${escapeHtml(r.fov_curve_deg)}° · ${escapeHtml(r.letterbox_aspect)} · Duck ${r.audio_ducking_db}dB
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  ⏭️ ${escapeHtml(r.skippable_party_vote)} — ${escapeHtml(r.notes.slice(0, 56))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectCinematicCameraRail('${escapeHtml(r.rail_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(r.accent || '#ec4899')};background:#831843;color:#fce7f3;font-size:8px;font-weight:800;cursor:pointer">
                  🎬 Inspect Camera Rail (${escapeHtml(r.rail_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasClientGpuBudgetsBarHtml(tatlas) {
  CLIENT_GPU_BUDGETS = (tatlas && tatlas.client_gpu_vram_budgets) || [];
  if (!CLIENT_GPU_BUDGETS.length) return '';
  const curMode = ATLAS_GPU_BUDGET_MODE || ATLAS_STATE_STORE.gpuBudgetMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🖥️ GPU & VRAM Budgets (15)', col: '#06b6d4' },
    { id: '200-Player Siege Ultra Crowd', label: '⚔️ 200p Siege Crowd (3)', col: '#06b6d4' },
    { id: '150-Merchant Town Market', label: '🏪 150-Stall Market (3)', col: '#22d3ee' },
    { id: 'Dense Foliage & Water Shader Hub', label: '🌿 Foliage & Water Hub (5)', col: '#0891b2' },
    { id: 'Volumetric Lava & Particle Sanctuary', label: '🌋 Volumetric & Particle (4)', col: '#38bdf8' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : CLIENT_GPU_BUDGETS.filter(b => curMode === 'All' || b.profile_tier === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasClientGpuBudgetsBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#06b6d4">🖥️ [ROLE 3: TECHNICAL ARTIST] CLIENT GPU FRAME-TIME PROFILER, DRAW-CALL INSTANCING &amp; VRAM POOL BUDGET MATRIX (D88 · ${CLIENT_GPU_BUDGETS.length} HUBS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasGpuBudgetMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#a5f3fc;font-weight:800">
          DRAW CALLS 450–1400 · MULTIMESH 120–850 · VRAM 512–1536MB · FRAME TIME 8.3–16.6MS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(b => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(b.accent || '#06b6d4')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🖥️ ${escapeHtml(b.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(b.accent || '#06b6d4')}">[${escapeHtml(b.profile_tier)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#a5f3fc;margin-top:1px">
                  📊 ${b.max_draw_calls_per_frame} Draws · ${b.multimesh_instanced_props} MultiMesh · ${b.vram_pool_cap_mb}MB VRAM · ${b.target_frame_time_ms}ms
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  🔭 ${escapeHtml(b.occlusion_culling_mode)} (${b.shader_uber_variants} Uber-Variants) — ${escapeHtml(b.notes.slice(0, 48))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectClientGpuBudget('${escapeHtml(b.gpu_budget_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(b.accent || '#06b6d4')};background:#164e63;color:#cffafe;font-size:8px;font-weight:800;cursor:pointer">
                  🖥️ Inspect GPU Budget (${escapeHtml(b.gpu_budget_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasAutomatedQaSuitesBarHtml(tatlas) {
  AUTOMATED_QA_SUITES = (tatlas && tatlas.automated_qa_smoke_suites) || [];
  if (!AUTOMATED_QA_SUITES.length) return '';
  const curMode = ATLAS_QA_SUITES_MODE || ATLAS_STATE_STORE.qaSuitesMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🧪 Headless QA Suites (16)', col: '#22c55e' },
    { id: 'CI Pre-Merge Headless Playtest', label: '🤖 CI Playtest Routes (7)', col: '#22c55e' },
    { id: 'Economy & Escrow Invariant Fuzzing', label: '💰 Economy & Escrow Fuzz (4)', col: '#10b981' },
    { id: 'Raid & Siege Deterministic Stress', label: '⚔️ Raid & Siege Stress (4)', col: '#14b8a6' },
    { id: 'Nightly Golden-Frame Visual Diff', label: '🖼️ Golden-Frame Diff (1)', col: '#4ade80' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : AUTOMATED_QA_SUITES.filter(s => curMode === 'All' || s.suite_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasAutomatedQaSuitesBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#22c55e">🧪 [ROLE 1 + ROLE 4] AUTOMATED HEADLESS QA PLAYTEST MATRIX, CI SMOKE BOT-ROUTES &amp; GOLDEN-SNAPSHOT REGRESSION SUITES (D89 · ${AUTOMATED_QA_SUITES.length} SUITES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasQaSuitesMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#bbf7d0;font-weight:800">
          4–200 BOTS · 15–180S · 18–120 INVARIANTS · GOLDEN DIFF 0.0–0.25% · CI BLOCKING
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(s => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(s.accent || '#22c55e')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🧪 ${escapeHtml(s.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(s.accent || '#22c55e')}">[${escapeHtml(s.suite_category)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#bbf7d0;margin-top:1px">
                  🤖 ${s.headless_bot_agents} Bots · ⏱️ ${s.target_duration_sec}s · ✅ ${s.invariant_assertions_count} Asserts · Δ≤${s.golden_snapshot_tolerance_pct}%
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  🔒 CI Blocking: ${s.ci_gate_blocking ? 'YES' : 'NO'} — ${escapeHtml(s.notes.slice(0, 52))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectAutomatedQaSuite('${escapeHtml(s.qa_suite_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(s.accent || '#22c55e')};background:#14532d;color:#dcfce7;font-size:8px;font-weight:800;cursor:pointer">
                  🧪 Inspect QA Suite (${escapeHtml(s.qa_suite_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasStudio90dLedgerBarHtml(tatlas) {
  STUDIO_90D_LEDGER = (tatlas && tatlas.studio_90d_master_ledger) || [];
  if (!STUDIO_90D_LEDGER.length) return '';
  const curMode = ATLAS_STUDIO_90D_MODE || ATLAS_STATE_STORE.studio90dMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🏆 90D Master Ledger (22)', col: '#facc15' },
    { id: 'Ring A: Creative Council', label: '👑 Ring A: Creative Council (12)', col: '#fde047' },
    { id: 'Ring B: Platform & Tools Squad', label: '🛠️ Ring B: Platform & Tools Squad (10)', col: '#38bdf8' },
    { id: '[Stage 1: Content & World]', label: '🌍 Stage 1: Content (9)', col: '#34d399' },
    { id: '[Stage 2: Asset & Build Pipeline]', label: '🎨 Stage 2: Asset/DCC (5)', col: '#a855f7' },
    { id: '[Stage 3: Server & Simulation]', label: '⚙️ Stage 3: Server/Sim (5)', col: '#38bdf8' },
    { id: '[Stage 4: LiveOps & GM]', label: '📡 Stage 4: LiveOps/GM (3)', col: '#facc15' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : STUDIO_90D_LEDGER.filter(l => curMode === 'All' || l.ring === curMode || l.stage_domain === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasStudio90dLedgerBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#facc15">🏆 [90D GRAND STUDIO MILESTONE] 11-ROLE CREATIVE COUNCIL + PLATFORM &amp; TOOLS SQUAD D1–D90 MASTER SIGN-OFF &amp; TELEMETRY LEDGER (D90 · ${STUDIO_90D_LEDGER.length} RECORDS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasStudio90dMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fef08a;font-weight:800">
          11 ROLES × 2 MILESTONES · RING A (12) + RING B (10) · APPROVED_90D_GOLD · 100.0/100
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(l => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(l.accent || '#facc15')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🏆 ${escapeHtml(l.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(l.accent || '#facc15')}">[${escapeHtml(l.role_name)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                  ${escapeHtml(l.ring)} · ${escapeHtml(l.stage_domain)} · Dims: ${escapeHtml(l.governed_dimensions)}
                </div>
                <div style="font-size:8px;color:#bbf7d0;margin-top:1px">
                  ✅ ${escapeHtml(l.signoff_status)} · ${escapeHtml(l.verified_slo_metric)}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectStudio90dLedger('${escapeHtml(l.ledger_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(l.accent || '#facc15')};background:#713f12;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                  🏆 Inspect 90D Sign-Off (${escapeHtml(l.ledger_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFactionDispositionBarHtml(tatlas) {
  FACTION_DISPOSITIONS = (tatlas && tatlas.faction_reputation_dispositions) || [];
  if (!FACTION_DISPOSITIONS.length) return '';
  const curMode = ATLAS_FACTION_DISPOSITION_MODE || ATLAS_STATE_STORE.factionDispositionMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🤝 Faction Disposition (16)', col: '#f97316' },
    { id: 'Mutual-Exclusivity Tribal War', label: '⚔️ Tribal War Rivals (3)', col: '#f97316' },
    { id: 'Progressive Zone Unlock Trust', label: '🔓 Zone Unlock Trust (5)', col: '#eab308' },
    { id: 'Chaotic PK Guard Kill-On-Sight', label: '💀 Chaotic PK Guard KOS (3)', col: '#ef4444' },
    { id: 'Guild Trade Tax Discount Standing', label: '🪙 Guild Tax Standing (5)', col: '#fb923c' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : FACTION_DISPOSITIONS.filter(d => curMode === 'All' || d.faction_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasFactionDispositionBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f97316">🤝 [ROLE 2: CONTENT &amp; WORLD TOOLS] DYNAMIC FACTION REPUTATION, NPC DISPOSITION &amp; TOWN GUARD HOSTILITY MATRIX (D91 · ${FACTION_DISPOSITIONS.length} DISPOSITIONS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasFactionDispositionMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fed7aa;font-weight:800">
          KETRA VS. VARKA · HELLBOUND LV.1–11 · TAX -15%..+25% · GUARD KOS 0–35M
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(d => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(d.accent || '#f97316')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🤝 ${escapeHtml(d.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(d.accent || '#f97316')}">[${escapeHtml(d.standing_tiers)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fed7aa;margin-top:1px">
                  ${escapeHtml(d.faction_category)} · Tax: ${d.shop_tax_modifier_pct > 0 ? '+' : ''}${d.shop_tax_modifier_pct}% · Aggro: ${d.guard_aggro_radius_m}m · Quests: ${d.quest_unlock_count}
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  ⚔️ Rival: ${escapeHtml(d.rival_faction_id)} — ${escapeHtml(d.notes.slice(0, 48))}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectFactionDisposition('${escapeHtml(d.disposition_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(d.accent || '#f97316')};background:#7c2d12;color:#ffedd5;font-size:8px;font-weight:800;cursor:pointer">
                  🤝 Inspect Faction Disposition (${escapeHtml(d.disposition_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasAuctionEscrowBarHtml(tatlas) {
  CROSS_REALM_ESCROWS = (tatlas && tatlas.cross_realm_auction_escrows) || [];
  if (!CROSS_REALM_ESCROWS.length) return '';
  const curMode = ATLAS_AUCTION_ESCROW_MODE || ATLAS_STATE_STORE.auctionEscrowMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '⚖️ Auction Escrow (15)', col: '#14b8a6' },
    { id: 'Continental Central Clearinghouse', label: '🏛️ Central Clearinghouse (3)', col: '#14b8a6' },
    { id: 'Regional Craft & Material Hub', label: '⚒️ Regional Craft Hub (5)', col: '#2dd4bf' },
    { id: 'Starter Town Micro-Consignment', label: '📦 Starter Consignment (5)', col: '#0d9488' },
    { id: 'Frontier Raid Spoil Exchange', label: '🐉 Frontier Raid Exchange (2)', col: '#38bdf8' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : CROSS_REALM_ESCROWS.filter(e => curMode === 'All' || e.market_tier === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasAuctionEscrowBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#14b8a6">⚖️ [ROLE 4: BACKEND INFRA] CROSS-REALM AUCTION HOUSE, ESCROW SETTLEMENT &amp; MARKET PRICE-CIRCUIT-BREAKER MATRIX (D92 · ${CROSS_REALM_ESCROWS.length} TOWNS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasAuctionEscrowMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#99f6e4;font-weight:800">
          2PC SERIALIZABLE / CAS · FEE 50–300 BPS · TAX SINK 150–600 BPS · P99 8.5–42MS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(e => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(e.accent || '#14b8a6')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">⚖️ ${escapeHtml(e.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(e.accent || '#14b8a6')}">[${escapeHtml(e.market_tier)}]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#99f6e4;margin-top:1px">
                  ${escapeHtml(e.settlement_protocol)} · Fee: ${e.listing_fee_bps}bps · Tax: ${e.sales_tax_sink_bps}bps
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  🛑 Breaker: ±${e.price_circuit_breaker_pct}% · Cap: ${e.max_concurrent_orders} · p99: ${e.settlement_p99_ms}ms
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectCrossRealmEscrow('${escapeHtml(e.escrow_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(e.accent || '#14b8a6')};background:#134e4a;color:#ccfbf1;font-size:8px;font-weight:800;cursor:pointer">
                  ⚖️ Inspect Escrow Desk (${escapeHtml(e.escrow_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasWorldIncursionBarHtml(tatlas) {
  WORLD_INVASION_INCURSIONS = (tatlas && tatlas.world_invasion_incursions) || [];
  if (!WORLD_INVASION_INCURSIONS.length) return '';
  const curMode = ATLAS_WORLD_INCURSION_MODE || ATLAS_STATE_STORE.worldIncursionMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '☄️ World Incursions (16)', col: '#ef4444' },
    { id: '3-Phase Zone Public Quest', label: '⚡ 3-Phase Public Quests (4)', col: '#f97316' },
    { id: 'Roaming World-Boss Vanguard', label: '🐉 Roaming Boss Vanguards (4)', col: '#dc2626' },
    { id: 'Town Perimeter Defense Event', label: '🛡️ Town Perimeter Sieges (4)', col: '#ef4444' },
    { id: 'Abyssal Rift Sky-Tear', label: '🌌 Abyssal Rift Sky-Tears (4)', col: '#a855f7' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : WORLD_INVASION_INCURSIONS.filter(i => curMode === 'All' || i.incursion_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasWorldIncursionBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#ef4444">☄️ [ROLE 2: CONTENT &amp; WORLD TOOLS] DYNAMIC WORLD BOSS INVASION, RIFT INCURSION &amp; ZONE-WIDE EMERGENCY QUEST MATRIX (D93 · ${WORLD_INVASION_INCURSIONS.length} INCURSIONS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasWorldIncursionMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fecaca;font-weight:800">
          3-PHASE PUBLIC QUEST · 15–120 PLAYERS · WEIGHTED DPS/HEAL/CC/REVIVE · MYTHIC CHESTS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(i => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(i.accent || '#ef4444')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">☄️ ${escapeHtml(i.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(i.accent || '#ef4444')}">[Min ${i.min_participating_players}p]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fecaca;margin-top:1px">
                  ${escapeHtml(i.incursion_category)} · Sky: ${escapeHtml(i.dynamic_skybox_override)}
                </div>
                <div style="font-size:8px;color:#fde68a;margin-top:1px">
                  🎁 ${escapeHtml(i.reward_chest_tiers)} · ${escapeHtml(i.contribution_scoring_rule)}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectWorldInvasionIncursion('${escapeHtml(i.incursion_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(i.accent || '#ef4444')};background:#7f1d1d;color:#fee2e2;font-size:8px;font-weight:800;cursor:pointer">
                  ☄️ Inspect World Incursion (${escapeHtml(i.incursion_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasClanTreasuryBarHtml(tatlas) {
  CLAN_TREASURY_LEDGERS = (tatlas && tatlas.clan_treasury_payroll_ledgers) || [];
  if (!CLAN_TREASURY_LEDGERS.length) return '';
  const curMode = ATLAS_CLAN_TREASURY_MODE || ATLAS_STATE_STORE.clanTreasuryMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🏦 Clan Treasury & Payroll (15)', col: '#eab308' },
    { id: 'Sovereign Castle Tax Vault', label: '👑 Castle Tax Vaults (4)', col: '#eab308' },
    { id: 'Fortress & Territory Mercenary Escrow', label: '⚔️ Mercenary Escrows (3)', col: '#facc15' },
    { id: 'Clan Hall Auction & Upkeep Ledger', label: '🏛️ Clan Hall Upkeep (3)', col: '#f59e0b' },
    { id: 'Starter Academy Stipend Pool', label: '🎓 Academy Stipends (5)', col: '#10b981' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : CLAN_TREASURY_LEDGERS.filter(t => curMode === 'All' || t.treasury_tier === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasClanTreasuryBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#eab308">🏦 [ROLE 4: BACKEND INFRA] GUILD / CLAN TREASURY LEDGER, SIEGE MERCENARY PAYROLL &amp; TAX DIVIDEND AUDIT MATRIX (D94 · ${CLAN_TREASURY_LEDGERS.length} TOWNS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasClanTreasuryMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fef08a;font-weight:800">
          2-OF-3 MULTISIG · MERCENARY KILL/GATE/WARD SPLIT · 25–1,850M ADENA/WK · 90–365D AUDIT
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(t => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(t.accent || '#eab308')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🏦 ${escapeHtml(t.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(t.accent || '#eab308')}">[${t.weekly_tax_yield_adena_m}M/wk]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fef08a;margin-top:1px">
                  ${escapeHtml(t.treasury_tier)} · ${escapeHtml(t.multisig_withdrawal_policy)}
                </div>
                <div style="font-size:8px;color:#a7f3d0;margin-top:1px">
                  ⚔️ ${escapeHtml(t.mercenary_payout_formula)} · Audit: ${t.audit_trail_retention_days}d
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectClanTreasuryLedger('${escapeHtml(t.treasury_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(t.accent || '#eab308')};background:#713f12;color:#fef9c3;font-size:8px;font-weight:800;cursor:pointer">
                  🏦 Inspect Clan Treasury (${escapeHtml(t.treasury_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCaravanRoutesBarHtml(tatlas) {
  CARAVAN_TRADE_ROUTES = (tatlas && tatlas.caravan_trade_routes) || [];
  if (!CARAVAN_TRADE_ROUTES.length) return '';
  const curMode = ATLAS_CARAVAN_ROUTES_MODE || ATLAS_STATE_STORE.caravanRoutesMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🐪 Caravan Trade (16)', col: '#f59e0b' },
    { id: 'Armored Bullion Wagon', label: '🛡️ Armored Bullion Wagons (5)', col: '#fbbf24' },
    { id: 'Pack-Strider Express', label: '🦎 Pack-Strider Express (5)', col: '#eab308' },
    { id: 'Smuggler Night-Run', label: '🌙 Smuggler Night-Runs (3)', col: '#10b981' },
    { id: 'Airship Bulk Charter', label: '⛵ Airship Bulk Charters (3)', col: '#f59e0b' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : CARAVAN_TRADE_ROUTES.filter(c => curMode === 'All' || c.route_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasCaravanRoutesBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fbbf24">🐪 [ROLE 2: CONTENT &amp; WORLD TOOLS] DYNAMIC CARAVAN TRADE ROUTES, BANDIT AMBUSH ESCORTS &amp; REGIONAL COMMODITY ARBITRAGE MATRIX (D97 · ${CARAVAN_TRADE_ROUTES.length} ROUTES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCaravanRoutesMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fde68a;font-weight:800">
          5 COMMODITIES · 1–5★ BANDIT AMBUSH TIERS · 2–12 ESCORT GUARDS · +18–65% ARBITRAGE MARGIN
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(c => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(c.accent || '#f59e0b')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🐪 ${escapeHtml(c.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(c.accent || '#f59e0b')}">[+${c.arbitrage_margin_pct}% · ${c.transit_duration_min}m]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fde68a;margin-top:1px">
                  ${escapeHtml(c.route_category)} · ${escapeHtml(c.specialty_commodity)}
                </div>
                <div style="font-size:8px;color:#a7f3d0;margin-top:1px">
                  ⚔️ ${escapeHtml(c.bandit_ambush_tier)} · Guards: ${c.escort_guard_slots}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectCaravanTradeRoute('${escapeHtml(c.caravan_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(c.accent || '#f59e0b')};background:#451a03;color:#fef3c7;font-size:8px;font-weight:800;cursor:pointer">
                  🐪 Inspect Caravan Route (${escapeHtml(c.caravan_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasLocalizationVoBarHtml(tatlas) {
  LOCALIZATION_VO_BANKS = (tatlas && tatlas.localization_voiceover_banks) || [];
  if (!LOCALIZATION_VO_BANKS.length) return '';
  const curMode = ATLAS_LOCALIZATION_VO_MODE || ATLAS_STATE_STORE.localizationVoMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🎙️ VO & Lip-Sync (15)', col: '#ec4899' },
    { id: 'Royal High Aden Court', label: '👑 Royal High Court (3)', col: '#f472b6' },
    { id: 'Archaic Elven Lyric', label: '🌿 Archaic Elven Lyric (2)', col: '#a855f7' },
    { id: 'Dwarven Forge Guild Slang', label: '⚒️ Dwarven Forge Slang (3)', col: '#38bdf8' },
    { id: 'Frontier Harbor Maritime', label: '⚓ Frontier Maritime (4)', col: '#ec4899' },
    { id: 'Sacred Temple Liturgical', label: '🕯️ Sacred Liturgical (3)', col: '#a855f7' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : LOCALIZATION_VO_BANKS.filter(v => curMode === 'All' || v.dialect_register === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasLocalizationVoBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f472b6">🎙️ [ROLE 5: LIVEOPS &amp; CS PORTAL] AUTOMATED LOCALIZATION VOICE-OVER (EN/TH/JP/KR), LIP-SYNC PHONEME &amp; SUBTITLE TIMING MATRIX (D98 · ${LOCALIZATION_VO_BANKS.length} VO BANKS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasLocalizationVoMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#fbcfe8;font-weight:800">
          EN/TH/JP/KR · 180–950 VOICED LINES · 15-VISEME / 22-PHONEME LIP-SYNC · ICU THAI ZERO-ORPHAN PASS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(v => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(v.accent || '#ec4899')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🎙️ ${escapeHtml(v.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(v.accent || '#ec4899')}">[${v.voiced_line_count} Lines · ${v.opus_bank_size_mb}MB]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#fbcfe8;margin-top:1px">
                  ${escapeHtml(v.dialect_register)} · ${escapeHtml(v.lipsync_viseme_solver)}
                </div>
                <div style="font-size:8px;color:#bae6fd;margin-top:1px">
                  🗣️ ${(v.supported_locales || []).join('/')} · ${escapeHtml(v.thai_line_break_validator)}
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectLocalizationVoBank('${escapeHtml(v.vo_bank_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(v.accent || '#ec4899')};background:#500724;color:#fce7f3;font-size:8px;font-weight:800;cursor:pointer">
                  🎙️ Inspect VO Bank (${escapeHtml(v.vo_bank_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasHousingEstatesBarHtml(tatlas) {
  PLAYER_HOUSING_ESTATES = (tatlas && tatlas.player_housing_trophy_estates) || [];
  if (!PLAYER_HOUSING_ESTATES.length) return '';
  const curMode = ATLAS_HOUSING_ESTATES_MODE || ATLAS_STATE_STORE.housingEstatesMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🏡 Housing & Trophies (16)', col: '#a855f7' },
    { id: 'Solo Instanced Homestead', label: '🏠 Solo Homesteads (5)', col: '#c084fc' },
    { id: 'Guild Shared Trophy Gallery', label: '🏆 Guild Trophy Galleries (4)', col: '#ec4899' },
    { id: 'Sovereign Noble Villa', label: '👑 Sovereign Noble Villas (3)', col: '#f472b6' },
    { id: 'Master Crafter Workshop', label: '⚒️ Master Crafter Workshops (4)', col: '#a855f7' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : PLAYER_HOUSING_ESTATES.filter(e => curMode === 'All' || e.estate_category === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasHousingEstatesBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#c084fc">🏡 [ROLE 2: CONTENT &amp; WORLD TOOLS] PLAYER HOUSING, CLAN CITADEL INTERIOR CUSTOMIZATION &amp; TROPHY TAXIDERMY MATRIX (D95 · ${PLAYER_HOUSING_ESTATES.length} ESTATES):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasHousingEstatesMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#f5d0fe;font-weight:800">
          60–320 FURNITURE SLOTS · 2–16 BOSS TROPHY PEDESTALS · +15–50% VITALITY REGEN · LV.1–5 WORKBENCHES
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(e => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(e.accent || '#a855f7')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🏡 ${escapeHtml(e.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(e.accent || '#a855f7')}">[${e.furniture_slot_cap} Slots · +${e.rested_vitality_regen_bonus_pct}% Vit]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#f5d0fe;margin-top:1px">
                  ${escapeHtml(e.estate_category)} · Trophies: ${e.boss_trophy_pedestals} Pedestals
                </div>
                <div style="font-size:8px;color:#fbcfe8;margin-top:1px">
                  ⚒️ ${escapeHtml(e.crafting_station_tier)} · Upkeep: ${e.weekly_upkeep_adena_k}k/wk
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectPlayerHousingEstate('${escapeHtml(e.estate_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(e.accent || '#a855f7')};background:#4a044e;color:#fae8ff;font-size:8px;font-weight:800;cursor:pointer">
                  🏡 Inspect Housing Estate (${escapeHtml(e.estate_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCdnWebrtcBarHtml(tatlas) {
  GLOBAL_CDN_RELAYS = (tatlas && tatlas.global_cdn_webrtc_relays) || [];
  if (!GLOBAL_CDN_RELAYS.length) return '';
  const curMode = ATLAS_CDN_WEBRTC_MODE || ATLAS_STATE_STORE.cdnWebrtcMode || 'All';
  const modePills = [
    { id: 'Off', label: '🚫 Hide Overlay', col: '#64748b' },
    { id: 'All', label: '🌐 CDN & Voice SFU (15)', col: '#38bdf8' },
    { id: 'Anycast L4/L7 DDoS Scrubber', label: '🛡️ Anycast DDoS Scrubbers (4)', col: '#60a5fa' },
    { id: 'Spatial 3D Proximity Voice SFU', label: '🎙️ 3D Proximity Voice SFU (4)', col: '#2dd4bf' },
    { id: '200-v-200 Siege Command Channel Audio', label: '📯 200v200 Siege Audio (3)', col: '#818cf8' },
    { id: 'Delta-Patch Pak CDN Edge Cache', label: '⚡ Delta-Patch CDN Edges (4)', col: '#38bdf8' }
  ];
  const filtered = curMode === 'Off'
    ? []
    : GLOBAL_CDN_RELAYS.filter(r => curMode === 'All' || r.edge_service_tier === curMode);
  const featured = filtered.slice(0, 4);

  return `
    <div id="atlasCdnWebrtcBar" style="display:flex;flex-direction:column;gap:5px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🌐 [ROLE 5: LIVEOPS &amp; BUILD] GLOBAL CDN REGION ROUTING, ANYCAST DDOS SCRUBBING &amp; VOICE-CHAT WEBRTC RELAY MATRIX (D96 · ${GLOBAL_CDN_RELAYS.length} POPS):</span>
          ${modePills.map(mp => {
            const isAct = curMode === mp.id;
            return `
              <button type="button" onclick="setAtlasCdnWebrtcMode('${escapeHtml(mp.id)}')"
                      style="min-height:23px;padding:2px 8px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#ffffff' : mp.col};background:${isAct ? mp.col : '#0f172a'};color:${isAct ? '#090d14' : '#f8fafc'}">
                ${escapeHtml(mp.label)}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9px;color:#bae6fd;font-weight:800">
          7 GLOBAL POPS · 14–58MS P95 RTT · 1.5–12.0 TBPS SCRUBBING · OPUS 24–64 KBPS · 50–400 PEERS
        </span>
      </div>
      ${featured.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:6px">
          ${featured.map(r => `
            <div style="padding:5px 8px;border-radius:6px;background:#090d14;border-left:3.5px solid ${escapeHtml(r.accent || '#38bdf8')};display:flex;flex-direction:column;justify-content:space-between;gap:3px">
              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                  <span style="font-size:9.3px;font-weight:900;color:#f8fafc">🌐 ${escapeHtml(r.title.slice(0, 38))}</span>
                  <span class="mono" style="font-size:8px;font-weight:900;color:${escapeHtml(r.accent || '#38bdf8')}">[${r.target_rtt_p95_ms}ms · ${r.ddos_scrubbing_capacity_tbps}Tbps]</span>
                </div>
                <div class="mono" style="font-size:8.1px;color:#bae6fd;margin-top:1px">
                  ${escapeHtml(r.pop_region)} · ${escapeHtml(r.edge_service_tier)}
                </div>
                <div style="font-size:8px;color:#99f6e4;margin-top:1px">
                  🎙️ Opus ${r.webrtc_opus_bitrate_kbps}kbps · Max ${r.max_voice_room_peers} Voice Peers
                </div>
              </div>
              <div style="display:flex;gap:4px;margin-top:2px">
                <button type="button" onclick="selectGlobalCdnRelay('${escapeHtml(r.relay_id)}')"
                        style="flex:1;padding:2px 5px;border-radius:4px;border:1px solid ${escapeHtml(r.accent || '#38bdf8')};background:#0c4a6e;color:#e0f2fe;font-size:8px;font-weight:800;cursor:pointer">
                  🌐 Inspect CDN/Voice PoP (${escapeHtml(r.relay_id.slice(0, 22))})
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasHotReloadBridgeBarHtml(tatlas) {
  const bridges = Array.isArray(tatlas && tatlas.cross_tool_hot_reload_bridges) ? tatlas.cross_tool_hot_reload_bridges : [];
  if (!bridges.length) return '';
  const isAct = !!ATLAS_HOT_RELOAD_BRIDGE_MODE;
  const selId = SELECTED_CROSS_TOOL_BRIDGE_ID || (bridges[0] && bridges[0].bridge_id) || 'hot-bridge-01-talking-island';
  const activeBridge = bridges.find(b => b.bridge_id === selId) || bridges[0];

  return `
    <div id="atlasHotReloadBridgeBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#06b6d4">⚡ D99 CROSS-TOOL HOT-RELOAD WEBSOCKET BUS, UNDO/REDO JOURNAL &amp; GODOT LIVE-SYNC:</span>
          <button type="button" onclick="setAtlasHotReloadBridgeMode(!ATLAS_HOT_RELOAD_BRIDGE_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(6,182,212,0.55)'};background:${isAct ? '#0e7490' : '#0f172a'};color:${isAct ? '#ffffff' : '#67e8f9'}">
            ⚡ Hot-Reload Bridges (16) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            16 Cross-Tool WebSocket Relays across 15 Towns + Hellbound · Sub-50ms JSON-Patch Push · RFC-6902 Undo/Redo Command Journal · Live Godot 4.3 Viewport Sync
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${bridges.slice(0, 6).map(b => {
            const bSel = isAct && b.bridge_id === (activeBridge && activeBridge.bridge_id);
            const colHex = b.accent || '#06b6d4';
            return `
              <button type="button" onclick="selectCrossToolBridge('${escapeHtml(b.bridge_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${bSel ? '#fde047' : colHex};background:${bSel ? '#155e75' : '#090d14'};color:${bSel ? '#ffffff' : '#a5f3fc'}">
                ⚡ ${escapeHtml((b.title || b.bridge_id).split('—')[0].trim())} (${escapeHtml(String(b.roundtrip_sync_p99_ms || 15))}ms)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeBridge ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(8,51,68,0.42);border:1px solid rgba(6,182,212,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#67e8f9">⚡ ${escapeHtml(activeBridge.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Channel: ${escapeHtml(activeBridge.bridge_channel)} · Topic: ${escapeHtml(activeBridge.websocket_topic)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                p99 Latency: ${escapeHtml(String(activeBridge.roundtrip_sync_p99_ms))}ms · Undo Ring: ${escapeHtml(String(activeBridge.command_journal_depth))} steps · Conflict: ${escapeHtml(activeBridge.conflict_resolution_mode)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridge.town_id)}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #06b6d4;background:#155e75;color:#cffafe;font-size:9.5px;font-weight:800;cursor:pointer">
                🏰 Inspect ${escapeHtml(activeBridge.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">CI Drift Gate:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeBridge.auto_ci_drift_gate)}</span>
            · <strong style="color:#a5f3fc">Authoring Workflow:</strong> ${escapeHtml(activeBridge.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:5px">
            ${bridges.map(b => {
              const isCardSel = b.bridge_id === activeBridge.bridge_id;
              return `
                <div onclick="selectCrossToolBridge('${escapeHtml(b.bridge_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(6,182,212,0.24)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(6,182,212,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((b.title || b.bridge_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#67e8f9">${escapeHtml(String(b.roundtrip_sync_p99_ms))}ms</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml((b.bridge_channel || '').slice(0, 24))} · ${escapeHtml(String(b.command_journal_depth))} undo
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCentennial100dBarHtml(tatlas) {
  const charters = Array.isArray(tatlas && tatlas.centennial_100d_studio_charters) ? tatlas.centennial_100d_studio_charters : [];
  if (!charters.length) return '';
  const isAct = !!ATLAS_CENTENNIAL_100D_MODE;
  const selId = SELECTED_CENTENNIAL_100D_CHARTER_ID || (charters[0] && charters[0].charter_id) || 'centennial-100d-01-po-stop-1';
  const activeCharter = charters.find(c => c.charter_id === selId) || charters[0];

  return `
    <div id="atlasCentennial100dBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#eab308">👑 D100 GRAND CENTENNIAL TWO-RING 11-ROLE STUDIO CHARTER &amp; D1–D100 GUIDED TOUR:</span>
          <button type="button" onclick="setAtlasCentennial100dMode(!ATLAS_CENTENNIAL_100D_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(234,179,8,0.55)'};background:${isAct ? '#a16207' : '#0f172a'};color:${isAct ? '#ffffff' : '#fef08a'}">
            👑 100D Centennial Charter (22) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            22 Centennial Sign-Off Stops (2 per 11 Studio Roles: 6 Creative Council + 5 Platform &amp; Tools Squad) · D1–D100 100.0/100 Verified · Zero Hand-Edit Drift
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${charters.slice(0, 6).map(c => {
            const cSel = isAct && c.charter_id === (activeCharter && activeCharter.charter_id);
            const colHex = c.accent || '#eab308';
            return `
              <button type="button" onclick="selectCentennial100dCharter('${escapeHtml(c.charter_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${cSel ? '#fde047' : colHex};background:${cSel ? '#854d0e' : '#090d14'};color:${cSel ? '#ffffff' : '#fef08a'}">
                👑 ${escapeHtml(c.role_name)} (${escapeHtml(c.centennial_dimension_span)})
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeCharter ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(113,63,18,0.38);border:1px solid rgba(234,179,8,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#fef08a">👑 ${escapeHtml(activeCharter.title)} (${escapeHtml(activeCharter.ring)})</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Role: ${escapeHtml(activeCharter.role_name)} · Stage: ${escapeHtml(activeCharter.stage_domain)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Span: ${escapeHtml(activeCharter.centennial_dimension_span)} · Camera Zoom: ${escapeHtml(String(activeCharter.camera_zoom_preset))}x
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Status: ${escapeHtml(activeCharter.charter_status)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeCharter.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #eab308;background:#854d0e;color:#fef9c3;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Jump to ${escapeHtml(activeCharter.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Golden Invariant Proof:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeCharter.golden_invariant_proof)}</span>
            · <strong style="color:#67e8f9">Centennial Notes:</strong> ${escapeHtml(activeCharter.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${charters.map(c => {
              const isCardSel = c.charter_id === activeCharter.charter_id;
              return `
                <div onclick="selectCentennial100dCharter('${escapeHtml(c.charter_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(234,179,8,0.24)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(234,179,8,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml(c.role_name)}</span>
                    <span class="mono" style="font-size:8.5px;color:#fef08a">${escapeHtml(c.centennial_dimension_span)}</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(c.town_id)} · ${escapeHtml(c.stage_domain)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function activeBridgeOrTownId(tid) {
  return String(tid || 'town-lantern-hollow').replace(/^zone-/, '');
}

function renderAtlasNocturnalAffixBarHtml(tatlas) {
  const spawns = Array.isArray(tatlas && tatlas.nocturnal_weather_affix_spawns) ? tatlas.nocturnal_weather_affix_spawns : [];
  if (!spawns.length) return '';
  const isAct = !!ATLAS_NOCTURNAL_AFFIX_MODE;
  const selId = SELECTED_NOCTURNAL_AFFIX_SPAWN_ID || (spawns[0] && spawns[0].affix_spawn_id) || 'nocturnal-affix-01-execution-grounds-guillotine-wraith';
  const activeSpawn = spawns.find(s => s.affix_spawn_id === selId) || spawns[0];

  return `
    <div id="atlasNocturnalAffixBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#a78bfa">🌑 D101 DYNAMIC WORLD WEATHER-TRIGGERED RARE SPAWNS, NOCTURNAL HUNT &amp; ECLIPSE AFFIX MATRIX:</span>
          <button type="button" onclick="setAtlasNocturnalAffixMode(!ATLAS_NOCTURNAL_AFFIX_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(139,92,246,0.55)'};background:${isAct ? '#5b21b6' : '#0f172a'};color:${isAct ? '#ffffff' : '#ddd6fe'}">
            🌑 Nocturnal &amp; Weather Spawns (16) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            16 Weather &amp; Time-Gated Rare Monsters · Blood Fog / Thunderstorm / Full-Moon Eclipse / Volcanic Ashfall · 4 Exclusive Crafting Reagents
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${spawns.slice(0, 6).map(s => {
            const sSel = isAct && s.affix_spawn_id === (activeSpawn && activeSpawn.affix_spawn_id);
            const colHex = s.accent || '#8b5cf6';
            return `
              <button type="button" onclick="selectNocturnalAffixSpawn('${escapeHtml(s.affix_spawn_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${sSel ? '#fde047' : colHex};background:${sSel ? '#4c1d95' : '#090d14'};color:${sSel ? '#ffffff' : '#ddd6fe'}">
                🌑 ${escapeHtml((s.title || s.affix_spawn_id).split('—')[0].trim())} (${escapeHtml(String(s.spawn_window_min))}m)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeSpawn ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(46,16,101,0.42);border:1px solid rgba(139,92,246,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#ddd6fe">🌑 ${escapeHtml(activeSpawn.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Trigger: ${escapeHtml(activeSpawn.trigger_condition)} · Window: ${escapeHtml(String(activeSpawn.spawn_window_min))} min
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#f472b6;border:1px solid rgba(244,114,182,0.4)">
                Affix: ${escapeHtml(activeSpawn.affix_mutation_tier)} · Party: ${escapeHtml(String(activeSpawn.recommended_party_size))}p
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Drop: ${escapeHtml(activeSpawn.exclusive_reagent_drop)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeSpawn.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #8b5cf6;background:#4c1d95;color:#ede9fe;font-size:9.5px;font-weight:800;cursor:pointer">
                🏰 Staging Town: ${escapeHtml(activeSpawn.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Zone / Dungeon:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeSpawn.zone_id)} / ${escapeHtml(activeSpawn.dungeon_id || 'Overland')}</span>
            · <strong style="color:#ddd6fe">Hunt Mechanics:</strong> ${escapeHtml(activeSpawn.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${spawns.map(s => {
              const isCardSel = s.affix_spawn_id === activeSpawn.affix_spawn_id;
              return `
                <div onclick="selectNocturnalAffixSpawn('${escapeHtml(s.affix_spawn_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(139,92,246,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(139,92,246,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((s.title || s.affix_spawn_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#ddd6fe">${escapeHtml(String(s.spawn_window_min))}m · ${escapeHtml(String(s.recommended_party_size))}p</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(s.exclusive_reagent_drop)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasCombatReplayBarHtml(tatlas) {
  const replays = Array.isArray(tatlas && tatlas.deterministic_combat_replays) ? tatlas.deterministic_combat_replays : [];
  if (!replays.length) return '';
  const isAct = !!ATLAS_COMBAT_REPLAY_MODE;
  const selId = SELECTED_DETERMINISTIC_COMBAT_REPLAY_ID || (replays[0] && replays[0].replay_sector_id) || 'combat-replay-01-talking-island';
  const activeReplay = replays.find(r => r.replay_sector_id === selId) || replays[0];

  return `
    <div id="atlasCombatReplayBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#34d399">📼 D102 DETERMINISTIC COMBAT REPLAY VERIFIER, ANTI-CHEAT DESYNC AUDIT &amp; BLAKE3 TICK HASH MATRIX:</span>
          <button type="button" onclick="setAtlasCombatReplayMode(!ATLAS_COMBAT_REPLAY_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(16,185,129,0.55)'};background:${isAct ? '#065f46' : '#0f172a'};color:${isAct ? '#ffffff' : '#a7f3d0'}">
            📼 Combat Replay Verifier (15) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            15 Town &amp; Siege Replay Sectors · 20–60Hz BLAKE3-256 State Merkle Chains · ChaCha12 PRNG Streams · Auto Loot-Freeze on Desync
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${replays.slice(0, 6).map(r => {
            const rSel = isAct && r.replay_sector_id === (activeReplay && activeReplay.replay_sector_id);
            const colHex = r.accent || '#10b981';
            return `
              <button type="button" onclick="selectDeterministicCombatReplay('${escapeHtml(r.replay_sector_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${rSel ? '#fde047' : colHex};background:${rSel ? '#064e3b' : '#090d14'};color:${rSel ? '#ffffff' : '#a7f3d0'}">
                📼 ${escapeHtml((r.title || r.replay_sector_id).split('—')[0].trim())} (${escapeHtml(String(r.tick_rate_hz))}Hz)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeReplay ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(6,78,59,0.42);border:1px solid rgba(16,185,129,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#a7f3d0">📼 ${escapeHtml(activeReplay.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Scope: ${escapeHtml(activeReplay.verification_scope)} · Rate: ${escapeHtml(String(activeReplay.tick_rate_hz))}Hz
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Rewind: ${escapeHtml(String(activeReplay.max_rewind_window_sec))}s · Bitrate: ${escapeHtml(String(activeReplay.replay_compression_kbps))} kbps
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Hash: ${escapeHtml(activeReplay.hash_chain_algorithm)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeReplay.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #10b981;background:#064e3b;color:#d1fae5;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Inspect ${escapeHtml(activeReplay.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">PRNG &amp; Auto-Halt:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeReplay.prng_seed_discipline)} · ${escapeHtml(activeReplay.desync_auto_halt_policy)}</span>
            · <strong style="color:#a7f3d0">Forensic Notes:</strong> ${escapeHtml(activeReplay.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${replays.map(r => {
              const isCardSel = r.replay_sector_id === activeReplay.replay_sector_id;
              return `
                <div onclick="selectDeterministicCombatReplay('${escapeHtml(r.replay_sector_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(16,185,129,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(16,185,129,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((r.title || r.replay_sector_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#a7f3d0">${escapeHtml(String(r.tick_rate_hz))}Hz · ${escapeHtml(String(r.max_rewind_window_sec))}s</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(r.verification_scope)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasLoreCodexBarHtml(tatlas) {
  const codices = Array.isArray(tatlas && tatlas.archaeological_lore_codices) ? tatlas.archaeological_lore_codices : [];
  if (!codices.length) return '';
  const isAct = !!ATLAS_LORE_CODEX_MODE;
  const selId = SELECTED_ARCHAEOLOGICAL_CODEX_ID || (codices[0] && codices[0].codex_id) || 'lore-codex-01-talking-island-elven-ruins-stele';
  const activeCodex = codices.find(c => c.codex_id === selId) || codices[0];

  return `
    <div id="atlasLoreCodexBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#fbbf24">🏺 D103 DYNAMIC WORLD LORE CODEX, ARCHAEOLOGICAL RELIC EXCAVATION &amp; BESTIARY MASTERY MATRIX:</span>
          <button type="button" onclick="setAtlasLoreCodexMode(!ATLAS_LORE_CODEX_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(245,158,11,0.55)'};background:${isAct ? '#92400e' : '#0f172a'};color:${isAct ? '#ffffff' : '#fde68a'}">
            🏺 Lore &amp; Relics (16) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            16 Ancient Dig Sites &amp; Steles · Giant Blueprints / Elmoreden Chronicles / Bestiary Compendiums · Account-Wide Passive Mastery
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${codices.slice(0, 6).map(c => {
            const cSel = isAct && c.codex_id === (activeCodex && activeCodex.codex_id);
            const colHex = c.accent || '#f59e0b';
            return `
              <button type="button" onclick="selectArchaeologicalCodex('${escapeHtml(c.codex_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${cSel ? '#fde047' : colHex};background:${cSel ? '#78350f' : '#090d14'};color:${cSel ? '#ffffff' : '#fde68a'}">
                🏺 ${escapeHtml((c.title || c.codex_id).split('—')[0].trim())} (${escapeHtml(String(c.excavation_fragments_required))} frags)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeCodex ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(120,53,15,0.42);border:1px solid rgba(245,158,11,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#fde68a">🏺 ${escapeHtml(activeCodex.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Category: ${escapeHtml(activeCodex.codex_category)} · Fragments: ${escapeHtml(String(activeCodex.excavation_fragments_required))}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Passive: ${escapeHtml(activeCodex.account_wide_passive_bonus)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Audiobook: ${escapeHtml(String(activeCodex.voiced_audiobook_duration_sec))}s · ${escapeHtml(activeCodex.decipher_skill_check)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeCodex.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #f59e0b;background:#78350f;color:#fef3c7;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Scholar Town: ${escapeHtml(activeCodex.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Excavation Site:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeCodex.zone_id)} / ${escapeHtml(activeCodex.dungeon_id)}</span>
            · <strong style="color:#fde68a">Codex Summary:</strong> ${escapeHtml(activeCodex.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${codices.map(c => {
              const isCardSel = c.codex_id === activeCodex.codex_id;
              return `
                <div onclick="selectArchaeologicalCodex('${escapeHtml(c.codex_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(245,158,11,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(245,158,11,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((c.title || c.codex_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#fde68a">${escapeHtml(String(c.excavation_fragments_required))}f · ${escapeHtml(String(c.voiced_audiobook_duration_sec))}s</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(c.account_wide_passive_bonus)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasPhysicsBiomeBarHtml(tatlas) {
  const biomes = Array.isArray(tatlas && tatlas.destructible_physics_biomes) ? tatlas.destructible_physics_biomes : [];
  if (!biomes.length) return '';
  const isAct = !!ATLAS_PHYSICS_BIOME_MODE;
  const selId = SELECTED_DESTRUCTIBLE_PHYSICS_BIOME_ID || (biomes[0] && biomes[0].physics_biome_id) || 'physics-biome-01-talking-island';
  const activeBiome = biomes.find(b => b.physics_biome_id === selId) || biomes[0];

  return `
    <div id="atlasPhysicsBiomeBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#22d3ee">🌊 D104 PROCEDURAL FOLIAGE WIND-FIELD, INTERACTIVE WATER RIPPLE &amp; DESTRUCTIBLE ENVIRONMENT PHYSICS MATRIX:</span>
          <button type="button" onclick="setAtlasPhysicsBiomeMode(!ATLAS_PHYSICS_BIOME_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(6,182,212,0.55)'};background:${isAct ? '#155e75' : '#0f172a'};color:${isAct ? '#ffffff' : '#a5f3fc'}">
            🌊 Physics &amp; Wind (15) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            15 Town &amp; Combat Physics Biomes · Voronoi Siege Fracture / SWE Water Wakes / 4-Octave Wind Shader / Jolt Debris Pools
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${biomes.slice(0, 6).map(b => {
            const bSel = isAct && b.physics_biome_id === (activeBiome && activeBiome.physics_biome_id);
            const colHex = b.accent || '#06b6d4';
            return `
              <button type="button" onclick="selectDestructiblePhysicsBiome('${escapeHtml(b.physics_biome_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${bSel ? '#fde047' : colHex};background:${bSel ? '#164e63' : '#090d14'};color:${bSel ? '#ffffff' : '#a5f3fc'}">
                🌊 ${escapeHtml((b.title || b.physics_biome_id).split('—')[0].trim())} (${escapeHtml(String(b.cpu_physics_step_budget_ms))}ms)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeBiome ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(22,78,99,0.42);border:1px solid rgba(6,182,212,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#a5f3fc">🌊 ${escapeHtml(activeBiome.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Tier: ${escapeHtml(activeBiome.physics_interaction_tier)} · Rigidbodies: ${escapeHtml(String(activeBiome.jolt_physics_rigidbodies_cap))}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Water RT: ${escapeHtml(activeBiome.water_ripple_rt_resolution)} · Wind Octaves: ${escapeHtml(String(activeBiome.foliage_wind_octave_layers))}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                CPU Budget: ${escapeHtml(String(activeBiome.cpu_physics_step_budget_ms))} ms · Fade: ${escapeHtml(String(activeBiome.debris_despawn_fade_sec))}s
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeBiome.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #06b6d4;background:#164e63;color:#cffafe;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Inspect ${escapeHtml(activeBiome.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Biome Zone:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeBiome.zone_id)}</span>
            · <strong style="color:#a5f3fc">Tech-Art Solver Notes:</strong> ${escapeHtml(activeBiome.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${biomes.map(b => {
              const isCardSel = b.physics_biome_id === activeBiome.physics_biome_id;
              return `
                <div onclick="selectDestructiblePhysicsBiome('${escapeHtml(b.physics_biome_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(6,182,212,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(6,182,212,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((b.title || b.physics_biome_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#a5f3fc">${escapeHtml(String(b.jolt_physics_rigidbodies_cap))}rb · ${escapeHtml(String(b.cpu_physics_step_budget_ms))}ms</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(b.physics_interaction_tier)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasBountyManhuntBarHtml(tatlas) {
  const bounties = Array.isArray(tatlas && tatlas.bounty_manhunt_contracts) ? tatlas.bounty_manhunt_contracts : [];
  if (!bounties.length) return '';
  const isAct = !!ATLAS_BOUNTY_MANHUNT_MODE;
  const selId = SELECTED_BOUNTY_MANHUNT_CONTRACT_ID || (bounties[0] && bounties[0].bounty_id) || 'bounty-contract-01-hunters-village-master-guild';
  const activeBounty = bounties.find(b => b.bounty_id === selId) || bounties[0];

  return `
    <div id="atlasBountyManhuntBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f87171">🎯 D105 DYNAMIC BOUNTY HUNTER CONTRACTS, CHAOTIC PK MANHUNT &amp; HIGH-VALUE TARGET TRACKING MATRIX:</span>
          <button type="button" onclick="setAtlasBountyManhuntMode(!ATLAS_BOUNTY_MANHUNT_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(239,68,68,0.55)'};background:${isAct ? '#7f1d1d' : '#0f172a'};color:${isAct ? '#ffffff' : '#fecaca'}">
            🎯 Bounty &amp; PK Manhunt (16) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            16 Bounty Boards &amp; Manhunt Sectors · Chaotic PK Warrants / Bandit Lords / Caravan Interdiction · Anti-Collusion Escrow
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${bounties.slice(0, 6).map(b => {
            const bSel = isAct && b.bounty_id === (activeBounty && activeBounty.bounty_id);
            const colHex = b.accent || '#ef4444';
            return `
              <button type="button" onclick="selectBountyManhuntContract('${escapeHtml(b.bounty_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${bSel ? '#fde047' : colHex};background:${bSel ? '#7f1d1d' : '#090d14'};color:${bSel ? '#ffffff' : '#fecaca'}">
                🎯 ${escapeHtml((b.title || b.bounty_id).split('—')[0].trim())} (${escapeHtml(String(b.escrow_reward_adena_k))}k)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeBounty ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(127,29,29,0.42);border:1px solid rgba(239,68,68,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#fecaca">🎯 ${escapeHtml(activeBounty.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Category: ${escapeHtml(activeBounty.contract_category)} · Karma ≥ ${escapeHtml(String(activeBounty.karma_threshold_min))}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Escrow: ${escapeHtml(String(activeBounty.escrow_reward_adena_k))}k Adena · Compass Pulse: ${escapeHtml(String(activeBounty.compass_tracking_pulse_sec))}s
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Rank: ${escapeHtml(activeBounty.hunter_rank_tier)} · ${escapeHtml(activeBounty.anti_collusion_guard)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeBounty.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #ef4444;background:#7f1d1d;color:#fee2e2;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Bounty Town: ${escapeHtml(activeBounty.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Manhunt Sector:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeBounty.zone_id)} / ${escapeHtml(activeBounty.dungeon_id)}</span>
            · <strong style="color:#fecaca">Warrant Brief:</strong> ${escapeHtml(activeBounty.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${bounties.map(b => {
              const isCardSel = b.bounty_id === activeBounty.bounty_id;
              return `
                <div onclick="selectBountyManhuntContract('${escapeHtml(b.bounty_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(239,68,68,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(239,68,68,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((b.title || b.bounty_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#fecaca">${escapeHtml(String(b.escrow_reward_adena_k))}k · ${escapeHtml(String(b.compass_tracking_pulse_sec))}s</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(b.contract_category)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasPitrChaosBarHtml(tatlas) {
  const drills = Array.isArray(tatlas && tatlas.disaster_recovery_pitr_drills) ? tatlas.disaster_recovery_pitr_drills : [];
  if (!drills.length) return '';
  const isAct = !!ATLAS_PITR_CHAOS_MODE;
  const selId = SELECTED_DISASTER_RECOVERY_DRILL_ID || (drills[0] && drills[0].pitr_drill_id) || 'pitr-drill-01-talking-island';
  const activeDrill = drills.find(d => d.pitr_drill_id === selId) || drills[0];

  return `
    <div id="atlasPitrChaosBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🛡️ D106 DISTRIBUTED WORLD-STATE SNAPSHOT BACKUP, POINT-IN-TIME RECOVERY (PITR) &amp; DISASTER-RECOVERY CHAOS DRILL MATRIX:</span>
          <button type="button" onclick="setAtlasPitrChaosMode(!ATLAS_PITR_CHAOS_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.55)'};background:${isAct ? '#0c4a6e' : '#0f172a'};color:${isAct ? '#ffffff' : '#bae6fd'}">
            🛡️ PITR &amp; Chaos Drills (15) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            15 Town Shard Partitions · pgBackRest Zstd WAL / Zero-Dupe Merkle Inventory Reconcile · Weekly Automated GameDay Drills
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${drills.slice(0, 6).map(d => {
            const dSel = isAct && d.pitr_drill_id === (activeDrill && activeDrill.pitr_drill_id);
            const colHex = d.accent || '#38bdf8';
            return `
              <button type="button" onclick="selectDisasterRecoveryDrill('${escapeHtml(d.pitr_drill_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${dSel ? '#fde047' : colHex};background:${dSel ? '#0c4a6e' : '#090d14'};color:${dSel ? '#ffffff' : '#bae6fd'}">
                🛡️ ${escapeHtml((d.title || d.pitr_drill_id).split('—')[0].trim())} (RTO ${escapeHtml(String(d.rto_automated_failover_sec))}s)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeDrill ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(12,74,110,0.42);border:1px solid rgba(56,189,248,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#bae6fd">🛡️ ${escapeHtml(activeDrill.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Scenario: ${escapeHtml(activeDrill.chaos_fault_scenario)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                RPO: ${escapeHtml(String(activeDrill.rpo_zero_data_loss_ms))} ms · RTO: ${escapeHtml(String(activeDrill.rto_automated_failover_sec))} s
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                ${escapeHtml(activeDrill.wal_archive_backend)} · ${escapeHtml(activeDrill.merkle_inventory_reconcile)}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeDrill.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #38bdf8;background:#0c4a6e;color:#e0f2fe;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Inspect Shard: ${escapeHtml(activeDrill.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Shard Partition:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeDrill.zone_id)} (${escapeHtml(activeDrill.chaos_schedule_cadence)})</span>
            · <strong style="color:#bae6fd">GameDay Drill Notes:</strong> ${escapeHtml(activeDrill.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${drills.map(d => {
              const isCardSel = d.pitr_drill_id === activeDrill.pitr_drill_id;
              return `
                <div onclick="selectDisasterRecoveryDrill('${escapeHtml(d.pitr_drill_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(56,189,248,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(56,189,248,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((d.title || d.pitr_drill_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#bae6fd">RPO ${escapeHtml(String(d.rpo_zero_data_loss_ms))}ms · RTO ${escapeHtml(String(d.rto_automated_failover_sec))}s</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(d.chaos_fault_scenario)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasTavernHubsBarHtml(tatlas) {
  const taverns = Array.isArray(tatlas && tatlas.tavern_social_hubs) ? tatlas.tavern_social_hubs : [];
  if (!taverns.length) return '';
  const isAct = !!ATLAS_TAVERN_HUBS_MODE;
  const selId = SELECTED_TAVERN_SOCIAL_HUB_ID || (taverns[0] && taverns[0].tavern_id) || 'tavern-hub-01-talking-island-salty-anchor-inn';
  const activeTavern = taverns.find(t => t.tavern_id === selId) || taverns[0];

  return `
    <div id="atlasTavernHubsBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#f59e0b">🍺 D107 DYNAMIC WORLD TAVERN MINI-GAMES, BARDIC MUSIC BUFFS &amp; SOCIAL MERCENARY RECRUITMENT MATRIX:</span>
          <button type="button" onclick="setAtlasTavernHubsMode(!ATLAS_TAVERN_HUBS_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(245,158,11,0.55)'};background:${isAct ? '#78350f' : '#0f172a'};color:${isAct ? '#ffffff' : '#fde68a'}">
            🍺 Taverns &amp; Bards (16) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            16 Iconic Town Taverns &amp; Bard Stages · Dwarven Dice / Relic Cards / Raid Mercenary Contracts · Culinary Party Feasts
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${taverns.slice(0, 6).map(t => {
            const tSel = isAct && t.tavern_id === (activeTavern && activeTavern.tavern_id);
            const colHex = t.accent || '#f59e0b';
            return `
              <button type="button" onclick="selectTavernSocialHub('${escapeHtml(t.tavern_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${tSel ? '#fde047' : colHex};background:${tSel ? '#78350f' : '#090d14'};color:${tSel ? '#ffffff' : '#fde68a'}">
                🍺 ${escapeHtml((t.title || t.tavern_id).split('—')[0].trim())} (${escapeHtml(String(t.bard_sheet_music_tracks))}🎶)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeTavern ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(120,53,15,0.42);border:1px solid rgba(245,158,11,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#fde68a">🍺 ${escapeHtml(activeTavern.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Social Hub: ${escapeHtml(activeTavern.social_category)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Specialty: ${escapeHtml(activeTavern.signature_brew_or_dish)} · Buff: ${escapeHtml(activeTavern.party_feast_buff)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                Escrow Cap: ${escapeHtml(String(activeTavern.minigame_escrow_cap_adena_k))}k Adena · Tracks: ${escapeHtml(String(activeTavern.bard_sheet_music_tracks))}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeTavern.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #f59e0b;background:#78350f;color:#fef3c7;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Tavern Town: ${escapeHtml(activeTavern.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Tavern Zone:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeTavern.zone_id)}</span>
            · <strong style="color:#fde68a">Social &amp; Minigame Notes:</strong> ${escapeHtml(activeTavern.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${taverns.map(t => {
              const isCardSel = t.tavern_id === activeTavern.tavern_id;
              return `
                <div onclick="selectTavernSocialHub('${escapeHtml(t.tavern_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(245,158,11,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(245,158,11,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((t.title || t.tavern_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#fde68a">${escapeHtml(String(t.minigame_escrow_cap_adena_k))}k · ${escapeHtml(String(t.bard_sheet_music_tracks))}🎶</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(t.social_category)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasChurnInterventionBarHtml(tatlas) {
  const interventions = Array.isArray(tatlas && tatlas.churn_sentiment_interventions) ? tatlas.churn_sentiment_interventions : [];
  if (!interventions.length) return '';
  const isAct = !!ATLAS_CHURN_INTERVENTION_MODE;
  const selId = SELECTED_CHURN_INTERVENTION_ID || (interventions[0] && interventions[0].intervention_id) || 'churn-intervention-01-talking-island';
  const activeIntervention = interventions.find(c => c.intervention_id === selId) || interventions[0];

  return `
    <div id="atlasChurnInterventionBar" style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#34d399">💚 D108 PLAYER SENTIMENT TELEMETRY, NET-PROMOTER IN-GAME SURVEY &amp; RAGE-QUIT CHURN INTERVENTION MATRIX:</span>
          <button type="button" onclick="setAtlasChurnInterventionMode(!ATLAS_CHURN_INTERVENTION_MODE)"
                  style="min-height:26px;padding:3px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer;border:1.5px solid ${isAct ? '#fde047' : 'rgba(52,211,153,0.55)'};background:${isAct ? '#064e3b' : '#0f172a'};color:${isAct ? '#ffffff' : '#a7f3d0'}">
            💚 Churn &amp; Retention (15) ${isAct ? '● ACTIVE' : '○ OFF'}
          </button>
          <span style="font-size:10px;color:#cbd5e1;font-weight:700">
            15 Town Friction Checkpoints · Boss Wipe / Refine Pity / Pathing Stall / Solo Bottleneck · Automated Care &amp; D7 Uplift
          </span>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          ${interventions.slice(0, 6).map(c => {
            const cSel = isAct && c.intervention_id === (activeIntervention && activeIntervention.intervention_id);
            const colHex = c.accent || '#34d399';
            return `
              <button type="button" onclick="selectChurnIntervention('${escapeHtml(c.intervention_id)}')"
                      style="min-height:23px;padding:2px 7px;border-radius:999px;font-size:9.3px;font-weight:800;cursor:pointer;border:1px solid ${cSel ? '#fde047' : colHex};background:${cSel ? '#064e3b' : '#090d14'};color:${cSel ? '#ffffff' : '#a7f3d0'}">
                💚 ${escapeHtml((c.title || c.intervention_id).split('—')[0].trim())} (+${escapeHtml(String(c.d7_retention_uplift_pct))}% D7)
              </button>
            `;
          }).join('')}
        </div>
      </div>
      ${isAct && activeIntervention ? `
        <div style="padding:8px 10px;border-radius:8px;background:rgba(6,78,59,0.42);border:1px solid rgba(52,211,153,0.45);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px">
              <span style="font-size:11px;font-weight:900;color:#a7f3d0">💚 ${escapeHtml(activeIntervention.title)}</span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#fde047;border:1px solid rgba(250,204,21,0.4)">
                Trigger: ${escapeHtml(activeIntervention.friction_trigger_type)} (Risk ≥ ${escapeHtml(String(activeIntervention.churn_risk_score_threshold))})
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#34d399;border:1px solid rgba(52,211,153,0.4)">
                Care Action: ${escapeHtml(activeIntervention.automated_care_action)}
              </span>
              <span class="mono" style="font-size:9.5px;padding:2px 6px;border-radius:5px;background:#090d14;color:#38bdf8;border:1px solid rgba(56,189,248,0.4)">
                D7 Uplift: +${escapeHtml(String(activeIntervention.d7_retention_uplift_pct))}% · NPS Survey Rate: ${escapeHtml(String(activeIntervention.micro_survey_trigger_rate_pct))}%
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button type="button" onclick="openTownDetail('${escapeHtml(activeBridgeOrTownId(activeIntervention.town_id))}')"
                      style="min-height:22px;padding:2px 8px;border-radius:5px;border:1px solid #34d399;background:#064e3b;color:#d1fae5;font-size:9.5px;font-weight:800;cursor:pointer">
                🏛️ Inspect Town: ${escapeHtml(activeIntervention.town_id)}
              </button>
            </div>
          </div>
          <div style="font-size:10px;color:#e2e8f0;line-height:1.4">
            <strong style="color:#fde047">Telemetry Checkpoint:</strong> <span class="mono" style="color:#38bdf8">${escapeHtml(activeIntervention.zone_id)}</span>
            · <strong style="color:#a7f3d0">LiveOps Intervention Notes:</strong> ${escapeHtml(activeIntervention.notes)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px">
            ${interventions.map(c => {
              const isCardSel = c.intervention_id === activeIntervention.intervention_id;
              return `
                <div onclick="selectChurnIntervention('${escapeHtml(c.intervention_id)}')"
                     style="padding:5px 7px;border-radius:6px;cursor:pointer;background:${isCardSel ? 'rgba(52,211,153,0.26)' : 'rgba(9,13,20,0.85)'};border:1px solid ${isCardSel ? '#fde047' : 'rgba(52,211,153,0.3)'};display:flex;flex-direction:column;gap:2px">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:4px">
                    <span style="font-size:9.5px;font-weight:800;color:#f8fafc">${escapeHtml((c.title || c.intervention_id).split('—')[0].trim())}</span>
                    <span class="mono" style="font-size:8.5px;color:#a7f3d0">+${escapeHtml(String(c.d7_retention_uplift_pct))}% D7 · ${escapeHtml(String(c.churn_risk_score_threshold))}</span>
                  </div>
                  <div class="mono" style="font-size:8.5px;color:#cbd5e1">
                    ${escapeHtml(c.friction_trigger_type)}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderAtlasFilterBarHtml(matchCount) {
  ATLAS_LAST_MATCH_COUNT = matchCount;
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const omniQuery = ATLAS_OMNI_SEARCH_QUERY || ATLAS_STATE_STORE.omniSearchQuery || '';
  const omniResults = searchAtlasOmniIndex(omniQuery, tatlas);
  const presetSearchChips = [
    'Gludin Village',
    'The Ant Nest',
    'Refinement +1..+15',
    'Warehouse',
    'MVP Bosses',
    'Raid Bosses',
    'Cruma Tower'
  ];
  const catPills = [
    { id: 'All', label: 'All Layers' },
    { id: 'RaceSpawns', label: 'Race Spawns (6)' },
    { id: 'TownMarks', label: 'NPCs (Shop + Refinement)' },
    { id: 'Monster', label: 'Monster' },
    { id: 'Mini-Boss', label: 'Mini-Boss' },
    { id: 'Raid', label: 'Raid' },
    { id: 'MVP', label: 'MVP' }
  ];
  const bandPills = ['All', '1-20', '21-40', '41-60', '61-80', '81-99'];
  const curPersona = ATLAS_PERSONA_LENS || ATLAS_STATE_STORE.personaLens || 'gamer';

  const personaLenses = [
    {
      id: 'gamer',
      label: 'Gamer',
      subtitle: 'Clean Exploration & Fast Travel',
      iconSvg: '<circle cx="8" cy="8" r="6"/><polygon points="6.5,9.5 7.5,6.5 10.5,5.5 9.5,8.5" fill="currentColor"/>'
    },
    {
      id: 'designer',
      label: 'Designer',
      subtitle: 'Growth Paths, Bosses, Quests & Economy',
      iconSvg: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor"/>'
    },
    {
      id: 'architect',
      label: 'Architect',
      subtitle: '4-Perspective Scale, Drift & Sign-Off',
      iconSvg: '<path d="M8 2L14 5.5L8 9L2 5.5L8 2Z"/><path d="M2 8.5L8 12L14 8.5"/><path d="M2 11.5L8 15L14 11.5"/>'
    },
    {
      id: 'developer',
      label: 'Developer',
      subtitle: '3D GLB, 10k-Bot Sim, NavMesh & GPU',
      iconSvg: '<polyline points="5.5,4.5 2,8 5.5,11.5"/><polyline points="10.5,4.5 14,8 10.5,11.5"/><line x1="9" y1="3" x2="7" y2="13"/>'
    },
    {
      id: 'liveops',
      label: 'LiveOps',
      subtitle: 'Sieges, Boss Radar, Economy & Churn Care',
      iconSvg: '<path d="M8 2L13 4.2V8.2C13 11.2 10.8 13.4 8 14.3C5.2 13.4 3 11.2 3 8.2V4.2L8 2Z"/>'
    }
  ];

  const curatedKeysByPersona = ATLAS_PERSONA_STUDIO_CATALOG;
  const showPresetChips = !ATLAS_OMNI_TRAY_DISMISSED && (Boolean(omniQuery) || ATLAS_PRESET_CHIPS_OPEN);
  const showRoutePlanner = ATLAS_ROUTE_PLANNER_OPEN;
  const showRaceGrowthRow = ATLAS_RACE_GROWTH_OPEN || (ATLAS_STATE_STORE.raceGrowthRoute && ATLAS_STATE_STORE.raceGrowthRoute !== 'All');
  const spatialCtx = getAtlasSpatialContext();
  const filterResolution = resolveAtlasEffectiveFilter(ATLAS_STATE_STORE.filter, spatialCtx);
  ATLAS_STATE_STORE.contextAutoHealNote = filterResolution.reason;

  return `
    <!-- Row 1: F-086 PersonaLensBar (.joy-lens-bar) with trailing OmniCommandBar & Workspace Toggles -->
    <div id="joyPersonaLensBar" class="joy-persona-lens-bar joy-lens-bar">
      <div class="joy-lens-bar__tabs" role="tablist" aria-label="Workspace Persona Lenses">
        ${personaLenses.map((pl, plIdx) => {
          const isAct = curPersona === pl.id;
          const lensCount = (curatedKeysByPersona[pl.id] || []).length;
          return `
            <button type="button" role="tab" aria-selected="${isAct ? 'true' : 'false'}" aria-pressed="${isAct ? 'true' : 'false'}" class="joy-lens-bar__tab" onclick="setAtlasPersonaLens('${pl.id}')" title="${escapeHtml(pl.subtitle)} (Hotkey: ${plIdx + 1})">
              <svg class="joy-lens-bar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pl.iconSvg}</svg>
              ${pl.label}
              <span class="joy-lens-bar__badge">${lensCount}</span>
              <kbd class="joy-lens-bar__kbd">${plIdx + 1}</kbd>
            </button>
          `;
        }).join('')}
      </div>
      <div class="joy-lens-bar__trailing">
        <!-- D13: Instant Atlas Omni-Search & Quick-Jump Popover -->
        <div class="joy-omni-command-bar" data-open="${showPresetChips ? 'true' : 'false'}">
          <div class="joy-omni-command-bar__field">
            <svg class="joy-lens-bar__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>
            <input id="atlasOmniSearchInput" class="joy-omni-command-bar__input" type="search"
                   value="${escapeHtml(omniQuery)}"
                   placeholder="🔎 Search Towns (Gludin, Dion, Oren), Dungeons (Ant Nest, Cruma), NPCs (Shop, Refinement, Warehouse), Races, or Mobs/MVPs..."
                   onchange="setAtlasOmniSearch(this.value)"
                   onkeydown="if(event.key==='Enter'){event.preventDefault();setAtlasOmniSearch(this.value);}" />
            ${omniQuery ? `
              <button type="button" class="joy-omni-command-bar__btn" onclick="clearAtlasOmniSearch()" title="Clear Search">Clear</button>
            ` : ''}
            <button type="button" class="joy-omni-command-bar__btn" onclick="toggleAtlasPresetChips()" title="Toggle Search Presets">Presets</button>
            <kbd class="joy-omni-command-bar__kbd">⌘K</kbd>
          </div>
          <div id="atlasOmniQuickJumpPills" class="joy-omni-command-bar__tray">
            ${showPresetChips ? `
            <button type="button" class="joy-omni-command-bar__close" onclick="dismissAtlasOmniTray()" title="Close search" aria-label="Close search">&times;</button>
            <div id="atlasPresetSearchChipsRow" class="joy-omni-command-bar__chips-row">
              ${presetSearchChips.map(chip => {
                const isAct = omniQuery.toLowerCase() === chip.toLowerCase();
                return `
                  <button type="button" class="joy-context-filter-bar__chip" aria-pressed="${isAct ? 'true' : 'false'}" onclick="setAtlasOmniSearch('${escapeHtml(chip)}')">
                    ${escapeHtml(chip)}
                  </button>
                `;
              }).join('')}
            </div>
            <div class="joy-omni-command-bar__group">
              <div class="joy-omni-command-bar__group-label mono">
                ${omniQuery ? `Quick-Jump Matches (${omniResults.length}):` : 'Instant Quick-Jump Action Pills:'}
              </div>
              ${omniResults.map(res => `
                <button type="button" class="joy-omni-command-bar__item" onclick="if(window.matchMedia&&window.matchMedia('(max-width: 767px)').matches)dismissAtlasOmniTray();${res.actionJs}">
                  <span>${escapeHtml(res.title.slice(0, 34))}</span>
                  <span class="joy-omni-command-bar__action mono">[${escapeHtml(String(res.actionLabel || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim())}]</span>
                </button>
              `).join('')}
            </div>
            ` : ''}
          </div>
        </div>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${ATLAS_PERSPECTIVE_BAR_OPEN ? 'true' : 'false'}" onclick="toggleAtlasPerspectiveBar()" title="Toggle 4-Perspective Scale Bar">
          Scale
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${ATLAS_LEFT_DRAWER_OPEN ? 'true' : 'false'}" onclick="toggleAtlasLeftDrawer()" title="Toggle Place Details Inspector Drawer">
          Details
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${ATLAS_QUICK_WARP_OPEN ? 'true' : 'false'}" onclick="toggleAtlasQuickWarp()" title="Toggle Quick Warp &amp; Zone Blueprints">
          Warp
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${showRoutePlanner ? 'true' : 'false'}" onclick="toggleAtlasRoutePlanner()" title="Toggle Travel Route Calculator">
          Route
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${showRaceGrowthRow ? 'true' : 'false'}" onclick="toggleAtlasRaceGrowthBar()" title="Toggle 6-Race Growth Path">
          Growth
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${ATLAS_DIMENSION_DRAWER_OPEN ? 'true' : 'false'}" onclick="toggleAtlasDimensionDrawer()" title="Toggle 108D Studio Overlays Dock">
          108D (${(curatedKeysByPersona[curPersona] || []).length})
        </button>
        <button type="button" class="joy-spatial-shell__toggle" aria-pressed="${ATLAS_THEATER_MODE ? 'true' : 'false'}" onclick="toggleAtlasTheaterMode()" title="Toggle Full-Viewport Theater Mode (Hotkey: F)">
          ${ATLAS_THEATER_MODE ? 'Exit Theater' : 'Theater'}
        </button>
      </div>
    </div>

    <!-- Row 2: F-086 ContextFilterBar (.joy-context-filter-bar) -->
    <div class="joy-context-filter-bar">
      <div class="joy-context-filter-bar__chips" role="group" aria-label="Filter Pins and Marks">
        ${catPills.map(p => {
          const active = filterResolution.effective === p.id;
          const notApplicableInView = (spatialCtx === 'dungeon' && (p.id === 'RaceSpawns' || p.id === 'TownMarks'))
            || (spatialCtx === 'town' && ['RaceSpawns', 'Monster', 'Mini-Boss', 'Raid', 'MVP'].includes(p.id))
            || (spatialCtx === 'field' && p.id === 'RaceSpawns');
          const tooltipMsg = notApplicableInView
            ? (spatialCtx === 'dungeon' ? `${p.label} applies to Overland / Town views (Dungeon floors contain Monster, Mini-Boss, Raid & MVP spawns)` : `${p.label} applies to Overland / Field / Dungeon views`)
            : `Filter map pins by ${p.label}`;
          return `
            <button type="button" class="joy-context-filter-bar__chip" aria-pressed="${active ? 'true' : 'false'}" ${notApplicableInView ? 'disabled' : ''} onclick="setAtlasFilter('${p.id}')" title="${escapeHtml(tooltipMsg)}">
              ${p.label}${active ? `<span class="joy-context-filter-bar__count">${matchCount}</span>` : ''}
            </button>
          `;
        }).join('')}
        ${filterResolution.reason ? `
          <span id="atlasContextAutoHealBadge" role="status" class="joy-context-filter-bar__notice">
            <span>${escapeHtml(filterResolution.reason)}</span>
            <button type="button" class="joy-context-filter-bar__notice-action" onclick="setAtlasFilter('All')">Keep All</button>
          </span>
        ` : ''}
      </div>
      <div class="joy-context-filter-bar__chips" role="group" aria-label="Level Band Filters">
        <select class="joy-context-filter-bar__select" aria-label="Level Band" onchange="setAtlasLevelBand(this.value)">
          ${bandPills.map(b => {
            const active = ATLAS_STATE_STORE.levelBand === b;
            return `<option value="${b}" ${active ? 'selected' : ''}>${b === 'All' ? 'All Lv.' : 'Lv.' + b}</option>`;
          }).join('')}
        </select>
        ${(ATLAS_STATE_STORE.filter !== 'All' || ATLAS_STATE_STORE.levelBand !== 'All' || ATLAS_STATE_STORE.raceGrowthRoute !== 'All') ? `
          <button type="button" class="joy-context-filter-bar__chip" onclick="resetAtlasFilters()">
            Reset Filters
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderAtlasBelowCanvasStudioDockHtml(matchCount) {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const allTowns = getAllAtlasTownEntries(tatlas);
  const allFields = getAllAtlasFieldEntries(tatlas);
  const allFortresses = getAllAtlasFortressEntries(tatlas);
  const allDungeons = (tatlas && tatlas.multi_floor_dungeons) || [];
  const all63Zones = getAllAtlas63Zones(tatlas);
  const routeFromId = ATLAS_ROUTE_FROM_ID || ATLAS_STATE_STORE.routeFromId || 'zone-town-lantern-hollow';
  const routeToId = ATLAS_ROUTE_TO_ID || ATLAS_STATE_STORE.routeToId || 'zone-dungeon-kiln-cellar';
  const routePresets = [
    { fromId: 'zone-town-lantern-hollow', toId: 'zone-dungeon-kiln-cellar', label: 'Gludin Village ➔ The Ant Nest' },
    { fromId: 'zone-town-lantern-hollow', toId: 'zone-town-kilnwatch-bastion', label: 'Gludin Village ➔ Town of Dion' },
    { fromId: 'zone-town-kilnwatch-bastion', toId: 'zone-dungeon-pendulum-shaft', label: 'Town of Dion ➔ Cruma Tower' },
    { fromId: 'zone-town-escapement-anvil', toId: 'zone-dungeon-star-heart-nave', label: 'Town of Oren ➔ Tower of Insolence' }
  ];
  const featuredDungeons = [
    { id: 'zone-dungeon-kiln-cellar', label: '🕳️ Kiln Cellar (The Ant Nest B1–B3)' },
    { id: 'zone-dungeon-pendulum-shaft', label: '🗼 Pendulum Shaft (Cruma Tower 1F–3F)' },
    { id: 'zone-dungeon-chronometer-foundry', label: '⚙️ Chronometer Foundry (Tower of Insolence 1F–3F)' }
  ];
  const activeTownId = ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow';
  const activeFieldOrFortId = ATLAS_STATE_STORE.activeFieldOrFortId || '';
  const activeDungeonId = ATLAS_STATE_STORE.activeDungeonId || '';
  const curPersona = ATLAS_PERSONA_LENS || ATLAS_STATE_STORE.personaLens || 'gamer';

  const studioBarEntries = [
    { key: 'refinement', persona: 'designer', label: 'D10 Blacksmith (+1..+15 Refinement)', render: () => renderAtlasBlacksmithRefinementBarHtml(tatlas) },
    { key: 'boss_hierarchy', persona: 'designer', label: 'D22 Boss Hierarchy (5-Tier God Chain)', render: () => renderAtlasBossHierarchyChainBarHtml(tatlas) },
    { key: 'quest_trials', persona: 'designer', label: 'D23 Quest Trials (3-Track Progression)', render: () => renderAtlasQuestTrialOverlayBarHtml(tatlas) },
    { key: 'farming_heatmap', persona: 'designer', label: 'D24 Farming Heatmap (Party & Spoils)', render: () => renderAtlasFarmingHeatmapBarHtml(tatlas) },
    { key: 'siege_domain', persona: 'liveops', label: 'D25 Castle Siege & Tax Domains', render: () => renderAtlasSiegeDomainBarHtml(tatlas) },
    { key: 'boss_radar', persona: 'liveops', label: 'D26 Boss Radar (MVP & Raid Windows)', render: () => renderAtlasBossRadarBarHtml(tatlas) },
    { key: 'seven_seals', persona: 'liveops', label: 'D27 Seven Seals & Mammon Rotation', render: () => renderAtlasSevenSealsBarHtml(tatlas) },
    { key: 'manor_economy', persona: 'liveops', label: 'D28 Manor Economy & Seed Caravans', render: () => renderAtlasManorEconomyBarHtml(tatlas) },
    { key: 'olympiad', persona: 'designer', label: 'D29 Subclass, Noblesse & Olympiad', render: () => renderAtlasOlympiadNetworkBarHtml(tatlas) },
    { key: 'transit_lines', persona: 'gamer', label: 'D30 Inter-Continental Transit', render: () => renderAtlasTransitLinesBarHtml(tatlas) },
    { key: 'soul_crystal', persona: 'designer', label: 'D31 Soul Crystal Resonance', render: () => renderAtlasSoulCrystalBarHtml(tatlas) },
    { key: 'fishing_sanctuary', persona: 'gamer', label: 'D32 Fishing & Hot Springs', render: () => renderAtlasFishingSanctuaryBarHtml(tatlas) },
    { key: 'pvp_karma', persona: 'liveops', label: 'D33 Cursed Weapons & PvP Karma', render: () => renderAtlasPvpKarmaBarHtml(tatlas) },
    { key: 'rift_sepulcher', persona: 'designer', label: 'D34 Dimensional Rift & Four Sepulchers', render: () => renderAtlasRiftSepulcherBarHtml(tatlas) },
    { key: 'augment_dye', persona: 'designer', label: 'D35 Weapon Augmentation & Dyes', render: () => renderAtlasAugmentDyeBarHtml(tatlas) },
    { key: 'companion_mount', persona: 'gamer', label: 'D36 Pets, Striders & Wyvern Mounts', render: () => renderAtlasCompanionMountBarHtml(tatlas) },
    { key: 'clan_academy', persona: 'liveops', label: 'D37 Clan Reputation & Academy', render: () => renderAtlasClanAcademyBarHtml(tatlas) },
    { key: 'herb_biome', persona: 'designer', label: 'D38 Elemental & Herb Sustainability', render: () => renderAtlasHerbBiomeBarHtml(tatlas) },
    { key: 'workshop_plaza', persona: 'designer', label: 'D39 Soulshot & Dwarven Workshops', render: () => renderAtlasWorkshopPlazaBarHtml(tatlas) },
    { key: 'territory_ward', persona: 'liveops', label: 'D40 Territory Wards & Codex Vaults', render: () => renderAtlasTerritoryWardBarHtml(tatlas) },
    { key: 'epic_jewelry', persona: 'designer', label: 'D41 Epic Boss Relic Jewelry', render: () => renderAtlasEpicJewelryBarHtml(tatlas) },
    { key: 'vitality_obelisk', persona: 'gamer', label: 'D42 Adventurer Guide & Vitality', render: () => renderAtlasVitalityObeliskBarHtml(tatlas) },
    { key: 'armor_set', persona: 'designer', label: 'D43 Armor Sets & Masterwork Forges', render: () => renderAtlasArmorSetBarHtml(tatlas) },
    { key: 'kamaloka', persona: 'designer', label: 'D44 Kamaloka, Pailaka & Seed Portals', render: () => renderAtlasKamalokaBarHtml(tatlas) },
    { key: 'skill_scroll', persona: 'designer', label: 'D45 Forgotten Scrolls & Skill Mastery', render: () => renderAtlasSkillScrollBarHtml(tatlas) },
    { key: 'elemental_quarry', persona: 'designer', label: 'D46 Elemental Quarries & Caravans', render: () => renderAtlasElementalQuarryBarHtml(tatlas) },
    { key: 'clan_hall', persona: 'liveops', label: 'D47 Clan Hall Auctions & Chateaus', render: () => renderAtlasClanHallBarHtml(tatlas) },
    { key: 'transformation', persona: 'designer', label: 'D48 Transformations, Talismans & Agathions', render: () => renderAtlasTransformationBarHtml(tatlas) },
    { key: 'warehouse', persona: 'liveops', label: 'D49 Warehouse, Clan Vault & Freight', render: () => renderAtlasWarehouseBarHtml(tatlas) },
    { key: 'master_tour', persona: 'gamer', label: 'D50 50D Master Cartographic Tour', render: () => renderAtlasMasterTourBarHtml(tatlas) },
    { key: 'festival_oracle', persona: 'liveops', label: 'D51 Festival of Darkness Oracles', render: () => renderAtlasFestivalOracleBarHtml(tatlas) },
    { key: 'luxury_market', persona: 'liveops', label: 'D52 Luxury Boutique & Black Marketeer', render: () => renderAtlasLuxuryMarketBarHtml(tatlas) },
    { key: 'faction_alliance', persona: 'designer', label: 'D53 Factional Alliances & Totems', render: () => renderAtlasFactionAllianceBarHtml(tatlas) },
    { key: 'fantasy_plaza', persona: 'gamer', label: 'D54 Monster Derby & Kratei Cube', render: () => renderAtlasFantasyPlazaBarHtml(tatlas) },
    { key: 'hero_weapon', persona: 'liveops', label: 'D55 Hero Weapons & Olympiad Tokens', render: () => renderAtlasHeroWeaponBarHtml(tatlas) },
    { key: 'treasure_chest', persona: 'gamer', label: 'D56 Treasure Chests & Lockpick Caches', render: () => renderAtlasTreasureChestBarHtml(tatlas) },
    { key: 'aerial_dock', persona: 'gamer', label: 'D57 Clan Airship Docks & Star Stones', render: () => renderAtlasAerialDockBarHtml(tatlas) },
    { key: 'belt_cloak', persona: 'designer', label: 'D58 Mithril Belts & Sovereign Cloaks', render: () => renderAtlasBeltCloakBarHtml(tatlas) },
    { key: 'wedding', persona: 'gamer', label: 'D59 Wedding Cathedrals & Formal Wear', render: () => renderAtlasWeddingBarHtml(tatlas) },
    { key: 'council_benchmark', persona: 'architect', label: 'D60 6-Role Studio Council 60D Audit', render: () => renderAtlasCouncilBenchmarkBarHtml(tatlas) },
    { key: 'seed_cycle', persona: 'liveops', label: 'D61 Continental Seed Cycle (Stages 1–5)', render: () => renderAtlasSeedCycleBarHtml(tatlas) },
    { key: 'coliseum_tournament', persona: 'liveops', label: 'D62 Underground Coliseum & Tournaments', render: () => renderAtlasColiseumTournamentBarHtml(tatlas) },
    { key: 'elemental_jewel', persona: 'designer', label: 'D63 Elemental Jewels & Raid Runes', render: () => renderAtlasElementalJewelBarHtml(tatlas) },
    { key: 'fame_monument', persona: 'liveops', label: 'D64 Reputation Monuments & PvP Infusion', render: () => renderAtlasFameMonumentBarHtml(tatlas) },
    { key: 'delusion_chamber', persona: 'designer', label: 'D65 Delusion Chambers & Aenkinel', render: () => renderAtlasDelusionChamberBarHtml(tatlas) },
    { key: 'command_raid', persona: 'liveops', label: 'D66 Zaken, Freya & Frintezza Command Raids', render: () => renderAtlasCommandRaidBarHtml(tatlas) },
    { key: 'nevit_blessing', persona: 'gamer', label: 'D67 Nevit Blessing & Hunting Helpers', render: () => renderAtlasNevitBlessingBarHtml(tatlas) },
    { key: 'council_signoff', persona: 'architect', label: 'D68 Studio Council D1–D68 Sign-Off', render: () => renderAtlasCouncilSignoffBarHtml(tatlas) },
    { key: 'champion_mob', persona: 'designer', label: 'D69 Champion Mob Auras & Herd Leaders', render: () => renderAtlasChampionMobBarHtml(tatlas) },
    { key: 'dualsword_forge', persona: 'designer', label: 'D70 Dualsword Stamps & Maestro Ishuma', render: () => renderAtlasDualswordForgeBarHtml(tatlas) },
    { key: 'tech_art', persona: 'developer', label: 'D71 3D GLB Asset Gate', render: () => renderAtlasTechArtPipelineBarHtml(tatlas) },
    { key: 'bot_swarm', persona: 'developer', label: 'D72 10k-Bot Swarm & SpatialGrid', render: () => renderAtlasBotSwarmSimBarHtml(tatlas) },
    { key: 'liveops_gm', persona: 'liveops', label: 'D73 LiveOps GM Rescue', render: () => renderAtlasLiveopsGmBarHtml(tatlas) },
    { key: 'tools_squad', persona: 'architect', label: 'D74 Tools Squad', render: () => renderAtlasToolsSquadBarHtml(tatlas) },
    { key: 'dialogue_dag', persona: 'designer', label: 'D75 Dialogue DAG', render: () => renderAtlasDialogueGraphBarHtml(tatlas) },
    { key: 'spawner_balancer', persona: 'designer', label: 'D76 Spawner Balancer', render: () => renderAtlasSpawnerBalancerBarHtml(tatlas) },
    { key: 'skill_timelines', persona: 'designer', label: 'D77 Skill Timelines', render: () => renderAtlasSkillTimelineBarHtml(tatlas) },
    { key: 'build_farm', persona: 'developer', label: 'D78 Build Farm', render: () => renderAtlasBuildFarmBarHtml(tatlas) },
    { key: 'architect_dx', persona: 'architect', label: 'D79 Architect DX & Schema Drift', render: () => renderAtlasArchitectDxBarHtml(tatlas) },
    { key: 'two_ring_80d', persona: 'architect', label: 'D80 80D Sign-Off', render: () => renderAtlasTwoRingSignoffBarHtml(tatlas) },
    { key: 'weather_shader', persona: 'developer', label: 'D81 Weather/Shader', render: () => renderAtlasWeatherAcousticBarHtml(tatlas) },
    { key: 'server_mesh', persona: 'developer', label: 'D82 Server-Mesh WAL', render: () => renderAtlasServerMeshBarHtml(tatlas) },
    { key: 'anti_bot', persona: 'liveops', label: 'D83 Anti-Bot Sentinel', render: () => renderAtlasAntiBotSentinelBarHtml(tatlas) },
    { key: 'godot_storybook', persona: 'developer', label: 'D84 Godot 3D Storybook', render: () => renderAtlasGodotStorybookBarHtml(tatlas) },
    { key: 'navmesh', persona: 'developer', label: 'D85 3D NavMesh', render: () => renderAtlasNavmeshObstacleBarHtml(tatlas) },
    { key: 'event_flags', persona: 'liveops', label: 'D86 Event Flags', render: () => renderAtlasLiveopsEventFlagsBarHtml(tatlas) },
    { key: 'camera_rails', persona: 'developer', label: 'D87 Camera Rails', render: () => renderAtlasCinematicCameraRailsBarHtml(tatlas) },
    { key: 'gpu_vram', persona: 'developer', label: 'D88 Client GPU/VRAM', render: () => renderAtlasClientGpuBudgetsBarHtml(tatlas) },
    { key: 'headless_qa', persona: 'developer', label: 'D89 Headless QA', render: () => renderAtlasAutomatedQaSuitesBarHtml(tatlas) },
    { key: 'studio_90d', persona: 'architect', label: 'D90 90D Ledger', render: () => renderAtlasStudio90dLedgerBarHtml(tatlas) },
    { key: 'faction_dispositions', persona: 'liveops', label: 'D91 Faction Dispositions', render: () => renderAtlasFactionDispositionBarHtml(tatlas) },
    { key: 'auction_escrow', persona: 'liveops', label: 'D92 Auction Escrow', render: () => renderAtlasAuctionEscrowBarHtml(tatlas) },
    { key: 'world_incursions', persona: 'liveops', label: 'D93 World Incursions', render: () => renderAtlasWorldIncursionBarHtml(tatlas) },
    { key: 'clan_treasury', persona: 'liveops', label: 'D94 Clan Treasury', render: () => renderAtlasClanTreasuryBarHtml(tatlas) },
    { key: 'housing_estates', persona: 'designer', label: 'D95 Player Housing & Estates', render: () => renderAtlasHousingEstatesBarHtml(tatlas) },
    { key: 'cdn_webrtc', persona: 'liveops', label: 'D96 CDN/WebRTC', render: () => renderAtlasCdnWebrtcBarHtml(tatlas) },
    { key: 'caravan_routes', persona: 'liveops', label: 'D97 Caravan Trade Routes', render: () => renderAtlasCaravanRoutesBarHtml(tatlas) },
    { key: 'localization_vo', persona: 'developer', label: 'D98 Localization VO & Lip-Sync', render: () => renderAtlasLocalizationVoBarHtml(tatlas) },
    { key: 'hot_reload_bridge', persona: 'architect', label: 'D99 Hot-Reload Bridge', render: () => renderAtlasHotReloadBridgeBarHtml(tatlas) },
    { key: 'centennial_100d', persona: 'architect', label: 'D100 Centennial Charter', render: () => renderAtlasCentennial100dBarHtml(tatlas) },
    { key: 'nocturnal_affix', persona: 'designer', label: 'D101 Nocturnal & Eclipse Affixes', render: () => renderAtlasNocturnalAffixBarHtml(tatlas) },
    { key: 'combat_replay', persona: 'developer', label: 'D102 BLAKE3 Combat Replay', render: () => renderAtlasCombatReplayBarHtml(tatlas) },
    { key: 'lore_codex', persona: 'designer', label: 'D103 Archaeological Lore Codices', render: () => renderAtlasLoreCodexBarHtml(tatlas) },
    { key: 'physics_biomes', persona: 'developer', label: 'D104 Physics Biomes', render: () => renderAtlasPhysicsBiomeBarHtml(tatlas) },
    { key: 'bounty_manhunt', persona: 'liveops', label: 'D105 Bounty Manhunt', render: () => renderAtlasBountyManhuntBarHtml(tatlas) },
    { key: 'pitr_chaos', persona: 'developer', label: 'D106 DR PITR Chaos', render: () => renderAtlasPitrChaosBarHtml(tatlas) },
    { key: 'tavern_hubs', persona: 'liveops', label: 'D107 Tavern Hubs', render: () => renderAtlasTavernHubsBarHtml(tatlas) },
    { key: 'churn_care', persona: 'liveops', label: 'D108 Churn Care', render: () => renderAtlasChurnInterventionBarHtml(tatlas) }
  ];

  const curatedKeysByPersona = ATLAS_PERSONA_STUDIO_CATALOG;
  const activeCuratedKeys = curatedKeysByPersona[curPersona] || curatedKeysByPersona.designer;
  const curatedStudioEntries = activeCuratedKeys.map(k => studioBarEntries.find(e => e.key === k)).filter(Boolean);
  const activeBarKey = ATLAS_ACTIVE_STUDIO_BAR || ATLAS_STATE_STORE.activeStudioBar || 'boss_hierarchy';
  const showAllStudioBars = activeBarKey === 'all';
  const activeStudioEntry = studioBarEntries.find(e => e.key === activeBarKey) || curatedStudioEntries[0] || studioBarEntries[0];
  const compareStudioEntry = (!showAllStudioBars && ATLAS_COMPARE_STUDIO_BAR && (!activeStudioEntry || ATLAS_COMPARE_STUDIO_BAR !== activeStudioEntry.key))
    ? studioBarEntries.find(e => e.key === ATLAS_COMPARE_STUDIO_BAR)
    : null;
  const visibleStudioHtml = !ATLAS_DIMENSION_DRAWER_OPEN
    ? ''
    : (showAllStudioBars
      ? studioBarEntries.map(e => e.render()).join('\n')
      : [activeStudioEntry ? activeStudioEntry.render() : '', compareStudioEntry ? compareStudioEntry.render() : ''].filter(Boolean).join('\n'));
  const hiddenStudioHtml = '';

  const showRoutePlanner = ATLAS_ROUTE_PLANNER_OPEN;
  const showRaceGrowthRow = Boolean(ATLAS_RACE_GROWTH_OPEN || (ATLAS_STATE_STORE.raceGrowthRoute && ATLAS_STATE_STORE.raceGrowthRoute !== 'All'));
  const showQuickWarpRow = Boolean(ATLAS_QUICK_WARP_OPEN || matchCount === 0);

  return `
    <div id="atlasBelowCanvasStudioDock" style="display:flex;flex-direction:column;gap:6px;padding:6px 12px;background:#111b2b">
      <!-- D17: Interactive Point-to-Point Travel Route & Gatekeeper Calculator across all 63 Zones -->
      <div id="atlasTravelRouteFinderBar" style="display:${showRoutePlanner ? 'flex' : 'none'};justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.08)">
        ${showRoutePlanner ? `
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:900;color:#38bdf8">🧭 Route From:</span>
          <select aria-label="Travel Route Origin Zone" onchange="setAtlasRouteEndpoints(this.value, ATLAS_ROUTE_TO_ID)"
                  style="height:26px;padding:1px 7px;border-radius:6px;background:#0d1624;color:#f8fafc;border:1px solid rgba(56,189,248,0.55);font-size:10px;font-weight:700;cursor:pointer">
            ${all63Zones.map(z => {
              const sel = z.zone_id === routeFromId ? 'selected' : '';
              return `<option value="${escapeHtml(z.zone_id)}" ${sel}>[${escapeHtml(z.zoneCategory)}] ${escapeHtml(z.name)}</option>`;
            }).join('')}
          </select>
          <span class="mono" style="font-size:11px;font-weight:900;color:#fde047">➔</span>
          <select aria-label="Travel Route Destination Zone" onchange="setAtlasRouteEndpoints(ATLAS_ROUTE_FROM_ID, this.value)"
                  style="height:26px;padding:1px 7px;border-radius:6px;background:#0d1624;color:#f8fafc;border:1px solid rgba(250,204,21,0.55);font-size:10px;font-weight:700;cursor:pointer">
            ${all63Zones.map(z => {
              const sel = z.zone_id === routeToId ? 'selected' : '';
              return `<option value="${escapeHtml(z.zone_id)}" ${sel}>[${escapeHtml(z.zoneCategory)}] ${escapeHtml(z.name)}</option>`;
            }).join('')}
          </select>
        </div>
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span class="mono" style="font-size:9.5px;color:#94a3b8;font-weight:800">⚡ Route Presets:</span>
          ${routePresets.map(rp => {
            const isAct = routeFromId === rp.fromId && routeToId === rp.toId;
            return `
              <button type="button" onclick="setAtlasRouteEndpoints('${rp.fromId}', '${rp.toId}')"
                      style="min-height:24px;padding:2px 8px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#fde047' : 'rgba(56,189,248,0.45)'};background:${isAct ? '#0369a1' : '#0d1624'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                🧭 ${escapeHtml(rp.label)}
              </button>
            `;
          }).join('')}
        </div>
        ` : ''}
      </div>

      <!-- D9: 6-Race Starter-to-Endgame Travel Path Selector -->
      <div id="atlasRaceGrowthPathRow" style="display:${showRaceGrowthRow ? 'flex' : 'none'};justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06)">
        ${showRaceGrowthRow ? `
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#fde047;margin-right:4px">🛤️ Highlight Race Growth Path:</span>
          ${['All', 'Human', 'Lunar', 'Ogre/Orc', 'Dwarf', 'Dark-Lunar', 'Furral'].map(rLabel => {
            const active = (ATLAS_STATE_STORE.raceGrowthRoute || 'All') === rLabel;
            return `
              <button type="button" onclick="setAtlasRaceGrowthRoute('${rLabel}')"
                      style="min-height:25px;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#fde047' : 'rgba(255,255,255,0.14)'};background:${active ? '#b45309' : '#172030'};color:${active ? '#ffffff' : '#fde68a'}">
                ${rLabel === 'All' ? '🌐 All (Off)' : '🧬 ' + rLabel}
              </button>
            `;
          }).join('')}
        </div>
        <span class="mono" style="font-size:9.5px;color:#94a3b8">Stages A..L: Spawn ➔ Starter Town ➔ Field ➔ Ant Nest/Dungeon ➔ Dion Hub ➔ Oren/Cruma Tower ➔ Halo Endgame</span>
        ` : ''}
      </div>

      <!-- Quick Semantic Zoom, All 15 Town Street Blueprints, 24 Field Tactical Blueprints, 8 Fortress Blueprints & 16 Multi-Floor Dungeons -->
      <div id="atlasQuickWarpCollapsibleRow" style="display:${showQuickWarpRow ? 'flex' : 'none'};justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06)">
        ${showQuickWarpRow ? `
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px">
          <span class="mono" style="font-size:10px;font-weight:800;color:#fde047">⚡ QUICK WARP &amp; BLUEPRINTS:</span>
          <button type="button" onclick="zoomStudioMap(0, true)"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 1 ? '#fde047' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 1 ? '#854d0e' : '#1e293b'};color:#fde68a">
            🌍 Overland Macro (1.0×)
          </button>
          <button type="button" onclick="ATLAS_STATE_STORE.activeDungeonId=''; ATLAS_STATE_STORE.activeFieldOrFortId=''; zoomStudioMap(0, false, 2.8)"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 2 ? '#38bdf8' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && getSemanticZoomLodTier() === 2 ? '#0369a1' : '#1e293b'};color:#bae6fd">
            🛤️ Regional Roads &amp; Portals (2.8×)
          </button>
          <button type="button" onclick="focusTownStreetBlueprint(ATLAS_STATE_STORE.activeTownId || 'town-lantern-hollow')"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${!ATLAS_STATE_STORE.activeDungeonId && !activeFieldOrFortId && getSemanticZoomLodTier() === 3 ? '#4ade80' : 'rgba(255,255,255,0.15)'};background:${!ATLAS_STATE_STORE.activeDungeonId && !activeFieldOrFortId && getSemanticZoomLodTier() === 3 ? '#065f46' : '#1e293b'};color:#bbf7d0">
            🏘️ Town Street &amp; Shop/Refinement Blueprint (5.2×)
          </button>
          <button type="button" onclick="focusFieldTacticalBlueprint(ATLAS_STATE_STORE.activeFieldOrFortId || 'zone-field-clover-south-gate')"
                  style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${activeFieldOrFortId ? '#86efac' : 'rgba(255,255,255,0.15)'};background:${activeFieldOrFortId ? '#14532d' : '#1e293b'};color:#dcfce7">
            🏕️ Field Tactical Blueprint (4.8×)
          </button>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#bbf7d0">
            <span>🏰 Town (${allTowns.length}):</span>
            <select aria-label="Select Town Blueprint" onchange="if(this.value){const [tid,loc]=this.value.split('|');focusTownStreetBlueprint(tid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#0f172a;color:#f8fafc;border:1px solid rgba(74,222,128,0.5);font-size:10px;font-weight:700;cursor:pointer">
              ${allTowns.map(t => {
                const sel = (!activeFieldOrFortId && (t.studio_node_id === activeTownId || t.zone_id === activeTownId)) ? 'selected' : '';
                return `<option value="${escapeHtml(t.studio_node_id)}|${escapeHtml(t.loc_coord || '')}" ${sel}>${escapeHtml(t.name)}</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#86efac">
            <span>🏕️ Field (${allFields.length}):</span>
            <select aria-label="Select Field Tactical Blueprint" onchange="if(this.value){const [fid,loc]=this.value.split('|');focusFieldTacticalBlueprint(fid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#052e16;color:#f0fdf4;border:1px solid rgba(134,239,172,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeFieldOrFortId ? 'selected' : ''}>— Select Any of ${allFields.length} Field Hunting Areas —</option>
              ${allFields.map(f => {
                const sel = (f.zone_id === activeFieldOrFortId || f.studio_node_id === activeFieldOrFortId) ? 'selected' : '';
                return `<option value="${escapeHtml(f.zone_id)}|${escapeHtml(f.loc_coord || '')}" ${sel}>${escapeHtml(f.name)} (Lv.${(f.level_band || [1, 12]).join('–')})</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#fed7aa">
            <span>🛡️ Fortress/Harbor (${allFortresses.length}):</span>
            <select aria-label="Select Fortress Blueprint" onchange="if(this.value){const [hid,loc]=this.value.split('|');focusFortressBlueprint(hid,loc);}"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#431407;color:#ffedd5;border:1px solid rgba(251,146,60,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeFieldOrFortId ? 'selected' : ''}>— Select Any of ${allFortresses.length} Harbors/ClanHalls/Fortresses —</option>
              ${allFortresses.map(h => {
                const sel = (h.zone_id === activeFieldOrFortId || h.studio_node_id === activeFieldOrFortId) ? 'selected' : '';
                return `<option value="${escapeHtml(h.zone_id)}|${escapeHtml(h.loc_coord || '')}" ${sel}>${escapeHtml(h.name)} [${escapeHtml(h.category)}]</option>`;
              }).join('')}
            </select>
          </label>
          <label style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;color:#e9d5ff">
            <span>🕳️ Dungeon (${allDungeons.length}):</span>
            <select aria-label="Select Multi-Floor Dungeon Sub-Map" onchange="if(this.value) openDungeonSubMap(this.value)"
                    style="height:25px;padding:1px 6px;border-radius:6px;background:#1e1035;color:#f3e8ff;border:1px solid rgba(192,132,252,0.55);font-size:10px;font-weight:700;cursor:pointer">
              <option value="" ${!activeDungeonId ? 'selected' : ''}>— Select Any of ${allDungeons.length} Multi-Floor Dungeons —</option>
              ${allDungeons.map(d => {
                const sel = (d.dungeon_id === activeDungeonId || d.studio_node_id === activeDungeonId) ? 'selected' : '';
                const fSpan = (d.floors || []).map(f => f.floor_id).join('⇄');
                return `<option value="${escapeHtml(d.dungeon_id)}" ${sel}>${escapeHtml(d.name)} [${escapeHtml(fSpan)}]</option>`;
              }).join('')}
            </select>
          </label>
          ${featuredDungeons.map(d => {
            const active = ATLAS_STATE_STORE.activeDungeonId === d.id;
            return `
              <button type="button" onclick="openDungeonSubMap('${d.id}')"
                      style="min-height:25px;padding:2px 9px;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer;border:1px solid ${active ? '#e9d5ff' : 'rgba(168,85,247,0.45)'};background:${active ? '#7e22ce' : 'rgba(59,7,100,0.65)'};color:#f3e8ff">
                ${d.label}
              </button>
            `;
          }).join('')}
        </div>
        ${matchCount === 0 ? `
          <div style="display:inline-flex;align-items:center;gap:8px;padding:3px 10px;border-radius:6px;background:rgba(220,38,38,0.22);border:1px solid #f87171;color:#fecaca;font-size:10.5px;font-weight:800">
            <span>⚠️ 0 matches for active filter (${escapeHtml(ATLAS_STATE_STORE.filter)} / ${escapeHtml(ATLAS_STATE_STORE.levelBand)})</span>
            <button type="button" onclick="resetAtlasFilters()" style="padding:1px 7px;border-radius:4px;border:1px solid #fca5a5;background:#991b1b;color:#ffffff;font-size:10px;font-weight:800;cursor:pointer">Reset Filters</button>
          </div>
        ` : ''}
        ` : ''}
      </div>

      <!-- Below-Canvas 108D Studio Overlay Drawer (Never Pushes Map Canvas Down!) -->
      <div id="atlas108dCollapsibleDrawer" style="display:${ATLAS_DIMENSION_DRAWER_OPEN ? 'flex' : 'none'};flex-direction:column;gap:8px;max-height:380px;overflow-y:auto;padding:8px 10px;border-radius:8px;background:#0d1624;border:1px solid rgba(218,179,98,0.4)">
        ${ATLAS_DIMENSION_DRAWER_OPEN ? `
        <div id="atlasStudioDimensionSelectorBar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.1)">
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:5px">
            <span class="mono" style="font-size:10px;font-weight:900;color:#dab362">🎛️ STUDIO TOOL SELECTOR (${escapeHtml(curPersona.toUpperCase())}):</span>
            ${curatedStudioEntries.map(entry => {
              const isAct = !showAllStudioBars && activeStudioEntry && activeStudioEntry.key === entry.key;
              return `
                <button type="button" onclick="setAtlasActiveStudioBar('${entry.key}')"
                        style="min-height:24px;padding:2px 9px;border-radius:999px;font-size:9.8px;font-weight:800;cursor:pointer;border:1px solid ${isAct ? '#dab362' : 'rgba(56,189,248,0.4)'};background:${isAct ? '#b45309' : '#111b2b'};color:${isAct ? '#ffffff' : '#bae6fd'}">
                  ${escapeHtml(entry.label)}
                </button>
              `;
            }).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <select aria-label="Select Any 108D Studio Dimension Tool" onchange="setAtlasActiveStudioBar(this.value)"
                    style="height:25px;padding:1px 7px;border-radius:6px;background:#111b2b;color:#fde047;border:1px solid rgba(218,179,98,0.55);font-size:10px;font-weight:800;cursor:pointer">
              ${curatedStudioEntries.map(e => `
                <option value="${escapeHtml(e.key)}" ${(!showAllStudioBars && activeStudioEntry && activeStudioEntry.key === e.key) ? 'selected' : ''}>${escapeHtml(e.label)}</option>
              `).join('')}
              <option value="all" ${showAllStudioBars ? 'selected' : ''}>📚 Show All 90 Bars Simultaneously</option>
            </select>
            <select aria-label="Compare Second 108D Studio Dimension Overlay" onchange="setAtlasCompareStudioBar(this.value)"
                    style="height:25px;padding:1px 7px;border-radius:6px;background:#111b2b;color:#93c5fd;border:1px solid rgba(56,189,248,0.45);font-size:10px;font-weight:800;cursor:pointer">
              <option value="" ${!ATLAS_COMPARE_STUDIO_BAR ? 'selected' : ''}>⚖️ Compare Overlay: None</option>
              ${curatedStudioEntries.map(e => `
                <option value="${escapeHtml(e.key)}" ${ATLAS_COMPARE_STUDIO_BAR === e.key ? 'selected' : ''}>⚖️ + ${escapeHtml(e.label)}</option>
              `).join('')}
            </select>
            <button type="button" onclick="setAtlasActiveStudioBar('${showAllStudioBars ? (curatedStudioEntries[0] ? curatedStudioEntries[0].key : 'boss_hierarchy') : 'all'}')"
                    style="min-height:24px;padding:2px 8px;border-radius:6px;font-size:9.5px;font-weight:800;cursor:pointer;border:1px solid rgba(218,179,98,0.4);background:${showAllStudioBars ? '#7c2d12' : '#14253e'};color:#fde68a">
              ${showAllStudioBars ? '🎯 Single-Card Mode' : 'Show All 90 Bars'}
            </button>
          </div>
        </div>
        ` : ''}
        <div id="atlasActiveStudioBarMount" style="display:flex;flex-direction:column;gap:8px">
          ${visibleStudioHtml}
        </div>
        <div id="atlasInactiveStudioBarsVault" style="display:none">
          ${hiddenStudioHtml}
        </div>
      </div>
    </div>
  `;
}

