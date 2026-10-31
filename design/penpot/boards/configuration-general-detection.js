// Configuration / General, Scene detection, and Noise generation.
// Run after design/penpot/kit.js. Each board is idempotent by name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '10 Configuration');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);
const ONLY = storage.configSection || null;
const KEYS = {
  'Configuration / General': 'general',
  'Configuration / Scene detection': 'scene',
  'Configuration / Noise generation': 'noise',
};
for (const [name, key] of Object.entries(KEYS)) {
  if (ONLY && ONLY !== key) continue;
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}
// The breadcrumb section menu is retired. Remove its board if an older version
// of the file still has it.
for (const name of ['Configuration / Section menu', 'Configuration / Sections rail']) {
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}

const sw = 1440;
const crumbs = (...parts) => parts.map((label, i) => ({ label, current: i === parts.length - 1 }));

// Root-board layout: 64 px gutters, rows packed by the tallest board plus 64.
const LAYOUT = {
  'Configuration / General': [0, 0],
  'Configuration / Scene detection': [1504, 0],
  'Configuration / Noise generation': [0, 964],
  'Configuration / Target quality': [1504, 964],
  'Configuration / Encoding': [0, 2348],
  'Configuration / Concatenation': [1504, 2348],
  'Configuration / Quality check': [0, 3472],
};

function helpers(b) {
  const card = (name, x, y, w, h) =>
    K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  const head = (value, x, y, w) => K.text(b, 'h ' + value, value, x, y, w || 400, { size: 15, weight: 'semibold' });
  const sub = (value, x, y, w, h) =>
    K.text(b, 'sub ' + x + y, value, x, y, w, { size: 12, color: 'color.text.secondary', h: h || 34, lh: 1.45 });
  const label = (value, x, y, w) =>
    K.text(b, 'l ' + value + x, value, x, y, w || 220, { size: 10, weight: 'medium', color: 'color.text.secondary' });
  const note = (value, x, y, w, h) =>
    K.text(b, 'note ' + x + y, value, x, y, w, { size: 10.5, color: 'color.text.muted', h: h || 32, lh: 1.45 });
  const box = (x, y, w, value, opts = {}) => {
    K.rect(b, 'box ' + x + y, x, y, w, opts.h || 32, {
      fill: opts.fill || 'color.bg.sunken',
      stroke: opts.stroke || 'color.border.default',
      r: 5,
    });
    K.text(b, 'box v ' + x + y, value, x + 10, y, w - 28, {
      size: opts.size || 11.5,
      color: opts.color || 'color.text.primary',
      family: opts.mono === false ? 'Inter' : 'JetBrains Mono',
      valign: 'center',
      h: opts.h || 32,
    });
    if (opts.chev) K.icon(b, 'box c ' + x + y, '<path d="m6 9 6 6 6-6"/>', x + w - 24, y + (opts.h || 32) / 2 - 7, 14, { color: 'color.text.muted' });
  };
  const seg = (x, y, items, selected, opts = {}) => {
    const h = opts.h || 30;
    let cx = x;
    items.forEach((item, i) => {
      const w = opts.w || Math.max(78, Math.round(item.length * 7.4) + 24);
      const on = i === selected;
      K.rect(b, 'seg ' + x + y + i, cx, y, w, h, {
        fill: on ? 'color.bg.raised' : 'color.bg.sunken',
        r: 4,
        stroke: on ? 'color.border.strong' : 'color.border.default',
      });
      K.text(b, 'seg t ' + x + y + i, item, cx, y, w, {
        size: 11,
        weight: on ? 'semibold' : 'regular',
        color: on ? 'color.text.primary' : 'color.text.secondary',
        align: 'center',
        valign: 'center',
        h,
      });
      cx += w + 4;
    });
    return cx;
  };
  const radio = (x, y, value, on, w) => {
    K.rect(b, 'radio ' + x + y, x, y + 3, 14, 14, {
      fill: on ? 'color.brand.default' : null,
      stroke: on ? 'color.brand.default' : 'color.border.strong',
      r: 7,
    });
    if (on) K.rect(b, 'radio dot ' + x + y, x + 4, y + 7, 6, 6, { fill: 'color.text.on-brand', r: 3 });
    K.text(b, 'radio t ' + x + y, value, x + 22, y, w || 300, { size: 12, valign: 'top', h: 22 });
  };
  const toggle = (x, y, on, opts = {}) => {
    K.rect(b, 'toggle ' + x + y, x, y, 34, 18, { fill: on ? 'color.brand.default' : 'color.bg.raised', r: 9, stroke: on ? null : 'color.border.strong' });
    K.rect(b, 'knob ' + x + y, on ? x + 18 : x + 2, y + 2, 14, 14, { fill: 'color.text.on-brand', r: 7 });
  };
  const chip = (x, y, value, tone) => {
    const toneMap = {
      neutral: ['color.state.neutral-bg', 'color.state.neutral'],
      success: ['color.state.success-bg', 'color.state.success'],
      warning: ['color.state.warning-bg', 'color.state.warning'],
      brand: ['color.bg.raised', 'color.border.strong'],
    };
    const [bg, fg] = toneMap[tone || 'neutral'];
    const w = Math.round(value.length * 6.2) + 20;
    K.rect(b, 'chip ' + x + y, x, y, w, 22, { fill: bg, r: 999, stroke: fg });
    K.text(b, 'chip t ' + x + y, value, x + 10, y, w - 16, { size: 10, color: fg, valign: 'center', h: 22 });
    return w;
  };
  const divider = (x, y, w) => K.line(b, 'div ' + x + y, x, y, w, { color: 'color.border.subtle' });
  const btn = (x, y, value, opts = {}) => {
    const w = opts.w || Math.round(value.length * 6.6) + 24;
    K.rect(b, 'btn ' + x + y, x, y, w, opts.h || 30, {
      fill: opts.primary ? 'color.brand.default' : opts.ghost ? null : 'color.bg.raised',
      r: 5,
      stroke: opts.primary ? null : opts.ghost ? null : 'color.border.default',
    });
    K.text(b, 'btn t ' + x + y, value, x, y, w, {
      size: 11,
      weight: opts.primary ? 'semibold' : 'regular',
      color: opts.primary ? 'color.text.on-brand' : opts.color || 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: opts.h || 30,
    });
    return w;
  };
  // Draft controls live in the existing 56 px top bar. Nothing is added below
  // the bar, so the content column keeps its full height and width.
  const topbar = (w, actionStart) => {
    const h = 56;
    const saveW = 76;
    const cancelW = 76;
    const statusW = 140;
    const saveX = actionStart - 16 - saveW;
    const cancelX = saveX - 8 - cancelW;
    const statusX = cancelX - 12 - statusW;
    K.rect(b, 'topbar dot', statusX, 25, 6, 6, { fill: 'color.state.warning', r: 3 });
    K.text(b, 'topbar status', 'Unsaved changes', statusX + 14, 0, statusW - 14, {
      size: 10.5,
      color: 'color.text.secondary',
      valign: 'center',
      h,
    });
    btn(cancelX, 12, 'Cancel', { w: cancelW, ghost: true, h: 32 });
    btn(saveX, 12, 'Save', { w: saveW, primary: true, h: 32 });
  };
  const link = (x, y, value, opts = {}) =>
    K.text(b, 'link ' + x + y, value, x, y, opts.w || 160, { size: 11, color: 'color.brand.text', align: opts.right ? 'right' : 'left' });
  return { card, head, sub, label, note, box, seg, radio, toggle, chip, divider, btn, topbar, link, text: K.text };
}

// Every Configuration section screen shares the Project rail: 232 px, with the
// same rows, status dots and queue footer. The content column starts at 264.
const CONTENT_X = 264;
const MAIN_W = 736;
const SIDE_X = 1016;
const SIDE_W = 392;

// ---------------------------------------------------------------- General
if (!ONLY || ONLY === 'general') {
  const b = K.board(null, 'Configuration / General', 0, 0, sw, 900);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'General'));
  K.sectionRail(b, 900, 'General');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  K.text(b, 'eyebrow', 'PROJECT DEFAULTS', CONTENT_X, 78, 300, { size: 10, weight: 'semibold', color: 'color.text.muted' });
  U.sub('Applies to every video added to the queue. A sequence can override its own input.', CONTENT_X, 98, 760);
  U.chip(1240, 82, 'Read-only during a run', 'neutral');

  U.card('input card', CONTENT_X, 138, MAIN_W, 414);
  U.head('Input', 288, 158, 300);
  U.seg(288, 190, ['FFMS2', 'VapourSynth', 'VapourSynth script'], 0, { w: 168 });
  U.divider(288, 238, 688);

  U.label('Index file · optional', 288, 252, 200);
  U.box(288, 270, 340, 'Auto · app cache', { mono: true, color: 'color.text.secondary' });
  U.btn(636, 270, 'Browse', { w: 82 });
  U.note('Built once per video and reused across runs. Empty uses the app cache.', 288, 306, 688, 16);

  U.divider(288, 330, 688);
  U.label('Filters', 288, 344, 120);
  U.note('Ordered, applied after decode and before scene detection.', 360, 344, 500, 20);

  K.rect(b, 'filter row', 288, 368, 688, 46, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.icon(b, 'grip', '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>', 298, 381, 14, { color: 'color.text.muted', solid: true });
  K.text(b, 'filter name', 'Output format', 322, 376, 110, { size: 12, weight: 'medium' });
  K.text(b, 'filter summary', '10-bit · 4:2:0 · source geometry', 440, 376, 400, { size: 11, color: 'color.text.secondary', valign: 'center', h: 30 });
  K.icon(b, 'dup', '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 912, 381, 14, { color: 'color.text.muted' });
  K.icon(b, 'trash', '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 948, 381, 14, { color: 'color.text.muted' });
  U.btn(288, 426, 'Add filter', { w: 108 });
  U.note('Add opens the filter sheet; with one type, it opens the form directly.', 408, 432, 480, 20);
  U.note('The native input has one filter type: OutputFormat. VapourSynth inputs expose the full catalogue.', 288, 462, 688, 20);
  U.note('VapourSynth import methods (BestSource, L-SMASH-Works, DGDecNV) appear when that input kind is selected.', 288, 492, 688, 20);

  U.card('output card', SIDE_X, 138, SIDE_W, 248);
  U.head('Output', 1040, 158, 220);
  U.radio(1040, 194, 'Next to input', true, 330);
  U.text(b, 'out path 1', '…/Big Buck Bunny/Av1ation Station', 1062, 216, 300, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.muted' });
  U.radio(1040, 246, 'Specific folder', false, 330);
  U.box(1062, 270, 300, '/media/outputs/AV1', { mono: true, color: 'color.text.secondary' });
  K.icon(b, 'folder', '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>', 1372, 278, 14, { color: 'color.text.muted' });
  U.note('A folder, not a file name. The exact output file is chosen per video.', 1040, 316, 344, 34);

  U.card('temp card', SIDE_X, 404, SIDE_W, 150);
  U.head('Temporary directory', 1040, 424, 300);
  U.box(1040, 456, 344, '/mnt/fast/av1ation-station', { mono: true });
  U.note('Empty uses the app-data default. Existing chunks are kept.', 1040, 496, 344, 16);
  U.chip(1040, 518, '39.2 GB free', 'success');

  U.card('details card', SIDE_X, 572, SIDE_W, 286);
  U.head('Video details', 1040, 592, 240);
  K.rect(b, 'details empty', 1040, 624, 344, 118, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.icon(b, 'details glyph', '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>', 1140, 674, 20, { color: 'color.text.muted' });
  K.text(b, 'details empty t', 'No source at project scope', 1170, 672, 200, { size: 12, color: 'color.text.secondary' });
  U.note('Width, height, duration, frames and colour metadata are read from the video on its own screen.', 1040, 752, 344, 44);

  U.card('inherit card', CONTENT_X, 570, MAIN_W, 288);
  U.head('Where this input is used', 288, 590, 400);
  U.note('Every sequence starts here and can override its own input.', 288, 614, 500, 20);
  const rows = [
    ['General', 'This input', 'Edit'],
    ['Scene detection', 'Inherited', 'Override'],
    ['Noise generation', 'Inherited', 'Override'],
    ['Encoding', 'Inherited', 'Override'],
    ['Target quality', 'Inherited', 'Override'],
    ['Quality check', 'Inherited', 'Override'],
  ];
  rows.forEach(([name, source, action], i) => {
    const y = 646 + i * 30;
    K.text(b, 'inherit ' + i, name, 288, y, 200, { size: 11.5, weight: i === 0 ? 'medium' : 'regular' });
    K.text(b, 'inherit src ' + i, source, 520, y, 160, { size: 11, color: 'color.text.secondary' });
    U.link(886, y, action, { w: 90, right: true });
    if (i < rows.length - 1) U.divider(288, y + 23, 688);
  });
  U.note('A VapourSynth script belongs to the input that uses it. Its editor is opened from that input; there is no single project script.', 288, 830, 688, 20);
}

// ------------------------------------------------------- Scene detection
if (!ONLY || ONLY === 'scene') {
  const b = K.board(null, 'Configuration / Scene detection', 1504, 0, sw, 900);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Scene detection'));
  K.sectionRail(b, 900, 'Scene detection');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('Finds cuts. Produces the scene list every later stage runs per scene.', CONTENT_X, 78, 780);
  U.chip(1240, 78, 'Optional', 'neutral');

  U.card('method card', CONTENT_X, 120, MAIN_W, 272);
  U.head('Method', 288, 140, 240);
  U.seg(288, 172, ['None', 'AVSceneChange', 'TransNetV2'], 1, { w: 150 });
  U.label('Detection preset', 288, 220, 160);
  U.seg(288, 238, ['Fast', 'Standard'], 1, { w: 104, h: 28 });
  U.note('Fast scores a downscaled clip; Standard scores the full-resolution source.', 520, 242, 456, 20);
  U.divider(288, 284, 688);
  U.label('Minimum scene length', 288, 298, 200);
  U.box(288, 316, 112, '24', { mono: true });
  K.text(b, 'min unit', 'frames', 408, 322, 60, { size: 10.5, color: 'color.text.muted' });
  U.label('Maximum scene length', 452, 298, 200);
  U.box(452, 316, 112, '240', { mono: true });
  K.text(b, 'max unit', 'frames', 572, 322, 60, { size: 10.5, color: 'color.text.muted' });
  U.note('Shorter cuts merge; longer scenes split. Both bounds are inclusive.', 600, 300, 376, 32);
  U.note('Scenes appear as they are found, so the count updates live.', 288, 360, 688, 20);

  U.card('detect input card', CONTENT_X, 412, MAIN_W, 250);
  U.head('Input', 288, 432, 240);
  U.note('The project input by default. An override applies to detection only.', 288, 456, 688, 20);
  U.radio(288, 490, 'Project input · FFMS2', false, 420);
  U.radio(288, 530, 'Custom input', true, 220);
  U.seg(560, 526, ['FFMS2', 'VapourSynth', 'Script'], 1, { w: 96, h: 28 });
  U.link(886, 532, 'Edit input', { w: 90, right: true });
  U.divider(288, 572, 688);
  U.note('A detection-only input often downscales to 540p and crops letterboxing: cheaper, and it does not change what is encoded.', 288, 586, 688, 34);
  U.note('Changing this override does not change General, and it is not inherited by Encoding.', 288, 626, 688, 20);

  U.card('scores card', CONTENT_X, 682, MAIN_W, 168);
  U.head('Options', 288, 702, 240);
  U.toggle(288, 742, false);
  K.text(b, 'scores label', 'Write per-frame scores', 332, 738, 260, { size: 12 });
  K.text(b, 'scores badge', 'Advanced', 604, 738, 80, { size: 10, color: 'color.text.muted' });
  U.note('Floods the configuration with one value per frame. Off by default; scene boundaries are always kept.', 332, 758, 644, 20);
  U.note('None produces one arbitrary scene for the whole video. That is valid, but every later stage then sees a single scene.', 288, 794, 688, 20);
  U.note('TransNetV2 adds an optional ONNX model file under Advanced; the Fast/Standard preset does not apply to it.', 288, 820, 688, 18);

  U.card('purpose card', SIDE_X, 120, SIDE_W, 272);
  U.head('What it produces', 1040, 140, 300);
  const bullets = [
    ['Scene boundaries', 'Start and end frame for each cut.'],
    ['Live writes', 'Scenes appear as they are found; cancel keeps what exists.'],
    ['Downstream input', 'Noise, target quality and encoding all read this list.'],
  ];
  bullets.forEach(([t, d], i) => {
    const y = 180 + i * 58;
    K.rect(b, 'bullet ' + i, 1040, y + 4, 6, 6, { fill: 'color.brand.default', r: 3 });
    K.text(b, 'bullet t ' + i, t, 1060, y, 320, { size: 12, weight: 'medium' });
    U.note(d, 1060, y + 20, 324, 20);
  });
  U.note('Total scenes and per-scene lengths are visible while the run is in progress.', 1040, 356, 344, 20);

  U.card('scene context card', SIDE_X, 412, SIDE_W, 460);
  U.head('In the video context', 1040, 432, 300);
  U.note('Progress and the scene length distribution this video has produced.', 1040, 456, 344, 20);
  K.rect(b, 'progress track', 1040, 490, 344, 4, { fill: 'color.bg.raised', r: 2 });
  K.rect(b, 'progress fill', 1040, 490, 104, 4, { fill: 'color.brand.default', r: 2 });
  K.text(b, 'progress label', 'Detecting · scene 34 of 112', 1040, 502, 260, { size: 10.5, color: 'color.text.secondary' });
  K.text(b, 'progress pct', '30%', 1310, 502, 74, { size: 10.5, color: 'color.text.secondary', align: 'right' });
  U.divider(1040, 530, 344);
  U.label('Scene length distribution', 1040, 544, 220);
  U.chip(1284, 540, '34 scenes', 'neutral');

  // A histogram answers "what does this cut list look like?" in one glance. The
  // per-scene table it replaces only repeated what the scene rail already shows.
  // Bars are scene counts per 2/4/8/16/32 s bucket; the selected bucket is brand.
  K.rect(b, 'hist frame', 1040, 570, 344, 192, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  // Counts sum to the 34 scenes the chip and the progress line report; 15 of 34
  // in the selected bucket is the 44% the caption states.
  const bins = [
    { label: '0–2s', count: 2, h: 13 },
    { label: '2–4s', count: 7, h: 45 },
    { label: '4–8s', count: 15, h: 96, active: true },
    { label: '8–16s', count: 6, h: 38 },
    { label: '16–32s', count: 3, h: 19 },
    { label: '32s+', count: 1, h: 6 },
  ];
  const baseline = 726;
  [680, 640, 600].forEach((gy, i) => K.line(b, 'hist grid ' + i, 1058, gy, 308, { color: 'color.border.subtle' }));
  bins.forEach((bin, i) => {
    const bx = 1060 + i * 50;
    K.rect(b, 'hist bar ' + i, bx, baseline - bin.h, 32, bin.h, {
      fill: bin.active ? 'color.brand.default' : 'color.bg.raised',
      r: 3,
    });
    K.text(b, 'hist count ' + i, String(bin.count), bx, baseline - bin.h - 16, 32, {
      size: 9,
      family: 'JetBrains Mono',
      color: bin.active ? 'color.brand.text' : 'color.text.secondary',
      align: 'center',
      h: 14,
    });
    K.text(b, 'hist x ' + i, bin.label, bx - 6, baseline + 6, 44, {
      size: 8.5,
      color: bin.active ? 'color.text.secondary' : 'color.text.muted',
      align: 'center',
      h: 14,
    });
  });
  K.line(b, 'hist baseline', 1058, baseline, 308, { color: 'color.border.strong' });
  K.text(b, 'hist y', 'scenes', 1048, 576, 52, { size: 8.5, color: 'color.text.muted', h: 12 });

  U.divider(1040, 778, 344);
  const stats = [['Median', '168 f'], ['Mean', '210 f'], ['Longest', '1,184 f']];
  stats.forEach(([k, v], i) => {
    const sx = 1040 + i * 116;
    K.text(b, 'stat k ' + i, k, sx, 792, 100, { size: 9.5, color: 'color.text.muted', h: 14 });
    K.text(b, 'stat v ' + i, v, sx, 808, 100, { size: 11.5, family: 'JetBrains Mono', color: 'color.text.primary', h: 18 });
  });
  U.note('The 4–8 s bucket holds 44% of scenes found so far. The chart grows as detection writes each cut.', 1040, 836, 344, 28);
}

// -------------------------------------------------------- Noise generation
if (!ONLY || ONLY === 'noise') {
  const b = K.board(null, 'Configuration / Noise generation', 0, 964, sw, 950);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Noise generation'));
  K.sectionRail(b, 950, 'Noise generation');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('Measures grain per scene, then maps it onto a scaler range.', CONTENT_X, 78, 900);
  U.chip(1240, 78, 'Optional', 'neutral');

  U.card('detector card', CONTENT_X, 120, MAIN_W, 404);
  U.head('Noise detector', 288, 140, 300);
  U.note('Produces one noise value per scene from a reference and a denoised pass.', 288, 164, 688, 20);
  U.label('Input', 288, 198, 100);
  U.radio(288, 216, 'Project input · FFMS2', true, 420);
  U.radio(288, 250, 'Custom input', false, 200);
  U.link(886, 254, 'Edit input', { w: 90, right: true });
  U.divider(288, 286, 688);
  U.label('Reference filters', 288, 300, 220);
  U.note('The noisy source is measured against this filtered version.', 540, 300, 436, 20);
  K.rect(b, 'ref row', 288, 324, 688, 40, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.text(b, 'ref name', 'WNNM', 302, 332, 120, { size: 11.5, weight: 'medium', valign: 'center', h: 24 });
  K.text(b, 'ref summary', 'sigma 3.0 · radius 1 · strength 1.0', 412, 332, 440, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.secondary', valign: 'center', h: 24 });
  U.btn(896, 330, 'Edit', { w: 74, h: 26 });
  U.label('Denoised filters', 288, 380, 220);
  K.rect(b, 'den row', 288, 404, 688, 40, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.text(b, 'den name', 'WNNM', 302, 412, 120, { size: 11.5, weight: 'medium', valign: 'center', h: 24 });
  K.text(b, 'den summary', 'sigma 1.0 · radius 1 · strength 1.0', 412, 412, 440, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.secondary', valign: 'center', h: 24 });
  U.btn(896, 410, 'Edit', { w: 74, h: 26 });
  U.btn(288, 456, 'Add filter', { w: 108 });
  U.note('Both lists must produce the same geometry. A video input is valid: the engine builds the graph.', 408, 462, 560, 32);
  U.note('Defaults are the engine’s WNNM pair. Overriding them is advanced, not required.', 288, 496, 688, 20);

  U.card('scaler card', CONTENT_X, 544, MAIN_W, 348);
  U.head('Noise scaler', 288, 564, 300);
  U.note('Consumes the detector’s per-scene value and maps it onto a scaler range.', 288, 588, 688, 20);
  U.label('Threshold', 288, 626, 140);
  U.box(288, 644, 120, '0.30', { mono: true });
  K.text(b, 'threshold unit', 'noise', 416, 650, 60, { size: 10.5, color: 'color.text.muted' });
  U.label('Minimum scaler', 452, 626, 160);
  U.box(452, 644, 120, '0.25', { mono: true });
  U.label('Maximum scaler', 604, 626, 160);
  U.box(604, 644, 120, '1.50', { mono: true });
  U.label('Scale chroma', 756, 626, 160);
  U.toggle(756, 646, true);
  K.text(b, 'scale chroma t', 'On', 800, 642, 40, { size: 11, color: 'color.text.secondary' });
  U.divider(288, 700, 688);
  U.label('Availability', 288, 714, 160);
  U.chip(288, 736, 'Waiting for detection', 'warning');
  U.note('Scaler values become editable once detection has produced a per-scene value.', 444, 738, 532, 20);
  U.note('The threshold is drawn on the noise chart so a user can see which scenes will be scaled.', 288, 786, 688, 20);
  U.note('Scaling is applied through the encode input, not by rewriting the source.', 288, 816, 688, 20);

  U.card('vs card', SIDE_X, 120, SIDE_W, 196);
  K.text(b, 'vs head', 'VAPOURSYNTH', 1040, 140, 300, { size: 10, weight: 'semibold', color: 'color.text.muted' });
  U.chip(1284, 136, 'Not installed', 'warning');
  K.text(b, 'vs title', 'Detection needs a graph', 1040, 168, 344, { size: 14, weight: 'semibold' });
  U.note('The engine builds a VapourSynth graph from the FFMS2 input. A video input is valid here; only a missing VapourSynth blocks it.', 1040, 194, 344, 46);
  U.link(1040, 252, 'Install guide and detection options', { w: 344 });

  U.card('noise context card', SIDE_X, 336, SIDE_W, 514);
  U.head('In the video context', 1040, 356, 300);
  U.note('Noise per scene, the scaler threshold, and the scenes it will scale.', 1040, 380, 344, 20);
  K.rect(b, 'chart frame', 1040, 418, 344, 208, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  for (let i = 0; i < 4; i++) K.line(b, 'grid h ' + i, 1064, 460 + i * 40, 296, { color: 'color.border.subtle' });
  K.line(b, 'threshold line', 1064, 500, 296, { color: 'color.state.warning' });
  K.text(b, 'threshold label', 'threshold 0.30', 1064, 484, 200, { size: 9.5, color: 'color.state.warning' });
  const heights = [18, 34, 12, 54, 30, 68, 22, 44, 62, 28, 48, 36, 58, 20, 40, 66, 26, 52, 32, 46, 60, 24, 50, 38];
  heights.forEach((height, i) => {
    const over = height > 50;
    K.rect(b, 'noise bar ' + i, 1066 + i * 12, 610 - height, 8, height, { fill: over ? 'color.state.warning' : 'color.brand.default', r: 2 });
  });
  K.text(b, 'chart x', 'Scene', 1064, 632, 120, { size: 9.5, color: 'color.text.muted' });
  K.text(b, 'chart y', 'noise', 1300, 424, 60, { size: 9.5, color: 'color.text.muted', align: 'right' });
  U.divider(1040, 652, 344);
  const nstats = [['Scenes measured', '112'], ['Mean noise', '0.41'], ['p95', '0.78'], ['Above threshold', '63 scenes']];
  nstats.forEach(([k, v], i) => {
    const y = 668 + i * 28;
    K.text(b, 'nstat k ' + i, k, 1040, y, 230, { size: 11, color: 'color.text.secondary' });
    K.text(b, 'nstat v ' + i, v, 1190, y, 194, { size: 11, color: 'color.text.primary', align: 'right' });
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
return { ok: true };
