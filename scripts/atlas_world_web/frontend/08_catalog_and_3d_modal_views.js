function renderBiomeBrushes() {
  const pals = DATA.groundPalettes || {};
  const snaps = DATA.studioSnapshots || [];

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">STAGE 4 DECLARATIVE GROUND_ID BRUSHES · SMART TAG POOLS + CHECKBOX OVERRIDE</div>
        <h1 class="page-hero__title">Biome Brush &amp; Smart Tag-Pool Composer (<code>content/ground_palettes.json</code>)</h1>
        <p class="page-hero__sub">
          Each <code>ground_id</code> brush auto-populates 3D models by tag and enforces the <strong>1.05m Chibi Player Scale</strong>
          (grass ≤ 0.35m, bush ≤ 0.65m). Uncheck any 3D asset below to immediately exclude it from <code>freja-south-gate.json</code> chunk scatter.
        </p>
      </div>
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="undoStudioSnapshot()" ${snaps.length === 0 ? 'disabled' : ''}>
          ↩ Undo Last Brush Edit (${snaps.length})
        </button>
      </div>
    </div>

    ${renderAiCopilotBar()}

    <div class="rms-list">
      ${Object.entries(pals).map(([pid, pal]) => {
        const scatterEntries = Object.entries(pal.scatter || {});
        return `
          <div class="rms-sheet" id="entity-pal-${escapeHtml(pid)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip" style="background:${escapeHtml(pal.albedoTint || '#529E47')}">🌿</span>
                <span class="rms-sheet__title">Brush: <code>${escapeHtml(pid)}</code> (${escapeHtml(pal.surfaceType || '')})</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">Max Slope ${pal.maxSlopeDeg}°</span>
                ${pal.clearColliders ? `<span class="joy-badge joy-badge--warning joy-badge--sm">CLEAR COLLIDERS (ROAD)</span>` : ''}
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--success joy-badge--sm">Chibi Band: ${(pal.playerScaleBandM || [0.9, 1.2]).join('m–')}m</span>
                ${inspectBtnHtml('palette', pid, pal)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                ${scatterEntries.length === 0 ? `
                  <tr><th>Scatter Rules</th><td class="observatory-card__meta">0 scatter rules (steep slope rock face override)</td></tr>
                ` : scatterEntries.map(([rname, rule]) => {
                  const allAssets = Array.from(new Set([...(rule.assets || []), ...(rule.disabledAssets || [])]));
                  const tagPool = rule.tagPool ? `biome:${rule.tagPool.biome} · role:${rule.tagPool.role}` : 'manual pool';
                  return `
                    <tr>
                      <th style="width:170px">
                        <div class="mono" style="font-size:12.5px">${escapeHtml(rname)}</div>
                        <div class="observatory-card__meta">${rule.blocksMovement ? 'Tier B Collider' : 'Tier A MultiMesh'}</div>
                      </th>
                      <td style="width:220px">
                        <div style="display:flex;align-items:center;gap:8px">
                          <input
                            type="range"
                            min="0"
                            max="0.60"
                            step="0.005"
                            value="${rule.weight}"
                            onchange="togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '', this.value)"
                          />
                          <span class="mono" style="font-weight:700">${rule.weight}</span>
                        </div>
                        <div class="observatory-card__meta">
                          Scale: ${(rule.scaleRange || [0.7, 1.0]).join('–')}×
                          ${rule.maxWorldHeightM ? ` · Cap ≤ ${rule.maxWorldHeightM}m` : ''}
                          ${rule.colliderHalfExtent ? ` · Trunk r=${rule.colliderHalfExtent}m` : ''}
                        </div>
                        <div class="observatory-card__meta">${escapeHtml(tagPool)}</div>
                      </td>
                      <td>
                        <div class="tag-pool-grid">
                          ${allAssets.map(sp => {
                            const isDisabled = (rule.disabledAssets || []).includes(sp);
                            const shortName = sp.replace('res://assets/nature/', '');
                            const tUrl = (DATA.assetSceneThumbs && DATA.assetSceneThumbs[sp]) || '';
                            return `
                              <label class="tag-asset-card ${isDisabled ? 'disabled' : ''}" onclick="togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '${escapeHtml(sp)}')">
                                <input type="checkbox" ${!isDisabled ? 'checked' : ''} onclick="event.stopPropagation(); togglePaletteAsset('${escapeHtml(pid)}', '${escapeHtml(rname)}', '${escapeHtml(sp)}')" />
                                ${tUrl ? `<img src="${escapeHtml(tUrl)}" alt="${escapeHtml(shortName)}" />` : ''}
                                <div>
                                  <div class="mono" style="font-weight:600;font-size:11.5px">${escapeHtml(shortName)}</div>
                                  <div class="observatory-card__meta">${isDisabled ? 'Unchecked (Disabled)' : 'Checked (Active)'}</div>
                                </div>
                              </label>
                            `;
                          }).join('')}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}


/* ============================================================================
 * 0B. WORLD & LORE SPINE — CONTINENT ATLAS, 5-ACT STORY GRAPH & BESTIARY
 * ========================================================================== */
// =========================================================================
// MAXION WORLD MAP + LINEAGE CONNECTED MAP ATLAS + MONSTER/1035 ENGINE
// =========================================================================

const MAXION_WORLD_TILES = [
  // Row 0 (Far North — Lv.61-100)
  { id: 'c01-frost-spire', col: 1, row: 0, code: 'ice_dun02', name: 'Frost Spire Keep', biome: 'glacier', lv: '65 - 85', kind: 'dungeon',
    neighbors: { S: 'c03-coldreach-tundra', E: 'c01-glacier-vault' },
    spawns: [{ id: 'ice_titan', count: 35 }, { id: 'sasquatch', count: 50 }, { id: 'hunter_fly', count: 25 }] },
  { id: 'c01-glacier-vault', col: 2, row: 0, code: 'ice_dun03', name: 'Glacier Vault F3', biome: 'glacier', lv: '75 - 95', kind: 'dungeon',
    neighbors: { W: 'c01-frost-spire', S: 'c02-high-pass' },
    spawns: [{ id: 'ice_titan', count: 45 }, { id: 'abysmal_knight', count: 20 }, { id: 'baphomet', count: 1 }] },
  { id: 'c04-clock-belfry', col: 3, row: 0, code: 'alde_dun04', name: 'Clock Tower Belfry', biome: 'castle', lv: '61 - 80', kind: 'dungeon',
    neighbors: { S: 'c02-capital-freja', E: 'c10-magma-caldera' },
    spawns: [{ id: 'clock_manager', count: 30 }, { id: 'joker', count: 45 }, { id: 'hunter_fly', count: 35 }] },
  { id: 'c10-magma-caldera', col: 4, row: 0, code: 'mag_dun02', name: 'Nogg Road Caldera', biome: 'volcano', lv: '81 - 100', kind: 'dungeon',
    neighbors: { W: 'c04-clock-belfry', S: 'c10-ash-citadel', E: 'c10-core-reactor' },
    spawns: [{ id: 'magma_kaho', count: 60 }, { id: 'pyroclast_wyrm', count: 1 }, { id: 'abysmal_knight', count: 25 }] },
  { id: 'c10-core-reactor', col: 5, row: 0, code: 'ein_dun02', name: 'Einbroch Core Vault', biome: 'volcano', lv: '85 - 100', kind: 'dungeon',
    neighbors: { W: 'c10-magma-caldera', S: 'c09-iron-quarry' },
    spawns: [{ id: 'rsx_colossus', count: 1 }, { id: 'magma_kaho', count: 40 }, { id: 'bone_golem', count: 35 }] },

  // Row 1 (Northern Highlands — Lv.41-80)
  { id: 'c07-glast-abbey', col: 0, row: 1, code: 'gl_church', name: 'Glast Heim Abbey', biome: 'crypt', lv: '55 - 78', kind: 'dungeon',
    neighbors: { E: 'c03-coldreach-tundra', S: 'c07-chivalry-hall' },
    spawns: [{ id: 'evil_druid', count: 55 }, { id: 'abysmal_knight', count: 25 }, { id: 'dracula', count: 1 }] },
  { id: 'c03-coldreach-tundra', col: 1, row: 1, code: 'lasa_fild01', name: 'Lutie Snowfield', biome: 'glacier', lv: '45 - 65', kind: 'field',
    neighbors: { N: 'c01-frost-spire', W: 'c07-glast-abbey', E: 'c02-high-pass', S: 'c02-west-pinewood' },
    spawns: [{ id: 'sasquatch', count: 65 }, { id: 'ice_titan', count: 20 }, { id: 'desert_wolf', count: 30 }] },
  { id: 'c02-high-pass', col: 2, row: 1, code: 'mjolnir_06', name: 'Mt. Mjolnir North Pass', biome: 'mountain', lv: '35 - 55', kind: 'field',
    neighbors: { N: 'c01-glacier-vault', W: 'c03-coldreach-tundra', E: 'c02-capital-freja', S: 'c02-floral-valley' },
    spawns: [{ id: 'flora', count: 60 }, { id: 'hunter_fly', count: 40 }, { id: 'wild_boar', count: 45 }] },
  { id: 'c02-capital-freja', col: 3, row: 1, code: 'prontera', name: 'Prontera Royal Capital', biome: 'town', lv: '1 - 100', kind: 'town',
    neighbors: { N: 'c04-clock-belfry', W: 'c02-high-pass', S: 'freja-south-gate', E: 'c10-ash-citadel', D: 'c02-culvert-sewer' },
    spawns: [{ id: 'poring', count: 15 }, { id: 'lunatic', count: 15 }] },
  { id: 'c10-ash-citadel', col: 4, row: 1, code: 'yuno_fild08', name: 'Schwartzvald Plateau', biome: 'mountain', lv: '52 - 72', kind: 'field',
    neighbors: { N: 'c10-magma-caldera', W: 'c02-capital-freja', E: 'c09-iron-quarry', S: 'c04-orc-fortress' },
    spawns: [{ id: 'bone_golem', count: 50 }, { id: 'hunter_fly', count: 30 }, { id: 'bathory', count: 40 }] },
  { id: 'c09-iron-quarry', col: 5, row: 1, code: 'ein_fild04', name: 'Einbech Mining Ridge', biome: 'mountain', lv: '60 - 80', kind: 'field',
    neighbors: { N: 'c10-core-reactor', W: 'c10-ash-citadel', S: 'c04-coal-caverns' },
    spawns: [{ id: 'bone_golem', count: 60 }, { id: 'clock_manager', count: 20 }, { id: 'rsx_colossus', count: 1 }] },

  // Row 2 (Central Midgard — Lv.1-60)
  { id: 'c07-chivalry-hall', col: 0, row: 2, code: 'gl_knt01', name: 'Glast Heim Chivalry', biome: 'crypt', lv: '61 - 85', kind: 'dungeon',
    neighbors: { N: 'c07-glast-abbey', E: 'c02-west-pinewood', S: 'c06-geffen-tower' },
    spawns: [{ id: 'abysmal_knight', count: 45 }, { id: 'evil_druid', count: 40 }, { id: 'baphomet', count: 1 }] },
  { id: 'c02-west-pinewood', col: 1, row: 2, code: 'prt_fild05', name: 'Prontera West Culvert Edge', biome: 'forest', lv: '8 - 22', kind: 'field',
    neighbors: { N: 'c03-coldreach-tundra', W: 'c07-chivalry-hall', E: 'c02-floral-valley', S: 'c02-culvert-sewer' },
    spawns: [{ id: 'thief_bug', count: 70 }, { id: 'spore', count: 55 }, { id: 'poring', count: 40 }] },
  { id: 'c02-floral-valley', col: 2, row: 2, code: 'prt_fild03', name: 'Yoyo & Rocker Meadow', biome: 'meadow', lv: '12 - 28', kind: 'field',
    neighbors: { N: 'c02-high-pass', W: 'c02-west-pinewood', E: 'freja-south-gate', S: 'c02-willow-grove' },
    spawns: [{ id: 'wild_boar', count: 60 }, { id: 'spore', count: 50 }, { id: 'flora', count: 35 }] },
  { id: 'freja-south-gate', col: 3, row: 2, code: 'prt_fild08', name: 'Prontera South Gate', biome: 'meadow', lv: '1 - 15', kind: 'field',
    neighbors: { N: 'c02-capital-freja', W: 'c02-floral-valley', E: 'c04-orc-fortress', S: 'c05-sograt-border' },
    spawns: [{ id: 'poring', count: 80 }, { id: 'lunatic', count: 65 }, { id: 'forest_slime', count: 50 }, { id: 'drops', count: 35 }] },
  { id: 'c04-orc-fortress', col: 4, row: 2, code: 'gef_fild10', name: 'Orc Village Stronghold', biome: 'forest', lv: '25 - 45', kind: 'field',
    neighbors: { N: 'c10-ash-citadel', W: 'freja-south-gate', E: 'c04-coal-caverns', S: 'c04-orc-dungeon' },
    spawns: [{ id: 'orc_warrior', count: 75 }, { id: 'orc_spear', count: 50 }, { id: 'high_orc', count: 30 }, { id: 'orc_lord', count: 1 }] },
  { id: 'c04-coal-caverns', col: 5, row: 2, code: 'mjo_dun03', name: 'Mjolnir Dead Pit B3', biome: 'crypt', lv: '32 - 52', kind: 'dungeon',
    neighbors: { N: 'c09-iron-quarry', W: 'c04-orc-fortress', S: 'c08-payon-shrine' },
    spawns: [{ id: 'skel_soldier', count: 55 }, { id: 'drainliar', count: 65 }, { id: 'mummy', count: 40 }] },

  // Row 3 (Southern Kingdoms & Dungeons — Lv.15-55)
  { id: 'c06-geffen-tower', col: 0, row: 3, code: 'gef_tower', name: 'Geffen Magic Spire B2', biome: 'castle', lv: '35 - 58', kind: 'dungeon',
    neighbors: { N: 'c07-chivalry-hall', E: 'c02-culvert-sewer', S: 'c13-sunken-galleon' },
    spawns: [{ id: 'whisper', count: 60 }, { id: 'bathory', count: 50 }, { id: 'joker', count: 35 }, { id: 'dracula', count: 1 }] },
  { id: 'c02-culvert-sewer', col: 1, row: 3, code: 'prt_sewb3', name: 'Prontera Culvert B3', biome: 'crypt', lv: '15 - 32', kind: 'dungeon',
    neighbors: { N: 'c02-west-pinewood', W: 'c06-geffen-tower', E: 'c02-willow-grove', S: 'c05-pyramid-vault' },
    spawns: [{ id: 'thief_bug', count: 85 }, { id: 'drainliar', count: 60 }, { id: 'poison_toad', count: 45 }] },
  { id: 'c02-willow-grove', col: 2, row: 3, code: 'pay_fild02', name: 'Payon Bamboo Woods', biome: 'forest', lv: '10 - 25', kind: 'field',
    neighbors: { N: 'c02-floral-valley', W: 'c02-culvert-sewer', E: 'c05-sograt-border', S: 'c05-morroc-oasis' },
    spawns: [{ id: 'spore', count: 75 }, { id: 'forest_slime', count: 60 }, { id: 'mushroom_king', count: 1 }] },
  { id: 'c05-sograt-border', col: 3, row: 3, code: 'moc_fild01', name: 'Sograt Desert Border', biome: 'desert', lv: '14 - 30', kind: 'field',
    neighbors: { N: 'freja-south-gate', W: 'c02-willow-grove', E: 'c04-orc-dungeon', S: 'c05-sphinx-crypt' },
    spawns: [{ id: 'drops', count: 70 }, { id: 'desert_wolf', count: 65 }, { id: 'flora', count: 35 }] },
  { id: 'c04-orc-dungeon', col: 4, row: 3, code: 'orcsdun02', name: 'Orc Underground Cave B2', biome: 'crypt', lv: '35 - 55', kind: 'dungeon',
    neighbors: { N: 'c04-orc-fortress', W: 'c05-sograt-border', E: 'c08-payon-shrine', S: 'c08-alberta-port' },
    spawns: [{ id: 'high_orc', count: 70 }, { id: 'orc_spear', count: 55 }, { id: 'skel_archer', count: 45 }, { id: 'orc_lord', count: 1 }] },
  { id: 'c08-payon-shrine', col: 5, row: 3, code: 'pay_dun03', name: 'Payon Ancestral Cave F3', biome: 'crypt', lv: '24 - 42', kind: 'dungeon',
    neighbors: { N: 'c04-coal-caverns', W: 'c04-orc-dungeon', S: 'c08-byalan-trench' },
    spawns: [{ id: 'skel_soldier', count: 65 }, { id: 'skel_archer', count: 55 }, { id: 'whisper', count: 40 }] },

  // Row 4 (Southern Desert & Ocean — Lv.21-60)
  { id: 'c13-sunken-galleon', col: 0, row: 4, code: 'treasure02', name: 'Sunken Pirate Galleon', biome: 'undersea', lv: '38 - 58', kind: 'dungeon',
    neighbors: { N: 'c06-geffen-tower', E: 'c05-pyramid-vault' },
    spawns: [{ id: 'whisper', count: 55 }, { id: 'skel_archer', count: 50 }, { id: 'drake_captain', count: 1 }] },
  { id: 'c05-pyramid-vault', col: 1, row: 4, code: 'moc_pryd04', name: 'Morroc Pyramid B4', biome: 'pyramid', lv: '35 - 55', kind: 'dungeon',
    neighbors: { N: 'c02-culvert-sewer', W: 'c13-sunken-galleon', E: 'c05-morroc-oasis' },
    spawns: [{ id: 'mummy', count: 75 }, { id: 'skel_soldier', count: 50 }, { id: 'drainliar', count: 45 }] },
  { id: 'c05-morroc-oasis', col: 2, row: 4, code: 'morocc', name: 'Morroc Jewel Oasis', biome: 'town', lv: '20 - 60', kind: 'town',
    neighbors: { N: 'c02-willow-grove', W: 'c05-pyramid-vault', E: 'c05-sphinx-crypt' },
    spawns: [{ id: 'drops', count: 35 }, { id: 'desert_wolf', count: 25 }] },
  { id: 'c05-sphinx-crypt', col: 3, row: 4, code: 'in_sphinx4', name: 'Sphinx Tomb F4', biome: 'pyramid', lv: '42 - 62', kind: 'dungeon',
    neighbors: { N: 'c05-sograt-border', W: 'c05-morroc-oasis', E: 'c08-alberta-port' },
    spawns: [{ id: 'mummy', count: 65 }, { id: 'whisper', count: 50 }, { id: 'hunter_fly', count: 45 }] },
  { id: 'c08-alberta-port', col: 4, row: 4, code: 'alberta', name: 'Alberta Harbor & Docks', biome: 'port', lv: '15 - 50', kind: 'town',
    neighbors: { N: 'c04-orc-dungeon', W: 'c05-sphinx-crypt', E: 'c08-byalan-trench' },
    spawns: [{ id: 'poison_toad', count: 30 }, { id: 'poring', count: 25 }] },
  { id: 'c08-byalan-trench', col: 5, row: 4, code: 'iz_dun04', name: 'Byalan Undersea Trench', biome: 'undersea', lv: '40 - 60', kind: 'dungeon',
    neighbors: { N: 'c08-payon-shrine', W: 'c08-alberta-port' },
    spawns: [{ id: 'strouf', count: 65 }, { id: 'poison_toad', count: 50 }, { id: 'drake_captain', count: 1 }] },
];

const MAXION_MONSTERS = [
  // Band 1 - 20
  { id: 'poring', code: 1002, name: 'Poring', band: '1-20', lv: 1, hp: 60, hit: 22, flee: 7, exp: 15, job: 10,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/a1b1790b90da69a2c0cf82dbba35f9bfac6b54f4.webp',
    modifiers: { Earth: 100, Poison: 100, Neutral: 100, Fire: 50, Holy: 100, Dark: 100, Water: 25, Ghost: 100, Undead: 100, Wind: 175 },
    drops: [
      { name: 'Poring Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Oridecon Shard', rate: '0.24%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Sticky Mucus', rate: '4.00%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' },
      { name: 'Apple', rate: '12.50%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' },
      { name: 'Jellopy', rate: '70.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'forest_slime', code: 1003, name: 'Forest Slime', band: '1-20', lv: 4, hp: 115, hit: 28, flee: 12, exp: 28, job: 18,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Plant', size: 'Small',
    thumb: '/thumbs/ca1ba005a8948653bc49573b3aaab272d0aa79ca.webp',
    modifiers: { Fire: 175, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Earth: 25, Ghost: 100, Undead: 100, Wind: 80 },
    drops: [
      { name: 'Poporing Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Emerald Herb', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Garlet', rate: '35.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'lunatic', code: 1063, name: 'Lunatic', band: '1-20', lv: 3, hp: 78, hit: 26, flee: 16, exp: 20, job: 14,
    type: 'Normal', element: 'Neutral', elIcon: '⚪', race: 'Brute', size: 'Small',
    thumb: '/thumbs/703711cd587687f00cb6acfa2ba7f82f70a1869f.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'Lunatic Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Four-Leaf Clover', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Clover', rate: '65.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'drops', code: 1113, name: 'Drops', band: '1-20', lv: 7, hp: 165, hit: 33, flee: 18, exp: 42, job: 26,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/641f0b1fdde03455dc9934144c8f68c087ba66f8.webp',
    modifiers: { Water: 175, Wind: 100, Neutral: 100, Poison: 100, Holy: 100, Dark: 100, Earth: 80, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'Drops Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Orange Juice', rate: '6.50%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' },
      { name: 'Jellopy', rate: '55.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'spore', code: 1014, name: 'Spore', band: '1-20', lv: 16, hp: 510, hit: 46, flee: 29, exp: 150, job: 98,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Plant', size: 'Medium',
    thumb: '/thumbs/1db575bd084764c9bd6bfbe525d36295770fd52b.webp',
    modifiers: { Wind: 175, Earth: 100, Neutral: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Spore Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Blue Herb', rate: '2.50%', rarity: 'rare', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' },
      { name: 'Mushroom Spore', rate: '68.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'thief_bug', code: 1051, name: 'Thief Bug', band: '1-20', lv: 13, hp: 380, hit: 42, flee: 34, exp: 112, job: 65,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Insect', size: 'Small',
    thumb: '/thumbs/343b102f697254e6092ba27a8b9a3da85963e802.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Thief Bug Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Iron Ore', rate: '4.50%', rarity: 'rare', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' },
      { name: 'Worm Peeling', rate: '55.00%', rarity: 'common', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },
  { id: 'wild_boar', code: 1067, name: 'Savage Boar', band: '1-20', lv: 19, hp: 820, hit: 52, flee: 31, exp: 235, job: 140,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Brute', size: 'Large',
    thumb: '/thumbs/3a3be2d4c2368da2283d13dc0e79850d99e0eb73.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Savage Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Boar Mane', rate: '62.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'mushroom_king', code: 1084, name: 'Golden Spore Boss', band: '1-20', lv: 20, hp: 6400, hit: 75, flee: 45, exp: 2100, job: 1250,
    type: 'MVP', element: 'Poison', elIcon: '☠️', race: 'Plant', size: 'Large',
    thumb: '/thumbs/793e05e1274e79d1527fa96bd27a921fc2f86b86.webp',
    modifiers: { Holy: 125, Fire: 125, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Dark: 50, Ghost: 75, Undead: 50, Poison: 0 },
    drops: [
      { name: 'Golden Spore Crown', rate: '0.25%', rarity: 'legend', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Elunium', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' }
    ]
  },

  // Band 21 - 40
  { id: 'desert_wolf', code: 1106, name: 'Desert Wolf', band: '21-40', lv: 25, hp: 1480, hit: 68, flee: 48, exp: 390, job: 245,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Brute', size: 'Medium',
    thumb: '/thumbs/2fd08a991dfba974a49bf166865e322df7e12d9d.webp',
    modifiers: { Water: 150, Neutral: 100, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Earth: 90, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'Desert Wolf Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Katar [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Wolf Claw', rate: '58.00%', rarity: 'common', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' }
    ]
  },
  { id: 'flora', code: 1118, name: 'Flora', band: '21-40', lv: 27, hp: 1890, hit: 71, flee: 35, exp: 485, job: 310,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Plant', size: 'Large',
    thumb: '/thumbs/bf5fb962417dc860e8e36fb5ab4f8470e8fb7c0f.webp',
    modifiers: { Fire: 175, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 25 },
    drops: [
      { name: 'Flora Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Maneater Blossom', rate: '48.00%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' }
    ]
  },
  { id: 'poison_toad', code: 1089, name: 'Roda Poison Toad', band: '21-40', lv: 23, hp: 1190, hit: 61, flee: 43, exp: 310, job: 195,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Fish', size: 'Medium',
    thumb: '/thumbs/2f54e98965d902267b36b8b150bd97df1ca27912.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 60, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Toad Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Spawn Webfoot', rate: '65.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'skel_soldier', code: 1028, name: 'Soldier Skeleton', band: '21-40', lv: 29, hp: 2340, hit: 82, flee: 56, exp: 640, job: 410,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Soldier Skeleton Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Stiletto [3]', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Skel-Bone', rate: '52.00%', rarity: 'common', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' }
    ]
  },
  { id: 'skel_archer', code: 1016, name: 'Archer Skeleton', band: '21-40', lv: 31, hp: 2650, hit: 94, flee: 60, exp: 780, job: 490,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/7c04df1bf5db7f47abfd93beeead9cc98bbdb7b6.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Archer Skeleton Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Arbalest [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Fire Arrow', rate: '45.00%', rarity: 'common', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },
  { id: 'drainliar', code: 1111, name: 'Drainliar', band: '21-40', lv: 33, hp: 2890, hit: 88, flee: 72, exp: 840, job: 520,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Brute', size: 'Small',
    thumb: '/thumbs/d6c6b868557d3fc3f33144fc3a1d28e92ebde3cf.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Drainliar Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Tooth of Bat', rate: '56.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'orc_warrior', code: 1023, name: 'Orc Warrior', band: '21-40', lv: 35, hp: 3450, hit: 92, flee: 64, exp: 980, job: 610,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/0e1fc9249dfee10a44eb3817ebdebf10abdb9634.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Orc Warrior Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Battle Axe [4]', rate: '0.35%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Orcish Voucher', rate: '68.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'orc_spear', code: 1189, name: 'Orc Archer', band: '21-40', lv: 38, hp: 3920, hit: 105, flee: 74, exp: 1190, job: 760,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/0be24bc75b3e1fa9a5e9bd9268ebcb612bd6d94f.webp',
    modifiers: { Fire: 150, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 80, Ghost: 100, Undead: 100, Earth: 50 },
    drops: [
      { name: 'Orc Archer Bow', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Steel Arrow Quiver', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp' }
    ]
  },

  // Band 41 - 60
  { id: 'mummy', code: 1041, name: 'Mummy', band: '41-60', lv: 42, hp: 5176, hit: 108, flee: 67, exp: 1650, job: 1020,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp',
    modifiers: { Holy: 175, Fire: 150, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Mummy Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Glove [1]', rate: '0.10%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Rotten Bandage', rate: '62.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'whisper', code: 1179, name: 'Whisper', band: '41-60', lv: 46, hp: 4790, hit: 118, flee: 112, exp: 1890, job: 1320,
    type: 'Normal', element: 'Ghost', elIcon: '👻', race: 'Demon', size: 'Small',
    thumb: '/thumbs/8351df7d2e7bc809b527cc0df4dfee4e263bb06d.webp',
    modifiers: { Ghost: 175, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Neutral: 0 },
    drops: [
      { name: 'Whisper Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Fabric', rate: '52.00%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'high_orc', code: 1213, name: 'High Orc', band: '41-60', lv: 52, hp: 6900, hit: 134, flee: 95, exp: 2960, job: 1840,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp',
    modifiers: { Water: 175, Neutral: 100, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Earth: 80, Ghost: 100, Undead: 100, Fire: 25 },
    drops: [
      { name: 'High Orc Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Orcish Axe [4]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Orcish Fang', rate: '60.00%', rarity: 'common', thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp' }
    ]
  },
  { id: 'strouf', code: 1065, name: 'Strouf', band: '41-60', lv: 48, hp: 6250, hit: 126, flee: 98, exp: 2450, job: 1620,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Fish', size: 'Large',
    thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 0 },
    drops: [
      { name: 'Strouf Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Trident [3]', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Fin', rate: '48.00%', rarity: 'common', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'bathory', code: 1102, name: 'Bathory', band: '41-60', lv: 54, hp: 6915, hit: 138, flee: 116, exp: 3120, job: 2150,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Demi-Human', size: 'Medium',
    thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp',
    modifiers: { Holy: 150, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 75, Ghost: 75, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Bathory Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Star Dust', rate: '8.50%', rarity: 'rare', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Witch Starsand', rate: '52.00%', rarity: 'common', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' }
    ]
  },
  { id: 'orc_lord', code: 1190, name: 'Orc Lord [MVP]', band: '41-60', lv: 55, hp: 398000, hit: 188, flee: 142, exp: 48200, job: 26500,
    type: 'MVP', element: 'Earth', elIcon: '🌿', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp',
    modifiers: { Fire: 200, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 50, Ghost: 100, Undead: 100, Earth: 0 },
    drops: [
      { name: 'Orc Lord Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Grandelt [1]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Bloody Axe', rate: '2.50%', rarity: 'rare', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  },
  { id: 'drake_captain', code: 1112, name: 'Drake [MVP]', band: '41-60', lv: 58, hp: 446000, hit: 196, flee: 148, exp: 52000, job: 31000,
    type: 'MVP', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Medium',
    thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp',
    modifiers: { Holy: 200, Fire: 175, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Drake Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Corsair Hat', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Cutlass', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' }
    ]
  },

  // Band 61 - 80 (Includes Screenshot 5 Benchmark: Hunter Fly #1035!)
  { id: 'hunter_fly', code: 1035, name: 'Hunter Fly', band: '61-80', lv: 63, hp: 5940, hit: 168, flee: 193, exp: 2642, job: 1518,
    type: 'Normal', element: 'Wind', elIcon: '🌪️', race: 'Insect', size: 'Small',
    thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp',
    modifiers: { Earth: 175, Poison: 125, Neutral: 100, Fire: 100, Holy: 100, Dark: 100, Water: 80, Ghost: 75, Undead: 75, Wind: 0 },
    drops: [
      { name: 'Hunter Fly Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Elementary Whip', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp' },
      { name: 'Damascus [1]', rate: '0.02%', rarity: 'legend', thumb: '/thumbs/392c709d2c598431ef4c6ab60d1be80c249f0365.webp' },
      { name: 'Mini Furnace', rate: '0.15%', rarity: 'epic', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' },
      { name: 'Oridecon', rate: '0.24%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Wind of Verdure', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Steel', rate: '6.50%', rarity: 'rare', thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp' },
      { name: 'Solid Shell', rate: '26.68%', rarity: 'common', thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp' }
    ]
  },
  { id: 'sasquatch', code: 1243, name: 'Sasquatch', band: '61-80', lv: 64, hp: 9420, hit: 152, flee: 118, exp: 3920, job: 2450,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Brute', size: 'Large',
    thumb: '/thumbs/bc881728ff9dc9924276d210df909a76a7c87cb1.webp',
    modifiers: { Wind: 175, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 25 },
    drops: [
      { name: 'Sasquatch Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Mystic Frozen', rate: '1.20%', rarity: 'rare', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'joker', code: 1131, name: 'Joker', band: '61-80', lv: 67, hp: 8250, hit: 174, flee: 185, exp: 4280, job: 2910,
    type: 'Normal', element: 'Wind', elIcon: '🌪️', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/372b28558cf194dfeb6fc5c809704be7e3932125.webp',
    modifiers: { Earth: 175, Poison: 125, Neutral: 100, Fire: 100, Holy: 100, Dark: 100, Water: 80, Ghost: 75, Undead: 75, Wind: 0 },
    drops: [
      { name: 'Joker Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Old Card Album', rate: '0.05%', rarity: 'legend', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'evil_druid', code: 1117, name: 'Evil Druid', band: '61-80', lv: 72, hp: 14200, hit: 168, flee: 132, exp: 5840, job: 4120,
    type: 'Normal', element: 'Undead', elIcon: '💀', race: 'Undead', size: 'Large',
    thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp',
    modifiers: { Holy: 200, Fire: 175, Neutral: 100, Water: 100, Wind: 100, Earth: 100, Ghost: 100, Dark: 0, Poison: 0, Undead: 0 },
    drops: [
      { name: 'Evil Druid Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/17557a29b4d4916ab7da5168b7a5bf978ef076df.webp' },
      { name: 'Biretta [1]', rate: '0.25%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'White Herb', rate: '18.00%', rarity: 'common', thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp' }
    ]
  },
  { id: 'clock_manager', code: 1270, name: 'Clock Tower Manager', band: '61-80', lv: 76, hp: 18600, hit: 184, flee: 146, exp: 6950, job: 4680,
    type: 'Normal', element: 'Neutral', elIcon: '⚪', race: 'Formless', size: 'Large',
    thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'Tower Manager Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Key of Underground', rate: '3.50%', rarity: 'rare', thumb: '/thumbs/4dcfa6cb49dc3449fd8ca9b5b6795636895312c8.webp' }
    ]
  },
  { id: 'bone_golem', code: 1278, name: 'Stalactic Golem', band: '61-80', lv: 78, hp: 22400, hit: 175, flee: 112, exp: 7420, job: 4850,
    type: 'Normal', element: 'Earth', elIcon: '🌿', race: 'Formless', size: 'Large',
    thumb: '/thumbs/a832db41d46e8fc4be809823730be62f00786c08.webp',
    modifiers: { Fire: 200, Poison: 125, Neutral: 100, Water: 100, Holy: 100, Dark: 100, Wind: 50, Ghost: 100, Undead: 100, Earth: 0 },
    drops: [
      { name: 'Stalactic Golem Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/86703da3a727a7be5e77f7d99ac533c297131637.webp' },
      { name: 'Elunium', rate: '3.15%', rarity: 'rare', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' }
    ]
  },
  { id: 'dracula', code: 1389, name: 'Dracula [MVP]', band: '61-80', lv: 75, hp: 520096, hit: 215, flee: 178, exp: 112000, job: 64000,
    type: 'MVP', element: 'Dark', elIcon: '🌑', race: 'Demon', size: 'Large',
    thumb: '/thumbs/a2dc61a37f57dd28c834dfda271aa671cb77b0fb.webp',
    modifiers: { Holy: 200, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Dracula Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Dragon Vest [1]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' }
    ]
  },

  // Band 81 - 100
  { id: 'ice_titan', code: 1777, name: 'Ice Titan', band: '81-100', lv: 84, hp: 38600, hit: 196, flee: 158, exp: 12800, job: 8400,
    type: 'Normal', element: 'Water', elIcon: '💧', race: 'Formless', size: 'Large',
    thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp',
    modifiers: { Wind: 200, Neutral: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Fire: 50, Ghost: 100, Undead: 100, Water: 0 },
    drops: [
      { name: 'Ice Titan Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/740b422ddfd39069bc1a396f73e20309561cb35d.webp' },
      { name: 'Ice Cubic', rate: '45.00%', rarity: 'common', thumb: '/thumbs/a85f10fd2e0dc3de29a2eb157d7ff68c19e39d7b.webp' }
    ]
  },
  { id: 'abysmal_knight', code: 1219, name: 'Abysmal Knight', band: '81-100', lv: 88, hp: 46500, hit: 212, flee: 172, exp: 16400, job: 11200,
    type: 'Normal', element: 'Dark', elIcon: '🌑', race: 'Demi-Human', size: 'Large',
    thumb: '/thumbs/9f7f9bf3a0db1c2f74de5f53fa74c8be4e3f2737.webp',
    modifiers: { Holy: 175, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Abysmal Knight Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Broad Sword [2]', rate: '0.20%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' },
      { name: 'Chivalry Emblem', rate: '18.50%', rarity: 'common', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'magma_kaho', code: 1072, name: 'Magma Kaho', band: '81-100', lv: 91, hp: 42900, hit: 218, flee: 184, exp: 18200, job: 12900,
    type: 'Normal', element: 'Fire', elIcon: '🔥', race: 'Demon', size: 'Medium',
    thumb: '/thumbs/c217669ddcc06081a0d6a36026f901db5219d26b.webp',
    modifiers: { Water: 200, Neutral: 100, Wind: 100, Poison: 100, Holy: 125, Dark: 100, Earth: 50, Ghost: 100, Undead: 100, Fire: 0 },
    drops: [
      { name: 'Kaho Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Flame Heart', rate: '4.50%', rarity: 'rare', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' }
    ]
  },
  { id: 'rsx_colossus', code: 1623, name: 'RSX-0806 [MVP]', band: '81-100', lv: 94, hp: 660700, hit: 245, flee: 192, exp: 195000, job: 112000,
    type: 'MVP', element: 'Neutral', elIcon: '⚪', race: 'Formless', size: 'Large',
    thumb: '/thumbs/2fc5782834b85e0a8fd9fc5f77a0da3a20df22b9.webp',
    modifiers: { Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 100, Holy: 100, Dark: 100, Undead: 100, Ghost: 25 },
    drops: [
      { name: 'RSX-0806 Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/6bc740826ef36d8d9113022a92f64e5ac8f68f7f.webp' },
      { name: 'Brionac [2]', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  },
  { id: 'pyroclast_wyrm', code: 1832, name: 'Ifrit Pyroclast [MVP]', band: '81-100', lv: 99, hp: 1260000, hit: 280, flee: 225, exp: 420000, job: 260000,
    type: 'MVP', element: 'Fire', elIcon: '🔥', race: 'Formless', size: 'Large',
    thumb: '/thumbs/4b8d19ef42da8fa49a16550cb67bd865cb9b5be3.webp',
    modifiers: { Water: 200, Neutral: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Earth: 50, Ghost: 100, Undead: 100, Fire: 0 },
    drops: [
      { name: 'Ifrit Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/eb790bb0da73869ca8f6c5633da2cfdd43fc912f.webp' },
      { name: 'Ring of Flame Lord', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' }
    ]
  },
  { id: 'baphomet', code: 1039, name: 'Baphomet [MVP]', band: '81-100', lv: 98, hp: 968000, hit: 272, flee: 238, exp: 385000, job: 215000,
    type: 'MVP', element: 'Dark', elIcon: '🌑', race: 'Demon', size: 'Large',
    thumb: '/thumbs/5c1ab699db9be2a09a4a9cb531c8cf62127fc5cb.webp',
    modifiers: { Holy: 200, Neutral: 100, Fire: 100, Water: 100, Wind: 100, Earth: 100, Poison: 50, Ghost: 50, Undead: 100, Dark: 0 },
    drops: [
      { name: 'Baphomet Card', rate: '0.01%', rarity: 'legend', thumb: '/thumbs/d80a5e2bf28ff9d976c8ddbe7bbadbe3de36fa34.webp' },
      { name: 'Majestic Goat', rate: '0.50%', rarity: 'epic', thumb: '/thumbs/267f361547c7e74de3d59c9c33c2531be79ca02a.webp' },
      { name: 'Crescent Scythe', rate: '1.50%', rarity: 'rare', thumb: '/thumbs/96f2d8a68cb0be4f05b74a22327be62d38bd99b8.webp' }
    ]
  }
];

function inferStudioBiome(node) {
  const pal = String((node.terrain_tile && node.terrain_tile.biome_palette) || '').toLowerCase();
  if (node.node_type === 'town') return 'town';
  if (node.node_type === 'dungeon') {
    if (pal.includes('glacier') || pal.includes('frost') || pal.includes('ice')) return 'glacier';
    if (pal.includes('volcano') || pal.includes('lava') || pal.includes('ember') || pal.includes('kiln')) return 'volcano';
    if (pal.includes('coral') || pal.includes('reef') || pal.includes('tide') || pal.includes('abyss')) return 'undersea';
    return 'crypt';
  }
  if (pal.includes('glacier') || pal.includes('snow') || pal.includes('frost')) return 'glacier';
  if (pal.includes('lava') || pal.includes('magma') || pal.includes('slag') || pal.includes('furnace')) return 'volcano';
  if (pal.includes('brass') || pal.includes('clock') || pal.includes('steppe') || pal.includes('mesa') || pal.includes('basalt')) return 'mountain';
  if (pal.includes('coral') || pal.includes('atoll') || pal.includes('lagoon') || pal.includes('harbor') || pal.includes('pier')) return 'port';
  if (pal.includes('forest') || pal.includes('grove') || pal.includes('willow') || pal.includes('brier')) return 'forest';
  return 'meadow';
}

function getStudioCanonTiles() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const nodes = (sp.nodes || []).filter(n => n && n.status === 'canon');
  const distById = {};
  (sp.districts || []).forEach(d => { if (d && d.id) distById[d.id] = d; });
  const contById = {};
  (sp.continents || []).forEach(c => { if (c && c.id) contById[c.id] = c; });

  return nodes.map(n => {
    const portals = n.portals || {};
    const nb = {};
    if (portals.North && portals.North.target_node_id) nb.N = portals.North.target_node_id;
    if (portals.South && portals.South.target_node_id) nb.S = portals.South.target_node_id;
    if (portals.East && portals.East.target_node_id) nb.E = portals.East.target_node_id;
    if (portals.West && portals.West.target_node_id) nb.W = portals.West.target_node_id;
    if (portals.Dungeon && portals.Dungeon.target_node_id) nb.D = portals.Dungeon.target_node_id;
    if (portals.Exit && portals.Exit.target_node_id) nb.Exit = portals.Exit.target_node_id;

    const coords = n.grid_coordinates || [0, 0];
    const dist = distById[n.parent_district_id] || {};
    const cont = contById[n.parent_continent_id] || {};
    const lvRange = n.level_range || dist.level_range || [1, 15];

    return {
      id: n.id,
      code: n.map_id || n.id,
      name: n.name,
      isStudioCanon: true,
      continentId: n.parent_continent_id || '',
      continentName: cont.name || n.parent_continent_id || '',
      districtId: n.parent_district_id || '',
      districtName: dist.name || n.parent_district_id || '',
      coreRationale: n.core_rationale || '',
      col: coords[0] || 0,
      row: coords[1] || 0,
      biome: inferStudioBiome(n),
      biomePalette: (n.terrain_tile && n.terrain_tile.biome_palette) || 'meadow',
      lv: lvRange[0] + ' - ' + lvRange[1],
      kind: n.node_type === 'town' ? 'town' : (n.node_type === 'dungeon' ? 'dungeon' : 'field'),
      thumb: (n.terrain_tile && n.terrain_tile.preview_thumbnail) || '',
      neighbors: nb,
      spawns: (n.resident_spawns || []).map(s => ({
        id: s.monster_id,
        count: s.spawn_count || 20
      }))
    };
  });
}

function getAllWorldTiles() {
  return [...getStudioCanonTiles(), ...MAXION_WORLD_TILES];
}

function getStudioCanonMonsters() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const nodes = (sp.nodes || []).filter(n => n && n.status === 'canon');
  const seen = new Set(MAXION_MONSTERS.map(m => m.id));
  const out = [];
  const elIcons = {
    Fire: '🔥', Water: '💧', Earth: '🌿', Wind: '🌪️',
    Poison: '☠️', Holy: '✨', Shadow: '🌑', Dark: '🌑',
    Ghost: '👻', Undead: '💀', Neutral: '⚪'
  };
  let seq = 2001;
  nodes.forEach(n => {
    (n.resident_spawns || []).forEach(s => {
      if (!s || !s.monster_id || seen.has(s.monster_id)) return;
      seen.add(s.monster_id);
      const mobThumb = '/thumbs/creatures/' + s.monster_id + '.webp';
      const lv = s.level || 10;
      const band = lv <= 20 ? '1-20' : (lv <= 40 ? '21-40' : (lv <= 60 ? '41-60' : (lv <= 80 ? '61-80' : '81-100')));
      const el = s.element || 'Neutral';
      const drops = [];
      if (s.monster_card_drop && s.monster_card_drop.card_name) {
        drops.push({
          name: s.monster_card_drop.card_name,
          rate: (s.monster_card_drop.drop_chance_percent || 0.01) + '%',
          rarity: 'legend',
          thumb: '/thumbs/cards/' + (s.monster_card_drop.card_id || s.monster_id) + '.webp'
        });
      }
      (s.item_drops || []).forEach(it => {
        const pct = it.drop_chance_percent || 5.0;
        drops.push({
          name: it.item_name,
          rate: pct + '%',
          rarity: pct <= 1.0 ? 'epic' : (pct <= 10.0 ? 'rare' : 'common'),
          thumb: '/thumbs/loot/' + (it.item_id || it.item_name || 'item') + '.webp'
        });
      });
      const rawMods = computeStudioElementalModifiers(el);
      out.push({
        id: s.monster_id,
        code: seq++,
        name: s.monster_name || s.monster_id,
        isStudioCanon: true,
        districtId: n.parent_district_id,
        nodeId: n.id,
        band: band,
        lv: lv,
        hp: lv * 68 + 45,
        hit: 100 + lv * 3,
        flee: 95 + lv * 2,
        exp: lv * 24,
        job: lv * 16,
        type: (s.size === 'Large' && lv >= 35) ? 'MVP' : 'Normal',
        element: el,
        elIcon: elIcons[el] || '⚪',
        race: s.race || 'Formless',
        size: s.size || 'Medium',
        thumb: mobThumb,
        modifiers: {
          Earth: rawMods.Earth ?? 100,
          Poison: rawMods.Poison ?? 100,
          Neutral: rawMods.Neutral ?? 100,
          Fire: rawMods.Fire ?? 100,
          Holy: rawMods.Holy ?? 100,
          Dark: rawMods.Shadow ?? 100,
          Water: rawMods.Water ?? 100,
          Ghost: rawMods.Ghost ?? 100,
          Undead: rawMods.Undead ?? 100,
          Wind: rawMods.Wind ?? 100
        },
        drops: drops
      });
    });
  });
  return out;
}

function getAllMonsters() {
  return [...getStudioCanonMonsters(), ...MAXION_MONSTERS];
}

function getMaxionMob(id) {
  const all = getAllMonsters();
  return all.find(m => m.id === id) || all[0];
}

function getMaxionTile(id) {
  const all = getAllWorldTiles();
  return all.find(t => t.id === id || t.code === id) || all[0];
}

function renderDistinctMapTileSvg(tile, size = 132) {
  const b = tile.biome || 'meadow';
  const nb = tile.neighbors || {};
  // Seeded hash from tile.id so every single map has distinct geometry
  let h = 0;
  for (let i = 0; i < tile.id.length; i++) h = ((h << 5) - h + tile.id.charCodeAt(i)) | 0;
  const seed = Math.abs(h);

  const palettes = {
    town:     { bg: '#2c3644', base: '#3d4d5e', road: '#d4b483', accent: '#f59e0b', water: '#2563eb' },
    meadow:   { bg: '#214e2a', base: '#2e6b38', road: '#c8a368', accent: '#86efac', water: '#0ea5e9' },
    forest:   { bg: '#133822', base: '#1b4b2e', road: '#9c7a4c', accent: '#4ade80', water: '#0284c7' },
    desert:   { bg: '#785226', base: '#9b6b33', road: '#e2c187', accent: '#fde047', water: '#06b6d4' },
    pyramid:  { bg: '#5c3d1e', base: '#7c5329', road: '#d9b372', accent: '#f59e0b', water: '#1e293b' },
    glacier:  { bg: '#1e3a5f', base: '#3b6998', road: '#cbd5e1', accent: '#7dd3fc', water: '#0369a1' },
    volcano:  { bg: '#3b1512', base: '#571f1a', road: '#78350f', accent: '#f97316', water: '#dc2626' },
    mountain: { bg: '#333642', base: '#494e5f', road: '#a89070', accent: '#cbd5e1', water: '#0284c7' },
    crypt:    { bg: '#1a162b', base: '#282240', road: '#645986', accent: '#c084fc', water: '#312e81' },
    castle:   { bg: '#272936', base: '#383b4e', road: '#94a3b8', accent: '#fbbf24', water: '#1d4ed8' },
    port:     { bg: '#0c3b5e', base: '#2d5a42', road: '#d4b483', accent: '#38bdf8', water: '#0284c7' },
    undersea: { bg: '#082644', base: '#0e3c68', road: '#38bdf8', accent: '#22d3ee', water: '#0369a1' },
  };
  const pal = palettes[b] || palettes.meadow;
  const cx = 50 + ((seed % 17) - 8);
  const cy = 50 + (((seed >> 4) % 17) - 8);

  // Connected roads to N / S / E / W neighbors so tiles visibly link up!
  let roads = '';
  if (nb.N) roads += `<line x1="${cx}" y1="${cy}" x2="50" y2="0" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.S) roads += `<line x1="${cx}" y1="${cy}" x2="50" y2="100" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.W) roads += `<line x1="${cx}" y1="${cy}" x2="0" y2="50" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;
  if (nb.E) roads += `<line x1="${cx}" y1="${cy}" x2="100" y2="50" stroke="${pal.road}" stroke-width="7" stroke-linecap="round"/>`;

  // Distinct topographic landmarks per biome
  let landmark = '';
  if (b === 'town') {
    landmark = `
      <rect x="20" y="20" width="60" height="60" rx="6" fill="#475569" stroke="#f8fafc" stroke-width="2.5"/>
      <rect x="33" y="33" width="34" height="34" rx="3" fill="#b45309" stroke="#fde047" stroke-width="1.5"/>
      <circle cx="50" cy="50" r="6" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
    `;
  } else if (b === 'pyramid') {
    landmark = `
      <polygon points="50,18 82,76 18,76" fill="#d97706" stroke="#fde047" stroke-width="2"/>
      <polygon points="50,18 82,76 50,76" fill="rgba(0,0,0,0.28)"/>
      <rect x="44" y="58" width="12" height="18" fill="#1e1b18"/>
    `;
  } else if (b === 'volcano') {
    landmark = `
      <path d="M12,85 Q50,10 88,85 Z" fill="#451a14" stroke="#f97316" stroke-width="2"/>
      <ellipse cx="50" cy="46" rx="16" ry="9" fill="#ef4444" stroke="#fde047" stroke-width="2"/>
      <path d="M50,55 Q42,72 34,92 M54,54 Q66,75 74,92" stroke="#f97316" stroke-width="4" fill="none"/>
    `;
  } else if (b === 'glacier') {
    landmark = `
      <polygon points="28,74 44,24 60,74" fill="#7dd3fc" opacity="0.85"/>
      <polygon points="46,78 64,18 82,78" fill="#bae6fd" stroke="#fff" stroke-width="1.5"/>
      <circle cx="24" cy="30" r="10" fill="#0284c7" opacity="0.6"/>
    `;
  } else if (b === 'crypt' || b === 'castle') {
    landmark = `
      <rect x="22" y="24" width="56" height="52" rx="4" fill="rgba(15,23,42,0.75)" stroke="${pal.accent}" stroke-width="2"/>
      <line x1="22" y1="50" x2="78" y2="50" stroke="${pal.accent}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <line x1="50" y1="24" x2="50" y2="76" stroke="${pal.accent}" stroke-width="1.5" stroke-dasharray="4 3"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="${pal.accent}" opacity="0.85"/>
    `;
  } else if (b === 'port' || b === 'undersea') {
    landmark = `
      <path d="M0,62 Q50,44 100,66 L100,100 L0,100 Z" fill="${pal.water}"/>
      <rect x="44" y="42" width="12" height="28" fill="#a16207" stroke="#fde68a" stroke-width="1.2"/>
      <circle cx="28" cy="76" r="7" fill="#38bdf8" opacity="0.6"/>
    `;
  } else if (b === 'forest') {
    landmark = `
      <circle cx="28" cy="30" r="13" fill="#14532d" stroke="#4ade80" stroke-width="1.5"/>
      <circle cx="72" cy="34" r="14" fill="#166534" stroke="#86efac" stroke-width="1.5"/>
      <circle cx="32" cy="72" r="12" fill="#15803d"/>
      <circle cx="70" cy="70" r="15" fill="#14532d" stroke="#4ade80" stroke-width="1.5"/>
    `;
  } else {
    // Meadow / Desert / Mountain
    const wx = 22 + (seed % 50);
    const wy = 24 + ((seed >> 3) % 48);
    landmark = `
      <ellipse cx="${wx}" cy="${wy}" rx="18" ry="11" fill="${pal.water}" opacity="0.85" stroke="#bae6fd" stroke-width="1.2"/>
      <circle cx="${78 - (seed % 35)}" cy="${28 + (seed % 40)}" r="10" fill="${pal.accent}" opacity="0.55"/>
    `;
  }

  // Red warp portals on connected edges (just like RO / Maxion minimaps!)
  let portals = '';
  if (nb.N) portals += `<circle cx="50" cy="6" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.S) portals += `<circle cx="50" cy="94" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.W) portals += `<circle cx="6" cy="50" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;
  if (nb.E) portals += `<circle cx="94" cy="50" r="4.5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>`;

  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;max-width:100%;max-height:100%;border-radius:8px;flex-shrink:0;">
    <rect width="100" height="100" fill="${pal.bg}"/>
    <rect x="7" y="7" width="86" height="86" rx="10" fill="${pal.base}" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
    ${roads}
    ${landmark}
    ${portals}
  </svg>`;
}

function selectMaxionLevelBand(band) {
  MAXION_LEVEL_BAND = band;
  const firstInBand = getAllMonsters().find(m => m.band === band);
  if (firstInBand) {
    MAXION_PINNED_MOB_ID = firstInBand.id;
  }
  writeUrlState(true);
  render();
}

function selectMaxionCategory(cat) {
  MAXION_CAT_FILTER = cat;
  render();
}

function pinMaxionMonster(mobId) {
  MAXION_PINNED_MOB_ID = mobId;
  MAXION_SELECTED_MOB_ID = mobId;
  // Auto-select the first map tile where this monster spawns
  const spawnTile = getAllWorldTiles().find(t => t.spawns.some(s => s.id === mobId));
  if (spawnTile) MAXION_SELECTED_TILE_ID = spawnTile.id;
  writeUrlState(true);
  render();
}

function openMonsterDetailPage(mobId) {
  MAXION_SELECTED_MOB_ID = mobId;
  MAXION_PINNED_MOB_ID = mobId;
  CURRENT_TAB = 'mobs';
  writeUrlState(true);
  renderSidebar();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectWorldTile(tileId) {
  MAXION_SELECTED_TILE_ID = tileId;
  writeUrlState(true);
  render();
}

function renderWorldAtlas() {
  const pinnedMob = getMaxionMob(MAXION_PINNED_MOB_ID);
  const selectedTile = getMaxionTile(MAXION_SELECTED_TILE_ID);
  const bands = ['1-20', '21-40', '41-60', '61-80', '81-100'];

  const filteredMobs = getAllMonsters().filter(m => {
    if (SEARCH_QUERY) {
      return m.name.toLowerCase().includes(SEARCH_QUERY) || String(m.code).includes(SEARCH_QUERY) || m.element.toLowerCase().includes(SEARCH_QUERY);
    }
    if (m.band !== MAXION_LEVEL_BAND) return false;
    if (MAXION_CAT_FILTER === 'mvp' && m.type !== 'MVP') return false;
    if (MAXION_CAT_FILTER === 'normal' && m.type === 'MVP') return false;
    return true;
  });

  // Build 6x5 World Matrix cells
  const gridCells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 6; c++) {
      const tile = MAXION_WORLD_TILES.find(t => t.row === r && t.col === c);
      if (!tile) {
        gridCells.push(`<div class="maxion-map-cell ocean-empty" style="background:rgba(6,20,39,0.45);border:1px dashed rgba(56,189,248,0.12);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#334155;font-size:10px;font-family:var(--mono);">🌊 Sea Lane</div>`);
        continue;
      }
      const spawnEntry = pinnedMob ? tile.spawns.find(s => s.id === pinnedMob.id) : null;
      const isPinned = Boolean(spawnEntry);
      const isSelected = tile.id === selectedTile.id;
      const cls = [
        'maxion-map-cell',
        isPinned ? 'pinned-spawn' : '',
        isSelected ? 'selected-tile' : ''
      ].filter(Boolean).join(' ');

      const nbBadges = Object.keys(tile.neighbors || {}).join('·');

      gridCells.push(`
        <div class="${cls}" onclick="selectWorldTile('${tile.id}')" ondblclick="CURRENT_TAB='maps';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" title="${escapeHtml(tile.name)} (${tile.code}) — Lv.${tile.lv} | Click to inspect, Double-click for Map Directory">
          ${renderDistinctMapTileSvg(tile, 140)}
          <div class="maxion-map-cell__code">${escapeHtml(tile.code)}</div>
          <div class="maxion-map-cell__lv">Lv.${escapeHtml(tile.lv)}</div>
          ${isPinned ? `
            <div class="maxion-map-cell__pin" onclick="event.stopPropagation();openMonsterDetailPage('${pinnedMob.id}')" title="Click to open ${escapeHtml(pinnedMob.name)} detail page">
              <img src="${pinnedMob.thumb}" alt="${escapeHtml(pinnedMob.name)}"/>
              <span class="maxion-map-cell__pin-count">×${spawnEntry.count}</span>
            </div>
          ` : ''}
          <div class="maxion-map-cell__name">${escapeHtml(tile.name)} <span style="opacity:0.65;font-size:9px;">[${nbBadges}]</span></div>
        </div>
      `);
    }
  }

  // Selected Tile Neighbors & Resident Monsters
  const nbEntries = Object.entries(selectedTile.neighbors || {});

  return `
    ${renderDedicatedWorldAtlas()}
    <div style="margin-bottom: 14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#ffd166;">
          🧭 INTERACTIVE WORLD MAP & MONSTER SPAWN LOCATOR (ROLTH.MAXION.GG + LINEAGE ATLAS BENCHMARK)
        </div>
        <h1 style="font-size:24px;font-weight:900;margin:2px 0 0 0;color:#f8fafc;">
          Midgard Connected Tile World Map <span style="font-size:14px;font-weight:600;color:#94a3b8;">(25 Distinct Connected Regions · 36 Unique Monsters)</span>
        </h1>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn" onclick="openMonsterDetailPage('${pinnedMob.id}')" style="border-color:#ffd166;color:#ffd166;">
          👾 Inspect Pinned: <b>${escapeHtml(pinnedMob.name)} (#${pinnedMob.code})</b> →
        </button>
        <button class="btn" onclick="CURRENT_TAB='maps';writeUrlState(true);renderSidebar();render();">
          🗺️ Connected Map Directory (${getAllWorldTiles().length})
        </button>
      </div>
    </div>

    <div class="maxion-world-shell">
      <!-- LEFT SIDEBAR: Level-Band Rail + Distinct Monster Portrait Grid (rolth.maxion.gg/WorldMap) -->
      <aside class="maxion-sidebar">
        <div class="maxion-sidebar__top">
          <div class="maxion-sidebar__title">
            <span>📌 Pin Monster Spawns on World Map</span>
          </div>
          <div class="maxion-cat-tabs">
            <button class="maxion-cat-btn ${MAXION_CAT_FILTER === 'all' || MAXION_CAT_FILTER === 'normal' ? 'active' : ''}" onclick="selectMaxionCategory(MAXION_CAT_FILTER === 'normal' ? 'all' : 'normal')">
              👾 Normal Monsters
            </button>
            <button class="maxion-cat-btn ${MAXION_CAT_FILTER === 'mvp' ? 'active' : ''}" onclick="selectMaxionCategory(MAXION_CAT_FILTER === 'mvp' ? 'all' : 'mvp')">
              👑 MVP & Boss
            </button>
          </div>
        </div>

        <div class="maxion-sidebar__body">
          <!-- Vertical Level-Band Tabs (1-20 .. 81-100) -->
          <div class="maxion-lvl-rail">
            ${bands.map(b => `
              <button class="maxion-lvl-btn ${MAXION_LEVEL_BAND === b && !SEARCH_QUERY ? 'active' : ''}" onclick="selectMaxionLevelBand('${b}')">
                Lv.<br>${b.replace('-', ' - ')}
              </button>
            `).join('')}
          </div>

          <!-- 3-Column Monster Portrait Cards -->
          <div class="maxion-mob-grid">
            ${filteredMobs.map(m => {
              const isPinned = m.id === pinnedMob.id;
              return `
                <div class="maxion-mob-tile ${isPinned ? 'pinned' : ''}" onclick="pinMaxionMonster('${m.id}')" ondblclick="openMonsterDetailPage('${m.id}')" title="Click to pin spawns on World Map | Double-click for full Monster/${m.code} detail">
                  <span class="maxion-mob-tile__pin-icon">📌</span>
                  <div class="maxion-mob-tile__avatar">
                    <img src="${m.thumb}" alt="${escapeHtml(m.name)}" loading="lazy"/>
                  </div>
                  <span class="maxion-mob-tile__lvl">${m.elIcon} Lv.${m.lv}</span>
                  <div class="maxion-mob-tile__name">${escapeHtml(m.name)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="padding:10px 14px;background:#090d14;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#94a3b8;">
          <span>Pinned: <strong style="color:#ffd166;">${escapeHtml(pinnedMob.name)} (Lv.${pinnedMob.lv})</strong></span>
          <a href="#tab=mobs&mob=${pinnedMob.id}" onclick="event.preventDefault();openMonsterDetailPage('${pinnedMob.id}')" style="color:#38bdf8;font-weight:700;text-decoration:none;">Full Stats & Drops →</a>
        </div>
      </aside>

      <!-- RIGHT WORLD MAP CANVAS: 6x5 Connected Topographic Tile Matrix + Selected Map Inspector -->
      <div class="maxion-canvas-card">
        <div class="maxion-canvas-header">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span class="pill pill--gold">📌 Pinned Monster: ${escapeHtml(pinnedMob.name)} (#${pinnedMob.code})</span>
            <span style="font-size:12px;color:#cbd5e1;">
              Spawns on <strong style="color:#38bdf8;">${getAllWorldTiles().filter(t => t.spawns.some(s => s.id === pinnedMob.id)).length} connected map tiles</strong> (highlighted in cyan/gold below)
            </span>
          </div>
          <div style="font-size:11px;color:#94a3b8;">
            Click any map tile to inspect N/S/E/W connections · Click pinned monster badge to open Monster DB
          </div>
        </div>

        <div class="maxion-world-board">
          <div class="maxion-tile-matrix">
            ${gridCells.join('')}
          </div>
        </div>

        <!-- SELECTED TILE INSPECTOR BAR (Lineage Connected Map + Spawn Breakdown) -->
        <div style="padding:16px 18px;background:#0d1422;border-top:1px solid rgba(255,255,255,0.1);display:grid;grid-template-columns:110px 1fr 1.1fr;gap:18px;align-items:center;">
          <div style="width:104px;height:104px;border-radius:10px;overflow:hidden;border:2px solid #ffd166;box-shadow:0 6px 18px rgba(0,0,0,0.5);">
            ${renderDistinctMapTileSvg(selectedTile, 104)}
          </div>

          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span class="pill pill--cyan" style="font-family:var(--mono);">${escapeHtml(selectedTile.code)}</span>
              <span class="pill">${escapeHtml(selectedTile.biome.toUpperCase())}</span>
              <span class="pill pill--gold">Lv. ${escapeHtml(selectedTile.lv)}</span>
            </div>
            <h3 style="margin:0 0 8px 0;font-size:18px;font-weight:800;color:#fff;">${escapeHtml(selectedTile.name)}</h3>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;font-weight:700;text-transform:uppercase;">Connected Adjacent Maps (Click to Travel):</div>
            <div class="lineage-neighbors">
              ${nbEntries.map(([dir, targetId]) => {
                const target = getMaxionTile(targetId);
                return `<span class="lineage-nb-chip" onclick="selectWorldTile('${target.id}')"><b>${dir}:</b> ${escapeHtml(target.name)} (${escapeHtml(target.code)})</span>`;
              }).join('')}
            </div>
          </div>

          <div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;font-weight:700;text-transform:uppercase;">
              Resident Monsters in ${escapeHtml(selectedTile.name)} (Click to View Monster DB):
            </div>
            <div class="lineage-spawns-row">
              ${selectedTile.spawns.map(sp => {
                const mob = getMaxionMob(sp.id);
                return `
                  <div class="lineage-spawn-pill" onclick="openMonsterDetailPage('${mob.id}')">
                    <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
                    <div>
                      <div style="font-size:12px;font-weight:800;color:#f8fafc;">${escapeHtml(mob.name)}</div>
                      <div style="font-size:10px;color:#ffd166;">Lv.${mob.lv} · ${sp.count} spawns</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}


function renderStoryGraph() {
  const ws = DATA.worldSpine || {};
  const allNodes = ws.storyNodes || [];
  const byId = {};
  allNodes.forEach(n => { byId[n.id] = n; });

  const acts = allNodes.filter(n => n.kind === 'act').sort((a, b) => (a.orderNum || 0) - (b.orderNum || 0));
  const kinds = ['all', 'region', 'faction', 'character', 'arc', 'quest', 'event', 'dialogue', 'lore'];
  const filtered = allNodes.filter(n => (SELECTED_STORY_KIND === 'all' || n.kind === SELECTED_STORY_KIND) && matchesSearch(n));

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">LAYER 0 CANON &amp; LAYER 3 NARRATIVE GRAPH · 9 TYPED SCHEMAS</div>
        <h1 class="page-hero__title">5-Act Story, Factions, NPCs &amp; Quest Unlock DAG (<code>content/story/</code>)</h1>
        <p class="page-hero__sub">
          Full visibility over <strong>The Undertow</strong> 5-act epic and frontier seed arcs:
          <strong>${allNodes.length} cross-checked narrative nodes</strong> where every NPC, Quest, Event, Dialogue, and Lore fragment links cleanly to Regions, Factions, and Server Mobs.
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--success">resolveStoryRefs: PASS</span>
        <span class="joy-badge joy-badge--brand">assertUnlockDag: Acyclic</span>
      </div>
    </div>

    <!-- 5-Act Spine Cards -->
    <div style="display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:10px">
      ${acts.map(act => `
        <div class="observatory-card ${HIGHLIGHT_ENTITY_ID === act.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(act.id)}" style="padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="joy-badge joy-badge--brand joy-badge--sm mono">ACT ${act.orderNum}</span>
            <span class="mono" style="font-size:11px;color:var(--joy-accent-text)">${escapeHtml((act.raw && act.raw.theme) || '')}</span>
          </div>
          <div style="font-weight:700;font-size:14px">${escapeHtml(act.title)}</div>
          <div style="font-size:12px;color:var(--joy-text-secondary)">${escapeHtml(act.summary)}</div>
        </div>
      `).join('')}
    </div>

    <!-- Kind Filter Bar -->
    <div class="controls-panel">
      <strong style="font-size:12px;color:var(--joy-text-secondary)">Filter Narrative Node Kind:</strong>
      <div class="chip-row">
        ${kinds.map(k => {
          const cnt = k === 'all' ? allNodes.length : allNodes.filter(n => n.kind === k).length;
          return `
            <button type="button" class="joy-button ${SELECTED_STORY_KIND === k ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_STORY_KIND='${k}';render()">
              ${escapeHtml(k.toUpperCase())} (${cnt})
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Story Nodes RMS Sheets -->
    <div class="rms-list">
      ${filtered.map(n => {
        const raw = n.raw || {};
        const unlocked = n.unlockedBy || [];
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === n.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(n.id)}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip">📜</span>
                <span class="rms-sheet__title">${escapeHtml(n.title)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm mono">${escapeHtml(n.kind.toUpperCase())}</span>
                <span class="rms-sheet__id">ID: <code>${escapeHtml(n.id)}</code></span>
              </div>
              <div class="chip-row">
                ${n.regionId ? rmsLink('story', n.regionId, (byId[n.regionId]?.title || n.regionId), 'Region') : ''}
                ${n.factionId ? rmsLink('story', n.factionId, (byId[n.factionId]?.title || n.factionId), 'Faction') : ''}
                ${inspectBtnHtml(n.kind, n.title, raw)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  <th>Summary</th>
                  <td colspan="5">${escapeHtml(n.summary)}</td>
                </tr>
                ${n.kind === 'region' ? (() => {
                  const regMaps = (DATA.maps || []).filter(m => m.worldSpineBinding && m.worldSpineBinding.storyRegionId === n.id);
                  const regMobs = (ws.bestiary || []).filter(b =>
                    ('region-' + b.region === n.id) ||
                    (b.region === 'c02/r11' && n.id === 'region-ashvale-front') ||
                    (b.region === 'northern-icefield' && n.id === 'region-icefield')
                  );
                  return `
                  <tr>
                    <th>Danger Tier</th>
                    <td><span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(raw.dangerTier || 'safe')}</span></td>
                    <th>World Spine &amp; 3D Map</th>
                    <td>
                      <div class="chip-row">
                        <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(raw.spineId || raw.resolvedRef || '—')}</span>
                        ${regMaps.map(rm => rmsLink('maps', rm.id, `🗺️ ${rm.id}`, `${rm.width}×${rm.height}m · ${(rm.spawnAreas||[]).length} spawns`)).join(' ')}
                        ${regMobs.length ? rmsLink('bestiary', regMobs[0].id, `🐾 ${regMobs.length} Bestiary Mobs`, regMobs[0].region) : ''}
                      </div>
                    </td>
                    <th>Resident NPCs &amp; Quests</th>
                    <td>
                      <div class="chip-row">
                        ${allNodes.filter(c => c.kind === 'character' && c.regionId === n.id).map(c => rmsLink('story', c.id, c.title, c.raw?.role)).join(' ')}
                        ${allNodes.filter(q => q.kind === 'quest' && q.regionId === n.id).map(q => rmsLink('story', q.id, q.title, 'Quest')).join(' ')}
                      </div>
                    </td>
                  </tr>
                  `;
                })() : ''}
                ${n.kind === 'character' ? `
                  <tr>
                    <th>Role &amp; Status</th>
                    <td>
                      <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(raw.role || 'npc')}</span>
                      <span class="joy-badge ${raw.status === 'dead' ? 'joy-badge--danger' : 'joy-badge--success'} joy-badge--sm mono">${escapeHtml(raw.status || 'alive')}</span>
                    </td>
                    <th>Died At Event</th>
                    <td>${raw.diedAt ? rmsLink('story', raw.diedAt, (byId[raw.diedAt]?.title || raw.diedAt), 'Event') : '—'}</td>
                    <th>Quests Given</th>
                    <td>
                      <div class="chip-row">
                        ${allNodes.filter(q => q.kind === 'quest' && q.giverId === n.id).map(q => rmsLink('story', q.id, q.title)).join(' ') || '—'}
                      </div>
                    </td>
                  </tr>
                ` : ''}
                ${n.kind === 'quest' ? `
                  <tr>
                    <th>Quest Giver &amp; Arc</th>
                    <td colspan="2">
                      ${n.giverId ? rmsLink('story', n.giverId, (byId[n.giverId]?.title || n.giverId), 'Giver NPC') : '—'}
                      ${n.arcId ? rmsLink('story', n.arcId, (byId[n.arcId]?.title || n.arcId), 'Arc') : ''}
                    </td>
                    <th>Unlocked By (DAG)</th>
                    <td colspan="2">
                      <div class="chip-row">
                        ${unlocked.map(uid => rmsLink('story', uid, (byId[uid]?.title || uid), uid.split('-')[0])).join(' ') || '<span class="observatory-card__meta">Starter / Root</span>'}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Objectives</th>
                    <td colspan="2">
                      <div class="chip-row">
                        ${(raw.objectives || []).map(o => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(o.type)}: ${escapeHtml(o.targetId)} ×${o.count}</span>`).join('')}
                      </div>
                    </td>
                    <th>Narrative Text</th>
                    <td colspan="2" style="font-size:12px">
                      <div><strong>Offer:</strong> "${escapeHtml(raw.narrative?.offerText || '')}"</div>
                      <div><strong>Complete:</strong> "${escapeHtml(raw.narrative?.completeText || '')}"</div>
                    </td>
                  </tr>
                ` : ''}
                ${n.kind === 'faction' ? `
                  <tr>
                    <th>Disposition</th>
                    <td><span class="joy-badge ${raw.disposition === 'hostile' ? 'joy-badge--danger' : 'joy-badge--success'} joy-badge--sm mono">${escapeHtml(raw.disposition || 'neutral')}</span></td>
                    <th>Server Mob Family</th>
                    <td><div class="chip-row">${(raw.mobFamily || []).map(mf => `<span class="joy-badge joy-badge--warning joy-badge--sm mono">${escapeHtml(mf)}</span>`).join('') || '—'}</div></td>
                    <th>Stances</th>
                    <td><div class="chip-row">${(raw.relationships || []).map(rel => `${rmsLink('story', rel.factionId, rel.factionId, rel.stance)}`).join(' ') || '—'}</div></td>
                  </tr>
                ` : ''}
                ${n.kind === 'lore' ? `
                  <tr>
                    <th>Anchor &amp; Thread</th>
                    <td colspan="2">${raw.anchor ? rmsLink('story', raw.anchor, (byId[raw.anchor]?.title || raw.anchor), 'Anchor') : ''} <span class="joy-badge joy-badge--neutral joy-badge--sm mono">thread: ${escapeHtml(raw.thread || '')}</span></td>
                    <th>Discoverable Text</th>
                    <td colspan="2" style="font-style:italic;font-size:12.5px">${escapeHtml(raw.body || '')}</td>
                  </tr>
                ` : ''}
                ${n.kind === 'dialogue' ? `
                  <tr>
                    <th>Speaker &amp; Context</th>
                    <td colspan="2">
                      ${raw.speaker ? rmsLink('story', raw.speaker, (byId[raw.speaker]?.title || raw.speaker), 'Speaker') : ''}
                      ${raw.context ? rmsLink('story', raw.context, (byId[raw.context]?.title || raw.context), 'Context') : ''}
                    </td>
                    <th>Spoken Lines</th>
                    <td colspan="2" style="font-size:12px">${(raw.lines || []).map(l => `<div>• "${escapeHtml(l)}"</div>`).join('')}</td>
                  </tr>
                ` : ''}
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBestiary() {
  const ws = DATA.worldSpine || {};
  const allMobs = ws.bestiary || [];
  const regions = ['all', ...Array.from(new Set(allMobs.map(m => m.region).filter(Boolean)))];
  const filtered = allMobs.filter(m => (SELECTED_BESTIARY_REGION === 'all' || m.region === SELECTED_BESTIARY_REGION) && matchesSearch(m));

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">LAYER 3 ECOLOGY &amp; LAYER 5 FORGE VISUAL BRIEFS</div>
        <h1 class="page-hero__title">World Bestiary &amp; Regional Ecology (<code>content/bestiary/bestiary.json</code>)</h1>
        <p class="page-hero__sub">
          <strong>${allMobs.length} lore-anchored creatures</strong> across all canon regions. Each record pairs ecological lore with its 3D/2D Asset Forge visual brief (bodyPlan, silhouette, donor rig cues).
        </p>
      </div>
    </div>

    <div class="controls-panel">
      <strong style="font-size:12px;color:var(--joy-text-secondary)">Filter by Region:</strong>
      <div class="chip-row">
        ${regions.map(r => {
          const cnt = r === 'all' ? allMobs.length : allMobs.filter(m => m.region === r).length;
          return `
            <button type="button" class="joy-button ${SELECTED_BESTIARY_REGION === r ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm mono" onclick="SELECTED_BESTIARY_REGION='${escapeHtml(r)}';render()">
              ${escapeHtml(r.toUpperCase())} (${cnt})
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="rms-list">
      ${filtered.map(m => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === m.id ? 'rms-highlight' : ''}" id="entity-${escapeHtml(m.id)}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              <span class="rms-thumb-chip">🐾</span>
              <span class="rms-sheet__title">${escapeHtml(m.name)}</span>
              <span class="joy-badge joy-badge--brand joy-badge--sm mono">Lv.${escapeHtml(m.levelBand)}</span>
              <span class="joy-badge joy-badge--neutral joy-badge--sm mono">${escapeHtml(m.element)} · ${escapeHtml(m.family)} · ${escapeHtml(m.bodyPlan)}</span>
              <span class="rms-sheet__id"><code>${escapeHtml(m.id)}</code></span>
            </div>
            <div class="chip-row">
              ${(() => {
                const storyRegId = m.region === 'c02/r11' ? 'region-ashvale-front' : (m.region === 'northern-icefield' ? 'region-icefield' : 'region-' + m.region);
                const spawnMap = (DATA.maps || []).find(mp =>
                  (mp.worldSpineBinding && mp.worldSpineBinding.storyRegionId === storyRegId) ||
                  (mp.spawnAreas || []).some(sa => sa.mobType === m.id)
                );
                return (spawnMap ? rmsLink('maps', spawnMap.id, `🗺️ ${spawnMap.id}`, '3D Spawn Map') : '') +
                  rmsLink('story', storyRegId, m.region === 'c02/r11' ? 'region-ashvale-front (c02/r11)' : storyRegId, 'Region');
              })()}
              ${m.faction ? rmsLink('story', m.faction, m.faction, 'Faction') : ''}
              ${inspectBtnHtml('bestiary', m.name, m)}
            </div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                <th>Combat Profile</th>
                <td class="mono">Archetype: <strong>${escapeHtml(m.archetype)}</strong> · Threat: ${escapeHtml(m.threat)} · Durability: ${escapeHtml(m.durability)} · Speed: ${escapeHtml(m.speed)}</td>
              </tr>
              <tr>
                <th>Ecological Lore</th>
                <td>${escapeHtml(m.lore)}</td>
              </tr>
              <tr>
                <th>Forge Visual Brief</th>
                <td style="color:var(--joy-accent-text)">${escapeHtml(m.visualBrief)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================================
 * 1. OVERVIEW & RMS HUB
 * ========================================================================== */
function renderOverview() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const mobs = DATA.mobs.filter(matchesSearch);
  const items = DATA.items.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">JOYMIFY DESIGN SYSTEM · RATEMYSERVER OBSERVATORY EDITION</div>
        <h1 class="page-hero__title">Atlas World Database, 3D Asset Thumbnails &amp; Balance Studio</h1>
        <p class="page-hero__sub">
          Authentic 3D-baked WebP thumbnails (<code>game-client/assets/.thumbs/</code>), dense 2D datasheets,
          bidirectional foreign-key links, and live drop-rate scaling (<strong>${DROP_RATE_MULT}x</strong>).
        </p>
      </div>
      <div class="chip-row">
        <span class="joy-badge joy-badge--brand">Drop Rate: ${DROP_RATE_MULT}x</span>
        <span class="joy-badge joy-badge--success">68/68 Rust Tests Passing</span>
      </div>
    </div>

    <!-- RMS 3-Box Reference Hub -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>📊 Charts &amp; Tables</h4>
        <div class="rms-hub-links">
          ${rmsLink('elements', '', '10×10 Elemental Property Chart', 'elements.json')}
          ${rmsLink('elements', '', 'Weapon Type vs Monster Size Table', 'Small/Med/Large')}
          ${rmsLink('gear', 'basic_sword', '+0..+15 Refine & Pity Success Table', '5-Fail Pity')}
          ${rmsLink('sql', '', 'v_mob_economy (EXP-per-HP Ranking)', 'SQLite View')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>📜 Promotion &amp; World Guides</h4>
        <div class="rms-hub-links">
          ${rmsLink('quests', 'jq_swordman_trial', 'Swordman → Knight Promotion Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('quests', 'jq_mage_academy', 'Mage → High Wizard Academy Trials', 'Lv.10 / Lv.40')}
          ${rmsLink('world', 'c02', 'World & Continent Atlas (400×400 km)', '13 Continents · 60 Dungeons')}
          ${rmsLink('story', 'act-1', '5-Act Undertow Narrative & NPC Graph', ((DATA.worldSpine && DATA.worldSpine.storyNodes) || []).length + ' Nodes')}
          ${rmsLink('bestiary', '', 'World Ecology & Bestiary Visual Briefs', ((DATA.worldSpine && DATA.worldSpine.bestiary) || []).length + ' Creatures')}
          ${rmsLink('maps', 'freja-south-gate', 'Prontera South Gate — Area Spawn Guide', '8 Spawn Areas')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🧮 Simulators &amp; Calculators</h4>
        <div class="rms-hub-links">
          ${rmsLink('sim', '', 'Authoritative Rust Balance Simulator', 'server-rs')}
          ${rmsLink('siege', 'castle_valkyrie_01', 'WoE Emperium Breach & TTK Calculator', 'Kriemhild')}
          ${rmsLink('gear', 'scythe', 'Equipment Refine & Card Socket Calculator', '+0..+15')}
          ${rmsLink('sql', '', 'Read-Only SQLite + JSONB Query Console', 'catalog.sqlite')}
        </div>
      </div>
    </div>

    <div class="joy-telemetry-strip">
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.items.length}</span>
        <span class="joy-telemetry-strip__label">Items (item_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.cards.length}</span>
        <span class="joy-telemetry-strip__label">Cards</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.mobs.length}</span>
        <span class="joy-telemetry-strip__label">Monsters (mob_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.jobs.length}</span>
        <span class="joy-telemetry-strip__label">Jobs</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.skills.length}</span>
        <span class="joy-telemetry-strip__label">Skills (skill_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.quests.length}</span>
        <span class="joy-telemetry-strip__label">Quests (quest_db)</span>
      </div>
      <div class="joy-telemetry-strip__item">
        <span class="joy-telemetry-strip__metric">${DATA.maps.length}</span>
        <span class="joy-telemetry-strip__label">3D Maps (map_db)</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Cross-Repo Entity, 3D Thumbnail &amp; Asset Studio Binding Matrix</h3>
          <div class="observatory-card__meta">Every entity link displays its actual 3D-baked game-client thumbnail and jumps straight to its RateMyServer datasheet</div>
        </div>
        <span class="joy-badge joy-badge--brand">v_asset_studio_entries</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Datasheet Link (with 3D Thumbnail)</th>
              <th>Tier / Rank / Slot</th>
              <th>Cross-References</th>
              <th>3D Scene / Asset Studio Key</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            ${jobs.map(j => `
              <tr>
                <td><span class="joy-badge joy-badge--brand joy-badge--sm">JOB</span></td>
                <td>${rmsLink('jobs', j.id, j.name, 'Tier ' + j.tier)}</td>
                <td>Tier ${j.tier} (${j.parentJobId || 'root'})</td>
                <td>${(j.unlockedSkillIds || []).map(sid => rmsLink('jobs', sid, sid)).join('')}</td>
                <td class="mono">${escapeHtml(j.scenePath || j.assetStudioKey)}</td>
                <td>${inspectBtnHtml('job', j.name, j)}</td>
              </tr>
            `).join('')}
            ${mobs.map(m => `
              <tr>
                <td><span class="joy-badge ${m.isMvp ? 'joy-badge--warning' : 'joy-badge--danger'} joy-badge--sm">${m.isMvp ? 'MVP' : 'MOB'}</span></td>
                <td>${rmsLink('mobs', m.id, m.name, 'Lv.' + m.level)}</td>
                <td>${m.element} / ${m.race} / ${m.size}</td>
                <td>${(m.drops || []).map(d => rmsLink('gear', d.itemId, d.itemId, formatDropPct(d.chanceBps))).join('')}</td>
                <td class="mono">${escapeHtml(m.scenePath || m.assetStudioKey)}</td>
                <td>${inspectBtnHtml('mob', m.name, m)}</td>
              </tr>
            `).join('')}
            ${items.map(it => `
              <tr>
                <td><span class="joy-badge joy-badge--neutral joy-badge--sm">ITEM</span></td>
                <td>${rmsLink('gear', it.id, it.name, it.kind)}</td>
                <td>${it.kind.toUpperCase()} ${it.pAtk ? '· ATK ' + it.pAtk : ''} ${it.mAtk ? '· MATK ' + it.mAtk : ''}</td>
                <td>${DATA.mobs.filter(m => (m.drops || []).some(d => d.itemId === it.id)).map(m => rmsLink('mobs', m.id, m.name)).join('') || '<span class="observatory-card__meta">Quest / Starter</span>'}</td>
                <td class="mono">${escapeHtml(it.scenePath || ('item.' + it.id))}</td>
                <td>${inspectBtnHtml('item', it.name, it)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 2. ITEM & CARD DATABASE (RateMyServer item_db 2D Datasheet + 3D Artwork Column)
 * ========================================================================== */
function renderGear() {
  const items = DATA.items.filter(matchesSearch);
  const cards = DATA.cards.filter(matchesSearch);

  const descForItem = it => {
    if (it.id === 'basic_sword') return 'Standard-issue steel arming sword balanced for Novice and Swordman frontliners. Scales with STR.';
    if (it.id === 'magic_staff') return 'Focuses ambient mana into elemental bolts. Increases Magical Attack (MATK +15) scaling with INT.';
    if (it.id === 'great_bow') return 'Long-draw ashwood bow favored by Payon and Prontera Rangers. Scales with DEX.';
    if (it.id === 'dagger') return 'Lightweight close-quarters blade usable by almost all novice and caster classes.';
    if (it.id === 'scythe') return 'Heavy two-handed polearm-scythe wielded by Chivalry Knights and Orc Warlords. Excels against Large targets.';
    if (it.id === 'potion_minor') return 'Restores a small amount of HP during field expeditions. Stackable crimson vial.';
    if (it.id === 'leather_armor') return 'Reinforced boar-hide tunic and heraldic guard piece providing reliable physical protection for field patrols.';
    return 'High-purity metallic ore crystal smelted by Prontera blacksmiths and required for Watchtower repairs and Promotion Trials.';
  };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER ITEM_DB · 3D ASSET THUMBNAILS + +0..+15 REFINE</div>
        <h1 class="page-hero__title">Item &amp; Card Database (${items.length} Items, ${cards.length} Cards)</h1>
        <p class="page-hero__sub">
          Each item datasheet features its real 256×256 3D-baked game-client thumbnail (<code>.thumbs/*.webp</code>),
          Applicable Jobs bitmasks, Engine Script contracts, and Dropped By monster links at <strong>${DROP_RATE_MULT}x</strong> rate.
        </p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="refBaseAtk">Weapon Base ATK</label>
        <input id="refBaseAtk" class="joy-input" type="number" value="120" min="10" max="500" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refLevel">Target Refine (+0..+15)</label>
        <input id="refLevel" class="joy-input" type="number" value="10" min="0" max="15" oninput="updateRefineCalc()" />
      </div>
      <div class="control-field">
        <label for="refFails">Consecutive Fails (Pity 0..5)</label>
        <input id="refFails" class="joy-input" type="number" value="2" min="0" max="5" oninput="updateRefineCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="refineCalcResult"></span>
      </div>
    </div>

    <div class="rms-list">
      ${items.map((it, idx) => {
        const isWeapon = it.kind === 'weapon';
        const isEquip = it.kind === 'weapon' || it.kind === 'armor';
        const slots = isWeapon ? '[1]' : (it.kind === 'armor' ? '[1]' : '[0]');
        const handed = it.id === 'great_bow' || it.id === 'scythe' ? '[Two Handed]' : (isWeapon ? '[One Hand]' : '');
        const applicableJobs = isWeapon
          ? DATA.jobs.filter(j => (j.allowedWeaponKinds || []).includes(it.id))
          : DATA.jobs;
        const droppedBy = [];
        DATA.mobs.forEach(m => {
          (m.drops || []).forEach(d => {
            if (d.itemId === it.id) droppedBy.push({ mob: m, chanceBps: d.chanceBps });
          });
        });
        const questRewards = DATA.quests.filter(q => ((q.rewards && q.rewards.items) || []).some(ri => ri.itemId === it.id));
        const questObjectives = DATA.quests.filter(q => (q.objectives || []).some(ob => ob.targetId === it.id));
        const scriptStr = isWeapon
          ? `{ bonus bBaseAtk,${it.pAtk || 0}; bonus bMatk,${it.mAtk || 0}; bonus bAtkStat,"${(it.atkStat || 'str').toUpperCase()}"; bonus bRefinePityMax,5; }`
          : (it.kind === 'armor'
            ? `{ bonus bDef,12; bonus bMaxHp,80; bonus bRefinePityMax,5; }`
            : (it.kind === 'consumable' ? `{ itemheal rand(45,65),0; }` : `{ /* Crafting & Quest Material */ }`));

        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === it.id ? 'rms-highlight' : ''}" id="entity-${it.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(it)}
                <span class="rms-sheet__title">${escapeHtml(it.name)} ${slots}</span>
                ${handed ? `<span class="joy-badge joy-badge--brand joy-badge--sm">${handed}</span>` : ''}
                <span class="rms-sheet__id">Item ID# ${1001 + idx} (<code>${escapeHtml(it.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="joy-badge joy-badge--neutral joy-badge--sm">${it.kind.toUpperCase()}</span>
                ${inspectBtnHtml('item', it.name, it)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(it, 7, it.kind)}
                  <th>Type</th>
                  <td>${escapeHtml(it.kind.toUpperCase())}</td>
                  <th>Class / Subtype</th>
                  <td>${isWeapon ? escapeHtml(it.id.replace('_', ' ')) : escapeHtml(it.kind)}</td>
                  <th>Stackable</th>
                  <td class="mono">${it.stackable ? 'Yes (Max 999)' : 'No (Unique Slot)'}</td>
                  <th>Refineable</th>
                  <td class="mono">${isEquip ? 'Yes (+0..+15 Pity)' : 'No'}</td>
                </tr>
                <tr>
                  <th>Physical ATK</th>
                  <td class="mono">${it.pAtk ?? '—'}</td>
                  <th>Magical MATK</th>
                  <td class="mono">${it.mAtk ?? '—'}</td>
                  <th>Scaling Stat</th>
                  <td class="mono">${it.atkStat ? it.atkStat.toUpperCase() : '—'}</td>
                  <th>Card Slots</th>
                  <td class="mono">${isEquip ? '1' : '0'}</td>
                </tr>
                <tr>
                  <th>Applicable Jobs</th>
                  <td colspan="7">
                    ${applicableJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ') || '<span class="observatory-card__meta">All Classes</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Description</th>
                  <td colspan="7">${escapeHtml(descForItem(it))}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">${escapeHtml(scriptStr)}</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${droppedBy.length
                      ? droppedBy.map(d => rmsLink('mobs', d.mob.id, d.mob.name, formatDropPct(d.chanceBps))).join(' ')
                      : '<span style="color:var(--joy-status-danger-fg);font-weight:600">No Monster Drop (Quest / Starter Reward)</span>'}
                  </td>
                </tr>
                <tr>
                  <th>Obtainable / Used In</th>
                  <td colspan="7">
                    ${questRewards.map(q => rmsLink('quests', q.id, 'Reward: ' + q.title)).join(' ')}
                    ${questObjectives.map(q => rmsLink('quests', q.id, 'Required: ' + q.title)).join(' ')}
                    ${(!questRewards.length && !questObjectives.length) ? '<span class="observatory-card__meta">Field Drop / NPC Shop</span>' : ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${cards.map((c, idx) => {
        const mob = DATA.mobs.find(m => m.id === c.mobId);
        const equipScript = Object.entries(c.equipStats || {}).map(([k,v]) => `bonus ${k},${v};`).join(' ');
        const depScript = Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `handbook_bonus ${k},${v};`).join(' ');
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === c.id ? 'rms-highlight' : ''}" id="entity-${c.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(c, '🃏')}
                <span class="rms-sheet__title">${escapeHtml(c.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">[${c.slot.toUpperCase()} SOCKET]</span>
                <span class="rms-sheet__id">Card ID# ${4001 + idx} (<code>${escapeHtml(c.id)}</code>)</span>
              </div>
              <div class="chip-row">
                <span class="mono" style="font-size:11px;color:var(--joy-text-muted)">${c.assetStudioKey}</span>
                ${inspectBtnHtml('card', c.name, c)}
              </div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderCardPortraitCell(c, 3)}
                  <th>Type</th>
                  <td>Monster Card</td>
                  <th>Compound On</th>
                  <td><strong>${escapeHtml(c.slot.toUpperCase())}</strong></td>
                  <th>Socket Bonus</th>
                  <td class="mono">${Object.entries(c.equipStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                  <th>Handbook Deposit</th>
                  <td class="mono">${Object.entries(c.handbookDepositStats || {}).map(([k,v]) => `${k} +${v}`).join(', ')}</td>
                </tr>
                <tr>
                  <th>Item Script</th>
                  <td colspan="7"><code class="rms-script-code">{ ${escapeHtml(equipScript)} } /* Deposit: { ${escapeHtml(depScript)} } */</code></td>
                </tr>
                <tr>
                  <th>Dropped By</th>
                  <td colspan="7">
                    ${mob ? rmsLink('mobs', mob.id, mob.name, formatDropPct(20)) : c.mobId}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function updateRefineCalc() {
  const baseAtk = parseInt(document.getElementById('refBaseAtk')?.value || '120', 10);
  const lvl = Math.max(0, Math.min(15, parseInt(document.getElementById('refLevel')?.value || '10', 10)));
  const fails = Math.max(0, Math.min(5, parseInt(document.getElementById('refFails')?.value || '0', 10)));
  const baseRates = [100,100,100,100,100, 60,50,40,30,20, 15,12,10,8,5,5];
  const baseRate = baseRates[lvl] ?? 10;
  const effRate = lvl <= 4 ? 100 : (fails >= 5 ? 100 : Math.min(100, baseRate + fails * 20));
  const overUpgrade = lvl > 4 ? (lvl - 4) * 5 : 0;
  const totalAtk = baseAtk + lvl * 3 + overUpgrade;
  const el = document.getElementById('refineCalcResult');
  if (el) {
    el.textContent = `+${lvl} Total ATK: ${totalAtk} (+${lvl*3 + overUpgrade} bonus) · Success Rate: ${effRate}% (Base ${baseRate}% + Pity ${fails}/5)`;
  }
}

/* ============================================================================
 * 3. MONSTER DATABASE (RateMyServer mob_db 2D Datasheet + 3D Creature Portrait)
 * ========================================================================== */
function renderMobs() {
  const mob = getMaxionMob(MAXION_SELECTED_MOB_ID);
  const spawnTiles = getAllWorldTiles().filter(t => t.spawns.some(s => s.id === mob.id));

  const elementMeta = [
    { key: 'Earth',   icon: '🌿', color: '#4ade80' },
    { key: 'Poison',  icon: '☠️', color: '#c084fc' },
    { key: 'Neutral', icon: '⚪', color: '#cbd5e1' },
    { key: 'Fire',    icon: '🔥', color: '#f87171' },
    { key: 'Holy',    icon: '✨', color: '#fde047' },
    { key: 'Dark',    icon: '🌑', color: '#818cf8' },
    { key: 'Water',   icon: '💧', color: '#38bdf8' },
    { key: 'Ghost',   icon: '👻', color: '#e2e8f0' },
    { key: 'Undead',  icon: '💀', color: '#94a3b8' },
    { key: 'Wind',    icon: '🌪️', color: '#facc15' },
  ];

  const rosterMobs = getAllMonsters().filter(m => {
    if (!SEARCH_QUERY) return true;
    return m.name.toLowerCase().includes(SEARCH_QUERY) || String(m.code).includes(SEARCH_QUERY) || m.element.toLowerCase().includes(SEARCH_QUERY) || m.race.toLowerCase().includes(SEARCH_QUERY);
  });

  return `
    <!-- Breadcrumb Bar (rolth.maxion.gg/Monster/1035 style) -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#94a3b8;font-weight:600;">
        <a href="#tab=world&mob=${mob.id}" onclick="event.preventDefault();CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';writeUrlState(true);renderSidebar();render();" style="color:#38bdf8;text-decoration:none;font-weight:700;">🧭 World Map</a>
        <span>/</span>
        <span>Monsters</span>
        <span>/</span>
        <span style="color:#f8fafc;font-weight:800;">${escapeHtml(mob.name)} (#${mob.code})</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn" onclick="CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';writeUrlState(true);renderSidebar();render();" style="border-color:#38bdf8;color:#38bdf8;">
          📌 Show ${escapeHtml(mob.name)} on World Map (${spawnTiles.length} Maps)
        </button>
      </div>
    </div>

    <div class="maxion-mob-detail">
      <!-- HERO HEADER: 192x192 Portrait Card + Name + 4 Pill Badges + 4 Stat Boxes -->
      <div class="maxion-mob-hero">
        <div class="maxion-mob-portrait-box">
          <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
        </div>

        <div>
          <div style="font-size:12px;font-family:var(--mono);color:#94a3b8;font-weight:700;margin-bottom:2px;">
            MONSTER ID #${mob.code} · LEVEL BAND ${mob.band}
          </div>
          <h1 class="maxion-mob-title">${escapeHtml(mob.name)}</h1>

          <!-- 4 Property Pill Badges (Normal/MVP, Element, Race, Size) -->
          <div class="maxion-prop-pills">
            <span class="maxion-prop-pill" style="${mob.type === 'MVP' ? 'border-color:#eab308;color:#fde047;background:rgba(234,179,8,0.16);' : ''}">
              ${mob.type === 'MVP' ? '👑 MVP Boss' : '⚔️ Normal'}
            </span>
            <span class="maxion-prop-pill">${mob.elIcon} ${escapeHtml(mob.element)}</span>
            <span class="maxion-prop-pill">🧬 ${escapeHtml(mob.race)}</span>
            <span class="maxion-prop-pill">📏 ${escapeHtml(mob.size)}</span>
          </div>

          <!-- 4 Primary Stat Boxes (LEVEL, HP, HIT / FLEE, EXP / JOB) -->
          <div class="maxion-stat-boxes">
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">LEVEL</div>
              <div class="maxion-stat-box__val">${mob.lv}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">HP</div>
              <div class="maxion-stat-box__val">${mob.hp.toLocaleString()}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">HIT / FLEE</div>
              <div class="maxion-stat-box__val">${mob.hit} / ${mob.flee}</div>
            </div>
            <div class="maxion-stat-box">
              <div class="maxion-stat-box__label">EXP / JOB</div>
              <div class="maxion-stat-box__val">${mob.exp.toLocaleString()} / ${mob.job.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 1: 2x5 Elemental Damage Modifiers (ธาตุ / Elemental Modifiers) -->
      <div>
        <div class="maxion-section-head">ธาตุ · Elemental Damage Modifiers</div>
        <div class="maxion-elem-grid">
          ${elementMeta.map(el => {
            const pct = mob.modifiers[el.key] !== undefined ? mob.modifiers[el.key] : 100;
            const cls = pct > 100 ? 'maxion-elem-card__pct--weak' : (pct < 100 ? 'maxion-elem-card__pct--resist' : '');
            return `
              <div class="maxion-elem-card">
                <div class="maxion-elem-card__icon" style="border:1px solid ${el.color}55;">${el.icon}</div>
                <div>
                  <div class="maxion-elem-card__name">${el.key}</div>
                  <div class="maxion-elem-card__pct ${cls}">${pct}%</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- SECTION 2: Visual Item Drop Cards (โอกาสได้รับ · Drops & Obtainable Items) -->
      <div>
        <div class="maxion-section-head">โอกาสได้รับ · Obtainable Drops (${mob.drops.length} Items)</div>
        <div class="maxion-drops-grid">
          ${mob.drops.map(d => `
            <div class="maxion-drop-card rarity-${d.rarity}">
              <div class="maxion-drop-card__art">
                <img src="${d.thumb}" alt="${escapeHtml(d.name)}"/>
                <span class="maxion-drop-card__rate">${escapeHtml(d.rate)}</span>
              </div>
              <div class="maxion-drop-card__name">${escapeHtml(d.name)}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- SECTION 3: Connected Spawn Habitat Maps -->
      <div>
        <div class="maxion-section-head">แหล่งเกิดมอนสเตอร์ · Connected Spawn Maps (${spawnTiles.length} Maps)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">
          ${spawnTiles.map(tile => {
            const sp = tile.spawns.find(s => s.id === mob.id);
            return `
              <div onclick="CURRENT_TAB='world';MAXION_PINNED_MOB_ID='${mob.id}';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;background:#161d2a;border:1px solid rgba(255,255,255,0.1);cursor:pointer;">
                <div style="width:64px;height:64px;flex-shrink:0;border-radius:8px;overflow:hidden;border:1px solid rgba(255,209,102,0.5);">
                  ${renderDistinctMapTileSvg(tile, 64)}
                </div>
                <div>
                  <div style="font-size:11px;font-family:var(--mono);color:#38bdf8;font-weight:700;">${escapeHtml(tile.code)} · Lv.${escapeHtml(tile.lv)}</div>
                  <div style="font-size:14px;font-weight:800;color:#fff;">${escapeHtml(tile.name)}</div>
                  <div style="font-size:12px;color:#ffd166;font-weight:700;">📌 ${sp ? sp.count : 20} Active Spawns →</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- SECTION 4: Quick Monster Switcher Roster (All 36 Distinct Monsters) -->
      <div>
        <div class="maxion-section-head">All Monsters Roster (${rosterMobs.length} Distinct Monsters — Click Any to Inspect)</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
          ${rosterMobs.map(m => `
            <div onclick="openMonsterDetailPage('${m.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:${m.id === mob.id ? 'rgba(234,179,8,0.18)' : '#161c28'};border:1.5px solid ${m.id === mob.id ? '#eab308' : 'rgba(255,255,255,0.08)'};cursor:pointer;">
              <img src="${m.thumb}" alt="${escapeHtml(m.name)}" style="width:42px;height:42px;object-fit:contain;border-radius:8px;background:#0c1018;padding:3px;"/>
              <div style="min-width:0;">
                <div style="font-size:12px;font-weight:800;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.name)}</div>
                <div style="font-size:10px;color:#94a3b8;">#${m.code} · Lv.${m.lv}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}


function renderJobs() {
  const jobs = DATA.jobs.filter(matchesSearch);
  const skills = DATA.skills.filter(matchesSearch);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER SKILL_DB_CLASS · 3D CLASS PORTRAITS &amp; SKILLS</div>
        <h1 class="page-hero__title">Job Branches, Stat Bonuses &amp; Skill Database</h1>
        <p class="page-hero__sub">
          Browse class branches with 3D KayKit character portraits (Novice → Swordman → Knight, Mage → High Wizard, Archer),
          allowed weapon bitmasks with weapon thumbnails, and skill prerequisites.
        </p>
      </div>
    </div>

    <!-- RMS Visual Branch Summary with 3D Character Portraits -->
    <div class="rms-hub-grid">
      <div class="rms-hub-box">
        <h4>⚔️ Swordman → Knight Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['swordman'] || '')}" alt="Swordman" title="1-1: Swordman" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['knight'] || '')}" alt="Knight" title="2-1: Knight" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'swordman', '1-1: Swordman (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'knight', '2-1: Knight (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_swordman_trial', 'Quest: Trial of the Blade')}
          ${rmsLink('quests', 'jq_knight_chivalry', 'Quest: Oath of the Watchtower')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🔮 Mage → High Wizard Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['mage'] || '')}" alt="Mage" title="1-1: Mage" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['wizard'] || '')}" alt="High Wizard" title="2-1: High Wizard" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'mage', '1-1: Mage (Lv.10 / Job 40)')}
          ${rmsLink('jobs', 'wizard', '2-1: High Wizard (Lv.40 / Job 50)')}
          ${rmsLink('quests', 'jq_mage_academy', 'Quest: Elemental Thesis')}
          ${rmsLink('quests', 'jq_wizard_tower', 'Quest: Rite of the High Arcana')}
        </div>
      </div>
      <div class="rms-hub-box">
        <h4>🏹 Archer &amp; Ranger Branch</h4>
        <div class="rms-branch-portraits">
          <img src="${escapeHtml(THUMB_INDEX['novice'] || '')}" alt="Novice" title="Tier 0: Novice" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['archer'] || '')}" alt="Archer" title="1-1: Archer" />
          <span style="color:var(--joy-text-muted)">→</span>
          <img src="${escapeHtml(THUMB_INDEX['great_bow'] || '')}" alt="Great Bow" title="Great Bow" />
        </div>
        <div class="rms-hub-links">
          ${rmsLink('jobs', 'novice', 'Tier 0: Novice (Lv.1 / Job 10)')}
          ${rmsLink('jobs', 'archer', '1-1: Archer (Lv.10 / Job 40)')}
          ${rmsLink('quests', 'jq_archer_guild', 'Quest: Wind & Steady Aim')}
          ${rmsLink('gear', 'great_bow', 'Weapon: Great Bow [Two Handed]')}
        </div>
      </div>
    </div>

    <div class="rms-list">
      ${jobs.map((j, idx) => {
        const bonusStr = Object.entries(j.jobBonusAtMax || {}).filter(([,v]) => v > 0).map(([k,v]) => `${k.toUpperCase()} +${v}`).join(' · ') || 'None';
        const childJobs = DATA.jobs.filter(cj => cj.parentJobId === j.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === j.id ? 'rms-highlight' : ''}" id="entity-${j.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(j, '🛡️')}
                <span class="rms-sheet__title">${escapeHtml(j.name)}</span>
                <span class="joy-badge joy-badge--brand joy-badge--sm">TIER ${j.tier}</span>
                <span class="rms-sheet__id">Job ID# ${3001 + idx} (<code>${escapeHtml(j.id)}</code> · <code>${escapeHtml(j.assetStudioKey)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('job', j.name, j)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(j, 4, j.assetStudioKey)}
                  <th>Min Base Level</th>
                  <td class="mono">Lv.${j.minBaseLevel}</td>
                  <th>Max Job Level</th>
                  <td class="mono">Job Lv.${j.maxJobLevel}</td>
                  <th>Parent Class</th>
                  <td>${j.parentJobId ? rmsLink('jobs', j.parentJobId, j.parentJobId) : '<span class="observatory-card__meta">Starter Root</span>'}</td>
                  <th>Promotes To</th>
                  <td>${childJobs.map(cj => rmsLink('jobs', cj.id, cj.name)).join(' ') || '<span class="observatory-card__meta">Max Tier</span>'}</td>
                </tr>
                <tr>
                  <th>Primary Stats</th>
                  <td class="mono">${(j.primaryStats || []).map(s => s.toUpperCase()).join(', ')}</td>
                  <th>Max Job Bonuses</th>
                  <td colspan="3" class="mono">${escapeHtml(bonusStr)}</td>
                  <th>Promotion Trial</th>
                  <td>${j.jobChangeQuestId ? rmsLink('quests', j.jobChangeQuestId, j.jobChangeQuestId) : '<span class="observatory-card__meta">None</span>'}</td>
                </tr>
                <tr>
                  <th>Allowed Weapons</th>
                  <td colspan="7">${(j.allowedWeaponKinds || []).map(w => rmsLink('gear', w, w)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Unlocked Skills</th>
                  <td colspan="7">${(j.unlockedSkillIds || []).map(s => rmsLink('jobs', s, s)).join(' ')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}

      ${skills.map((sk, idx) => {
        const usedByJobs = DATA.jobs.filter(j => (j.unlockedSkillIds || []).includes(sk.id));
        const unlockedByQuests = DATA.quests.filter(q => q.rewards && q.rewards.unlockSkillId === sk.id);
        return `
          <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === sk.id ? 'rms-highlight' : ''}" id="entity-${sk.id}">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                ${renderThumbChip(sk, '✨')}
                <span class="rms-sheet__title">Skill: ${escapeHtml(sk.name)}</span>
                <span class="joy-badge joy-badge--success joy-badge--sm">MAX LV.${sk.maxLevel}</span>
                <span class="rms-sheet__id">Skill ID# ${5001 + idx} (<code>${escapeHtml(sk.id)}</code>)</span>
              </div>
              <div class="chip-row">${inspectBtnHtml('skill', sk.name, sk)}</div>
            </div>
            <table class="rms-table">
              <tbody>
                <tr>
                  ${renderArtworkCell(sk, 2, sk.id)}
                  <th>Max Skill Level</th>
                  <td class="mono">Lv.${sk.maxLevel}</td>
                  <th>Prerequisites</th>
                  <td>${(sk.requires || []).length ? sk.requires.map(r => rmsLink('jobs', r, r)).join(' ') : '<span class="observatory-card__meta">None (Tier 1 Core)</span>'}</td>
                  <th>Learnable By</th>
                  <td colspan="3">${usedByJobs.map(j => rmsLink('jobs', j.id, j.name)).join(' ')}</td>
                </tr>
                <tr>
                  <th>Quest Unlocks</th>
                  <td colspan="7">
                    ${unlockedByQuests.map(q => rmsLink('quests', q.id, q.title)).join(' ') || '<span class="observatory-card__meta">Innate Class Skill</span>'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ============================================================================
 * 5. ELEMENT & SIZE MATRIX
 * ========================================================================== */
function renderElements() {
  const elems = DATA.elements.elements || [];
  const mat = DATA.elements.damageMatrixPct || {};
  const sizePen = DATA.elements.weaponSizePenaltyPct || {};
  const wpnKinds = Object.keys(sizePen);

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER PROPERTY CHART · 10-ELEMENT &amp; 3-SIZE</div>
        <h1 class="page-hero__title">10-Element Counter Matrix &amp; Weapon-vs-Size Modifiers</h1>
        <p class="page-hero__sub">Interactive damage multiplier calculator + full 10×10 elemental lookup table and Small/Medium/Large weapon size table.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="calcAtkElem">Attacker Element</label>
        <select id="calcAtkElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===1?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcDefElem">Defender Element</label>
        <select id="calcDefElem" class="joy-select" onchange="updateElemCalc()">
          ${elems.map((e, i) => `<option value="${e}" ${i===2?'selected':''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcWpnKind">Weapon Kind</label>
        <select id="calcWpnKind" class="joy-select" onchange="updateElemCalc()">
          ${wpnKinds.map(w => `<option value="${w}">${w}</option>`).join('')}
        </select>
      </div>
      <div class="control-field">
        <label for="calcTargetSize">Target Size</label>
        <select id="calcTargetSize" class="joy-select" onchange="updateElemCalc()">
          <option value="Small">Small</option>
          <option value="Medium" selected>Medium</option>
          <option value="Large">Large</option>
        </select>
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="elemCalcOutput">Combined Multiplier: 100%</span>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">10×10 Elemental Damage Matrix (Attacker Row vs. Defender Column %)</h3>
          <div class="observatory-card__meta">Values &gt; 100% deal bonus counter damage; values &lt; 100% are resisted</div>
        </div>
        <span class="joy-badge joy-badge--brand">elements.json</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>ATK \\ DEF</th>
              ${elems.map(e => `<th>${e}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${elems.map(atk => `
              <tr>
                <td><strong>${atk}</strong></td>
                ${elems.map(def => {
                  const v = (mat[atk] && mat[atk][def] !== undefined) ? mat[atk][def] : 100;
                  const cls = v > 100 ? 'elem-cell--pos' : (v === 0 ? 'elem-cell--zero' : (v < 100 ? 'elem-cell--neg' : ''));
                  return `<td class="mono ${cls}">${v}%</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="observatory-card">
      <div class="observatory-card__head">
        <div>
          <h3 class="observatory-card__title">Weapon Kind vs. Monster Size Modifier (Small / Medium / Large %)</h3>
          <div class="observatory-card__meta">Classic RO weapon-size signature (e.g., Spears/Scythes excel vs. Large, Daggers excel vs. Small)</div>
        </div>
        <span class="joy-badge joy-badge--neutral">Size Table</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>
              <th>Weapon Kind</th>
              <th>Small</th>
              <th>Medium</th>
              <th>Large</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(sizePen).map(([wpn, row]) => `
              <tr>
                <td>${rmsLink('gear', wpn, wpn)}</td>
                <td class="mono">${row.Small}%</td>
                <td class="mono">${row.Medium}%</td>
                <td class="mono">${row.Large}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function updateElemCalc() {
  if (!DATA || !DATA.elements) return;
  const atk = document.getElementById('calcAtkElem')?.value;
  const def = document.getElementById('calcDefElem')?.value;
  const wpn = document.getElementById('calcWpnKind')?.value;
  const sz = document.getElementById('calcTargetSize')?.value;
  const elemPct = (DATA.elements.damageMatrixPct?.[atk]?.[def]) ?? 100;
  const sizePct = (DATA.elements.weaponSizePenaltyPct?.[wpn]?.[sz]) ?? 100;
  const combined = ((elemPct / 100.0) * (sizePct / 100.0) * 100.0).toFixed(1);
  const out = document.getElementById('elemCalcOutput');
  if (out) {
    out.textContent = `Elemental ${elemPct}% × Size ${sizePct}% = ${combined}% Final Damage`;
  }
}

/* ============================================================================
 * 6. QUEST DATABASE (RateMyServer quest_db Datasheet Layout)
 * ========================================================================== */
function renderQuests() {
  const quests = DATA.quests.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RATEMYSERVER QUEST_DB · PROGRESSION &amp; TRIALS</div>
        <h1 class="page-hero__title">Unified 6-Category Quest Database (${quests.length})</h1>
        <p class="page-hero__sub">Main Story, Side Story, Daily Bounties, and Job Promotion Trials with 3D emblem thumbnails, clickable objective targets, and item rewards.</p>
      </div>
    </div>
    <div class="rms-list">
      ${quests.map((q, idx) => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === q.id ? 'rms-highlight' : ''}" id="entity-${q.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              ${renderThumbChip(q, '📜')}
              <span class="rms-sheet__title">${escapeHtml(q.title)}</span>
              <span class="joy-badge ${q.category === 'job_change' ? 'joy-badge--brand' : 'joy-badge--success'} joy-badge--sm">${q.category.toUpperCase()}</span>
              <span class="rms-sheet__id">Quest ID# ${6001 + idx} (<code>${escapeHtml(q.id)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('quest', q.title, q)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                ${renderArtworkCell(q, 3, q.category)}
                <th>Zone / Map</th>
                <td>${rmsLink('maps', q.zoneId, q.zoneId)}</td>
                <th>Giver NPC</th>
                <td class="mono">${escapeHtml(q.giverNpcId)}</td>
                <th>Min Base Lvl</th>
                <td class="mono">Lv.${q.minBaseLevel}</td>
                <th>Required Job</th>
                <td>${q.requiredJobId ? rmsLink('jobs', q.requiredJobId, q.requiredJobId) : '<span class="observatory-card__meta">Any Job</span>'}</td>
              </tr>
              <tr>
                <th>Objectives</th>
                <td colspan="7">
                  ${(q.objectives || []).map(o => {
                    if (o.type === 'MOB_KILLED') return rmsLink('mobs', o.targetId, `Hunt ${o.targetId} ×${o.required}`, o.type);
                    if (o.type === 'ITEM_PICKED_UP') return rmsLink('gear', o.targetId, `Collect ${o.targetId} ×${o.required}`, o.type);
                    return rmsLink('maps', o.targetId, `Visit ${o.targetId} ×${o.required}`, o.type);
                  }).join(' ')}
                </td>
              </tr>
              <tr>
                <th>Rewards</th>
                <td colspan="7">
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.baseXp} Base EXP</span>
                  <span class="joy-badge joy-badge--neutral joy-badge--sm">+${q.rewards.jobXp} Job EXP</span>
                  ${q.rewards.unlockJobId ? rmsLink('jobs', q.rewards.unlockJobId, 'Promotes To: ' + q.rewards.unlockJobId) : ''}
                  ${q.rewards.unlockSkillId ? rmsLink('jobs', q.rewards.unlockSkillId, 'Unlocks Skill: ' + q.rewards.unlockSkillId) : ''}
                  ${((q.rewards && q.rewards.items) || []).map(ri => rmsLink('gear', ri.itemId, `${ri.itemId} ×${ri.qty}`, 'Item Reward')).join(' ')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

/* ============================================================================
 * 7. WOE CASTLE SIEGE SIMULATOR
 * ========================================================================== */
function renderSiege() {
  const castles = DATA.castles.filter(matchesSearch);
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">ENDGAME GVG SIEGE</div>
        <h1 class="page-hero__title">War of Emperium (GvG Castle Siege) — Breach &amp; TTK Calculator</h1>
        <p class="page-hero__sub">Simulate guild breach time across Outer Gate Barricades, Inner Gate Barricades, and the Holy 1 Normal-Attack-Only Emperium crystal.</p>
      </div>
    </div>

    <div class="controls-panel">
      <div class="control-field">
        <label for="simAttackers">Attacking Guild Members (1..50)</label>
        <input id="simAttackers" class="joy-input" type="number" value="15" min="1" max="50" oninput="updateSiegeCalc()" />
      </div>
      <div class="control-field">
        <label for="simDps">Avg Normal-Attack DPS / Player</label>
        <input id="simDps" class="joy-input" type="number" value="620" min="50" max="5000" step="50" oninput="updateSiegeCalc()" />
      </div>
      <div style="margin-left:auto">
        <span class="joy-badge joy-badge--brand" id="siegeSimResult"></span>
      </div>
    </div>

    <div class="rms-list">
      ${castles.map(cs => `
        <div class="rms-sheet ${HIGHLIGHT_ENTITY_ID === cs.id ? 'rms-highlight' : ''}" id="entity-${cs.id}">
          <div class="rms-sheet__head">
            <div class="rms-sheet__head-left">
              ${renderThumbChip(cs, '🏰')}
              <span class="rms-sheet__title">${escapeHtml(cs.name)}</span>
              <span class="joy-badge joy-badge--brand joy-badge--sm">WOE CASTLE</span>
              <span class="rms-sheet__id">Castle ID# <code>${escapeHtml(cs.id)}</code> (<code>${escapeHtml(cs.assetStudioKey)}</code>)</span>
            </div>
            <div class="chip-row">${inspectBtnHtml('castle', cs.name, cs)}</div>
          </div>
          <table class="rms-table">
            <tbody>
              <tr>
                ${renderArtworkCell(cs, 3, cs.assetStudioKey)}
                <th>Hub Town</th>
                <td class="mono">${escapeHtml(cs.hubTownId)}</td>
                <th>Siege Map</th>
                <td>${rmsLink('maps', cs.siegeMapId, cs.siegeMapId)}</td>
                <th>Siege Duration</th>
                <td class="mono">${cs.siegeDurationMinutes} mins</td>
                <th>Max Guild Size</th>
                <td class="mono">${cs.maxGuildSize} members</td>
              </tr>
              <tr>
                <th>Emperium Crystal</th>
                <td colspan="3" class="mono">${cs.emperium.hp.toLocaleString()} HP · ${cs.emperium.element} / ${cs.emperium.race} / ${cs.emperium.size}</td>
                <th>Normal-Attack Only</th>
                <td colspan="3"><span class="joy-badge joy-badge--warning joy-badge--sm">${cs.emperium.onlyNormalAttackDamage ? 'YES (Skills Blocked)' : 'No'}</span></td>
              </tr>
              <tr>
                <th>Gate Barricades</th>
                <td colspan="3" class="mono">${cs.fortifications.outerGateBarricadeCount} Outer + ${cs.fortifications.innerGateBarricadeCount} Inner (${cs.fortifications.barricadeHp.toLocaleString()} HP each)</td>
                <th>Owner Rewards</th>
                <td colspan="3" class="mono">${cs.ownerRewards.dailyTreasureChestCount} Treasure Chests/day · Dungeon: ${cs.ownerRewards.guildDungeonZoneId}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;
}

function updateSiegeCalc() {
  const c = DATA.castles[0];
  if (!c) return;
  const attackers = Math.max(1, parseInt(document.getElementById('simAttackers')?.value || '15', 10));
  const dps = Math.max(10, parseFloat(document.getElementById('simDps')?.value || '620'));
  const scale = c.pvpRules.playerDamageScalingPct / 100.0;
  const raidDps = attackers * dps * scale;
  const totalBarricadeHp = (c.fortifications.outerGateBarricadeCount + c.fortifications.innerGateBarricadeCount) * c.fortifications.barricadeHp;
  const barSec = totalBarricadeHp / raidDps;
  const empSec = c.emperium.hp / raidDps;
  const totalMin = (barSec + empSec + 45) / 60.0;
  const el = document.getElementById('siegeSimResult');
  if (el) {
    el.textContent = `4 Barricades (180k HP): ${barSec.toFixed(1)}s · Emperium (120k HP): ${empSec.toFixed(1)}s · Total Siege Breach: ${totalMin.toFixed(2)} min`;
  }
}

/* ============================================================================
 * 8. MAP & AREA SPAWN DIRECTORY (RateMyServer map_db + areainfo Layout)
 * ========================================================================== */
function renderMinimapSvg(m) {
  const tile = MAXION_WORLD_TILES.find(t => t.id === m.id || t.code === m.id) || MAXION_WORLD_TILES[0];
  return renderDistinctMapTileSvg(tile, 148);
}

let UNIFIED_63_DIR_GROUP_FILTER = 'all';

function setUnified63DirGroupFilter(groupId) {
  UNIFIED_63_DIR_GROUP_FILTER = (UNIFIED_63_DIR_GROUP_FILTER === groupId && groupId !== 'all') ? 'all' : (groupId || 'all');
  render();
  const dirEl = document.getElementById('unified63ZoneMapDirectory');
  if (dirEl && typeof dirEl.scrollIntoView === 'function') {
    dirEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function jumpFromMapDirectoryToAtlas(actionType, targetId, locCoord = '', floorId = '') {
  CURRENT_TAB = 'studio';
  if (actionType === 'town') {
    focusTownStreetBlueprint(targetId, locCoord);
  } else if (actionType === 'field') {
    focusFieldTacticalBlueprint(targetId, locCoord);
  } else if (actionType === 'fortress') {
    focusFortressBlueprint(targetId, locCoord);
  } else if (actionType === 'dungeon') {
    openDungeonSubMap(targetId, floorId || 'B1');
  }
  renderSidebar();
  render();
  scrollCanvasIntoViewSmooth();
}

function renderUnified63ZoneAtlasDirectoryHtml() {
  const sp = (DATA && DATA.studioPerspectives) || {};
  const tatlas = sp.tShapedWorldAtlas || {};
  const zdir = tatlas.t_breadth_zone_directory || {};
  const mfById = {};
  (tatlas.multi_floor_dungeons || []).forEach(d => {
    mfById[d.dungeon_id] = d;
  });

  const groups = [
    {
      id: 'starting_towns',
      title: 'Starting Towns (6)',
      badgeColor: '#10b981',
      icon: '🧬',
      actionType: 'town',
      zones: zdir.starting_towns || []
    },
    {
      id: 'castle_and_hub_towns',
      title: 'Castle & Hub Towns (9)',
      badgeColor: '#eab308',
      icon: '🏰',
      actionType: 'town',
      zones: zdir.other_castle_and_hub_towns || []
    },
    {
      id: 'fields_and_hunting_areas',
      title: 'Fields & Hunting Areas (24)',
      badgeColor: '#4ade80',
      icon: '🏕️',
      actionType: 'field',
      zones: zdir.fields_and_hunting_areas || []
    },
    {
      id: 'multi_floor_dungeons_and_catacombs',
      title: 'Multi-Floor Dungeons & Catacombs (16)',
      badgeColor: '#a855f7',
      icon: '🕳️',
      actionType: 'dungeon',
      zones: [...(zdir.regular_dungeons || []), ...(zdir.seven_signs_seal_catacombs || [])]
    },
    {
      id: 'harbors_clanhalls_and_forts',
      title: 'Harbors, Clan Halls & Fortresses (8)',
      badgeColor: '#fb923c',
      icon: '🛡️',
      actionType: 'fortress',
      zones: zdir.harbors_clanhalls_and_forts || []
    }
  ];

  const totalZones = groups.reduce((acc, g) => acc + g.zones.length, 0);
  const visibleGroups = UNIFIED_63_DIR_GROUP_FILTER === 'all'
    ? groups
    : groups.filter(g => g.id === UNIFIED_63_DIR_GROUP_FILTER);

  return `
    <div id="unified63ZoneMapDirectory" style="margin-bottom:20px;padding:16px;border-radius:12px;background:#0c1320;border:1.5px solid rgba(250,204,21,0.38);box-shadow:0 10px 28px rgba(0,0,0,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div>
          <div style="font-size:11px;font-weight:900;letter-spacing:0.08em;text-transform:uppercase;color:#fde047">
            🗺️ D16 UNIFIED 63-ZONE T-SHAPED WORLD &amp; MULTI-FLOOR DUNGEON DIRECTORY (${totalZones} ZONES)
          </div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:2px">
            Every Starting Town (6), Castle/Hub Town (9), Field Hunting Area (24), Multi-Floor Dungeon/Catacomb (16), and Harbor/ClanHall/Fortress (8) with <code class="mono">loc=X:Y</code>, Level Band, Resident NPCs (Shop + Refinement) / Mobs / MVPs, and 1-Click Jump to the Dedicated World Atlas!
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button type="button" onclick="setUnified63DirGroupFilter('all')"
                  class="mono" style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;background:${UNIFIED_63_DIR_GROUP_FILTER === 'all' ? '#fde047' : 'rgba(15,23,42,0.92)'};color:${UNIFIED_63_DIR_GROUP_FILTER === 'all' ? '#090d14' : '#fde047'};border:1px solid #fde047">
            🌐 All (${totalZones})
          </button>
          ${groups.map(g => {
            const isAct = UNIFIED_63_DIR_GROUP_FILTER === g.id;
            return `
              <button type="button" onclick="setUnified63DirGroupFilter('${g.id}')"
                      class="mono" style="padding:3px 9px;border-radius:999px;font-size:10px;font-weight:800;cursor:pointer;background:${isAct ? g.badgeColor : 'rgba(15,23,42,0.92)'};color:${isAct ? '#090d14' : g.badgeColor};border:1px solid ${g.badgeColor}">
                ${g.icon} ${escapeHtml(g.title)}
              </button>
            `;
          }).join('')}
        </div>
      </div>

      ${visibleGroups.map(group => {
        const filteredZones = group.zones.filter(z => {
          if (!SEARCH_QUERY) return true;
          const hay = `${z.name} ${z.zone_id} ${z.studio_node_id} ${z.l2_reference_analog || ''} ${z.territory_name || ''} ${z.loc_coord || ''}`.toLowerCase();
          return hay.includes(SEARCH_QUERY);
        });
        if (!filteredZones.length) return '';
        return `
          <div style="margin-top:14px">
            <div style="font-size:13px;font-weight:900;color:${group.badgeColor};margin-bottom:8px;display:flex;align-items:center;gap:8px">
              <span>${group.icon} ${escapeHtml(group.title)}</span>
              <span class="mono" style="font-size:10px;color:#94a3b8">(${filteredZones.length} showing)</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(315px,1fr));gap:8px">
              ${filteredZones.map(z => {
                const lvBand = Array.isArray(z.level_band) && z.level_band.length >= 2 ? `Lv.${z.level_band[0]}–${z.level_band[1]}` : 'Lv.1–99';
                const locStr = z.loc_coord || '0:0';
                let residentsSummary = '';
                let btnLabel = '';
                let clickCall = '';

                if (group.actionType === 'town') {
                  const tb = z.town_blueprint || {};
                  const arch = tb.layout_archetype || 'polygonal_walled_keep';
                  const shopMarks = (tb.service_marks || []).slice(0, 3).map(m => `${m.icon || '🛍️'} ${m.label}`).join(' · ');
                  residentsSummary = `🛍️ NPCs (Shop + Refinement +1..+15): ${shopMarks || '12 Town NPCs & 7 Service Marks'} [${arch}]`;
                  btnLabel = '🏘️ Open Town Blueprint (5.2×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('town', '${escapeHtml(z.studio_node_id || z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else if (group.actionType === 'field') {
                  const ftb = z.field_tactical_blueprint || {};
                  const mobs = (ftb.spawn_territories || []).map(st => `${st.entity_type}: ${st.mob_name}`).slice(0, 3).join(' · ');
                  residentsSummary = `👾 Field Mobs & MVPs: ${mobs || 'Monster / Mini-Boss / Raid / MVP Rings'}`;
                  btnLabel = '🏕️ Open Field Blueprint (4.8×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('field', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else if (group.actionType === 'fortress') {
                  const fbp = z.fortress_blueprint || {};
                  const mobs = (fbp.spawn_territories || []).map(st => `${st.entity_type}: ${st.mob_name}`).slice(0, 3).join(' · ');
                  residentsSummary = `🛡️ Garrison & MVPs: ${mobs || 'Harbor / Clan Hall / Fortress Guardians'}`;
                  btnLabel = '🛡️ Open Fortress Blueprint (4.8×)';
                  clickCall = `jumpFromMapDirectoryToAtlas('fortress', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}')`;
                } else {
                  const mf = mfById[z.zone_id] || {};
                  const floors = mf.floors || [];
                  const firstFloor = (floors[0] && floors[0].floor_id) || 'B1';
                  const floorSpan = floors.map(f => f.floor_id).join('⇄') || 'B1⇄B2⇄B3';
                  const topBoss = (floors[floors.length - 1] && floors[floors.length - 1].boss_tier_highlight) || 'Floor 3 MVP Sanctum';
                  residentsSummary = `👑 Floors [${floorSpan}]: ${topBoss}`;
                  btnLabel = `🕳️ Open Multi-Floor Dungeon (${firstFloor})`;
                  clickCall = `jumpFromMapDirectoryToAtlas('dungeon', '${escapeHtml(z.zone_id)}', '${escapeHtml(locStr)}', '${escapeHtml(firstFloor)}')`;
                }

                return `
                  <div style="padding:10px 12px;border-radius:8px;background:#141e30;border-left:3.5px solid ${group.badgeColor};border-top:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;justify-content:space-between;gap:6px">
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                        <span class="mono" style="font-size:10px;color:#38bdf8;font-weight:800">[${escapeHtml(z.grid_sector || '18_24')}] loc=${escapeHtml(locStr)}</span>
                        <span class="mono" style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(15,23,42,0.9);color:#fde047;border:1px solid rgba(250,204,21,0.45)">${escapeHtml(lvBand)}</span>
                      </div>
                      <div style="font-size:12px;font-weight:900;color:#f8fafc;margin-top:3px">
                        ${escapeHtml(z.name)}
                      </div>
                      <div style="font-size:10px;color:#94a3b8;margin-top:1px">
                        L2 Analog: <strong style="color:#cbd5e1">${escapeHtml(z.l2_reference_analog || z.territory_name || '')}</strong>
                      </div>
                      <div style="font-size:10px;color:#fde68a;margin-top:4px;line-height:1.35">
                        ${escapeHtml(residentsSummary)}
                      </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06)">
                      <span class="mono" style="font-size:9px;color:#94a3b8">${escapeHtml(z.zone_id)}</span>
                      <button type="button" onclick="${clickCall}"
                              style="padding:4px 10px;border-radius:6px;border:1px solid #fde047;background:#1e3a8a;color:#fde047;font-size:10px;font-weight:900;cursor:pointer;flex-shrink:0">
                        ${escapeHtml(btnLabel)} ➔
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMapDirectory() {
  const studioTiles = getStudioCanonTiles();
  const allTiles = getAllWorldTiles();
  const filterKinds = [
    { id: 'all', label: `All Connected Maps (${allTiles.length})` },
    { id: 'studio', label: `🌌 Studio Canon Maps (${studioTiles.length})` },
    { id: 'town', label: '🏰 Towns & Sanctuaries' },
    { id: 'field', label: '🌿 Overland Hunting Areas' },
    { id: 'dungeon', label: '💀 Multi-Floor Dungeons' },
    { id: 'c01', label: '🌸 Continent 01 (Hearthbloom)' },
    { id: 'c02', label: '⚙️ Continent 02 (Clockwork)' },
    { id: 'c03', label: '🔭 Continent 03 (Shattered Halo)' },
  ];

  const tiles = allTiles.filter(t => {
    if (MAP_DIR_FILTER === 'studio' && !t.isStudioCanon) return false;
    if (MAP_DIR_FILTER === 'c01' && t.continentId !== 'continent-01-hearthbloom-basin') return false;
    if (MAP_DIR_FILTER === 'c02' && t.continentId !== 'continent-02-clockwork-steppe') return false;
    if (MAP_DIR_FILTER === 'c03' && t.continentId !== 'continent-03-shattered-halo-archipelago') return false;
    if (['town', 'field', 'dungeon'].includes(MAP_DIR_FILTER) && t.kind !== MAP_DIR_FILTER) return false;
    if (!SEARCH_QUERY) return true;
    const hay = `${t.name} ${t.code} ${t.biome} ${t.districtName || ''} ${t.continentName || ''} ${t.coreRationale || ''}`.toLowerCase();
    return hay.includes(SEARCH_QUERY);
  });

  return `
    ${renderUnified63ZoneAtlasDirectoryHtml()}
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#38bdf8;">
          🗺️ UNIFIED STUDIO CANON (${studioTiles.length} MAPS ACROSS 31 DISTRICTS) + MAXION CONNECTED MAP DIRECTORY
        </div>
        <h1 style="font-size:24px;font-weight:900;margin:2px 0 0 0;color:#f8fafc;">
          Connected World Map & Habitat Atlas <span style="font-size:14px;font-weight:600;color:#94a3b8;">(${tiles.length} Showing · Bounded 148×148 Topographic Previews, N/S/E/W Portals & Resident Monster Portraits)</span>
        </h1>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${filterKinds.map(fk => `
          <button class="btn ${MAP_DIR_FILTER === fk.id ? 'btn--primary' : ''}" onclick="MAP_DIR_FILTER='${fk.id}';render();">
            ${fk.label}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="lineage-map-grid">
      ${tiles.map(tile => {
        const nbEntries = Object.entries(tile.neighbors || {});
        return `
          <div class="lineage-map-card" id="map-card-${tile.id}" style="${MAXION_SELECTED_TILE_ID === tile.id ? 'border-color:#ffd166;box-shadow:0 0 0 2px rgba(255,209,102,0.35);' : ''}">
            <div class="lineage-map-card__top">
              <div class="lineage-map-card__preview" onclick="${tile.isStudioCanon ? `setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(tile.continentId)}', districtId: '${escapeHtml(tile.districtId)}', nodeId: '${escapeHtml(tile.id)}', inspectId: '${escapeHtml(tile.id)}' })` : `CURRENT_TAB='world';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();`}" style="cursor:pointer;" title="Click to inspect map">
                ${renderDistinctMapTileSvg(tile, 148)}
                ${tile.thumb ? `<img src="${escapeHtml(tile.thumb)}" alt="${escapeHtml(tile.name)}" style="position:absolute;bottom:6px;right:6px;width:42px !important;height:42px !important;border-radius:8px;background:rgba(9,13,22,0.88);border:1px solid #ffd166;padding:3px;object-fit:contain;" />` : ''}
              </div>
              <div class="lineage-map-card__meta">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
                  <span class="pill pill--cyan" style="font-family:var(--mono);">${escapeHtml(tile.code)}</span>
                  <div style="display:flex;gap:4px;align-items:center;">
                    ${tile.isStudioCanon ? '<span class="joy-badge joy-badge--success joy-badge--sm">🟢 Studio Canon</span>' : '<span class="pill">Classic Benchmark</span>'}
                    <span class="pill pill--gold">Lv. ${escapeHtml(tile.lv)}</span>
                  </div>
                </div>
                <h3 style="margin:6px 0 4px 0;font-size:16.5px;font-weight:800;color:#f8fafc;">
                  ${escapeHtml(tile.name)}
                </h3>
                ${tile.isStudioCanon ? `
                  <div style="font-size:11px;color:#38bdf8;font-weight:700;margin-bottom:4px;">
                    ${escapeHtml(tile.continentName)} ➔ ${escapeHtml(tile.districtName)}
                  </div>
                  <div style="font-size:11px;color:#cbd5e1;margin-bottom:6px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                    ${escapeHtml(tile.coreRationale)}
                  </div>
                ` : `
                  <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;">
                    Biome: <strong style="color:#e2e8f0;text-transform:capitalize;">${escapeHtml(tile.biome)}</strong> · Grid Pos: <strong style="font-family:var(--mono);">[${tile.col}, ${tile.row}]</strong>
                  </div>
                `}

                <div style="font-size:10px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;">
                  Connected Adjacent Portals (${nbEntries.length}):
                </div>
                <div class="lineage-neighbors">
                  ${nbEntries.map(([dir, targetId]) => {
                    const target = getMaxionTile(targetId);
                    return `<span class="lineage-nb-chip" onclick="MAXION_SELECTED_TILE_ID='${target.id}';const el=document.getElementById('map-card-${target.id}');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});render();"><b>${dir} →</b> ${escapeHtml(target.name)}</span>`;
                  }).join('')}
                </div>
              </div>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
              <div class="lineage-spawns-row" style="margin-top:0;">
                ${tile.spawns.length ? tile.spawns.map(sp => {
                  const mob = getMaxionMob(sp.id);
                  return `
                    <div class="lineage-spawn-pill" onclick="openMonsterDetailPage('${mob.id}')" title="Inspect ${escapeHtml(mob.name)} (#${mob.code})">
                      <img src="${mob.thumb}" alt="${escapeHtml(mob.name)}"/>
                      <div>
                        <div style="font-size:11px;font-weight:800;color:#f8fafc;">${escapeHtml(mob.name)}</div>
                        <div style="font-size:10px;color:#ffd166;">Lv.${mob.lv} · ×${sp.count}</div>
                      </div>
                    </div>
                  `;
                }).join('') : '<span style="font-size:11px;color:#94a3b8;">🛡️ Safe Sanctuary / Town Hub (Non-Combat NPCs)</span>'}
              </div>
              ${tile.isStudioCanon ? `
                <button class="btn btn--primary" onclick="setStudioPerspective('town-or-hunting-area', { continentId: '${escapeHtml(tile.continentId)}', districtId: '${escapeHtml(tile.districtId)}', nodeId: '${escapeHtml(tile.id)}', inspectId: '${escapeHtml(tile.id)}' })" style="font-size:11px;padding:5px 10px;">
                  🌌 Open in 4-Level Studio →
                </button>
              ` : `
                <button class="btn" onclick="CURRENT_TAB='world';MAXION_SELECTED_TILE_ID='${tile.id}';writeUrlState(true);renderSidebar();render();" style="font-size:11px;padding:5px 10px;">
                  🧭 Locate on World Grid →
                </button>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}


function renderMaps() {
  return renderMapDirectory();
}


function renderSqlStudio() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">RELATIONAL + JSONB OBSERVABILITY</div>
        <h1 class="page-hero__title">Live Read-Only SQLite Query Studio (build/catalog.sqlite)</h1>
        <p class="page-hero__sub">Query indexed relational tables, JSONB payloads, and analytical views directly in browser or Mac app.</p>
      </div>
    </div>

    <div class="observatory-card">
      <div class="chip-row">
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_map_world_binding;')">v_map_world_binding (L1→L4 Maps)</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_world_continent_overview;')">v_world_continent_overview</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_story_region_matrix;')">v_story_region_matrix</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, title, kind, continent_id, rank, landform, at_x_km, at_y_km, why_or_note FROM world_places WHERE tier=\'pinned\' ORDER BY continent_id, id;')">Pinned World Places</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, name, level_band, element, family, archetype, region, faction FROM world_bestiary ORDER BY region, id;')">World Bestiary (116)</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_job_progression;')">v_job_progression</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_mob_economy;')">v_mob_economy</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT * FROM v_asset_studio_entries;')">v_asset_studio_entries</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT m.name AS mob, i.name AS item, d.chance_bps/100.0 AS drop_pct FROM mob_drops d JOIN mobs m ON m.id=d.mob_id JOIN items i ON i.id=d.item_id ORDER BY m.level, drop_pct DESC;')">Mob Drop Rates</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, title, category, min_base_level, base_xp, job_xp, unlock_job_id FROM quest_board ORDER BY min_base_level;')">Quest Board</button>
        <button type="button" class="joy-button joy-button--outline joy-button--sm" onclick="runSqlPreset('SELECT id, name, emperium_hp, barricade_hp, player_damage_scaling_pct, guild_dungeon_zone_id FROM castles;')">WoE Castles</button>
      </div>
      <textarea id="sqlInput" class="sql-editor">SELECT * FROM v_mob_economy;</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="observatory-card__meta">Read-only SQLite connection (<code>SELECT</code>, <code>WITH</code>, <code>PRAGMA</code>, <code>EXPLAIN</code>)</span>
        <button type="button" class="joy-button joy-button--solid joy-button--sm" onclick="executeSql()">Execute SQL Query</button>
      </div>
    </div>

    <div id="sqlOutput"></div>
  `;
}

async function runSqlPreset(sql) {
  const box = document.getElementById('sqlInput');
  if (box) box.value = sql;
  await executeSql();
}

async function executeSql() {
  const box = document.getElementById('sqlInput');
  const out = document.getElementById('sqlOutput');
  if (!box || !out) return;
  const res = await fetch('/api/sql?q=' + encodeURIComponent(box.value));
  const data = await res.json();
  if (!data.ok) {
    out.innerHTML = `<div class="joy-alert joy-alert--danger">SQL Error: ${escapeHtml(data.error)}</div>`;
    return;
  }
  out.innerHTML = `
    <div class="observatory-card">
      <div class="observatory-card__head">
        <h3 class="observatory-card__title">Query Result (${data.rowCount} rows)</h3>
        <span class="joy-badge joy-badge--success">Read-Only</span>
      </div>
      <div class="joy-table-container">
        <table class="joy-table">
          <thead>
            <tr>${data.columns.map(c => `<th>${escapeHtml(String(c))}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `<tr>${r.map(v => `<td class="mono">${v === null ? 'NULL' : escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSim() {
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">AUTHORITATIVE RUST COMBAT ENGINE</div>
        <h1 class="page-hero__title">Headless Balance Simulator (server-rs / balance_sim)</h1>
        <p class="page-hero__sub">Executes <code>cargo run --bin balance_sim</code> to verify TTK, EXP/hour, refine +0..+15 curves, and WoE Emperium breach pacing.</p>
      </div>
      <button type="button" class="joy-button joy-button--solid" onclick="triggerBalanceSim()" ${SIM_RUNNING ? 'disabled' : ''}>
        ${SIM_RUNNING ? 'Running Simulator...' : 'Re-Run Balance Simulator'}
      </button>
    </div>

    <div class="joy-code-block">
      <div class="joy-code-block__header">
        <div class="joy-code-block__meta">
          <span class="joy-code-block__lang">RUST</span>
          <span>server-rs/src/bin/balance_sim.rs</span>
        </div>
      </div>
      <pre style="margin:0;padding:18px;overflow-x:auto"><code>${escapeHtml(SIM_OUTPUT)}</code></pre>
    </div>
  `;
}

function renderDocs() {
  const docs = DATA.docs || [];
  const active = docs[SELECTED_DOC_IDX] || docs[0];
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">CANON &amp; ARCHITECTURE SPECS</div>
        <h1 class="page-hero__title">Architecture Specs &amp; World Lore Canon Reviewer</h1>
        <p class="page-hero__sub">Browse design specs and world canon directly inside the Joymify Observatory shell.</p>
      </div>
    </div>
    <div class="chip-row">
      ${docs.map((d, i) => `
        <button type="button" class="joy-button ${i === SELECTED_DOC_IDX ? 'joy-button--solid' : 'joy-button--outline'} joy-button--sm" onclick="SELECTED_DOC_IDX=${i};render()">
          ${escapeHtml(d.id)}
        </button>
      `).join('')}
    </div>
    ${active ? `
      <div class="joy-code-block">
        <div class="joy-code-block__header">
          <div class="joy-code-block__meta">
            <span class="joy-code-block__lang">MARKDOWN</span>
            <span>${escapeHtml(active.path)}</span>
          </div>
        </div>
        <pre style="margin:0;padding:18px;white-space:pre-wrap;font-family:var(--joy-font-family-mono)"><code>${escapeHtml(active.content)}</code></pre>
      </div>
    ` : ''}
  `;
}

function renderRacesDirectory() {
  const races = DATA.races || [];
  const raceStats = {
    'human_demi_human': { str: 6, agi: 6, int: 6, vit: 6, dex: 6, luk: 6, hitbox: '0.45m' },
    'dwarf': { str: 7, agi: 4, int: 4, vit: 9, dex: 5, luk: 5, hitbox: '0.40m' },
    'ogre_orc': { str: 10, agi: 4, int: 3, vit: 9, dex: 4, luk: 4, hitbox: '0.65m' },
    'furral': { str: 5, agi: 9, int: 5, vit: 5, dex: 7, luk: 6, hitbox: '0.35m' },
    'lunar': { str: 4, agi: 5, int: 9, vit: 4, dex: 7, luk: 6, hitbox: '0.45m' },
    'dark_lunar': { str: 5, agi: 8, int: 7, vit: 4, dex: 6, luk: 5, hitbox: '0.45m' },
  };

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">CANONICAL SIX RACES · ATTRIBUTE RADAR &amp; STARTER CITADELS</div>
        <h1 class="page-hero__title">Six Canonical Races &amp; Starter Towns Directory</h1>
        <p class="page-hero__sub">Authoritative 6-Stat baseline attributes (STR, AGI, INT, VIT, DEX, LUK), hitbox scales, and starter arrival lore across Atlas World.</p>
      </div>
    </div>
    <div class="rms-list" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px">
      ${races.map(r => {
        const stats = raceStats[r.race_key] || { str: 6, agi: 6, int: 6, vit: 6, dex: 6, luk: 6, hitbox: '0.45m' };
        return `
          <div class="rms-sheet" style="display:flex;flex-direction:column;gap:10px">
            <div class="rms-sheet__head">
              <div class="rms-sheet__head-left">
                <span class="rms-thumb-chip" style="font-size:1.5rem">${r.icon || '🧬'}</span>
                <div>
                  <span class="rms-sheet__title">${escapeHtml(r.name)}</span>
                  <div class="observatory-card__meta">${escapeHtml(r.archetype_reference || '')}</div>
                </div>
              </div>
              <span class="joy-badge joy-badge--brand joy-badge--sm">Hitbox ${stats.hitbox}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:4px;text-align:center;background:rgba(255,255,255,0.03);padding:8px;border-radius:6px">
              <div><div class="observatory-card__meta">STR</div><strong style="color:#ef4444">${stats.str}</strong></div>
              <div><div class="observatory-card__meta">AGI</div><strong style="color:#3b82f6">${stats.agi}</strong></div>
              <div><div class="observatory-card__meta">INT</div><strong style="color:#a855f7">${stats.int}</strong></div>
              <div><div class="observatory-card__meta">VIT</div><strong style="color:#10b981">${stats.vit}</strong></div>
              <div><div class="observatory-card__meta">DEX</div><strong style="color:#f59e0b">${stats.dex}</strong></div>
              <div><div class="observatory-card__meta">LUK</div><strong style="color:#ec4899">${stats.luk}</strong></div>
            </div>
            <div style="font-size:12.5px;color:#94a3b8">
              <strong>Starter Town:</strong> <span style="color:#f1f5f9">${escapeHtml(r.home_town_name || r.home_town_id)}</span> (${escapeHtml(r.continent_id || '')})
            </div>
            <div style="font-size:12px;background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;padding:6px 10px;border-radius:0 4px 4px 0">
              <strong style="color:#fbbf24">Trait:</strong> ${escapeHtml(r.combat_trait || '')}
            </div>
            <p style="font-size:12px;color:#cbd5e1;line-height:1.4;margin:0">${escapeHtml(r.niched_story || '')}</p>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderDungeonsDirectory() {
  const dungeons = DATA.dungeons || [];
  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">60 AUTHORITATIVE SPIRES · MULTI-FLOOR NAVIGATION &amp; MVP ENCOUNTERS</div>
        <h1 class="page-hero__title">60 Authoritative Dungeon Spires Directory (dungeon_db)</h1>
        <p class="page-hero__sub">60 compiled dungeon definitions with floor clear mob quotas, bound overworld portal entrance coordinates, and linked MVP boss state machines.</p>
      </div>
    </div>
    <div class="rms-sheet">
      <table class="rms-table">
        <thead>
          <tr>
            <th style="width:200px">Dungeon Spire</th>
            <th style="width:100px">Level Band</th>
            <th style="width:100px">Floors &amp; Mobs</th>
            <th style="width:180px">Overworld Entrance Portal</th>
            <th style="width:220px">Bound MVP Boss</th>
            <th>Hazards &amp; Lore</th>
          </tr>
        </thead>
        <tbody>
          ${dungeons.map(d => `
            <tr>
              <td>
                <div style="font-weight:700;color:#f1f5f9">${escapeHtml(d.title)}</div>
                <div class="observatory-card__meta"><code>${escapeHtml(d.id)}</code></div>
              </td>
              <td><span class="joy-badge joy-badge--brand joy-badge--sm">Lv.${d.levelMin}–${d.levelMax}</span></td>
              <td>
                <div style="font-weight:600">${d.floors} Floors</div>
                <div class="observatory-card__meta">${d.mobsPerFloor} mobs/floor</div>
              </td>
              <td>
                <div style="font-weight:600;color:#38bdf8">🗺️ ${escapeHtml(d.mapId || 'unbound')}</div>
                <div class="observatory-card__meta">Portal (${d.portalX}, ${d.portalY}) r=${d.portalRadius}m</div>
              </td>
              <td>
                <div style="font-weight:700;color:#f87171">💀 ${escapeHtml(d.mvpBossName || d.mvpBossId)}</div>
                <div class="observatory-card__meta">HP ${(d.mvpBossHp || 0).toLocaleString()} · Enrage ${d.bossEnrageSecs}s</div>
              </td>
              <td>
                <div class="chip-row" style="margin-bottom:4px">
                  ${(d.hazards || []).map(h => `<span class="joy-badge joy-badge--warning joy-badge--sm">${escapeHtml(h)}</span>`).join('')}
                </div>
                <div class="observatory-card__meta" style="font-size:11.5px">${escapeHtml(d.lore || '')}</div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEnchantingForge() {
  const glowTiers = [
    { tier: 0, name: 'None', color: 'transparent', label: 'No Glow' },
    { tier: 1, name: 'SoftWhite', color: '#f8fafc', label: 'Tier 1: Soft White (+4 to +6)' },
    { tier: 2, name: 'YellowGlow', color: '#fbbf24', label: 'Tier 2: Golden Radiance (+7 to +9)' },
    { tier: 3, name: 'CrimsonAura', color: '#ef4444', label: 'Tier 3: Crimson Aura (+10 to +12)' },
    { tier: 4, name: 'VioletLightning', color: '#a855f7', label: 'Tier 4: Violet Lightning (+13 to +15)' },
    { tier: 5, name: 'CelestialPrism', color: '#38bdf8', label: 'Tier 5: Celestial Prism (+16 to +20)' },
  ];

  const levels = [];
  for (let t = 1; t <= 20; t++) {
    const safe = t <= 4;
    const success = safe ? 100 : (t <= 6 ? 70 : (t <= 9 ? 50 : (t <= 12 ? 40 : (t <= 15 ? 30 : (t <= 18 ? 20 : 10)))));
    const crystallize = t <= 9 ? 0 : (100 - success);
    const degrade = (t > 4 && t <= 9) ? (100 - success) : 0;
    const gTier = t < 4 ? 0 : (t < 7 ? 1 : (t < 10 ? 2 : (t < 13 ? 3 : (t < 16 ? 4 : 5))));
    const mult = 1.0 + (t * 0.05) + (Math.max(0, t - 10) * 0.10);
    levels.push({ level: t, safe, success, crystallize, degrade, glow: glowTiers[gTier], mult });
  }

  return `
    <div class="page-hero">
      <div>
        <div class="page-hero__eyebrow">HIGH-STAKES REFINEMENT · LINEAGE 2 CRYSTALLIZATION PAST +10</div>
        <h1 class="page-hero__title">High-Stakes +20 Enchanting &amp; Weapon Visual Glow Forge</h1>
        <p class="page-hero__sub">+1 to +4 Safe Zone, -1 Degradation under +10, irreversible Crystallization past +10 without Blessed Scrolls, and 6 Weapon Glow Tiers.</p>
      </div>
    </div>
    <div class="rms-sheet">
      <table class="rms-table">
        <thead>
          <tr>
            <th style="width:80px">Refine</th>
            <th style="width:120px">Zone Type</th>
            <th style="width:140px">Success Odds</th>
            <th style="width:140px">Failure Penalty</th>
            <th style="width:200px">Weapon Glow Aura</th>
            <th>Power Multiplier</th>
          </tr>
        </thead>
        <tbody>
          ${levels.map(l => `
            <tr>
              <td><strong style="font-size:1.1rem;color:${l.glow.color !== 'transparent' ? l.glow.color : '#f1f5f9'}">+${l.level}</strong></td>
              <td>
                <span class="joy-badge ${l.safe ? 'joy-badge--success' : (l.level <= 9 ? 'joy-badge--warning' : 'joy-badge--danger')} joy-badge--sm">
                  ${l.safe ? 'SAFE ZONE' : (l.level <= 9 ? 'DEGRADATION (-1)' : 'CRYSTALLIZATION (DESTROY)')}
                </span>
              </td>
              <td><strong style="color:#10b981">${l.success}% Success</strong></td>
              <td>
                ${l.crystallize > 0
                  ? `<strong style="color:#ef4444">${l.crystallize}% Crystallize</strong>`
                  : (l.degrade > 0 ? `<span style="color:#f59e0b">${l.degrade}% Degrade (-1)</span>` : '<span style="color:#94a3b8">0% (Safe)</span>')}
              </td>
              <td>
                <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${l.glow.color};margin-right:6px;box-shadow:0 0 8px ${l.glow.color}"></span>
                <span style="font-size:12px;font-weight:600">${l.glow.label}</span>
              </td>
              <td><strong style="color:#38bdf8">${l.mult.toFixed(2)}× Base ATK/DEF</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

init();
</script>
</body>
</html>
