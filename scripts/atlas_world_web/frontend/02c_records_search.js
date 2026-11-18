// 02c_records_search.js — F-216 S1: one search over every record, and the record page.
// Server: GET /api/search, GET /api/record (scripts/atlas_world_web/records.py).
let CURRENT_RECORD = '';           // "<kind>:<id>" while a record page is open, else ''
let SEARCH_POPOVER_SEQ = 0;        // drops answers that arrive after a newer keystroke
let SEARCH_POPOVER_TIMER = 0;

function recordEntryLabel(viewUrl) {
  const group = navGroupOf(new URLSearchParams((viewUrl.split('?')[1] || '')).get('tab'));
  return group ? group.section : 'image';
}

let HOME_COUNTS;                   // undefined = not asked yet, null = loading, array = loaded (empty when the route failed)
function renderHome() {
  if (HOME_COUNTS === undefined) {
    HOME_COUNTS = null;
    fetch('/api/record-counts').then(r => r.json()).then(b => b.counts || [], () => [])
      .then(counts => { HOME_COUNTS = counts; if (CURRENT_TAB === 'home' && !CURRENT_RECORD) render(); });
  }
  const tiles = (HOME_COUNTS || []).map(c => {
    const tab = new URLSearchParams((c.viewUrl.split('?')[1] || '')).get('tab');
    const group = navGroupOf(tab);
    const inner = `<span class="home-count__n">${Number(c.n)}</span><span class="home-count__kind">${escapeHtml(c.kind.replace(/_/g, ' '))}</span>`;
    return group
      ? `<button type="button" class="home-count" data-kind="${escapeHtml(c.kind)}" onclick="switchTab('${group.items.find(it => it.id === tab).id}')">${inner}<span class="home-count__entry">${escapeHtml(group.section)}</span></button>`
      : `<div class="home-count" data-kind="${escapeHtml(c.kind)}">${inner}</div>`;
  }).join('');
  return `
    <article id="homePage" class="home-page">
      <h1>Atlas World DB</h1>
      <p><button type="button" class="joy-button joy-button--outline" onclick="document.getElementById('globalSearch').focus()">Search every record</button></p>
      <div class="home-counts" aria-busy="${HOME_COUNTS === null}">${HOME_COUNTS === null ? '<p role="status">...</p>' : tiles}</div>
    </article>`;
}

function closeSearchPopover() {
  SEARCH_POPOVER_SEQ++;              // a search still in flight must not reopen it
  clearTimeout(SEARCH_POPOVER_TIMER);
  const pop = document.getElementById('searchPopover');
  if (pop) { pop.hidden = true; document.getElementById('searchPopoverResults').innerHTML = ''; }
}

function placeSearchPopover() {
  const pop = document.getElementById('searchPopover');
  const r = document.querySelector('.topbar .sidebar-search__inner').getBoundingClientRect();
  const width = Math.min(480, window.innerWidth - 16);
  pop.style.top = `${Math.round(r.bottom + 6)}px`;
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - width - 8)))}px`;
  pop.style.width = `${width}px`;
}

function showSearchMessage(html) {
  const pop = document.getElementById('searchPopover');
  document.getElementById('searchPopoverResults').innerHTML = `<div class="search-popover__message" role="status">${html}</div>`;
  placeSearchPopover();
  pop.hidden = false;
}

async function runRecordSearch(query) {
  const seq = ++SEARCH_POPOVER_SEQ;
  clearTimeout(SEARCH_POPOVER_TIMER);
  if (query.trim().length < 2) { closeSearchPopover(); return; }
  SEARCH_POPOVER_TIMER = setTimeout(() => { if (seq === SEARCH_POPOVER_SEQ) showSearchMessage('Searching...'); }, 150);
  const archive = document.getElementById('searchIncludeArchive').checked ? '1' : '0';
  let body;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&include_archive=${archive}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    body = await res.json();
  } catch (err) {
    if (seq !== SEARCH_POPOVER_SEQ) return;
    clearTimeout(SEARCH_POPOVER_TIMER);
    showSearchMessage('Search is unavailable <button type="button" id="searchRetryBtn" class="joy-button joy-button--outline joy-button--sm">Retry</button>');
    document.getElementById('searchRetryBtn').onclick = () => runRecordSearch(document.getElementById('globalSearch').value);
    return;
  }
  if (seq !== SEARCH_POPOVER_SEQ) return;
  clearTimeout(SEARCH_POPOVER_TIMER);
  if (!body.results.length) { showSearchMessage(`No record matches '${escapeHtml(query.trim())}'`); return; }
  const pop = document.getElementById('searchPopover');
  document.getElementById('searchPopoverResults').innerHTML = body.results.map((r, i) => `
    <button type="button" class="search-popover__row" role="option" aria-selected="${i === 0}" data-record="${escapeHtml(r.kind + ':' + r.id)}">
      <span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(r.kind.replace(/_/g, ' '))}</span>
      <span class="search-popover__title">${escapeHtml(r.title)}</span>
      ${r.concept === 'legacy' ? '<span class="joy-badge joy-badge--neutral joy-badge--sm">Old concept</span>' : ''}
      <span class="search-popover__summary">${escapeHtml(r.summary)}</span>
    </button>`).join('');
  placeSearchPopover();
  pop.hidden = false;
}

function openRecord(kind, id) {
  CURRENT_RECORD = `${kind}:${id}`;
  closeSearchPopover();
  writeUrlState();
  render();
  const st = document.getElementById('scrollStage');
  if (st) st.scrollTop = 0;
}

function openRecordFromEl(el) {
  const key = el.dataset.record;
  const cut = key.indexOf(':');
  openRecord(key.slice(0, cut), key.slice(cut + 1));
}

// F-237: the record map. The server computes cells / positions from the studio files; this only draws them.
const RM_KIND_LABEL = {
  town: "Town",
  hunting: "Hunting",
  dungeon: "Dungeon",
  unbuilt: "Not built yet",
  outside: "Outside",
  district: "District",
};
function rmWrap(text, max, lines) {
  const out = [];
  let cur = "";
  const words = String(text).split(/\s+/).flatMap((w) => w.match(new RegExp(`.{1,${max}}`, "g")) || []); // a long unbroken word is cut so it stays inside its box
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] = out[lines - 1].slice(0, max - 1) + "…";
  }
  return out;
}
function renderRecordMap(map) {
  const E = (v) => escapeHtml(v).replace(/"/g, "&quot;"); // escapeHtml leaves quotes, and some values land in attributes
  const plane = map.nodes.every((n) => n.kind === "district"); // continent: 0-100 coordinates; district: grid cells
  const BW = plane ? 176 : 92, // district: narrow boxes so the whole 4-column map fits a phone at ~0.8 scale
    BH = plane ? 76 : 92,
    PAD = 24;
  const xs = map.nodes.map((n) => n.x),
    ys = map.nodes.map((n) => n.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  const ux = plane ? (860 - BW) / Math.max(1, Math.max(...xs) - minX) : 104;
  const uy = plane ? 12 : 118;
  const W = Math.ceil((Math.max(...xs) - minX) * ux + BW + PAD * 2),
    H = Math.ceil((Math.max(...ys) - minY) * uy + BH + PAD * 2);
  const at = Object.fromEntries(
    map.nodes.map((n) => [
      n.id,
      {
        cx: PAD + (n.x - minX) * ux + BW / 2,
        cy: PAD + (n.y - minY) * uy + BH / 2,
      },
    ]),
  );
  let dangerMarks = ""; // drawn after the boxes so nothing hides them
  const edges = map.edges
    .map((e) => {
      const a = at[e.a],
        b = at[e.b];
      if (!a || !b) return "";
      const cls = e.danger
        ? "rm-edge rm-edge--danger"
        : e.state === "open"
          ? "rm-edge"
          : "rm-edge rm-edge--closed";
      // the mark sits on the edge at the point least covered by a box: halfway if that is clear, else the nearest clear spot
      const dx = b.cx - a.cx,
        dy = b.cy - a.cy;
      const covered = (f) =>
        Object.values(at).some(
          (c) => Math.abs(a.cx + dx * f - c.cx) < BW / 2 + 14 && Math.abs(a.cy + dy * f - c.cy) < BH / 2 + 14,
        );
      const f = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].find((q) => !covered(q)) ?? 0.5;
      const mx = a.cx + dx * f,
        my = a.cy + dy * f;
      if (e.danger) dangerMarks += `<g class="rm-warn"><circle cx="${mx}" cy="${my}" r="13"/><text x="${mx}" y="${my + 5}" text-anchor="middle">!</text></g>`;
      const mark = e.danger
        ? ""
        : e.label
          ? `<g class="rm-pill"><rect x="${mx - 22}" y="${my - 11}" width="44" height="22" rx="11"/><text x="${mx}" y="${my + 4}" text-anchor="middle">${E(e.label)}</text></g>`
          : "";
      return `<g><title>${E(e.state === "open" ? "open" : "closed")}${e.danger ? " - big level jump" : ""}</title><line class="${cls}" x1="${a.cx}" y1="${a.cy}" x2="${b.cx}" y2="${b.cy}"/>${mark}</g>`;
    })
    .join("");
  const boxes = map.nodes
    .map((n) => {
      const x = at[n.id].cx - BW / 2,
        y = at[n.id].cy - BH / 2;
      const range = n.level ? `Lv ${n.level[0]}-${n.level[1]}` : "";
      const kindLabel = RM_KIND_LABEL[n.kind] || n.kind;
      // continent: level range only; district: kind and range on two short lines (the box is narrow)
      const subs = n.kind === "unbuilt" ? [kindLabel] : plane ? [range] : [kindLabel, range];
      const lines = rmWrap(plane ? n.label.split(" \u00b7 ")[0] : n.label, plane ? 20 : 10, plane ? 2 : 3) // continent: full "new · old" name stays in the tooltip
        .map(
          (t, i) =>
            `<tspan x="${x + BW / 2}" dy="${i ? 15 : 0}">${E(t)}</tspan>`,
        )
        .join("");
      const link = n.record
        ? ` data-record="${E(n.record)}" role="link" tabindex="0" onclick="openRecordFromEl(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecordFromEl(this)}"`
        : "";
      return (
        `<g class="rm-node rm-node--${E(n.kind)}"${link}><title>${E(n.label)}</title><rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="10"/>` +
        `<text class="rm-name" x="${x + BW / 2}" y="${y + 20}" text-anchor="middle">${lines}</text>` +
        subs.filter(Boolean).map((t, i, all) => `<text class="rm-sub" x="${x + BW / 2}" y="${y + BH - 9 - (all.length - 1 - i) * 15}" text-anchor="middle">${E(t)}</text>`).join("") + "</g>"
      );
    })
    .join("");
  const kinds = [...new Set(map.nodes.map((n) => n.kind))];
  const legend =
    kinds
      .map(
        (k) =>
          `<li><span class="rm-swatch rm-swatch--${E(k)}"></span>${E(RM_KIND_LABEL[k] || k)}</li>`,
      )
      .join("") +
    '<li><span class="rm-line"></span>Open</li><li><span class="rm-line rm-line--closed"></span>Closed</li>' +
    (map.edges.some((e) => e.danger)
      ? '<li><span class="rm-line rm-line--danger"></span><b>!</b> Open door to a much higher level</li>'
      : "");
  return `<figure class="record-map${plane ? " record-map--plane" : ""}" aria-label="Map"><div class="record-map__scroll"><svg viewBox="0 0 ${W} ${H}" style="${plane ? `min-width:${W}px` : `max-width:${Math.round(W * 1.3)}px;margin:0 auto`}" role="group" aria-label="Map of ${E(map.nodes.length)} places">${edges}${boxes}${dangerMarks}</svg></div>${plane ? '<p class="record-map__hint">Swipe sideways to see the whole map</p>' : ""}<ul class="record-map__legend">${legend}</ul></figure>`;
}

async function renderRecordPage(main) {
  const key = CURRENT_RECORD;
  if (main.dataset.record === key) return;   // typing in the box re-renders; do not refetch the same page
  main.dataset.record = key;
  const cut = key.indexOf(':');
  const kind = cut < 0 ? key : key.slice(0, cut), id = cut < 0 ? '' : key.slice(cut + 1);
  document.getElementById('topbarTitle').textContent = 'Record';
  main.innerHTML = `<article id="recordPage" class="record-page" aria-busy="true"><div class="record-page__skeleton">&nbsp;</div></article>`;
  let res, body;
  try {
    res = await fetch(`/api/record?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`);
    body = await res.json();
  } catch (err) { body = { ok: false, error: 'Search is unavailable' }; }
  if (CURRENT_RECORD !== key) return;         // the user moved on while this was loading
  if (!body.ok) {
    main.innerHTML = `<article id="recordPage" class="record-page"><p role="alert">${escapeHtml(res && res.status === 404 ? `No such record: ${key}` : body.error)}</p></article>`;
    document.getElementById('globalSearch').focus();
    return;
  }
  const r = body.record;
  const groups = body.relations.map(g => `
    <section data-relation="${escapeHtml(g.label)}">
      <h2>${escapeHtml(g.label)} <span class="nav-section-count">${g.items.length}</span></h2>
      <ul>${g.items.map(it => `<li><button type="button" class="rms-link" data-record="${escapeHtml(it.kind + ':' + it.id)}" onclick="openRecordFromEl(this)"><span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(it.kind.replace(/_/g, ' '))}</span> ${escapeHtml(it.title)}</button></li>`).join('')}</ul>
    </section>`).join('');
  main.innerHTML = `
    <article id="recordPage" class="record-page">
      <div class="page-hero__eyebrow">${escapeHtml(r.kind.replace(/_/g, ' '))}${r.concept === 'legacy' ? ' · <span class="joy-badge joy-badge--neutral joy-badge--sm">Old concept</span>' : ''}</div>
      <h1>${escapeHtml(r.title)}</h1>
      ${r.summary ? `<p class="record-page__summary">${escapeHtml(r.summary)}</p>` : ''}
      ${body.map ? renderRecordMap(body.map) : ''}
      <p class="record-page__tags">${body.tags.map(t => `<span class="joy-badge joy-badge--neutral joy-badge--sm">${escapeHtml(t)}</span>`).join(' ')}</p>
      ${r.viewUrl ? `<p><a id="recordOpenLink" class="joy-button joy-button--outline joy-button--sm" href="${escapeHtml(r.viewUrl)}">Open in ${escapeHtml(recordEntryLabel(r.viewUrl))}</a></p>` : ''}
      ${groups || '<p class="record-page__empty">Nothing is linked to this yet</p>'}
      ${r.sourceFile ? `<p class="mono record-page__source">${escapeHtml(r.sourceFile)}</p>` : ''}
    </article>`;
  document.getElementById('topbarTitle').textContent = r.title;
  main.querySelectorAll('.record-map__scroll').forEach(el => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; });   // phone: open on the middle, where the start town is
}

function initRecordSearch() {
  const input = document.getElementById('globalSearch');
  const pop = document.getElementById('searchPopover');
  input.addEventListener('input', () => runRecordSearch(input.value));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) runRecordSearch(input.value); });
  document.getElementById('searchIncludeArchive').addEventListener('change', () => runRecordSearch(input.value));
  pop.addEventListener('click', e => { const row = e.target.closest('[data-record]'); if (row) openRecordFromEl(row); });
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.sidebar-search')) closeSearchPopover();
  });
  window.addEventListener('resize', () => { if (!pop.hidden) placeSearchPopover(); });
  document.getElementById('searchIncludeArchive').addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); input.focus(); if (e.key === 'Escape') closeSearchPopover(); }
  });
  input.addEventListener('keydown', e => {
    const rows = [...pop.querySelectorAll('[data-record]')];
    const at = rows.findIndex(row => row.getAttribute('aria-selected') === 'true');
    if (e.key === 'Escape') { closeSearchPopover(); return; }
    if (e.key === 'Tab' && !e.shiftKey && !pop.hidden) { e.preventDefault(); document.getElementById('searchIncludeArchive').focus(); return; }
    if (pop.hidden || !rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === next)));
      rows[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openRecordFromEl(rows[Math.max(0, at)]);
    }
  });
}
