import { MAP_BUILDER_CLASS, fetchJson } from "./state.mjs";
import { initHealth, bumpHealth, renderSidebarBadge } from "./health.mjs";
import { buildSidebarItem } from "./sidebar.mjs";
import {
  statusText,
  groupSteps,
  progress,
  rowActions,
  validateSeed,
  badgeCount,
  reduce,
  reduceConnection,
  INITIAL_CONNECTION_STATUS,
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
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    throw new Error(data?.error?.message ?? "HTTP " + res.status);
  }
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
      fetchJson(apiBase + "/jobs?kind=draft&limit=50", "map-builder jobs"),
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
  let activeScreen = "start"; // "start" | "build"

  // ---------- screen chrome: tab bar + two screens ----------

  const tabBar = el("div", { className: "mb-screen-tabs" });
  const startTab = el("button", { type: "button", className: "story-tab mb-screen-tab active", text: "Start" });
  const buildTab = el("button", { type: "button", className: "story-tab mb-screen-tab", text: "Build" });
  tabBar.appendChild(startTab);
  tabBar.appendChild(buildTab);
  section.appendChild(tabBar);

  const startScreen = el("div", { className: "mb-screen mb-start-screen" });
  const buildScreen = el("div", { className: "mb-screen mb-build-screen", hidden: "" });
  section.appendChild(startScreen);
  section.appendChild(buildScreen);

  function setScreen(name) {
    activeScreen = name;
    startTab.classList.toggle("active", name === "start");
    buildTab.classList.toggle("active", name === "build");
    startScreen.hidden = name !== "start";
    buildScreen.hidden = name !== "build";
  }
  startTab.addEventListener("click", () => setScreen("start"));
  buildTab.addEventListener("click", () => setScreen("build"));

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
      if (actionId === "watch" || actionId === "review" || actionId === "why") {
        openBuildScreen(jobId);
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

  function renderAll() {
    renderHeaderCard();
    syncTable();
    patchBuildScreen();
    updateBadge([...state.jobs.values()]);
  }

  renderAll();
  main.appendChild(section);

  // ---------- live updates: SSE with a polling fallback ----------

  function apply(event) {
    state = reduce(state, event);
    renderAll();
  }

  // Fix round 1, D1: pollTimer must be cleared on every SSE reconnect, not
  // just guarded against double-starting — a browser EventSource
  // auto-reconnects after a transient error, and without this the poll
  // interval outlives the reconnect and runs forever alongside SSE, double-
  // applying every job event for the rest of the page's life.
  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const page = await fetchJson(apiBase + "/jobs?kind=draft&limit=50", "map-builder jobs poll");
        apply({ type: "jobs.synced", jobs: page.jobs ?? [] });
      } catch (err) {
        console.warn("[asset-storybook] map-builder poll failed:", err);
      }
    }, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Fix round 1, D2: the /api/jobs?kind=draft&limit=50 snapshot above is
  // fetched before the EventSource ever opens, so anything the service
  // emitted in that gap (or during any later reconnect gap) is otherwise
  // lost until a manual reload. Resyncing on every "open" — not just the
  // first one — closes both the initial-load race and every reconnect gap
  // with the same one call.
  async function resyncJobs() {
    try {
      const page = await fetchJson(apiBase + "/jobs?kind=draft&limit=50", "map-builder jobs resync");
      apply({ type: "jobs.synced", jobs: page.jobs ?? [] });
    } catch (err) {
      console.warn("[asset-storybook] map-builder resync-on-open failed:", err);
    }
  }

  // Drives reduceConnection (map-builder-model.mjs) — see its docstring for
  // why this is a pure three-state machine rather than ad-hoc booleans here.
  let connectionStatus = INITIAL_CONNECTION_STATUS;

  const JOB_EVENT_TYPES = ["job.created", "job.started", "job.step", "job.done"];
  try {
    const source = new EventSource(apiBase + "/events");
    source.addEventListener("open", () => {
      connectionStatus = reduceConnection(connectionStatus, "sse.open");
      stopPolling();
      apply({ type: "connected" });
      resyncJobs();
    });
    for (const type of JOB_EVENT_TYPES) {
      source.addEventListener(type, (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          apply({ type, job: payload.job });
        } catch (err) {
          console.warn("[asset-storybook] map-builder malformed SSE frame:", err);
        }
      });
    }
    source.addEventListener("world.changed", (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        apply({ type: "world.changed", world: payload.world });
      } catch (err) {
        console.warn("[asset-storybook] map-builder malformed SSE frame:", err);
      }
    });
    source.onerror = () => {
      connectionStatus = reduceConnection(connectionStatus, "sse.error");
      apply({ type: "disconnected" });
      startPolling();
    };
  } catch (err) {
    console.warn("[asset-storybook] EventSource unavailable, falling back to polling:", err);
    connectionStatus = reduceConnection(connectionStatus, "sse.error");
    apply({ type: "disconnected" });
    startPolling();
  }
}
