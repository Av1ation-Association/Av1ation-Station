// Motion / Icon action expand — keyframes for the one layout-affecting transition.
// Run in the connected Penpot tab after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '08 Motion');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Motion / Icon action expand — 160ms';
const old = page.findShapes({ type: 'board' }).find((b) => b.name === NAME);
if (old) old.remove();

const b = K.board(null, NAME, 0, 964, 1440, 900);
const tw = (s, size) => Math.round(String(s).length * size * 0.56);
const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
const note = (name, value, x, y, w, h) =>
  K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
const label = (name, value, x, y, w) =>
  K.text(b, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });
const card = (name, x, y, w, h) =>
  K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
const guide = (name, x, y, h) => K.rect(b, name, x, y, 1, h, { fill: 'color.border.subtle', r: 0 });
const pill = (name, x, y, w, h) =>
  K.rect(b, name, x, y, w, h, { fill: 'color.bg.raised', r: 6, stroke: 'color.border.default' });
const searchIcon = (name, x, y, s) =>
  K.icon(b, name, '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', x, y, s, {
    color: 'color.text.secondary',
  });
const menuIcon = (name, x, y, s) =>
  K.icon(b, name, '<path d="M4 7h16M4 12h16M4 17h10"/>', x, y, s, { color: 'color.text.secondary' });

text('title', 'Icon action expand', 32, 24, 700, { size: 28, weight: 'semibold' });
text(
  'subtitle',
  'The host control grows; the label fills the new interior. Width is the only layout property the system animates, and only here.',
  32,
  62,
  1200,
  { size: 13, color: 'color.text.secondary' },
);

// Keyframe timeline
const colX = [340, 620, 900, 1180];
const colLabel = ['0 ms', '60 ms', '100 ms', '160 ms'];
card('timeline', 32, 96, 1376, 60);
text('timeline label', 'ENTER · 160 ms ease-out', 56, 112, 220, {
  size: 11,
  weight: 'semibold',
  color: 'color.text.secondary',
  h: 18,
});
for (let i = 0; i < colX.length; i++) {
  text('tick ' + i, colLabel[i], colX[i] - 26, 114, 52, {
    size: 10,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'center',
    h: 18,
  });
  guide('guide ' + i, colX[i], 156, 560);
}

// Row A — expand right, icon anchored at the leading edge.
card('expand right', 32, 176, 1376, 190);
label('expand right label', 'EXPAND · RIGHT (DEFAULT)', 56, 192, 300);
note('expand right note', 'icon leading edge fixed · label opacity 0→1 · label x −4→0', 56, 210, 520, 16);
[
  { x: colX[0] - 16, w: 32, state: 'collapsed' },
  { x: colX[1] - 16, w: 64, state: '64px' },
  { x: colX[2] - 16, w: 96, state: '96px' },
  { x: colX[3] - 16, w: 128, state: 'expanded' },
].forEach((s, i) => {
  pill('expand pill ' + i, s.x, 244, s.w, 32);
  searchIcon('expand glyph ' + i, s.x + 8, 252, 16);
  if (i === 1) text('expand peek ' + i, 'Sea…', s.x + 30, 252, 30, { size: 13, color: 'color.text.primary', h: 16 });
  if (i >= 2) text('expand label ' + i, 'Search', s.x + 30, 252, 90, { size: 13, weight: 'medium', h: 16 });
  note('expand state ' + i, s.state, s.x - 6, 286, 140, 16);
});

// Row B — collapse right.
card('collapse right', 32, 382, 1376, 160);
label('collapse right label', 'COLLAPSE · RIGHT', 56, 398, 300);
note('collapse right note', '100 ms · label 1→0 while width returns · the icon never moves', 56, 416, 520, 16);
[
  { x: colX[1] - 16, w: 128, text: 'Search', state: '128px' },
  { x: colX[2] - 16, w: 72, text: 'Sea…', state: '72px' },
  { x: colX[3] - 16, w: 32, text: '', state: '32px' },
].forEach((s, i) => {
  pill('collapse pill ' + i, s.x, 444, s.w, 32);
  searchIcon('collapse glyph ' + i, s.x + 8, 452, 16);
  if (s.text) text('collapse text ' + i, s.text, s.x + 30, 452, 90, { size: 13, weight: 'medium', h: 16 });
  note('collapse state ' + i, s.state, s.x - 6, 486, 100, 16);
});
text('collapse timing', '0 → 100 ms; no delay after the pointer leaves. Focus loss uses the same exit.', 340, 508, 900, {
  size: 10,
  color: 'color.text.muted',
  h: 16,
});

// Row C — left expansion: each state keeps its own trailing edge.
card('expand left', 32, 558, 1376, 140);
label('expand left label', 'EXPAND · LEFT (TRAILING EDGE)', 56, 574, 320);
note('expand left note', 'icon anchors right · label grows left · the control does not push the window edge', 56, 592, 560, 16);
[
  { x: 728, w: 32, text: '' },
  { x: 884, w: 96, text: 'Sea…' },
  { x: 995, w: 157, text: 'More actions' },
].forEach((s, i) => {
  pill('left pill ' + i, s.x, 618, s.w, 32);
  menuIcon('left glyph ' + i, s.x + s.w - 24, 626, 16);
  if (s.text) text('left text ' + i, s.text, s.x + 12, 626, s.w - 44, { size: 13, weight: 'medium', h: 16 });
});
note('left state 0', '32px', 722, 660, 80, 14);
note('left state 1', '96px', 878, 660, 80, 14);
note('left state 2', '157px · measured', 989, 660, 160, 14);

// Reduced motion and tokens.
card('reduced', 32, 714, 660, 150);
label('reduced label', 'PREFERS-REDUCED-MOTION', 56, 730, 260);
note('reduced note', 'width resolves on the same frame; no translate, no opacity tween.', 56, 748, 600, 16);
pill('reduced collapsed', 56, 782, 32, 32);
searchIcon('reduced glyph a', 64, 790, 16);
K.icon(b, 'reduced arrow', '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 106, 790, 16, { color: 'color.text.muted' });
pill('reduced expanded', 138, 782, 128, 32);
searchIcon('reduced glyph b', 146, 790, 16);
text('reduced text', 'Search', 168, 790, 84, { size: 13, weight: 'medium', h: 16 });

card('tokens', 708, 714, 700, 150);
label('tokens label', 'TOKENS AND PROPERTIES', 732, 730, 300);
const rows = [
  ['motion.duration.fast', '100 ms', 'collapse'],
  ['motion.duration.base', '160 ms', 'expand'],
  ['motion.ease.out', 'cubic-bezier(.2,0,0,1)', 'expand'],
  ['width', '32 → label + 40', 'the exception'],
  ['opacity', '0 → 1', 'label'],
  ['transform', 'translateX(−4px → 0)', 'label'],
];
rows.forEach((row, i) => {
  const y = 754 + i * 16;
  text('tok k ' + i, row[0], 732, y, 170, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 14 });
  text('tok v ' + i, row[1], 912, y, 210, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.primary', h: 14 });
  note('tok n ' + i, row[2], 1136, y, 240, 14);
});


K.organize(page);
