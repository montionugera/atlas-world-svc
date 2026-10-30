// Lore & History model engine — SSOT transformation from studio JSON to presentation model.
// Enforces name remapping from name-map.json, guarantees no 'undefined' strings,
// matches concept art by loreRef/zoneId, and keeps open mysteries teasing without spoilers.

export const NAME_MAP = Object.freeze({
  "Keltir": "Cinder-Vixen",
  "Prairie Keltir": "Clover Cinder-Vixen",
  "Young Prairie Keltir": "Cinder-Vixen Kit",
  "Dominant Prairie Keltir": "Alpha Cinder-Vixen",
  "Elpy": "Tuff-Hare",
  "Grey Elpy": "Ash-Eared Tuff-Hare",
  "Gludin": "Cinderport",
  "Talking Island": "Lantern Cradle",
  "Queen Ant": "Ash-Brood Matriarch",
  "Ant Nest": "Slag-Brood Warren",
  "Adena": "Hearth-Mark",
  "Soulshot": "Hearth-Spark Charge",
  "Spiritshot": "Glaze-Resonance Charge",
  "Einhovant": "Solenne",
  "Biotin": "Vespera",
  "Roxxy": "Lumina",
  "Gilbert": "Bramwell",
  "Altran": "Torvin",
  "Lector": "Garrick",
  "Silvia": "Maris",
  "Bitz": "Korrigan",
  "Dre Vanul": "Vitrified Bound-Fiend",
  "Vanul": "Bound-Fiend",
  "Cedric": "Alden",
  "Rant": "Brammel",
  "Leon": "Sorrel",
  "Arnold": "Doran",
  "Ambra": "Rowan",
  "Bixon": "Tarkin",
  "Siff": "Vaelen",
  "Tunath": "Cinder-Tusk",
  "Muertos": "Soot-Brand",
  "Nahir": "Pyroth",
  "Monster Eye": "Glaze-Oculus",
  "Elven Ruins": "First-Kiln Vaults",
  "Elven Long Sword": "First-Kiln Longblade",
  "Staff of Life": "Hearth-Bloom Crozier",
  "Manticore": "Scoria-Drake",
  "Salamander": "Flue-Newt",
  "Undine": "Cistern-Nymph",
  "Orichalcum": "Hearth-Brass",
  "Soul Crystal": "Seal-Prism",
  "Tontatta": "dwarf",
});

// Sorted by length descending so longer compound phrases match before single-word subsets
const SORTED_KEYS = Object.keys(NAME_MAP).sort((a, b) => b.length - a.length);
const ESCAPED_KEYS = SORTED_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const NAME_MAP_REGEX = new RegExp(`\\b(${ESCAPED_KEYS.join("|")})\\b`, "g");

/**
 * Replaces any renamed Lineage II / legacy name in text with its canonical Atlas World name.
 * Uses word boundaries to avoid partial substring corruption.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function applyNameMap(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(NAME_MAP_REGEX, (match) => NAME_MAP[match] || match)
    .replace(/Ash-Brood Matriarch\s+Ash-Brood\b/g, "Ash-Brood Matriarch")
    .replace(/\bDwarf\s*\(dwarf-Lineage\b/gi, "Dwarf (Root-Forged")
    .replace(/\bOne Piece\s+dwarf-inspired\b/gi, "Compact root-forged")
    .replace(/\bOne Piece\s+Mink-inspired\b/gi, "Galvanic")
    .replace(/\bOne Piece\s+/gi, "")
    .replace(/\bdwarf-inspired\b/gi, "compact artisan")
    .replace(/\bMink-inspired\b/gi, "Galvanic")
    .replace(/\bSulong\b/gi, "Galvanic")
    .replace(/^dwarf\s+Mighty\b/i, "Dwarven Mighty")
    .replace(/\bfenrir-kael\b/g, "Fenrir-Kael")
    .replace(/\(Core\s*—\s*Prime Governor\)/g, "(Prime Escapement Governor)")
    .replace(/\bCore's Escapement Ring\b/g, "Governor's Escapement Ring")
    .replace(/\bCatherok\b/gi, "Brass-Spur")
    .replace(/\bPorta\b/gi, "Gear-Ward")
    .replace(/\bExcuro\b/gi, "Escapement")
    .replace(/\bCruma\b/gi, "Mainspring")
    .replace(/\bOriharukon\b/gi, "Hearth-Brass");
}

/**
 * Recursively sanitizes data, ensuring all strings are mapped and undefined/null are handled cleanly.
 */
export function sanitize(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return applyNameMap(val);
  if (Array.isArray(val)) return val.map(sanitize);
  if (typeof val === "object") {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = sanitize(v);
    }
    return res;
  }
  return val;
}

/**
 * Matches concept art items by loreRef, zoneId, or id.
 * @param {{ items?: Array<any> }|null|undefined} conceptArtIndex
 * @param {{ loreRef?: string, zoneId?: string, id?: string }} filter
 * @returns {Array<any>}
 */
export function matchConceptArt(conceptArtIndex, { loreRef = "", zoneId = "", id = "" } = {}) {
  if (!conceptArtIndex || !Array.isArray(conceptArtIndex.items)) return [];
  return conceptArtIndex.items.filter((item) => {
    if (!item) return false;
    if (loreRef && item.loreRef === loreRef) return true;
    if (zoneId && item.zoneId === zoneId) return true;
    if (id && item.id === id) return true;
    return false;
  });
}

export const CHAPTERS = Object.freeze([
  { id: "premise", label: "Arrival Premise", icon: "✨", anchor: "lore-chapter-premise" },
  { id: "epochs", label: "Historical Epochs", icon: "⏳", anchor: "lore-chapter-epochs" },
  { id: "gods", label: "Architect & Gods", icon: "🏛️", anchor: "lore-chapter-gods" },
  { id: "races", label: "Mortal Lineages", icon: "👥", anchor: "lore-chapter-races" },
  { id: "continents", label: "Continents & Scars", icon: "🗺️", anchor: "lore-chapter-continents" },
  { id: "bosses", label: "Boss Hierarchy", icon: "⚔️", anchor: "lore-chapter-bosses" },
  { id: "mysteries", label: "Open Mysteries", icon: "🔮", anchor: "lore-chapter-mysteries" },
]);

/**
 * Builds the comprehensive presentation model from studio JSON artifacts.
 * @param {{
 *   worldHistory?: any,
 *   atlas?: any,
 *   continents?: Array<any>,
 *   conceptArtIndex?: any
 * }|null|undefined} inputs
 */
export function buildLoreModel(inputs) {
  if (!inputs || typeof inputs !== "object") {
    return {
      premise: { title: "Arrival Premise", playerIdentity: "", whyEnterWorld: "", incitingPhenomenon: "", coreRationale: "", arts: [] },
      epochs: [],
      gods: { all: [], architect: null, sealedGods: [] },
      races: [],
      continents: [],
      bossLadder: { strictOrderLaw: "", tiers: [], chains: [] },
      mysteries: { summary: "", items: [] },
      stats: { epochCount: 0, godCount: 0, raceCount: 0, continentCount: 0, bossChainCount: 0, mysteryCount: 0 },
    };
  }

  const { worldHistory = {}, atlas = {}, continents = [], conceptArtIndex = null } = inputs;
  const rawContinents = Array.isArray(continents) ? continents : Object.values(continents);

  // 1. Premise
  const rawPremise = worldHistory.player_arrival_premise || {};
  const premise = {
    title: "Player Arrival Premise",
    playerIdentity: applyNameMap(rawPremise.player_identity || ""),
    whyEnterWorld: applyNameMap(rawPremise.why_enter_world || ""),
    incitingPhenomenon: applyNameMap(rawPremise.inciting_phenomenon || ""),
    coreRationale: applyNameMap(worldHistory.core_rationale || ""),
    arts: matchConceptArt(conceptArtIndex, { loreRef: "premise" }),
  };

  // 2. Epochs (1.1 to 1.4)
  const rawEpochs = Array.isArray(worldHistory.historical_epochs) ? worldHistory.historical_epochs : [];
  const epochs = rawEpochs.map((ep) => {
    const chapterCode = ep.chapter_code || (ep.era_order ? `1.${ep.era_order}` : "");
    const worldScars = Array.isArray(ep.world_scars)
      ? ep.world_scars.map((s) => ({
          scarId: s.scar_id || "",
          name: applyNameMap(s.name || ""),
          description: applyNameMap(s.description || ""),
          spawnedContinentIds: Array.isArray(s.spawned_continent_ids) ? s.spawned_continent_ids : [],
        }))
      : [];
    return {
      id: ep.id || "",
      chapterCode,
      eraOrder: ep.era_order || 0,
      name: applyNameMap(ep.name || ""),
      kind: ep.kind || "",
      status: ep.status || "",
      coreRationale: applyNameMap(ep.core_rationale || ""),
      involvedGodIds: Array.isArray(ep.involved_god_ids) ? ep.involved_god_ids : [],
      worldScars,
      arts: matchConceptArt(conceptArtIndex, { loreRef: ep.id }),
    };
  });

  // Map of all scars by scar_id for lookup
  const scarsById = new Map();
  for (const ep of epochs) {
    for (const sc of ep.worldScars) {
      if (sc.scarId) scarsById.set(sc.scarId, sc);
    }
  }

  // 3. Boss Hierarchy Chains (constructed first so gods can reference sanitized chains)
  const rawHierarchy = worldHistory.shared_world_systems?.boss_power_hierarchy || {};
  const bossTiers = Array.isArray(rawHierarchy.tiers)
    ? rawHierarchy.tiers.map((t) => ({
        rank: t.rank || 0,
        tierKey: t.tier_key || "",
        name: applyNameMap(t.name || ""),
        cosmicRole: applyNameMap(t.cosmic_role || ""),
        powerRelationship: applyNameMap(t.power_relationship || ""),
        lootTier: applyNameMap(t.loot_tier || ""),
      }))
    : [];

  const rawChains = Array.isArray(atlas.boss_hierarchy_chains) ? atlas.boss_hierarchy_chains : [];
  const bossChains = rawChains.map((ch) => ({
    godId: ch.god_id || "",
    godName: applyNameMap(ch.god_name || ""),
    godShortLabel: applyNameMap(ch.god_short_label || ""),
    chapterEpoch: applyNameMap(ch.chapter_epoch || ""),
    sealCatacombZoneId: ch.seal_catacomb_zone_id || "",
    sealLoc: ch.seal_loc || "",
    mvpApostles: Array.isArray(ch.mvp_apostles)
      ? ch.mvp_apostles.map((m) => ({
          name: applyNameMap(m.name || ""),
          level: m.level || 0,
          dungeonId: m.dungeon_id || "",
          floorId: m.floor_id || "",
          loc: m.loc || "",
          signatureDrop: applyNameMap(m.signature_drop || ""),
        }))
      : [],
    raidBosses: Array.isArray(ch.raid_bosses)
      ? ch.raid_bosses.map((r) => ({
          name: applyNameMap(r.name || ""),
          level: r.level || 0,
          zoneId: r.zone_id || "",
          loc: r.loc || "",
          respawn: r.respawn || "",
        }))
      : [],
    miniBosses: Array.isArray(ch.mini_bosses)
      ? ch.mini_bosses.map((mb) => ({
          name: applyNameMap(mb.name || ""),
          level: mb.level || 0,
          zoneId: mb.zone_id || "",
          loc: mb.loc || "",
        }))
      : [],
    minionFamilies: Array.isArray(ch.minion_families)
      ? ch.minion_families.map((mf) => ({
          familyName: applyNameMap(mf.family_name || ""),
          representativeMob: applyNameMap(mf.representative_mob || ""),
          zoneIds: Array.isArray(mf.zone_ids) ? mf.zone_ids : [],
        }))
      : [],
  }));

  const chainsByGodId = new Map();
  for (const ch of bossChains) {
    if (ch && ch.godId) chainsByGodId.set(ch.godId, ch);
  }

  const bossLadder = {
    strictOrderLaw: rawHierarchy.strict_order_law || "GOD_SEALED > MVP_GOD_SUBORDINATE > RAID_BOSS > MINI_BOSS > NORMAL_MOB",
    tiers: bossTiers,
    chains: bossChains,
  };

  // 4. Gods (The Architect + 8 Sealed Gods)
  const rawGods = Array.isArray(worldHistory.primordial_gods) ? worldHistory.primordial_gods : [];
  const allGods = rawGods.map((g) => ({
    id: g.id || "",
    name: applyNameMap(g.name || ""),
    title: applyNameMap(g.title || ""),
    godArchetype: g.god_archetype || "",
    sealStatus: g.seal_status || "",
    mvpApostleTitle: applyNameMap(g.mvp_apostle_title || ""),
    status: g.status || "",
    coreRationale: applyNameMap(g.core_rationale || ""),
    domain: applyNameMap(g.domain || ""),
    geographicalScar: applyNameMap(g.geographical_scar || ""),
    architecturalImprint: applyNameMap(g.architectural_imprint || ""),
    bossChain: chainsByGodId.get(g.id) || null,
    arts: matchConceptArt(conceptArtIndex, { loreRef: g.id }),
  }));

  const architect = allGods.find((g) => g.id === "god-the-architect" || g.godArchetype === "the_architect") || allGods[0] || null;
  const sealedGods = allGods.filter((g) => g !== architect);

  const gods = {
    all: allGods,
    architect,
    sealedGods,
  };

  // 4. Races (6 Mortal Lineages)
  const rawRaces = worldHistory.race_taxonomy?.playable_and_mob_races || [];
  const races = rawRaces.map((r) => {
    const levelBand = r.starter_level_band
      ? `Levels ${r.starter_level_band.min_level || 1} to ${r.starter_level_band.max_level || 10}`
      : "Levels 1 to 10";
    return {
      id: r.id || "",
      raceKey: r.race_key || "",
      name: applyNameMap(r.name || ""),
      icon: r.icon || "",
      archetypeRef: applyNameMap(r.archetype_reference || ""),
      canBePlayer: Boolean(r.can_be_player),
      starterLevelBand: levelBand,
      homeTownId: r.home_town_id || "",
      homeTownName: applyNameMap(r.home_town_name || ""),
      continentId: r.continent_id || "",
      districtId: r.district_id || "",
      huntingAreaId: r.hunting_area_id || "",
      farmingAreaId: r.farming_area_id || "",
      convergenceHubTownId: r.convergence_hub_town_id || "",
      ancestralExpeditionCitadelId: r.ancestral_expedition_citadel_id || "",
      farmingResources: Array.isArray(r.farming_resources) ? r.farming_resources.map(applyNameMap) : [],
      combatTrait: applyNameMap(r.combat_trait || ""),
      nichedStory: applyNameMap(r.niched_story || ""),
      arts: matchConceptArt(conceptArtIndex, { loreRef: r.race_key || r.id }),
    };
  });

  // 5. Continents & Scars
  const continentsList = rawContinents.map((c) => {
    const parentCauses = c.parent_world_history_causes || {};
    const warScarIds = Array.isArray(parentCauses.war_scar_ids) ? parentCauses.war_scar_ids : [];
    const warScars = warScarIds.map((sid) => {
      const known = scarsById.get(sid);
      if (known) return known;
      return {
        scarId: sid,
        name: applyNameMap(sid.replace(/^scar-/, "").replace(/-/g, " ")),
        description: "Historical scar formed during the ancient God Wars.",
        spawnedContinentIds: [c.id],
      };
    });

    const levelBand = c.level_band
      ? `Levels ${c.level_band.min_level || 1} to ${c.level_band.max_level || 50}`
      : "";

    const travelLinks = Array.isArray(c.travel_links)
      ? c.travel_links.map((tl) => ({
          targetContinentId: tl.target_continent_id || "",
          travelMode: tl.travel_mode || "",
          hubName: applyNameMap(tl.hub_name || ""),
          status: tl.status || "",
          unlockRationale: applyNameMap(tl.unlock_rationale || ""),
        }))
      : [];

    const mysteryHook = c.mystery_hook
      ? {
          inWorldRumor: applyNameMap(c.mystery_hook.in_world_rumor || ""),
          visualSilhouette: applyNameMap(c.mystery_hook.visual_silhouette || ""),
          unansweredQuestion: applyNameMap(c.mystery_hook.unanswered_question || ""),
          discoveryTriggerHint: applyNameMap(c.mystery_hook.discovery_trigger_hint || ""),
        }
      : null;

    return {
      id: c.id || "",
      name: applyNameMap(c.name || ""),
      status: c.status || "",
      coreRationale: applyNameMap(c.core_rationale || ""),
      causalSummary: applyNameMap(parentCauses.causal_summary || ""),
      godPatronIds: Array.isArray(parentCauses.god_patron_ids) ? parentCauses.god_patron_ids : [],
      levelBand,
      warScars,
      climateProfile: {
        macroBiome: applyNameMap(c.climate_profile?.macro_biome || ""),
        weatherPhenomena: Array.isArray(c.climate_profile?.weather_phenomena)
          ? c.climate_profile.weather_phenomena.map(applyNameMap)
          : [],
        skyboxPalette: applyNameMap(c.climate_profile?.skybox_palette || ""),
      },
      civilizationStyle: {
        cultureArchetype: applyNameMap(c.civilization_style?.culture_archetype || ""),
        architectureMotif: applyNameMap(c.civilization_style?.architecture_motif || ""),
        characterScaleAdaptation: applyNameMap(c.civilization_style?.character_scale_adaptation || ""),
      },
      travelLinks,
      districtIds: Array.isArray(c.district_ids) ? c.district_ids : [],
      mysteryHook,
      arts: matchConceptArt(conceptArtIndex, {
        loreRef: c.id,
        id: (c.id || "").replace(/^continent-\d+-/, "continent-"),
      }),
    };
  });


  // 7. Mysteries
  const mysteryItems = [];

  // Continent 01 Cardamom-Kiln Caldera mystery hook
  const c1 = continentsList.find((c) => c.id === "continent-01-hearthbloom-basin");
  if (c1 && c1.mysteryHook) {
    mysteryItems.push({
      id: "mystery-cardamom-caldera",
      title: "Cardamom-Kiln Caldera (Continent 01)",
      category: "Uncharted Geothermal Caldera",
      inWorldRumor: c1.mysteryHook.inWorldRumor,
      visualSilhouette: c1.mysteryHook.visualSilhouette,
      unansweredQuestion: c1.mysteryHook.unansweredQuestion,
      discoveryTriggerHint: c1.mysteryHook.discoveryTriggerHint,
    });
  }

  // Continent 03 Solstice Pendulum Atoll mystery hook
  const c3 = continentsList.find((c) => c.id === "continent-03-shattered-halo");
  if (c3 && c3.mysteryHook) {
    mysteryItems.push({
      id: "mystery-solstice-atoll",
      title: "Solstice Pendulum Atoll (Continent 03)",
      category: "Inverted Gravity Sky-Atoll",
      inWorldRumor: c3.mysteryHook.inWorldRumor,
      visualSilhouette: c3.mysteryHook.visualSilhouette,
      unansweredQuestion: c3.mysteryHook.unansweredQuestion,
      discoveryTriggerHint: c3.mysteryHook.discoveryTriggerHint,
    });
  }

  // The Architect's Seals & Fog-of-Lore mystery hook
  mysteryItems.push({
    id: "mystery-architect-locks",
    title: "The Architect's Final God Seal Vaults",
    category: "Planetary Runic Lattice",
    inWorldRumor: "Ancient runic glyphs beneath Lantern Hollow, Inductor Switchyard, and Starfall Haven hum in discordant harmonic waves as hairline fractures spread across the seal-keystones.",
    visualSilhouette: "Octagonal seal-keystones glowing faintly with runic containment geometry beneath each continent's deepest catacomb tier.",
    unansweredQuestion: "Who or what breached the first hairline fracture in The Architect's planetary seal lattice?",
    discoveryTriggerHint: "Locked behind fog-of-lore catacombs and multi-race Main Quest keys across all three continents.",
  });

  const mysteries = {
    summary: applyNameMap(
      worldHistory.quality_checklist?.intentional_mystery_discipline?.evidence ||
        "The Architect final God Seal Vaults and the awakening of each Sealed God top-tier MVP Apostle remain locked behind fog-of-lore catacombs and multi-race Main Quest keys.",
    ),
    items: mysteryItems,
  };

  return {
    premise,
    epochs,
    gods,
    races,
    continents: continentsList,
    bossLadder,
    mysteries,
    stats: {
      epochCount: epochs.length,
      godCount: gods.all.length,
      raceCount: races.length,
      continentCount: continentsList.length,
      bossChainCount: bossChains.length,
      mysteryCount: mysteryItems.length,
    },
  };
}
