import { MAP_BUILDER_CLASS, MAPS_CLASS, fetchJson } from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";
import { createPanZoom, linkPanZoom } from "./panzoom.mjs";
import {
  statusText,
  groupSteps,
  progress,
  rowActions,
  validateSeed,
  badgeCount,
  reduce,
  reviewRows,
  publishStepsText,
  decisionReasons,
  reviewDecided,
  publishFailure,
  historyRows,
  rerunChains,
  logTailUrl,
} from "./map-builder-model.mjs";

/**
 * F-052 Task 10 — the Map Builder tab: start/watch world-generation draft
 * jobs against the local atelier/map-builder service (server.mjs, port
 * 6016, no default fallback — see global-constraints.md).
 *
 * Same mount contract as maps.mjs/forge.mjs: not an asset-manifest kind, no
 * dependency on manifest.json et al, mounted in both main.mjs's failure and
 * happy paths (mountMapBuilderNav/mountMapBuilder are only ever awaited
 * here, never gated on the critical manifest fetch).
 *
 * Unlike those siblings, this tab's OWN data source is a live local service
 * that may simply not be running — that is a normal, expected state (most
 * checkouts won't have `node atelier/map-builder/server.mjs` up), rendered
 * as a read-only notice with no interactive controls rather than a broken
 * page or a silently-missing section (the "every artifact observable" rule
 * still applies to the state itself: the tab must say WHY there's nothing
 * to watch, not disappear).
 */

const apiBase = "/api";
// Draft jobs page, fetched identically on initial mount, poll fallback, and
// every SSE "open" resync — the query never varies, only who's asking.
const JOBS_URL = apiBase + "/jobs?kind=draft&limit=50";
const HEALTH_TIMEOUT_MS = 2000;
// config.json's pollMs is a server-side value — this module runs in the
// browser and has no route to read it, so the interval is hard-coded here.
// Only used as the SSE fallback (EventSource onerror), per global-constraints
// "Tab must work with SSE down (poll GET /api/jobs every 2 s)".
const POLL_MS = 2000;
// content/world/budgets.json loop[stage="generate"] — the draft job's only
// timed phase before --no-png/--stage-report exits (sheets are not rendered
// for a draft). Not fetched client-side (no route exists for it either);
// hard-coded with the same treatment as POLL_MS above. If budgets.json's
// generate row ever changes, this drifts until someone notices the progress
// bar disagreeing with reality — same risk POLL_MS already carries.
const GENERATE_TARGET_MS = 6000;
const GENERATE_FAIL_MS = 12000;
// History (Task 19): every kind, not just drafts — the Start table's page
// stays draft-only (Phase 1 contract), this wider page is fetched when the
// History screen opens and on every resync while it is showing.
const HISTORY_URL = apiBase + "/jobs?limit=200";
// Only a draft has a documented duration target (budgets.json generate
// row, see GENERATE_TARGET_MS); the other kinds show their plain duration.
const HISTORY_TARGETS = { draft: GENERATE_TARGET_MS };
const HISTORY_KINDS = ["draft", "dry-run", "publish", "undo"];
const HISTORY_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled", "interrupted"];
const LOG_TAIL_LINES = 200;
const LOG_POLL_MS = 1000;

async function checkHealth() {
  try {
    const res = await fetch(apiBase + "/health", {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error?.message ?? "HTTP " + res.status);
  return data;
}

async function deleteJson(url) {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok && res.status !== 204) throw new Error(data?.error?.message ?? "HTTP " + res.status);
  return data; // null for a 204
}

function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === "className") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  for (const child of children ?? []) {
    if (child != null) node.appendChild(child);
  }
  return node;
}

function renderReadOnly(section) {
  const p = el("p", { className: "mb-readonly" }, [
    document.createTextNode("Builder service not running — start it with "),
    el("code", { text: "node atelier/map-builder/server.mjs" }),
  ]);
  section.appendChild(p);
}

function updateBadge(jobs) {
  const count = badgeCount(jobs);
  initHealth(MAP_BUILDER_CLASS, count);
  bumpHealth(MAP_BUILDER_CLASS, { ok: count });
  renderSidebarBadge(MAP_BUILDER_CLASS);
}

/** Sidebar entry. Mirrors mountForgeNav/mountMapsNav — placeholder count of
 * 1 until mountMapBuilder resolves and updateBadge() re-inits it with the
 * real drafts-awaiting-review count. */
export function mountMapBuilderNav(sidebarNav) {
  initHealth(MAP_BUILDER_CLASS, 1);
  const btn = buildSidebarItem(MAP_BUILDER_CLASS, 1);
  sidebarNav.appendChild(btn);
  bumpHealth(MAP_BUILDER_CLASS, { ok: 1 });
  renderSidebarBadge(MAP_BUILDER_CLASS);
}

export async function mountMapBuilder(main) {
  const section = el("section", {
    className: "kind-section",
    id: "section-" + MAP_BUILDER_CLASS,
  });
  section.dataset.kind = MAP_BUILDER_CLASS;
  section.appendChild(el("h2", { text: "Map Builder" }));

  const healthy = await checkHealth();
  if (!healthy) {
    renderReadOnly(section);
    main.appendChild(section);
    return;
  }

  let world, stepsJson, jobsPage;
  try {
    [world, stepsJson, jobsPage] = await Promise.all([
      fetchJson(apiBase + "/world", "map-builder world"),
      fetchJson(apiBase + "/steps", "map-builder steps"),
      fetchJson(JOBS_URL, "map-builder jobs"),
    ]);
  } catch (err) {
    console.warn("[asset-storybook] map-builder service answered /api/health but a follow-up fetch failed:", err);
    renderReadOnly(section);
    main.appendChild(section);
    return;
  }

  // Shared across both screens (not just the form) — a Stop/cancel/rerun/
  // delete action can be triggered from either the Start table or the Build
  // screen, and the failure needs to be visible wherever the user is.
  const errorBanner = el("p", { className: "mb-error", "aria-live": "polite" });
  section.appendChild(errorBanner);

  let state = {
    jobs: new Map((jobsPage.jobs ?? []).map((j) => [j.id, j])),
    world,
    connected: false,
  };
  let selectedJobId = null;
  let activeScreen = "start"; // "start" | "build" | "history" | "review" | "publish"

  // ---------- screen chrome: tab bar + screens ----------

  const tabBar = el("div", { className: "mb-screen-tabs" });
  const startTab = el("button", { type: "button", className: "story-tab mb-screen-tab active", text: "Start" });
  const buildTab = el("button", { type: "button", className: "story-tab mb-screen-tab", text: "Build" });
  const historyTab = el("button", { type: "button", className: "story-tab mb-screen-tab", text: "History" });
  const screenTabs = [
    ["start", startTab],
    ["build", buildTab],
    ["history", historyTab],
  ];
  for (const [, tab] of screenTabs) tabBar.appendChild(tab);
  section.appendChild(tabBar);

  const startScreen = el("div", { className: "mb-screen mb-start-screen" });
  const buildScreen = el("div", { className: "mb-screen mb-build-screen", hidden: "" });
  const historyScreen = el("div", { className: "mb-screen mb-history-screen", hidden: "" });
  const reviewScreen = el("div", { className: "mb-screen mb-review-screen", hidden: "" });
  const publishScreen = el("div", { className: "mb-screen mb-publish-screen", hidden: "" });
  section.appendChild(startScreen);
  section.appendChild(buildScreen);
  section.appendChild(historyScreen);
  section.appendChild(reviewScreen);
  section.appendChild(publishScreen);

  // Review and Publish are reached from row/screen actions, not from the tab
  // bar (there is nothing useful to show there without a draft already
  // picked) — the tab bar itself is hidden while either is active, and Back
  // returns to Start.
  function setScreen(name) {
    activeScreen = name;
    for (const [id, tab] of screenTabs) {
      tab.classList.toggle("active", name === id);
      tab.setAttribute("aria-pressed", name === id ? "true" : "false");
    }
    tabBar.hidden = name === "review" || name === "publish";
    startScreen.hidden = name !== "start";
    buildScreen.hidden = name !== "build";
    historyScreen.hidden = name !== "history";
    reviewScreen.hidden = name !== "review";
    publishScreen.hidden = name !== "publish";
  }
  startTab.addEventListener("click", () => setScreen("start"));
  buildTab.addEventListener("click", () => setScreen("build"));
  historyTab.addEventListener("click", () => openHistoryScreen());
  setScreen("start");

  // ---------- Start screen: header card ----------

  const headerCard = el("div", { className: "mb-header-card" });
  startScreen.appendChild(headerCard);

  // ---------- Start screen: form ----------

  const modeTabs = el("div", { className: "mb-mode-tabs" });
  const randomModeBtn = el("button", { type: "button", className: "story-tab mb-mode-tab active", text: "Random" });
  const specificModeBtn = el("button", { type: "button", className: "story-tab mb-mode-tab", text: "Specific seed" });
  modeTabs.appendChild(randomModeBtn);
  modeTabs.appendChild(specificModeBtn);

  let mode = "random";

  const countLabel = el("label", { className: "mb-field", text: "Count " });
  const countSelect = el("select", { id: "mb-count" });
  for (let n = 1; n <= 4; n++) {
    countSelect.appendChild(el("option", { value: String(n), text: String(n) }));
  }
  countLabel.appendChild(countSelect);
  const randomFields = el("div", { className: "mb-mode-fields mb-mode-random" }, [countLabel]);

  const seedLabel = el("label", { className: "mb-field", text: "Seed " });
  const seedInput = el("input", {
    id: "mb-seed",
    type: "text",
    placeholder: "16 lowercase hex characters",
    autocomplete: "off",
  });
  seedLabel.appendChild(seedInput);
  const seedMsg = el("p", { className: "mb-seed-msg", id: "mb-seed-msg", "aria-live": "polite" });
  const specificFields = el("div", { className: "mb-mode-fields mb-mode-specific", hidden: "" }, [
    seedLabel,
    seedMsg,
  ]);

  const buildBtn = el("button", { type: "submit", className: "mb-build-btn", text: "Build 1" });
  const form = el("form", { className: "mb-form" }, [
    modeTabs,
    randomFields,
    specificFields,
    buildBtn,
  ]);
  startScreen.appendChild(form);

  function updateFormValidity() {
    if (mode === "random") {
      buildBtn.disabled = false;
      buildBtn.textContent = "Build " + countSelect.value;
      seedMsg.textContent = "";
      return;
    }
    const value = seedInput.value.trim();
    buildBtn.textContent = "Build";
    if (value === "") {
      seedMsg.textContent = "";
      buildBtn.disabled = true;
      return;
    }
    const v = validateSeed(value);
    seedMsg.textContent = v.ok ? "" : v.message;
    buildBtn.disabled = !v.ok;
  }

  function setMode(next) {
    mode = next;
    randomModeBtn.classList.toggle("active", mode === "random");
    specificModeBtn.classList.toggle("active", mode === "specific");
    randomFields.hidden = mode !== "random";
    specificFields.hidden = mode !== "specific";
    updateFormValidity();
  }
  randomModeBtn.addEventListener("click", () => setMode("random"));
  specificModeBtn.addEventListener("click", () => setMode("specific"));
  countSelect.addEventListener("change", updateFormValidity);
  seedInput.addEventListener("input", updateFormValidity);
  updateFormValidity();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    errorBanner.textContent = "";
    const body =
      mode === "specific"
        ? { kind: "draft", seed: seedInput.value.trim() }
        : { kind: "draft", count: Number(countSelect.value) };
    buildBtn.disabled = true;
    try {
      await postJson(apiBase + "/jobs", body);
      if (mode === "specific") seedInput.value = "";
    } catch (err) {
      errorBanner.textContent = "Could not start build: " + err.message;
    } finally {
      updateFormValidity();
    }
  });

  // ---------- Start screen: drafts table ----------
  //
  // Fix round 1, D3: the table itself, its header row, and the empty-state
  // paragraph are created ONCE here and never replaced — syncTable() below
  // only creates/removes/reorders per-job <tr>s and patches their cells in
  // place, so a keyboard user's focus on a row's action button survives
  // every job.step frame that doesn't change that job's status (the common
  // case: ~21 step frames per build, only 1-2 status transitions).

  const tableEmpty = el("p", { className: "empty-state", text: "No draft builds yet." });
  const table = el("table", { className: "grid mb-jobs-table" });
  const tableHeadRow = el("tr", null, [
    el("th", { scope: "col", text: "Seed" }),
    el("th", { scope: "col", text: "Status" }),
    el("th", { scope: "col", text: "Started" }),
    el("th", { scope: "col", text: "Actions" }),
  ]);
  table.appendChild(tableHeadRow);
  startScreen.appendChild(tableEmpty);
  startScreen.appendChild(table);

  // jobId -> { tr, seedCode, statusCell, startedCell, actionsCell, lastStatus }
  const tableRows = new Map();

  // ---------- Build screen ----------
  //
  // Same rationale as the table: every element below is created once and
  // patched in place by patchBuildScreen(), so the "Stop this draft" button
  // (the one focusable control in this screen) is never destroyed by a
  // job.step frame while a keyboard user is on it, and the aria-live status
  // paragraph is a genuine live-region MUTATION (text change on an existing
  // node), not a freshly-inserted node screen readers won't announce.

  const buildEmpty = el("p", { className: "empty-state", text: "Pick a draft from Start to watch its build." });
  const buildTitleCode = el("code");
  const buildTitle = el("h3", { className: "mb-build-title" }, [document.createTextNode("Seed "), buildTitleCode]);
  const buildStatus = el("p", { className: "mb-build-status", "aria-live": "polite" });
  const buildErrorP = el("p", { className: "mb-build-error" });
  const progressFill = el("div", { className: "mb-progress-fill" });
  const progressTarget = el("div", { className: "mb-progress-target" });
  const progressBar = el("div", { className: "mb-progress" }, [progressFill, progressTarget]);
  const checklistHost = el("div", { className: "mb-checklist" });
  const stopBtn = el("button", { type: "button", className: "mb-stop-btn", text: "Stop this draft" });
  stopBtn.addEventListener("click", () => {
    if (selectedJobId) runAction("cancel", selectedJobId);
  });

  const buildHost = el("div", { className: "mb-build-host" }, [
    buildEmpty,
    buildTitle,
    buildStatus,
    progressBar,
    buildErrorP,
    checklistHost,
    stopBtn,
  ]);
  buildScreen.appendChild(buildHost);

  function openBuildScreen(jobId) {
    selectedJobId = jobId;
    setScreen("build");
    patchBuildScreen();
  }

  async function runAction(actionId, jobId) {
    errorBanner.textContent = "";
    try {
      if (actionId === "watch" || actionId === "why") {
        openBuildScreen(jobId);
        return;
      }
      if (actionId === "review") {
        openReviewScreen(jobId);
        return;
      }
      if (actionId === "cancel") {
        await postJson(apiBase + "/jobs/" + jobId + "/cancel", {});
        return;
      }
      if (actionId === "rerun") {
        await postJson(apiBase + "/jobs/" + jobId + "/rerun", {});
        return;
      }
      if (actionId === "delete") {
        await deleteJson(apiBase + "/jobs/" + jobId);
        const jobs = new Map(state.jobs);
        jobs.delete(jobId);
        state = { ...state, jobs };
        if (selectedJobId === jobId) selectedJobId = null;
        renderAll();
        return;
      }
    } catch (err) {
      errorBanner.textContent = "Action failed: " + err.message;
    }
  }

  function renderHeaderCard() {
    headerCard.replaceChildren(
      el("div", { className: "mb-header-stat" }, [
        document.createTextNode("Current seed: "),
        el("code", { text: state.world.seed ?? "—" }),
      ]),
      el("div", { className: "mb-header-stat" }, [
        document.createTextNode(
          "Sea:land ratio " +
            (state.world.ratio?.value ?? "—") +
            " (target " +
            (state.world.ratio?.target ?? "—") +
            ", band " +
            (state.world.ratio?.min ?? "—") +
            "–" +
            (state.world.ratio?.max ?? "—") +
            ")",
        ),
      ]),
    );
  }

  function jobsSortedNewestFirst() {
    return [...state.jobs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // Fix round 1, D3 — keyed row diff: creates a row only the first time a
  // job id is seen, removes rows for jobs no longer in state, reorders an
  // existing row only when its position actually changed (`.after()` is a
  // no-op if the row is already right after `prevTr`), and only rebuilds
  // the Actions cell's buttons when `job.status` actually transitioned —
  // NOT on every job.step frame, which is what previously stole focus from
  // whatever action button a keyboard user had just pressed.
  function createTableRow(job) {
    const seedCode = el("code");
    const statusCell = el("td", { className: "mb-cell-status", "aria-live": "polite" });
    const startedCell = el("td");
    const actionsCell = el("td", { className: "mb-cell-actions" });
    const tr = el("tr", null, [el("td", { className: "mb-cell-seed" }, [seedCode]), statusCell, startedCell, actionsCell]);
    tr.dataset.jobId = job.id;
    return { tr, seedCode, statusCell, startedCell, actionsCell, lastStatus: null };
  }

  function patchTableRow(entry, job) {
    if (entry.seedCode.textContent !== job.seed) entry.seedCode.textContent = job.seed;
    const statusStr = statusText(job, { stageCount: state.world.stageCount });
    if (entry.statusCell.textContent !== statusStr) entry.statusCell.textContent = statusStr;
    const startedStr = job.startedAt ?? "—";
    if (entry.startedCell.textContent !== startedStr) entry.startedCell.textContent = startedStr;

    if (entry.lastStatus !== job.status) {
      entry.lastStatus = job.status;
      const buttons = rowActions(job).map((action) => {
        const btn = el("button", { type: "button", className: "mb-row-action", text: action.label });
        btn.addEventListener("click", () => runAction(action.id, job.id));
        return btn;
      });
      entry.actionsCell.replaceChildren(...buttons);
    }
  }

  function syncTable() {
    const jobs = jobsSortedNewestFirst();
    table.hidden = jobs.length === 0;
    tableEmpty.hidden = jobs.length !== 0;

    const seen = new Set();
    let prevTr = tableHeadRow;
    for (const job of jobs) {
      seen.add(job.id);
      let entry = tableRows.get(job.id);
      if (!entry) {
        entry = createTableRow(job);
        tableRows.set(job.id, entry);
      }
      patchTableRow(entry, job);
      if (prevTr.nextElementSibling !== entry.tr) prevTr.after(entry.tr);
      prevTr = entry.tr;
    }
    for (const [id, entry] of tableRows) {
      if (!seen.has(id)) {
        entry.tr.remove();
        tableRows.delete(id);
      }
    }
  }

  // Fix round 1, D3 — patch, don't rebuild: every element here is created
  // once (above, alongside buildHost) and only its text/attributes/children
  // are mutated, so `stopBtn` (the only focusable control on this screen)
  // and `buildStatus` (an aria-live region) are the SAME nodes across every
  // job.step frame, not freshly inserted ones.
  function patchBuildScreen() {
    const job = selectedJobId ? state.jobs.get(selectedJobId) : null;
    const has = Boolean(job);
    buildEmpty.hidden = has;
    buildTitle.hidden = !has;
    buildStatus.hidden = !has;
    checklistHost.hidden = !has;
    if (!has) {
      progressBar.hidden = true;
      buildErrorP.hidden = true;
      stopBtn.hidden = true;
      // Fix round 2, D4: checklistHost has `display: grid` in its own CSS
      // rule, which beats `.hidden` regardless of specificity (see the
      // index.html comment beside `.mb-checklist[hidden]`) — clear its
      // content here too, not just hide it, so a deleted/no-longer-selected
      // job's stale checklist can never be visible even if hiding ever
      // fails again for some other reason.
      checklistHost.replaceChildren();
      return;
    }

    if (buildTitleCode.textContent !== job.seed) buildTitleCode.textContent = job.seed;
    const statusStr = statusText(job, { stageCount: state.world.stageCount });
    if (buildStatus.textContent !== statusStr) buildStatus.textContent = statusStr;

    if (job.status === "running") {
      const p = progress(job, { targetMs: GENERATE_TARGET_MS, failMs: GENERATE_FAIL_MS });
      progressBar.hidden = false;
      progressFill.className = "mb-progress-fill mb-over-" + p.over;
      progressFill.style.width = p.pct + "%";
      progressTarget.style.left = p.targetPct + "%";
    } else {
      progressBar.hidden = true;
    }

    if (job.status === "failed" && job.error) {
      buildErrorP.hidden = false;
      const firstLine = job.error.split("\n")[0];
      if (buildErrorP.textContent !== firstLine) buildErrorP.textContent = firstLine;
    } else {
      buildErrorP.hidden = true;
    }

    // The checklist has no focusable controls (plain <li> text), so a full
    // rebuild here is safe — nothing to lose focus on, unlike the table
    // rows and the Stop button above.
    const groups = groupSteps({ steps: job.steps, stepsJson, running: job.status === "running" });
    checklistHost.replaceChildren(
      ...groups.map((group) => {
        const list = el(
          "ul",
          { className: "mb-checklist-stages" },
          group.stages.map((stage) => el("li", { className: "mb-stage mb-stage-" + stage.status, text: stage.label })),
        );
        return el("div", { className: "mb-checklist-group" }, [
          el("p", { className: "mb-checklist-group-label", text: group.label }),
          list,
        ]);
      }),
    );

    stopBtn.hidden = !(job.status === "queued" || job.status === "running");
  }

  // ---------- Review screen ----------
  //
  // reviewData is fetched once per openReviewScreen() call (GET .../review is
  // a static snapshot of the draft — only the job's own `review.decision`
  // changes afterward, and that arrives through the normal jobs state, not a
  // re-fetch). Everything below is built once and patched in place, same
  // rationale as the Build screen: patchReviewScreen() runs on every
  // renderAll() (every SSE frame), and the reject-reason <select> is a
  // focusable control that must not be recreated out from under a keyboard
  // user.

  let reviewJobId = null;
  let reviewData = null;
  let reviewShowAll = false;
  let reviewViewerMode = "side-by-side"; // "side-by-side" | "draft-only" | "current-only"
  let reviewSelectedSheetId = null;

  const reviewEmpty = el("p", { className: "empty-state", text: "Pick a draft from Start to review it." });
  const reviewBanner = el("p", { className: "mb-review-banner" });

  const viewerModeBtn = (modeId, label) => {
    const b = el("button", { type: "button", className: "story-tab mb-viewer-mode-tab", text: label });
    b.dataset.mode = modeId;
    return b;
  };
  const viewerModeSideBtn = viewerModeBtn("side-by-side", "Side-by-side");
  const viewerModeDraftBtn = viewerModeBtn("draft-only", "Draft only");
  const viewerModeCurrentBtn = viewerModeBtn("current-only", "Current only");
  const viewerModeBar = el("div", { className: "mb-viewer-mode-tabs" }, [
    viewerModeSideBtn,
    viewerModeDraftBtn,
    viewerModeCurrentBtn,
  ]);
  for (const btn of [viewerModeSideBtn, viewerModeDraftBtn, viewerModeCurrentBtn]) {
    btn.addEventListener("click", () => {
      reviewViewerMode = btn.dataset.mode;
      patchReviewScreen();
    });
  }

  // Only sheets the draft actually rendered (fabric/overlay — see
  // review.mjs's header comment) are offered here: every other sheet's
  // draftSvg is null, and setting an <img> src to null/empty would issue a
  // request for the current document instead of degrading quietly.
  const reviewSheetSelect = el("select", { className: "mb-review-sheet-select" });
  reviewSheetSelect.addEventListener("change", () => {
    reviewSelectedSheetId = reviewSheetSelect.value;
    updateReviewViewerSrcs();
  });

  const draftStage = el("div", { className: "mb-review-stage" });
  const draftImg = el("img", { className: "mb-review-img" });
  draftStage.appendChild(draftImg);
  const draftPane = el("div", { className: "mb-review-pane" }, [
    el("p", { className: "mb-review-pane-label", text: "Draft" }),
    draftStage,
  ]);

  const currentStage = el("div", { className: "mb-review-stage" });
  const currentImg = el("img", { className: "mb-review-img" });
  currentStage.appendChild(currentImg);
  const currentPane = el("div", { className: "mb-review-pane" }, [
    el("p", { className: "mb-review-pane-label", text: "Current" }),
    currentStage,
  ]);

  const viewerHost = el("div", { className: "mb-review-viewer" }, [draftPane, currentPane]);

  // Two independent instances sharing one transform (Task 16's whole reason
  // for the panzoom.mjs extraction) — panning/zooming either pane moves both.
  const draftPanZoom = createPanZoom({ stage: draftStage, img: draftImg });
  const currentPanZoom = createPanZoom({ stage: currentStage, img: currentImg });
  linkPanZoom(draftPanZoom, currentPanZoom);

  function updateReviewViewerSrcs() {
    const sheet = reviewData?.sheets.find((s) => s.id === reviewSelectedSheetId);
    if (!sheet || !sheet.draftSvg) return;
    draftPanZoom.setSrc(sheet.draftSvg);
    currentPanZoom.setSrc(sheet.currentSvg);
    draftPanZoom.reset();
    currentPanZoom.reset();
  }

  const continentsTable = el("table", { className: "grid mb-review-table" });
  const continentsShowAllBtn = el("button", { type: "button", className: "story-tab", text: "Show all" });
  continentsShowAllBtn.addEventListener("click", () => {
    reviewShowAll = !reviewShowAll;
    patchReviewScreen();
  });

  const metricsHost = el("div", { className: "mb-review-metrics" });
  const checksHost = el("div", { className: "mb-review-checks" });
  const todosHost = el("div", { className: "mb-review-todos" });
  const acceptSummaryP = el("p");
  const acceptFilesList = el("ul", { className: "mb-review-list" });
  const acceptSummaryHost = el("div", { className: "mb-review-accept" }, [
    el("p", { className: "mb-checklist-group-label", text: "If you accept" }),
    acceptSummaryP,
    el("details", { className: "mb-review-files" }, [el("summary", { text: "See every file" }), acceptFilesList]),
  ]);
  let acceptFilesFor = null; // the reviewData the file list was last filled from

  const reasonSelect = el("select", { className: "mb-review-reason" });
  for (const reason of decisionReasons) reasonSelect.appendChild(el("option", { value: reason, text: reason }));

  const reviewBackBtn = el("button", { type: "button", className: "story-tab", text: "Back" });
  const rejectBtn = el("button", { type: "button", className: "story-tab", text: "Reject draft" });
  const tryAnotherBtn = el("button", { type: "button", className: "story-tab", text: "Try another seed" });
  const acceptDraftBtn = el("button", { type: "button", className: "mb-build-btn", text: "Accept draft…" });

  reviewBackBtn.addEventListener("click", () => setScreen("start"));
  tryAnotherBtn.addEventListener("click", () => {
    setScreen("start");
    setMode("specific");
    seedInput.focus();
  });
  rejectBtn.addEventListener("click", async () => {
    errorBanner.textContent = "";
    try {
      const res = await postJson(apiBase + "/drafts/" + reviewJobId + "/decision", {
        decision: "rejected",
        reasons: [reasonSelect.value],
      });
      // Apply the returned record now (Batch H stale-list fix) — the same
      // upsert the SSE frame performs, so the table/badge don't wait for it.
      apply({ type: "jobs.synced", jobs: [res.job] });
      setScreen("start");
    } catch (err) {
      errorBanner.textContent = "Could not record the decision: " + err.message;
    }
  });
  acceptDraftBtn.addEventListener("click", () => openPublishScreen(reviewJobId));

  const reviewActions = el("div", { className: "mb-review-actions" }, [
    reviewBackBtn,
    rejectBtn,
    reasonSelect,
    tryAnotherBtn,
    acceptDraftBtn,
  ]);

  const reviewBody = el("div", { className: "mb-review-body" }, [
    viewerModeBar,
    reviewSheetSelect,
    viewerHost,
    el("h3", { text: "Continents — draft vs current" }),
    continentsTable,
    continentsShowAllBtn,
    metricsHost,
    checksHost,
    todosHost,
    acceptSummaryHost,
    reviewActions,
  ]);

  reviewScreen.appendChild(reviewEmpty);
  reviewScreen.appendChild(reviewBanner);
  reviewScreen.appendChild(reviewBody);

  async function openReviewScreen(jobId) {
    reviewJobId = jobId;
    reviewData = null;
    reviewShowAll = false;
    reviewViewerMode = "side-by-side";
    reviewSelectedSheetId = null;
    setScreen("review");
    patchReviewScreen();
    try {
      reviewData = await fetchJson(apiBase + "/drafts/" + jobId + "/review", "map-builder review");
      const firstDraftSheet = reviewData.sheets.find((s) => s.draftSvg);
      reviewSelectedSheetId = firstDraftSheet ? firstDraftSheet.id : null;
      updateReviewViewerSrcs();
    } catch (err) {
      errorBanner.textContent = "Could not load the review: " + err.message;
    }
    patchReviewScreen();
  }

  const fmtDelta = (n) => (n > 0 ? "+" + n : String(n));

  function patchReviewScreen() {
    const job = reviewJobId ? state.jobs.get(reviewJobId) : null;
    const loaded = Boolean(job) && Boolean(reviewData);
    reviewEmpty.hidden = Boolean(reviewJobId);
    reviewBanner.hidden = !reviewJobId;
    reviewBody.hidden = !loaded;
    if (!reviewJobId) return;

    if (!job) {
      reviewBanner.textContent = "This draft no longer exists.";
      return;
    }
    const decision = job.review?.decision ?? null;
    reviewBanner.textContent =
      decision === "rejected"
        ? "Rejected · " + (job.review.reasons ?? []).join(", ")
        : decision === "accepted"
          ? "Accepted"
          : "Waiting for your decision";
    // Once decided or published there is nothing left to decide (Batch H
    // review I2) — the queue would not refuse a second publish of it.
    const decided = reviewDecided(job);
    rejectBtn.hidden = decided;
    reasonSelect.hidden = decided;
    acceptDraftBtn.hidden = decided;
    if (!reviewData) return; // still loading — errorBanner carries a fetch failure, if any

    viewerModeSideBtn.classList.toggle("active", reviewViewerMode === "side-by-side");
    viewerModeDraftBtn.classList.toggle("active", reviewViewerMode === "draft-only");
    viewerModeCurrentBtn.classList.toggle("active", reviewViewerMode === "current-only");
    draftPane.hidden = reviewViewerMode === "current-only";
    currentPane.hidden = reviewViewerMode === "draft-only";

    if (reviewSheetSelect.dataset.loadedFor !== reviewJobId) {
      reviewSheetSelect.dataset.loadedFor = reviewJobId;
      const options = reviewData.sheets.filter((s) => s.draftSvg);
      reviewSheetSelect.replaceChildren(...options.map((s) => el("option", { value: s.id, text: s.title })));
    }
    if (reviewSelectedSheetId) reviewSheetSelect.value = reviewSelectedSheetId;

    const rows = reviewRows(reviewData, { showAll: reviewShowAll });
    continentsTable.replaceChildren(
      el("tr", null, [
        el("th", { scope: "col", text: "Continent" }),
        el("th", { scope: "col", text: "Land km² current → draft" }),
        el("th", { scope: "col", text: "Δ land" }),
        el("th", { scope: "col", text: "Δ regions" }),
        el("th", { scope: "col", text: "Δ settlements" }),
      ]),
      ...rows.map((r) =>
        el("tr", null, [
          el("td", { text: r.id }),
          el("td", { text: r.landKm2.current + " → " + r.landKm2.draft }),
          el("td", { text: fmtDelta(r.landKm2.delta) }),
          el("td", { text: fmtDelta(r.regions.delta) }),
          el("td", { text: fmtDelta(r.settlements.delta) }),
        ]),
      ),
    );
    continentsShowAllBtn.textContent = reviewShowAll ? "Show top 5" : "Show all (" + reviewData.deltas.length + ")";

    metricsHost.replaceChildren(
      el("p", null, [
        document.createTextNode(
          "Sea:land — current " +
            reviewData.current.ratio +
            ", draft " +
            (reviewData.draft.metrics?.seaLand ?? "—") +
            " (band " +
            reviewData.band.min +
            "–" +
            reviewData.band.max +
            ", target " +
            reviewData.band.target +
            ")",
        ),
      ]),
    );

    checksHost.replaceChildren(
      el("p", { className: "mb-checklist-group-label", text: "Checks — run when you accept" }),
      el(
        "ul",
        { className: "mb-review-list" },
        reviewData.gatesAtPublish.map((g) =>
          el("li", { text: g + " — checked during publish; a failure restores the current world automatically" }),
        ),
      ),
    );

    todosHost.replaceChildren(
      el("p", { className: "mb-checklist-group-label", text: "Known to-dos" }),
      reviewData.knownTodos.length
        ? el(
            "ul",
            { className: "mb-review-list" },
            reviewData.knownTodos.map((t) => el("li", { text: t })),
          )
        : el("p", { className: "empty-state", text: "None carried by this draft." }),
    );

    // Built once, patched in place (Batch H review m1): rebuilding the
    // <details> on every renderAll() — i.e. on every SSE frame from ANY job —
    // snapped an opened file list shut. Only re-fill it when the review
    // payload itself changed.
    if (acceptFilesFor !== reviewData) {
      acceptFilesFor = reviewData;
      const dr = reviewData.dryRun ?? { written: 0, deleted: 0, files: [] };
      acceptSummaryP.textContent = dr.written + " file(s) written, " + dr.deleted + " deleted.";
      acceptFilesList.replaceChildren(...dr.files.map((f) => el("li", { text: f.op + " " + f.path })));
    }
  }

  // ---------- Publish screen ----------
  //
  // One screen, four mutually-exclusive sub-views (Confirm / Publishing /
  // Published / Failed) keyed off the publish job's status — same
  // build-once-patch-in-place rule as everywhere else in this file.

  let publishDraftJobId = null;
  let publishJobId = null;

  const publishEmpty = el("p", { className: "empty-state", text: "Accept a draft from Review to publish it." });
  const publishBackBtn = el("button", { type: "button", className: "story-tab", text: "Back" });
  publishBackBtn.addEventListener("click", () => setScreen("start"));

  const publishStepsList = el(
    "ol",
    { className: "mb-review-list" },
    publishStepsText().map((label) => el("li", { text: label })),
  );
  const publishReplaceWarning = el("p", {
    className: "mb-publish-warning",
    text: "This replaces the current world — the seed, sheets and render lock all change.",
  });
  const publishDirtyWarning = el("p", { className: "mb-publish-warning" });
  const publishPngWarning = el("p", {
    className: "mb-publish-warning",
    text: "rsvg-convert not found on PATH — sheet PNGs will not be regenerated (SVGs still update).",
  });
  const publishConfirmBtn = el("button", { type: "button", className: "mb-build-btn", text: "Accept & publish" });
  publishConfirmBtn.addEventListener("click", async () => {
    errorBanner.textContent = "";
    publishConfirmBtn.disabled = true;
    try {
      const res = await postJson(apiBase + "/publish", { draftJobId: publishDraftJobId, confirm: true });
      publishJobId = res.job.id;
      apply({ type: "job.created", job: res.job });
    } catch (err) {
      errorBanner.textContent = "Could not start the publish: " + err.message;
      publishConfirmBtn.disabled = false;
    }
  });
  const publishConfirmHost = el("div", { className: "mb-publish-confirm" }, [
    el("h3", { text: "Confirm" }),
    publishStepsList,
    publishReplaceWarning,
    publishDirtyWarning,
    publishPngWarning,
    publishConfirmBtn,
  ]);

  const publishingStepsHost = el("ul", { className: "mb-checklist-stages" });
  const publishingHost = el("div", { className: "mb-publish-publishing" }, [
    el("h3", { text: "Publishing" }),
    publishingStepsHost,
    el("p", { className: "mb-build-status", text: "You can leave this page." }),
  ]);

  const publishedSeedCode = el("code");
  const publishUndoBtn = el("button", { type: "button", className: "mb-stop-btn", text: "Undo this publish" });
  const publishOpenMapsBtn = el("button", { type: "button", className: "story-tab", text: "Open Map Sheets" });
  // Both undo buttons (Published, and Failed's half-published case) start the
  // same job; they differ only in where the snapshotId comes from. The button
  // stays disabled after a successful start — the job frames take over.
  async function startUndo(btn, snapshotId) {
    errorBanner.textContent = "";
    btn.disabled = true;
    try {
      await postJson(apiBase + "/undo", { snapshotId });
    } catch (err) {
      errorBanner.textContent = "Could not start the undo: " + err.message;
      btn.disabled = false;
    }
  }
  publishUndoBtn.addEventListener("click", () => {
    const job = publishJobId ? state.jobs.get(publishJobId) : null;
    if (job?.snapshotId) startUndo(publishUndoBtn, job.snapshotId);
  });
  publishOpenMapsBtn.addEventListener("click", () => {
    document.querySelector('.sidebar-item[data-class="' + MAPS_CLASS + '"]')?.click();
  });
  // "N snapshots kept" beside Undo (Task 20): publish prunes to snapshotKeep
  // (config.json) after each success, so the count says how far back an undo
  // can reach. Fetched once per world.changed frame while this crumb shows —
  // state.world is a fresh object per frame, so its identity is the key.
  const snapshotCountP = el("p", { className: "mb-snapshot-count", "aria-live": "polite" });
  let snapshotCountFor = null;
  async function refreshSnapshotCount() {
    const forWorld = state.world;
    snapshotCountFor = forWorld;
    try {
      const res = await fetchJson(apiBase + "/snapshots", "map-builder snapshots");
      if (snapshotCountFor !== forWorld) return; // a newer frame already re-fetched
      const n = (res.snapshots ?? []).filter((s) => !s.corrupt).length;
      snapshotCountP.textContent = n + (n === 1 ? " snapshot kept" : " snapshots kept");
    } catch (err) {
      snapshotCountP.textContent = "";
      console.warn("[asset-storybook] map-builder snapshots fetch failed:", err);
    }
  }
  const publishedHost = el("div", { className: "mb-publish-published" }, [
    el("h3", { text: "Published" }),
    el("p", null, [document.createTextNode("Seed "), publishedSeedCode]),
    el("p", { text: "Sheets redrawn." }),
    publishUndoBtn,
    snapshotCountP,
    publishOpenMapsBtn,
    el("p", {
      className: "mb-readonly",
      text:
        "Commit content/world/, content/spine/ and game-client/assets/art/maps/ through your " +
        "release workflow — this service never touches git.",
    }),
  ]);

  const publishFailedStepP = el("p");
  const publishFailedErrorP = el("p", { className: "mb-build-error" });
  const publishRestoredP = el("p", { text: "Restored the previous world automatically." });
  // Batch H review I3: a failed auto-restore or a restart mid-publish leaves
  // the world possibly half-published — say so, and offer Undo keyed on the
  // job's own snapshotId (world.undoAvailable is false in the interrupted
  // case, so it cannot gate this button).
  const publishHalfPublishedP = el("p", { className: "mb-build-error" });
  const publishHalfUndoBtn = el("button", { type: "button", className: "mb-stop-btn", text: "Undo from snapshot" });
  publishHalfUndoBtn.addEventListener("click", () => {
    const job = publishJobId ? state.jobs.get(publishJobId) : null;
    const target = job ? publishFailure(job).halfPublished : null;
    if (target) startUndo(publishHalfUndoBtn, target.snapshotId);
  });
  const publishFailedHost = el("div", { className: "mb-publish-failed" }, [
    el("h3", { text: "Publish failed" }),
    publishFailedStepP,
    publishFailedErrorP,
    publishRestoredP,
    publishHalfPublishedP,
    publishHalfUndoBtn,
  ]);

  publishScreen.appendChild(publishEmpty);
  publishScreen.appendChild(publishBackBtn);
  publishScreen.appendChild(publishConfirmHost);
  publishScreen.appendChild(publishingHost);
  publishScreen.appendChild(publishedHost);
  publishScreen.appendChild(publishFailedHost);

  function openPublishScreen(draftJobId) {
    publishDraftJobId = draftJobId;
    publishJobId = null;
    publishConfirmBtn.disabled = false;
    publishUndoBtn.disabled = false;
    publishHalfUndoBtn.disabled = false;
    setScreen("publish");
    patchPublishScreen();
  }

  function patchPublishScreen() {
    const hasTarget = Boolean(publishDraftJobId);
    publishEmpty.hidden = hasTarget;
    publishBackBtn.hidden = !hasTarget;
    if (!hasTarget) {
      publishConfirmHost.hidden = true;
      publishingHost.hidden = true;
      publishedHost.hidden = true;
      publishFailedHost.hidden = true;
      return;
    }

    const job = publishJobId ? state.jobs.get(publishJobId) : null;
    const phase = !job
      ? "confirm"
      : job.status === "succeeded"
        ? "published"
        : job.status === "queued" || job.status === "running"
          ? "publishing"
          : "failed"; // failed, cancelled or interrupted

    publishConfirmHost.hidden = phase !== "confirm";
    publishingHost.hidden = phase !== "publishing";
    publishedHost.hidden = phase !== "published";
    publishFailedHost.hidden = phase !== "failed";

    if (phase === "confirm") {
      const dirty = state.world.dirtyFiles ?? [];
      publishDirtyWarning.hidden = dirty.length === 0;
      publishDirtyWarning.textContent = dirty.length
        ? "Uncommitted changes will be overwritten: " + dirty.join(", ")
        : "";
      publishPngWarning.hidden = state.world.pngTool !== false;
      return;
    }
    if (phase === "publishing") {
      publishingStepsHost.replaceChildren(
        ...(job.steps ?? []).map((s) =>
          el("li", {
            className:
              "mb-stage mb-stage-" + (s.status === "done" ? "done" : s.status === "failed" ? "failed" : "current"),
            text: s.label + (s.warning ? " — " + s.warning : ""),
          }),
        ),
      );
      return;
    }
    if (phase === "published") {
      if (publishedSeedCode.textContent !== job.seed) publishedSeedCode.textContent = job.seed;
      publishUndoBtn.hidden = !state.world.undoAvailable;
      if (snapshotCountFor !== state.world) refreshSnapshotCount();
      return;
    }
    // failed, cancelled or interrupted
    const failure = publishFailure(job);
    publishFailedStepP.textContent = failure.stepText;
    publishFailedErrorP.textContent = failure.error;
    publishRestoredP.hidden = !failure.restored;
    publishHalfPublishedP.hidden = !failure.halfPublished;
    publishHalfUndoBtn.hidden = !failure.halfPublished;
    publishHalfPublishedP.textContent = failure.halfPublished ? failure.halfPublished.text : "";
  }

  // ---------- History screen (Task 19) ----------
  //
  // Every kind, newest first, re-runs indented under their original
  // (rerunChains), duration vs target and the determinism badge
  // (historyRows). Same keyed row-diff as the Start table (fix round 1, D3):
  // rows are created once per job id, cells patched in place, the Actions
  // cell rebuilt only on a status transition — a job.step frame from a
  // running build must not steal focus from a row's Log/Re-run button.

  let historyKind = null; // null = all
  let historyStatus = null; // null = all

  const historyFilters = el("div", { className: "mb-history-filters" });
  // One chip group per filter: "All" plus one chip per value. aria-pressed
  // carries the state (no colour-only signalling — spec §6 UX rules).
  function chipGroup(label, values, get, set) {
    const group = el("div", { className: "mb-chip-group" }, [el("span", { className: "mb-chip-label", text: label })]);
    const chips = [null, ...values].map((value) => {
      const chip = el("button", { type: "button", className: "mb-chip", text: value ?? "All" });
      chip.addEventListener("click", () => {
        set(value);
        patchHistoryScreen();
      });
      group.appendChild(chip);
      return { value, chip };
    });
    return {
      group,
      patch() {
        const current = get();
        for (const { value, chip } of chips) chip.setAttribute("aria-pressed", value === current ? "true" : "false");
      },
    };
  }
  const kindChips = chipGroup("Kind", HISTORY_KINDS, () => historyKind, (v) => { historyKind = v; });
  const statusChips = chipGroup("Status", HISTORY_STATUSES, () => historyStatus, (v) => { historyStatus = v; });
  historyFilters.appendChild(kindChips.group);
  historyFilters.appendChild(statusChips.group);
  historyScreen.appendChild(historyFilters);

  // Bulk cleanup (Task 20): DELETE /api/jobs?status=...&olderThanDays=7 —
  // failed, cancelled and interrupted records only (the route refuses any
  // other status), their logs and draft folders; snapshots are untouched.
  const cleanupBtn = el("button", { type: "button", className: "mb-row-action", text: "Delete finished drafts older than 7 days" });
  const cleanupHint = el("span", {
    className: "mb-cleanup-hint",
    text: "Removes failed, cancelled and interrupted records, their logs and draft folders. Snapshots are kept.",
  });
  cleanupBtn.addEventListener("click", async () => {
    errorBanner.textContent = "";
    cleanupBtn.disabled = true;
    try {
      const res = await deleteJson(apiBase + "/jobs?status=failed,cancelled,interrupted&olderThanDays=7");
      const jobs = new Map(state.jobs);
      for (const id of res?.ids ?? []) jobs.delete(id);
      state = { ...state, jobs };
      cleanupHint.textContent = "Deleted " + (res?.deleted ?? 0) + " record(s).";
      renderAll();
    } catch (err) {
      errorBanner.textContent = "Cleanup failed: " + err.message;
    } finally {
      cleanupBtn.disabled = false;
    }
  });
  historyScreen.appendChild(el("div", { className: "mb-history-cleanup" }, [cleanupBtn, cleanupHint]));

  const historyEmpty = el("p", { className: "empty-state", text: "No jobs match." });
  const historyTable = el("table", { className: "grid mb-jobs-table mb-history-table" });
  const historyHeadRow = el("tr", null, [
    el("th", { scope: "col", text: "Seed" }),
    el("th", { scope: "col", text: "Kind" }),
    el("th", { scope: "col", text: "Status" }),
    el("th", { scope: "col", text: "Duration" }),
    el("th", { scope: "col", text: "Started" }),
    el("th", { scope: "col", text: "Actions" }),
  ]);
  historyTable.appendChild(historyHeadRow);
  historyScreen.appendChild(historyEmpty);
  historyScreen.appendChild(historyTable);

  // jobId -> { tr, seedCode, kindCell, statusSpan, badgeSpan, durationCell, startedCell, actionsCell, lastStatus }
  const historyRowsById = new Map();

  function createHistoryRow(row) {
    const seedCode = el("code");
    const kindCell = el("td", { className: "mb-cell-kind" });
    const statusSpan = el("span");
    const badgeSpan = el("span", { className: "mb-badge" });
    const statusCell = el("td", { className: "mb-cell-status", "aria-live": "polite" }, [statusSpan, badgeSpan]);
    const durationCell = el("td", { className: "mb-cell-duration" });
    const startedCell = el("td");
    const actionsCell = el("td", { className: "mb-cell-actions" });
    const tr = el("tr", null, [el("td", { className: "mb-cell-seed" }, [seedCode]), kindCell, statusCell, durationCell, startedCell, actionsCell]);
    tr.dataset.jobId = row.id;
    return { tr, seedCode, kindCell, statusSpan, badgeSpan, durationCell, startedCell, actionsCell, lastStatus: null };
  }

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };

  function patchHistoryRow(entry, row, indented) {
    entry.tr.classList.toggle("mb-row-rerun", indented);
    setText(entry.seedCode, indented ? "↳ " + row.seed : row.seed);
    setText(entry.kindCell, row.kind);
    setText(entry.statusSpan, row.statusText);
    entry.badgeSpan.hidden = !row.rerunBadge;
    setText(entry.badgeSpan, row.rerunBadge ?? "");
    // The "differs" tooltip names the files whose hash changed (Task 18's rerunDiff).
    const title = row.rerunBadge === "Re-run differs" && row.rerunDiff.length ? "Changed: " + row.rerunDiff.join(", ") : "";
    if (entry.badgeSpan.getAttribute("title") !== title) {
      if (title) entry.badgeSpan.setAttribute("title", title);
      else entry.badgeSpan.removeAttribute("title");
    }
    setText(entry.durationCell, row.durationText);
    entry.durationCell.classList.toggle("mb-over", row.over);
    setText(entry.startedCell, row.startedText);

    if (entry.lastStatus !== row.status) {
      entry.lastStatus = row.status;
      const job = state.jobs.get(row.id);
      // History's own action set: Re-run / Delete (as rowActions allows for
      // this status) plus Log for every job — cancel/watch/review stay on Start.
      const buttons = rowActions(job)
        .filter((a) => a.id === "rerun" || a.id === "delete")
        .map((action) => {
          const btn = el("button", { type: "button", className: "mb-row-action", text: action.label });
          btn.addEventListener("click", () => runAction(action.id, row.id));
          return btn;
        });
      const logBtn = el("button", { type: "button", className: "mb-row-action", text: "Log" });
      logBtn.addEventListener("click", () => openLog(row.id));
      entry.actionsCell.replaceChildren(...buttons, logBtn);
    }
  }

  // Newest root first, each followed by its re-runs (oldest re-run first) —
  // the order the table shows; the filter is applied AFTER flattening so a
  // re-run stays indented even when its root is filtered out.
  function historyOrder() {
    const jobs = jobsSortedNewestFirst();
    const chains = rerunChains(jobs);
    const out = [];
    for (const job of jobs) {
      if (!chains.has(job.id)) continue; // a re-run — emitted under its root
      out.push({ id: job.id, indented: false });
      for (const childId of chains.get(job.id)) out.push({ id: childId, indented: true });
    }
    return out;
  }

  function patchHistoryScreen() {
    kindChips.patch();
    statusChips.patch();
    const rowsById = new Map(
      historyRows([...state.jobs.values()], { stageCount: state.world.stageCount, targets: HISTORY_TARGETS }).map((r) => [r.id, r]),
    );
    const visible = historyOrder().filter(({ id }) => {
      const r = rowsById.get(id);
      return (historyKind === null || r.kind === historyKind) && (historyStatus === null || r.status === historyStatus);
    });
    historyTable.hidden = visible.length === 0;
    historyEmpty.hidden = visible.length !== 0;

    const seen = new Set();
    let prevTr = historyHeadRow;
    for (const { id, indented } of visible) {
      seen.add(id);
      const row = rowsById.get(id);
      let entry = historyRowsById.get(id);
      if (!entry) {
        entry = createHistoryRow(row);
        historyRowsById.set(id, entry);
      }
      patchHistoryRow(entry, row, indented);
      if (prevTr.nextElementSibling !== entry.tr) prevTr.after(entry.tr);
      prevTr = entry.tr;
    }
    for (const [id, entry] of historyRowsById) {
      if (!seen.has(id)) {
        entry.tr.remove();
        historyRowsById.delete(id);
      }
    }
    patchLogPanel();
  }

  async function openHistoryScreen() {
    setScreen("history");
    patchHistoryScreen();
    await syncJobsPage("map-builder history", "history fetch");
  }

  // ---------- Log viewer (Task 19) ----------
  //
  // A <pre> fed by GET /api/jobs/:id/log?tail=200, re-fetched every second
  // while the job is queued/running and left alone once it is terminal
  // (one last fetch after the terminal frame, then the timer stops).
  // "Follow" pins the scroll to the bottom on each refresh; unticking it
  // lets the reader scroll back without the next refresh yanking them down.

  let logJobId = null;
  let logTimer = null;

  const logTitleCode = el("code");
  const logFollow = el("input", { type: "checkbox", id: "mb-log-follow", checked: "" });
  const logFollowLabel = el("label", { className: "mb-log-follow", for: "mb-log-follow" }, [logFollow, document.createTextNode(" Follow")]);
  const logOpenLink = el("a", { className: "mb-log-open", target: "_blank", rel: "noopener", text: "Open full log" });
  const logCloseBtn = el("button", { type: "button", className: "story-tab", text: "Close" });
  logCloseBtn.addEventListener("click", () => closeLog());
  const logStatus = el("span", { className: "mb-log-status" });
  // tabindex so a keyboard user can scroll the tail (it has its own scrollbar).
  const logPre = el("pre", { className: "mb-log-pre", tabindex: "0" });
  const logPanel = el("div", { className: "mb-log-panel", hidden: "" }, [
    el("div", { className: "mb-log-bar" }, [
      el("span", null, [document.createTextNode("Log · "), logTitleCode]),
      logStatus,
      logFollowLabel,
      logOpenLink,
      logCloseBtn,
    ]),
    logPre,
  ]);
  historyScreen.appendChild(logPanel);

  const logJobActive = () => {
    const job = logJobId ? state.jobs.get(logJobId) : null;
    return Boolean(job) && (job.status === "queued" || job.status === "running");
  };

  async function fetchLogTail() {
    const id = logJobId;
    if (!id) return;
    let text;
    try {
      const res = await fetch(logTailUrl(id, LOG_TAIL_LINES));
      text = res.ok ? await res.text() : "Log unavailable (HTTP " + res.status + ").";
    } catch (err) {
      text = "Log unavailable: " + err.message;
    }
    if (logJobId !== id) return; // the reader moved to another job mid-fetch
    if (logPre.textContent !== text) {
      logPre.textContent = text;
      if (logFollow.checked) logPre.scrollTop = logPre.scrollHeight;
    }
  }

  function stopLogTimer() {
    if (logTimer) {
      clearInterval(logTimer);
      logTimer = null;
    }
  }

  function openLog(jobId) {
    logJobId = jobId;
    logPanel.hidden = false;
    logTitleCode.textContent = jobId;
    logOpenLink.href = apiBase + "/jobs/" + jobId + "/log";
    logPre.textContent = "";
    stopLogTimer();
    fetchLogTail();
    if (logJobActive()) {
      logTimer = setInterval(async () => {
        await fetchLogTail();
        // Fetched AFTER the check so the terminal frame's last lines land
        // before the timer stops.
        if (!logJobActive()) stopLogTimer();
      }, LOG_POLL_MS);
    }
    patchLogPanel();
  }

  function closeLog() {
    stopLogTimer();
    logJobId = null;
    logPanel.hidden = true;
  }

  function patchLogPanel() {
    if (!logJobId) return;
    const job = state.jobs.get(logJobId);
    if (!job) {
      closeLog();
      return;
    }
    setText(logStatus, logTimer ? "following · " + statusText(job, { stageCount: state.world.stageCount }) : statusText(job, { stageCount: state.world.stageCount }));
  }

  function renderAll() {
    renderHeaderCard();
    syncTable();
    patchBuildScreen();
    patchHistoryScreen();
    patchReviewScreen();
    patchPublishScreen();
    updateBadge([...state.jobs.values()]);
  }

  renderAll();
  main.appendChild(section);

  // ---------- live updates: SSE with a polling fallback ----------

  function apply(event) {
    state = reduce(state, event);
    renderAll();
  }

  // Shared by the poll fallback, every SSE "open" resync (D2 below) and the
  // History screen's open — all just want the current jobs page upserted
  // into state; only the fetchJson context label and console.warn wording
  // differ per caller. While History is showing, the page is the all-kinds
  // one (Task 19) so its rows survive a resync; otherwise the draft-only
  // page the Start table has always used.
  async function syncJobsPage(fetchLabel, warnLabel) {
    try {
      const page = await fetchJson(activeScreen === "history" ? HISTORY_URL : JOBS_URL, fetchLabel);
      apply({ type: "jobs.synced", jobs: page.jobs ?? [] });
    } catch (err) {
      console.warn(`[asset-storybook] map-builder ${warnLabel} failed:`, err);
    }
  }

  // Fix round 1, D1: pollTimer must be cleared on every SSE reconnect, not
  // just guarded against double-starting — a browser EventSource
  // auto-reconnects after a transient error, and without this the poll
  // interval outlives the reconnect and runs forever alongside SSE, double-
  // applying every job event for the rest of the page's life.
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => syncJobsPage("map-builder jobs poll", "poll"), POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Fix round 1, D2: the JOBS_URL snapshot above is fetched before the
  // EventSource ever opens, so anything the service emitted in that gap (or
  // during any later reconnect gap) is otherwise lost until a manual reload.
  // Resyncing on every "open" — not just the first one — closes both the
  // initial-load race and every reconnect gap with the same one call.
  function resyncJobs() {
    return syncJobsPage("map-builder jobs resync", "resync-on-open");
  }

  // Shared by every SSE listener below: parse the frame's JSON payload and
  // hand it to `apply`, warning (not throwing) on a malformed frame so one
  // bad frame can't take down the listener.
  function onSseFrame(source, type, toEvent) {
    source.addEventListener(type, (ev) => {
      try {
        apply(toEvent(JSON.parse(ev.data)));
      } catch (err) {
        console.warn("[asset-storybook] map-builder malformed SSE frame:", err);
      }
    });
  }

  const JOB_EVENT_TYPES = ["job.created", "job.started", "job.step", "job.done"];
  try {
    const source = new EventSource(apiBase + "/events");
    source.addEventListener("open", () => {
      stopPolling();
      apply({ type: "connected" });
      resyncJobs();
    });
    for (const type of JOB_EVENT_TYPES) {
      onSseFrame(source, type, (payload) => ({ type, job: payload.job }));
    }
    onSseFrame(source, "world.changed", (payload) => ({ type: "world.changed", world: payload.world }));
    source.onerror = () => {
      apply({ type: "disconnected" });
      startPolling();
    };
  } catch (err) {
    console.warn("[asset-storybook] EventSource unavailable, falling back to polling:", err);
    apply({ type: "disconnected" });
    startPolling();
  }
}
