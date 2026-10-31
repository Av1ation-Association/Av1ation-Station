// Website — documentation index and article, desktop and narrow.
//
// Run after kit.js on the `11 Website` page. The index and article share one
// 280px docs sidebar, which is deliberately separate from the app's 232px
// section rail: documentation navigation is a reading aid, not a pipeline.
// The article's code block is the only literal TOML on the boards; everything
// else is explanation.

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

  const body = (parent, name, value, x, y, w, options = {}) => {
    const size = options.size || 13;
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

  const crumbs = (parent, items, x, y) => {
    let cx = x;
    items.forEach((item, i) => {
      const w = Math.max(20, Math.round(item.length * 6.2) + 2);
      K.text(parent, 'docs / crumb ' + i, item, cx, y, w, {
        size: 11,
        color: i === items.length - 1 ? 'color.text.primary' : 'color.text.muted',
        weight: i === items.length - 1 ? 'medium' : 'regular',
        h: 16,
      });
      cx += w;
      if (i < items.length - 1) {
        K.text(parent, 'docs / crumb sep ' + i, '/', cx + 4, y, 10, {
          size: 11,
          color: 'color.border.strong',
          h: 16,
        });
        cx += 16;
      }
    });
  };

  const sideGroups = [
    ['START', ['Overview', 'Installation', 'First project']],
    ['CONCEPTS', ['Pipeline', 'Derived state', 'Chunks']],
    [
      'CONFIGURATION',
      [
        'General',
        'Scene detection',
        'Noise generation',
        'Target quality',
        'Encoding',
        'Concatenation',
        'Quality check',
      ],
    ],
    ['REFERENCE', ['Encoder parameters', 'Input filters', 'CLI keys']],
    ['HELP', ['Troubleshooting', 'Diagnostics']],
  ];

  function docsSidebar(parent, height, active) {
    const w = 280;
    K.rect(parent, 'docs / sidebar', 0, 72, w, height - 72, { fill: 'color.bg.surface' });
    K.line(parent, 'docs / sidebar edge', w - 1, 72, 1, { color: 'color.border.default', h: height - 72 });

    K.rect(parent, 'docs / search', 24, 104, 232, 36, {
      fill: 'color.bg.raised',
      r: 6,
      stroke: 'color.border.default',
    });
    K.icon(parent, 'docs / search icon', K.siteIcons.search, 36, 115, 14, {
      color: 'color.text.muted',
      sw: 2,
    });
    K.text(parent, 'docs / search placeholder', 'Search documentation', 58, 104, 150, {
      size: 11,
      color: 'color.text.muted',
      valign: 'center',
      h: 36,
    });
    K.rect(parent, 'docs / search key', 214, 113, 34, 18, {
      fill: 'color.bg.overlay',
      r: 4,
      stroke: 'color.border.strong',
    });
    K.text(parent, 'docs / search key label', '⌘K', 214, 113, 34, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'center',
      valign: 'center',
      h: 18,
    });

    K.text(parent, 'docs / sidebar label', 'DOCUMENTATION', 24, 158, 200, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 14,
    });

    let y = 182;
    sideGroups.forEach((group, gi) => {
      K.text(parent, 'docs / group ' + gi, group[0], 24, y, 220, {
        size: 8.5,
        family: 'JetBrains Mono',
        weight: 'medium',
        color: 'color.text.muted',
        h: 14,
      });
      y += 18;
      group[1].forEach((item, ii) => {
        const on = item === active;
        if (on) {
          K.rect(parent, 'docs / nav active ' + gi + '-' + ii, 14, y - 2, 252, 26, {
            fill: 'color.bg.raised',
            r: 4,
          });
          K.rect(parent, 'docs / nav pip ' + gi + '-' + ii, 14, y + 4, 2, 15, {
            fill: 'color.brand.default',
            r: 1,
          });
        }
        K.text(parent, 'docs / nav ' + gi + '-' + ii, item, 28, y, 230, {
          size: 11.5,
          color: on ? 'color.text.primary' : 'color.text.secondary',
          weight: on ? 'medium' : 'regular',
          h: 22,
        });
        y += 26;
      });
      y += 8;
    });

    const bottom = height - 72;
    K.line(parent, 'docs / sidebar bottom rule', 24, bottom - 70, 232, { color: 'color.border.subtle' });
    K.text(parent, 'docs / sidebar version', 'v0.1.0', 24, bottom - 54, 80, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 14,
    });
    K.text(parent, 'docs / sidebar license', 'GPL-3.0', 176, bottom - 54, 80, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 14,
    });
  }

  function docsFooter(parent, width, y, margin) {
    const contentW = width - margin * 2;
    rule(parent, 'docs / footer rule', margin, y, contentW, 'color.border.default');
    K.text(parent, 'docs / footer left', 'Av1ation Station  ·  Documentation', margin, y + 18, 320, {
      size: 10,
      color: 'color.text.muted',
      h: 16,
    });
    K.text(parent, 'docs / footer right', 'Edit this page  ·  GPL-3.0', margin + contentW - 220, y + 18, 220, {
      size: 10,
      color: 'color.text.muted',
      align: 'right',
      h: 16,
    });
  }

  const searchField = (parent, x, y, w, h) => {
    K.rect(parent, 'docs / main search', x, y, w, h, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: 'color.border.strong',
    });
    K.icon(parent, 'docs / main search icon', K.siteIcons.search, x + 16, y + (h - 18) / 2, 18, {
      color: 'color.text.muted',
      sw: 2,
    });
    K.text(parent, 'docs / main search placeholder', 'Search documentation, parameters, filters…', x + 46, y, w - 120, {
      size: 13,
      color: 'color.text.muted',
      valign: 'center',
      h,
    });
    K.rect(parent, 'docs / main search key', x + w - 56, y + (h - 22) / 2, 38, 22, {
      fill: 'color.bg.raised',
      r: 4,
      stroke: 'color.border.default',
    });
    K.text(parent, 'docs / main search key label', '⌘K', x + w - 56, y + (h - 22) / 2, 38, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'center',
      valign: 'center',
      h: 22,
    });
  };

  function startCard(parent, x, y, w, h, icon, title, copy, index) {
    const compact = h <= 80;
    K.rect(parent, 'docs / start card ' + index, x, y, w, h, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: 'color.border.default',
    });
    K.rect(parent, 'docs / start icon box ' + index, x + (compact ? 14 : 16), y + (compact ? 14 : 16), compact ? 26 : 32, compact ? 26 : 32, {
      fill: 'color.bg.raised',
      r: compact ? 6 : 7,
      stroke: 'color.border.default',
    });
    K.icon(parent, 'docs / start icon ' + index, K.siteIcons[icon], x + (compact ? 20 : 24), y + (compact ? 20 : 24), compact ? 14 : 16, {
      color: 'color.brand.text',
      sw: 1.9,
    });
    K.text(parent, 'docs / start title ' + index, title, x + (compact ? 50 : 58), y + (compact ? 10 : 16), w - (compact ? 86 : 76), {
      size: compact ? 12.5 : 13.5,
      weight: 'semibold',
      h: 22,
    });
    body(parent, 'docs / start copy ' + index, copy, x + (compact ? 50 : 16), y + (compact ? 34 : 56), w - (compact ? 90 : 32), {
      size: compact ? 10.5 : 11,
      lh: 1.5,
      color: 'color.text.secondary',
      h: compact ? 24 : undefined,
    });
    K.text(parent, 'docs / start arrow ' + index, '→', x + w - 30, y + (compact ? 24 : h - 28), 18, {
      size: 13,
      color: 'color.text.muted',
      align: 'right',
      h: 18,
    });
  }

  function referenceCard(parent, x, y, w, h, icon, title, copy, index) {
    K.rect(parent, 'docs / ref card ' + index, x, y, w, h, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: 'color.border.default',
    });
    K.icon(parent, 'docs / ref icon ' + index, K.siteIcons[icon], x + 16, y + 18, 16, {
      color: 'color.brand.text',
      sw: 1.9,
    });
    K.text(parent, 'docs / ref title ' + index, title, x + 42, y + 14, w - 58, {
      size: 12.5,
      weight: 'medium',
      h: 20,
    });
    body(parent, 'docs / ref copy ' + index, copy, x + 16, y + 42, w - 32, {
      size: 10.5,
      lh: 1.5,
      color: 'color.text.muted',
    });
  }

  function configRow(parent, x, y, w, index, title, copy) {
    K.text(parent, 'docs / config number ' + index, index, x, y + 2, 22, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 16,
    });
    K.text(parent, 'docs / config title ' + index, title, x + 28, y, 130, {
      size: 12,
      color: 'color.text.primary',
      h: 18,
    });
    K.text(parent, 'docs / config copy ' + index, copy, x + 150, y + 1, w - 150, {
      size: 10.5,
      color: 'color.text.muted',
      h: 16,
    });
    rule(parent, 'docs / config rule ' + index, x, y + 34, w, 'color.border.subtle');
  }

  function optionCard(parent, x, y, w, h, icon, title, badge, copy, active, index) {
    K.rect(parent, 'docs / option ' + index, x, y, w, h, {
      fill: 'color.bg.surface',
      r: 8,
      stroke: active ? 'color.brand.default' : 'color.border.default',
      sw: active ? 1.5 : 1,
    });
    K.rect(parent, 'docs / option icon box ' + index, x + 16, y + 16, 30, 30, {
      fill: active ? 'color.brand.subtle' : 'color.bg.raised',
      r: 6,
    });
    K.icon(parent, 'docs / option icon ' + index, K.siteIcons[icon], x + 24, y + 24, 14, {
      color: active ? 'color.brand.text' : 'color.text.secondary',
      sw: 1.9,
    });
    K.text(parent, 'docs / option title ' + index, title, x + 54, y + 14, 180, {
      size: 14,
      weight: 'semibold',
      h: 22,
    });
    const badgeW = Math.max(52, badge.length * 5.4 + 16);
    K.rect(parent, 'docs / option badge ' + index, x + w - badgeW - 16, y + 16, badgeW, 18, {
      fill: active ? 'color.brand.subtle' : 'color.bg.raised',
      r: 9,
    });
    K.text(parent, 'docs / option badge text ' + index, badge, x + w - badgeW - 16, y + 16, badgeW, {
      size: 8,
      family: 'JetBrains Mono',
      color: active ? 'color.brand.text' : 'color.text.muted',
      align: 'center',
      valign: 'center',
      h: 18,
    });
    body(parent, 'docs / option copy ' + index, copy, x + 16, y + 54, w - 32, {
      size: 11,
      lh: 1.5,
      color: 'color.text.secondary',
    });
    const widths = active ? [30, 22, 26, 34, 24, 30, 28, 36] : [24, 30, 20, 34, 26, 32, 24, 28];
    let bx = x + 16;
    widths.forEach((bw, j) => {
      K.rect(parent, 'docs / option strip ' + index + '-' + j, bx, y + h - 22, bw - 2, 8, {
        fill: j === 3 ? 'color.brand.default' : 'color.bg.active',
        r: 2,
      });
      bx += bw;
    });
  }

  function callout(parent, x, y, w, copy) {
    K.rect(parent, 'docs / callout', x, y, w, 62, {
      fill: 'color.bg.raised',
      r: 6,
      stroke: 'color.border.default',
    });
    K.rect(parent, 'docs / callout bar', x, y, 3, 62, { fill: 'color.brand.default', r: 1 });
    K.icon(parent, 'docs / callout icon', K.siteIcons.info, x + 16, y + 16, 16, {
      color: 'color.brand.text',
      sw: 1.9,
    });
    body(parent, 'docs / callout copy', copy, x + 44, y + 12, w - 60, {
      size: 11.5,
      lh: 1.55,
      color: 'color.text.secondary',
    });
  }

  function codeBlock(parent, x, y, w, h) {
    K.rect(parent, 'docs / code', x, y, w, h, {
      fill: 'color.bg.sunken',
      r: 6,
      stroke: 'color.border.default',
    });
    K.text(parent, 'docs / code lang', 'CONDOR.JSON', x + 14, y + 10, 90, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 12,
    });
    K.icon(parent, 'docs / code copy', K.siteIcons.copy, x + w - 30, y + 10, 14, {
      color: 'color.text.muted',
      sw: 1.7,
    });
    K.text(
      parent,
      'docs / code body',
      '"scene_detector": {\n  "method": { "TransNetV2": { "minimum_length": 24, "maximum_length": 480 } },\n  "input": null\n}',
      x + 14,
      y + 32,
      w - 28,
      { size: 10, family: 'JetBrains Mono', lh: 1.7, color: 'color.text.secondary', h: h - 42 },
    );
  }

  // ------------------------------------------------------------- docs index

  const index = fresh('Website / Docs', 0, 1784, 1440, 1120);
  K.siteHeader(index, 1440, 'Docs');
  docsSidebar(index, 1120, 'Overview');

  crumbs(index, ['Docs', 'Overview'], 344, 108);
  K.text(index, 'docs / index h1', 'Documentation', 344, 138, 760, {
    size: 38,
    weight: 'semibold',
    h: 46,
  });
  body(
    index,
    'docs / index sub',
    'Everything the application does, and the engine concepts behind it. Start with installation, then follow the pipeline from input to concatenation.',
    344,
    192,
    760,
    { size: 14.5, lh: 1.6, color: 'color.text.secondary' },
  );
  searchField(index, 344, 256, 480, 44);

  K.text(index, 'docs / start heading', 'Start here', 344, 330, 400, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  startCard(index, 344, 364, 304, 140, 'download', 'Installation', 'Windows, VapourSynth, encoders and FFmpeg. Know what each dependency unlocks.', '0');
  startCard(index, 680, 364, 304, 140, 'folder', 'Your first project', 'Create a project, add videos to the queue, then run the pipeline on a fixture clip.', '1');
  startCard(index, 1016, 364, 304, 140, 'layers', 'Pipeline', 'How the eleven sequences fit together, and which ones are optional.', '2');

  K.text(index, 'docs / config heading', 'Configuration', 344, 540, 460, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  body(index, 'docs / config sub', 'Seven sections in pipeline order, covering the engine’s eleven sequences.', 344, 570, 640, {
    size: 11.5,
    color: 'color.text.muted',
  });
  const rows = [
    ['01', 'General', 'Input, output and shared project settings.'],
    ['02', 'Scene detection', 'Cut points and the scenes every later stage reads.'],
    ['03', 'Noise generation', 'Measure and scale noise before quality probes.'],
    ['04', 'Target quality', 'Score scenes and pick a quantizer per scene.'],
    ['05', 'Encoding', 'Workers, encoder parameters and parallel encoding.'],
    ['06', 'Concatenation', 'Mux audio and subtitles from the input.'],
    ['07', 'Quality check', 'Compare encoded chunks against the source.'],
  ];
  rows.slice(0, 4).forEach((r, i) => configRow(index, 344, 604 + i * 42, 468, r[0], r[1], r[2]));
  rows.slice(4).forEach((r, i) => configRow(index, 852, 604 + i * 42, 468, r[0], r[1], r[2]));

  K.text(index, 'docs / ref heading', 'Reference', 344, 802, 400, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  referenceCard(index, 344, 834, 304, 100, 'copy', 'Encoder parameters', 'Generated from the selected encoder’s own CLI definition.', '0');
  referenceCard(index, 680, 834, 304, 100, 'scan', 'Input filters', 'VapourSynth filters, parameters and constraints.', '1');
  referenceCard(index, 1016, 834, 304, 100, 'info', 'Troubleshooting', 'Preflight inventory, diagnostics and logs.', '2');

  K.rect(index, 'docs / index help', 344, 962, 976, 52, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(index, 'docs / index help text', 'Can’t find something? Start with the CLI keys or run a diagnostic.', 360, 962, 700, {
    size: 11.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 52,
  });
  K.text(index, 'docs / index help link', 'Open diagnostics  →', 1160, 962, 144, {
    size: 11,
    weight: 'medium',
    color: 'color.text.link',
    align: 'right',
    valign: 'center',
    h: 52,
  });
  docsFooter(index, 1440, 1048, 344);

  // ------------------------------------------------------- docs index narrow

  const indexNarrow = fresh('Website / Docs / Narrow', 1504, 1784, 768, 1120);
  K.siteHeader(indexNarrow, 768, 'Docs');
  crumbs(indexNarrow, ['Docs', 'Overview'], 24, 88);
  K.text(indexNarrow, 'docs narrow / h1', 'Documentation', 24, 112, 620, {
    size: 30,
    weight: 'semibold',
    h: 38,
  });
  body(
    indexNarrow,
    'docs narrow / sub',
    'Everything the application does, and the engine concepts behind it. Start with installation, then follow the pipeline.',
    24,
    156,
    680,
    { size: 13, lh: 1.6 },
  );
  searchField(indexNarrow, 24, 218, 720, 42);

  K.text(indexNarrow, 'docs narrow / start heading', 'Start here', 24, 286, 300, {
    size: 16,
    weight: 'semibold',
    h: 22,
  });
  startCard(indexNarrow, 24, 314, 720, 70, 'download', 'Installation', 'Windows, VapourSynth, encoders and FFmpeg.', '0');
  startCard(indexNarrow, 24, 392, 720, 70, 'folder', 'Your first project', 'Create a project, add videos, run the pipeline.', '1');
  startCard(indexNarrow, 24, 470, 720, 70, 'layers', 'Pipeline', 'How the eleven sequences fit together.', '2');

  K.text(indexNarrow, 'docs narrow / config heading', 'Configuration', 24, 572, 400, {
    size: 16,
    weight: 'semibold',
    h: 22,
  });
  rows.forEach((r, i) => configRow(indexNarrow, 24, 604 + i * 36, 720, r[0], r[1], r[2]));

  K.text(indexNarrow, 'docs narrow / ref heading', 'Reference', 24, 902, 300, {
    size: 16,
    weight: 'semibold',
    h: 22,
  });
  referenceCard(indexNarrow, 24, 930, 352, 64, 'copy', 'Encoder parameters', 'Generated from the CLI.', '0');
  referenceCard(indexNarrow, 392, 930, 352, 64, 'info', 'Troubleshooting', 'Diagnostics and logs.', '1');
  docsFooter(indexNarrow, 768, 1044, 24);

  // ----------------------------------------------------------- docs article

  const article = fresh('Website / Docs / Article', 0, 2968, 1440, 1220);
  K.siteHeader(article, 1440, 'Docs');
  docsSidebar(article, 1220, 'Scene detection');

  crumbs(article, ['Docs', 'Configuration', 'Scene detection'], 344, 108);
  K.text(article, 'docs article / h1', 'Scene detection', 344, 136, 700, {
    size: 34,
    weight: 'semibold',
    h: 42,
  });
  body(
    article,
    'docs article / intro',
    'Scene detection splits the input into the ranges every later sequence reads. It is a sequence, not a setting: run it once, inspect the scenes, then move on.',
    344,
    188,
    760,
    { size: 14, lh: 1.62 },
  );
  K.text(article, 'docs article / meta', 'Updated October 2026  ·  6 min read', 344, 250, 400, {
    size: 10,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 16,
  });
  callout(
    article,
    344,
    280,
    760,
    'The detector reads the General input by default. Override it here if you want a faster, downscaled decode just for scene detection.',
  );

  K.text(article, 'docs article / h2 detector', 'Choose a detector', 344, 370, 500, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  optionCard(
    article,
    344,
    402,
    368,
    142,
    'scan',
    'AVSceneChange',
    'Default',
    'Fast, no model. Good for hard cuts and most live-action footage.',
    true,
    '0',
  );
  optionCard(
    article,
    736,
    402,
    368,
    142,
    'layers',
    'TransNetV2',
    'Neural',
    'ONNX model. Better on soft cuts and animation, slower to run.',
    false,
    '1',
  );

  K.text(article, 'docs article / h2 input', 'Input override', 344, 578, 500, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  body(
    article,
    'docs article / input copy',
    'A detector only needs enough detail to find cuts. A 540p VapourSynth input is usually enough and can be several times faster than decoding the full source.',
    344,
    612,
    760,
    { size: 12.5, lh: 1.6 },
  );
  codeBlock(article, 344, 670, 760, 120);

  K.text(article, 'docs article / h2 stores', 'What the engine stores', 344, 820, 500, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  K.rect(article, 'docs article / table', 344, 854, 760, 150, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.rect(article, 'docs article / table head', 344, 854, 760, 30, {
    fill: 'color.bg.raised',
    r: 6,
  });
  K.text(article, 'docs article / table field head', 'FIELD', 360, 854, 200, {
    size: 8,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: 30,
  });
  K.text(article, 'docs article / table meaning head', 'WHAT IT MEANS', 560, 854, 400, {
    size: 8,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: 30,
  });
  const tableRows = [
    ['method', 'Detector key: AVSceneChange or TransNetV2.'],
    ['scenes[*].start_frame', 'First frame of the scene, inclusive.'],
    ['scenes[*].end_frame', 'Last frame of the scene, exclusive.'],
  ];
  tableRows.forEach((r, i) => {
    const ry = 884 + i * 38;
    K.text(article, 'docs article / table field ' + i, r[0], 360, ry, 190, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.secondary',
      valign: 'center',
      h: 38,
    });
    K.text(article, 'docs article / table meaning ' + i, r[1], 560, ry, 520, {
      size: 10.5,
      color: 'color.text.secondary',
      valign: 'center',
      h: 38,
    });
    if (i < 2) rule(article, 'docs article / table rule ' + i, 360, ry + 38, 728, 'color.border.subtle');
  });

  K.text(article, 'docs article / h2 next', 'Next', 344, 1034, 300, {
    size: 18,
    weight: 'semibold',
    h: 24,
  });
  K.rect(article, 'docs article / next prev', 344, 1068, 368, 48, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(article, 'docs article / next prev label', '←  Target quality', 360, 1068, 320, {
    size: 12,
    color: 'color.text.secondary',
    valign: 'center',
    h: 48,
  });
  K.rect(article, 'docs article / next next', 736, 1068, 368, 48, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(article, 'docs article / next next label', 'Encoding  →', 752, 1068, 320, {
    size: 12,
    color: 'color.text.secondary',
    align: 'right',
    valign: 'center',
    h: 48,
  });
  docsFooter(article, 1440, 1148, 344);

  // Table of contents
  K.text(article, 'docs article / toc label', 'ON THIS PAGE', 1136, 112, 184, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  const toc = ['Choose a detector', 'Input override', 'What the engine stores', 'Next'];
  toc.forEach((item, i) => {
    const y = 140 + i * 28;
    if (i === 0) {
      K.rect(article, 'docs article / toc pip', 1136, y + 2, 2, 16, {
        fill: 'color.brand.default',
        r: 1,
      });
    }
    K.text(article, 'docs article / toc ' + i, item, 1148, y, 176, {
      size: 11,
      color: i === 0 ? 'color.text.primary' : 'color.text.secondary',
      weight: i === 0 ? 'medium' : 'regular',
      h: 20,
    });
  });
  K.rect(article, 'docs article / helpful', 1136, 280, 184, 92, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(article, 'docs article / helpful title', 'Was this page helpful?', 1148, 292, 160, {
    size: 10.5,
    color: 'color.text.secondary',
    h: 16,
  });
  ['Yes', 'No'].forEach((label, i) => {
    K.rect(article, 'docs article / helpful ' + i, 1148 + i * 52, 322, 44, 28, {
      fill: 'color.bg.raised',
      r: 4,
      stroke: 'color.border.default',
    });
    K.text(article, 'docs article / helpful label ' + i, label, 1148 + i * 52, 322, 44, {
      size: 10,
      color: 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: 28,
    });
  });

  // ---------------------------------------------------- docs article narrow

  const articleNarrow = fresh('Website / Docs / Article / Narrow', 1504, 2968, 768, 1220);
  K.siteHeader(articleNarrow, 768, 'Docs');
  crumbs(articleNarrow, ['Docs', 'Configuration', 'Scene detection'], 24, 88);
  K.text(articleNarrow, 'docs article narrow / h1', 'Scene detection', 24, 112, 680, {
    size: 30,
    weight: 'semibold',
    h: 38,
  });
  body(
    articleNarrow,
    'docs article narrow / intro',
    'Scene detection splits the input into the ranges every later sequence reads. It is a sequence, not a setting.',
    24,
    158,
    680,
    { size: 12.5, lh: 1.6 },
  );
  K.text(articleNarrow, 'docs article narrow / meta', 'Updated Oct 2026  ·  6 min', 24, 228, 400, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 14,
  });
  callout(
    articleNarrow,
    24,
    252,
    720,
    'The detector reads the General input by default. Override it here for a faster, downscaled decode.',
  );

  K.text(articleNarrow, 'docs article narrow / h2 detector', 'Choose a detector', 24, 346, 500, {
    size: 17,
    weight: 'semibold',
    h: 22,
  });
  optionCard(articleNarrow, 24, 378, 720, 112, 'scan', 'AVSceneChange', 'Default', 'Fast, no model. Good for hard cuts and most live-action footage.', true, '0');
  optionCard(articleNarrow, 24, 500, 720, 112, 'layers', 'TransNetV2', 'Neural', 'ONNX model. Better on soft cuts and animation, slower to run.', false, '1');

  K.text(articleNarrow, 'docs article narrow / h2 input', 'Input override', 24, 634, 500, {
    size: 17,
    weight: 'semibold',
    h: 22,
  });
  body(
    articleNarrow,
    'docs article narrow / input copy',
    'A detector only needs enough detail to find cuts. A 540p VapourSynth input is usually enough.',
    24,
    668,
    720,
    { size: 12, lh: 1.6 },
  );
  codeBlock(articleNarrow, 24, 724, 720, 132);

  K.text(articleNarrow, 'docs article narrow / h2 stores', 'What the engine stores', 24, 888, 500, {
    size: 17,
    weight: 'semibold',
    h: 22,
  });
  K.rect(articleNarrow, 'docs article narrow / table', 24, 920, 720, 136, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.rect(articleNarrow, 'docs article narrow / table head', 24, 920, 720, 28, {
    fill: 'color.bg.raised',
    r: 6,
  });
  K.text(articleNarrow, 'docs article narrow / table field head', 'FIELD', 38, 920, 190, {
    size: 8,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: 28,
  });
  K.text(articleNarrow, 'docs article narrow / table meaning head', 'WHAT IT MEANS', 238, 920, 400, {
    size: 8,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: 28,
  });
  tableRows.forEach((r, i) => {
    const ry = 948 + i * 36;
    K.text(articleNarrow, 'docs article narrow / table field ' + i, r[0], 38, ry, 190, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.secondary',
      valign: 'center',
      h: 36,
    });
    K.text(articleNarrow, 'docs article narrow / table meaning ' + i, r[1], 238, ry, 490, {
      size: 10,
      color: 'color.text.secondary',
      valign: 'center',
      h: 36,
    });
    if (i < 2) rule(articleNarrow, 'docs article narrow / table rule ' + i, 38, ry + 36, 692, 'color.border.subtle');
  });

  K.text(articleNarrow, 'docs article narrow / next heading', 'Next', 24, 1074, 200, {
    size: 17,
    weight: 'semibold',
    h: 22,
  });
  K.rect(articleNarrow, 'docs article narrow / next card', 24, 1106, 720, 44, {
    fill: 'color.bg.surface',
    r: 6,
    stroke: 'color.border.default',
  });
  K.text(articleNarrow, 'docs article narrow / next label', 'Target quality  →', 40, 1106, 680, {
    size: 11.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 44,
  });
  docsFooter(articleNarrow, 768, 1168, 24);

  K.organize(page);
  return {
    boards: [
      'Website / Docs',
      'Website / Docs / Narrow',
      'Website / Docs / Article',
      'Website / Docs / Article / Narrow',
    ],
  };
})();
