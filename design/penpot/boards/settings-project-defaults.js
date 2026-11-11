// Settings / Project Templates and its Encoding detail.
//
// The manager is a list, not a grid of section summaries: a description, a search
// field, an add action, and one row per template. The encoding detail is a subpage:
// no Settings tab strip, one full-width stack, and Save/Discard in the top bar.
//
// Run after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '04 Settings');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const OVERVIEW = 'Settings / Project Templates';
const ENCODING = 'Settings / Project Templates / Encoding';
const LEGACY = {
  [OVERVIEW]: 'Settings / Project Template',
  [ENCODING]: 'Settings / Project Template / Encoding',
};

function replaceBoard(name) {
  for (const key of [name, LEGACY[name]].filter(Boolean)) {
    const old = page.findShapes({ type: 'board' }).find((b) => b.name === key);
    if (old) old.remove();
  }
}

const W = 1440;
const GUTTER = 32;
const CARD_GAP = 12;
const tw = (s, size) => Math.round(String(s).length * size * 0.56);

// The settings chrome carries the draft controls the app shows at this width. The
// draft group is four 26 px icon buttons at a 2 px rhythm; the two global actions keep
// their 32 px boxes and 12 px gaps, exactly as the shell lays them out.
function settingsChrome(board, width, crumbs) {
  const bar = K.chrome(board, width, crumbs, {
    actions: ['grid', 'gear'],
    activeActions: ['grid', 'gear'],
  });
  const icons = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    discard: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  };
  const start = bar.actionStart - 12 - 110;
  ['undo', 'redo', 'discard', 'save'].forEach((name, index) => {
    const x = start + index * 28;
    K.icon(board, 'draft ' + name, icons[name], x + 6, 21, 14, {
      color: 'color.text.muted',
      sw: 1.7,
    });
  });
  return bar;
}

function card(board, name, x, y, w, h) {
  return K.rect(board, 'card ' + name, x, y, w, h, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });
}

function badge(board, name, x, y, value, tone) {
  const map = {
    set: ['color.text.success', 'color.state.success'],
    neutral: ['color.text.muted', 'color.border.default'],
  };
  const [fg, stroke] = map[tone];
  const w = Math.round(value.length * 5.3) + 18;
  K.rect(board, 'badge ' + name, x, y, w, 20, {
    fill: null,
    r: 999,
    stroke,
  });
  K.text(board, 'badge t ' + name, value.toUpperCase(), x, y, w, {
    size: 8.5,
    family: 'JetBrains Mono',
    weight: 'medium',
    color: fg,
    align: 'center',
    valign: 'center',
    h: 20,
  });
}

function sectionCard(board, name, x, y, w, title, lines, tone) {
  card(board, name, x, y, w, 132);
  K.text(board, 'card title ' + name, title, x + 20, y + 17, w - 90, {
    size: 15,
    weight: 'semibold',
    color: 'color.text.primary',
    h: 22,
  });
  badge(board, name, x + w - 20 - (tone === 'set' ? 38 : 108), y + 15, tone === 'set' ? 'Set' : 'Engine default', tone);
  lines.forEach((line, i) =>
    K.text(board, 'card line ' + name + ' ' + i, line, x + 20, y + 47 + i * 19, w - 40, {
      size: 11.5,
      color: 'color.text.secondary',
      h: 18,
    }),
  );
}

function buildOverview() {
  replaceBoard(OVERVIEW);
  const b = K.board(null, OVERVIEW, 1504, 1672, W, 900);
  settingsChrome(b, W, [
    { label: 'Settings' },
    { label: 'Project Templates', current: true },
  ]);

  // 44 px tab strip, tabs at their measured advance and a 4 px gap.
  const TABS = [
    ['Appearance', 90],
    ['Dependencies', 102],
    ['Encoders', 74],
    ['Project Templates', 120],
    ['Storage', 66],
    ['Network', 71],
    ['About', 58],
  ];
  K.rect(b, 'settings tabs', 0, 56, W, 44, { fill: 'color.bg.base', r: 0 });
  let cx = 32;
  TABS.forEach(([tab, width], i) => {
    const on = i === 3;
    K.text(b, 'tab ' + tab, tab, cx, 56, width, {
      size: 12.5,
      weight: on ? 'semibold' : 'regular',
      color: on ? 'color.text.primary' : 'color.text.muted',
      align: 'center',
      valign: 'center',
      h: 44,
    });
    if (on) K.rect(b, 'tab underline ' + tab, cx, 98, width - 1, 2, {
      fill: 'color.brand.default',
      r: 0,
    });
    cx += width + 4;
  });
  K.rect(b, 'tab edge', 0, 100, W, 1, { fill: 'color.border.default', r: 0 });

  K.text(
    b,
    'templates intro',
    'A project template is a saved configuration and General section. New projects copy the template marked as default; existing projects are never changed.',
    32,
    128,
    860,
    { size: 12.5, color: 'color.text.secondary', h: 44, lh: 1.45 },
  );
  K.text(b, 'templates count', '3 templates', 936, 128, 86, {
    size: 10.5,
    color: 'color.text.muted',
    h: 32,
    valign: 'center',
  });

  K.rect(b, 'templates search', 1038, 126, 214, 32, {
    fill: 'color.bg.sunken',
    r: 6,
    stroke: 'color.border.default',
  });
  K.icon(
    b,
    'templates search icon',
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    1050,
    134,
    14,
    { color: 'color.text.muted', sw: 1.8 },
  );
  K.text(b, 'templates search placeholder', 'Search templates', 1070, 126, 170, {
    size: 10.5,
    color: 'color.text.muted',
    h: 32,
    valign: 'center',
  });

  K.rect(b, 'templates add', 1262, 126, 146, 32, { fill: 'color.brand.default', r: 6 });
  K.icon(
    b,
    'templates add plus',
    '<path d="M12 5v14M5 12h14"/>',
    1274,
    134,
    14,
    { color: 'color.text.on-brand', sw: 2 },
  );
  K.text(b, 'templates add label', 'Add template', 1292, 126, 108, {
    size: 10.5,
    weight: 'semibold',
    color: 'color.text.on-brand',
    h: 32,
    valign: 'center',
  });

  K.rect(b, 'templates list', 32, 190, 1376, 194, {
    fill: 'color.bg.surface',
    r: 8,
    stroke: 'color.border.default',
  });

  const ROWS = [
    ['Default', 'New projects copy this template', true],
    ['Animation', 'Open to edit its sections', false],
    ['Archive', 'Open to edit its sections', false],
  ];
  ROWS.forEach(([name, detail, isDefault], i) => {
    const y = 190 + i * 64;
    if (i > 0) K.rect(b, 'templates rule ' + i, 32, y, 1376, 1, {
      fill: 'color.border.subtle',
      r: 0,
    });
    K.rect(b, 'templates star ' + i, 48, y + 18, 28, 28, {
      fill: isDefault ? 'color.brand.subtle' : 'color.bg.raised',
      r: 6,
      stroke: isDefault ? 'color.brand.default' : 'color.border.subtle',
    });
    K.icon(
      b,
      'templates star icon ' + i,
      '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
      56,
      y + 25,
      14,
      { color: isDefault ? 'color.brand.text' : 'color.text.muted', sw: 1.6 },
    );
    K.text(b, 'templates name ' + i, name, 90, y + 10, 520, {
      size: 13,
      weight: 'medium',
      h: 20,
    });
    K.text(b, 'templates detail ' + i, detail, 90, y + 29, 620, {
      size: 10.5,
      color: 'color.text.muted',
      h: 18,
    });
    if (isDefault) {
      K.rect(b, 'templates default chip', 1230, y + 18, 84, 22, {
        fill: 'color.brand.subtle',
        r: 999,
        stroke: 'color.brand.default',
      });
      K.icon(
        b,
        'templates default check',
        '<path d="m5 12 4 4 10-10"/>',
        1238,
        y + 24,
        11,
        { color: 'color.brand.text', sw: 2 },
      );
      K.text(b, 'templates default label', 'Default', 1254, y + 18, 55, {
        size: 10,
        color: 'color.brand.text',
        h: 22,
        valign: 'center',
      });
    }
    K.icon(
      b,
      'templates delete ' + i,
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
      1334,
      y + 25,
      15,
      { color: 'color.text.secondary', sw: 1.6 },
    );
  });
}
function field(board, name, x, y, w, value, options = {}) {
  const h = options.h || 32;
  K.rect(board, 'field ' + name, x, y, w, h, {
    fill: 'color.bg.sunken',
    r: 6,
    stroke: 'color.border.default',
  });
  if (value) {
    K.text(board, 'field t ' + name, value, x + 12, y, w - 40, {
      size: options.size || 11.5,
      family: 'JetBrains Mono',
      color: options.color || 'color.text.primary',
      valign: 'center',
      h,
    });
  }
  if (options.chev) {
    K.icon(
      board,
      'field chev ' + name,
      '<path d="m6 9 6 6 6-6"/>',
      x + w - 22,
      y + h / 2 - 7,
      14,
      { color: 'color.text.muted', sw: 1.8 },
    );
  }
  return h;
}

function toggle(board, name, x, y, on) {
  K.rect(board, 'toggle ' + name, x, y, 34, 18, {
    fill: on ? 'color.brand.default' : 'color.bg.raised',
    r: 9,
    stroke: on ? null : 'color.border.strong',
  });
  K.rect(board, 'toggle knob ' + name, on ? x + 18 : x + 2, y + 2, 14, 14, {
    fill: on ? 'color.text.on-brand' : 'color.text.muted',
    r: 7,
  });
}

function buildEncoding() {
  replaceBoard(ENCODING);
  const b = K.board(null, ENCODING, 1504, 2636, W, 900);
  settingsChrome(b, W, [
    { label: 'Settings' },
    { label: 'Project Templates' },
    { label: 'Encoding', current: true },
  ]);

  K.text(
    b,
    'intro',
    'Chooses the encoder and the command-line parameters every scene is encoded with.',
    GUTTER,
    82,
    900,
    { size: 13, color: 'color.text.secondary', h: 22 },
  );

  // Encoder selection card. The worker policy is its own panel at the trailing
  // edge, because it is a policy for the build rather than a CLI argument.
  card(b, 'encoder', GUTTER, 123, W - GUTTER * 2, 284);
  K.text(b, 'encoder title', 'Encoder', GUTTER + 20, 139, 300, {
    size: 16,
    weight: 'semibold',
    h: 24,
  });
  K.text(
    b,
    'encoder sub',
    'The encoder a new project starts with. A project, a video, or an individual scene can choose another.',
    GUTTER + 20,
    165,
    900,
    { size: 11.5, color: 'color.text.muted', h: 18 },
  );
  K.rect(b, 'encoder rule', GUTTER, 200, W - GUTTER * 2, 1, {
    fill: 'color.border.subtle',
    r: 0,
  });

  K.text(b, 'encoder label', 'Encoder', GUTTER + 20, 282, 100, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  K.text(b, 'manage encoders', 'Manage encoders', GUTTER + 520, 282, 116, {
    size: 10,
    color: 'color.brand.text',
    h: 16,
  });
  field(b, 'encoder', GUTTER + 20, 302, 582, 'SVT-AV1', { h: 36, chev: true });

  K.text(b, 'passes label', GUTTER + 614, 284, 60, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'passes', GUTTER + 614, 307, 104, '1');

  K.text(b, 'workers panel label', 762, 215, 614, {
    size: 10.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 16,
  });
  K.rect(b, 'workers seg', 762, 236, 145, 29, {
    fill: null,
    r: 6,
    stroke: 'color.border.default',
  });
  K.rect(b, 'workers seg auto', 762, 236, 72, 29, {
    fill: 'color.bg.raised',
    r: 5,
    stroke: 'color.border.strong',
  });
  K.text(b, 'workers auto t', 'Auto', 762, 236, 72, {
    size: 10,
    color: 'color.text.primary',
    align: 'center',
    valign: 'center',
    h: 29,
  });
  K.text(b, 'workers manual t', 'Manual', 834, 236, 73, {
    size: 10,
    color: 'color.text.secondary',
    align: 'center',
    valign: 'center',
    h: 29,
  });
  K.text(b, 'workers label', 'Workers', 762, 285, 160, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'workers', 762, 307, 160, '2');

  K.text(
    b,
    'encoder path',
    'C:\\Tools\\Encoders\\SvtAv1EncApp.exe · SVT-AV1-Essential v4.0.1 (release)',
    GUTTER + 20,
    345,
    446,
    { size: 9.5, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 },
  );
  K.rect(b, 'available badge', GUTTER + 474, 343, 67, 18, {
    fill: 'color.state.success-bg',
    r: 9,
    stroke: 'color.state.success',
  });
  K.text(b, 'available t', 'AVAILABLE', GUTTER + 474, 343, 67, {
    size: 8.5,
    family: 'JetBrains Mono',
    weight: 'medium',
    color: 'color.state.success',
    align: 'center',
    valign: 'center',
    h: 18,
  });
  K.text(b, 'encoder foot', 'Builds from Settings → Encoders appear in the same list.', GUTTER + 20, 371, 500, {
    size: 10,
    color: 'color.text.muted',
    h: 16,
  });

  // Encoder settings: toggles first, then the ISO/resolution pair. The card is
  // taller than the viewport, so the board clips it at 900 like the app does.
  card(b, 'encoder settings', GUTTER, 421, W - GUTTER * 2, 519);
  K.text(b, 'settings title', 'Encoder settings', GUTTER + 20, 437, 320, {
    size: 16,
    weight: 'semibold',
    h: 24,
  });
  K.text(
    b,
    'settings sub',
    'Options that are not CLI parameters. They belong to this encoder selection, not to every scene.',
    GUTTER + 20,
    463,
    900,
    { size: 11.5, color: 'color.text.muted', h: 18 },
  );
  K.rect(b, 'settings rule', GUTTER, 499, W - GUTTER * 2, 1, {
    fill: 'color.border.subtle',
    r: 0,
  });

  toggle(b, 'colour', GUTTER + 20, 509, true);
  K.text(b, 'colour title', 'Append colour data', GUTTER + 66, 513, 300, {
    size: 11.5,
    weight: 'medium',
    h: 18,
  });
  K.text(
    b,
    'colour note',
    "Passes the source's colour metadata to the encoder. Turning it off changes how a player interprets the output.",
    GUTTER + 66,
    534,
    334,
    { size: 10.5, color: 'color.text.muted', h: 34 },
  );

  toggle(b, 'photon', GUTTER + 20, 592, true);
  K.text(b, 'photon title', 'Photon noise', GUTTER + 66, 596, 100, {
    size: 11.5,
    weight: 'medium',
    h: 18,
  });
  K.rect(b, 'photon badge', GUTTER + 145, 598, 52, 18, {
    fill: null,
    r: 4,
    stroke: 'color.border.default',
  });
  K.text(b, 'photon badge t', 'SVT-AV1', GUTTER + 145, 598, 52, {
    size: 8.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'center',
    valign: 'center',
    h: 18,
  });
  K.text(
    b,
    'photon note',
    'Synthesises film grain at encode time, so grain survives at a lower bitrate. Noise scaling writes a per-scene ISO; this value covers the scenes it leaves unchanged.',
    GUTTER + 68,
    619,
    377,
    { size: 10.5, color: 'color.text.muted', h: 34 },
  );

  const labelW = 658;
  K.text(b, 'iso label', 'ISO', GUTTER + 20, 669, labelW, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'iso', GUTTER + 20, 686, labelW, '200');
  K.text(b, 'chroma iso label', 'Chroma ISO', 718, 669, labelW, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'chroma iso', 718, 686, labelW, 'From ISO', { color: 'color.text.muted' });

  K.text(b, 'width label', 'Width', GUTTER + 20, 734, labelW, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'width', GUTTER + 20, 751, labelW, 'Source', { color: 'color.text.muted' });
  K.text(b, 'height label', 'Height', 718, 734, labelW, {
    size: 9.5,
    weight: 'medium',
    color: 'color.text.secondary',
    h: 14,
  });
  field(b, 'height', 718, 751, labelW, 'Source', { color: 'color.text.muted' });

  K.rect(b, 'custom coefficients', GUTTER + 20, 798, 119, 36, {
    fill: 'color.bg.raised',
    r: 6,
    stroke: 'color.border.strong',
  });
  K.text(b, 'custom coefficients t', 'Custom coefficients', GUTTER + 20, 798, 119, {
    size: 11,
    weight: 'medium',
    color: 'color.text.secondary',
    align: 'center',
    valign: 'center',
    h: 36,
  });
  K.text(b, 'custom coefficients note', 'Every plane follows the ISO', GUTTER + 152, 809, 180, {
    size: 10.5,
    color: 'color.text.muted',
    h: 16,
  });

  K.text(b, 'filter label', 'FFmpeg filter', GUTTER + 20, 866, 120, {
    size: 11,
    weight: 'medium',
    color: 'color.text.primary',
    h: 18,
  });
  K.text(
    b,
    'filter note',
    'Optional · runs before every scene',
    W - GUTTER - 20 - 200,
    866,
    200,
    { size: 10, color: 'color.text.muted', align: 'right', h: 18 },
  );
}

buildOverview();
buildEncoding();
K.organize(page);
return {
  boards: [OVERVIEW, ENCODING],
  overview: page.findShapes({ type: 'board' }).find((b) => b.name === OVERVIEW)?.children.length,
  encoding: page.findShapes({ type: 'board' }).find((b) => b.name === ENCODING)?.children.length,
};
