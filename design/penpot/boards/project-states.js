// Project state set: Populated / Empty / Loading / Error / Narrow / Wide.
//
// Geometry is the shipped screen, measured at 1440: a 32 px gutter, the project name at
// y = 88, one "Configuration and Defaults" panel of seven 132 px cards in a three-column
// grid, then the queue panel. At 1920 (the 3xl stop) the queue moves into a right column.
// The whole row opens the video; the checkbox, run control and overflow are its only
// controls.
//
// Run after kit.js. Idempotent by board name; set storage.projectOnly to draw one board.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '05 Project');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAMES = [
  'Project / Populated',
  'Project / Empty',
  'Project / Loading',
  'Project / Error',
  'Project / Narrow',
  'Project / Wide',
];
const ONLY = storage.projectOnly || null;
for (const name of NAMES) {
  if (ONLY && name !== ONLY) continue;
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}

// The width pair shares the third row. The live-only `Project / VapourSynth Script`
// child sits below it at [0, 3072]; this generator neither draws nor removes it.
const LAYOUT = {
  'Project / Populated': [0, 0],
  'Project / Empty': [1504, 0],
  'Project / Loading': [0, 964],
  'Project / Error': [1504, 964],
  'Project / Narrow': [0, 1928],
  'Project / Wide': [1088, 1928],
};

const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  grip: '<circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18"/><path d="M17 3v18"/><path d="M3 12h18"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};

function chip(b, name, x, y, label, tone) {
  const w = Math.round(label.length * 5.9) + 16;
  const ink =
    tone === 'success'
      ? 'color.state.success'
      : tone === 'warning'
        ? 'color.state.warning'
        : tone === 'info'
          ? 'color.state.info'
          : 'color.text.muted';
  const fill =
    tone === 'success'
      ? 'color.state.success-bg'
      : tone === 'warning'
        ? 'color.state.warning-bg'
        : tone === 'info'
          ? 'color.state.info-bg'
          : null;
  K.rect(b, name, x, y, w, 18, { fill, r: 9, stroke: ink, sw: 1 });
  K.text(b, name + ' label', label.toUpperCase(), x, y, w, {
    size: 8.5,
    family: 'JetBrains Mono',
    weight: 'medium',
    color: ink,
    align: 'center',
    valign: 'center',
    h: 18,
  });
  return w;
}

// A queue chip is sentence-case UI text, not the mono pipeline label a section card
// uses. It names the stage outright ("Scene Detection incomplete"), so the warning tone
// is never the only thing telling the user what stopped.
function statusChip(b, name, x, y, label, tone) {
  const w = Math.round(label.length * 5.35) + 16;
  const ink = tone === 'success' ? 'color.state.success' : tone === 'warning' ? 'color.state.warning' : 'color.text.secondary';
  const fill = tone === 'success' ? 'color.state.success-bg' : tone === 'warning' ? 'color.state.warning-bg' : 'color.state.neutral-bg';
  K.rect(b, name, x, y, w, 18, { fill, r: 9, stroke: ink, sw: 1 });
  K.text(b, name + ' label', label, x, y, w, {
    size: 9.5,
    weight: 'medium',
    color: ink,
    align: 'center',
    valign: 'center',
    h: 18,
  });
  return w;
}

function button(b, name, x, y, w, h, label, tone, icon, size = 12) {
  const primary = tone === 'primary';
  K.rect(b, name, x, y, w, h, {
    fill: primary ? 'color.brand.default' : tone === 'ghost' ? null : 'color.bg.raised',
    r: 6,
    stroke: primary || tone === 'ghost' ? null : 'color.border.strong',
  });
  const ink = primary ? 'color.text.on-brand' : 'color.text.secondary';
  if (icon) K.icon(b, name + ' icon', ICONS[icon], x + 10, y + (h - 12) / 2, 12, { color: ink, sw: 2 });
  K.text(b, name + ' label', label, x + (icon ? 26 : 10), y, w - (icon ? 30 : 12), {
    size,
    weight: 'medium',
    color: ink,
    valign: 'center',
    h,
  });
}

function iconButton(b, name, x, y, size, icon, tone) {
  if (tone !== 'plain') {
    K.rect(b, name, x, y, size, size, {
      fill: 'color.bg.raised',
      r: 6,
      stroke: 'color.border.strong',
    });
  }
  K.icon(b, name + ' icon', ICONS[icon], x + (size - 14) / 2, y + (size - 14) / 2, 14, {
    color: 'color.text.secondary',
    sw: 1.8,
  });
}

function heading(b, x, y, value, hint) {
  K.text(b, 'project title', value, x, y, 700, {
    size: 24,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 32,
  });
  if (hint) {
    K.text(b, 'project hint', hint, x, y + 32, 800, {
      size: 11,
      color: 'color.text.muted',
      h: 16,
    });
  }
}

// One section card: title, optional badge, summary lines.
function sectionCard(b, x, y, w, h, section) {
  K.rect(b, 'card ' + section.title, x, y, w, h, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });
  K.text(b, 'card title ' + section.title, section.title, x + 21, y + 17, w - 120, {
    size: 15,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 22,
  });
  chip(b, 'card badge ' + section.title, x + w - 20 - (section.badge.length * 5.9 + 16), y + 16, section.badge, section.tone);
  section.lines.forEach((line, i) =>
    K.text(b, 'card line ' + section.title + ' ' + i, line, x + 21, y + 47 + i * 19, w - 42, {
      size: 11.5,
      color: 'color.text.secondary',
      h: 18,
    }),
  );
}

const SECTIONS = [
  { title: 'General', badge: 'Set', tone: 'success', lines: ['FFMS2 · native decode', 'Next to input · 10-bit'] },
  {
    title: 'Scene detection',
    badge: 'Set',
    tone: 'success',
    lines: ['AVSceneChange · 24–240 frames per scene', 'Standard scorer · Standard'],
  },
  {
    title: 'Noise generation',
    badge: 'Set',
    tone: 'success',
    lines: ['Noise detector · on · WNNM → WNNM', 'Noise scaler · on · 2–10, threshold 0.002'],
  },
  {
    title: 'Target quality',
    badge: 'Set',
    tone: 'success',
    lines: ['Target quality · BUTTERAUGLI 4.9–5.1', 'Speed scaling · 2 points', 'Bitrate optimization · σ 3'],
  },
  { title: 'Encoding', badge: 'Set', tone: 'success', lines: ['SVT-AV1 · 2 workers', '6 parameters · Photon Noise enabled'] },
  { title: 'Concatenation', badge: 'Set', tone: 'success', lines: ['mkvmerge', 'Joins the encoded chunks'] },
  {
    title: 'Quality check',
    badge: 'Engine default',
    tone: 'neutral',
    lines: ['Off', 'Scores the concatenated video against the input'],
  },
];

// The configuration panel. Returns its height.
function configPanel(b, x, y, w, cols) {
  const gap = 12;
  const inner = w - 50;
  const cardW = (inner - gap * (cols - 1)) / cols;
  const rows = Math.ceil(SECTIONS.length / cols);
  const h = 61 + rows * 132 + (rows - 1) * gap + 17;
  K.rect(b, 'configuration panel', x, y, w, h, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });
  K.text(b, 'configuration title', 'Configuration and Defaults', x + 25, y + 21, 240, {
    size: 16,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 24,
  });
  K.text(
    b,
    'configuration hint',
    'Every video inherits these unless its own section overrides them.',
    x + 248,
    y + 27,
    340,
    { size: 11, color: 'color.text.muted', h: 16 },
  );
  SECTIONS.forEach((section, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    sectionCard(b, x + 25 + col * (cardW + gap), y + 61 + row * (132 + gap), cardW, 132, section);
  });
  return h;
}

const QUEUE_ROWS = [
  {
    name: 'S02E01',
    path: 'The.Angel.Next.Door.Spoils.Me.Rotten.S02E01.Going.to.School.Together.and.Making.a.Debut.1080p.CR.WEB-DL.MULTi.AAC2.0.H.264-VARYG.mkv · 274 KB retained',
    chip: 'Scene Detection incomplete',
    tone: 'warning',
    progress: 37,
  },
  {
    name: 'S02E02',
    path: 'The.Angel.Next.Door.Spoils.Me.Rotten.S02E02.1080p.CR.WEB-DL.MULTi.AAC2.0.H.264-VARYG.mkv · 1.2 MB retained',
    chip: 'Encoded',
    tone: 'success',
  },
  {
    name: 'S02E03',
    path: 'The.Angel.Next.Door.Spoils.Me.Rotten.S02E03.1080p.CR.WEB-DL.MULTi.AAC2.0.H.264-VARYG.mkv',
    chip: 'Queued',
    tone: 'neutral',
  },
];

function queueRow(b, x, y, w, row) {
  K.rect(b, 'row checkbox ' + row.name, x + 8, y + 25, 14, 14, {
    fill: 'color.bg.base',
    r: 3,
    stroke: 'color.border.strong',
  });
  K.icon(b, 'row grip ' + row.name, ICONS.grip, x + 33, y + 25, 14, { color: 'color.text.muted', sw: 1.4 });
  K.text(b, 'row name ' + row.name, row.name, x + 64, y + 13, 420, {
    size: 13,
    weight: 'medium',
    color: 'color.text.primary',
    h: 20,
  });
  K.text(b, 'row path ' + row.name, row.path, x + 64, y + 34, w - 380, {
    size: 10.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 16,
  });
  // The row's Start is the same neutral, bordered control as the header, only compact:
  // it expands to its word on hover. A bare icon reads as a scrub control, not a run.
  const runX = x + w - 8 - 28 - 8 - 24;
  const chipW = Math.round(row.chip.length * 5.35) + 16;
  statusChip(b, 'row chip ' + row.name, runX - 8 - chipW, y + 23, row.chip, row.tone);
  iconButton(b, 'row run ' + row.name, runX, y + 20, 24, 'play', 'soft');
  iconButton(b, 'row more ' + row.name, x + w - 8 - 28, y + 18, 28, 'more', 'plain');
  if (row.progress !== undefined) {
    K.rect(b, 'row progress ' + row.name, x + 64, y + 61, w - 72, 3, {
      fill: 'color.bg.raised',
      r: 0,
    });
    K.rect(b, 'row progress value ' + row.name, x + 64, y + 61, (w - 72) * row.progress / 100, 3, {
      fill: 'color.state.warning',
      r: 0,
    });
  }
}

function queueEmpty(b, x, y, w) {
  K.rect(b, 'queue empty', x, y, w, 232, {
    fill: 'color.bg.sunken',
    r: 8,
    stroke: 'color.border.strong',
    strokeStyle: 'dashed',
  });
  K.icon(b, 'queue empty film', ICONS.film, x + w / 2 - 12, y + 40, 24, { color: 'color.text.secondary', sw: 1.4 });
  K.text(b, 'queue empty title', 'Add videos to the queue', x, y + 76, w, {
    size: 15,
    weight: 'semibold',
    color: 'color.text.primary',
    align: 'center',
    h: 22,
  });
  K.text(
    b,
    'queue empty copy',
    "Files stay where they are; nothing is copied. Added videos inherit the project's General defaults.",
    x + (w - 520) / 2,
    y + 102,
    520,
    { size: 11.5, color: 'color.text.secondary', align: 'center', h: 36 },
  );
  K.text(b, 'queue empty formats', 'MKV · MP4 · MOV · several at once', x, y + 142, w, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'center',
    h: 14,
  });
  const bw = 110;
  button(b, 'queue empty add', x + w / 2 - bw / 2, y + 170, bw, 32, 'Add videos', 'primary', 'plus');
}

function queueSkeleton(b, x, y, w, rows) {
  for (let i = 0; i < rows; i++) {
    const ry = y + i * 56;
    K.rect(b, 'skeleton box ' + i, x + 8, ry + 20, 14, 14, { fill: 'color.bg.raised', r: 3 });
    K.rect(b, 'skeleton grip ' + i, x + 34, ry + 20, 12, 14, { fill: 'color.bg.raised', r: 3 });
    K.rect(b, 'skeleton name ' + i, x + 64, ry + 16, 176, 12, { fill: 'color.bg.raised', r: 3 });
    K.rect(b, 'skeleton path ' + i, x + 64, ry + 34, 256, 8, { fill: 'color.bg.raised', r: 3 });
    K.rect(b, 'skeleton chip ' + i, x + w - 120, ry + 18, 80, 18, { fill: 'color.bg.raised', r: 9 });
  }
}

// The queue panel. `rows` is a row count for the skeleton, a list for real rows, or 0.
function queuePanel(b, x, y, w, options = {}) {
  const rows = options.rows || [];
  const empty = options.empty === true;
  const skeleton = options.skeleton || 0;
  const listH = empty ? 248 : Math.max(64, skeleton * 56) + 8;
  const h = 73 + listH + 16;
  K.rect(b, 'queue panel', x, y, w, h, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });
  K.text(b, 'queue title', 'Queue', x + 25, y + 27, 60, {
    size: 16,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 24,
  });
  K.text(b, 'queue meta', options.meta, x + 82, y + 32, 380, {
    size: 10.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 16,
  });

  const moreX = x + w - 25 - 28;
  iconButton(b, 'queue more', moreX, y + 25, 28, 'more');
  if (!empty) {
    button(b, 'queue add', moreX - 8 - 107, y + 21, 107, 36, 'Add videos', 'primary', 'plus');
    button(
      b,
      'queue start',
      moreX - 8 - 107 - 8 - 66,
      y + 25,
      66,
      28,
      options.running ? 'Stop' : 'Start',
      'secondary',
      options.running ? 'square' : 'play',
    );
  }

  if (empty) {
    queueEmpty(b, x + 25, y + 73, w - 50);
  } else if (skeleton > 0) {
    queueSkeleton(b, x + 17, y + 73, w - 34, skeleton);
  } else {
    rows.forEach((row, i) => {
      queueRow(b, x + 17, y + 73 + i * 64, w - 34, row);
      K.rect(b, 'row rule ' + i, x + 17, y + 73 + (i + 1) * 64 - 1, w - 34, 1, {
        fill: 'color.border.subtle',
        r: 0,
      });
    });
  }
  return h;
}

function lockPill(b, x, y) {
  K.rect(b, 'lock pill', x, y, 326, 30, {
    fill: 'color.state.warning-bg',
    r: 15,
    stroke: 'color.state.warning',
  });
  K.icon(b, 'lock icon', ICONS.lock, x + 12, y + 8, 14, { color: 'color.state.warning', sw: 1.6 });
  K.text(b, 'lock label', 'Configuration is locked while a video encodes', x + 32, y, 284, {
    size: 10.5,
    color: 'color.state.warning',
    valign: 'center',
    h: 30,
  });
}

function populated() {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Populated', ...LAYOUT['Project / Populated'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  heading(b, 32, 88, 'Big Buck Bunny');
  configPanel(b, 32, 140, w - 64, 3);
  queuePanel(b, 32, 662, w - 64, {
    meta: '1 video · 581 KB on disk · drag to reorder',
    rows: QUEUE_ROWS.slice(0, 1),
  });
}

function empty() {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Empty', ...LAYOUT['Project / Empty'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  heading(b, 32, 88, 'Big Buck Bunny');
  const ch = configPanel(b, 32, 140, w - 64, 3);
  queuePanel(b, 32, 140 + ch + 24, w - 64, { meta: '0 videos · drag to reorder', empty: true });
}

function loading() {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Loading', ...LAYOUT['Project / Loading'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Project', current: true }]);
  K.rect(b, 'loading eyebrow', 32, 88, 144, 10, { fill: 'color.bg.raised', r: 3 });
  K.rect(b, 'loading title', 32, 111, 256, 24, { fill: 'color.bg.raised', r: 4 });
  K.rect(b, 'loading hint', 32, 144, 380, 12, { fill: 'color.bg.raised', r: 3 });
  const gap = 12;
  const cardW = (w - 64 - 50 - gap * 2) / 3;
  for (let i = 0; i < 7; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    K.rect(b, 'loading card ' + i, 32 + 25 + col * (cardW + gap), 165 + row * 144, cardW, 132, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: 'color.border.default',
    });
  }
  K.rect(b, 'loading queue', 32, 630, w - 64, 296, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });
}

function error() {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Error', ...LAYOUT['Project / Error'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Project', current: true }]);
  K.rect(b, 'error card', 360, 120, 720, 190, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.state.danger',
  });
  K.text(b, 'error title', 'This project could not be opened', 384, 144, 680, {
    size: 20,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 28,
  });
  K.text(b, 'error copy', 'The service did not respond.', 384, 180, 660, {
    size: 13,
    color: 'color.text.secondary',
    h: 20,
  });
  button(b, 'error retry', 384, 220, 76, 32, 'Retry', 'secondary');
}

function narrow() {
  const w = 1024;
  const h = 1060;
  const b = K.board(null, 'Project / Narrow', ...LAYOUT['Project / Narrow'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  heading(b, 23, 88, 'Big Buck Bunny');
  const ch = configPanel(b, 23, 140, w - 46, 2);
  queuePanel(b, 23, 140 + ch + 24, w - 46, {
    meta: '1 video · 581 KB on disk · drag to reorder',
    rows: QUEUE_ROWS.slice(0, 1),
  });
}

function wide() {
  const w = 1920;
  const h = 1080;
  const b = K.board(null, 'Project / Wide', ...LAYOUT['Project / Wide'], w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  heading(b, 40, 88, 'Big Buck Bunny');
  lockPill(b, w - 40 - 326, 89);
  const left = (w - 80 - 24) * 1.1 / 2.1;
  configPanel(b, 40, 140, left, 3);
  queuePanel(b, 40 + left + 24, 140, w - 80 - left - 24, {
    meta: '3 videos · 39.2 GB on disk',
    rows: QUEUE_ROWS,
  });
}

if (!ONLY || ONLY === 'Project / Populated') populated();
if (!ONLY || ONLY === 'Project / Empty') empty();
if (!ONLY || ONLY === 'Project / Loading') loading();
if (!ONLY || ONLY === 'Project / Error') error();
if (!ONLY || ONLY === 'Project / Narrow') narrow();
if (!ONLY || ONLY === 'Project / Wide') wide();

for (const [name, [x, y]] of Object.entries(LAYOUT)) {
  const board = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (!board) continue;
  board.x = x;
  board.y = y;
}
K.organize(page);
return page.findShapes({ type: 'board' }).map((b) => b.name);
