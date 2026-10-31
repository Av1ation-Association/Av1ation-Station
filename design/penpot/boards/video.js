// Video surface: Configuration tab, Scenes tab, the source menu, and the Empty /
// Loading / Error / Narrow / Wide states.
//
// Run after design/penpot/kit.js. Every board is idempotent by name.
//
// The Scenes tab is one <video> element. Its source is switched in place across
// the Original decode, the Decode produced by the Encoding input (only when that
// input is overridden), and the retained Encode. It is never two players side by
// side, and the source list is a transport popover, not a third column.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '06 Video');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const BOARD_NAMES = [
  'Video / Configuration',
  'Video / Scenes',
  'Video / Source menu',
  'Video / Scene encoder',
  'Video / Logs',
  'Video / Empty',
  'Video / Loading',
  'Video / Error',
  'Video / Narrow',
  'Video / Wide',
];
// A full redraw is heavy enough to push the Penpot tab into Chrome's discard
// threshold, so the set can be rendered one board at a time:
//   storage.videoOnly = 'scenes';  // then re-run this file
const ONLY = storage.videoOnly || null;
const RETIRED = ['Video / Populated'];
const TARGETS = ONLY
  ? BOARD_NAMES.filter((name) => name.toLowerCase().replace(/[^a-z]/g, '').includes(ONLY))
  : BOARD_NAMES.concat(RETIRED);
for (const name of TARGETS) {
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === name);
  if (old) old.remove();
}

const crumbs = (...parts) => parts.map((label, i) => ({ label, current: i === parts.length - 1 }));
const tw = (s, size) => Math.round(String(s).length * size * 0.56);

const ICONS = {
  play: '<path d="m6 3 14 9-14 9V3Z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  back: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 6"/>',
  prev: '<path d="M18 6 8 12l10 6V6Z"/><path d="M6 4v16"/>',
  next: '<path d="m6 6 10 6-10 6V6Z"/><path d="M18 4v16"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  full: '<path d="M3 9V5a2 2 0 0 1 2-2h4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/><path d="M9 21H5a2 2 0 0 1-2-2v-4"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.2 3.9A2 2 0 0 0 7.5 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  film: '<rect width="20" height="20" x="2" y="2" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  split: '<path d="M12 3v6M12 15v6"/><circle cx="6" cy="9" r="3"/><circle cx="18" cy="9" r="3"/><path d="M9 9h6"/>',
  merge: '<path d="M8 3 4 7l4 4"/><path d="M4 7h9a5 5 0 0 1 5 5v9"/>',
  reset: '<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 6"/>',
  logs: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

function helpers(b) {
  const card = (name, x, y, w, h, opts = {}) =>
    K.rect(b, name, x, y, w, h, {
      fill: opts.fill || 'color.bg.surface',
      r: opts.r == null ? 10 : opts.r,
      stroke: opts.stroke === null ? null : opts.stroke || 'color.border.subtle',
      sw: opts.sw,
    });
  const head = (value, x, y, w, opts = {}) =>
    K.text(b, 'h ' + value + x, value, x, y, w || 400, {
      size: opts.size || 15,
      weight: opts.weight || 'semibold',
      color: opts.color || 'color.text.primary',
      h: opts.h || 24,
    });
  const sub = (value, x, y, w, h) =>
    K.text(b, 'sub ' + x + y, value, x, y, w, {
      size: 11.5,
      color: 'color.text.secondary',
      h: h || 18,
      lh: 1.45,
    });
  const note = (value, x, y, w, h) =>
    K.text(b, 'note ' + x + y, value, x, y, w, {
      size: 10,
      color: 'color.text.muted',
      h: h || 16,
      lh: 1.5,
    });
  const label = (value, x, y, w) =>
    K.text(b, 'l ' + value + x, value, x, y, w || 200, {
      size: 9.5,
      weight: 'medium',
      color: 'color.text.secondary',
      h: 14,
    });
  const box = (x, y, w, value, opts = {}) => {
    const h = opts.h || 32;
    K.rect(b, 'box ' + x + y, x, y, w, h, {
      fill: opts.fill || 'color.bg.sunken',
      stroke: opts.stroke || 'color.border.default',
      r: 5,
    });
    K.text(b, 'box v ' + x + y, value, x + 10, y, w - 32, {
      size: opts.size || 11,
      color: opts.color || 'color.text.primary',
      family: opts.mono === false ? 'Inter' : 'JetBrains Mono',
      valign: 'center',
      h,
    });
    if (opts.chev) K.icon(b, 'box c ' + x + y, ICONS.down, x + w - 22, y + h / 2 - 7, 14, { color: 'color.text.muted' });
    return h;
  };
  const seg = (x, y, items, selected, opts = {}) => {
    const h = opts.h || 30;
    let cx = x;
    items.forEach((item, i) => {
      const w = opts.w || Math.max(68, tw(item, 11) + 22);
      const on = i === selected;
      K.rect(b, 'seg ' + x + y + i, cx, y, w, h, {
        fill: on ? 'color.bg.raised' : 'color.bg.sunken',
        r: 4,
        stroke: on ? 'color.border.strong' : 'color.border.default',
      });
      K.text(b, 'seg t ' + x + y + i, item, cx, y, w, {
        size: opts.size || 11,
        weight: on ? 'semibold' : 'regular',
        color: on ? 'color.text.primary' : 'color.text.secondary',
        align: 'center',
        valign: 'center',
        h,
      });
      cx += w + 4;
    });
    return cx - x - 4;
  };
  const radio = (x, y, on) => {
    K.rect(b, 'radio ' + x + y, x, y, 14, 14, {
      fill: on ? 'color.brand.default' : null,
      stroke: on ? 'color.brand.default' : 'color.border.strong',
      r: 7,
    });
    if (on) K.rect(b, 'radio dot ' + x + y, x + 4, y + 4, 6, 6, { fill: 'color.text.on-brand', r: 3 });
  };
  const toneMap = {
    neutral: ['color.state.neutral-bg', 'color.state.neutral'],
    success: ['color.state.success-bg', 'color.state.success'],
    warning: ['color.state.warning-bg', 'color.state.warning'],
    danger: ['color.state.danger-bg', 'color.state.danger'],
    info: ['color.state.info-bg', 'color.state.info'],
    brand: ['color.bg.raised', 'color.border.strong'],
  };
  const chip = (x, y, value, tone, opts = {}) => {
    const [bg, fg] = toneMap[tone || 'neutral'];
    const size = opts.size || 10;
    const w = opts.w || tw(value, size) + 20;
    const h = opts.h || 22;
    K.rect(b, 'chip ' + x + y + value, x, y, w, h, { fill: bg, r: 999, stroke: fg });
    K.text(b, 'chip t ' + x + y + value, value, x + 10, y, w - 16, {
      size,
      color: fg,
      weight: opts.weight || 'regular',
      valign: 'center',
      h,
    });
    return w;
  };
  const dot = (x, y, tone) => {
    const c = { success: 'color.state.success', warning: 'color.state.warning', danger: 'color.state.danger', info: 'color.state.info', neutral: 'color.state.neutral' }[tone || 'neutral'];
    K.rect(b, 'dot ' + x + y, x, y, 6, 6, { fill: c, r: 3 });
  };
  const divider = (x, y, w, color) => K.line(b, 'div ' + x + y, x, y, w, { color: color || 'color.border.subtle' });
  const btn = (x, y, value, opts = {}) => {
    const h = opts.h || 30;
    const w = opts.w || tw(value, 11) + 26;
    K.rect(b, 'btn ' + x + y + value, x, y, w, h, {
      fill: opts.primary ? 'color.brand.default' : opts.ghost ? null : 'color.bg.raised',
      r: 5,
      stroke: opts.primary ? null : opts.ghost ? null : 'color.border.default',
    });
    if (opts.icon) {
      K.icon(b, 'btn i ' + x + y + value, ICONS[opts.icon], x + 10, y + h / 2 - 7, 14, {
        color: opts.primary ? 'color.text.on-brand' : opts.color || 'color.text.secondary',
      });
    }
    const ix = opts.icon ? 30 : 0;
    K.text(b, 'btn t ' + x + y + value, value, x + ix, y, w - ix, {
      size: 11,
      weight: opts.primary ? 'semibold' : 'regular',
      color: opts.primary ? 'color.text.on-brand' : opts.color || 'color.text.secondary',
      align: opts.icon ? 'left' : 'center',
      valign: 'center',
      h,
    });
    return w;
  };
  const link = (x, y, value, opts = {}) =>
    K.text(b, 'link ' + x + y + value, value, x, y, opts.w || 150, {
      size: 11,
      color: opts.color || 'color.brand.text',
      align: opts.right ? 'right' : 'left',
      h: 18,
    });
  const badge = (x, y, value, tone) => {
    const [bg, fg] = toneMap[tone || 'neutral'];
    const w = tw(value, 9) + 14;
    K.rect(b, 'badge ' + x + y + value, x, y, w, 18, { fill: bg, r: 3, stroke: fg });
    K.text(b, 'badge t ' + x + y + value, value, x + 7, y, w - 10, {
      size: 9,
      weight: 'medium',
      color: fg,
      valign: 'center',
      h: 18,
    });
    return w;
  };
  const sk = (x, y, w, h, opts = {}) =>
    K.rect(b, 'skeleton ' + x + y + w, x, y, w, h, {
      fill: opts.fill || 'color.bg.raised',
      op: opts.op == null ? 0.55 : opts.op,
      r: opts.r == null ? 4 : opts.r,
    });
  return { card, head, sub, note, label, box, seg, radio, chip, dot, divider, btn, link, badge, sk, text: K.text };
}

function topbar(b, w, opts = {}) {
  const bar = K.chrome(b, w, crumbs('Projects', 'Big Buck Bunny', 'bunny_1080p.mkv'));
  const C = helpers(b);
  // The primary action sits where Save sits on a configuration screen. There is
  // no second video header: clip info belongs to Configuration > General, and
  // logs are a tab, not a top-bar button.
  let ax = bar.actionStart;
  for (const a of (opts.actions || []).slice().reverse()) {
    const width = a.w || tw(a.label, 11) + (a.icon ? 42 : 26);
    ax -= width;
    C.btn(ax, 12, a.label, { w: width, primary: a.primary, ghost: !a.primary, icon: a.icon, h: 32 });
    ax -= 8;
  }
  return { b, C, actionX: ax };
}

function tabs(b, w, active, rightNote) {
  const C = helpers(b);
  const items = [
    { label: 'Configuration', x: 32 },
    { label: 'Scenes', x: 176 },
    { label: 'Logs', x: 262 },
  ];
  for (const item of items) {
    const on = item.label === active;
    C.text(b, 'tab ' + item.label, item.label, item.x, 56, tw(item.label, 13) + 12, {
      size: 13,
      weight: on ? 'semibold' : 'regular',
      color: on ? 'color.text.primary' : 'color.text.secondary',
      valign: 'center',
      h: 44,
    });
    if (on) K.rect(b, 'tab underline ' + item.label, item.x, 98, tw(item.label, 13) + 10, 2, { fill: 'color.brand.default', r: 1 });
  }
  K.line(b, 'tab edge', 0, 99, w, { color: 'color.border.default' });
  if (rightNote) {
    C.text(b, 'tab note', rightNote, w - 32 - 320, 56, 320, {
      size: 10.5,
      color: 'color.text.muted',
      align: 'right',
      valign: 'center',
      h: 44,
    });
  }
}

function player(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  const transportH = 42;
  const availH = h - transportH - 1;
  // Fit 16:9 inside the available box and letterbox whichever dimension is
  // left. A width-limited pane must not stretch the frame vertically.
  const availW = w - 2;
  const frameW = availW / availH > 16 / 9 ? Math.round((availH * 16) / 9) : availW;
  const frameH = availW / availH > 16 / 9 ? availH : Math.round((availW * 9) / 16);
  const fx = x + Math.round((w - frameW) / 2);
  const fy = y + 1 + Math.round((availH - frameH) / 2);
  K.rect(b, 'player', x, y, w, h, { fill: 'color.bg.base', r: 8, stroke: 'color.border.default' });
  K.rect(b, 'player letterbox', x + 1, y + 1, w - 2, availH, { fill: 'color.bg.sunken', r: 0 });
  K.rect(b, 'player stage', fx, fy, frameW, frameH, { fill: 'color.bg.sunken', r: 0 });

  if (opts.still !== false) {
    const ell = (name, ex, ey, ew, eh, fill, op) => {
      const s = penpot.createEllipse();
      s.name = name;
      b.appendChild(s);
      s.x = b.x + ex;
      s.y = b.y + ey;
      s.resize(ew, eh);
      s.fills = [K.fill(fill, op)];
      return s;
    };
    // A placeholder still, drawn only in surface and border tokens. Token-bound
    // fills lose their opacity in the file, so the silhouette is dark-on-dark
    // rather than a translucent wash that exports as a solid block.
    K.rect(b, 'still sky', fx, fy, frameW, Math.round(frameH * 0.8), { fill: 'color.bg.sunken', r: 0 });
    ell('still sun', fx + frameW * 0.66, fy + frameH * 0.16, Math.round(frameH * 0.16), Math.round(frameH * 0.16), 'color.state.warning-bg', 1);
    ell('still far hill', fx, fy + frameH * 0.54, frameW, frameH * 0.42, 'color.bg.raised', 1);
    ell('still near hill', fx + frameW * 0.22, fy + frameH * 0.66, frameW * 0.78, frameH * 0.34, 'color.bg.overlay', 1);
    K.rect(b, 'still ground', fx, fy + Math.round(frameH * 0.88), frameW, Math.round(frameH * 0.12), { fill: 'color.bg.base', r: 0 });
    K.rect(b, 'still horizon', fx, fy + Math.round(frameH * 0.62), frameW, 1, { fill: 'color.border.subtle', r: 0 });
    const treeX = fx + frameW * 0.16;
    K.rect(b, 'still trunk', treeX, fy + frameH * 0.58, 4, frameH * 0.28, { fill: 'color.border.default', r: 1 });
    ell('still canopy', treeX - 26, fy + frameH * 0.5, 58, 34, 'color.bg.raised', 1);
  }

  K.rect(b, 'player frame edge', fx, fy, frameW, frameH, { fill: null, r: 0, stroke: 'color.border.default' });

  // Context sits inside the frame, where the eye already is. No overlay badge
  // duplicates the transport's source control.
  if (opts.meta) {
    const metaW = tw(opts.meta, 9.5) + 22;
    K.rect(b, 'player meta', fx + frameW - metaW - 12, fy + 12, metaW, 20, {
      fill: 'color.bg.overlay',
      op: 0.8,
      r: 4,
      stroke: 'color.border.strong',
    });
    C.text(b, 'player meta t', opts.meta, fx + frameW - metaW - 6, fy + 12, metaW - 12, {
      size: 9.5,
      color: 'color.text.secondary',
      align: 'right',
      valign: 'center',
      h: 20,
    });
  }

  if (opts.noFrame) {
    C.text(b, 'no frame', opts.noFrame, fx + 24, fy + frameH / 2 - 12, frameW - 48, {
      size: 12,
      color: 'color.text.secondary',
      align: 'center',
      h: 24,
    });
  }

  const ty = y + h - transportH;
  K.rect(b, 'transport', x + 1, ty, w - 2, transportH, { fill: 'color.bg.surface', r: 0 });
  K.rect(b, 'transport bottom left', x + 1, y + h - 5, 7, 4, { fill: 'color.bg.surface', r: 0 });
  K.rect(b, 'transport bottom right', x + w - 8, y + h - 5, 7, 4, { fill: 'color.bg.surface', r: 0 });
  K.line(b, 'transport edge', x + 1, ty, w - 2, { color: 'color.border.subtle' });

  const source = opts.source || 'Original';
  // Reserve room for the chevron: the label must end before it starts, or the
  // shorter source names (Decode, Encode) collide with it.
  const sourceW = tw(source, 10) + 76;
  K.rect(b, 'source control', x + 14, ty + 8, sourceW, 26, {
    fill: 'color.bg.raised',
    r: 4,
    stroke: 'color.border.default',
  });
  K.icon(b, 'source control glyph', ICONS.film, x + 22, ty + 15, 12, { color: 'color.text.secondary' });
  C.text(b, 'source control label', source, x + 41, ty + 8, sourceW - 66, {
    size: 10,
    weight: 'medium',
    color: 'color.text.primary',
    valign: 'center',
    h: 26,
  });
  K.icon(b, 'source control chevron', ICONS.down, x + 14 + sourceW - 18, ty + 18, 10, { color: 'color.text.secondary' });

  const playX = x + 14 + sourceW + 16;
  K.icon(b, 'transport play', ICONS.play, playX, ty + 13, 16, { color: 'color.text.primary', solid: true });
  C.text(b, 'transport time', opts.time || '00:01:40.700', playX + 26, ty, 96, {
    size: 11,
    family: 'JetBrains Mono',
    color: 'color.text.primary',
    valign: 'center',
    h: transportH,
  });
  C.text(b, 'transport frame', opts.frameLabel || 'frame 2,417', playX + 126, ty, 96, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: transportH,
  });
  C.text(b, 'transport rate', '1.0×', x + w - 152, ty, 38, {
    size: 10,
    color: 'color.text.secondary',
    align: 'right',
    valign: 'center',
    h: transportH,
  });
  K.icon(b, 'transport volume', ICONS.volume, x + w - 106, ty + 14, 15, { color: 'color.text.secondary' });
  K.icon(b, 'transport full', ICONS.full, x + w - 26, ty + 14, 15, { color: 'color.text.secondary' });

  K.rect(b, 'progress track', x + 1, y + h - 3, w - 2, 2, { fill: 'color.border.default', r: 0 });
  const progressW = Math.round((w - 2) * (opts.progress == null ? 0.42 : opts.progress));
  if (progressW > 0) {
    K.rect(b, 'progress fill', x + 1, y + h - 3, progressW, 2, { fill: 'color.brand.default', r: 0 });
  }
}

function sceneRail(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  K.rect(b, 'scene rail', x, y, w, h, { fill: 'color.bg.surface' });
  K.line(b, 'scene rail edge', x + w - 1, y, 1, { color: 'color.border.default', h });
  C.label('SCENES', x + 16, y + 18, 120);
  C.chip(x + w - 60, y + 14, opts.count || '96', 'neutral', { w: 44, h: 20 });
  // Only the rows that fit above the footer are drawn. Sixteen rows at the old
  // 52 px stride ran under the footer on an 860 px rail; 44 px rows keep 15
  // visible, leave the footer clear, and let the timestamps stay.
  const rows = opts.rows || SCENE_ROWS;
  const selected = opts.selected == null ? 6 : opts.selected;
  const stride = 44;
  const shown = Math.min(rows.length, Math.max(0, Math.floor((h - 192) / stride)));
  C.note(opts.sub || 'Virtualized · ' + shown + ' of 96 shown', x + 16, y + 38, w - 32, 14);

  K.rect(b, 'scene search', x + 16, y + 58, w - 32, 28, {
    fill: 'color.bg.sunken',
    r: 5,
    stroke: 'color.border.default',
  });
  K.icon(b, 'scene search icon', ICONS.search, x + 24, y + 65, 13, { color: 'color.text.muted' });
  C.text(b, 'scene search t', 'Find frame or time', x + 44, y + 58, w - 72, {
    size: 10,
    color: 'color.text.muted',
    valign: 'center',
    h: 28,
  });
  K.rect(b, 'scene filter', x + 16, y + 94, 104, 24, { fill: 'color.bg.sunken', r: 4, stroke: 'color.border.default' });
  C.text(b, 'scene filter t', 'All scenes', x + 25, y + 94, 78, {
    size: 9.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 24,
  });
  K.icon(b, 'scene filter chevron', ICONS.down, x + 96, y + 101, 11, { color: 'color.text.muted' });
  if (opts.issue) {
    C.text(b, 'scene issue', opts.issue, x + 130, y + 94, 90, {
      size: 9.5,
      color: 'color.state.warning',
      align: 'right',
      valign: 'center',
      h: 24,
    });
  } else {
    C.note('Shift-click extends', x + 132, y + 97, 92, 18);
  }

  const start = y + 128;
  rows.slice(0, shown).forEach((row, i) => {
    const ry = start + i * stride;
    const on = i === selected;
    if (on) {
      K.rect(b, 'scene row active', x + 8, ry, w - 16, 40, { fill: 'color.bg.raised', r: 5 });
      K.rect(b, 'scene row marker', x + 8, ry + 8, 2, 24, { fill: 'color.brand.default', r: 1 });
    }
    // The issue pip sits on the top-right corner of the scene number, not in a
    // trailing column. A valid scene draws nothing; there is no green dot.
    C.text(b, 'scene num ' + i, String(row.n).padStart(2, '0'), x + 16, ry + 5, 26, {
      size: 10,
      family: 'JetBrains Mono',
      color: on ? 'color.text.primary' : 'color.text.secondary',
      h: 16,
    });
    if (row.state === 'warning' || row.state === 'danger') {
      C.dot(x + 30, ry + 4, row.state);
    }
    C.text(b, 'scene range ' + i, row.a.toLocaleString('en-US') + ' – ' + row.b.toLocaleString('en-US'), x + 52, ry + 4, w - 68, {
      size: 9.5,
      family: 'JetBrains Mono',
      color: on ? 'color.text.primary' : 'color.text.secondary',
      h: 15,
    });
    C.text(b, 'scene time ' + i, sceneTime(row.a) + ' – ' + sceneTime(row.b), x + 52, ry + 21, w - 68, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 13,
    });
    if (i < shown - 1) K.line(b, 'scene sep ' + i, x + 16, ry + 43, w - 32, { color: 'color.border.subtle' });
  });

  C.divider(x + 16, y + h - 48, w - 32);
  C.text(b, 'scene footer', opts.footer || '96 scenes · 14,304 frames', x + 16, y + h - 36, 160, {
    size: 9.5,
    color: 'color.text.muted',
    valign: 'center',
    h: 24,
  });
  if (opts.validate !== false) C.link(x + w - 84, y + h - 34, 'Validate', { w: 68, right: true });
}

function sceneTime(frames) {
  const seconds = frames / 24;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

const SCENE_ROWS = [
  { n: 1, a: 0, b: 96 },
  { n: 2, a: 96, b: 240 },
  { n: 3, a: 240, b: 432 },
  { n: 4, a: 432, b: 672 },
  { n: 5, a: 672, b: 1008 },
  { n: 6, a: 1008, b: 2304 },
  { n: 7, a: 2304, b: 3072 },
  { n: 8, a: 3072, b: 3264 },
  { n: 9, a: 3264, b: 3600, state: 'warning' },
  { n: 10, a: 3600, b: 3792 },
  { n: 11, a: 3792, b: 4176 },
  { n: 12, a: 4176, b: 4512 },
  { n: 13, a: 4512, b: 4896 },
  { n: 14, a: 4896, b: 5136 },
  { n: 15, a: 5136, b: 5520 },
];

const TIMELINE_SCENES = [
  { n: 1, a: 0, b: 96 },
  { n: 2, a: 96, b: 240 },
  { n: 3, a: 240, b: 432 },
  { n: 4, a: 432, b: 672 },
  { n: 5, a: 672, b: 1008 },
  { n: 6, a: 1008, b: 2304 },
  { n: 7, a: 2304, b: 3072 },
  { n: 8, a: 3072, b: 3264 },
  { n: 9, a: 3264, b: 3600, state: 'warning' },
  { n: 10, a: 3600, b: 3792 },
  { n: 11, a: 3792, b: 4176 },
  { n: 12, a: 4176, b: 4512 },
  { n: 13, a: 4512, b: 4896 },
  { n: 14, a: 4896, b: 5136 },
  { n: 15, a: 5136, b: 5520 },
  { n: 16, a: 5520, b: 5856 },
];

function timeline(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  K.rect(b, 'timeline', x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  const compact = h < 110;
  const top = y + (compact ? 8 : 10);
  C.label('TIMELINE', x + 16, top, 80);
  C.note(opts.rangeLabel || 'Scenes 1–16 of 96 · 4:04 of 9:56', x + 84, top + 1, 260, 14);
  C.note('Timecode + frames', x + 320, top + 1, 120, 14);
  const zx = x + w - 138;
  C.btn(zx, top - 2, '−', { w: 26, h: 22, ghost: true });
  C.btn(zx + 30, top - 2, '+', { w: 26, h: 22, ghost: true });
  C.btn(zx + 60, top - 2, 'Fit', { w: 40, h: 22 });
  C.text(b, 'zoom level', '25%', zx + 104, top - 2, 30, {
    size: 9.5,
    color: 'color.text.muted',
    align: 'right',
    valign: 'center',
    h: 22,
  });

  const trackX = x + 16;
  const trackW = w - 32;
  const scenes = opts.scenes || TIMELINE_SCENES;
  const first = scenes[0].a;
  const last = scenes[scenes.length - 1].b;
  const frameToX = (f) => trackX + ((f - first) / (last - first)) * trackW;
  const totalSeconds = (last - first) / 24;
  const step = totalSeconds > 600 ? 120 : totalSeconds > 240 ? 60 : 30;

  // Both units are always visible: timecode on the upper ruler line, frame
  // number below it. The playhead repeats both, so a user never has to toggle.
  const timeY = y + (compact ? 26 : 30);
  const frameY = timeY + (compact ? 0 : 13);
  const blockY = y + (compact ? 44 : 60);
  const blockH = compact ? 26 : 34;
  for (let s = 0; s <= Math.floor(totalSeconds); s += step) {
    const rx = frameToX(first + s * 24);
    const firstTick = s === 0;
    const nearEnd = rx + 40 > trackX + trackW;
    const ax = firstTick ? 0 : nearEnd ? -80 : -40;
    K.rect(b, 'tick ' + s, rx, timeY + 12, 1, 6, { fill: 'color.border.strong' });
    if (!compact) {
      C.text(b, 'tick time ' + s, `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, rx + ax, timeY, 80, {
        size: 8.5,
        family: 'JetBrains Mono',
        color: 'color.text.muted',
        align: firstTick ? 'left' : nearEnd ? 'right' : 'center',
        h: 12,
      });
    }
    C.text(b, 'tick frame ' + s, (s * 24).toLocaleString('en-US'), rx + ax, frameY, 80, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: firstTick ? 'left' : nearEnd ? 'right' : 'center',
      h: 11,
    });
  }
  K.line(b, 'ruler', trackX, blockY - 4, trackW, { color: 'color.border.default' });

  scenes.forEach((scene) => {
    const sx = frameToX(scene.a);
    const sw = frameToX(scene.b) - sx - 1;
    const on = scene.n === 7;
    const bad = scene.n === 9;
    K.rect(b, 'scene block ' + scene.n, sx, blockY, Math.max(2, sw), blockH, {
      fill: on ? 'color.brand.subtle' : bad ? 'color.state.warning-bg' : 'color.bg.raised',
      r: 3,
      stroke: on ? 'color.brand.default' : bad ? 'color.state.warning' : 'color.border.subtle',
      sw: on || bad ? 2 : 1,
    });
    if (sw > 26) {
      C.text(b, 'scene block n ' + scene.n, String(scene.n).padStart(2, '0'), sx + 6, blockY, 24, {
        size: 8.5,
        family: 'JetBrains Mono',
        color: on || bad ? 'color.text.primary' : 'color.text.secondary',
        valign: 'center',
        h: blockH,
      });
    }
    if (sw > 58) {
      C.text(b, 'scene block d ' + scene.n, `${((scene.b - scene.a) / 24).toFixed(0)}s`, on ? sx + 36 : sx + 26, blockY, on ? sw - 42 : sw - 32, {
        size: 8,
        color: 'color.text.muted',
        valign: 'center',
        h: blockH,
      });
    }
  });

  const playX = frameToX(2417);
  K.rect(b, 'playhead', playX - 1, timeY - 4, 2, blockY + blockH - timeY + 6, { fill: 'color.brand.default', r: 1 });
  K.icon(b, 'playhead grip', '<path d="m8 4 4 5 4-5"/>', playX - 6, timeY - 12, 12, { color: 'color.brand.default', solid: true, sw: 0 });

  if (compact) return;
  const footY = blockY + blockH + 6;
  C.text(b, 'track name', 'V1', x + 16, footY, 24, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    valign: 'center',
    h: 18,
  });
  C.text(b, 'playhead label', 'Scene 07 · 00:01:40.700 · frame 2,417', x + 50, footY, 320, {
    size: 9.5,
    family: 'JetBrains Mono',
    color: 'color.text.secondary',
    valign: 'center',
    h: 18,
  });
  // Valid boundaries produce no message at all. Only a real defect is shown.
  if (opts.issue) {
    C.text(b, 'timeline issue', opts.issue, x + w - 260, footY, 244, {
      size: 9.5,
      color: 'color.state.warning',
      align: 'right',
      valign: 'center',
      h: 18,
    });
  }
}

const SOURCE_ITEMS = [
  { name: 'Original', sub: 'Source file, unfiltered' },
  { name: 'Decode', sub: 'Filtered decode the encoder saw' },
  { name: 'Encode', sub: 'Retained chunk from the encoder' },
];

function sourceMenu(b, x, y, w, opts = {}) {
  const C = helpers(b);
  const items = opts.items || SOURCE_ITEMS;
  const active = (opts.active || 'original').toLowerCase();
  const rowH = 46;
  const gap = 6;
  // The encode-input choice only matters while Encode is the active source; a
  // permanently visible control would imply the bytes can change from Original.
  const showReference = active === 'encode';
  const h = 50 + items.length * (rowH + gap) + (showReference ? 112 : 0);
  K.rect(b, 'source menu shadow', x + 3, y + 4, w, h, { fill: 'color.bg.base', op: 0.45, r: 8 });
  K.rect(b, 'source menu', x, y, w, h, { fill: 'color.bg.raised', r: 8, stroke: 'color.border.strong' });
  C.label('FRAME SOURCE', x + 14, y + 14, 160);
  C.note('One player. Switching replaces what it plays.', x + 14, y + 28, w - 28, 14);

  let ry = y + 50;
  items.forEach((item, i) => {
    const on = item.name.toLowerCase() === active;
    K.rect(b, 'source menu row ' + i, x + 10, ry, w - 20, rowH, {
      fill: on ? 'color.bg.sunken' : null,
      r: 5,
      stroke: on ? 'color.border.strong' : null,
    });
    C.radio(x + 20, ry + 16, on);
    C.text(b, 'source menu name ' + i, item.name, x + 42, ry + 7, w - 52, {
      size: 11.5,
      weight: on ? 'semibold' : 'regular',
      color: on ? 'color.text.primary' : 'color.text.secondary',
      h: 18,
    });
    C.text(b, 'source menu sub ' + i, item.sub, x + 42, ry + 24, w - 52, {
      size: 9.5,
      color: 'color.text.muted',
      h: 14,
    });
    ry += rowH + gap;
  });

  if (showReference) {
    K.line(b, 'source menu divider', x + 14, ry + 2, w - 28, { color: 'color.border.subtle' });
    C.label('ENCODE INPUT', x + 14, ry + 12, 180);
    C.note('The decode behind Encode. Bytes never change.', x + 14, ry + 26, w - 28, 14);
    C.seg(x + 14, ry + 44, ['Decode', 'Original'], opts.reference === 'original' ? 1 : 0, { w: 96, h: 26, size: 10 });
    C.note('Decode is what the encoder saw. Original skips the filter chain.', x + 14, ry + 76, w - 28, 30);
  }
}

function details(b, x, y, w, h, opts = {}) {
  const C = helpers(b);
  C.card('scene details', x, y, w, h);
  const compact = !!opts.compact;
  if (opts.empty) {
    C.text(b, 'details head', 'Details', x + 16, y + 14, 100, { size: 15, weight: 'semibold', color: 'color.text.secondary', h: 24 });
    C.divider(x + 16, y + 46, w - 32);
    C.text(b, 'details empty head', 'No scene selected', x + 16, y + 66, 240, { size: 12, color: 'color.text.secondary', h: 20 });
    C.note('Choose a block on the timeline or a row in the scene rail to edit its range and inspect what the engine produced.', x + 16, y + 88, w - 32, 50);
    return;
  }

  // Header. Only a problematic scene gets a chip; a valid scene has no green
  // badge to read past. The range and timecodes are two lines so the panel can
  // stay narrow without losing the exact frame pair.
  C.text(b, 'details scene', 'Scene 07', x + 16, y + 14, 80, { size: 15, weight: 'semibold', h: 24 });
  if (opts.badge) C.chip(x + 98, y + 14, opts.badge, opts.tone || 'neutral', { h: 20 });
  else if (opts.state === 'warning' || opts.state === 'danger') C.chip(x + 98, y + 14, opts.state === 'danger' ? 'Failed' : 'Needs attention', opts.state, { h: 20 });
  C.text(b, 'details position', '7 of 96', x + w - 58, y + 17, 40, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 16 });
  C.text(b, 'details frames', 'frames 2,304 – 3,072', x + 16, y + 40, w - 32, { size: 9.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
  C.text(b, 'details times', '00:01:36.0 – 00:02:08.0', x + 16, y + 56, w - 32, { size: 9, family: 'JetBrains Mono', color: 'color.text.muted', h: 14 });
  C.divider(x + 16, y + 78, w - 32);

  C.label('RANGE', x + 16, y + 92, 100);
  const fw = Math.floor((w - 40) / 2);
  C.label('START FRAME', x + 16, y + 112, fw);
  C.box(x + 16, y + 128, fw, '2,304', { h: 30, size: 10.5 });
  C.label('END FRAME', x + 24 + fw, y + 112, fw);
  C.box(x + 24 + fw, y + 128, fw, '3,072', { h: 30, size: 10.5 });
  C.text(b, 'start time', '00:01:36.0', x + 16, y + 162, fw, { size: 9, family: 'JetBrains Mono', color: 'color.text.muted', h: 14 });
  C.text(b, 'end time', '00:02:08.0', x + 24 + fw, y + 162, fw, { size: 9, family: 'JetBrains Mono', color: 'color.text.muted', h: 14 });
  C.note('768 frames · 32.0 s', x + 16, y + 180, w - 32, 14);
  C.divider(x + 16, y + 202, w - 32);

  C.label('ENCODER', x + 16, y + 216, 80);
  // The settings affordance is inline with the label, not a wide button that
  // steals a row. Clicking it opens the same encoder sheet Configuration uses.
  K.icon(b, 'encoder edit', ICONS.gear, x + 76, y + 214, 14, { color: 'color.brand.text' });
  C.box(x + 16, y + 234, w - 32, 'Custom · SVT-AV1', { h: 32, size: 10.5 });
  C.note('Overrides this scene only. Opens the same parameter editor as Configuration.', x + 16, y + 272, w - 32, 30);

  if (!compact) {
    C.divider(x + 16, y + 308, w - 32);
    C.label('CUSTOM SCENE DATA', x + 16, y + 322, 160);
    C.text(b, 'custom scope', 'Text input', x + w - 74, y + 322, 58, {
      size: 9,
      color: 'color.brand.text',
      align: 'right',
      h: 14,
    });
    C.note('Only for a VapourSynth script input. Values are injected into the script for this scene.', x + 16, y + 338, w - 32, 28);
    ['denoise = 2', 'preset = medium'].forEach((value, i) => {
      const ry = y + 376 + i * 34;
      K.rect(b, 'custom row ' + i, x + 16, ry, w - 48, 28, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
      C.text(b, 'custom value ' + i, value, x + 26, ry, w - 86, {
        size: 9.5,
        family: 'JetBrains Mono',
        color: 'color.text.primary',
        valign: 'center',
        h: 28,
      });
      K.icon(b, 'custom remove ' + i, ICONS.x, x + w - 46, ry + 8, 12, { color: 'color.text.muted' });
    });
    C.text(b, 'custom add', '+ Add field', x + 16, y + 452, 120, { size: 10, color: 'color.brand.text', h: 16 });
    C.note('Injected as condor_data.scenes[6].data; read only by the input that owns the script.', x + 16, y + 470, w - 32, 28);

    C.divider(x + 16, y + 506, w - 32);
    C.label('ENGINE DATA', x + 16, y + 520, 120);
    C.note('Read-only', x + w - 86, y + 520, 70, 14);
    C.text(b, 'engine inline', 'Noise 4.2 · Q 26 · 3.82 Mbps · 6.4 MB', x + 16, y + 540, w - 32, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.secondary',
      h: 16,
    });
    C.note('Quality has not run for this scene.', x + 16, y + 560, w - 32, 14);
  }

  // Actions sit at the bottom of the panel. The encoder editor is above; this
  // row edits boundaries, not parameters.
  const actY = y + h - 86;
  C.btn(x + 16, actY, 'Split', { w: 88, icon: 'split', ghost: true, h: 28 });
  C.btn(x + 112, actY, 'Merge', { w: 88, icon: 'merge', ghost: true, h: 28 });
  C.btn(x + 208, actY, 'Re-encode', { w: 96, icon: 'reset', ghost: true, h: 28 });
  C.note('Boundary edits apply to this scene only.', x + 16, y + h - 40, w - 32, 16);
  if (opts.warning) {
    K.rect(b, 'details warning dot', x + 16, y + h - 30, 6, 6, { fill: 'color.state.warning', r: 3 });
    C.text(b, 'details warning', opts.warning, x + 28, y + h - 34, w - 44, { size: 9, color: 'color.state.warning', h: 14 });
  }
}

// ------------------------------------------------------- Video / Configuration
if (!ONLY || ONLY === 'config') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Configuration', 0, 0, w, h);
  topbar(b, w, { actions: [{ label: 'Run encode', primary: true, w: 104 }] });
  tabs(b, w, 'Configuration', '3 overrides · 7 sections');
  const C = helpers(b);

  // Section rail
  K.rect(b, 'rail', 0, 156, 248, h - 156, { fill: 'color.bg.surface' });
  K.line(b, 'rail edge', 247, 156, 1, { color: 'color.border.default', h: h - 156 });
  C.label('CONFIGURATION', 20, 180, 180);
  C.note('Video overrides', 20, 198, 180, 14);
  const sections = [
    ['General', '3 overrides', 'info'],
    ['Scene detection', 'Done', 'success'],
    ['Noise generation', 'Done', 'success'],
    ['Encoding', 'Done', 'success'],
    ['Target quality', 'Done', 'success'],
    ['Concatenation', 'Done', 'success'],
    ['Quality check', '—', 'neutral'],
  ];
  sections.forEach(([name, status, tone], i) => {
    const y = 226 + i * 40;
    const on = i === 0;
    if (on) {
      K.rect(b, 'rail active ' + i, 8, y, 232, 34, { fill: 'color.bg.raised', r: 5 });
      K.rect(b, 'rail marker ' + i, 8, y + 8, 2, 18, { fill: 'color.brand.default', r: 1 });
    }
    C.dot(22, y + 14, tone === 'neutral' ? 'neutral' : tone);
    C.text(b, 'rail label ' + i, name, 38, y, 150, {
      size: 11.5,
      weight: on ? 'medium' : 'regular',
      color: on ? 'color.text.primary' : 'color.text.secondary',
      valign: 'center',
      h: 34,
    });
    C.text(b, 'rail status ' + i, status, 158, y, 72, {
      size: 9,
      color: tone === 'success' ? 'color.state.success' : tone === 'info' ? 'color.text.secondary' : 'color.text.muted',
      align: 'right',
      valign: 'center',
      h: 34,
    });
  });
  C.divider(20, 516, 208);
  C.note('Project defaults are shown as Inherited. Overrides write to this video only.', 20, 532, 208, 44);
  C.divider(20, h - 78, 208);
  C.link(20, h - 62, 'Reset all overrides', { w: 160, color: 'color.text.secondary' });
  C.note('Encoding is locked while a run is active.', 20, h - 40, 208, 28);

  // Content heading
  const cx = 272;
  const cw = 1136;
  C.head('General', cx, 174, 300, { size: 22 });
  C.sub('Resolved for this video. Fields that differ from the project are marked Video.', cx, 204, 720);
  C.chip(cx + 892, 176, '3 overrides', 'info');
  C.btn(cx + 1004, 174, 'Reset section', { w: 112, ghost: true });

  // Resolved strip
  C.card('resolved strip', cx, 238, cw, 44, { r: 8 });
  K.icon(b, 'resolved check', ICONS.check, cx + 16, 252, 14, { color: 'color.state.success' });
  C.text(b, 'resolved text', 'Input resolved · FFMS2 · 10-bit 4:2:0 · 1920×1080', cx + 38, 238, 620, {
    size: 10.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 44,
  });
  C.text(b, 'resolved right', '96 scenes encoded · output ready', cx + cw - 320, 238, 296, {
    size: 10.5,
    color: 'color.state.success',
    align: 'right',
    valign: 'center',
    h: 44,
  });

  // Input card
  C.card('config input card', cx, 298, 700, 292);
  C.head('Input', cx + 24, 318, 80);
  C.badge(cx + 78, 322, 'Inherited', 'neutral');
  C.link(cx + 584, 320, 'Edit input', { w: 92, right: true });
  C.note('FFMS2 decodes natively. A sequence can override this input below.', cx + 24, 344, 600, 16);
  C.divider(cx + 24, 368, 652);
  C.label('INPUT KIND', cx + 24, 382, 120);
  C.seg(cx + 24, 400, ['FFMS2', 'VapourSynth', 'Script'], 0, { w: 112, h: 28, size: 10 });
  C.label('FILTERS', cx + 24, 448, 100);
  K.rect(b, 'config filter row', cx + 24, 466, 652, 46, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  K.icon(b, 'config filter grip', '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>', cx + 34, 482, 14, { color: 'color.text.muted', solid: true });
  C.text(b, 'config filter name', 'Output format', cx + 58, 466, 110, { size: 11.5, weight: 'medium', valign: 'center', h: 46 });
  C.text(b, 'config filter summary', '10-bit · 4:2:0 · source geometry', cx + 172, 466, 380, {
    size: 10.5,
    color: 'color.text.secondary',
    valign: 'center',
    h: 46,
  });
  K.icon(b, 'config filter edit', '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', cx + 616, 481, 14, { color: 'color.text.muted' });
  C.btn(cx + 24, 522, 'Add filter', { w: 94 });
  C.note('Add opens the filter sheet, preselected to this input kind.', cx + 128, 528, 470, 18);
  C.note('The video input is the base for scene detection, noise generation, encoding and quality check.', cx + 24, 560, 640, 16);

  // Clip info
  C.card('clip card', 996, 298, 412, 292);
  C.head('Clip info', 1020, 318, 160);
  C.badge(1082, 322, 'Probed', 'neutral');
  const clip = [
    ['Resolution', '1920×1080'],
    ['Frame rate', '23.976 fps'],
    ['Frames', '14,304'],
    ['Duration', '00:09:56'],
    ['Pixel format', 'yuv420p10le'],
    ['Colour', 'BT.709 · SDR'],
  ];
  clip.forEach(([k, v], i) => {
    const y = 356 + i * 30;
    C.text(b, 'clip k ' + i, k, 1020, y, 120, { size: 9.5, color: 'color.text.muted', h: 16 });
    C.text(b, 'clip v ' + i, v, 1148, y, 220, { size: 10.5, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
  });
  C.note('Probed from the source file. Refresh after replacing it.', 1020, 548, 360, 16);

  // Output card
  C.card('config output card', cx, 606, 700, 136);
  C.head('Output file', cx + 24, 624, 140);
  C.badge(cx + 118, 628, 'Video', 'info');
  C.link(cx + 580, 626, 'Reveal', { w: 72, right: true });
  C.box(cx + 24, 656, 652, '/Volumes/Media/AV1/Big Buck Bunny - AV1.mkv', { h: 34, size: 10.5 });
  K.icon(b, 'output folder', ICONS.folder, cx + 644, 666, 15, { color: 'color.text.muted' });
  C.note('Chosen for this video. The project never supplies a file name.', cx + 24, 704, 600, 16);

  // Working directory
  C.card('config temp card', 996, 606, 412, 136);
  C.head('Working directory', 1020, 624, 180);
  C.link(1360, 626, 'Open', { w: 40, right: true });
  C.box(1020, 654, 364, 'temp/01J8Z6K4…', { h: 30, size: 10, color: 'color.text.secondary' });
  C.chip(1020, 696, '1.42 GB retained', 'success', { h: 20 });
  C.chip(1148, 696, '39.2 GB free', 'neutral', { h: 20 });
  C.note('Chunks stay after a successful run unless retention is turned off.', 1020, 722, 364, 14);

  // Sequence status
  C.card('sequence strip', cx, 758, cw, 130);
  C.head('Sequence status', cx + 24, 772, 180, { size: 13 });
  C.text(b, 'sequence strip note', 'Derived from engine data and the chunks on disk', cx + cw - 340, 776, 316, {
    size: 10,
    color: 'color.text.muted',
    align: 'right',
    h: 14,
  });
  const seqs = [
    ['Scenes', '96 detected', 'success'],
    ['Noise', '96 measured', 'success'],
    ['Target Q', '96 tuned', 'success'],
    ['Encode', '96 / 96', 'success'],
    ['Mux', 'output.mkv', 'success'],
    ['Quality', 'Not run', 'neutral'],
  ];
  seqs.forEach(([name, value, tone], i) => {
    const sx = cx + 24 + i * 182;
    K.rect(b, 'seq card ' + i, sx, 800, 174, 64, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
    C.dot(sx + 12, 814, tone);
    C.text(b, 'seq name ' + i, name, sx + 26, 806, 130, { size: 10, weight: 'medium', h: 16 });
    C.text(b, 'seq value ' + i, value, sx + 12, 828, 150, {
      size: 10.5,
      family: 'JetBrains Mono',
      color: tone === 'success' ? 'color.text.secondary' : 'color.text.muted',
      h: 18,
    });
  });

  // The video header occupied y=56..112 and repeated clip info that the Clip
  // info card already owns. Move the whole content block up into that band in one
  // group operation rather than editing every row's y by hand.
  const content = Array.from(b.children).filter((shape) => shape.y - b.y >= 110);
  const group = penpot.group(content);
  if (group) group.y -= 56;
}

// ----------------------------------------------------------------- Video / Scenes
if (!ONLY || ONLY === 'scenes') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Scenes', 0, 1040, w, h);
  topbar(b, w, { actions: [{ label: 'Run encode', primary: true, w: 104 }] });
  tabs(b, w, 'Scenes', '96 scenes · 14,304 frames');

  // Editor layout: compact scene rail, a resizable details/editor pane to the
  // left of the only player, and one full-width timeline at the bottom. The
  // details pane consumes what used to be the player's letterbox while the
  // timeline taking the bottom band gives the video the freed height.
  sceneRail(b, 0, 100, 232, h - 100, { selected: 6, issue: '1 issue' });
  details(b, 248, 116, 320, 680);
  K.rect(b, 'split handle', 570, 426, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
  K.icon(b, 'split dots', '<circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>', 572, 440, 8, { color: 'color.text.muted', solid: true });
  K.line(b, 'split line', 574, 116, 2, { color: 'color.border.subtle', h: 680 });
  player(b, 580, 116, 828, 680, {
    source: 'Encode',
    meta: 'Input Decode · 1920×1080',
    time: '00:01:40.700',
    frameLabel: 'frame 2,417',
    progress: 0.413,
  });
  timeline(b, 248, 812, 1160, 132, { issue: '1 boundary issue · Scene 09' });
}

// ----------------------------------------------------------------- Video / Logs
if (!ONLY || ONLY === 'logs') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Logs', 0, 5120, w, h);
  topbar(b, w, { actions: [{ label: 'Export log', icon: 'logs', w: 112 }] });
  tabs(b, w, 'Logs', 'Run · Oct 30, 14:22 · completed');
  const C = helpers(b);

  // A run selector, level filter, search and follow switch. The log is a tab,
  // so it owns the full width instead of competing with the scene rail.
  K.rect(b, 'logs toolbar', 0, 100, w, 56, { fill: 'color.bg.base', r: 0 });
  C.box(32, 112, 300, 'Run · Oct 30, 14:22 · Big Buck Bunny', { h: 32, size: 10, mono: false, chev: true });
  const levels = ['All', 'Info', 'Warn', 'Error'];
  levels.forEach((level, i) => {
    const lx = 348 + i * 50;
    K.rect(b, 'logs level ' + level, lx, 112, 44, 32, {
      fill: i === 0 ? 'color.bg.raised' : 'color.bg.sunken',
      r: 4,
      stroke: i === 0 ? 'color.border.strong' : 'color.border.default',
    });
    C.text(b, 'logs level t ' + level, level, lx, 112, 44, {
      size: 9.5,
      weight: i === 0 ? 'semibold' : 'regular',
      color: i === 0 ? 'color.text.primary' : 'color.text.secondary',
      align: 'center',
      valign: 'center',
      h: 32,
    });
  });
  K.rect(b, 'logs search', 560, 112, 320, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
  K.icon(b, 'logs search icon', ICONS.search, 572, 122, 13, { color: 'color.text.muted' });
  C.text(b, 'logs search t', 'Filter message or source', 594, 112, 260, { size: 10, color: 'color.text.muted', valign: 'center', h: 32 });
  K.rect(b, 'logs follow', 900, 120, 34, 18, { fill: 'color.brand.default', r: 9 });
  K.rect(b, 'logs follow knob', 917, 122, 14, 14, { fill: 'color.text.on-brand', r: 7 });
  C.text(b, 'logs follow t', 'Follow', 944, 112, 60, { size: 10, color: 'color.text.secondary', valign: 'center', h: 32 });
  C.text(b, 'logs summary', '31,204 lines · 18m 42s · 96 scenes', 1090, 112, 318, {
    size: 10,
    color: 'color.text.muted',
    align: 'right',
    valign: 'center',
    h: 32,
  });

  const p = { x: 32, y: 172, w: 1376, h: 720 };
  K.rect(b, 'logs panel', p.x, p.y, p.w, p.h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
  K.rect(b, 'logs header', p.x + 1, p.y + 1, p.w - 2, 36, { fill: 'color.bg.raised', r: 0 });
  C.text(b, 'logs h time', 'TIME', p.x + 18, p.y + 1, 90, { size: 9, weight: 'semibold', color: 'color.text.muted', valign: 'center', h: 36 });
  C.text(b, 'logs h level', 'LEVEL', p.x + 116, p.y + 1, 64, { size: 9, weight: 'semibold', color: 'color.text.muted', valign: 'center', h: 36 });
  C.text(b, 'logs h source', 'SOURCE', p.x + 188, p.y + 1, 120, { size: 9, weight: 'semibold', color: 'color.text.muted', valign: 'center', h: 36 });
  C.text(b, 'logs h message', 'MESSAGE', p.x + 318, p.y + 1, 800, { size: 9, weight: 'semibold', color: 'color.text.muted', valign: 'center', h: 36 });

  const LOG = [
    ['14:22:04.118', 'INFO', 'engine', 'run 01J8Z6K4 opened · 12 videos in queue'],
    ['14:22:04.161', 'INFO', 'engine', 'snapshot taken · config locked for the run'],
    ['14:22:04.204', 'INFO', 'scenes', 'scene list loaded · 96 scenes · 14,304 frames'],
    ['14:22:05.002', 'INFO', 'encoder', 'SVT-AV1 6.0.0 · workers auto → 8'],
    ['14:22:05.188', 'INFO', 'encoder', 'scene 01/96 · crf 26 · preset 6 · 10-bit'],
    ['14:22:09.407', 'DEBUG', 'encoder', 'scene 01 chunk 6.4 MB · 3.82 Mbps'],
    ['14:22:09.604', 'INFO', 'encoder', 'scene 02/96 · crf 25 · preset 6'],
    ['14:24:12.880', 'WARN', 'encoder', 'scene 09 boundary overlaps scene 08 by 2 frames'],
    ['14:24:13.041', 'INFO', 'encoder', 'scene 09 encoded with the resolved range 3,264–3,600'],
    ['14:28:33.512', 'INFO', 'encoder', 'scene 34/96 · workers 8 · 61% complete'],
    ['14:31:02.774', 'WARN', 'encoder', 'scene 47 chunk is 18% above target bitrate'],
    ['14:36:41.006', 'INFO', 'encoder', 'scene 71/96 · 74% complete'],
    ['14:37:18.442', 'INFO', 'encoder', 'scene 76/96 · crf 27 · preset 6'],
    ['14:38:02.915', 'WARN', 'encoder', 'scene 81 chunk is 9% above target bitrate'],
    ['14:38:44.270', 'INFO', 'encoder', 'scene 84/96 · workers 8 · 88% complete'],
    ['14:39:20.118', 'INFO', 'encoder', 'scene 89/96 · crf 25 · preset 6'],
    ['14:40:12.330', 'INFO', 'encoder', 'scene 94/96 · 98% complete'],
    ['14:40:44.810', 'INFO', 'encoder', 'scene 96/96 encoded · 96 chunks on disk'],
    ['14:40:55.020', 'DEBUG', 'quality', 'SSIMULACRA2 probe written for all scenes'],
    ['14:41:02.119', 'ERROR', 'mux', 'mkvmerge exited 2: chapter file is missing'],
    ['14:41:02.180', 'INFO', 'mux', 'retry without chapters · output stays video + audio'],
    ['14:41:09.533', 'INFO', 'mux', 'output written · 1.42 GB · 9m 56s'],
    ['14:41:09.811', 'INFO', 'quality', 'skipped · Quality Check has not run'],
    ['14:41:09.842', 'INFO', 'engine', 'run completed · 96 of 96 scenes encoded'],
    ['14:41:10.002', 'INFO', 'engine', 'retained chunks kept · 39.2 GB on disk'],
  ];
  const tone = {
    INFO: 'color.text.secondary',
    DEBUG: 'color.text.muted',
    WARN: 'color.state.warning',
    ERROR: 'color.state.danger',
  };
  LOG.forEach(([time, level, source, message], i) => {
    const y = p.y + 44 + i * 24;
    if (level === 'ERROR') K.rect(b, 'logs error row ' + i, p.x + 1, y - 2, p.w - 2, 22, { fill: 'color.state.danger-bg', r: 0 });
    C.text(b, 'logs time ' + i, time, p.x + 18, y, 90, { size: 9, family: 'JetBrains Mono', color: 'color.text.muted', h: 16 });
    C.text(b, 'logs level ' + i, level, p.x + 116, y, 64, { size: 9, weight: level === 'ERROR' || level === 'WARN' ? 'semibold' : 'regular', family: 'JetBrains Mono', color: tone[level], h: 16 });
    C.text(b, 'logs source ' + i, source, p.x + 188, y, 110, { size: 9, family: 'JetBrains Mono', color: 'color.text.secondary', h: 16 });
    C.text(b, 'logs message ' + i, message, p.x + 318, y, p.w - 354, { size: 9.5, family: 'JetBrains Mono', color: level === 'ERROR' ? 'color.text.primary' : 'color.text.secondary', h: 16 });
  });

  C.text(b, 'logs foot left', 'Following the active run · paused while you scroll', p.x + 18, p.y + p.h - 28, 520, {
    size: 9.5,
    color: 'color.text.muted',
    h: 16,
  });
  C.text(b, 'logs foot right', 'UTF-8 · timestamps local', p.x + p.w - 238, p.y + p.h - 28, 220, {
    size: 9.5,
    color: 'color.text.muted',
    align: 'right',
    h: 16,
  });
}

// Clone the populated board for overlays. Rebuilding 300 shapes to draw a
// popover or a sheet is what made the tab stall; a clone is one document op.
function videoBackdrop(name, bx, by, opts = {}) {
  const source = page.findShapes({ type: 'board' }).find((b) => b.name === 'Video / Scenes');
  const b = source ? source.clone() : K.board(null, name, bx, by, 1440, 960);
  b.name = name;
  b.x = bx;
  b.y = by;
  if (!source) {
    topbar(b, 1440, { actions: [{ label: 'Run encode', primary: true, w: 104 }] });
    tabs(b, 1440, 'Scenes', opts.tabNote || '96 scenes · 14,304 frames');
    sceneRail(b, 0, 100, 232, 860, { selected: 6, issue: '1 issue' });
    details(b, 248, 116, 320, 680);
    K.rect(b, 'split handle', 570, 426, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
    K.icon(b, 'split dots', '<circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/>', 572, 440, 8, { color: 'color.text.muted', solid: true });
    K.line(b, 'split line', 574, 116, 2, { color: 'color.border.subtle', h: 680 });
    player(b, 580, 116, 828, 680, {
      source: 'Encode',
      meta: 'Input Decode · 1920×1080',
      time: '00:01:40.700',
      frameLabel: 'frame 2,417',
      progress: 0.413,
    });
    timeline(b, 248, 812, 1160, 132, { issue: '1 boundary issue · Scene 09' });
  }
  const tabNote = Array.from(b.children).find((s) => s.name === 'tab note');
  if (tabNote && opts.tabNote) tabNote.characters = opts.tabNote;
  return b;
}

// ------------------------------------------------------------- Video / Source menu
if (!ONLY || ONLY === 'menu') {
  const b = videoBackdrop('Video / Source menu', 4560, 1040, {
    tabNote: 'Source switch keeps position · V cycles',
  });
  sourceMenu(b, 596, 414, 344, { active: 'encode', reference: 'decode' });
}

// ------------------------------------------------------------ Video / Scene encoder
if (!ONLY || ONLY === 'encoder') {
  const w = 1440;
  const h = 960;
  const b = videoBackdrop('Video / Scene encoder', 4560, 2080);

  const C = helpers(b);
  // The scrim is an unbound fill on purpose: a token-bound fill loses its
  // opacity in the file, which would hide the board instead of dimming it.
  const scrim = penpot.createRectangle();
  scrim.name = 'sheet scrim';
  b.appendChild(scrim);
  scrim.x = b.x;
  scrim.y = b.y + 100;
  scrim.resize(w, h - 100);
  scrim.fills = [K.fill('color.bg.base', 0.66)];

  const sx = 880;
  const sw = 560;
  K.rect(b, 'sheet edge shadow', sx - 8, 100, 8, h - 100, { fill: 'color.bg.sunken', r: 0 });
  K.rect(b, 'scene encoder sheet', sx, 100, sw, h - 100, { fill: 'color.bg.surface', r: 0, stroke: 'color.border.strong' });

  C.label('SCENE 07', sx + 24, 176, 120);
  C.text(b, 'sheet title', 'Scene encoder', sx + 24, 190, 380, { size: 20, weight: 'semibold', h: 28 });
  K.icon(b, 'sheet close', ICONS.x, sx + sw - 40, 196, 16, { color: 'color.text.secondary' });
  C.note('Changes apply to scene 07 only; other scenes keep the video encoder.', sx + 24, 222, sw - 48, 16);
  C.divider(sx + 24, 248, sw - 48);

  C.label('SCOPE', sx + 24, 264, 80);
  C.seg(sx + 24, 282, ['Inherited', 'Custom for scene'], 1, { w: 132, h: 28, size: 10.5 });
  C.note('Custom stores this scene\u2019s override. The video encoder is unchanged.', sx + 24, 320, sw - 48, 16);

  C.label('ENCODER', sx + 24, 352, 100);
  C.box(sx + 24, 370, 388, 'SVT-AV1 · 3.0.0', { chev: true, h: 32, size: 11 });
  C.chip(sx + 424, 376, 'Available', 'success', { h: 20 });
  C.note('Parameters from the same catalogue as Configuration.', sx + 24, 408, 380, 14);
  C.link(sx + sw - 64, 406, 'Docs', { w: 40, right: true });
  C.divider(sx + 24, 430, sw - 48);

  C.label('PARAMETERS', sx + 24, 444, 120);
  C.text(b, 'sheet param count', 'Scrolls · all parameters', sx + sw - 224, 444, 200, {
    size: 9.5,
    color: 'color.text.muted',
    align: 'right',
    h: 14,
  });

  const rowY = (i) => 472 + i * 66;
  const param = (i, label, help) => {
    C.text(b, 'param ' + label, label, sx + 24, rowY(i), 360, { size: 11.5, weight: 'medium', h: 16 });
    C.note(help, sx + 24, rowY(i) + 16, 360, 14);
  };
  const toggle = (x, y, on) => {
    K.rect(b, 'toggle ' + x + y, x, y, 36, 20, {
      fill: on ? 'color.brand.default' : 'color.bg.raised',
      r: 10,
      stroke: on ? null : 'color.border.strong',
    });
    K.rect(b, 'toggle knob ' + x + y, on ? x + 19 : x + 3, y + 3, 14, 14, {
      fill: on ? 'color.text.on-brand' : 'color.text.muted',
      r: 7,
    });
  };

  param(0, 'CRF', 'Constant rate factor. Higher is smaller and lower quality.');
  C.box(sx + 398, rowY(0) - 2, 106, '26', { h: 30, size: 11 });
  C.text(b, 'crf range', '0–63', sx + 398, rowY(0) + 30, 106, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'right',
    h: 12,
  });

  param(1, 'Preset', 'Speed and quality trade-off. 6 is the default.');
  C.box(sx + 398, rowY(1) - 2, 106, '6 · medium', { chev: true, h: 30, size: 10.5 });

  param(2, 'Tune', '0 · VQ suits live action; 1 · PSNR favours metrics.');
  C.box(sx + 398, rowY(2) - 2, 106, '0 · VQ', { chev: true, h: 30, size: 10.5 });

  param(3, 'Pixel format', '10-bit 4:2:0 is required for SVT-AV1 output.');
  // A constrained choice, not free text: the chevron is the only cue that this
  // box opens a list rather than accepting a typed value like CRF does.
  C.box(sx + 398, rowY(3) - 2, 106, '10-bit', { chev: true, h: 30, size: 10.5 });

  param(4, 'Photon noise', 'SVT-AV1 only. Synthesised grain, applied during encode.');
  C.text(b, 'photon state', 'On', sx + 462, rowY(4) - 2, 30, { size: 10.5, color: 'color.text.secondary', valign: 'center', h: 30 });
  toggle(sx + 498, rowY(4) + 3, true);

  param(5, 'Film grain', 'SVT-AV1 only. Preserves grain; raises the bitrate.');
  C.text(b, 'film state', 'Off', sx + 462, rowY(5) - 2, 30, { size: 10.5, color: 'color.text.secondary', valign: 'center', h: 30 });
  toggle(sx + 498, rowY(5) + 3, false);

  K.rect(b, 'sheet scroll track', sx + sw - 14, 472, 2, 396, { fill: 'color.border.subtle', r: 1 });
  K.rect(b, 'sheet scroll thumb', sx + sw - 14, 484, 2, 96, { fill: 'color.border.strong', r: 1 });
  C.divider(sx + 24, 872, sw - 48);
  C.link(sx + 24, 904, 'Reset to inherited', { w: 180, color: 'color.text.secondary' });
  C.btn(sx + sw - 254, 896, 'Cancel', { w: 90, h: 32 });
  C.btn(sx + sw - 150, 896, 'Apply to scene', { w: 134, primary: true, h: 32 });
}

// ------------------------------------------------------------------ Video / Empty
if (!ONLY || ONLY === 'empty') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Empty', 1520, 0, w, h);
  topbar(b, w, { actions: [{ label: 'Run scene detection', primary: true, w: 158 }] });
  tabs(b, w, 'Scenes', 'Detection has not run');
  const C = helpers(b);

  sceneRail(b, 0, 100, 232, h - 100, {
    rows: [],
    count: '0',
    sub: 'Nothing detected yet',
    footer: '0 scenes · 0 frames',
    validate: false,
  });
  K.icon(b, 'empty film', ICONS.film, 100, 410, 32, { color: 'color.text.muted' });
  C.text(b, 'empty rail head', 'No scenes to list', 40, 458, 152, { size: 12, color: 'color.text.secondary', align: 'center', h: 20 });
  C.note('The list fills as scenes are found, and a cancel keeps what exists.', 24, 484, 184, 44);

  details(b, 248, 116, 320, 680, { empty: true });
  K.rect(b, 'split handle', 570, 426, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
  K.line(b, 'split line', 574, 116, 2, { color: 'color.border.subtle', h: 680 });

  // The player keeps its geometry; only the frame is missing.
  player(b, 580, 116, 828, 680, {
    still: false,
    source: 'Original',
    time: '--:--.---',
    frameLabel: 'no frame',
    meta: '1920×1080 · 23.976 fps',
    progress: 0,
  });
  K.icon(b, 'empty player icon', ICONS.film, 980, 362, 28, { color: 'color.text.muted' });
  C.text(b, 'empty player head', 'No frame to preview', 730, 408, 528, {
    size: 14,
    weight: 'medium',
    color: 'color.text.secondary',
    align: 'center',
    h: 22,
  });
  C.note('The player needs a scene range. Detection produces the first one and can run on its own.', 760, 436, 468, 34);
  C.btn(914, 488, 'Run scene detection', { primary: true, w: 160, icon: 'play' });
  C.note('The General input resolves, so there is nothing to fix before detection.', 730, 538, 528, 20);

  // Empty timeline
  C.card('empty timeline', 248, 812, 1160, 132);
  C.label('TIMELINE', 264, 824, 80);
  C.note('No scene blocks yet', 348, 825, 220, 14);
  K.rect(b, 'empty track', 264, 854, 1128, 46, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
  C.text(b, 'empty track t', 'Scene detection has not produced a timeline.', 264, 854, 1128, {
    size: 11,
    color: 'color.text.muted',
    align: 'center',
    valign: 'center',
    h: 46,
  });
  C.text(b, 'empty track foot', 'A running encode writes blocks here as it progresses.', 264, 910, 700, {
    size: 9.5,
    color: 'color.text.muted',
    h: 16,
  });
}

// ---------------------------------------------------------------- Video / Loading
if (!ONLY || ONLY === 'loading') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Loading', 1520, 1040, w, h);
  topbar(b, w, { actions: [{ label: 'Cancel', w: 82 }] });
  tabs(b, w, 'Scenes', 'Opening…');
  const C = helpers(b);

  // Rail skeleton, compact 232 px with the two-line range.
  K.rect(b, 'scene rail', 0, 100, 232, h - 100, { fill: 'color.bg.surface' });
  K.line(b, 'scene rail edge', 231, 100, 1, { color: 'color.border.default', h: h - 100 });
  C.sk(16, 118, 80, 12);
  C.sk(172, 114, 44, 20, { r: 10 });
  C.sk(16, 158, 200, 28, { op: 0.35 });
  C.sk(16, 194, 104, 24, { op: 0.35 });
  for (let i = 0; i < 13; i++) {
    const y = 228 + i * 52;
    C.sk(16, y + 5, 22, 9, { op: 0.4 });
    C.sk(52, y + 4, 118, 10, { op: 0.4 });
    C.sk(52, y + 22, 146, 8, { op: 0.3 });
    K.line(b, 'skeleton row sep ' + i, 16, y + 51, 200, { color: 'color.border.subtle' });
  }
  C.sk(16, h - 44, 160, 9);

  // Details skeleton: the narrow left editor pane.
  C.card('loading details', 248, 116, 320, 680);
  C.sk(264, 130, 80, 14);
  C.sk(264, 156, 220, 9, { op: 0.4 });
  C.sk(264, 172, 200, 8, { op: 0.3 });
  C.sk(264, 206, 80, 8, { op: 0.4 });
  for (let i = 0; i < 2; i++) {
    C.sk(264 + i * 152, 224, 136, 30, { op: 0.35, r: 5 });
    C.sk(264 + i * 152, 260, 72, 8, { op: 0.25 });
  }
  C.sk(264, 300, 70, 8, { op: 0.4 });
  C.sk(264, 318, 280, 32, { op: 0.35, r: 5 });
  C.sk(264, 366, 240, 24, { op: 0.25 });
  C.sk(264, 418, 140, 8, { op: 0.4 });
  C.sk(264, 438, 280, 28, { op: 0.35, r: 5 });
  C.sk(264, 472, 280, 28, { op: 0.35, r: 5 });

  // Player skeleton: same split geometry as the populated board.
  C.card('loading player', 580, 116, 828, 680, { fill: 'color.bg.base', stroke: 'color.border.default' });
  C.sk(581, 203, 826, 465, { op: 0.14, r: 0 });
  K.icon(b, 'loading spinner', '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>', 984, 382, 20, { color: 'color.text.secondary' });
  C.text(b, 'loading player head', 'Opening video', 730, 416, 528, { size: 13, weight: 'medium', color: 'color.text.secondary', align: 'center', h: 22 });
  C.note('Reading clip info and warming the first preview.', 760, 442, 468, 20);
  K.rect(b, 'loading progress track', 914, 480, 160, 2, { fill: 'color.border.default', r: 1 });
  K.rect(b, 'loading progress fill', 914, 480, 64, 2, { fill: 'color.brand.default', r: 1 });
  C.note('Original source · FFMS2', 596, 726, 240, 16);

  // Transport skeleton
  C.sk(596, 762, 104, 26, { op: 0.35, r: 4 });
  C.sk(718, 766, 16, 16, { r: 8, op: 0.45 });
  C.sk(742, 770, 84, 10, { op: 0.4 });
  C.sk(836, 770, 76, 10, { op: 0.3 });
  C.sk(1292, 770, 100, 10, { op: 0.3 });

  // Timeline skeleton
  C.card('loading timeline', 248, 812, 1160, 132);
  C.sk(264, 824, 80, 10);
  C.sk(352, 824, 180, 10, { op: 0.4 });
  C.sk(1172, 822, 216, 20, { op: 0.35, r: 4 });
  const widths = [46, 82, 58, 110, 74, 168, 96, 62, 124, 54, 88, 146, 72, 60, 92, 64];
  const widthScale = 1128 / widths.reduce((sum, width) => sum + width, 0);
  let x = 264;
  widths.forEach((width, i) => {
    const w = Math.round(width * widthScale);
    C.sk(x, 872, w - 3, 34, { op: i % 3 === 0 ? 0.35 : 0.25, r: 3 });
    x += w;
  });
  C.sk(264, 918, 240, 10, { op: 0.4 });
  C.sk(1192, 918, 160, 10, { op: 0.4 });
}

// ------------------------------------------------------------------ Video / Error
if (!ONLY || ONLY === 'error') {
  const w = 1440;
  const h = 960;
  const b = K.board(null, 'Video / Error', 3040, 0, w, h);
  topbar(b, w, { actions: [{ label: 'Retry detection', primary: true, w: 136 }] });
  tabs(b, w, 'Scenes', '7 scenes kept');
  const C = helpers(b);

  sceneRail(b, 0, 100, 232, h - 100, {
    selected: 6,
    rows: SCENE_ROWS.slice(0, 7),
    count: '7',
    sub: 'Stopped at scene 07',
    footer: '7 scenes · 3,072 frames',
    issue: 'Stopped',
  });

  details(b, 248, 116, 320, 680, { badge: 'Last detected' });
  K.rect(b, 'split handle', 570, 426, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
  K.line(b, 'split line', 574, 116, 2, { color: 'color.border.subtle', h: 680 });

  // The failure is the content: it replaces the frame, not the editor shell.
  C.card('error panel', 580, 116, 828, 680, { fill: 'color.bg.surface', stroke: 'color.border.default' });
  K.icon(b, 'error glyph', ICONS.alert, 604, 136, 20, { color: 'color.state.danger' });
  C.chip(636, 134, 'Detection failed', 'danger', { h: 20 });
  C.text(b, 'error heading', 'Scene detection stopped', 604, 170, 700, { size: 18, weight: 'semibold', h: 24 });
  C.note('Frame 3,072 · 00:02:08.000 · the 7 scenes already written are kept.', 604, 196, 760, 16);

  K.rect(b, 'error cause', 604, 222, 780, 92, { fill: 'color.bg.base', r: 6, stroke: 'color.border.default' });
  C.label('VAPOURSYNTH EVALUATION ERROR', 620, 236, 300);
  C.text(b, 'error line 1', 'ScriptClip: expected a clip, got None', 620, 254, 740, {
    size: 11,
    family: 'JetBrains Mono',
    color: 'color.text.primary',
    h: 18,
  });
  C.text(b, 'error line 2', '…/scene-detect.vpy:42  ·  detector preset Standard', 620, 276, 740, {
    size: 10,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    h: 16,
  });

  C.text(b, 'error body', 'The source decodes and the first seven scenes are valid. Detection stopped when the script returned no clip for the next range.', 604, 330, 780, 36, {
    size: 10.5,
    color: 'color.text.secondary',
    h: 34,
    lh: 1.5,
  });
  C.btn(604, 380, 'Open script', { w: 106, ghost: true, icon: 'file' });
  C.btn(720, 380, 'Retry detection', { primary: true, w: 140, icon: 'reset' });
  C.note('Retry re-runs from the first undetected frame; it does not discard the kept scenes. Logs are on the Logs tab.', 604, 420, 780, 16);

  // Source check, kept beside the cause rather than in a permanent column.
  K.rect(b, 'error source', 604, 452, 780, 300, { fill: 'color.bg.base', r: 6, stroke: 'color.border.subtle' });
  C.label('SOURCE CHECK', 620, 468, 160);
  C.note('The failure is in detection, not in the decoder.', 620, 484, 740, 14);
  const sourceRows = [
    ['Original', 'FFMS2 · frame 3,072 decodes', true],
    ['Decode', 'Inherits Original · no separate decode', false],
    ['Encode', 'No chunks yet', false],
  ];
  sourceRows.forEach(([name, sub, ok], i) => {
    const ry = 510 + i * 58;
    K.rect(b, 'error source row ' + i, 620, ry, 748, 50, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
    K.icon(b, 'error source icon ' + i, ok ? ICONS.check : ICONS.minus, 634, ry + 18, 14, {
      color: ok ? 'color.state.success' : 'color.text.muted',
    });
    C.text(b, 'error source name ' + i, name, 656, ry + 8, 220, { size: 11.5, weight: 'medium', h: 18 });
    C.text(b, 'error source sub ' + i, sub, 656, ry + 26, 680, { size: 9.5, color: 'color.text.muted', h: 14 });
  });
  K.line(b, 'error source divider', 620, 690, 748, { color: 'color.border.subtle' });
  C.note('Fix the script or switch detection to AVSceneChange, then retry. The decode path is unaffected.', 620, 702, 748, 30);
  C.link(1200, 734, 'Open scene detection settings', { w: 168, right: true });

  // Partial timeline. The untouched remainder is visible, not collapsed.
  C.card('error timeline', 248, 812, 1160, 132);
  C.label('TIMELINE', 264, 824, 80);
  C.note('7 scenes · stopped at 00:02:08.000 · frame 3,072', 348, 825, 400, 14);
  const trackX = 264;
  const trackW = 1128;
  const stopX = trackX + (3072 / 14304) * trackW;
  [0, 60, 120, 180, 240, 300].forEach((sec) => {
    const rx = trackX + (sec * 24 / 14304) * trackW;
    C.text(b, 'error tick ' + sec, `00:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`, rx, 846, 60, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 10,
    });
    C.text(b, 'error frame ' + sec, (sec * 24).toLocaleString('en-US'), rx, 857, 60, {
      size: 8,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      h: 10,
    });
    K.rect(b, 'error tick line ' + sec, rx, 868, 1, 4, { fill: 'color.border.strong' });
  });
  K.rect(b, 'error track', trackX, 872, trackW, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.subtle' });
  let bx = trackX;
  SCENE_ROWS.slice(0, 7).forEach((row, i) => {
    const width = ((row.b - row.a) / 14304) * trackW;
    K.rect(b, 'error block ' + i, bx, 875, Math.max(2, width - 1), 26, {
      fill: i === 6 ? 'color.state.warning-bg' : 'color.bg.raised',
      r: 3,
      stroke: i === 6 ? 'color.state.warning' : 'color.border.subtle',
    });
    if (width > 22) {
      C.text(b, 'error block n ' + i, String(i + 1).padStart(2, '0'), bx + 5, 875, 28, {
        size: 8.5,
        family: 'JetBrains Mono',
        color: 'color.text.secondary',
        valign: 'center',
        h: 26,
      });
    }
    bx += width;
  });
  K.rect(b, 'error stop', stopX - 1, 868, 2, 40, { fill: 'color.state.danger', r: 1 });
  C.text(b, 'error remainder', 'Not detected', stopX + 8, 899, 120, { size: 9, color: 'color.text.muted', h: 12 });
  C.text(b, 'error timeline foot', 'Retry continues from frame 3,072. The seven kept scenes stay editable.', 264, 918, 700, {
    size: 9.5,
    color: 'color.text.muted',
    h: 16,
  });
}

// ----------------------------------------------------------------- Video / Narrow
if (!ONLY || ONLY === 'narrow') {
  const w = 1024;
  const h = 768;
  const b = K.board(null, 'Video / Narrow', 3040, 1040, w, h);
  topbar(b, w, {
    actions: [
      { label: 'Scenes', icon: 'list', w: 92 },
      { label: 'Run encode', primary: true, w: 104 },
    ],
  });
  tabs(b, w, 'Scenes', '96 scenes · rail hidden');

  details(b, 24, 116, 300, 480, { compact: true });
  K.rect(b, 'split handle', 328, 336, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
  K.line(b, 'split line', 332, 116, 2, { color: 'color.border.subtle', h: 480 });
  player(b, 336, 116, 664, 480, {
    source: 'Encode',
    meta: 'Input Decode · 1920×1080',
    time: '00:01:40.700',
    frameLabel: 'frame 2,417',
    progress: 0.413,
  });
  timeline(b, 24, 612, 976, 132, { issue: '1 boundary issue · Scene 09' });
}

// ------------------------------------------------------------------- Video / Wide
if (!ONLY || ONLY === 'wide') {
  const w = 1920;
  const h = 1080;
  const b = K.board(null, 'Video / Wide', 4560, 0, w, h);
  topbar(b, w, { actions: [{ label: 'Run encode', primary: true, w: 104 }] });
  tabs(b, w, 'Scenes', '96 scenes · 14,304 frames');

  sceneRail(b, 0, 100, 232, h - 100, { selected: 6, issue: '1 issue' });
  details(b, 248, 116, 340, 792);
  K.rect(b, 'split handle', 594, 478, 8, 48, { fill: 'color.bg.raised', r: 4, stroke: 'color.border.strong' });
  K.line(b, 'split line', 598, 116, 2, { color: 'color.border.subtle', h: 792 });
  player(b, 600, 116, 1276, 792, {
    source: 'Encode',
    meta: 'Input Decode · 1920×1080',
    time: '00:01:40.700',
    frameLabel: 'frame 2,417',
    progress: 0.413,
  });
  timeline(b, 248, 924, 1640, 132, { issue: '1 boundary issue · Scene 09' });
}

// ---------------------------------------------------------------- board layout
// The page reads as two 1440 px columns with a 64 px gutter, and an alone Wide
// board below. These coordinates are part of the generator: re-running it must
// not scatter the set to the old ad-hoc origins.
const LAYOUT = {
  'Video / Configuration': [0, 0],
  'Video / Scenes': [1504, 0],
  'Video / Logs': [0, 1024],
  'Video / Source menu': [1504, 1024],
  'Video / Scene encoder': [0, 2048],
  'Video / Track map': [1504, 2048],
  'Video / Empty': [0, 3072],
  'Video / Loading': [1504, 3072],
  'Video / Error': [0, 4096],
  'Video / Narrow': [1504, 4096],
  'Video / Wide': [0, 5120],
};
for (const [name, [x, y]] of Object.entries(LAYOUT)) {
  const board = page.findShapes({ type: 'board' }).find((s) => s.name === name && s.parent && s.parent.name === 'Root Frame');
  if (board) {
    board.x = x;
    board.y = y;
  }
}

K.organize(page);
