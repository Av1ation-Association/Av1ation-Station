// Website — demo shell, desktop and narrow.
//
// The demo is the real app Home inside a browser frame, not a separate mock.
// The browser frame is the only chrome added by the website; the app board is
// nested so the 56px app chrome and its content keep their real geometry.
// Fixture copy makes the data provenance explicit on the page, not in a tooltip.

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

  const projectRow = (parent, x, y, w, index, name, path, size, count, selected) => {
    K.rect(parent, 'demo / project row ' + index, x, y, w, 72, {
      fill: selected ? 'color.bg.raised' : 'color.bg.surface',
      r: 6,
      stroke: selected ? 'color.border.strong' : 'color.border.subtle',
    });
    if (selected) {
      K.rect(parent, 'demo / project selected ' + index, x, y + 12, 2, 48, {
        fill: 'color.brand.default',
        r: 1,
      });
    }
    K.text(parent, 'demo / project name ' + index, name, x + 16, y + 10, w - 260, {
      size: 14,
      weight: 'medium',
      h: 22,
    });
    K.icon(parent, 'demo / project folder ' + index, K.siteIcons.folder, x + 16, y + 36, 13, {
      color: 'color.text.muted',
      sw: 1.8,
    });
    K.text(parent, 'demo / project path ' + index, path, x + 36, y + 34, w - 280, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 16,
    });
    K.text(parent, 'demo / project size ' + index, size, x + w - 164, y + 12, 104, {
      size: 11.5,
      family: 'JetBrains Mono',
      color: 'color.text.secondary',
      align: 'right',
      h: 18,
    });
    K.text(parent, 'demo / project count ' + index, count, x + w - 164, y + 34, 104, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 14,
    });
    K.icon(parent, 'demo / project delete ' + index, K.siteIcons.trash, x + w - 34, y + 26, 16, {
      color: 'color.text.muted',
      sw: 1.8,
    });
  };

  const appHome = (frame, width, height, narrow) => {
    const app = K.board(frame, 'Website / Demo / App', 0, narrow ? 36 : 40, width, height, {
      bg: 'color.bg.base',
    });
    K.chrome(app, width, [{ label: 'Projects', current: true }], {
      margin: narrow ? 16 : 24,
      actions: narrow ? ['search'] : ['search', 'command', 'gear'],
    });

    if (narrow) {
      K.text(app, 'demo app / title', 'Projects', 16, 74, 300, {
        size: 20,
        weight: 'semibold',
        h: 26,
      });
      K.text(app, 'demo app / sub', '12 projects  ·  4.2 TB retained', 16, 102, 400, {
        size: 10,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        h: 14,
      });
      K.siteButton(app, 'demo app / new', 'New', 628, 74, 76, 32, { size: 11.5 });

      K.rect(app, 'demo app / search', 16, 132, 320, 32, {
        fill: 'color.bg.surface',
        r: 6,
        stroke: 'color.border.default',
      });
      K.icon(app, 'demo app / search icon', K.siteIcons.search, 28, 141, 14, {
        color: 'color.text.muted',
        sw: 2,
      });
      K.text(app, 'demo app / search placeholder', 'Search projects', 48, 132, 250, {
        size: 10.5,
        color: 'color.text.muted',
        valign: 'center',
        h: 32,
      });
      K.rect(app, 'demo app / filter', 348, 132, 64, 32, {
        fill: 'color.bg.surface',
        r: 6,
        stroke: 'color.border.default',
      });
      K.text(app, 'demo app / filter label', 'All', 348, 132, 64, {
        size: 10.5,
        color: 'color.text.secondary',
        align: 'center',
        valign: 'center',
        h: 32,
      });
      projectRow(app, 16, 184, 688, 0, 'Sintel', 'P:\\Av1ation\\Sintel', '47.9 GB', '12 videos', false);
      projectRow(app, 16, 264, 688, 1, 'Tears of Steel', 'P:\\Av1ation\\Tears', '18.2 GB', '6 videos', true);
      projectRow(app, 16, 344, 688, 2, 'Big Buck Bunny', 'P:\\Av1ation\\Bunny', '9.6 GB', '3 videos', false);
      projectRow(app, 16, 424, 688, 3, 'Cosmos Laundromat', 'P:\\Av1ation\\Cosmos', '31.4 GB', '9 videos', false);
      K.text(app, 'demo app / shown', 'Showing 4 of 12', 16, 520, 300, {
        size: 9.5,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        h: 14,
      });
      K.rect(app, 'demo app / drop zone', 16, 548, 688, 56, {
        fill: null,
        r: 6,
        stroke: 'color.border.strong',
        strokeStyle: 'dashed',
      });
      K.text(app, 'demo app / drop plus', '+', 28, 548, 20, {
        size: 16,
        color: 'color.brand.text',
        valign: 'center',
        h: 56,
      });
      K.text(app, 'demo app / drop label', 'Drop videos here to add them', 54, 548, 420, {
        size: 10.5,
        color: 'color.text.muted',
        valign: 'center',
        h: 56,
      });
      K.rect(app, 'demo app / status', 0, height - 32, width, 32, { fill: 'color.bg.surface' });
      rule(app, 'demo app / status edge', 0, height - 32, width, 'color.border.default');
      K.text(app, 'demo app / status left', 'Fixture data  ·  demo transport', 16, height - 32, 340, {
        size: 8.5,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        valign: 'center',
        h: 32,
      });
      K.text(app, 'demo app / status right', 'v0.1.0', width - 76, height - 32, 60, {
        size: 8.5,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        align: 'right',
        valign: 'center',
        h: 32,
      });
      return app;
    }

    K.text(app, 'demo app / title', 'Projects', 32, 82, 300, {
      size: 24,
      weight: 'semibold',
      h: 32,
    });
    K.text(app, 'demo app / sub', '12 projects  ·  4.2 TB retained', 32, 116, 420, {
      size: 10,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 14,
    });
    K.siteButton(app, 'demo app / new', 'New project', 1036, 82, 132, 36, { size: 12 });

    K.rect(app, 'demo app / search', 32, 148, 320, 36, {
      fill: 'color.bg.surface',
      r: 6,
      stroke: 'color.border.default',
    });
    K.icon(app, 'demo app / search icon', K.siteIcons.search, 44, 159, 14, {
      color: 'color.text.muted',
      sw: 2,
    });
    K.text(app, 'demo app / search placeholder', 'Search projects', 64, 148, 250, {
      size: 11,
      color: 'color.text.muted',
      valign: 'center',
      h: 36,
    });
    K.rect(app, 'demo app / filter', 364, 148, 112, 36, {
      fill: 'color.bg.surface',
      r: 6,
      stroke: 'color.border.default',
    });
    K.text(app, 'demo app / filter label', 'All projects', 364, 148, 112, {
      size: 11,
      color: 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: 36,
    });
    K.rect(app, 'demo app / sort', 488, 148, 124, 36, {
      fill: 'color.bg.surface',
      r: 6,
      stroke: 'color.border.default',
    });
    K.text(app, 'demo app / sort label', 'Last opened', 488, 148, 108, {
      size: 11,
      color: 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: 36,
    });
    K.icon(app, 'demo app / sort chevron', K.siteIcons.chevron, 586, 159, 12, {
      color: 'color.text.muted',
      sw: 2,
    });

    projectRow(app, 32, 200, 1136, 0, 'Sintel', 'P:\\Av1ation\\Sintel', '47.9 GB', '12 videos', false);
    projectRow(app, 32, 280, 1136, 1, 'Tears of Steel', 'P:\\Av1ation\\Tears', '18.2 GB', '6 videos', true);
    projectRow(app, 32, 360, 1136, 2, 'Big Buck Bunny', 'P:\\Av1ation\\Bunny', '9.6 GB', '3 videos', false);
    projectRow(app, 32, 440, 1136, 3, 'Cosmos Laundromat', 'P:\\Av1ation\\Cosmos', '31.4 GB', '9 videos', false);
    K.text(app, 'demo app / shown', 'Showing 4 of 12 projects', 32, 536, 360, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 14,
    });
    K.text(app, 'demo app / drop hint', 'Drop videos anywhere to add them to the queue.', 32, 560, 420, {
      size: 10,
      color: 'color.text.muted',
      h: 14,
    });

    K.rect(app, 'demo app / status', 0, height - 32, width, 32, { fill: 'color.bg.surface' });
    rule(app, 'demo app / status edge', 0, height - 32, width, 'color.border.default');
    K.text(app, 'demo app / status left', 'Fixture data  ·  demo transport  ·  nothing is written', 24, height - 32, 520, {
      size: 8.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      valign: 'center',
      h: 32,
    });
    K.text(app, 'demo app / status right', 'v0.1.0', width - 80, height - 32, 56, {
      size: 8.5,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      valign: 'center',
      h: 32,
    });
    return app;
  };

  const browser = (parent, x, y, w, h, narrow) => {
    K.rect(parent, 'demo / browser shadow', x + 8, y + 10, w, h, {
      fill: 'color.bg.sunken',
      r: 12,
    });
    const frame = K.board(parent, 'Website / Demo / Browser', x, y, w, h, {
      bg: 'color.bg.surface',
      clip: true,
    });
    frame.strokes = [{
      strokeColor: K.color('color.border.strong'),
      strokeWidth: 1,
      strokeAlignment: 'inner',
      strokeStyle: 'solid',
    }];
    const barH = narrow ? 36 : 40;
    K.rect(frame, 'demo / browser bar', 0, 0, w, barH, { fill: 'color.bg.raised', r: 12 });
    K.rect(frame, 'demo / browser bar square', 0, 26, w, 14, { fill: 'color.bg.raised' });
    [0, 1, 2].forEach((i) =>
      K.rect(frame, 'demo / browser dot ' + i, (narrow ? 12 : 16) + i * (narrow ? 14 : 16), narrow ? 14 : 16, 7, 7, {
        fill: i === 2 ? 'color.state.success' : 'color.border.strong',
        r: 3.5,
      }),
    );
    K.rect(frame, 'demo / url', narrow ? 72 : 90, narrow ? 8 : 10, narrow ? 400 : 480, 20, {
      fill: 'color.bg.sunken',
      r: 10,
    });
    K.icon(frame, 'demo / url lock', K.siteIcons.lock, narrow ? 82 : 100, narrow ? 12 : 14, 11, {
      color: 'color.text.muted',
      sw: 1.8,
    });
    K.text(
      frame,
      'demo / url text',
      'demo.av1ation.station/projects',
      narrow ? 100 : 118,
      narrow ? 8 : 10,
      narrow ? 330 : 390,
      { size: 9, family: 'JetBrains Mono', color: 'color.text.secondary', valign: 'center', h: 20 },
    );
    K.rect(frame, 'demo / fixtures chip', w - (narrow ? 124 : 116), narrow ? 8 : 10, 64, 20, {
      fill: 'color.brand.subtle',
      r: 10,
    });
    K.text(frame, 'demo / fixtures label', 'FIXTURES', w - (narrow ? 124 : 116), narrow ? 8 : 10, 64, {
      size: 7.5,
      family: 'JetBrains Mono',
      color: 'color.brand.text',
      align: 'center',
      valign: 'center',
      h: 20,
    });
    K.icon(frame, 'demo / external', K.siteIcons.external, w - 40, narrow ? 10 : 12, 16, {
      color: 'color.text.muted',
      sw: 1.8,
    });
    rule(frame, 'demo / browser edge', 0, barH, w, 'color.border.default');
    appHome(frame, w, h - barH, narrow);
    return frame;
  };

  // ---------------------------------------------------------------- desktop

  const demo = fresh('Website / Demo', 0, 4252, 1440, 1040);
  K.siteHeader(demo, 1440, 'Demo');
  K.rect(demo, 'demo / banner', 0, 72, 1440, 48, { fill: 'color.brand.subtle' });
  K.icon(demo, 'demo / banner icon', K.siteIcons.info, 120, 89, 14, {
    color: 'color.brand.text',
    sw: 1.9,
  });
  K.text(demo, 'demo / banner text', 'Demo mode  ·  fixture projects, no media is read or encoded.', 142, 72, 700, {
    size: 11.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 48,
  });
  K.text(demo, 'demo / banner link', 'How the demo works  →', 1160, 72, 160, {
    size: 11,
    color: 'color.text.link',
    align: 'right',
    valign: 'center',
    h: 48,
  });
  rule(demo, 'demo / banner edge', 0, 119, 1440, 'color.border.default');

  K.text(demo, 'demo / eyebrow', 'DEMO', 120, 154, 200, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.brand.text',
    h: 14,
  });
  K.text(demo, 'demo / h1', 'The real interface, with sample data.', 120, 176, 760, {
    size: 28,
    weight: 'semibold',
    h: 38,
  });
  body(
    demo,
    'demo / intro',
    'Click through the project list, open a project, and inspect the pipeline. The demo transport returns fixtures; nothing touches your disk.',
    120,
    220,
    760,
    { size: 12.5, lh: 1.55 },
  );
  K.siteButton(demo, 'demo / reset', 'Reset demo', 1184, 176, 136, 36, {
    tone: 'secondary',
    icon: 'rotate',
    size: 11.5,
  });

  browser(demo, 120, 280, 1200, 720, false);
  K.text(demo, 'demo / note', 'Same façade, same components, fixture transport. No media leaves this page.', 120, 1014, 720, {
    size: 9.5,
    color: 'color.text.muted',
    h: 14,
  });
  K.text(demo, 'demo / note right', 'Static build  ·  no backend', 1120, 1014, 200, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'right',
    h: 14,
  });

  // ----------------------------------------------------------------- narrow

  const narrow = fresh('Website / Demo / Narrow', 1504, 4252, 768, 1040);
  K.siteHeader(narrow, 768, 'Demo');
  K.rect(narrow, 'demo narrow / banner', 0, 64, 768, 48, { fill: 'color.brand.subtle' });
  K.icon(narrow, 'demo narrow / banner icon', K.siteIcons.info, 24, 81, 14, {
    color: 'color.brand.text',
    sw: 1.9,
  });
  K.text(narrow, 'demo narrow / banner text', 'Demo mode  ·  fixture data only.', 46, 64, 480, {
    size: 10.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 48,
  });
  rule(narrow, 'demo narrow / banner edge', 0, 111, 768, 'color.border.default');

  K.text(narrow, 'demo narrow / eyebrow', 'DEMO', 24, 138, 120, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.brand.text',
    h: 12,
  });
  K.text(narrow, 'demo narrow / h1', 'The real interface,\nwith sample data.', 24, 158, 600, {
    size: 24,
    weight: 'semibold',
    lh: 1.15,
    h: 58,
  });
  body(
    narrow,
    'demo narrow / intro',
    'Click through the project list, open a project, and inspect the pipeline. Nothing touches your disk.',
    24,
    216,
    560,
    { size: 11.5, lh: 1.55 },
  );
  K.siteButton(narrow, 'demo narrow / reset', 'Reset', 628, 158, 116, 34, {
    tone: 'secondary',
    icon: 'rotate',
    size: 11,
  });

  browser(narrow, 24, 284, 720, 720, true);
  K.text(narrow, 'demo narrow / note', 'Same façade, same components, fixture transport.', 24, 1018, 720, {
    size: 9,
    color: 'color.text.muted',
    h: 14,
  });

  K.organize(page);
  return { boards: ['Website / Demo', 'Website / Demo / Narrow'] };
})();
