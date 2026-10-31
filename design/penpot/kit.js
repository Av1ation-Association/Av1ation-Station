// Penpot drawing kit.
//
// Penpot's MCP `storage` is in-memory: a browser-tab suspension clears it, and
// every helper defined there is lost. Boards and the token library survive
// because they live in the file. This file is the durable copy of the helpers,
// so a reset costs one re-injection, not a rebuild.
//
// Usage: read this file, pass its contents to the Penpot MCP `execute_code`
// tool once per connected session. It installs `storage.K`. See README.md.

storage.K = (() => {
  const sets = () => penpot.library.local.tokens.sets;

  const findTok = (name) => {
    for (const set of sets()) {
      const token = set.tokens.find((t) => t.name === name);
      if (token) return token;
    }
    return null;
  };

  // Semantic colours resolve through the primitive ramp. Resolve the `dark`
  // set explicitly: the light set reuses the same token names, so a flat
  // name-to-value map would silently return light values.
  const primitiveSet = sets().find((s) => s.name === 'color.primitive');
  const primitive = {};
  (primitiveSet.tokens || []).forEach((t) => {
    primitive[t.name] = String(t.value);
  });

  const darkSet = sets().find((s) => s.name === 'color.dark');
  const colors = {};
  (darkSet.tokens || []).forEach((t) => {
    let value = t.value;
    if (typeof value === 'string' && value[0] === '{') {
      value = primitive[value.slice(1, -1)] || value;
    }
    colors[t.name] = value;
  });

  const fontSize = {
    '2xs': 11, xs: 12, sm: 13, base: 14, md: 16,
    lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 38,
  };
  const radius = { xs: 2, sm: 4, md: 6, lg: 8, xl: 12, '2xl': 16, full: 999 };
  const weight = { regular: '400', medium: '500', semibold: '600', bold: '700' };

  const color = (name) => colors[name] || name;
  const fill = (name, opacity) => ({
    fillColor: color(name),
    fillOpacity: opacity == null ? 1 : opacity,
  });

  // Shapes store page-absolute coordinates. Every helper takes local
  // coordinates and adds the parent's origin, otherwise a board that does not
  // sit at the page origin exports blank (the §4.2 clipping trap).
  const origin = (parent) => (parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 });

  function bind(shape, tokenName) {
    const token = findTok(tokenName);
    if (!token) return;
    try {
      shape.applyToken(token, ['fill']);
    } catch {
      // Token binding is asynchronous and not every shape type accepts fills.
    }
  }

  function board(parent, name, x, y, w, h, options = {}) {
    const shape = penpot.createBoard();
    shape.name = name;
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.resize(w, h);
    shape.fills = [fill(options.bg || 'color.bg.base')];
    shape.clipContent = options.clip !== false;
    return shape;
  }

  function rect(parent, name, x, y, w, h, options = {}) {
    const shape = penpot.createRectangle();
    shape.name = name;
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.resize(w, h);
    shape.borderRadius = options.r == null ? 2 : options.r;
    shape.fills = options.fill === null ? [] : [fill(options.fill || 'color.bg.surface', options.op)];
    if (options.stroke) {
      shape.strokes = [{
        strokeColor: color(options.stroke),
        strokeWidth: options.sw || 1,
        strokeAlignment: options.align || 'inner',
        strokeStyle: options.strokeStyle || 'solid',
      }];
    }
    if (options.fill && options.fill !== 'none') bind(shape, options.fill);
    return shape;
  }

  function line(parent, name, x, y, w, options = {}) {
    return rect(parent, name, x, y, w, options.h || 1, {
      fill: options.color || 'color.border.subtle',
      r: 0,
    });
  }

  function text(parent, name, value, x, y, w, options = {}) {
    // Penpot returns null for an empty text node. A single space keeps an empty
    // field drawable (for example an unfilled filter input).
    const shape = penpot.createText(String(value).length ? String(value) : ' ');
    shape.name = name;
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    const size = options.size || fontSize.base;
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.growType = 'fixed';
    shape.resize(w, options.h || Math.round(size * 1.5));
    shape.fontFamily = options.family || 'Inter';
    shape.fontSize = String(size);
    shape.fontWeight = String(weight[options.weight] || options.weight || 400);
    // lineHeight is a unitless ratio. A px value is rejected and renders the
    // text invisible in an export, so never pass a pixel number here.
    shape.lineHeight = String(options.lh || 1.45);
    shape.align = options.align || 'left';
    shape.verticalAlign = options.valign || 'top';
    shape.fills = [fill(options.color || 'color.text.primary')];
    bind(shape, options.color || 'color.text.primary');
    return shape;
  }

  function icon(parent, name, inner, x, y, size, options = {}) {
    const strokeColor = color(options.color || 'color.text.secondary');
    const strokeWidth = options.sw == null ? 1.75 : options.sw;
    const paint = options.solid
      ? `fill="${strokeColor}" stroke="none"`
      : `fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint}>${inner}</svg>`;
    const shape = penpot.createShapeFromSvg(svg);
    shape.name = name;
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    if (Math.abs(shape.width - size) > 0.5) shape.resize(size, size);
    return shape;
  }

  // The brand mark: one path, play silhouette with a cockpit cut. The path is
  // authored in a 153x180 box (73:86 ratio); always resize the imported group
  // explicitly, because the SVG importer ignores the width/height attributes.
  const MARK_PATH = 'M547,2878L394,2788L435.9178161621094,2842.418701171875L400.28765869140625,2859.162841796875L425.4383544921875,2878L400.28765869140625,2896.837158203125L435.9178161621094,2913.581298828125L394,2968ZM521.8493041992188,2878L511.369873046875,2885.32568359375L502.9862976074219,2878L511.369873046875,2870.67431640625Z';

  function mark(parent, x, y, w, colorName) {
    const height = +(w * 180 / 153).toFixed(2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="394 2788 153 180"><path fill="${color(colorName || 'color.text.primary')}" fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;
    const shape = penpot.createShapeFromSvg(svg);
    shape.name = 'chrome / mark';
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.resize(w, height);
    return shape;
  }

  const ACTION_ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  };

  // The global chrome: 56px bar, mark, breadcrumb, three actions. There is no
  // global sidebar. Global surfaces own the full width below y=56; project and
  // configuration surfaces reserve their local rail inside that width.
  function chrome(parent, width, crumbs, options = {}) {
    const h = options.h || 56;
    const margin = options.margin == null ? 24 : options.margin;
    rect(parent, 'chrome / topbar', 0, 0, width, h, { fill: 'color.bg.surface' });
    line(parent, 'chrome / topbar edge', 0, h - 1, width, { color: 'color.border.default' });
    const markW = options.markW || 20;
    mark(parent, margin, (h - markW * 180 / 153) / 2, markW, options.markColor);

    let x = margin + markW + 16;
    let lastCrumb = null;
    crumbs.forEach((crumb, index) => {
      const w = crumb.w || Math.round(crumb.label.length * 7.2);
      const crumbX = x;
      text(parent, 'chrome / crumb ' + index, crumb.label, x, 0, w + 4, {
        size: 13,
        weight: crumb.current ? 'medium' : 'regular',
        color: crumb.current ? 'color.text.primary' : 'color.text.secondary',
        valign: 'center',
        h,
      });
      if (index === crumbs.length - 1) lastCrumb = { x: crumbX, w: w + 4 };
      x += w + 4;
      if (index < crumbs.length - 1) {
        icon(parent, 'chrome / crumb sep ' + index, '<path d="m9 18 6-6-6-6"/>', x + 2, (h - 12) / 2, 12, { color: 'color.text.muted', sw: 2 });
        x += 20;
      }
    });
    const actions = options.actions || ['search', 'command', 'gear'];
    const size = 32;
    const gap = 8;
    const start = width - margin - actions.length * size - (actions.length - 1) * gap;
    actions.forEach((name, index) => {
      const ax = start + index * (size + gap);
      rect(parent, 'chrome / action ' + name, ax, (h - size) / 2, size, size, { fill: null, r: 6 });
      icon(parent, 'chrome / action icon ' + name, ACTION_ICONS[name] || ACTION_ICONS.gear, ax + 8, (h - size) / 2 + 8, 16, { color: 'color.text.secondary', sw: 1.75 });
    });
    return { actionStart: start, lastCrumb, height: h };
  }

  // The public website has its own 72px marketing header, not the app's 56px
  // chrome. It is deliberately a separate helper: the site and the app share
  // tokens and the mark, not navigation structure. Narrow headers collapse to a
  // mark, wordmark and menu control.
  const SITE_ICONS = {
    github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    check: '<path d="m5 12 4 4L19 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  };

  function siteButton(parent, name, label, x, y, w, h, options = {}) {
    const tone = options.tone || 'primary';
    const bg =
      tone === 'primary' ? 'color.brand.default' : tone === 'ghost' ? null : 'color.bg.raised';
    const fg = tone === 'primary' ? 'color.text.on-brand' : 'color.text.primary';
    rect(parent, name, x, y, w, h, {
      fill: bg,
      r: options.r == null ? 6 : options.r,
      stroke: tone === 'secondary' ? 'color.border.strong' : null,
    });
    const size = options.size || 13;
    // Centre the icon+label group, not just the label. A fixed 16px inset leaves
    // short labels visibly left-heavy in a wide button (the header Download is
    // the clearest case). The 0.55em estimate is deliberately generous.
    const labelW = Math.round(label.length * size * 0.55) + 4;
    const groupW = labelW + (options.icon ? 26 : 0);
    const start = x + Math.max(12, (w - groupW) / 2);
    if (options.icon) {
      icon(parent, name + ' icon', SITE_ICONS[options.icon], start, y + (h - 16) / 2, 16, {
        color: fg,
        sw: 2,
      });
    }
    text(parent, name + ' label', label, start + (options.icon ? 26 : 0), y, groupW - (options.icon ? 26 : 0) + 8, {
      size,
      weight: 'medium',
      color: fg,
      align: 'left',
      valign: 'center',
      h,
    });
  }

  function siteHeader(parent, width, active, options = {}) {
    const narrow = width < 900;
    const h = options.h || (narrow ? 64 : 72);
    const margin = options.margin == null ? (narrow ? 24 : 120) : options.margin;
    const contentW = width - margin * 2;
    rect(parent, 'site / header', 0, 0, width, h, { fill: 'color.bg.base' });
    line(parent, 'site / header edge', 0, h - 1, width, { color: 'color.border.default' });
    mark(parent, margin, (h - 24 * 180 / 153) / 2, 24, 'color.text.primary');
    text(parent, 'site / wordmark', 'Av1ation Station', margin + 34, 0, 190, {
      size: 14,
      weight: 'semibold',
      valign: 'center',
      h,
    });

    if (narrow) {
      rect(parent, 'site / menu hit', width - margin - 32, (h - 32) / 2, 32, 32, {
        fill: null,
        r: 6,
      });
      icon(parent, 'site / menu', SITE_ICONS.menu, width - margin - 24, (h - 24) / 2, 24, {
        color: 'color.text.secondary',
      });
      return { height: h, margin, contentW };
    }

    const nav = options.nav || ['Product', 'Docs', 'Demo', 'GitHub'];
    let nx = margin + 244;
    nav.forEach((item, i) => {
      const on = item === active;
      const nw = Math.max(50, Math.round(item.length * 7.4) + 8);
      text(parent, 'site / nav ' + i, item, nx, 0, nw, {
        size: 13,
        weight: on ? 'medium' : 'regular',
        color: on ? 'color.text.primary' : 'color.text.secondary',
        valign: 'center',
        h,
      });
      if (on) rect(parent, 'site / nav active ' + i, nx, h - 3, Math.round(item.length * 7.4), 2, {
        fill: 'color.brand.default',
        r: 1,
      });
      nx += nw + 12;
    });

    const right = margin + contentW;
    const downloadW = 138;
    siteButton(parent, 'site / download', 'Download', right - downloadW, (h - 36) / 2, downloadW, 36, {
      icon: 'download',
      size: 12.5,
    });
    text(parent, 'site / version', 'v0.1.0', right - downloadW - 62, 0, 52, {
      size: 10,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      valign: 'center',
      h,
    });
    return { height: h, margin, contentW };
  }

  function siteFooter(parent, width, y, options = {}) {
    const narrow = width < 900;
    const margin = options.margin == null ? (narrow ? 24 : 120) : options.margin;
    const h = options.h || (narrow ? 168 : 132);
    const contentW = width - margin * 2;
    line(parent, 'site / footer edge', margin, y, contentW, { color: 'color.border.default' });
    mark(parent, margin, y + 30, 18, 'color.text.primary');
    text(parent, 'site / footer wordmark', 'Av1ation Station', margin + 26, y + 22, 190, {
      size: 13,
      weight: 'semibold',
      h: 22,
    });
    text(parent, 'site / footer tagline', 'A local workspace for Av1an.', margin, y + 54, 300, {
      size: 11,
      color: 'color.text.muted',
      h: 18,
    });

    const links = options.links || ['Docs', 'Demo', 'GitHub', 'License'];
    if (narrow) {
      links.forEach((item, i) => {
        text(parent, 'site / footer link ' + i, item, margin + (i % 2) * 180, y + 86 + Math.floor(i / 2) * 24, 160, {
          size: 12,
          color: 'color.text.secondary',
          h: 18,
        });
      });
    } else {
      let lx = margin + contentW;
      [...links].reverse().forEach((item, i) => {
        const lw = Math.max(40, Math.round(item.length * 6.4));
        lx -= lw;
        text(parent, 'site / footer link ' + (links.length - 1 - i), item, lx, y + 30, lw, {
          size: 12,
          color: 'color.text.secondary',
          h: 18,
        });
        lx -= 28;
      });
    }
    text(parent, 'site / footer legal', '© 2026 Av1ation Station contributors  ·  GPL-3.0  ·  Built on andean-condor', margin, y + h - 34, contentW, {
      size: 10,
      color: 'color.text.muted',
      h: 16,
    });
    return { height: h };
  }

  // The local section rail is the one navigation model shared by the Project
  // screen, every Configuration section screen and the Video Configuration
  // tab. It is 232px wide and starts below the 56px top bar. `active` is the
  // section currently on screen; no screen scroll-spies, because every screen
  // shows exactly one section. Rows are in pipeline order.
  const SECTIONS = [
    'General',
    'Scene detection',
    'Noise generation',
    'Target quality',
    'Encoding',
    'Concatenation',
    'Quality check',
  ];

  function sectionRail(parent, height, active, options = {}) {
    const x = 0;
    const y = 56;
    const w = 232;
    const h = height - y;
    rect(parent, 'rail', x, y, w, h, { fill: 'color.bg.surface' });
    line(parent, 'rail edge', x + w - 1, y, 1, { color: 'color.border.default', h });
    text(parent, 'rail label', 'CONFIGURATION', x + 20, y + 24, 180, {
      size: 10,
      weight: 'semibold',
      color: 'color.text.muted',
      h: 14,
    });
    SECTIONS.forEach((name, i) => {
      const ry = y + 48 + i * 40;
      const on = name === active;
      const sceneConfigured = options.sceneConfigured !== false;
      if (on) rect(parent, 'rail active ' + i, x + 8, ry, w - 16, 34, { fill: 'color.bg.raised', r: 5 });
      rect(parent, 'rail dot ' + i, x + 20, ry + 13, 8, 8, {
        fill: i === 1 && sceneConfigured ? 'color.state.success' : on ? 'color.text.secondary' : 'color.border.strong',
        r: 4,
      });
      text(parent, 'rail label ' + i, name, x + 42, ry, 130, {
        size: 11.5,
        weight: on ? 'medium' : 'regular',
        color: on ? 'color.text.primary' : 'color.text.secondary',
        valign: 'center',
        h: 34,
      });
      if (i === 1 && options.sceneCount) {
        text(parent, 'rail count 1', options.sceneCount, x + 180, ry, 32, {
          size: 9,
          family: 'JetBrains Mono',
          color: 'color.text.muted',
          align: 'right',
          valign: 'center',
          h: 34,
        });
      }
    });
    const ry = y + 48 + SECTIONS.length * 40;
    line(parent, 'rail sep', x + 20, ry + 8, w - 40, { color: 'color.border.subtle' });
    text(parent, 'queue label', 'QUEUE', x + 20, ry + 24, 100, {
      size: 10,
      weight: 'semibold',
      color: 'color.text.muted',
      h: 14,
    });
    text(parent, 'rail queue', 'Queue', x + 42, ry + 44, 100, { size: 11.5, color: 'color.text.secondary', h: 20 });
    text(parent, 'rail queue count', options.queue || '12 videos', x + 140, ry + 44, 72, {
      size: 9,
      family: 'JetBrains Mono',
      color: 'color.text.muted',
      align: 'right',
      h: 20,
    });
    text(parent, 'rail add', '+ Add videos', x + 42, ry + 70, 120, { size: 11, color: 'color.brand.text', h: 18 });
  }

  // Boards are appended to the page as they are drawn, so a redraw leaves the
  // layer tree in creation order (latest board first in the panel). Review order
  // is the layer order: row-major, left to right. Call this once at the end of
  // every generator; it makes the panel match the sheet after any partial run.
  function organize(page) {
    const root = page.findShapes({ type: 'board' }).find((b) => b.name === 'Root Frame');
    if (!root) return;
    // insertChild moves an existing layer without restructuring. Assigning
    // `children` instead reverses the list, because the setter and getter order
    // the stack from opposite ends.
    const sorted = [...root.children].sort((a, b) => a.y - b.y || a.x - b.x);
    sorted.forEach((child, i) => root.insertChild(i, child));
  }

  return {
    colors, fontSize, radius, weight, color, fill, board, rect, line, text, icon, bind, mark, chrome,
    siteHeader, siteFooter, siteButton, siteIcons: SITE_ICONS, sectionRail, organize, SECTIONS,
  };
})();
