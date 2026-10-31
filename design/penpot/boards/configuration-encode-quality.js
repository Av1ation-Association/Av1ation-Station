// Configuration / Encoding, Target quality, Concatenation, Quality check.
// Run after design/penpot/kit.js. Each board is idempotent by name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '10 Configuration');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);
const ONLY = storage.configSection || null;
const KEYS = {
  'Configuration / Encoding': 'encoding',
  'Configuration / Target quality': 'target',
  'Configuration / Concatenation': 'concatenation',
  'Configuration / Quality check': 'quality',
};
for (const [name, key] of Object.entries(KEYS)) {
  if (ONLY && ONLY !== key) continue;
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
  const card = (name, x, y, w, h) => K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  const head = (value, x, y, w) => K.text(b, 'h ' + value, value, x, y, w || 400, { size: 15, weight: 'semibold' });
  const sub = (value, x, y, w, h) => K.text(b, 'sub ' + x + y, value, x, y, w, { size: 12, color: 'color.text.secondary', h: h || 34, lh: 1.45 });
  const label = (value, x, y, w) => K.text(b, 'l ' + value + x, value, x, y, w || 220, { size: 10, weight: 'medium', color: 'color.text.secondary' });
  const note = (value, x, y, w, h) => K.text(b, 'note ' + x + y, value, x, y, w, { size: 10.5, color: 'color.text.muted', h: h || 32, lh: 1.45 });
  const box = (x, y, w, value, opts = {}) => {
    K.rect(b, 'box ' + x + y, x, y, w, opts.h || 32, { fill: opts.fill || 'color.bg.sunken', stroke: opts.stroke || 'color.border.default', r: 5 });
    K.text(b, 'box v ' + x + y, value, x + 10, y, w - 28, { size: opts.size || 11.5, color: opts.color || 'color.text.primary', family: opts.mono === false ? 'Inter' : 'JetBrains Mono', valign: 'center', h: opts.h || 32 });
    if (opts.chev) K.icon(b, 'box c ' + x + y, '<path d="m6 9 6 6 6-6"/>', x + w - 24, y + (opts.h || 32) / 2 - 7, 14, { color: 'color.text.muted' });
  };
  const seg = (x, y, items, selected, opts = {}) => {
    const h = opts.h || 30;
    let cx = x;
    items.forEach((item, i) => {
      const w = opts.w || Math.max(78, Math.round(item.length * 7.4) + 24);
      const on = i === selected;
      K.rect(b, 'seg ' + x + y + i, cx, y, w, h, { fill: on ? 'color.bg.raised' : 'color.bg.sunken', r: 4, stroke: on ? 'color.border.strong' : 'color.border.default' });
      K.text(b, 'seg t ' + x + y + i, item, cx, y, w, { size: 11, weight: on ? 'semibold' : 'regular', color: on ? 'color.text.primary' : 'color.text.secondary', align: 'center', valign: 'center', h });
      cx += w + 4;
    });
    return cx;
  };
  const radio = (x, y, value, on, w) => {
    K.rect(b, 'radio ' + x + y, x, y + 3, 14, 14, { fill: on ? 'color.brand.default' : null, stroke: on ? 'color.brand.default' : 'color.border.strong', r: 7 });
    if (on) K.rect(b, 'radio dot ' + x + y, x + 4, y + 7, 6, 6, { fill: 'color.text.on-brand', r: 3 });
    K.text(b, 'radio t ' + x + y, value, x + 22, y, w || 300, { size: 12, valign: 'top', h: 22 });
  };
  const toggle = (x, y, on) => {
    K.rect(b, 'toggle ' + x + y, x, y, 34, 18, { fill: on ? 'color.brand.default' : 'color.bg.raised', r: 9, stroke: on ? null : 'color.border.strong' });
    K.rect(b, 'knob ' + x + y, on ? x + 18 : x + 2, y + 2, 14, 14, { fill: 'color.text.on-brand', r: 7 });
  };
  const chip = (x, y, value, tone) => {
    const toneMap = { neutral: ['color.state.neutral-bg', 'color.state.neutral'], success: ['color.state.success-bg', 'color.state.success'], warning: ['color.state.warning-bg', 'color.state.warning'], danger: ['color.state.danger-bg', 'color.state.danger'] };
    const pair = toneMap[tone || 'neutral'];
    const w = Math.round(value.length * 6.2) + 20;
    K.rect(b, 'chip ' + x + y, x, y, w, 22, { fill: pair[0], r: 999, stroke: pair[1] });
    K.text(b, 'chip t ' + x + y, value, x + 10, y, w - 16, { size: 10, color: pair[1], valign: 'center', h: 22 });
    return w;
  };
  const divider = (x, y, w) => K.line(b, 'div ' + x + y, x, y, w, { color: 'color.border.subtle' });
  const btn = (x, y, value, opts = {}) => {
    const w = opts.w || Math.round(value.length * 6.6) + 24;
    K.rect(b, 'btn ' + x + y, x, y, w, opts.h || 30, { fill: opts.primary ? 'color.brand.default' : opts.ghost ? null : 'color.bg.raised', r: 5, stroke: opts.primary ? null : opts.ghost ? null : 'color.border.default' });
    K.text(b, 'btn t ' + x + y, value, x, y, w, { size: 11, weight: opts.primary ? 'semibold' : 'regular', color: opts.primary ? 'color.text.on-brand' : opts.color || 'color.text.secondary', align: 'center', valign: 'center', h: opts.h || 30 });
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
  const link = (x, y, value, opts = {}) => K.text(b, 'link ' + x + y, value, x, y, opts.w || 160, { size: 11, color: 'color.brand.text', align: opts.right ? 'right' : 'left' });
  const slider = (x, y, w, pct) => {
    K.rect(b, 'track ' + x + y, x, y, w, 4, { fill: 'color.bg.raised', r: 2 });
    K.rect(b, 'fill ' + x + y, x, y, Math.round(w * pct), 4, { fill: 'color.brand.default', r: 2 });
    K.rect(b, 'knob ' + x + y, x + Math.round(w * pct) - 6, y - 4, 12, 12, { fill: 'color.brand.default', r: 6 });
  };
  const doc = (x, y) => K.icon(b, 'doc ' + x + y, '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', x, y, 13, { color: 'color.text.muted' });
  return { card, head, sub, label, note, box, seg, radio, toggle, chip, divider, btn, topbar, link, slider, doc, text: K.text };
}

const CONTENT_X = 264;
const MAIN_W = 736;
const SIDE_X = 1016;
const SIDE_W = 392;

// --------------------------------------------------------------- Encoding
if (!ONLY || ONLY === 'encoding') {
  const b = K.board(null, 'Configuration / Encoding', 1504, 964, sw, 1060);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Encoding'));
  K.sectionRail(b, 1060, 'Encoding');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('Encoder, worker count and the exact parameters sent to the executable.', CONTENT_X, 78, 900);
  const resetPath = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>';

  U.card('encoder card', CONTENT_X, 120, 564, 220);
  U.head('Encoder', 288, 140, 240);
  U.link(694, 144, 'Manage encoders', { w: 110, right: true });
  U.box(288, 176, 300, 'SVT-AV1 2.3.0', { chev: true });
  U.chip(604, 180, 'Available', 'success');
  U.note('2.3.0 · /usr/local/bin/svt-av1 · 1 pass', 288, 218, 516, 20);
  U.divider(288, 250, 516);
  U.note('A video or an individual scene can override the encoder. This value is the project default.', 288, 264, 516, 34);
  U.btn(288, 300, 'Test executable', { w: 128 });

  U.card('workers card', 844, 120, 564, 220);
  U.head('Workers', 868, 140, 240);
  U.note('Auto runs the Benchmarker, then uses the count it finds. Manual skips benchmarking.', 868, 164, 516, 20);
  U.seg(868, 192, ['Auto', 'Manual'], 0, { w: 110, h: 30 });
  U.label('Minimum speed gain', 868, 236, 180);
  U.box(868, 254, 76, '3', { mono: true });
  K.text(b, 'pct', '%', 950, 260, 20, { size: 10.5, color: 'color.text.muted' });
  U.label('Memory cap · optional', 984, 236, 180);
  U.box(984, 254, 120, '8 GB', { mono: true });
  K.icon(b, 'mem chev', '<path d="m6 9 6 6 6-6"/>', 1080, 264, 14, { color: 'color.text.muted' });
  U.note('Stops adding workers when projected use would exceed the cap.', 1112, 252, 272, 44);
  U.note('The benchmarker measures throughput at 1, 2, 4… workers. If you already know the count, Manual is faster.', 868, 300, 516, 20);

  U.card('settings card', CONTENT_X, 364, 1144, 312);
  U.head('Encoder settings', 288, 384, 300);
  U.note('Options that are not CLI parameters. They are stored on the encoder selection, not on every scene.', 444, 388, 700, 20);
  U.toggle(288, 424, true);
  K.text(b, 'append label', 'Append colour data', 332, 420, 240, { size: 12 });
  K.text(b, 'append badge', 'On', 482, 420, 40, { size: 10.5, color: 'color.state.success' });
  U.note('Passes colour metadata to the encoder. Turning it off can silently change how a player interprets the output.', 332, 440, 800, 34);
  U.link(1300, 424, 'Why this exists', { w: 84, right: true });
  U.divider(288, 484, 1096);

  K.text(b, 'photon head', 'Photon noise', 288, 500, 200, { size: 13, weight: 'semibold' });
  U.chip(396, 498, 'SVT-AV1', 'neutral');
  U.note('Synthesises film grain at encode time, so the grain survives at a lower bitrate. Only encoders that implement it show this section.', 492, 504, 550, 34);
  U.label('ISO', 288, 540, 100);
  U.box(288, 558, 132, '1600', { mono: true });
  U.label('Chroma ISO', 452, 540, 120);
  U.box(452, 558, 132, 'Auto', { mono: true, color: 'color.text.secondary' });
  U.label('Width', 616, 540, 100);
  U.box(616, 558, 120, 'Source', { mono: true, color: 'color.text.secondary' });
  U.label('Height', 760, 540, 100);
  U.box(760, 558, 120, 'Source', { mono: true, color: 'color.text.secondary' });
  U.link(908, 566, 'Custom coefficients', { w: 150 });
  U.note('ISO is required. Chroma and geometry default to the source. The section is absent, not disabled, for encoders without photon noise.', 288, 604, 752, 20);
  U.note('Noise scaling writes a per-scene ISO; this value applies only to scenes it leaves unchanged.', 288, 630, 620, 20);

  // The FFmpeg filtergraph is part of the encoder, not the parallel-encoder
  // sequence. The FFmpeg encoder filters through its own options, so this
  // field is absent for that base rather than shown as an inert input.
  U.label('FFmpeg filter', 1064, 500, 180);
  U.doc(1136, 500);
  K.rect(b, 'ffmpeg filter box', 1064, 522, 312, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
K.text(b, 'ffmpeg filter value', 'scale=1920:-2:flags=lanczos', 1076, 522, 260, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.primary', valign: 'center', h: 32 });
K.icon(b, 'ffmpeg filter reset', 1352, 532, 12, { color: 'color.text.muted' });
  U.note('Applied to every frame before the encoder receives it. Empty means no filter.', 1064, 562, 344, 30);
  U.chip(1064, 598, 'Scoring may be inaccurate', 'warning');
  U.note('Quality Check scores the unfiltered source; a filter changes what was encoded. It says so before the run.', 1064, 626, 344, 30);

  U.card('encoding input card', CONTENT_X, 696, 1144, 104);
  U.head('Input', 288, 716, 160);
  U.radio(288, 744, 'Project input · FFMS2', false, 300);
  U.radio(652, 744, 'Custom input', true, 200);
  U.seg(792, 740, ['FFMS2', 'VapourSynth', 'Script'], 1, { w: 96, h: 28 });
  U.link(1294, 746, 'Edit input', { w: 90, right: true });
  U.note('Per-scene filtering is not a second input: it is the custom script reading injected scene ranges.', 288, 774, 1080, 20);

  U.card('params card', CONTENT_X, 824, 1144, 196);
  U.head('Parameters', 288, 844, 200);
  U.note('SVT-AV1 · 5 of 41 set · changes from defaults are marked.', 404, 848, 500, 20);
  U.text(b, 'advanced label', 'Show advanced', 1088, 848, 110, { size: 10.5, color: 'color.text.secondary', align: 'right' });
  U.toggle(1206, 844, false);
  U.btn(1264, 840, 'Preview command', { w: 120, h: 28 });

  const group = (value, x) => K.text(b, 'param group ' + value, value, x, 884, 208, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
  group('QUALITY', 288);
  group('SPEED', 732);
  group('THREADING', 954);
  group('FILTERING', 1176);
  [718, 940, 1162].forEach((x) => K.rect(b, 'param group sep ' + x, x, 884, 1, 84, { fill: 'color.border.subtle' }));
  U.divider(288, 898, 1096);

  // One row, five 208 px fields. Quality spans the first two columns; the
  // remaining groups take one each. The CLI key lives in the info tooltip,
  // not beside the label, and the icon sits immediately after the label text.
  const field = (x, label, iconOffset, desc, control, resetX) => {
    const y = 906;
    K.text(b, 'param name ' + x, label, x, y, 208, { size: 11.5, weight: 'medium' });
    U.doc(x + iconOffset, y);
    K.text(b, 'param desc ' + x, desc, x, y + 16, 208, { size: 10, color: 'color.text.secondary', h: 14 });
    control(x, y + 34);
    if (resetX != null) K.icon(b, 'param reset ' + x, resetPath, x + resetX, y + 42, 12, { color: 'color.text.muted' });
  };

  field(288, 'Constant Rate Factor', 116, 'Controls the quality of the video.', (x, y) => {
    U.slider(x, y + 12, 96, 0.38);
    K.text(b, 'crf value', '24', x + 102, y, 30, { size: 10.5, family: 'JetBrains Mono', align: 'right', valign: 'center', h: 28 });
  }, 142);
  field(510, 'Tune', 36, 'Optimises for a perceptual metric.', (x, y) => {
    U.seg(x, y + 1, ['VQ', 'PSNR', 'SSIM', 'OFF'], 0, { w: 39, h: 26 });
  }, 174);
  field(732, 'Preset', 46, 'Speed and compression trade-off.', (x, y) => {
    U.slider(x, y + 12, 96, 0.31);
    K.text(b, 'preset value', '4', x + 102, y, 30, { size: 10.5, family: 'JetBrains Mono', align: 'right', valign: 'center', h: 28 });
  }, 142);
  field(954, 'Logical processors', 104, 'Threads the encoder may use.', (x, y) => {
    U.box(x, y, 110, '16', { mono: true, h: 28 });
  }, 118);
  field(1176, 'Temporal filtering', 96, 'Applies a temporal filter.', (x, y) => {
    K.text(b, 'tf value', 'Encoder default', x, y, 120, { size: 10.5, color: 'color.text.muted', valign: 'center', h: 28 });
    U.btn(x + 112, y, 'Set', { w: 42, h: 28 });
  });

  U.note('Only set parameters are sent. Each info icon carries the CLI key, description and documentation.', 288, 984, 1000, 16);
}

// ---------------------------------------------------------- Target quality
if (!ONLY || ONLY === 'target') {
  const b = K.board(null, 'Configuration / Target quality', 0, 2088, sw, 1320);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Target quality'));
  K.sectionRail(b, 1320, 'Target quality');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('Three optional stages that run in order: find a quantizer, scale it by speed, then flag outliers.', CONTENT_X, 78, 1000);

  U.card('tq card', CONTENT_X, 120, MAIN_W, 512);
  U.text(b, 'tq head', '1 · Target quality', 288, 140, 300, { size: 15, weight: 'semibold' });
  U.chip(440, 138, 'Optional', 'neutral');
  U.toggle(830, 142, true);
  U.label('Metric', 288, 184, 120);
  U.box(288, 202, 240, 'SSIMULACRA2', { chev: true });
  U.label('Target range', 544, 184, 160);
  U.box(544, 202, 80, '74', { mono: true });
  K.text(b, 'to 1', 'to', 632, 208, 24, { size: 10.5, color: 'color.text.muted' });
  U.box(648, 202, 80, '76', { mono: true });
  U.note('Scores inside the range are accepted.', 544, 240, 184, 28);
  U.link(288, 246, 'Metric options · 2 set', { w: 240 });
  U.label('Maximum probes', 744, 184, 160);
  U.box(744, 202, 80, '4', { mono: true });
  U.note('At least 1. Each probe is a full encode pass.', 744, 240, 232, 28);
  U.divider(288, 272, 688);

  U.label('Quantizer range', 288, 286, 160);
  U.box(288, 304, 80, '10', { mono: true });
  K.text(b, 'to 2', 'to', 376, 310, 24, { size: 10.5, color: 'color.text.muted' });
  U.box(408, 304, 80, '50', { mono: true });
  U.note('Lower must be below upper. The search never leaves this range.', 288, 342, 200, 30);
  U.label('Interpolators', 504, 286, 160);
  U.box(504, 304, 160, 'Fritsch–Carlson', { chev: true });
  U.box(680, 304, 160, 'PCHIP', { chev: true });
  U.note('Exactly two, in order. The search compares both predictions at every step.', 504, 342, 472, 30);
  U.label('Probe strategy', 288, 382, 160);
  U.box(288, 400, 160, 'Subset · middle', { chev: true });
  U.label('Statistic', 464, 382, 120);
  U.box(464, 400, 160, 'Percentile 1', { chev: true });
  U.note('Whole, skip every Nth frame, or a subset at the start, middle, or end.', 288, 436, 688, 20);
  U.divider(288, 462, 688);

  U.label('Input', 288, 476, 100);
  U.radio(288, 494, 'Project input · FFMS2', true, 300);
  U.radio(576, 494, 'Custom input', false, 160);
  U.link(886, 498, 'Edit input', { w: 90, right: true });
  U.note('Denoise the input graph in VapourSynth for more reliable scores.', 288, 520, 688, 16);
  U.label('Metric input', 288, 540, 120);
  U.chip(380, 536, 'Off · uses the input graph', 'neutral');
  U.link(886, 544, 'Configure', { w: 90, right: true });
  U.label('Encoder parameters', 288, 578, 160);
  U.box(412, 572, 180, 'Same as Encoding', { chev: true });
  U.btn(604, 572, 'Override', { w: 74, h: 30 });
  U.note('Target ranges follow the metric: VMAF 94–96 · SSIMULACRA2 74–76 · Butteraugli 0.8–1.2 · XPSNR 44–46 · CVVDP 9.4–9.6.', 288, 606, 688, 20);

  U.card('speed card', CONTENT_X, 646, MAIN_W, 330);
  U.text(b, 'speed head', '2 · Speed scaling', 288, 666, 300, { size: 15, weight: 'semibold' });
  U.chip(440, 664, 'Optional', 'neutral');
  U.toggle(830, 668, true);
  U.note('Quantizer on x, preset / speed on y. The line is interpolated between the points you set.', 288, 690, 688, 20);
  K.rect(b, 'speed plot', 288, 720, 456, 196, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  for (let i = 0; i < 4; i++) K.line(b, 'speed grid ' + i, 308, 742 + i * 40, 416, { color: 'color.border.subtle' });
  [['18', 308], ['28', 448], ['38', 588], ['50', 708]].forEach(([t, x], i) => K.text(b, 'speed q ' + i, t, x, 892, 40, { size: 9.5, color: 'color.text.muted', align: 'center' }));
  K.text(b, 'speed x label', 'quantizer', 308, 910, 80, { size: 9.5, color: 'color.text.muted' });
  K.text(b, 'speed y label', 'preset', 728, 726, 40, { size: 9.5, color: 'color.text.muted', align: 'right' });
  ['2', '4', '6', '8'].forEach((t, i) => K.text(b, 'speed y ' + i, t, 294, 856 - i * 40, 20, { size: 9.5, color: 'color.text.muted' }));
  K.rect(b, 'point 1', 363, 809, 10, 10, { fill: 'color.brand.default', r: 5 });
  K.rect(b, 'point 2', 608, 775, 10, 10, { fill: 'color.brand.default', r: 5 });
  K.text(b, 'point 1 label', 'Q 22 · preset 6', 377, 802, 120, { size: 10, color: 'color.text.secondary' });
  K.text(b, 'point 2 label', 'Q 40 · preset 8', 622, 768, 120, { size: 10, color: 'color.text.secondary' });
  K.rect(b, 'speed sep', 760, 720, 1, 196, { fill: 'color.border.subtle' });
  U.label('Points', 784, 720, 120);
  K.text(b, 'pt1', 'Q 22  →  preset 6', 784, 746, 150, { size: 11, family: 'JetBrains Mono' });
  K.text(b, 'pt1 edit', 'Edit', 938, 746, 38, { size: 10.5, color: 'color.brand.text', align: 'right' });
  K.text(b, 'pt2', 'Q 40  →  preset 8', 784, 776, 150, { size: 11, family: 'JetBrains Mono' });
  K.text(b, 'pt2 edit', 'Edit', 938, 776, 38, { size: 10.5, color: 'color.brand.text', align: 'right' });
  U.btn(784, 812, 'Add point', { w: 96 });
  U.note('At least two points. Quantizer must increase and speed must not decrease. An invalid pair cannot be applied.', 784, 852, 192, 46);

  U.card('bitrate card', CONTENT_X, 992, MAIN_W, 240);
  U.text(b, 'bitrate head', '3 · Bitrate optimization', 288, 1012, 300, { size: 15, weight: 'semibold' });
  U.chip(496, 1010, 'Optional', 'neutral');
  U.toggle(830, 1014, false);
  U.label('Sigma threshold', 288, 1058, 160);
  U.box(288, 1076, 100, '2.0', { mono: true });
  U.note('Flags scenes whose bitrate is more than sigma times the median. 1–10; 2.0 is the engine default.', 288, 1116, 688, 20);
  U.chip(288, 1146, 'Requires Encoding', 'neutral');
  U.note('Bitrate optimization runs after encoding, because it reads each scene’s actual bitrate.', 452, 1142, 524, 20);

  U.card('order card', SIDE_X, 120, SIDE_W, 250);
  U.head('Run order', 1040, 140, 300);
  [['1', 'Target quality', 'Produces a quantizer per scene.'], ['2', 'Speed scaling', 'Maps each quantizer to a speed.'], ['3', 'Bitrate optimization', 'Flags scenes and re-encodes them.']].forEach(([n, t, d], i) => {
    const y = 184 + i * 58;
    K.rect(b, 'order dot ' + i, 1040, y, 22, 22, { fill: 'color.bg.raised', r: 11, stroke: 'color.border.default' });
    K.text(b, 'order n ' + i, n, 1040, y, 22, { size: 10, align: 'center', valign: 'center', h: 22, color: 'color.text.secondary' });
    K.text(b, 'order t ' + i, t, 1074, y - 2, 300, { size: 12, weight: 'medium' });
    U.note(d, 1074, y + 18, 300, 20);
  });
  U.note('Turning off an earlier stage turns off the ones that consume it.', 1040, 346, 344, 20);

  U.card('tq context card', SIDE_X, 388, SIDE_W, 822);
  U.head('In the video context', 1040, 408, 300);
  U.note('Quantizer, score and pass history per scene; the active pass is highlighted.', 1040, 432, 344, 34);
  K.rect(b, 'tq chart', 1040, 478, 344, 260, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  for (let i = 0; i < 5; i++) K.line(b, 'tq grid ' + i, 1064, 522 + i * 48, 296, { color: 'color.border.subtle' });
  const series = [
    { y: 700, color: 'color.brand.default', label: 'Pass 1' },
    { y: 649, color: 'color.state.success', label: 'Pass 2' },
    { y: 598, color: 'color.state.warning', label: 'Final' },
  ];
  series.forEach((s, row) => {
    for (let i = 0; i < 22; i++) {
      const jitter = (i * 7 + row * 11) % 26;
      K.rect(b, 'tq dot ' + row + ' ' + i, 1056 + i * 15, s.y - jitter, 7, 7, { fill: s.color, r: 4 });
    }
    K.text(b, 'tq legend ' + row, s.label, 1056 + row * 100, 748, 90, { size: 9.5, color: 'color.text.secondary' });
  });
  K.text(b, 'tq x', 'Scene', 1056, 722, 80, { size: 9.5, color: 'color.text.muted' });
  K.text(b, 'tq y', 'quantizer', 1310, 484, 74, { size: 9.5, color: 'color.text.muted', align: 'right' });
  U.divider(1040, 770, 344);
  const tstats = [['Scenes', '112'], ['Mean passes', '2.4'], ['Scenes at pass 5', '3'], ['Mean score', '86.1'], ['Mean efficiency', '0.42']];
  tstats.forEach(([k, v], i) => {
    const y = 786 + i * 28;
    K.text(b, 'tstat k ' + i, k, 1040, y, 230, { size: 11, color: 'color.text.secondary' });
    K.text(b, 'tstat v ' + i, v, 1180, y, 204, { size: 11, color: 'color.text.primary', align: 'right' });
  });
  U.note('Efficiency is score per bit per pixel. Every series has a table equivalent; the chart is never the only view.', 1040, 940, 344, 34);
  U.note('In the video context the same input override applies to the main input and, when enabled, the metric input.', 1040, 1050, 344, 46);
}

// ------------------------------------------------------------ Concatenation
if (!ONLY || ONLY === 'concatenation') {
  const b = K.board(null, 'Configuration / Concatenation', 1504, 2088, sw, 860);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Concatenation'));
  K.sectionRail(b, 860, 'Concatenation');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('How encoded scene chunks become one file. The encoded video track is always the output video; every other stream comes from the input.', CONTENT_X, 78, 1060);

  U.card('method card', CONTENT_X, 120, MAIN_W, 310);
  U.head('Method', 288, 140, 240);
  U.note('Default for every video; a video may choose a different method.', 288, 164, 688, 20);
  const methods = [
    ['mkvmerge', 'Matroska-native. Video is the encoded track; source audio, subtitles and attachments follow.'],
    ['FFmpeg', 'Broad format support. Video is the encoded track; source streams can be copied or filtered.'],
    ['IVF', 'Raw AV1 elementary stream. No container, no other streams, no chapters.'],
  ];
  methods.forEach(([name, desc], i) => {
    const x = 288 + i * 234;
    const on = i === 0;
    K.rect(b, 'method ' + i, x, 196, 220, 146, { fill: on ? 'color.bg.raised' : 'color.bg.sunken', r: 8, stroke: on ? 'color.brand.default' : 'color.border.default', sw: on ? 2 : 1 });
    K.rect(b, 'method radio ' + i, x + 16, 214, 14, 14, { fill: on ? 'color.brand.default' : null, stroke: on ? 'color.brand.default' : 'color.border.strong', r: 7 });
    if (on) K.rect(b, 'method dot ' + i, x + 20, 218, 6, 6, { fill: 'color.text.on-brand', r: 3 });
    K.text(b, 'method name ' + i, name, x + 40, 210, 160, { size: 13, weight: 'semibold' });
    K.text(b, 'method desc ' + i, desc, x + 16, 240, 188, { size: 10.5, color: 'color.text.secondary', h: 70, lh: 1.45 });
    if (on) K.text(b, 'method badge ' + i, 'Default', x + 16, 316, 100, { size: 10, color: 'color.brand.text' });
  });
  U.note('The project chooses the method. The encoded video is never replaced; the track map, chapters, metadata and attachments describe one encoded video, so they belong to that video.', 288, 352, 688, 40);

  U.card('settings card', CONTENT_X, 462, MAIN_W, 260);
  U.head('Method settings', 288, 482, 300);
  K.rect(b, 'settings empty', 288, 516, 688, 118, { fill: 'color.bg.sunken', r: 8, stroke: 'color.border.subtle' });
  K.icon(b, 'settings glyph', '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>', 622, 548, 20, { color: 'color.text.muted' });
  K.text(b, 'settings empty t', 'Nothing to configure here', 288, 578, 688, { size: 12, color: 'color.text.secondary', align: 'center' });
  K.text(b, 'settings empty d', 'The track map and chapters are proposed from the encoded chunks and the input once the video has been encoded.', 288, 598, 688, { size: 10.5, color: 'color.text.muted', align: 'center' });
  U.note('A method change is a project default; an existing video keeps the method it was encoded with until it is changed explicitly.', 288, 650, 688, 20);
  U.note('Neither the output path nor the scenes directory is configured on this screen.', 288, 676, 688, 20);

  U.card('concat context card', SIDE_X, 120, SIDE_W, 490);
  U.head('In the video context', 1040, 140, 300);
  U.note('A two-pane track map, proposed from the encoded chunks and the source. Open it from the video.', 1040, 164, 344, 34);
  K.rect(b, 'track table', 1040, 200, 344, 168, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.text(b, 'tt track', 'TRACK', 1052, 212, 100, { size: 9, weight: 'semibold', color: 'color.text.muted' });
  K.text(b, 'tt source', 'SOURCE', 1160, 212, 100, { size: 9, weight: 'semibold', color: 'color.text.muted' });
  K.text(b, 'tt action', 'ACTION', 1296, 212, 72, { size: 9, weight: 'semibold', color: 'color.text.muted' });
  const tracks = [['Video 0', 'encoded', 'Locked'], ['Audio 1', 'input', 'Include'], ['Audio 2', 'input', 'Drop'], ['Subtitle 3', 'input', 'Include']];
  tracks.forEach(([t, s, a], i) => {
    const y = 234 + i * 32;
    K.text(b, 'tr t ' + i, t, 1052, y, 100, { size: 10.5 });
    K.text(b, 'tr s ' + i, s, 1160, y, 120, { size: 10.5, color: 'color.text.secondary' });
    K.text(b, 'tr a ' + i, a, 1296, y, 72, { size: 10.5, color: a === 'Drop' ? 'color.state.danger' : 'color.text.secondary' });
    U.divider(1052, y + 24, 296);
  });
  U.toggle(1040, 386, true);
  K.text(b, 'chapters label', 'Copy chapters', 1084, 382, 200, { size: 11 });
  U.toggle(1040, 416, false);
  K.text(b, 'meta label', 'Copy source metadata', 1084, 412, 240, { size: 11 });
  U.note('The encoded video row is locked. Only audio, subtitles and attachments can be included or dropped.', 1040, 448, 344, 34);
  U.note('mkvmerge and FFmpeg probe the input with ffprobe or mkvmerge --identify; the proposal is never applied silently.', 1040, 492, 344, 44);

  U.card('one output card', SIDE_X, 626, SIDE_W, 210);
  U.head('One output, one owner', 1040, 646, 300);
  U.note('General chooses the folder; the video chooses the exact file with a save dialog. Concatenation writes that file and nothing else.', 1040, 674, 344, 46);
  U.note('IVF has no muxing step. Choosing it means the encoded elementary stream is the output.', 1040, 730, 344, 34);
  U.link(1040, 782, 'Open output settings', { w: 200 });
  U.note('Quality check reads the encoded chunks after this step.', 1040, 804, 344, 20);
}

// -------------------------------------------------------------- Quality check
if (!ONLY || ONLY === 'quality') {
  const b = K.board(null, 'Configuration / Quality check', 0, 3472, sw, 800);
  const bar = K.chrome(b, sw, crumbs('Projects', 'Big Buck Bunny', 'Quality check'));
  K.sectionRail(b, 800, 'Quality check');
  const U = helpers(b);
  U.topbar(sw, bar.actionStart);
  U.sub('Scores the retained chunks against the source. Runs per video, after encoding.', CONTENT_X, 78, 900);

  U.card('setup card', CONTENT_X, 120, MAIN_W, 420);
  U.head('Setup', 288, 140, 240);
  U.label('Metric', 288, 184, 120);
  U.box(288, 202, 240, 'SSIMULACRA2', { chev: true });
  U.label('Probe strategy', 544, 184, 120);
  U.box(544, 202, 160, 'Whole scene', { chev: true });
  U.label('Statistic', 720, 184, 120);
  U.box(720, 202, 160, 'Percentile 1', { chev: true });
  U.link(886, 184, 'Metric options', { w: 90, right: true });
  U.note('A metric is available when at least one of its backends is usable. Unavailable metrics are absent, not disabled.', 288, 246, 688, 20);
  U.divider(288, 280, 688);
  U.label('Input', 288, 294, 100);
  U.radio(288, 312, 'Project input · FFMS2', true, 300);
  U.radio(620, 312, 'Custom input', false, 160);
  U.link(886, 316, 'Edit input', { w: 90, right: true });
  U.note('The metric compares retained chunks against the frames this input produces. An override changes only the comparison source.', 288, 350, 688, 20);
  K.rect(b, 'ffmpeg warning', 288, 386, 688, 90, { fill: 'color.state.warning-bg', r: 8, stroke: 'color.state.warning' });
  K.icon(b, 'warning glyph', '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', 304, 402, 16, { color: 'color.state.warning' });
  K.text(b, 'warning title', 'Encoding applies an FFmpeg filter', 328, 398, 600, { size: 12, weight: 'semibold', color: 'color.state.warning' });
  U.note('Scored frames are not the source frames, so the score may not be comparable with other runs. The check still runs; the result is labeled.', 328, 420, 624, 34);
  U.note('The warning appears only when Encoding sets an FFmpeg filter.', 328, 456, 624, 20);

  U.card('chunks card', CONTENT_X, 572, MAIN_W, 180);
  U.head('Retained chunks', 288, 592, 300);
  U.chip(432, 590, '112 scenes · 2.4 GB', 'success');
  U.note('Quality check reads the encoded scene chunks. They are retained after a successful run by default.', 288, 622, 688, 20);
  U.note('Deleting chunks makes this check impossible for those scenes. The delete action lives in Storage and names this consequence.', 288, 648, 688, 34);
  U.link(288, 700, 'Open storage settings', { w: 200 });

  U.card('qc context card', SIDE_X, 120, SIDE_W, 420);
  U.head('In the video context', 1040, 140, 300);
  U.note('Scores, quantizer, bitrate and efficiency per scene, plus the per-pass values from target quality.', 1040, 164, 344, 34);
  K.rect(b, 'qc chart', 1040, 210, 344, 168, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  for (let i = 0; i < 4; i++) K.line(b, 'qc grid ' + i, 1064, 246 + i * 44, 296, { color: 'color.border.subtle' });
  [['Score', 'color.brand.default', 366, 1064], ['Bitrate', 'color.state.success', 316, 1140]].forEach(([label, color, base, lx], row) => {
    for (let i = 0; i < 24; i++) {
      const h = 20 + ((i * 13 + row * 9) % 46);
      K.rect(b, 'qc bar ' + row + ' ' + i, 1066 + i * 12, base - h, 8, h, { fill: color, r: 2, op: 0.85 });
    }
    K.text(b, 'qc legend ' + row, label, lx, 390, 60, { size: 9.5, color: 'color.text.secondary' });
  });
  U.note('The score is per scene. A run-wide mean hides the bad scenes that matter.', 1040, 418, 344, 20);

  U.card('qc note card', SIDE_X, 572, SIDE_W, 200);
  U.head('What it is not', 1040, 592, 240);
  U.note('A score is not a substitute for watching. The scene list keeps the lowest-scoring scenes one click away.', 1040, 620, 344, 46);
  U.note('The check never re-encodes and never deletes chunks. It only reads them.', 1040, 680, 344, 34);
  U.note('A metric with no usable backend is absent from the picker; see Settings → Dependencies for remediation.', 1040, 724, 344, 34);
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
