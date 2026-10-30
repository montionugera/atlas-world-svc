// Lore and History panel — player-facing World Bible wiki generated from studio JSON SSOT.
// Enforces name remapping from name-map.json, sticky chapter navigation with deep links,
// matching concept art by loreRef/zoneId, visible error/warning banners, and teasing mysteries.

import {
  buildLoreModel,
  CHAPTERS,
} from "../lore-model.mjs";
import { register } from "./registry.mjs";

const WORLD_HISTORY_URL = "/content/studio/world_history_and_concept.json";
const ATLAS_URL = "/content/studio/t_shaped_world_atlas.json";
const CONTINENT_URLS = [
  "/content/studio/continents/continent-01-hearthbloom-basin.json",
  "/content/studio/continents/continent-02-clockwork-steppe.json",
  "/content/studio/continents/continent-03-shattered-halo.json",
];
const CONCEPT_ART_URL = "/content/concept-art/index.json";

let containerEl = null;
let model = null;
let activeChapterId = "premise";
let activeRef = "";
let navButtons = {};

/**
 * Helper to create DOM element with class, text, and attributes.
 */
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Renders an art thumbnail gallery for an entity when matching concept art exists.
 */
function renderArtGallery(arts) {
  if (!Array.isArray(arts) || arts.length === 0) return null;
  const wrap = el("div", "lore-art-section");
  for (const art of arts) {
    if (!art) continue;
    const fig = el("figure", "lore-art-figure");
    const img = el("img", "lore-art-img");
    const src = art.thumb ? `/content/concept-art/${art.thumb}` : `/content/concept-art/${art.file}`;
    img.src = src;
    img.alt = art.title || "Concept Art";
    img.loading = "lazy";
    fig.appendChild(img);

    if (art.title || art.caption) {
      const cap = el("figcaption", "lore-art-caption", art.caption || art.title);
      fig.appendChild(cap);
    }
    wrap.appendChild(fig);
  }
  return wrap;
}

/**
 * Creates a field display row (label + text).
 */
function field(labelText, valueText) {
  if (!valueText) return null;
  const row = el("div", "lore-field");
  row.appendChild(el("span", "lore-field-label", labelText));
  row.appendChild(el("div", "lore-field-value", valueText));
  return row;
}

/**
 * Creates a stat chip with a bold count element and label text (no raw HTML strings).
 */
function statChip(count, label) {
  const chip = el("span", "lore-stat-chip");
  chip.appendChild(el("strong", "", String(count)));
  chip.append(` ${label}`);
  return chip;
}

/**
 * Resolves which chapter ID owns a given loreRef.
 */
function chapterForRef(ref) {
  if (!ref || typeof ref !== "string") return "premise";
  if (ref.startsWith("epoch-")) return "epochs";
  if (ref.startsWith("god-")) return "gods";
  if (
    ref.startsWith("race-") ||
    ["human_demi_human", "dwarf", "ogre_orc", "furral", "lunar", "dark_lunar"].includes(ref)
  ) {
    return "races";
  }
  if (ref.startsWith("continent-")) return "continents";
  if (ref === "beast_animal_brute" || ref.startsWith("boss-")) return "bosses";
  if (ref.startsWith("mystery-")) return "mysteries";
  return "premise";
}

/**
 * Smoothly scrolls to a chapter section and updates navigation state.
 */
function navigateToChapter(chapterId, pushHistory = true) {
  const validChapter = CHAPTERS.find((c) => c.id === chapterId)?.id || "premise";
  activeChapterId = validChapter;
  for (const [id, btn] of Object.entries(navButtons)) {
    const isActive = id === validChapter;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  }

  const target = containerEl?.querySelector(`#lore-chapter-${validChapter}`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (pushHistory && window.atlasSetParams) {
    window.atlasSetParams({ tab: "lore", chapter: validChapter, ref: null }, { push: true });
  }
}

/**
 * Navigates to a specific loreRef anchor or its containing chapter.
 */
function navigateToRef(ref, pushHistory = false) {
  const chId = chapterForRef(ref);
  activeChapterId = chId;
  for (const [id, btn] of Object.entries(navButtons)) {
    const isActive = id === chId;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  }

  let target = null;
  if (typeof ref === "string" && /^[A-Za-z0-9_-]+$/.test(ref)) {
    target = containerEl?.querySelector(`#lore-ref-${ref}`) || null;
  }
  if (!target) {
    target = containerEl?.querySelector(`#lore-chapter-${chId}`) || null;
  }
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (pushHistory && window.atlasSetParams) {
    window.atlasSetParams({ tab: "lore", chapter: chId, ref }, { push: true });
  }
}

/**
 * Builds the sticky navigation bar.
 */
function buildStickyNav() {
  const nav = el("nav", "lore-nav");
  nav.setAttribute("aria-label", "Lore chapter navigation");
  const list = el("ul", "lore-nav-list");

  navButtons = {};
  for (const ch of CHAPTERS) {
    const li = el("li");
    const btn = el("button", "lore-nav-btn", `${ch.icon} ${ch.label}`);
    btn.type = "button";
    btn.dataset.chapter = ch.id;
    if (ch.id === activeChapterId) {
      btn.classList.add("is-active");
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.setAttribute("aria-selected", "false");
    }

    btn.addEventListener("click", () => {
      navigateToChapter(ch.id, true);
    });

    navButtons[ch.id] = btn;
    li.appendChild(btn);
    list.appendChild(li);
  }

  nav.appendChild(list);
  return nav;
}

/**
 * Chapter 1: Player Arrival Premise
 */
function buildPremiseSection(premise) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-premise";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Origins & Awakening"));
  header.appendChild(el("h2", "lore-chapter-title", "✨ Player Arrival Premise"));
  header.appendChild(el("p", "lore-chapter-desc", "Why mortal adventurers awaken across the three continents and take their first steps into the world."));
  sec.appendChild(header);

  const card = el("article", "lore-card lore-card--highlight");

  const identityGroup = field("Player Identity", premise.playerIdentity);
  if (identityGroup) card.appendChild(identityGroup);

  const whyGroup = field("Why Enter The World", premise.whyEnterWorld);
  if (whyGroup) card.appendChild(whyGroup);

  const incitingGroup = field("Inciting Phenomenon (The Broken Seals)", premise.incitingPhenomenon);
  if (incitingGroup) card.appendChild(incitingGroup);

  if (premise.coreRationale) {
    const ratGroup = field("World Rationale", premise.coreRationale);
    if (ratGroup) card.appendChild(ratGroup);
  }

  const artGallery = renderArtGallery(premise.arts);
  if (artGallery) card.appendChild(artGallery);

  sec.appendChild(card);
  return sec;
}

/**
 * Chapter 2: Historical Epochs Timeline (1.1 to 1.4)
 */
function buildEpochsSection(epochs) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-epochs";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Cosmological History"));
  header.appendChild(el("h2", "lore-chapter-title", "⏳ The Four Historical Epochs"));
  header.appendChild(el("p", "lore-chapter-desc", "From the primordial furnace of Creation through the devastating God Wars to The Architect's God Seal Magic."));
  sec.appendChild(header);

  const timeline = el("div", "lore-timeline");
  for (const ep of epochs) {
    const item = el("div", "lore-timeline-item");
    item.appendChild(el("div", "lore-timeline-marker"));

    const card = el("article", "lore-card");
    if (ep.id) card.id = `lore-ref-${ep.id}`;

    const cardHeader = el("div", "lore-card-header");
    const titleGroup = el("div", "lore-card-title-group");
    titleGroup.appendChild(el("h3", "lore-card-title", ep.name));
    titleGroup.appendChild(el("span", "lore-card-subtitle", `Historical Era ${ep.chapterCode}`));
    cardHeader.appendChild(titleGroup);

    const badge = el("span", "lore-badge lore-badge--seed", `Epoch ${ep.chapterCode}`);
    cardHeader.appendChild(badge);
    card.appendChild(cardHeader);

    const cardBody = el("div", "lore-card-body");
    cardBody.appendChild(field("Core Era Rationale", ep.coreRationale));

    if (ep.worldScars.length > 0) {
      const scarWrap = el("div", "lore-field");
      scarWrap.appendChild(el("span", "lore-field-label", "Geological & Planar Scars"));
      for (const sc of ep.worldScars) {
        const scarRow = el("div", "lore-field-value");
        const b = el("strong", "", sc.name);
        scarRow.appendChild(b);
        if (sc.description) {
          scarRow.append(` — ${sc.description}`);
        }
        scarWrap.appendChild(scarRow);
      }
      cardBody.appendChild(scarWrap);
    }

    const artGallery = renderArtGallery(ep.arts);
    if (artGallery) cardBody.appendChild(artGallery);

    card.appendChild(cardBody);
    item.appendChild(card);
    timeline.appendChild(item);
  }

  sec.appendChild(timeline);
  return sec;
}

/**
 * Chapter 3: The Architect & Sealed Primordial Gods
 */
function buildGodsSection(gods) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-gods";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Pantheon & Containment"));
  header.appendChild(el("h2", "lore-chapter-title", "🏛️ The Architect & The Sealed Gods"));
  header.appendChild(el("p", "lore-chapter-desc", "Aethelgard, the mortal architect who bound every deity, and the sealed primordial entities straining against their locks."));
  sec.appendChild(header);

  // Architect Hero Card
  if (gods.architect) {
    const arch = gods.architect;
    const archCard = el("article", "lore-card lore-card--architect");
    if (arch.id) archCard.id = `lore-ref-${arch.id}`;
    const ch = el("div", "lore-card-header");
    const tg = el("div", "lore-card-title-group");
    tg.appendChild(el("h3", "lore-card-title", arch.name));
    tg.appendChild(el("span", "lore-card-subtitle", arch.title));
    ch.appendChild(tg);
    ch.appendChild(el("span", "lore-badge lore-badge--seed", "Architect Originator"));
    archCard.appendChild(ch);

    const cb = el("div", "lore-card-body");
    cb.appendChild(field("Divine Domain & Mastery", arch.domain));
    cb.appendChild(field("Historical Feat & Rationale", arch.coreRationale));
    cb.appendChild(field("Geographical Imprint & Seal Meridians", arch.geographicalScar));
    cb.appendChild(field("Architectural Runic Legacy", arch.architecturalImprint));
    if (arch.mvpApostleTitle) {
      cb.appendChild(field("Prime Sentinel / Scribe", arch.mvpApostleTitle));
    }

    const artGallery = renderArtGallery(arch.arts);
    if (artGallery) cb.appendChild(artGallery);

    archCard.appendChild(cb);
    sec.appendChild(archCard);
  }

  // Sealed Gods Grid
  const grid = el("div", "lore-grid");
  for (const god of gods.sealedGods) {
    const card = el("article", "lore-card");
    if (god.id) card.id = `lore-ref-${god.id}`;

    const cardHeader = el("div", "lore-card-header");
    const titleGroup = el("div", "lore-card-title-group");
    titleGroup.appendChild(el("h3", "lore-card-title", god.name));
    titleGroup.appendChild(el("span", "lore-card-subtitle", god.title));
    cardHeader.appendChild(titleGroup);

    cardHeader.appendChild(el("span", "lore-badge lore-badge--accent", "Sealed Deity"));
    card.appendChild(cardHeader);

    const cardBody = el("div", "lore-card-body");
    cardBody.appendChild(field("Cosmic Domain", god.domain));
    cardBody.appendChild(field("Top-Tier MVP Apostle", god.mvpApostleTitle));
    cardBody.appendChild(field("Geological Scar", god.geographicalScar));
    cardBody.appendChild(field("Architectural Imprint", god.architecturalImprint));
    cardBody.appendChild(field("Lore Rationale", god.coreRationale));

    const artGallery = renderArtGallery(god.arts);
    if (artGallery) cardBody.appendChild(artGallery);

    card.appendChild(cardBody);
    grid.appendChild(card);
  }

  sec.appendChild(grid);
  return sec;
}

/**
 * Chapter 4: The Six Mortal Races & Starter Towns
 */
function buildRacesSection(races) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-races";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Playable Lineages"));
  header.appendChild(el("h2", "lore-chapter-title", "👥 The Six Mortal Lineages & Home Towns"));
  header.appendChild(el("p", "lore-chapter-desc", "Every adventurer begins in their ancestral home town, mastering their racial craft before converging at Kilnwatch Bastion."));
  sec.appendChild(header);

  const grid = el("div", "lore-grid");
  for (const race of races) {
    const card = el("article", "lore-card");
    if (race.raceKey || race.id) card.id = `lore-ref-${race.raceKey || race.id}`;

    const cardHeader = el("div", "lore-card-header");
    const titleGroup = el("div", "lore-card-title-group");
    titleGroup.appendChild(el("h3", "lore-card-title", race.name));
    titleGroup.appendChild(el("span", "lore-card-subtitle", `Ancestral Home: ${race.homeTownName}`));
    cardHeader.appendChild(titleGroup);

    cardHeader.appendChild(el("span", "lore-badge lore-badge--ok", race.starterLevelBand));
    card.appendChild(cardHeader);

    const cardBody = el("div", "lore-card-body");
    cardBody.appendChild(field("Lineage Archetype", race.archetypeRef));
    cardBody.appendChild(field("Unique Combat Trait", race.combatTrait));
    cardBody.appendChild(field("Starter Quest & Convergence Arc", race.nichedStory));

    if (race.farmingResources.length > 0) {
      const craftField = el("div", "lore-field");
      craftField.appendChild(el("span", "lore-field-label", "Primary Racial Crafts & Alloys"));
      const tagList = el("div", "lore-tags");
      for (const res of race.farmingResources) {
        tagList.appendChild(el("span", "lore-tag", res));
      }
      craftField.appendChild(tagList);
      cardBody.appendChild(craftField);
    }

    const artGallery = renderArtGallery(race.arts);
    if (artGallery) cardBody.appendChild(artGallery);

    card.appendChild(cardBody);
    grid.appendChild(card);
  }

  sec.appendChild(grid);
  return sec;
}

/**
 * Chapter 5: The Three Continents & Their Scars
 */
function buildContinentsSection(continents) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-continents";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Geography & Ecology"));
  header.appendChild(el("h2", "lore-chapter-title", "🗺️ The Three Continents & Historical Scars"));
  header.appendChild(el("p", "lore-chapter-desc", "Forged in the God Wars, each continent bears the scars of divine combat, unique biomes, and architectural scale adaptations."));
  sec.appendChild(header);

  const grid = el("div", "lore-grid lore-grid--single");
  for (const cont of continents) {
    const card = el("article", "lore-card");
    if (cont.id) card.id = `lore-ref-${cont.id}`;

    const cardHeader = el("div", "lore-card-header");
    const titleGroup = el("div", "lore-card-title-group");
    titleGroup.appendChild(el("h3", "lore-card-title", cont.name));
    titleGroup.appendChild(el("span", "lore-card-subtitle", cont.levelBand));
    cardHeader.appendChild(titleGroup);

    cardHeader.appendChild(el("span", "lore-badge lore-badge--seed", "Canon Continent"));
    card.appendChild(cardHeader);

    const cardBody = el("div", "lore-card-body");
    cardBody.appendChild(field("Cosmic Origin & Formation", cont.coreRationale));
    cardBody.appendChild(field("World History Cause & Causal Summary", cont.causalSummary));

    if (cont.warScars.length > 0) {
      const scarWrap = el("div", "lore-field");
      scarWrap.appendChild(el("span", "lore-field-label", "Historical War Scars"));
      for (const sc of cont.warScars) {
        const row = el("div", "lore-field-value");
        row.appendChild(el("strong", "", sc.name));
        if (sc.description) row.append(` — ${sc.description}`);
        scarWrap.appendChild(row);
      }
      cardBody.appendChild(scarWrap);
    }

    if (cont.climateProfile.macroBiome) {
      cardBody.appendChild(field("Climate & Macro-Biome", `${cont.climateProfile.macroBiome}. Skybox: ${cont.climateProfile.skyboxPalette}`));
    }

    if (cont.civilizationStyle.cultureArchetype) {
      cardBody.appendChild(field("Civilization Style & Scale Law", `${cont.civilizationStyle.cultureArchetype}. Motif: ${cont.civilizationStyle.architectureMotif}. Adaptation: ${cont.civilizationStyle.characterScaleAdaptation}`));
    }

    if (cont.travelLinks.length > 0) {
      const linksWrap = el("div", "lore-field");
      linksWrap.appendChild(el("span", "lore-field-label", "Intercontinental Transit Lines"));
      for (const tl of cont.travelLinks) {
        const row = el("div", "lore-field-value");
        row.appendChild(el("strong", "", `${tl.hubName} (${tl.travelMode})`));
        row.append(` — ${tl.unlockRationale}`);
        linksWrap.appendChild(row);
      }
      cardBody.appendChild(linksWrap);
    }

    const artGallery = renderArtGallery(cont.arts);
    if (artGallery) cardBody.appendChild(artGallery);

    card.appendChild(cardBody);
    grid.appendChild(card);
  }

  sec.appendChild(grid);
  return sec;
}

/**
 * Chapter 6: Boss Power Hierarchy Ladder & Chains
 */
function buildBossSection(bossLadder) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-bosses";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Threat Hierarchy"));
  header.appendChild(el("h2", "lore-chapter-title", "⚔️ Boss Power Hierarchy & Divine Chains"));
  header.appendChild(el("p", "lore-chapter-desc", "The strict cosmic order of combat threats, from sealed primordial gods down to field monsters."));
  sec.appendChild(header);

  // Strict Order Law Box
  const lawBox = el("div", "lore-ladder-law", `Strict Hierarchy Law: ${bossLadder.strictOrderLaw}`);
  sec.appendChild(lawBox);

  // 4 Tiers step-down
  const ladderWrap = el("div", "lore-tier-ladder");
  for (const tier of bossLadder.tiers) {
    const stepClass = tier.rank === 1 ? "lore-tier-step--god" : tier.rank === 2 ? "lore-tier-step--mvp" : tier.rank === 3 ? "lore-tier-step--raid" : "lore-tier-step--field";
    const step = el("div", `lore-tier-step ${stepClass}`);

    const h = el("div", "lore-card-header");
    h.appendChild(el("h3", "lore-card-title", `Rank ${tier.rank}: ${tier.name}`));
    h.appendChild(el("span", "lore-badge", tier.tierKey));
    step.appendChild(h);

    step.appendChild(field("Cosmic Threat Role", tier.cosmicRole));
    step.appendChild(field("Power Relationship", tier.powerRelationship));
    step.appendChild(field("Signature Loot Tier", tier.lootTier));

    ladderWrap.appendChild(step);
  }
  sec.appendChild(ladderWrap);

  // 6 Boss Chains
  if (bossLadder.chains.length > 0) {
    const chainsHeader = el("h3", "lore-chapter-title", "Concrete Boss Hierarchy Chains");
    chainsHeader.style.marginTop = "1rem";
    sec.appendChild(chainsHeader);

    const grid = el("div", "lore-grid");
    for (const chain of bossLadder.chains) {
      const card = el("article", "lore-card");
      if (chain.godId) card.id = `lore-ref-${chain.godId}-chain`;

      const ch = el("div", "lore-card-header");
      const tg = el("div", "lore-card-title-group");
      tg.appendChild(el("h4", "lore-card-title", chain.godName));
      tg.appendChild(el("span", "lore-card-subtitle", chain.chapterEpoch));
      ch.appendChild(tg);
      ch.appendChild(el("span", "lore-badge lore-badge--seed", chain.godShortLabel));
      card.appendChild(ch);

      const cb = el("div", "lore-card-body");
      cb.appendChild(field("Catacomb Seal Zone", `${chain.sealCatacombZoneId} (Loc: ${chain.sealLoc})`));

      const tree = el("div", "lore-chain-tree");

      // MVP Apostles
      for (const mvp of chain.mvpApostles) {
        const row = el("div", "lore-chain-row");
        row.appendChild(el("strong", "", `[MVP Lv.${mvp.level}] ${mvp.name}`));
        row.append(` — ${mvp.dungeonId} ${mvp.floorId} (Drop: ${mvp.signatureDrop})`);
        tree.appendChild(row);
      }

      // Raid Bosses
      for (const rb of chain.raidBosses) {
        const row = el("div", "lore-chain-row");
        row.appendChild(el("strong", "", `[Raid Lv.${rb.level}] ${rb.name}`));
        row.append(` — Zone: ${rb.zoneId} (Respawn: ${rb.respawn})`);
        tree.appendChild(row);
      }

      // Mini-Bosses
      for (const mb of chain.miniBosses) {
        const row = el("div", "lore-chain-row");
        row.appendChild(el("strong", "", `[Mini-Boss Lv.${mb.level}] ${mb.name}`));
        row.append(` — Zone: ${mb.zoneId}`);
        tree.appendChild(row);
      }

      // Minion Families
      for (const mf of chain.minionFamilies) {
        const row = el("div", "lore-chain-row");
        row.appendChild(el("strong", "", `[Family] ${mf.familyName}`));
        row.append(` — Representative: ${mf.representativeMob}`);
        tree.appendChild(row);
      }

      cb.appendChild(tree);
      card.appendChild(cb);
      grid.appendChild(card);
    }
    sec.appendChild(grid);
  }

  return sec;
}

/**
 * Chapter 7: Open Mysteries & Lore Fog
 */
function buildMysteriesSection(mysteries) {
  const sec = el("section", "lore-chapter");
  sec.id = "lore-chapter-mysteries";

  const header = el("div", "lore-chapter-header");
  header.appendChild(el("span", "lore-chapter-eyebrow", "Unsolved Chronicles"));
  header.appendChild(el("h2", "lore-chapter-title", "🔮 Open Mysteries & Lore Fog"));
  header.appendChild(el("p", "lore-chapter-desc", "Unanswered questions, rumors, and visual silhouettes awaiting intrepid explorers in the fog of lore."));
  sec.appendChild(header);

  if (mysteries.summary) {
    const summaryCard = el("div", "lore-mystery-quote", mysteries.summary);
    sec.appendChild(summaryCard);
  }

  const grid = el("div", "lore-grid");
  for (const item of mysteries.items) {
    const card = el("article", "lore-card lore-card--highlight");

    const cardHeader = el("div", "lore-card-header");
    const titleGroup = el("div", "lore-card-title-group");
    titleGroup.appendChild(el("h3", "lore-card-title", item.title));
    titleGroup.appendChild(el("span", "lore-card-subtitle", item.category));
    cardHeader.appendChild(titleGroup);

    cardHeader.appendChild(el("span", "lore-badge lore-badge--seed", "Mystery"));
    card.appendChild(cardHeader);

    const cardBody = el("div", "lore-card-body");
    cardBody.appendChild(field("In-World Rumor", item.inWorldRumor));
    cardBody.appendChild(field("Visual Silhouette", item.visualSilhouette));

    const qBox = el("blockquote", "lore-mystery-quote", `“${item.unansweredQuestion}”`);
    cardBody.appendChild(qBox);

    cardBody.appendChild(field("Discovery Trigger", item.discoveryTriggerHint));

    card.appendChild(cardBody);
    grid.appendChild(card);
  }

  sec.appendChild(grid);
  return sec;
}

/**
 * Renders the full Lore and History reading page.
 */
function renderLorePage(m) {
  containerEl.replaceChildren();

  const container = el("div", "lore-container");

  // Page Header
  const header = el("header", "lore-header");
  header.appendChild(el("span", "lore-header-eyebrow", "Authoritative World Bible"));
  header.appendChild(el("h1", "lore-header-title", "Lore & History"));
  header.appendChild(el("p", "lore-header-desc", "Explore the origins, deities, mortal lineages, and continents of Atlas World. Direct from the studio canon SSOT."));

  const stats = el("div", "lore-stats");
  stats.appendChild(statChip(m.stats.epochCount, "Historical Epochs"));
  stats.appendChild(statChip(m.stats.godCount, "Primordial Gods"));
  stats.appendChild(statChip(m.stats.raceCount, "Mortal Lineages"));
  stats.appendChild(statChip(m.stats.continentCount, "Continents"));
  stats.appendChild(statChip(m.stats.bossChainCount, "Boss Chains"));
  stats.appendChild(statChip(m.stats.mysteryCount, "Open Mysteries"));
  header.appendChild(stats);
  container.appendChild(header);

  // Sticky Chapter Navigation
  container.appendChild(buildStickyNav());

  // Chapter Sections
  container.appendChild(buildPremiseSection(m.premise));
  container.appendChild(buildEpochsSection(m.epochs));
  container.appendChild(buildGodsSection(m.gods));
  container.appendChild(buildRacesSection(m.races));
  container.appendChild(buildContinentsSection(m.continents));
  container.appendChild(buildBossSection(m.bossLadder));
  container.appendChild(buildMysteriesSection(m.mysteries));

  containerEl.appendChild(container);

  if (activeRef) {
    navigateToRef(activeRef, false);
  } else if (activeChapterId) {
    navigateToChapter(activeChapterId, false);
  }
}

/**
 * Renders a prominent banner (for error or empty fetch). Never blank.
 */
function renderBanner(type, title, message) {
  containerEl.replaceChildren();
  const banner = el("div", `lore-banner lore-banner--${type}`);
  banner.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = type === "error" ? "⚠️" : "ℹ️";
  const body = el("div");
  const head = el("strong", "", `${icon} ${title}`);
  body.appendChild(head);
  body.appendChild(el("p", "", message));
  banner.appendChild(body);

  containerEl.appendChild(banner);
}

register("lore", {
  async mount(el, params = {}) {
    containerEl = el;
    activeRef = params.ref || "";
    activeChapterId = params.chapter || (activeRef ? chapterForRef(activeRef) : "premise");

    try {
      const [worldHistory, atlas, ...continentResults] = await Promise.all([
        fetch(WORLD_HISTORY_URL).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch(ATLAS_URL).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        ...CONTINENT_URLS.map((url) =>
          fetch(url).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
        ),
      ]);

      let conceptArtIndex = null;
      try {
        const res = await fetch(CONCEPT_ART_URL);
        if (res.ok) conceptArtIndex = await res.json();
      } catch {
        conceptArtIndex = { version: 1, items: [] };
      }

      if (!worldHistory || !atlas) {
        renderBanner("warning", "Lore Archive Empty", "The studio lore archives contain no records. Please check the content pipeline.");
        return;
      }

      model = buildLoreModel({
        worldHistory,
        atlas,
        continents: continentResults,
        conceptArtIndex,
      });

      renderLorePage(model);
    } catch (err) {
      renderBanner("error", "Lore Archive Unavailable", `Failed to load world history archives: ${err.message}. The observatory will retry on next view.`);
    }
  },

  show(params = {}) {
    if (params.ref) {
      activeRef = params.ref;
      navigateToRef(params.ref, false);
    } else if (params.chapter && params.chapter !== activeChapterId) {
      activeRef = "";
      navigateToChapter(params.chapter, false);
    }
  },

  hide() {
    // Retain state and closure on tab switch
  },

  count() {
    return model ? CHAPTERS.length : null;
  },
});
