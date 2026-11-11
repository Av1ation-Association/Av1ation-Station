// Refresh the global chrome on application boards after the shell changes.
//
// The chrome is the one element every screen repeats, so a change to it lands in every
// board. Redrawing a whole board for a 56 px bar is waste: this removes the `chrome /`
// children and draws the bar again from the crumbs the board already carries.
//
// Run after kit.js. One board per call keeps the Penpot tab responsive:
//   storage.chromeBoard = 'Project / Populated'
// With no value it walks every application board in reading order.
const K = storage.K;
const PAGES = ['02 Shell', '03 Home', '04 Settings', '05 Project', '06 Video', '10 Configuration'];
const ONLY = storage.chromeBoard || null;
const done = [];

for (const page of penpot.currentFile.pages) {
  if (!PAGES.includes(page.name)) continue;
  if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

  // A root board named like a chrome layer is an accident from an earlier edit, not a
  // surface; it has no place in the inventory and would read as a screen.
  for (const stray of page.findShapes({ type: 'board' })) {
    if (stray.name === 'chrome / back') stray.remove();
  }

  for (const b of page.findShapes({ type: 'board' })) {
    if (ONLY !== null && b.name !== ONLY) continue;
    const kids = b.children || [];
    if (!kids.some((c) => c.name === 'chrome / topbar')) continue;
    const crumbs = kids
      .filter((c) => /^chrome \/ crumb \d+$/.test(c.name || ''))
      .map((c, i, all) => ({ label: c.characters, current: i === all.length - 1 }));
    if (crumbs.length === 0) continue;
    const width = b.width;
    kids.filter((c) => (c.name || '').startsWith('chrome / ')).forEach((c) => c.remove());
    K.chrome(b, width, crumbs);
    done.push(b.name);
  }
}

return done;
