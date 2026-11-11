// Brand lockup — the approved 1280x640 image board.
//
// The mark is right-aligned; two trails leave the two rear points of the wing and
// fade left; Av1ation sits above them and Station below. Run in the connected
// Penpot tab after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '00 Foundations');
if (!page) throw new Error('00 Foundations page not found');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Brand lockup';
const old = page.findShapes({ type: 'board' }).find((b) => b.name === NAME);
if (old) old.remove();

// The board is the native 1280x640 asset, not a 1276/1320 column board: it closes
// the page on its own row, one 64px gutter below the lowest existing board.
const lower = page
  .findShapes({ type: 'board' })
  .reduce((max, board) => Math.max(max, board.y + board.height), 0);
const b = K.board(null, NAME, 0, Math.ceil((lower + 64) / 64) * 64, 1280, 640, {
  bg: 'color.bg.base',
});

// The reference PNG adds a faint sky glow behind the mark. It is one radial fill;
// Penpot fill coordinates are normalised to the shape, never pixels.
const glow = penpot.createRectangle();
glow.name = 'brand / glow';
b.appendChild(glow);
glow.x = b.x;
glow.y = b.y;
glow.resize(1280, 640);
glow.borderRadius = 0;
const sky = K.color('color.brand.default');
glow.fills = [{
  fillColorGradient: {
    type: 'radial',
    startX: 0.85,
    startY: 0.5,
    endX: 1.29,
    endY: 0.5,
    width: 0.44,
    stops: [
      { color: sky, opacity: 0.09, offset: 0 },
      { color: sky, opacity: 0.025, offset: 0.55 },
      { color: sky, opacity: 0, offset: 1 },
    ],
  },
}];

// One trail. It is the back-control material mirrored: opaque at the mark on the
// right, transparent at the tail on the left, so the pair reads as motion.
const ink = K.color('color.text.secondary');
const trail = (name, top) => {
  const shape = penpot.createRectangle();
  shape.name = name;
  b.appendChild(shape);
  shape.x = b.x + 180;
  shape.y = b.y + top;
  shape.resize(880, 6);
  shape.borderRadius = 3;
  shape.fills = [{
    fillColorGradient: {
      type: 'linear',
      startX: 0,
      startY: 0,
      endX: 1,
      endY: 0,
      width: 1,
      stops: [
        { color: ink, opacity: 0, offset: 0 },
        { color: ink, opacity: 0.1, offset: 0.18 },
        { color: ink, opacity: 0.28, offset: 0.55 },
        { color: ink, opacity: 0.6, offset: 1 },
      ],
    },
  }];
  return shape;
};

// 291.88 and 342.12 centre each 6px bar on the wing's two rear points.
trail('brand / trail 0', 291.88);
trail('brand / trail 1', 342.12);

const mark = K.mark(b, 980, 200, 204, 'color.text.primary');
mark.name = 'brand / mark';

// Both words share a left ink edge. The S sits 2.5px in from its origin at this
// size, so its origin is pulled left by that amount instead of the box being
// shifted; the 120px semibold tracking matches the approved image.
const word = (name, value, x, inkTop, width, color) => {
  const shape = K.text(b, name, value, x, inkTop, width, {
    size: 120,
    weight: 'semibold',
    color,
    lh: 1,
    h: 180,
  });
  shape.letterSpacing = '-3';
  return shape;
};

const av1ation = word('brand / Av1ation', 'Av1ation', 474.5, 186.7, 560, 'color.text.primary');
const station = word('brand / Station', 'Station', 472, 365.7, 440, 'color.text.secondary');

// K.text places the text box, not the painted glyphs. Snap each line to its cap
// top so the baselines match the approved SVG at 274 and 453.
await penpot.waitForLayoutUpdate();
for (const [shape, inkTop] of [
  [av1ation, 186.7],
  [station, 365.7],
]) {
  shape.y += b.y + inkTop - shape.textBounds.y;
}

await penpot.waitForLayoutUpdate();
K.organize(page);
