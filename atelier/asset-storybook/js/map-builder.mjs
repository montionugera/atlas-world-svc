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

  const tableHost = el("div", { className: "mb-table-host" });
  startScreen.appendChild(tableHost);

  // ---------- Build screen ----------

  const buildHost = el("div", { className: "mb-build-host" });
  buildScreen.appendChild(buildHost);

  function openBuildScreen(jobId) {
    selectedJobId = jobId;
    setScreen("build");
    renderBuildScreen();
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

  function renderTable() {
    const jobs = jobsSortedNewestFirst();
    if (jobs.length === 0) {
      tableHost.replaceChildren(el("p", { className: "empty-state", text: "No draft builds yet." }));
      return;
    }
    const table = el("table", { className: "grid mb-jobs-table" });
    const head = el("tr", null, [
      el("th", { scope: "col", text: "Seed" }),
      el("th", { scope: "col", text: "Status" }),
      el("th", { scope: "col", text: "Started" }),
      el("th", { scope: "col", text: "Actions" }),
    ]);
    table.appendChild(head);
    for (const job of jobs) {
      const row = el("tr", null, [
        el("td", { className: "mb-cell-seed" }, [el("code", { text: job.seed })]),
        el(
          "td",
          { className: "mb-cell-status", "aria-live": "polite" },
          [document.createTextNode(statusText(job, { stageCount: state.world.stageCount }))],
        ),
        el("td", { text: job.startedAt ?? "—" }),
      ]);
      const actionsCell = el("td", { className: "mb-cell-actions" });
      for (const action of rowActions(job)) {
        const btn = el("button", { type: "button", className: "mb-row-action", text: action.label });
        btn.addEventListener("click", () => runAction(action.id, job.id));
        actionsCell.appendChild(btn);
      }
      row.appendChild(actionsCell);
      table.appendChild(row);
    }
    tableHost.replaceChildren(table);
  }

  function renderBuildScreen() {
    const job = selectedJobId ? state.jobs.get(selectedJobId) : null;
    if (!job) {
      buildHost.replaceChildren(
        el("p", { className: "empty-state", text: "Pick a draft from Start to watch its build." }),
      );
      return;
    }
    const running = job.status === "queued" || job.status === "running";
    const nodes = [
      el("h3", { className: "mb-build-title" }, [document.createTextNode("Seed "), el("code", { text: job.seed })]),
      el("p", { className: "mb-build-status", "aria-live": "polite", text: statusText(job, { stageCount: state.world.stageCount }) }),
    ];

    if (job.status === "running") {
      const p = progress(job, { targetMs: GENERATE_TARGET_MS, failMs: GENERATE_FAIL_MS });
      const bar = el("div", { className: "mb-progress" });
      const fill = el("div", { className: "mb-progress-fill mb-over-" + p.over });
      fill.style.width = p.pct + "%";
      const target = el("div", { className: "mb-progress-target" });
      target.style.left = p.targetPct + "%";
      bar.appendChild(fill);
      bar.appendChild(target);
      nodes.push(bar);
    }

    if (job.status === "failed" && job.error) {
      nodes.push(el("p", { className: "mb-build-error", text: job.error.split("\n")[0] }));
    }

    const checklist = el("div", { className: "mb-checklist" });
    for (const group of groupSteps({ steps: job.steps, stepsJson, running: job.status === "running" })) {
      const groupEl = el("div", { className: "mb-checklist-group" });
      groupEl.appendChild(el("p", { className: "mb-checklist-group-label", text: group.label }));
      const list = el("ul", { className: "mb-checklist-stages" });
      for (const stage of group.stages) {
        list.appendChild(el("li", { className: "mb-stage mb-stage-" + stage.status, text: stage.label }));
      }
      groupEl.appendChild(list);
      checklist.appendChild(groupEl);
    }
    nodes.push(checklist);

    if (running) {
      const stopBtn = el("button", { type: "button", className: "mb-stop-btn", text: "Stop this draft" });
      stopBtn.addEventListener("click", () => runAction("cancel", job.id));
      nodes.push(stopBtn);
    }

    buildHost.replaceChildren(...nodes);
  }

  function renderAll() {
    renderHeaderCard();
    renderTable();
    renderBuildScreen();
    updateBadge([...state.jobs.values()]);
  }

  renderAll();
  main.appendChild(section);

  // ---------- live updates: SSE with a polling fallback ----------

  function apply(event) {
    state = reduce(state, event);
    renderAll();
  }

  let pollTimer = null;
  function startPolling() {
    if (pollTimer) return;
    apply({ type: "disconnected" });
    pollTimer = setInterval(async () => {
      try {
        const page = await fetchJson(apiBase + "/jobs?kind=draft&limit=50", "map-builder jobs poll");
        apply({ type: "jobs.synced", jobs: page.jobs ?? [] });
      } catch (err) {
        console.warn("[asset-storybook] map-builder poll failed:", err);
      }
    }, POLL_MS);
  }

  const JOB_EVENT_TYPES = ["job.created", "job.started", "job.step", "job.done"];
  try {
    const source = new EventSource(apiBase + "/events");
    source.addEventListener("open", () => apply({ type: "connected" }));
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
    source.onerror = () => startPolling();
  } catch (err) {
    console.warn("[asset-storybook] EventSource unavailable, falling back to polling:", err);
    startPolling();
  }
}
