// Windowed asset grid (F-038).
//
// The storybook used to build a DOM node for all 742 cards up front: 11,268
// nodes, 92 MB of heap, a 136,400px document. This renders only the rows near
// the viewport and recycles the elements as you scroll, so DOM size is a
// function of the WINDOW, not of the catalog. Adding another 700 assets costs
// nothing.
//
// Scroll height is preserved by sizing a spacer to the full row count, so the
// scrollbar stays honest and deep-linking still lands in the right place.
//
// Health deliberately does NOT come from mounted cards — see the preload note
// below. A card that is scrolled past and unmounted must not un-count itself.

const OVERSCAN_ROWS = 2;
const PRELOAD_CONCURRENCY = 8;

export class VirtualGrid {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container  element the grid renders into
   * @param {Array} opts.items            [key, entry] pairs
   * @param {(item:any, index:number)=>HTMLElement} opts.buildCard
   * @param {number} opts.rowHeight       measured card height incl. gap
   * @param {number} opts.minColumnWidth  used to derive the column count
   * @param {(item:any)=>void} [opts.onPreload]  called once per item, ever
   */
  constructor(opts) {
    this.container = opts.container;
    this.items = opts.items;
    this.buildCard = opts.buildCard;
    this.rowHeight = opts.rowHeight || 340;
    this.minColumnWidth = opts.minColumnWidth || 260;
    this.onPreload = opts.onPreload || null;

    this.columns = 1;
    this.mounted = new Map(); // index -> element
    this.destroyed = false;

    this.viewport = document.createElement("div");
    this.viewport.className = "vgrid";
    this.viewport.style.position = "relative";
    this.container.appendChild(this.viewport);

    this._onScroll = () => this._schedule();
    this._onResize = () => {
      this._measure();
      this._render();
    };
    window.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onResize);

    this._measure();
    this._render();
  }

  _measure() {
    const width = this.viewport.clientWidth || this.container.clientWidth || 1;
    this.columns = Math.max(1, Math.floor(width / this.minColumnWidth));
    const rows = Math.ceil(this.items.length / this.columns);
    this.viewport.style.height = rows * this.rowHeight + "px";
  }

  _schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._render();
    });
  }

  _visibleRange() {
    const rect = this.viewport.getBoundingClientRect();
    // Row 0's top in viewport coordinates is rect.top.
    const firstVisibleRow = Math.floor(-rect.top / this.rowHeight);
    const rowsOnScreen = Math.ceil(window.innerHeight / this.rowHeight);
    const startRow = Math.max(0, firstVisibleRow - OVERSCAN_ROWS);
    const endRow = firstVisibleRow + rowsOnScreen + OVERSCAN_ROWS;
    return {
      start: Math.max(0, startRow * this.columns),
      end: Math.min(this.items.length, (endRow + 1) * this.columns),
    };
  }

  _render() {
    if (this.destroyed) return;
    const { start, end } = this._visibleRange();

    for (const [index, el] of this.mounted) {
      if (index < start || index >= end) {
        el.remove();
        this.mounted.delete(index);
      }
    }

    for (let i = start; i < end; i++) {
      if (this.mounted.has(i)) continue;
      const el = this.buildCard(this.items[i], i);
      const row = Math.floor(i / this.columns);
      const col = i % this.columns;
      el.style.position = "absolute";
      el.style.top = row * this.rowHeight + "px";
      el.style.left = (col / this.columns) * 100 + "%";
      el.style.width = 100 / this.columns + "%";
      el.style.padding = "0 0.55rem 1.1rem 0.55rem";
      this.viewport.appendChild(el);
      this.mounted.set(i, el);
    }
  }

  setItems(items) {
    this.items = items;
    for (const [, el] of this.mounted) el.remove();
    this.mounted.clear();
    this._measure();
    this._render();
  }

  indexOfKey(key) {
    return this.items.findIndex((it) => it[0] === key);
  }

  scrollToIndex(index) {
    const row = Math.floor(index / this.columns);
    const top = this.viewport.offsetTop + row * this.rowHeight;
    window.scrollTo({ top, behavior: "smooth" });
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onResize);
    this.viewport.remove();
  }
}

// Health must be counted over the FULL item list, not over mounted cards: a
// virtualized card that scrolls out of view is removed from the DOM, and if
// health were driven by card <img> events the totals would drift every scroll.
// So every item's thumbnail is preloaded exactly once, at a bounded
// concurrency, and reports ok/err from that. Cards then paint from cache.
export function preloadThumbnails(urls, { onOk, onErr }) {
  let cursor = 0;
  let active = 0;

  function pump() {
    while (active < PRELOAD_CONCURRENCY && cursor < urls.length) {
      const url = urls[cursor++];
      if (!url) {
        onErr();
        continue;
      }
      active++;
      const img = new Image();
      const done = (cb) => () => {
        active--;
        cb();
        pump();
      };
      img.addEventListener("load", done(onOk), { once: true });
      img.addEventListener("error", done(onErr), { once: true });
      img.src = url;
    }
  }
  pump();
}
