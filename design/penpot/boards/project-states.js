// Project state set: Populated / Empty / Loading / Error / Narrow / Wide on the
// shell without a global sidebar. The Script editor board is drawn separately.
// The project screen is General: no other section summary is drawn under it.
// Run after kit.js. Idempotent by board name; set storage.projectOnly to draw one.
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
  if (ONLY && !name.toLowerCase().includes(ONLY)) continue;
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}

// Root-board layout: 64 px gutters, rows packed by the tallest board plus 64.
const LAYOUT = {
  'Project / Populated': [0, 0],
  'Project / Empty': [1504, 0],
  'Project / Loading': [0, 964],
  'Project / Error': [1504, 964],
  'Project / Narrow': [0, 1928],
  'Project / Script editor': [1504, 1928],
  'Project / Wide': [0, 2912],
};

const tw = (s, size) => Math.round(String(s).length * size * 0.56);
// Sections run in dependency order: Target quality produces quantizers that
// Encoding consumes. Do not derive this order from a list in another module.
const SECTIONS = [
  'General',
  'Scene detection',
  'Noise generation',
  'Target quality',
  'Encoding',
  'Concatenation',
  'Quality check',
];

function helpers(b) {
  const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
  const note = (name, value, x, y, w, h) =>
    K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
  const label = (value, x, y, w) =>
    K.text(b, 'label ' + value + ' ' + x + y, value, x, y, w || 200, {
      size: 9.5,
      weight: 'medium',
      color: 'color.text.secondary',
      h: 14,
    });
  const card = (name, x, y, w, h) =>
    K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  const chip = (name, x, y, value, tone, o = {}) => {
    const map = {
      neutral: ['color.state.neutral-bg', 'color.state.neutral'],
      success: ['color.state.success-bg', 'color.state.success'],
      warning: ['color.state.warning-bg', 'color.state.warning'],
      danger: ['color.state.danger-bg', 'color.state.danger'],
      info: ['color.state.info-bg', 'color.state.info'],
    };
    const [bg, fg] = map[tone || 'neutral'];
    const w = o.w || tw(value, 10) + 20;
    K.rect(b, name, x, y, w, o.h || 20, { fill: bg, r: 999, stroke: fg });
    text(name + ' t', value, x + 10, y, w - 16, { size: 10, color: fg, valign: 'center', h: o.h || 20 });
    return w;
  };
  const btn = (name, x, y, value, o = {}) => {
    const h = o.h || 30;
    const w = o.w || tw(value, 11) + 26;
    K.rect(b, name, x, y, w, h, {
      fill: o.primary ? 'color.brand.default' : o.ghost ? null : 'color.bg.raised',
      r: 5,
      stroke: o.primary || o.ghost ? null : 'color.border.default',
    });
    let ix = 0;
    if (o.icon) {
      K.icon(b, name + ' i', o.icon, x + 10, y + h / 2 - 7, 14, {
        color: o.primary ? 'color.text.on-brand' : 'color.text.secondary',
      });
      ix = 26;
    }
    text(name + ' t', value, x + ix, y, w - ix, {
      size: 11,
      weight: o.primary ? 'semibold' : 'regular',
      color: o.primary ? 'color.text.on-brand' : o.danger ? 'color.state.danger' : 'color.text.secondary',
      align: o.icon ? 'left' : 'center',
      valign: 'center',
      h,
    });
    return w;
  };
  const radio = (name, x, y, on) => {
    K.rect(b, name, x, y, 14, 14, {
      fill: on ? 'color.brand.default' : null,
      stroke: on ? 'color.brand.default' : 'color.border.strong',
      r: 7,
    });
    if (on) K.rect(b, name + ' dot', x + 4, y + 4, 6, 6, { fill: 'color.text.on-brand', r: 3 });
  };
  const sep = (name, x, y, w) => K.rect(b, name, x, y, w, 1, { fill: 'color.border.subtle', r: 0 });
  return { text, note, label, card, chip, btn, radio, sep };
}

function strip(b, w, opts = {}) {
  const C = helpers(b);
  K.rect(b, 'project strip', 0, 56, w, 40, { fill: 'color.bg.base' });
  K.rect(b, 'project strip edge', 0, 95, w, 1, { fill: 'color.border.subtle', r: 0 });
  if (opts.skeleton) {
    K.rect(b, 'strip sk a', 24, 68, 160, 10, { fill: 'color.bg.raised', r: 4 });
    K.rect(b, 'strip sk b', w - 260, 68, 236, 10, { fill: 'color.bg.raised', r: 4 });
    return;
  }
  if (opts.error) {
    K.icon(b, 'strip error icon', '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>', 24, 68, 14, { color: 'color.state.danger' });
    C.text('strip text', opts.status || 'Could not open project', 46, 56, 420, {
      size: 11,
      color: 'color.state.danger',
      valign: 'center',
      h: 40,
    });
  } else if (opts.locked) {
    K.icon(b, 'strip lock', '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 24, 68, 14, { color: 'color.text.secondary' });
    C.text('strip text', opts.status || 'Configuration locked while a video is encoding', 46, 56, 460, {
      size: 11,
      color: 'color.text.secondary',
      valign: 'center',
      h: 40,
    });
  } else {
    K.icon(b, 'strip check', '<path d="m5 12 5 5L20 7"/>', 24, 68, 14, { color: 'color.state.success' });
    C.text('strip text', opts.status || 'All changes saved · 2 min ago', 46, 56, 460, {
      size: 11,
      color: 'color.text.secondary',
      valign: 'center',
      h: 40,
    });
  }
  if (opts.action)
    C.btn('strip action', w - 24 - (opts.actionW || 104), 61, opts.action, {
      w: opts.actionW || 104,
      icon: '<path d="M4 7h16M4 12h16M4 17h10"/>',
      ghost: true,
      h: 28,
    });
  else if (opts.right)
    C.text('strip right', opts.right, w - 600, 56, 576, {
      size: 10.5,
      color: 'color.text.muted',
      align: 'right',
      valign: 'center',
      h: 40,
    });
}

// The local rail is navigation, not status. It never shows a scene count:
// scenes belong to a video, and the Project screen has no selected video.
function rail(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  K.rect(b, 'rail', x, y, w, h, { fill: 'color.bg.surface' });
  K.rect(b, 'rail edge', x + w - 1, y, 1, h, { fill: 'color.border.default', r: 0 });
  C.label('CONFIGURATION', x + 20, y + 24, 180);
  let ry = y + 48;
  if (opts.skeleton) {
    for (let i = 0; i < 7; i++) {
      K.rect(b, 'rail sk ' + i, x + 20, ry + 8, 24, 24, { fill: 'color.bg.raised', r: 12 });
      K.rect(b, 'rail sk t ' + i, x + 54, ry + 15, 110 + (i % 3) * 12, 10, { fill: 'color.bg.raised', r: 4 });
      ry += 40;
    }
    C.sep('rail sk sep', x + 20, ry + 16, w - 40);
    K.rect(b, 'rail sk q', x + 20, ry + 32, 80, 10, { fill: 'color.bg.raised', r: 4 });
    K.rect(b, 'rail sk q2', x + 20, ry + 56, 180, 28, { fill: 'color.bg.raised', r: 5 });
    return;
  }
  SECTIONS.forEach((name, i) => {
    const active = i === 0 && opts.active !== false;
    const configured = i <= 2 && opts.configured !== false;
    if (active) K.rect(b, 'rail active ' + i, x + 8, ry, w - 16, 34, { fill: 'color.bg.raised', r: 5 });
    K.rect(b, 'rail dot ' + i, x + 20, ry + 13, 8, 8, {
      fill: configured ? 'color.state.success' : active ? 'color.text.secondary' : 'color.border.strong',
      r: 4,
    });
    C.text('rail label ' + i, name, x + 42, ry, 150, {
      size: 11.5,
      weight: active ? 'medium' : 'regular',
      color: active ? 'color.text.primary' : 'color.text.secondary',
      valign: 'center',
      h: 34,
    });
    ry += 40;
  });
  C.sep('rail sep', x + 20, ry + 8, w - 40);
  C.label('QUEUE', x + 20, ry + 24, 100);
  C.text('rail queue', 'Queue', x + 42, ry + 44, 100, { size: 11.5, color: 'color.text.secondary', h: 20 });
  C.text('rail queue count', opts.queue || '12 videos', x + 140, ry + 44, 72, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'right',
    h: 20,
  });
  C.text('rail add', '+ Add videos', x + 42, ry + 70, 120, { size: 11, color: 'color.brand.text', h: 18 });
}

function generalCard(b, x, y, w, opts = {}) {
  const C = helpers(b);
  const h = opts.h || 322;
  C.card('general card', x, y, w, h);
  C.text('general head', 'General', x + 24, y + 22, 200, { size: 16, weight: 'semibold', h: 24 });
  C.note('general sub', 'Defaults for videos added to this project', x + 24, y + 46, w - 300, 16);
  C.chip('general source', x + w - 144, y + 22, 'Project defaults', 'neutral', { h: 22 });
  C.label('INPUT', x + 24, y + 86, 80);
  const kinds = [
    ['FFMS2', 'Native decode'],
    ['VapourSynth', '4 importers'],
    ['Script', '.vpy input'],
  ];
  kinds.forEach(([name, sub], i) => {
    const kx = x + 24 + i * 180;
    const on = i === 0;
    K.rect(b, 'p kind ' + i, kx, y + 106, 168, 66, {
      fill: on ? 'color.brand.subtle' : 'color.bg.sunken',
      r: 8,
      stroke: on ? 'color.brand.default' : 'color.border.default',
    });
    C.radio('p kind radio ' + i, kx + 16, y + 120, on);
    C.text('p kind name ' + i, name, kx + 38, y + 116, 120, { size: 11.5, weight: 'medium', h: 18 });
    C.text('p kind sub ' + i, sub, kx + 38, y + 136, 120, { size: 9.5, color: 'color.text.muted', h: 14 });
  });
  const outX = x + 562;
  const outW = w - (outX - x) - 24;
  C.label('OUTPUT', outX, y + 86, 80);
  K.rect(b, 'p output next', outX, y + 106, outW, 34, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  C.radio('p output next radio', outX + 16, y + 116, !opts.folder);
  C.text('p output next t', 'Next to input', outX + 42, y + 106, 160, { size: 11, color: 'color.text.secondary', valign: 'center', h: 34 });
  C.text('p output next s', 'Same folder as the source', outX + 184, y + 106, outW - 196, { size: 9.5, color: 'color.text.muted', valign: 'center', h: 34 });
  K.rect(b, 'p output folder', outX, y + 150, outW, 34, { fill: 'color.bg.sunken', r: 6, stroke: opts.folder ? 'color.brand.default' : 'color.border.default' });
  C.radio('p output folder radio', outX + 16, y + 160, !!opts.folder);
  C.text('p output folder t', 'Specific folder', outX + 42, y + 150, 160, { size: 11, color: 'color.text.primary', valign: 'center', h: 34 });
  C.text('p output path', opts.folder || '/Volumes/Media/Aviation Station', outX + 174, y + 150, outW - 186, { size: 10, family: 'JetBrains Mono', color: 'color.text.secondary', valign: 'center', h: 34 });
  C.label('OUTPUT FORMAT', outX, y + 194, 160);
  C.text('p format', 'MKV · 10-bit · 4:2:0', outX, y + 212, 260, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
  C.text('p format edit', 'Change…', outX + outW - 72, y + 212, 72, { size: 10, color: 'color.brand.text', align: 'right', h: 16 });
  C.note('p output note', 'Existing videos keep their own output. This applies to videos added from now on.', outX, y + 242, outW, 14);
  C.note('p general note', 'Input and output are defaults. A sequence can override its own input; the exact output file is chosen per video.', x + 24, y + h - 34, w - 48, 20);
}

function queueRow(b, x, y, w, row, index, opts = {}) {
  const C = helpers(b);
  const h = 64;
  const selected = !!row.selected;
  if (selected) K.rect(b, 'q row bg ' + index, x - 8, y, w + 16, h, { fill: 'color.brand.subtle', r: 5 });
  K.rect(b, 'q check ' + index, x, y + 24, 16, 16, {
    fill: selected ? 'color.brand.default' : null,
    r: 4,
    stroke: selected ? 'color.brand.default' : 'color.border.strong',
  });
  if (selected) K.icon(b, 'q check mark ' + index, '<path d="m5 12 4 4 10-10"/>', x + 2, y + 26, 12, { color: 'color.text.on-brand', sw: 2 });
  K.icon(b, 'q grip ' + index, '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>', x + 26, y + 24, 14, { color: 'color.text.muted', solid: true });

  // The status chip is the only object centred across both text lines. Size,
  // duration and file name share the second line, so the row never reserves a
  // separate size column. Encoding rows show an estimate, prefixed `est.`.
  const chipW = row.chip ? tw(row.chip, 10) + 20 : 0;
  const chipX = x + w - 44 - chipW;
  const textW = Math.max(120, chipX - (x + 50) - 12);
  C.text('q name ' + index, row.name, x + 50, y + 9, textW, { size: 12, weight: 'medium', h: 18 });
  const meta = [row.file, row.duration, row.size].filter(Boolean).join('  ·  ');
  C.text('q file ' + index, meta, x + 50, y + 30, textW, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  if (row.chip) C.chip('q chip ' + index, chipX, y + 22, row.chip, row.tone, { h: 20 });
  K.icon(b, 'q menu ' + index, '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', x + w - 30, y + 24, 16, { color: 'color.text.muted', solid: true });
  if (row.progress != null) {
    K.rect(b, 'q progress track ' + index, x + 50, y + 61, w - 54, 3, { fill: 'color.bg.raised', r: 2 });
    K.rect(b, 'q progress ' + index, x + 50, y + 61, Math.round((w - 54) * row.progress), 3, { fill: 'color.state.info', r: 2 });
  }
  if (index < opts.rows - 1) C.sep('q sep ' + index, x, y + h - 1, w);
}

function queueCard(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  C.card('queue card', x, y, w, h);
  C.text('queue head', 'Queue', x + 24, y + 22, 100, { size: 16, weight: 'semibold', h: 24 });
  C.text('queue summary', opts.summary || '12 videos · run order · drag to reorder', x + 86, y + 26, 440, { size: 11, color: 'color.text.muted', h: 20 });
  const addW = opts.narrow ? 92 : 104;
  const menuW = 28;
  const menuX = x + w - 24 - menuW;
  const addX = menuX - 8 - addW;
  if (!opts.empty) C.btn('queue add', addX, y + 18, 'Add videos', { w: addW, icon: 'plus', h: 28 });
  K.rect(b, 'queue menu', menuX, y + 18, menuW, 28, { fill: null, r: 5, stroke: 'color.border.default' });
  K.icon(b, 'queue menu icon', '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', menuX + 6, y + 24, 16, { color: 'color.text.secondary', solid: true });

  if (opts.empty) {
    K.rect(b, 'queue drop zone', x + 24, y + 72, w - 48, h - 96, {
      fill: 'color.bg.sunken',
      r: 8,
      stroke: 'color.border.strong',
      strokeStyle: 'dashed',
    });
    K.icon(b, 'queue drop icon', '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>', x + w / 2 - 13, y + h / 2 - 56, 26, { color: 'color.text.secondary' });
    C.text('queue empty title', 'Drop video files here', x + 24, y + h / 2 - 18, w - 48, { size: 14, weight: 'medium', color: 'color.text.primary', align: 'center', h: 20 });
    C.note('queue empty note', 'or use Add videos. Files stay where they are; nothing is copied.', x + w / 2 - 260, y + h / 2 + 4, 520, 16);
    C.note('queue empty note 2', 'Added videos inherit the General defaults above.', x + w / 2 - 260, y + h / 2 + 22, 520, 16);
    C.text('queue empty formats', 'MKV · MP4 · MOV · multiple files at once', x + 24, y + h / 2 + 48, w - 48, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'center',
      h: 16,
    });
    C.btn('queue empty add', x + w / 2 - 60, y + h - 64, 'Add videos', { primary: true, w: 120, icon: 'plus' });
    return;
  }

  if (opts.selected) {
    K.rect(b, 'queue bulk bar', x + 24, y + 52, w - 48, 32, { fill: 'color.bg.raised', r: 6, stroke: 'color.border.subtle' });
    C.text('queue bulk count', '2 selected', x + 36, y + 52, 90, { size: 10.5, weight: 'medium', valign: 'center', h: 32 });
    C.text('queue bulk hint', 'Shift-click extends · Esc clears', x + 126, y + 52, 300, { size: 10, color: 'color.text.muted', valign: 'center', h: 32 });
    const actions = ['Run selected', 'Remove', 'More'];
    const widths = { 'Run selected': 96, Remove: 72, More: 56 };
    let ax = x + w - 24;
    for (let i = actions.length - 1; i >= 0; i--) {
      const aw = widths[actions[i]] || 64;
      ax -= aw;
      C.btn('queue bulk ' + actions[i], ax, y + 56, actions[i], {
        w: aw,
        h: 24,
        ghost: i !== 0,
        danger: actions[i] === 'Remove',
      });
      ax -= 8;
    }
  }

  const start = y + (opts.selected ? 98 : 62);
  const rows = opts.rows || [];
  rows.forEach((row, i) => queueRow(b, x + 24, start + i * 64, w - 48, row, i, { rows: rows.length }));
  if (opts.more) C.text('queue more', opts.more, x + 24, y + h - 26, w - 48, { size: 10, color: 'color.text.muted', h: 16 });
}

// ---------------------------------------------------------------- Populated
if (!ONLY || ONLY === 'populated') {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Populated', 0, 0, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  const C = helpers(b);
  strip(b, w, {
    status: 'Configuration locked · Sintel is encoding',
    locked: true,
    right: '12 videos · 39.2 GB on disk',
  });
  rail(b, 0, 96, 232, h - 96, { queue: '12 videos', configured: true });

  generalCard(b, 264, 120, 1144);
  queueCard(b, 264, 468, 1144, 388, {
    summary: '12 videos · drop files to add · drag to reorder',
    selected: true,
    rows: [
      { name: 'Big Buck Bunny', file: 'bunny_1080p.mkv', duration: '00:09:56', chip: 'Encoded', tone: 'success', size: '1.42 GB', selected: true },
      { name: "Sintel — Director's Cut", file: 'sintel_2160p.mkv', duration: '00:14:48', chip: 'Encoding 62%', tone: 'info', size: 'est. 19.3 GB', selected: true, progress: 0.62 },
      { name: 'Tears of Steel 4K', file: 'tears_2160p.mkv', duration: '00:12:14', chip: 'Queued', tone: 'neutral' },
      { name: 'Cosmos Laundromat', file: 'cosmos_1080p.mkv', duration: '00:12:10', chip: 'Failed · open log', tone: 'danger' },
    ],
  });
}

// ------------------------------------------------------------------- Empty
if (!ONLY || ONLY === 'empty') {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Empty', 0, 0, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  const C = helpers(b);
  strip(b, w, { status: 'Defaults saved · no videos yet', right: '0 videos' });
  rail(b, 0, 96, 232, h - 96, { queue: '0 videos', configured: false });

  generalCard(b, 264, 120, 1144, { folder: '/Volumes/Media/Aviation Station' });
  queueCard(b, 264, 468, 1144, 388, { empty: true, summary: '0 videos' });
}

// ----------------------------------------------------------------- Loading
if (!ONLY || ONLY === 'loading') {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Loading', 1504, 984, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Opening project…', current: true }]);
  const C = helpers(b);
  strip(b, w, { skeleton: true });
  rail(b, 0, 96, 232, h - 96, { skeleton: true });

  const sk = (name, x, y, wd, ht, r) =>
    K.rect(b, name, x, y, wd, ht, { fill: 'color.bg.raised', r: r == null ? 4 : r });

  C.card('loading general', 264, 120, 1144, 322);
  sk('loading h', 288, 142, 120, 16);
  sk('loading sub', 288, 168, 320, 10);
  for (let i = 0; i < 3; i++) {
    sk('loading kind ' + i, 288 + i * 180, 206, 168, 86, 8);
    sk('loading kind dot ' + i, 304 + i * 180, 224, 14, 14, 7);
    sk('loading kind t ' + i, 328 + i * 180, 226, 92, 10);
  }
  for (let i = 0; i < 2; i++) sk('loading out ' + i, 826, 206 + i * 44, 558, 34, 6);
  sk('loading format label', 826, 314, 80, 8);
  sk('loading format value', 826, 332, 240, 10);

  C.card('loading queue', 264, 468, 1144, 388);
  sk('loading q h', 288, 490, 100, 16);
  sk('loading q add', 1244, 486, 104, 28, 5);
  sk('loading q overflow', 1356, 486, 28, 28, 5);
  // The skeleton mirrors the two-line row: chip centred on the row, one trailing
  // overflow icon, and no separate size column.
  for (let i = 0; i < 4; i++) {
    const y = 530 + i * 64;
    sk('loading q check ' + i, 288, y + 24, 16, 16, 4);
    sk('loading q grip ' + i, 314, y + 25, 14, 14, 3);
    sk('loading q name ' + i, 338, y + 9, 220 - i * 18, 12);
    sk('loading q path ' + i, 338, y + 30, 300 - i * 24, 8);
    sk('loading q chip ' + i, 1230, y + 22, 110, 20, 10);
    sk('loading q menu ' + i, 1354, y + 24, 16, 16, 2);
    sk('loading q sep ' + i, 288, y + 63, 1096, 1);
  }
}

// ------------------------------------------------------------------- Error
if (!ONLY || ONLY === 'error') {
  const w = 1440;
  const h = 900;
  const b = K.board(null, 'Project / Error', 0, 3092, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  const C = helpers(b);
  strip(b, w, {
    error: true,
    status: 'Read-only · project folder is not writable',
    right: 'Nothing has been written',
  });
  rail(b, 0, 96, 232, h - 96, { queue: '—', active: false, configured: false });

  C.card('project error', 264, 120, 1144, 470);
  K.icon(b, 'project error icon', '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>', 288, 148, 22, { color: 'color.state.danger' });
  C.chip('project error chip', 322, 146, 'Read-only', 'warning');
  C.text('project error head', 'This project is open read-only', 288, 188, 700, { size: 20, weight: 'semibold', h: 28 });
  C.note('project error meta', 'Config: ~/Library/Application Support/Aviation Station/projects/01J8Z6K4 · schema v3', 288, 216, 760, 16);
  K.rect(b, 'project error cause', 288, 250, 720, 116, { fill: 'color.bg.base', r: 6, stroke: 'color.border.default' });
  C.label('CAUSE', 304, 264, 80);
  C.text('project error line 1', 'Permission denied (os error 13)', 304, 284, 680, { size: 11.5, family: 'JetBrains Mono', color: 'color.text.primary', h: 18 });
  C.text('project error line 2', 'config.json is readable but its parent is not writable', 304, 306, 680, { size: 10, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 });
  C.text('project error line 3', 'No file was modified; the last checkpoint is intact.', 304, 328, 680, { size: 10, color: 'color.text.secondary', h: 16 });
  C.text('project error body', 'The project opened for inspection, but the folder that holds it is not writable. Restore write access to the folder, or choose the folder again, then retry. Nothing in the queue was lost.', 288, 386, 720, {
    size: 11,
    color: 'color.text.secondary',
    h: 50,
    lh: 1.5,
  });
  C.btn('project error retry', 288, 458, 'Retry', { primary: true, w: 92, icon: 'reset' });
  C.btn('project error choose', 390, 458, 'Choose folder…', { w: 130, icon: 'folder' });
  C.btn('project error log', 530, 458, 'Open log', { w: 106, ghost: true, icon: 'logs' });
  C.note('project error footnote', 'Retry checks write access again; it does not rewrite the config. A successful check enables editing.', 288, 502, 760, 16);

  K.rect(b, 'project error safe', 1048, 148, 336, 368, { fill: 'color.bg.sunken', r: 8, stroke: 'color.border.subtle' });
  C.label('WHAT IS SAFE', 1072, 168, 200);
  const safe = [
    ['Last checkpoint', '2 min ago'],
    ['Queue entries', '12 intact'],
    ['Project overrides', 'unchanged'],
    ['Video chunks', '39.2 GB on disk'],
  ];
  safe.forEach(([k, v], i) => {
    const y = 204 + i * 64;
    K.icon(b, 'safe check ' + i, '<path d="m5 12 5 5L20 7"/>', 1072, y, 14, { color: 'color.state.success' });
    C.text('safe k ' + i, k, 1094, y - 4, 160, { size: 10.5, color: 'color.text.secondary', h: 16 });
    C.text('safe v ' + i, v, 1094, y + 14, 220, { size: 11, family: 'JetBrains Mono', color: 'color.text.primary', h: 18 });
  });
  C.note('safe note', 'Recovery never re-encodes and never deletes retained chunks.', 1072, 470, 288, 34);

  C.card('project error logcard', 264, 618, 1144, 164);
  C.text('log head', 'Recent log', 288, 638, 200, { size: 13, weight: 'semibold', h: 20 });
  C.note('log hint', 'project · config.load', 288, 658, 260, 14);
  const lines = [
    ['14:22:04', 'INFO', 'opening 01J8Z6K4/config.json'],
    ['14:22:04', 'INFO', 'schema v3 · 12 videos · 7 sections'],
    ['14:22:04', 'ERROR', 'permission denied writing config.json'],
  ];
  lines.forEach(([t, level, msg], i) => {
    const y = 682 + i * 24;
    C.text('log t ' + i, t, 288, y, 64, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 });
    C.text('log l ' + i, level, 356, y, 56, { size: 9.5, family: 'JetBrains Mono', color: level === 'ERROR' ? 'color.state.danger' : 'color.text.secondary', h: 16 });
    C.text('log m ' + i, msg, 418, y, 700, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
  });
  C.text('log open', 'Open full log', 1264, 742, 120, { size: 10.5, color: 'color.brand.text', align: 'right', h: 16 });
}

// ------------------------------------------------------------------ Narrow
if (!ONLY || ONLY === 'narrow') {
  const w = 1024;
  const h = 768;
  const b = K.board(null, 'Project / Narrow', 1504, 3092, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  const C = helpers(b);
  strip(b, w, { status: 'Configuration locked · Sintel is encoding', locked: true, action: 'Sections', actionW: 104 });
  C.card('narrow general', 24, 112, 976, 286);
  C.text('narrow general head', 'General', 48, 134, 200, { size: 16, weight: 'semibold', h: 24 });
  C.note('narrow general sub', 'Defaults for videos added to this project', 48, 158, 500, 16);
  C.label('INPUT', 48, 194, 80);
  C.label('OUTPUT', 512, 194, 80);
  const kinds = [
    ['FFMS2', 'Native decode'],
    ['VapourSynth', '4 importers'],
    ['Script', '.vpy input'],
  ];
  kinds.forEach(([name, sub], i) => {
    const x = 48 + i * 150;
    const on = i === 0;
    K.rect(b, 'n kind ' + i, x, 214, 140, 58, {
      fill: on ? 'color.brand.subtle' : 'color.bg.sunken',
      r: 8,
      stroke: on ? 'color.brand.default' : 'color.border.default',
    });
    C.radio('n kind radio ' + i, x + 12, 226, on);
    C.text('n kind name ' + i, name, x + 32, 222, 104, { size: 10.5, weight: 'medium', h: 16 });
    C.text('n kind sub ' + i, sub, x + 32, 240, 104, { size: 9, color: 'color.text.muted', h: 14 });
  });
  K.rect(b, 'n output next', 512, 214, 464, 34, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  C.radio('n output radio', 526, 224, true);
  C.text('n output t', 'Next to input', 550, 214, 140, { size: 10.5, color: 'color.text.secondary', valign: 'center', h: 34 });
  K.rect(b, 'n output folder', 512, 258, 464, 34, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.default' });
  C.radio('n output radio 2', 526, 268, false);
  C.text('n output t 2', 'Specific folder', 550, 258, 140, { size: 10.5, color: 'color.text.primary', valign: 'center', h: 34 });
  C.label('OUTPUT FORMAT', 512, 304, 140);
  C.text('n format', 'MKV · 10-bit · 4:2:0', 512, 322, 300, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
  C.text('n format edit', 'Change…', 888, 322, 88, { size: 10, color: 'color.brand.text', align: 'right', h: 16 });

  queueCard(b, 24, 414, 976, 310, {
    narrow: true,
    summary: '12 videos · 3 shown · drag to reorder',
    rows: [
      { name: 'Big Buck Bunny', file: 'bunny_1080p.mkv', duration: '00:09:56', chip: 'Encoded', tone: 'success', size: '1.42 GB' },
      { name: "Sintel — Director's Cut", file: 'sintel_2160p.mkv', duration: '00:14:48', chip: 'Encoding 62%', tone: 'info', size: 'est. 19.3 GB', progress: 0.62 },
      { name: 'Tears of Steel 4K', file: 'tears_2160p.mkv', duration: '00:12:14', chip: 'Queued', tone: 'neutral' },
    ],
  });
}

// -------------------------------------------------------------------- Wide
if (!ONLY || ONLY === 'wide') {
  const w = 1920;
  const h = 1080;
  const b = K.board(null, 'Project / Wide', 0, 1948, w, h);
  K.chrome(b, w, [{ label: 'Projects' }, { label: 'Big Buck Bunny', current: true }]);
  const C = helpers(b);
  strip(b, w, { status: 'Configuration locked · Sintel is encoding', locked: true, right: '12 videos · 39.2 GB on disk' });
  rail(b, 0, 96, 232, h - 96, { queue: '12 videos', configured: true });

  generalCard(b, 264, 120, 1632, { h: 336 });
  queueCard(b, 264, 520, 1632, 496, {
    summary: '12 videos · 5 shown · drag to reorder',
    rows: [
      { name: 'Big Buck Bunny', file: 'bunny_1080p.mkv', duration: '00:09:56', chip: 'Encoded', tone: 'success', size: '1.42 GB' },
      { name: "Sintel — Director's Cut", file: 'sintel_2160p.mkv', duration: '00:14:48', chip: 'Encoding · 62%', tone: 'info', size: 'est. 19.3 GB', progress: 0.62 },
      { name: 'Tears of Steel 4K', file: 'tears_2160p.mkv', duration: '00:12:14', chip: 'Queued', tone: 'neutral' },
      { name: 'Cosmos Laundromat', file: 'cosmos_1080p.mkv', duration: '00:12:10', chip: 'Failed · open log', tone: 'danger' },
      { name: 'Spring', file: 'spring_1080p.mkv', duration: '00:07:44', chip: 'Queued', tone: 'neutral' },
    ],
  });
}

// ------------------------------------------------------------------ Layout
for (const [name, [x, y]] of Object.entries(LAYOUT)) {
  const board = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (!board) continue;
  board.x = x;
  board.y = y;
}

K.organize(page);
