// Settings / Tab states — the seven tabs and every state the strip can hold.
// Run in the connected Penpot tab after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '04 Settings');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Settings / Tab states';
const old = page.findShapes({ type: 'board' }).find((b) => b.name === NAME);
if (old) old.remove();

const b = K.board(null, NAME, 1504, 4176, 1440, 900);
const tabs = ['Appearance', 'Dependencies', 'Encoders', 'Project defaults', 'Storage', 'Network', 'About'];
const tw = (s, size) => Math.round(String(s).length * size * 0.56);
const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
const note = (name, value, x, y, w, h) =>
  K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
const label = (name, value, x, y, w) =>
  K.text(b, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });

function strip(name, x, y, w, selected, opts = {}) {
  // The five state cards are 680px wide, so their 648px strip needs tighter
  // gutters than the full-width reference strip. The type size stays 12px.
  const compact = opts.compact === true;
  const pad = compact ? 16 : 24;
  const gap = compact ? 12 : 16;
  const widthOf = (tab) => tw(tab, 12) + (compact ? 16 : 20);
  K.rect(b, name, x, y, w, 45, { fill: 'color.bg.base', r: 0 });
  let cx = x + pad;
  tabs.forEach((tab, i) => {
    const on = i === selected;
    const hover = opts.hover === i;
    const focus = opts.focus === i;
    const dirty = opts.dirty === i;
    const disabled = opts.disabled === i;
    const width = widthOf(tab);
    if (hover) K.rect(b, name + ' hover ' + i, cx - 8, y + 5, width + 4, 34, { fill: 'color.bg.raised', r: 5 });
    if (focus) K.rect(b, name + ' focus ' + i, cx - 9, y + 4, width + 6, 36, { fill: null, r: 6, stroke: 'color.border.focus', sw: 2 });
    K.text(b, name + ' t ' + i, tab, cx, y, width, {
      size: 12,
      weight: on ? 'semibold' : 'regular',
      color: disabled
        ? 'color.text.muted'
        : on
          ? 'color.text.primary'
          : hover
            ? 'color.text.primary'
            : 'color.text.secondary',
      valign: 'center',
      h: 45,
    });
    if (on) K.rect(b, name + ' underline ' + i, cx, y + 43, tw(tab, 12) + 6, 2, { fill: 'color.brand.default', r: 1 });
    if (dirty) K.rect(b, name + ' dirty ' + i, cx + width - 2, y + 17, 5, 5, { fill: 'color.state.warning', r: 3 });
    cx += width + gap;
  });
  K.rect(b, name + ' edge', x, y + 44, w, 1, { fill: 'color.border.default', r: 0 });
}

text('title', 'Settings tabs', 32, 24, 600, { size: 28, weight: 'semibold' });
text('subtitle', 'Seven tabs, one strip. Selection is URL state; a dirty encoder or defaults draft guards its tab.', 32, 62, 1100, {
  size: 13,
  color: 'color.text.secondary',
});

// Default strip
label('default label', 'REST · APPEARANCE SELECTED', 32, 108, 320);
strip('strip default', 32, 126, 1376, 0);
note('default note', 'The strip is 45px, directly under the 56px chrome. It is not repeated inside the tab content.', 32, 178, 900, 16);

// State specimens
const states = [
  { name: 'Hover', key: 'hover', opts: { hover: 2 } },
  { name: 'Focus-visible', key: 'focus', opts: { focus: 3 } },
  { name: 'Dirty draft', key: 'dirty', opts: { dirty: 2 } },
  { name: 'Disabled', key: 'disabled', opts: { disabled: 6 } },
];
states.forEach((state, i) => {
  const x = 32 + (i % 2) * 696;
  const y = 216 + Math.floor(i / 2) * 132;
  K.rect(b, 'state card ' + state.key, x, y, 680, 112, {
    fill: 'color.bg.surface',
    r: 10,
    stroke: 'color.border.subtle',
  });
  label('state label ' + state.key, state.name.toUpperCase(), x + 20, y + 14, 240);
  strip('strip ' + state.key, x + 16, y + 36, 648, 2, { ...state.opts, compact: true });
  const captions = {
    hover: 'Raised fill on the tab only; the underline does not move until selection.',
    focus: '2px focus ring outside the 34px hit area. Arrow keys move selection, Home/End jump.',
    dirty: '5px warning dot: the encoder parameter draft is unsaved. Switching asks before discarding.',
    disabled: 'About is disabled only while an update check owns the surface; the reason is in content.',
  };
  note('state note ' + state.key, captions[state.key], x + 20, y + 84, 630, 16);
});

// Tab content states
K.rect(b, 'content states', 32, 500, 1376, 250, {
  fill: 'color.bg.surface',
  r: 10,
  stroke: 'color.border.subtle',
});
label('content label', 'TAB CONTENT · LOADING / ERROR / EMPTY', 56, 516, 420);
note('content note', 'Every tab owns the same three states; the strip stays interactive so the user can leave a failed tab.', 56, 534, 1100, 16);

const panels = [
  { name: 'Loading', sub: 'Skeleton rows at the populated geometry', tone: 'neutral' },
  { name: 'Error', sub: 'Cause, remediation, retry, and the log route', tone: 'danger' },
  { name: 'Empty', sub: 'Why it is empty and the one action that fills it', tone: 'neutral' },
];
panels.forEach((panel, i) => {
  const x = 56 + i * 448;
  K.rect(b, 'panel ' + panel.name, x, 560, 424, 166, { fill: 'color.bg.sunken', r: 8, stroke: 'color.border.subtle' });
  const [bg, fg] =
    panel.tone === 'danger'
      ? ['color.state.danger-bg', 'color.state.danger']
      : ['color.state.neutral-bg', 'color.state.neutral'];
  K.rect(b, 'panel chip bg ' + panel.name, x + 16, 574, tw(panel.name, 9.5) + 18, 20, { fill: bg, r: 999, stroke: fg });
  text('panel chip ' + panel.name, panel.name, x + 25, 574, tw(panel.name, 9.5) + 8, {
    size: 9.5,
    weight: 'medium',
    color: fg,
    valign: 'center',
    h: 20,
  });
  note('panel note ' + panel.name, panel.sub, x + 16, 604, 392, 34);
  if (panel.name === 'Loading') {
    for (let r = 0; r < 3; r++) {
      K.rect(b, 'skel ' + r, x + 16, 640 + r * 26, 392 - r * 60, 10, { fill: 'color.bg.raised', op: 0.5, r: 4 });
      K.rect(b, 'skel v ' + r, x + 16, 654 + r * 26, 120, 6, { fill: 'color.bg.raised', op: 0.3, r: 3 });
    }
  } else if (panel.name === 'Error') {
    K.rect(b, 'err line', x + 16, 640, 392, 54, { fill: 'color.bg.base', r: 6, stroke: 'color.border.default' });
    text('err mono', 'encoder --help exited 127', x + 28, 650, 360, { size: 10, family: 'JetBrains Mono', color: 'color.text.primary', h: 16 });
    note('err path', '/usr/local/bin/svt-av1  ·  not found', x + 28, 668, 360, 14);
  } else {
    K.icon(b, 'empty glyph', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/>', x + 16, 640, 20, { color: 'color.text.muted' });
    note('empty body', 'No saved encoder definitions yet.', x + 46, 640, 300, 16);
    K.rect(b, 'empty action', x + 16, 674, 120, 28, { fill: 'color.brand.default', r: 5 });
    text('empty action t', 'Add encoder', x + 16, 674, 120, { size: 11, weight: 'semibold', color: 'color.text.on-brand', align: 'center', valign: 'center', h: 28 });
  }
});

note(
  'rules',
  'Tab selection writes to the URL. Unsaved encoder edits live in the draft store, not in a tab component; leaving a dirty tab opens the discard guard. The active tab is announced as the current page section, and the strip is reachable with Tab then arrow keys.',
  32,
  772,
  1376,
  60,
);


K.organize(page);
