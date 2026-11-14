// F-216 S1: search box, result popover and record page in a real Chrome, desktop and phone.
// usage: node scripts/probes/atlas_records_probe.mjs [--url http://127.0.0.1:8788/]
// Needs a running catalog_explorer_web.py. Exit: 0 pass, 1 assertion failed, 2 setup error, 3 Chrome missing.
import { launch, waitFor, settle, tap, chromeAvailable } from './atlas_audit_lib.mjs';

const argv = process.argv.slice(2);
const ui = argv.indexOf('--url');
const BASE = (ui >= 0 ? argv[ui + 1] : 'http://127.0.0.1:8788/').replace(/\/?(\?.*)?$/, '/');
if (!chromeAvailable()) { console.error('SKIP: Chrome not found (set CHROME_BIN)'); process.exit(3); }

const rows = [];
const ck = (name, ok, detail = '') => { rows.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} | ${detail}`); };
const rect = (c, sel) => c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); const x=r.left+r.width/2, y=r.top+r.height/2; const top=document.elementFromPoint(x,y); return {x,y,w:r.width,h:r.height,left:r.left,right:r.right,vw:innerWidth,hit:!!top&&(top===e||e.contains(top)||top.contains(e))}})()`);
const click = async (c, p, touch) => {
  if (touch) return tap(c, p.x, p.y);
  for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
};
const typeInto = async (c, touch, text) => {
  await click(c, await rect(c, '#globalSearch'), touch);
  await c.eval(`(()=>{const i=document.getElementById('globalSearch'); i.select(); 0})()`);
  await c.send('Input.insertText', { text });
};
const back = async (c) => {  // what the browser Back button does
  const h = await c.send('Page.getNavigationHistory');
  await c.send('Page.navigateToHistoryEntry', { entryId: h.entries[h.currentIndex - 1].id });
};
// The library's launch(url) and navigate() wait 15 s for the Studio map; these pages have none.
const goto = async (c, url) => {
  await c.send('Page.navigate', { url });
  await waitFor(c, `typeof DATA !== 'undefined' && !!DATA && !!document.getElementById('globalSearch')`, 20000);
  await settle(c);
};
const FIRST = `#searchPopover:not([hidden]) [data-record]`;
const MSG = `#searchPopover:not([hidden]) .search-popover__message`;

for (const v of [{ name: 'desktop 1280x800', w: 1280, h: 800, dpr: 1 }, { name: 'phone 390x844', w: 390, h: 844, dpr: 2, mobile: true, touch: true }]) {
  let c;
  try {
    c = await launch({ ...v, url: 'about:blank' });
    await goto(c, `${BASE}?tab=mobs`);

    const box = await rect(c, '#globalSearch');
    ck(`A14 ${v.name}: search box is on screen and on top without opening the nav drawer`,
      box && box.h > 0 && box.left >= 0 && box.right <= box.vw && box.hit && (await c.eval(`document.body.getAttribute('data-mobile-nav-open')!=='true'`)), JSON.stringify(box));

    await typeInto(c, v.touch, 'hearthbloom');
    await waitFor(c, `!!document.querySelector(${JSON.stringify(FIRST)})`, 8000);
    const first = await c.eval(`(document.querySelector(${JSON.stringify(FIRST)})||{dataset:{}}).dataset.record||''`);
    ck(`R6 ${v.name}: typing shows ranked results, the continent first`, first === 'continent:continent-01-hearthbloom-basin', first);
    const pop = await rect(c, '#searchPopover');
    ck(`R6 ${v.name}: the popover fits the viewport`, pop && pop.left >= 0 && pop.right <= pop.vw + 1, JSON.stringify(pop));
    ck(`R6 ${v.name}: the tab under the popover stays mounted`, await c.eval(`CURRENT_TAB==='mobs' && !document.getElementById('recordPage')`));

    await click(c, await rect(c, FIRST), v.touch);
    await waitFor(c, `!!document.querySelector('#recordPage h1')`, 8000);
    ck(`R7 ${v.name}: a real click opens the record page`,
      await c.eval(`document.querySelector('#recordPage h1').textContent.includes('Hearthbloom Basin') && new URLSearchParams(location.search||location.hash.slice(1)).get('r')==='continent:continent-01-hearthbloom-basin'`),
      await c.eval('location.href'));
    ck(`R7 ${v.name}: related records are grouped, with an "Open in" link`,
      await c.eval(`document.querySelectorAll('#recordPage section[data-relation="Contains"] [data-record]').length>0 && /^Open in /.test((document.getElementById('recordOpenLink')||{}).textContent||'')`));

    await back(c);
    await waitFor(c, `!document.getElementById('recordPage')`, 8000);
    ck(`A9 ${v.name}: browser Back restores the previous tab and query`,
      await c.eval(`CURRENT_TAB==='mobs' && document.getElementById('globalSearch').value==='hearthbloom' && !document.getElementById('recordPage')`),
      await c.eval('location.href'));

    await typeInto(c, v.touch, 'zzqqxxnomatch');
    await waitFor(c, `!!document.querySelector(${JSON.stringify(MSG)})`, 8000);
    ck(`R6f ${v.name}: nothing matches`, (await c.eval(`document.querySelector(${JSON.stringify(MSG)}).textContent`)).includes(`No record matches 'zzqqxxnomatch'`));

    await c.send('Network.enable');
    await c.send('Network.setBlockedURLs', { urls: ['*/api/search*'] });
    await typeInto(c, v.touch, 'hearth');
    await waitFor(c, `!!document.getElementById('searchRetryBtn')`, 8000);
    ck(`R6g ${v.name}: a failed search says so and offers Retry`,
      await c.eval(`(document.querySelector(${JSON.stringify(MSG)})||{textContent:''}).textContent.includes('Search is unavailable') && document.getElementById('searchRetryBtn').textContent.trim()==='Retry'`));
    await c.send('Network.setBlockedURLs', { urls: [] });

    await goto(c, `${BASE}?r=district:district-amber-root-hollows`);
    await waitFor(c, `!!document.querySelector('#recordPage section[data-relation="Part of"]')`, 20000);
    ck(`A8 ${v.name}: a record link shows "Part of" and "Contains"`,
      await c.eval(`document.querySelector('#recordPage section[data-relation="Part of"]').textContent.includes('Hearthbloom Basin') && document.querySelectorAll('#recordPage section[data-relation="Contains"] [data-record]').length>0`));
    ck(`A8 ${v.name}: the record page does not overflow sideways`, await c.eval(`document.documentElement.scrollWidth<=innerWidth+1`), await c.eval(`document.documentElement.scrollWidth+'/'+innerWidth`));

    await goto(c, `${BASE}?r=district:nope`);
    await waitFor(c, `!!document.getElementById('recordPage')`, 20000);
    await settle(c);
    ck(`R7f ${v.name}: an unknown record says so and focuses the search box`,
      await c.eval(`document.getElementById('recordPage').textContent.includes('No such record: district:nope') && document.activeElement===document.getElementById('globalSearch')`));
  } catch (e) {
    console.error('SETUP ERROR:', e.message); await c?.kill(); process.exit(e.message === 'CHROME_MISSING' ? 3 : 2);
  }
  await c.kill();
}
const failed = rows.filter((x) => !x).length;
console.log(`\n${rows.length - failed}/${rows.length} assertions passed`);
process.exit(failed ? 1 : 0);
