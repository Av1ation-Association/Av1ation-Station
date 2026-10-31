// Settings / Project defaults — the template copied into every new project.
// Run after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '04 Settings');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Settings / Project defaults';
const old = page.findShapes({ type: 'board' }).find((b) => b.name === NAME);
if (old) old.remove();

const W = 1440;
const H = 980;
const b = K.board(null, NAME, 1504, 1044, W, H);
K.chrome(b, W, [{ label: 'Settings' }, { label: 'Project defaults', current: true }]);

const tw = (s, size) => Math.round(String(s).length * size * 0.56);
const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
const note = (name, value, x, y, w, h) =>
  K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
const label = (name, value, x, y, w) =>
  K.text(b, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });

const TABS = ['Appearance', 'Dependencies', 'Encoders', 'Project defaults', 'Storage', 'Network', 'About'];
const ACTIVE = 3;
K.rect(b, 'settings tabs', 0, 56, W, 45, { fill: 'color.bg.base', r: 0 });
let cx = 32;
TABS.forEach((tab, i) => {
  const on = i === ACTIVE;
  const width = tw(tab, 12) + 20;
  text('tab ' + tab, tab, cx, 56, width, {
    size: 12,
    weight: on ? 'semibold' : 'regular',
    color: on ? 'color.text.primary' : 'color.text.secondary',
    valign: 'center',
    h: 45,
  });
  if (on) K.rect(b, 'tab underline ' + tab, cx, 99, tw(tab, 12) + 6, 2, { fill: 'color.brand.default', r: 1 });
  cx += width + 16;
});
K.rect(b, 'tab edge', 0, 100, W, 1, { fill: 'color.border.default', r: 0 });

function card(name, x, y, w, h) {
  K.rect(b, 'card ' + name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
}
function chip(name, x, y, value, tone) {
  const map = {
    neutral: ['color.state.neutral-bg', 'color.state.neutral'],
    success: ['color.state.success-bg', 'color.state.success'],
    warning: ['color.state.warning-bg', 'color.state.warning'],
  };
  const [bg, fg] = map[tone || 'neutral'];
  const w = tw(value, 9.5) + 18;
  K.rect(b, 'chip ' + name, x, y, w, 20, { fill: bg, r: 999, stroke: fg });
  text('chip t ' + name, value, x + 9, y, w - 14, { size: 9.5, color: fg, valign: 'center', h: 20 });
  return w;
}
function action(name, x, y, value, width) {
  const w = width || tw(value, 10.5) + 20;
  K.rect(b, 'btn ' + name, x, y, w, 28, { fill: null, r: 5, stroke: 'color.border.default' });
  text('btn t ' + name, value, x, y, w, {
    size: 10.5,
    color: 'color.text.secondary',
    align: 'center',
    valign: 'center',
    h: 28,
  });
  return w;
}

// Hero: what the template is, and one reset action.
text('eyebrow', 'PROJECT TEMPLATE', 32, 122, 300, { size: 10, weight: 'semibold', color: 'color.text.muted' });
text('heading', 'Start new projects from a known configuration', 32, 140, 900, { size: 24, weight: 'semibold', h: 32 });
note(
  'intro',
  'One complete ProjectConfig, copied into project.json when a project is created. Editing this template never changes an existing project; editing a project never changes the template.',
  32,
  180,
  900,
  40,
);
K.rect(b, 'reset all', 1016, 140, 392, 76, { fill: 'color.bg.surface', r: 8, stroke: 'color.border.subtle' });
K.icon(
  b,
  'reset all icon',
  '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  1036,
  158,
  16,
  { color: 'color.text.secondary' },
);
text('reset all head', 'Reset all to engine defaults', 1062, 154, 300, { size: 11.5, weight: 'medium', h: 18 });
note('reset all body', 'Resets this template only. Existing projects keep the values they were created with.', 1062, 174, 326, 30);
K.text(b, 'reset all link', 'Reset', 1342, 154, 50, {
  size: 10,
  color: 'color.brand.text',
  align: 'right',
  h: 16,
});

// Section summary grid: seven section cards in pipeline reading order, then the
// copy-boundary card. No section is edited here: Edit opens the same section
// editor a project uses, at /settings/defaults/<section>.
const CARDS = [
  ['General', 'Custom', 'FFMS2 · native decode', 'Output next to input · MKV 10-bit'],
  ['Scene detection', 'Custom', 'AVSceneChange · standard', '24–240 frames per scene'],
  ['Noise generation', 'Engine default', 'WNNM reference + denoised', 'Threshold 0.01 · chroma scaling'],
  ['Target quality', 'Custom', 'SSIMULACRA2 · 74–76', 'Speed scaling on · bitrate off'],
  ['Encoding', 'Custom', 'SVT-AV1 · Auto workers', '5 of 41 parameters set · photon off'],
  ['Concatenation', 'Custom', 'mkvmerge', 'Track map owned by each video'],
  ['Quality check', 'Engine default', 'Off for new projects', 'SSIMULACRA2 · percentile 1'],
];
CARDS.forEach(([name, badge, one, two], i) => {
  const x = 32 + (i % 2) * 688;
  const y = 240 + Math.floor(i / 2) * 156;
  const w = 680;
  card(name, x, y, w, 140);
  text('card head ' + name, name, x + 24, y + 20, 300, { size: 14, weight: 'semibold', h: 20 });
  chip(name, x + w - 24 - (tw(badge, 9.5) + 18), y + 18, badge, badge === 'Engine default' ? 'neutral' : 'success');
  text('card one ' + name, one, x + 24, y + 48, w - 48, { size: 11.5, h: 18 });
  text('card two ' + name, two, x + 24, y + 68, w - 48, {
    size: 10.5,
    color: 'color.text.secondary',
    family: 'JetBrains Mono',
    h: 18,
  });
  K.rect(b, 'card rule ' + name, x + 24, y + 96, w - 48, 1, { fill: 'color.border.subtle', r: 0 });
  note('card foot ' + name, 'Edit opens this section in the defaults editor', x + 24, y + 108, 400, 16);
  K.text(b, 'card edit ' + name, 'Edit', x + w - 24 - 36, y + 108, 36, {
    size: 10.5,
    color: 'color.brand.text',
    align: 'right',
    h: 16,
  });
});

// Eighth card: the copy boundary, in the same grid position a section would use.
{
  const x = 32 + 688;
  const y = 240 + 3 * 156;
  const w = 680;
  card('How edits work', x, y, w, 140);
  text('how head', 'How these are edited', x + 24, y + 20, 300, { size: 14, weight: 'semibold', h: 20 });
  note(
    'how body',
    'Edit opens the same section editor a project uses — same fields, filter composer, encoder descriptors and validation — scoped to defaults.',
    x + 24,
    y + 48,
    w - 48,
    32,
  );
  K.rect(b, 'how path', x + 24, y + 92, w - 48, 28, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
  text('how path t', 'Settings / Project defaults / Encoding', x + 36, y + 92, w - 72, {
    size: 10,
    family: 'JetBrains Mono',
    color: 'color.text.secondary',
    valign: 'center',
    h: 28,
  });
}

text('page foot', 'Copied once at creation. No propagation, no live link, no apply-to-all action.', 32, 914, 1000, {
  size: 10,
  color: 'color.text.muted',
  h: 16,
});

// ------------------------------------------- Settings / Project defaults / Encoding
// A defaults section editor is not a project screen: no section rail, no
// Settings tabs, and no duplicated page title. The breadcrumb names the scope,
// the top bar owns Save/Cancel, and the field set is the same component the
// project's Encoding section renders.
{
  const NAME2 = 'Settings / Project defaults / Encoding';
  const old2 = page.findShapes({ type: 'board' }).find((b) => b.name === NAME2);
  if (old2) old2.remove();

  const W2 = 1440;
  const H2 = 920;
  const e = K.board(null, NAME2, 1504, 2088, W2, H2);
  const bar = K.chrome(e, W2, [
    { label: 'Settings' },
    { label: 'Project defaults' },
    { label: 'Encoding', current: true },
  ]);

  const eText = (name, value, x, y, w, o) => K.text(e, name, value, x, y, w, o);
  const eNote = (name, value, x, y, w, h) =>
    K.text(e, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
  const eLabel = (name, value, x, y, w) =>
    K.text(e, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });
  const eCard = (name, x, y, w, h) =>
    K.rect(e, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  const eChip = (name, x, y, value, tone) => {
    const map = {
      neutral: ['color.state.neutral-bg', 'color.state.neutral'],
      success: ['color.state.success-bg', 'color.state.success'],
      warning: ['color.state.warning-bg', 'color.state.warning'],
      info: ['color.state.info-bg', 'color.state.info'],
    };
    const [bg, fg] = map[tone || 'neutral'];
    const w = tw(value, 9.5) + 18;
    K.rect(e, 'chip ' + name, x, y, w, 20, { fill: bg, r: 999, stroke: fg });
    eText('chip t ' + name, value, x + 9, y, w - 14, { size: 9.5, color: fg, valign: 'center', h: 20 });
    return w;
  };
  const eBtn = (name, x, y, value, o = {}) => {
    const w = o.w || tw(value, 11) + 24;
    const h = o.h || 30;
    K.rect(e, 'btn ' + name, x, y, w, h, {
      fill: o.primary ? 'color.brand.default' : o.ghost ? null : 'color.bg.raised',
      r: 5,
      stroke: o.primary || o.ghost ? null : 'color.border.default',
    });
    eText('btn t ' + name, value, x, y, w, {
      size: 11,
      weight: o.primary ? 'semibold' : 'regular',
      color: o.primary ? 'color.text.on-brand' : 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h,
    });
    return w;
  };
  const eBox = (name, x, y, w, value, o = {}) => {
    const h = o.h || 32;
    K.rect(e, 'box ' + name, x, y, w, h, { fill: 'color.bg.sunken', stroke: 'color.border.default', r: 5 });
    eText('box v ' + name, value, x + 10, y, w - 32, {
      size: o.size || 11,
      family: o.mono === false ? 'Inter' : 'JetBrains Mono',
      color: o.color || 'color.text.primary',
      valign: 'center',
      h,
    });
    if (o.chev) K.icon(e, 'box c ' + name, '<path d="m6 9 6 6 6-6"/>', x + w - 22, y + h / 2 - 7, 14, { color: 'color.text.muted' });
    return h;
  };
  const eToggle = (name, x, y, on) => {
    K.rect(e, 'toggle ' + name, x, y, 34, 18, {
      fill: on ? 'color.brand.default' : 'color.bg.raised',
      r: 9,
      stroke: on ? null : 'color.border.strong',
    });
    K.rect(e, 'toggle knob ' + name, on ? x + 18 : x + 2, y + 2, 14, 14, {
      fill: on ? 'color.text.on-brand' : 'color.text.muted',
      r: 7,
    });
  };
  const eLink = (name, x, y, value, w, right) =>
    K.text(e, 'link ' + name, value, x, y, w || 140, {
      size: 10.5,
      color: 'color.brand.text',
      align: right ? 'right' : 'left',
      h: 16,
    });

  // Scope strip. It is not a page title; it states what Save will write.
  K.rect(e, 'scope strip', 0, 56, W2, 44, { fill: 'color.bg.base', r: 0 });
  K.rect(e, 'scope strip edge', 0, 99, W2, 1, { fill: 'color.border.subtle', r: 0 });
  K.icon(
    e,
    'scope icon',
    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    32,
    70,
    14,
    { color: 'color.text.secondary' },
  );
  eText('scope text', 'Applies to new projects only. Existing projects keep the configuration copied at creation; saving here never writes to a project.', 54, 56, 880, {
    size: 10.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 44,
  });

  // Save/Cancel live in the existing 56 px bar, before the global icon actions.
  const saveW = 76;
  const cancelW = 76;
  const statusW = 128;
  const saveX = bar.actionStart - 16 - saveW;
  const cancelX = saveX - 8 - cancelW;
  const statusX = cancelX - 12 - statusW;
  K.rect(e, 'dirty dot', statusX, 25, 6, 6, { fill: 'color.state.warning', r: 3 });
  eText('dirty text', 'Unsaved changes', statusX + 14, 0, statusW - 14, {
    size: 10.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 56,
  });
  eBtn('cancel', cancelX, 12, 'Cancel', { w: cancelW, ghost: true, h: 32 });
  eBtn('save', saveX, 12, 'Save', { w: saveW, primary: true, h: 32 });

  const MX = 32;
  const MW = 900;
  const SX = 964;
  const SW = 444;

  // Encoder card
  eCard('editor encoder', MX, 116, MW, 258);
  eText('encoder head', 'Encoder', MX + 24, 136, 180, { size: 16, weight: 'semibold', h: 24 });
  eChip('encoder badge', MX + 104, 139, 'New projects', 'neutral');
  eNote('encoder sub', 'The default chooser and worker policy for every new project.', MX + 24, 160, 600, 16);

  eLabel('encoder label', 'ENCODER', MX + 24, 190, 120);
  eBox('encoder value', MX + 24, 208, 360, 'SVT-AV1 · 6.0.0', { chev: true, mono: false, size: 11.5 });
  eLabel('workers label', 'WORKERS', MX + 416, 190, 120);
  ['Auto', 'Manual'].forEach((label, i) => {
    K.rect(e, 'workers seg ' + i, MX + 416 + i * 100, 208, 96, 32, {
      fill: i === 0 ? 'color.bg.raised' : 'color.bg.sunken',
      r: 4,
      stroke: i === 0 ? 'color.border.strong' : 'color.border.default',
    });
    eText('workers seg t ' + i, label, MX + 416 + i * 100, 208, 96, {
      size: 10.5,
      weight: i === 0 ? 'semibold' : 'regular',
      color: i === 0 ? 'color.text.primary' : 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: 32,
    });
  });
  eNote('workers note', 'Auto benchmarker · 3% speed gain per worker · memory cap off', MX + 24, 250, 620, 16);
  K.line(e, 'encoder divider', MX + 24, 276, MW - 48, { color: 'color.border.subtle' });
  eToggle('colour', MX + 24, 292, true);
  eText('colour t', 'Append color data', MX + 68, 288, 220, { size: 11.5 });
  eNote('colour n', 'Writes the source colour metadata into each chunk.', MX + 68, 306, 300, 14);
  eToggle('photon', MX + 440, 292, false);
  eText('photon t', 'Photon noise', MX + 484, 288, 180, { size: 11.5 });
  eNote('photon n', 'SVT-AV1 only. Off means no synthesised grain.', MX + 484, 306, 320, 14);

  // Parameter grid: the same descriptor-driven fields as the project editor,
  // but wider because there is no section rail stealing 232 px.
  eCard('editor params', MX, 390, MW, 250);
  eText('params head', 'Encoder parameters', MX + 24, 410, 240, { size: 15, weight: 'semibold', h: 22 });
  eChip('params count', MX + 206, 412, '5 of 41 set', 'neutral');
  eLink('params preview', MX + MW - 152, 412, 'Preview command', 128, true);
  eNote('params note', 'Defaults only. A project can override any field after it is created.', MX + 24, 436, 640, 16);

  const FIELDS = [
    ['CRF', '26', 'Constant rate factor', false],
    ['Preset', '6 · medium', 'Speed and quality', true],
    ['Tune', '0 · VQ', 'Psychovisual tune', true],
    ['Pixel format', '10-bit 4:2:0', 'Required by SVT-AV1', true],
    ['Film grain', 'Off', 'Preserve source grain', true],
  ];
  FIELDS.forEach(([label, value, help, chev], i) => {
    const fx = MX + 24 + i * 170;
    eLabel('f label ' + i, label.toUpperCase(), fx, 470, 158);
    eBox('f ' + i, fx, 488, 158, value, { chev, size: 10, mono: false });
    eNote('f help ' + i, help, fx, 526, 158, 28);
  });
  K.line(e, 'params divider', MX + 24, 568, MW - 48, { color: 'color.border.subtle' });
  eText('params advanced', 'Show advanced (36)', MX + 24, 582, 220, { size: 10.5, color: 'color.brand.text', h: 16 });
  eNote('params advanced n', 'Hidden by default; a field set here becomes the inherited value in every new project.', MX + 24, 602, 760, 16);

  // FFmpeg filter card
  eCard('editor filter', MX, 656, MW, 140);
  eText('filter head', 'FFmpeg filter', MX + 24, 676, 220, { size: 15, weight: 'semibold', h: 22 });
  eChip('filter badge', MX + 158, 678, 'Optional', 'neutral');
  eNote('filter note', 'Runs before the encoder receives each frame. Empty means no filter. Unavailable for the FFmpeg encoder, which filters through its own options.', MX + 24, 700, 820, 16);
  eBox('filter value', MX + 24, 726, MW - 48, '', { h: 34, size: 10 });
  K.icon(e, 'filter clear', '<path d="M18 6 6 18M6 6l12 12"/>', MX + MW - 50, 736, 14, { color: 'color.text.muted' });
  eNote('filter warn', 'An active filter makes Quality Check score a different picture; scoring may be inaccurate.', MX + 24, 768, 820, 14);

  // Side column: validation, reset, editor contract. The scope strip above
  // already states the copy boundary, so it is not repeated in a card.
  eCard('validation card', SX, 116, SW, 160);
  eText('valid head', 'Validation', SX + 24, 136, 200, { size: 15, weight: 'semibold', h: 22 });
  eChip('valid chip', SX + SW - 92, 138, 'Ready', 'neutral');
  const checks = [
    'Encoder exists and its descriptors load',
    'No duplicate parameter key is active',
    'Workers and filter values are valid',
  ];
  checks.forEach((c, i) => {
    const y = 172 + i * 25;
    K.icon(e, 'valid check ' + i, '<path d="m5 12 5 5L20 7"/>', SX + 24, y, 12, { color: 'color.text.secondary' });
    eText('valid t ' + i, c, SX + 44, y - 2, SW - 68, { size: 10.5, color: 'color.text.secondary', h: 16 });
  });
  eNote('valid note', 'Save stays enabled; the server performs the same checks before writing.', SX + 24, 246, SW - 48, 14);

  eCard('reset card', SX, 292, SW, 156);
  K.icon(e, 'reset icon', '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>', SX + 24, 312, 16, { color: 'color.text.secondary' });
  eText('reset head', 'Reset section', SX + 50, 310, 260, { size: 13, weight: 'semibold', h: 20 });
  eNote('reset body', 'Restores the engine defaults for this section in the template. Existing projects are untouched.', SX + 24, 338, SW - 48, 34);
  eBtn('reset btn', SX + 24, 386, 'Reset Encoding', { w: 132, ghost: true, h: 30 });
  eNote('reset hint', 'The action is confirmed before it writes.', SX + 168, 393, 250, 14);

  eCard('contract card', SX, 464, SW, 190);
  eText('contract head', 'Save and Cancel', SX + 24, 484, 260, { size: 15, weight: 'semibold', h: 22 });
  const acts = [
    ['Save', 'Writes the default template and returns. Ctrl/Cmd-S also works. No project is written.'],
    ['Cancel', 'Discards the draft and returns. A dirty draft asks before it is dropped.'],
    ['Leave', 'The same save / discard / stay guard applies to the breadcrumb and back button.'],
  ];
  acts.forEach(([k, v], i) => {
    const y = 516 + i * 40;
    eText('contract k ' + i, k, SX + 24, y, 70, { size: 10.5, weight: 'semibold', h: 16 });
    eNote('contract v ' + i, v, SX + 96, y, SW - 120, 30);
  });
}



K.organize(page);
