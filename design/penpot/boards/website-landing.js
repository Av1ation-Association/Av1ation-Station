// Website — landing page and its narrow state.
//
// Run after kit.js. The page is `11 Website`; boards are placed row-major with
// 64px gutters so the narrow state sits beside the desktop board it mirrors.
// Marketing boards use the same semantic tokens as the app. The steel ramp is
// deliberately absent: it is a structural finish in the product, not brand
// texture for a landing page.

(() => {
  const page = penpot.currentPage;
  if (!page || page.name !== '11 Website') {
    throw new Error('Open the 11 Website page before running this board set.');
  }
  const K = storage.K;
  if (!K || !K.siteHeader) throw new Error('Inject kit.js first.');

  const fresh = (name, x, y, w, h) => {
    page.findShapes({ type: 'board' })
      .filter((b) => b.name === name)
      .forEach((b) => b.remove());
    return K.board(null, name, x, y, w, h);
  };

  const eyebrow = (parent, value, x, y, options = {}) =>
    K.text(parent, 'landing / eyebrow ' + value, value, x, y, options.w || 360, {
      size: options.size || 10,
      family: 'JetBrains Mono',
      weight: 'medium',
      color: options.color || 'color.brand.text',
      h: 16,
    });

  const body = (parent, name, value, x, y, w, options = {}) => {
    const size = options.size || 13.5;
    const lh = options.lh || 1.6;
    const cpl = Math.max(18, Math.floor(w / (size * 0.52)));
    const explicit = String(value).split('\n');
    const lines = explicit.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / cpl)), 0);
    const h = options.h || Math.ceil(lines * size * lh + 4);
    K.text(parent, name, value, x, y, w, {
      size,
      lh,
      color: options.color || 'color.text.secondary',
      h,
      weight: options.weight,
    });
    return h;
  };

  const rule = (parent, name, x, y, w, color = 'color.border.subtle') =>
    K.line(parent, name, x, y, w, { color });

  const grid = (parent, x, y, w, h, cols, rows) => {
    for (let i = 0; i <= cols; i++) {
      K.line(parent, 'landing / grid v ' + i, x + (w / cols) * i, y, 1, {
        color: 'color.border.subtle',
        h,
      });
    }
    for (let i = 0; i <= rows; i++) {
      K.line(parent, 'landing / grid h ' + i, x, y + (h / rows) * i, w, {
        color: 'color.border.subtle',
      });
    }
  };

  // ---------------------------------------------------------------- desktop

  const board = fresh('Website / Landing', 0, 0, 1440, 1720);
  K.siteHeader(board, 1440, 'Product');

  // Hero band
  K.rect(board, 'landing / hero band', 0, 72, 1440, 648, { fill: 'color.bg.sunken' });
  grid(board, 120, 72, 1200, 648, 6, 4);

  K.rect(board, 'landing / eyebrow dot', 120, 143, 6, 6, { fill: 'color.brand.default', r: 3 });
  eyebrow(board, 'OPEN SOURCE  ·  WINDOWS  ·  GPL-3.0', 134, 138);

  K.text(board, 'landing / h1', 'Encode with the\nwhole picture.', 120, 172, 640, {
    size: 56,
    weight: 'semibold',
    lh: 1.08,
    h: 126,
  });

  body(
    board,
    'landing / subhead',
    'A desktop workspace for Av1an. Scene detection, quality targets and parallel encoding become a pipeline you can see — not a wall of flags.',
    120,
    316,
    560,
    { size: 15.5, lh: 1.62, color: 'color.text.secondary' },
  );

  K.siteButton(board, 'landing / primary cta', 'Download for Windows', 120, 424, 214, 44, {
    icon: 'download',
    size: 13,
  });
  K.siteButton(board, 'landing / demo cta', 'Try the demo', 350, 424, 150, 44, {
    tone: 'secondary',
    icon: 'play',
    size: 13,
  });
  K.text(board, 'landing / docs cta', 'Read the docs  →', 120, 484, 180, {
    size: 12,
    weight: 'medium',
    color: 'color.text.link',
    h: 18,
  });
  K.text(
    board,
    'landing / meta',
    'Windows 10/11  ·  VapourSynth R70+  ·  an encoder executable',
    120,
    508,
    520,
    { size: 10.5, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 },
  );

  // Product window in the hero. It is a deliberately simplified app fragment:
  // scene timeline, scene rows and a target-quality readout. It communicates the
  // product without becoming a second, competing UI board.
  const wx = 760;
  const wy = 140;
  K.rect(board, 'landing / window shadow', wx + 10, wy + 12, 560, 430, {
    fill: 'color.bg.sunken',
    r: 14,
  });
  K.rect(board, 'landing / window', wx, wy, 560, 430, {
    fill: 'color.bg.surface',
    r: 12,
    stroke: 'color.border.default',
  });
  K.rect(board, 'landing / window bar', wx, wy, 560, 40, { fill: 'color.bg.raised', r: 12 });
  K.rect(board, 'landing / window bar square', wx, wy + 30, 560, 10, { fill: 'color.bg.raised' });
  rule(board, 'landing / window bar edge', wx, wy + 40, 560, 'color.border.default');
  [0, 1, 2].forEach((i) =>
    K.rect(board, 'landing / dot ' + i, wx + 16 + i * 14, wy + 16, 8, 8, {
      fill: i === 2 ? 'color.state.success' : 'color.border.strong',
      r: 4,
    }),
  );
  K.text(board, 'landing / window title', 'Sintel  ·  Scene detection', wx + 66, wy, 300, {
    size: 11,
    color: 'color.text.secondary',
    valign: 'center',
    h: 40,
  });
  K.rect(board, 'landing / live chip', wx + 470, wy + 10, 58, 20, {
    fill: 'color.brand.subtle',
    r: 10,
  });
  K.text(board, 'landing / live label', 'LIVE', wx + 470, wy + 10, 58, {
    size: 8,
    family: 'JetBrains Mono',
    weight: 'medium',
    color: 'color.brand.text',
    align: 'center',
    valign: 'center',
    h: 20,
  });

  // Preview strip
  K.rect(board, 'landing / preview', wx + 16, wy + 56, 528, 154, {
    fill: 'color.bg.sunken',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(board, 'landing / preview label', 'SINTEL  ·  2048 × 858', wx + 32, wy + 70, 220, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  [0, 1, 2].forEach((i) => {
    K.rect(board, 'landing / thumb ' + i, wx + 32 + i * 168, wy + 92, 152, 74, {
      fill: 'color.bg.raised',
      r: 3,
      stroke: i === 1 ? 'color.brand.default' : 'color.border.default',
    });
    K.rect(board, 'landing / thumb fill ' + i, wx + 40 + i * 168, wy + 100, 136, 58, {
      fill: 'color.bg.active',
      r: 2,
    });
  });
  K.text(board, 'landing / preview time', '00:12:08:14', wx + 32, wy + 178, 160, {
    size: 10,
    family: 'JetBrains Mono',
    color: 'color.text.secondary',
    h: 16,
  });
  K.text(board, 'landing / preview scenes', '428 scenes  ·  42:18', wx + 376, wy + 178, 152, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'right',
    h: 16,
  });

  // Scene timeline
  K.rect(board, 'landing / timeline track', wx + 16, wy + 224, 528, 6, {
    fill: 'color.bg.raised',
    r: 3,
  });
  const widths = [22, 30, 18, 26, 34, 20, 24, 40, 16, 30, 22, 34, 26, 28, 18, 30];
  let tx = wx + 16;
  widths.forEach((w, i) => {
    K.rect(board, 'landing / timeline block ' + i, tx, wy + 224, w - 2, 6, {
      fill: i >= 5 && i <= 7 ? 'color.brand.default' : 'color.border.strong',
      r: 2,
    });
    tx += w;
  });

  // Scene rows
  const rows = [
    ['05', '00:00:41.208 – 00:00:52.417', 'Scored', 'color.state.success'],
    ['06', '00:00:52.417 – 01:00.000', 'Scored', 'color.state.success'],
    ['07', '00:01:00.000 – 01:18.750', 'Encoding', 'color.brand.default'],
  ];
  rows.forEach((r, i) => {
    const ry = wy + 248 + i * 42;
    K.rect(board, 'landing / scene row ' + i, wx + 16, ry, 528, 34, {
      fill: i === 2 ? 'color.bg.raised' : null,
      r: 4,
    });
    K.text(board, 'landing / scene index ' + i, r[0], wx + 28, ry, 28, {
      size: 10,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      valign: 'center',
      h: 34,
    });
    K.text(board, 'landing / scene range ' + i, r[1], wx + 62, ry, 300, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.secondary',
      valign: 'center',
      h: 34,
    });
    K.rect(board, 'landing / scene pip ' + i, wx + 400, ry + 14, 6, 6, { fill: r[3], r: 3 });
    K.text(board, 'landing / scene status ' + i, r[2], wx + 412, ry, 90, {
      size: 9,
      color: r[3],
      valign: 'center',
      h: 34,
    });
  });

  // Floating target-quality card
  K.rect(board, 'landing / target card', 1080, 590, 220, 80, {
    fill: 'color.bg.overlay',
    r: 8,
    stroke: 'color.border.strong',
  });
  K.text(board, 'landing / target label', 'TARGET QUALITY', 1096, 604, 160, {
    size: 8.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  K.text(board, 'landing / target value', 'VMAF 95.2', 1096, 620, 160, {
    size: 16,
    weight: 'semibold',
    h: 24,
  });
  K.rect(board, 'landing / target track', 1096, 650, 180, 4, { fill: 'color.bg.active', r: 2 });
  K.rect(board, 'landing / target fill', 1096, 650, 162, 4, { fill: 'color.brand.default', r: 2 });

  // Stats band
  rule(board, 'landing / stats top', 0, 720, 1440, 'color.border.default');
  const stats = [
    ['11', 'pipeline stages, one screen'],
    ['3', 'preview frame sources'],
    ['1', 'encode at a time, enforced in Rust'],
  ];
  stats.forEach((s, i) => {
    const x = 120 + i * 400;
    K.text(board, 'landing / stat value ' + i, s[0], x, 744, 70, {
      size: 24,
      family: 'JetBrains Mono',
      weight: 'medium',
      color: 'color.brand.text',
      h: 34,
    });
    K.text(board, 'landing / stat label ' + i, s[1], x + 54, 748, 280, {
      size: 11.5,
      color: 'color.text.secondary',
      h: 28,
    });
    if (i < 2) rule(board, 'landing / stat sep ' + i, x + 360, 744, 1, 'color.border.default');
  });

  // Features
  eyebrow(board, 'THE PIPELINE', 120, 848);
  K.text(board, 'landing / features h2', 'See every stage. Change only what matters.', 120, 872, 900, {
    size: 30,
    weight: 'semibold',
    lh: 1.18,
    h: 42,
  });
  body(
    board,
    'landing / features sub',
    'Each stage is a sequence in the engine. The UI shows what is configured and what the engine has actually produced, so the two cannot drift.',
    120,
    922,
    760,
    { size: 13.5 },
  );

  const cards = [
    {
      key: 'Detect',
      icon: 'scan',
      index: '01',
      body: 'Scene detection with AVSceneChange or TransNetV2. The ranges come from the engine, not a side table.',
      schematic: 'scenes',
    },
    {
      key: 'Target',
      icon: 'target',
      index: '02',
      body: 'Score scenes against VMAF, SSIMULACRA2, BUTTERAUGLI or CVVDP. Probe only what needs a score.',
      schematic: 'scores',
    },
    {
      key: 'Encode',
      icon: 'layers',
      index: '03',
      body: 'Parallel encoding with retained chunks. Re-run one scene without starting the video over.',
      schematic: 'workers',
    },
  ];

  cards.forEach((card, i) => {
    const x = 120 + i * 408;
    const y = 976;
    K.rect(board, 'landing / card ' + i, x, y, 384, 292, {
      fill: 'color.bg.surface',
      r: 10,
      stroke: 'color.border.default',
    });
    K.rect(board, 'landing / card icon box ' + i, x + 24, y + 24, 40, 40, {
      fill: 'color.bg.raised',
      r: 8,
      stroke: 'color.border.default',
    });
    K.icon(board, 'landing / card icon ' + i, K.siteIcons[card.icon], x + 34, y + 34, 20, {
      color: 'color.brand.text',
      sw: 1.75,
    });
    K.text(board, 'landing / card index ' + i, card.index, x + 328, y + 32, 32, {
      size: 10,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 20,
    });
    K.text(board, 'landing / card title ' + i, card.key, x + 24, y + 82, 300, {
      size: 17,
      weight: 'semibold',
      h: 26,
    });
    body(board, 'landing / card body ' + i, card.body, x + 24, y + 114, 336, {
      size: 12.5,
      lh: 1.55,
      color: 'color.text.secondary',
    });
    rule(board, 'landing / card rule ' + i, x + 24, y + 196, 336);
    const sx = x + 24;
    const sy = y + 214;
    if (card.schematic === 'scenes') {
      const widths2 = [26, 34, 18, 40, 22, 30, 26, 38, 20, 34, 24, 28];
      let cx = sx;
      widths2.forEach((w, j) => {
        K.rect(board, 'landing / schematic scene ' + i + '-' + j, cx, sy + 18, w - 3, 36, {
          fill: j >= 3 && j <= 5 ? 'color.brand.default' : 'color.bg.active',
          r: 3,
        });
        cx += w;
      });
    } else if (card.schematic === 'scores') {
      const vals = [18, 34, 28, 46, 38, 52, 44];
      vals.forEach((v, j) => {
        K.rect(board, 'landing / schematic score ' + i + '-' + j, sx + j * 38, sy + 65 - v, 22, v, {
          fill: j === 5 ? 'color.brand.default' : 'color.bg.active',
          r: 3,
        });
      });
      rule(board, 'landing / schematic target line', sx, sy + 24, 280, 'color.state.success');
      K.text(board, 'landing / schematic target label', '95.2', sx + 284, sy + 16, 40, {
        size: 9,
        family: 'JetBrains Mono',
        color: 'color.state.success',
        h: 14,
      });
    } else {
      const vals = [34, 48, 40, 56, 30, 46];
      vals.forEach((v, j) => {
        K.rect(board, 'landing / schematic worker ' + i + '-' + j, sx + j * 26, sy + 64 - v, 18, v, {
          fill: j === 3 ? 'color.brand.default' : 'color.bg.active',
          r: 2,
        });
      });
      K.text(board, 'landing / schematic worker label', '16 / 16 workers', sx + 174, sy + 48, 130, {
        size: 9,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        h: 14,
      });
    }
  });

  // Local-tool band
  K.rect(board, 'landing / local band', 0, 1300, 1440, 280, { fill: 'color.bg.surface' });
  rule(board, 'landing / local top', 0, 1300, 1440, 'color.border.default');
  eyebrow(board, 'PRIVACY BY CONSTRUCTION', 120, 1328);
  K.text(board, 'landing / local h2', 'A local tool, not a service.', 120, 1352, 720, {
    size: 26,
    weight: 'semibold',
    h: 36,
  });
  body(
    board,
    'landing / local body',
    'There is no account, no telemetry and no upload. The desktop app talks to a loopback service; the engine runs in-process.',
    120,
    1396,
    580,
    { size: 13.5 },
  );
  const bullets = [
    'Projects are plain folders you can open and move.',
    'Encoded chunks are kept unless you opt in to deleting them.',
    'GPL-3.0, with the source available.',
  ];
  bullets.forEach((b, i) => {
    const by = 1464 + i * 30;
    K.icon(board, 'landing / bullet icon ' + i, K.siteIcons.check, 120, by + 2, 14, {
      color: 'color.state.success',
      sw: 2,
    });
    K.text(board, 'landing / bullet ' + i, b, 144, by, 560, {
      size: 12,
      color: 'color.text.secondary',
      h: 20,
    });
  });

  // Requirements card
  K.rect(board, 'landing / requirements', 840, 1336, 480, 232, {
    fill: 'color.bg.base',
    r: 10,
    stroke: 'color.border.default',
  });
  K.text(board, 'landing / requirements label', 'SYSTEM REQUIREMENTS', 864, 1356, 300, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  const reqs = [
    ['Windows 10 or 11', 'x64'],
    ['VapourSynth R70+', 'for scripts'],
    ['An encoder', 'aomenc, SVT-AV1, x264, x265'],
    ['FFmpeg', 'muxing paths only'],
  ];
  reqs.forEach((r, i) => {
    const ry = 1384 + i * 34;
    K.icon(board, 'landing / req icon ' + i, K.siteIcons.check, 864, ry + 3, 12, {
      color: 'color.brand.text',
      sw: 2.2,
    });
    K.text(board, 'landing / req ' + i, r[0], 884, ry, 220, {
      size: 11.5,
      color: 'color.text.primary',
      h: 20,
    });
    K.text(board, 'landing / req value ' + i, r[1], 1100, ry, 196, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 20,
    });
  });
  K.text(board, 'landing / req link', 'Read the installation guide  →', 864, 1526, 260, {
    size: 11,
    weight: 'medium',
    color: 'color.text.link',
    h: 18,
  });
  K.text(board, 'landing / req note', 'No GPU required. FFmpeg is only needed when muxing.', 864, 1548, 420, {
    size: 9.5,
    color: 'color.text.muted',
    h: 14,
  });

  K.siteFooter(board, 1440, 1580);

  // ----------------------------------------------------------------- narrow

  const narrow = fresh('Website / Landing / Narrow', 1504, 0, 768, 1720);
  K.siteHeader(narrow, 768, 'Product');

  K.rect(narrow, 'landing narrow / hero band', 0, 64, 768, 616, { fill: 'color.bg.sunken' });
  grid(narrow, 24, 64, 720, 616, 3, 3);

  K.rect(narrow, 'landing narrow / eyebrow dot', 24, 107, 6, 6, {
    fill: 'color.brand.default',
    r: 3,
  });
  eyebrow(narrow, 'OPEN SOURCE  ·  WINDOWS', 38, 102, { w: 400, size: 9.5 });

  K.text(narrow, 'landing narrow / h1', 'Encode with the\nwhole picture.', 24, 132, 680, {
    size: 40,
    weight: 'semibold',
    lh: 1.1,
    h: 96,
  });
  body(
    narrow,
    'landing narrow / subhead',
    'A desktop workspace for Av1an. Scene detection, quality targets and parallel encoding become a pipeline you can see.',
    24,
    246,
    620,
    { size: 14, lh: 1.6 },
  );

  K.siteButton(narrow, 'landing narrow / primary cta', 'Download for Windows', 24, 344, 220, 44, {
    icon: 'download',
    size: 12.5,
  });
  K.siteButton(narrow, 'landing narrow / demo cta', 'Try the demo', 256, 344, 142, 44, {
    tone: 'secondary',
    icon: 'play',
    size: 12.5,
  });
  K.text(narrow, 'landing narrow / docs cta', 'Read the docs  →', 24, 402, 180, {
    size: 12,
    weight: 'medium',
    color: 'color.text.link',
    h: 18,
  });
  K.text(
    narrow,
    'landing narrow / meta',
    'Windows 10/11  ·  VapourSynth R70+  ·  an encoder  ·  FFmpeg for muxing',
    24,
    426,
    640,
    { size: 9.5, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 },
  );

  // Narrow product window
  K.rect(narrow, 'landing narrow / window shadow', 32, 482, 712, 188, {
    fill: 'color.bg.sunken',
    r: 12,
  });
  K.rect(narrow, 'landing narrow / window', 24, 474, 712, 188, {
    fill: 'color.bg.surface',
    r: 10,
    stroke: 'color.border.default',
  });
  K.rect(narrow, 'landing narrow / window bar', 24, 474, 712, 30, {
    fill: 'color.bg.raised',
    r: 10,
  });
  K.rect(narrow, 'landing narrow / window bar square', 24, 494, 712, 10, {
    fill: 'color.bg.raised',
  });
  [0, 1, 2].forEach((i) =>
    K.rect(narrow, 'landing narrow / dot ' + i, 38 + i * 12, 485, 7, 7, {
      fill: i === 2 ? 'color.state.success' : 'color.border.strong',
      r: 3.5,
    }),
  );
  K.text(narrow, 'landing narrow / window title', 'Sintel  ·  Scene detection', 82, 474, 260, {
    size: 10,
    color: 'color.text.secondary',
    valign: 'center',
    h: 30,
  });
  K.rect(narrow, 'landing narrow / preview', 36, 514, 688, 92, {
    fill: 'color.bg.sunken',
    r: 5,
    stroke: 'color.border.default',
  });
  [0, 1, 2].forEach((i) => {
    K.rect(narrow, 'landing narrow / thumb ' + i, 48 + i * 222, 526, 210, 66, {
      fill: 'color.bg.raised',
      r: 3,
      stroke: i === 1 ? 'color.brand.default' : 'color.border.default',
    });
  });
  K.rect(narrow, 'landing narrow / timeline track', 36, 620, 688, 5, {
    fill: 'color.bg.raised',
    r: 3,
  });
  let ntx = 36;
  const nwidths = [32, 42, 24, 38, 30, 46, 28, 36, 22, 40, 32, 44, 30, 38, 26, 40, 28, 36, 30, 42];
  nwidths.forEach((w, i) => {
    K.rect(narrow, 'landing narrow / timeline block ' + i, ntx, 620, w - 2, 5, {
      fill: i >= 5 && i <= 7 ? 'color.brand.default' : 'color.border.strong',
      r: 2,
    });
    ntx += w;
  });
  K.text(narrow, 'landing narrow / scene count', '428 scenes  ·  00:42:18', 36, 634, 240, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  K.text(narrow, 'landing narrow / vmaf', 'VMAF 95.2', 560, 634, 164, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.brand.text',
    align: 'right',
    h: 14,
  });

  // Stats
  rule(narrow, 'landing narrow / stats top', 0, 680, 768, 'color.border.default');
  const nstats = [
    ['11', 'pipeline stages'],
    ['3', 'frame sources'],
    ['1', 'encode lock'],
  ];
  nstats.forEach((s, i) => {
    const x = 24 + i * 240;
    K.text(narrow, 'landing narrow / stat value ' + i, s[0], x, 718, 54, {
      size: 20,
      family: 'JetBrains Mono',
      weight: 'medium',
      color: 'color.brand.text',
      h: 26,
    });
    K.text(narrow, 'landing narrow / stat label ' + i, s[1], x + 44, 722, 170, {
      size: 10,
      color: 'color.text.secondary',
      h: 20,
    });
    if (i < 2) rule(narrow, 'landing narrow / stat sep ' + i, x + 218, 718, 1, 'color.border.default');
  });

  // Features
  eyebrow(narrow, 'THE PIPELINE', 24, 812, { size: 9.5 });
  K.text(narrow, 'landing narrow / features h2', 'See every stage.', 24, 832, 600, {
    size: 27,
    weight: 'semibold',
    h: 36,
  });
  body(
    narrow,
    'landing narrow / features sub',
    'Each stage is a sequence in the engine. The UI shows what is configured and what the engine produced.',
    24,
    876,
    640,
    { size: 12.5 },
  );

  cards.forEach((card, i) => {
    const y = 934 + i * 136;
    K.rect(narrow, 'landing narrow / card ' + i, 24, y, 720, 124, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: 'color.border.default',
    });
    K.rect(narrow, 'landing narrow / card icon box ' + i, 40, y + 18, 36, 36, {
      fill: 'color.bg.raised',
      r: 7,
      stroke: 'color.border.default',
    });
    K.icon(narrow, 'landing narrow / card icon ' + i, K.siteIcons[card.icon], 50, y + 28, 16, {
      color: 'color.brand.text',
      sw: 1.8,
    });
    K.text(narrow, 'landing narrow / card title ' + i, card.key, 90, y + 16, 300, {
      size: 15,
      weight: 'semibold',
      h: 22,
    });
    body(narrow, 'landing narrow / card body ' + i, card.body, 90, y + 42, 560, {
      size: 11.5,
      lh: 1.5,
      color: 'color.text.secondary',
    });
    K.text(narrow, 'landing narrow / card index ' + i, card.index, 680, y + 18, 40, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 16,
    });
  });

  // Local band
  rule(narrow, 'landing narrow / local top', 0, 1348, 768, 'color.border.default');
  K.rect(narrow, 'landing narrow / local band', 0, 1348, 768, 200, {
    fill: 'color.bg.surface',
  });
  eyebrow(narrow, 'LOCAL BY CONSTRUCTION', 24, 1368, { size: 9.5 });
  K.text(narrow, 'landing narrow / local h2', 'A local tool, not a service.', 24, 1388, 620, {
    size: 22,
    weight: 'semibold',
    h: 30,
  });
  body(
    narrow,
    'landing narrow / local body',
    'No account, no telemetry, no upload. The engine runs in-process.',
    24,
    1424,
    620,
    { size: 12.5 },
  );
  bullets.slice(0, 3).forEach((b, i) => {
    const by = 1472 + i * 24;
    K.icon(narrow, 'landing narrow / bullet icon ' + i, K.siteIcons.check, 24, by + 3, 12, {
      color: 'color.state.success',
      sw: 2.2,
    });
    K.text(narrow, 'landing narrow / bullet ' + i, b, 44, by, 620, {
      size: 11,
      color: 'color.text.secondary',
      h: 18,
    });
  });

  K.siteFooter(narrow, 768, 1548, { h: 168 });

  K.organize(page);
  return { boards: ['Website / Landing', 'Website / Landing / Narrow'] };
})();
