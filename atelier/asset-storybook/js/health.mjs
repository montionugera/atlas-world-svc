import { health } from "./state.mjs";

export function bumpHealth(kind, delta) {
  if (!health[kind]) health[kind] = { total: 0, ok: 0, err: 0 };
  health[kind].ok += delta.ok || 0;
  health[kind].err += delta.err || 0;
  renderSidebarBadge(kind);
}

export function initHealth(kind, total) {
  health[kind] = { total, ok: 0, err: 0 };
}

export function renderSidebarBadge(kind) {
  const dot = document.querySelector(
    '.sidebar-item[data-class="' + kind + '"] .health-dot',
  );
  const countEl = document.querySelector(
    '.sidebar-item[data-class="' + kind + '"] .count',
  );
  if (!dot || !health[kind]) return;
  const h = health[kind];
  const missing = h.total - h.ok;
  const settled = h.ok + h.err >= h.total && h.total > 0;
  if (settled && h.err > 0) {
    dot.classList.remove("ok");
    dot.classList.add("err");
    dot.title = missing + " missing";
  } else if (settled) {
    dot.classList.add("ok");
    dot.classList.remove("err");
    dot.title = "loaded ✓";
  } else {
    dot.title = "loading…";
  }
  if (countEl) countEl.textContent = h.total;
}
