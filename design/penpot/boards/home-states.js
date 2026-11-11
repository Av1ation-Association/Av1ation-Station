// Home state set: Populated / Empty / Loading / Error / Narrow / Wide.
//
// Geometry follows the shipped screen: a 32 px page gutter, the "Projects" heading at
// y = 88 with its one-line helper, a bordered list whose rows are 74 px, and the footer
// pinned to the bottom edge. A whole row opens its project; delete is the only control
// inside it, at the trailing edge.
//
// Run after kit.js. Idempotent by board name; storage.homeOnly draws one state.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '03 Home');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAMES = [
  'Home / Populated',
  'Home / Empty',
  'Home / Loading',
  'Home / Error',
  'Home / Narrow',
  'Home / Wide',
];
const ONLY = storage.homeOnly || null;
for (const name of NAMES) {
  if (ONLY && name !== ONLY) continue;
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}

const LAYOUT = {
  'Home / Populated': [0, 0],
  'Home / Empty': [1504, 0],
  'Home / Loading': [0, 964],
  'Home / Error': [1504, 964],
  'Home / Narrow': [0, 1928],
  // The 1920 board follows the 1024 narrow board in the same row, 64 px away,
  // so the width pair reads together and the page stops carrying a 768 px hole.
  'Home / Wide': [1088, 1928],
};

const rowH = 74;

function parts(b) {
  return {
    text: (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o),
    sep: (name, x, y, w) => K.rect(b, name, x, y, w, 1, { fill: 'color.border.default', r: 0 }),
    card: (name, x, y, w, h, dashed) =>
      K.rect(b, name, x, y, w, h, {
        fill: 'color.bg.surface',
        r: 8,
        stroke: dashed ? 'color.border.strong' : 'color.border.default',
        strokeStyle: dashed ? 'dashed' : 'solid',
      }),
  };
}

// The header block and its primary action; returns the list's top edge.
function heading(b, w, opts = {}) {
  const P = parts(b);
  P.text('home title', 'Projects', 32, 88, 400, {
    size: 24,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 32,
  });
  // Search narrows the list in place; there is no sort control. The field sits where the
  // ordering sentence used to, so the header keeps its height.
  K.rect(b, 'home search', 32, 124, 420, 32, {
    fill: 'color.bg.sunken',
    r: 6,
    stroke: 'color.border.strong',
  });
  K.icon(
    b,
    'home search icon',
    '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    44,
    132,
    14,
    { color: 'color.text.muted', sw: 1.6 },
  );
  P.text('home search placeholder', 'Search projects', 66, 124, 360, {
    size: 12,
    color: 'color.text.muted',
    valign: 'center',
    h: 32,
  });
  const bw = 125;
  const bx = w - 32 - bw;
  K.rect(b, 'home new project', bx, 124, bw, 32, { fill: 'color.brand.default', r: 6 });
  K.icon(b, 'home new project icon', '<path d="M5 12h14"/><path d="M12 5v14"/>', bx + 12, 132, 16, {
    color: 'color.text.on-brand',
    sw: 2,
  });
  P.text('home new project label', 'New project', bx + 36, 124, bw - 44, {
    size: 12.5,
    weight: 'medium',
    color: 'color.text.on-brand',
    valign: 'center',
    h: 32,
  });
  return 166;
}

function footer(b, w, h) {
  const P = parts(b);
  const y = h - 70;
  P.sep('home footer edge', 32, y, w - 64);
  P.text('home footer version', 'Av1ation Station v0.1.0', 32, y + 15, 400, {
    size: 11,
    color: 'color.text.muted',
    h: 18,
  });
  P.text('home footer about', 'About', w - 62, y + 15, 30, {
    size: 11,
    color: 'color.text.secondary',
    h: 18,
  });
  P.text('home footer github', 'GitHub', w - 112, y + 15, 36, {
    size: 11,
    color: 'color.text.secondary',
    h: 18,
  });
}

function projectRow(b, x, y, w, project, last) {
  const P = parts(b);
  P.text('home row name ' + project.name, project.name, x + 17, y + 14, w - 250, {
    size: 14,
    weight: 'medium',
    color: 'color.text.primary',
    h: 20,
  });
  K.icon(
    b,
    'home row folder ' + project.name,
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    x + 16,
    y + 45,
    14,
    { color: 'color.text.muted', sw: 1.6 },
  );
  P.text('home row path ' + project.name, project.path, x + 36, y + 42, w - 440, {
    size: 11,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 16,
  });
  P.text('home row size ' + project.name, project.size, x + w - 184, y + 18, 112, {
    size: 11,
    color: 'color.text.secondary',
    align: 'right',
    h: 16,
  });
  P.text('home row count ' + project.name, project.videos, x + w - 184, y + 38, 112, {
    size: 11,
    color: 'color.text.muted',
    align: 'right',
    h: 16,
  });
  K.rect(b, 'home row delete ' + project.name, x + w - 45, y + 23, 28, 28, { fill: null, r: 6 });
  K.icon(
    b,
    'home row delete icon ' + project.name,
    '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    x + w - 38,
    y + 30,
    14,
    { color: 'color.text.secondary', sw: 1.6 },
  );
  if (!last) P.sep('home row sep ' + project.name, x, y + rowH - 1, w);
}

const PROJECTS = [
  { name: 'Big Buck Bunny', path: '~/Videos/Blender/Big Buck Bunny', size: '47.9 GB on disk', videos: '7 / 12 videos' },
  { name: "Sintel — Director's Cut", path: '/mnt/media/4k/Sintel (2026 remaster)', size: '12.4 GB on disk', videos: '4 / 4 videos' },
  { name: 'Tears of Steel 4K', path: '/mnt/media/4k/Tears of Steel', size: '86.1 GB on disk', videos: '21 / 21 videos' },
  { name: 'Cosmos Laundromat', path: '~/Videos/Blender/Cosmos Laundromat', size: '6.8 GB on disk', videos: '3 / 3 videos' },
  { name: 'Spring', path: '~/Videos/Blender/Spring', size: '1.2 GB on disk', videos: '1 / 1 video' },
];

function populated(w, h) {
  const b = K.board(null, 'Home / Populated', ...LAYOUT['Home / Populated'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const top = heading(b, w);
  const x = 32;
  const cw = w - 64;
  parts(b).card('home list', x, top, cw, PROJECTS.length * rowH);
  PROJECTS.forEach((project, i) =>
    projectRow(b, x, top + i * rowH, cw, project, i === PROJECTS.length - 1),
  );
  footer(b, w, h);
}

function empty(w, h) {
  const b = K.board(null, 'Home / Empty', ...LAYOUT['Home / Empty'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const top = heading(b, w);
  const P = parts(b);
  const cw = w - 64;
  P.card('home empty card', 32, top, cw, 264, true);
  P.text('home empty title', 'No projects yet', 32, top + 56, cw, {
    size: 18,
    weight: 'semibold',
    color: 'color.text.primary',
    align: 'center',
    h: 24,
  });
  P.text(
    'home empty copy',
    'A project holds one configuration and one video queue, plus the scene chunks every run retains.',
    32 + (cw - 520) / 2,
    top + 90,
    520,
    { size: 13, color: 'color.text.secondary', align: 'center', h: 44, lh: 1.5 },
  );
  const bw = 125;
  const bx = w / 2 - bw / 2;
  K.rect(b, 'home empty button', bx, top + 148, bw, 36, { fill: 'color.brand.default', r: 6 });
  K.icon(b, 'home empty icon', '<path d="M5 12h14"/><path d="M12 5v14"/>', bx + 12, top + 158, 16, {
    color: 'color.text.on-brand',
    sw: 2,
  });
  P.text('home empty label', 'New project', bx + 36, top + 148, bw - 44, {
    size: 12.5,
    weight: 'medium',
    color: 'color.text.on-brand',
    valign: 'center',
    h: 36,
  });
  footer(b, w, h);
}

function loading(w, h) {
  const b = K.board(null, 'Home / Loading', ...LAYOUT['Home / Loading'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const P = parts(b);
  const top = heading(b, w);
  const cw = w - 64;
  P.card('home loading list', 32, top, cw, 4 * rowH);
  for (let i = 0; i < 4; i++) {
    const y = top + i * rowH;
    K.rect(b, 'home skeleton name ' + i, 49, y + 16, 210 - i * 16, 12, {
      fill: 'color.bg.raised',
      r: 4,
    });
    K.rect(b, 'home skeleton path ' + i, 49, y + 40, 380 - i * 30, 9, {
      fill: 'color.bg.raised',
      r: 3,
    });
    K.rect(b, 'home skeleton size ' + i, w - 218, y + 16, 104, 10, { fill: 'color.bg.raised', r: 4 });
    K.rect(b, 'home skeleton count ' + i, w - 218, y + 34, 80, 10, { fill: 'color.bg.raised', r: 4 });
    if (i < 3) P.sep('home skeleton sep ' + i, 32, y + rowH - 1, cw);
  }
  footer(b, w, h);
}

function error(w, h) {
  const b = K.board(null, 'Home / Error', ...LAYOUT['Home / Error'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const P = parts(b);
  const top = heading(b, w);
  const cw = w - 64;
  K.rect(b, 'home error card', 32, top, cw, 148, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.state.danger',
  });
  P.text('home error title', 'The project list could not be loaded', 52, top + 20, 700, {
    size: 14,
    weight: 'medium',
    color: 'color.text.primary',
    h: 20,
  });
  P.text(
    'home error copy',
    'The local service did not respond. Check that the service is running, then retry.',
    52,
    top + 44,
    760,
    { size: 12, color: 'color.text.secondary', h: 18 },
  );
  K.rect(b, 'home error retry', 52, top + 80, 132, 30, {
    fill: null,
    r: 6,
    stroke: 'color.border.strong',
  });
  P.text('home error retry label', 'Retry connection', 52, top + 80, 132, {
    size: 12,
    color: 'color.text.primary',
    align: 'center',
    valign: 'center',
    h: 30,
  });
  footer(b, w, h);
}

function narrow() {
  const w = 1024;
  const h = 768;
  const b = K.board(null, 'Home / Narrow', ...LAYOUT['Home / Narrow'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const top = heading(b, w);
  const cw = w - 64;
  parts(b).card('home narrow list', 32, top, cw, 3 * rowH);
  PROJECTS.slice(0, 3).forEach((project, i) =>
    projectRow(b, 32, top + i * rowH, cw, project, i === 2),
  );
  footer(b, w, h);
}

function wide() {
  const w = 1920;
  const h = 1080;
  const b = K.board(null, 'Home / Wide', ...LAYOUT['Home / Wide'], w, h);
  K.chrome(b, w, [{ label: 'Projects', current: true }]);
  const top = heading(b, w);
  const cw = w - 64;
  parts(b).card('home wide list', 32, top, cw, 6 * rowH);
  PROJECTS.concat([
    { name: 'Agent 327', path: '~/Videos/Blender/Agent 327', size: '—', videos: '0 videos' },
  ]).forEach((project, i) => projectRow(b, 32, top + i * rowH, cw, project, i === 5));
  footer(b, w, h);
}

if (!ONLY || ONLY === 'Home / Populated') populated(1440, 900);
if (!ONLY || ONLY === 'Home / Empty') empty(1440, 900);
if (!ONLY || ONLY === 'Home / Loading') loading(1440, 900);
if (!ONLY || ONLY === 'Home / Error') error(1440, 900);
if (!ONLY || ONLY === 'Home / Narrow') narrow();
if (!ONLY || ONLY === 'Home / Wide') wide();

for (const [name, [x, y]] of Object.entries(LAYOUT)) {
  const board = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (!board) continue;
  board.x = x;
  board.y = y;
}

K.organize(page);
