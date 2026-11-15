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

  // Penpot's SVG importer keeps a hidden `base-background` rectangle inside every
  // imported icon group. It is never visible, but it doubles the node count of the
  // densest boards and makes the tab slower to traverse. Remove it at the source so
  // regenerated boards do not reintroduce the debris.
  function stripImportedBackground(shape) {
    const pending = [...(shape.children || [])];
    while (pending.length) {
      const child = pending.pop();
      if (child.name === 'base-background' && (child.hidden || child.visible === false)) {
        child.remove();
        continue;
      }
      pending.push(...(child.children || []));
    }
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
    return stripImportedBackground(shape);
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
    return stripImportedBackground(shape);
  }

  // The way back is the station's own silhouette turned around, not a second icon
  // language. The mirrored path uses the same MARK_PATH in a 153x180 box, flipped
  // around the box centre (394 + 547).
  function backMark(parent, x, y, height) {
    const width = +(height * 153 / 180).toFixed(2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="394 2788 153 180"><g transform="translate(941 0) scale(-1 1)"><path fill="${color('color.text.primary')}" fill-rule="evenodd" d="${MARK_PATH}"/></g></svg>`;
    const shape = penpot.createShapeFromSvg(svg);
    shape.name = 'chrome / back mark';
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.resize(width, height);
    return stripImportedBackground(shape);
  }

  // One contrail. The fill fades to nothing at its tail, so the pair reads as motion
  // rather than as a rule; a solid bar reads as an underline under the labels.
  function contrail(parent, name, x, y, w, h) {
    const shape = penpot.createRectangle();
    shape.name = name;
    if (parent) parent.appendChild(shape);
    const p = origin(parent);
    shape.x = p.x + x;
    shape.y = p.y + y;
    shape.resize(w, h);
    shape.borderRadius = h / 2;
    const ink = color('color.text.secondary');
    shape.fills = [{
      fillColorGradient: {
        type: 'linear',
        startX: 0,
        startY: 0,
        endX: 1,
        endY: 0,
        width: 1,
        stops: [
          { color: ink, opacity: 0.5, offset: 0 },
          { color: ink, opacity: 0, offset: 1 },
        ],
      },
    }];
    return shape;
  }

  const ACTION_ICONS = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
    gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  };

  // The global chrome: a 56 px bar with the way back at its head, then the mark and
  // wordmark, then the trail, then the two global actions. There is no global sidebar.
  // Global surfaces own the full width below y=56; project, video and configuration
  // surfaces reserve their local rail inside that width.
  function chrome(parent, width, crumbs, options = {}) {
    const h = options.h || 56;
    const margin = options.margin == null ? 16 : options.margin;
    rect(parent, 'chrome / topbar', 0, 0, width, h, { fill: 'color.bg.surface' });
    line(parent, 'chrome / topbar edge', 0, h - 1, width, { color: 'color.border.default' });

    // The control is 94 px wide: a 4 px inset, the 20.4 px mirrored mark, a 4 px gap and
    // the 64 px label block its two lines rise out of on hover. The root screen is the
    // one trail that carries no way back, and it is the single Projects crumb. Without
    // the control the brand starts at the bar's 16 px gutter, not at the control's -4 px
    // inset, which is the one place the two layouts differ.
    const hasBack = options.back !== false && !(crumbs.length === 1 && crumbs[0].label === 'Projects');
    let x = hasBack ? margin - 4 : margin;
    if (hasBack) {
      backMark(parent, x, (h - 24) / 2, 24);
      const trailX = x + 24.4;
      contrail(parent, 'chrome / back trail 0', trailX, h / 2 - 2.5, 68, 1.5);
      contrail(parent, 'chrome / back trail 1', trailX, h / 2 + 1, 68, 1.5);
      x += 94 + 12;
    }

    const markH = 24;
    mark(parent, x, (h - markH * 180 / 153) / 2, markH, options.markColor);
    x += markH * 153 / 180 + 8;
    // 112 px is the measured advance of the wordmark at 13 px semibold; a narrower box
    // wraps it onto two lines, which the export shows immediately.
    text(parent, 'chrome / wordmark', 'Av1ation Station', x, 0, 112, {
      size: 13,
      weight: 'semibold',
      color: 'color.text.primary',
      valign: 'center',
      h,
    });
    // The box is 112 px so the wordmark cannot wrap, but the divider follows the
    // measured advance (90.5 px at 13 px semibold), not the box.
    x += 91 + 12;
    rect(parent, 'chrome / divider', x, (h - 16) / 2, 1, 16, { fill: 'color.border.strong', r: 0 });
    x += 1 + 12;

    let lastCrumb = null;
    crumbs.forEach((crumb, index) => {
      const w = crumb.w || Math.round(crumb.label.length * 6) + 2;
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

    const actions = options.actions || ['grid', 'gear'];
    const size = 32;
    // The default pair sits 12 px apart, with the last one on the 16 px gutter. A
    // settings draft puts Save and Discard beside the global pair, and the app's
    // action strip is a 4 px rhythm at that width, so the caller can tighten it.
    const gap = options.gap == null ? 12 : options.gap;
    const muted = options.mutedActions || [];
    const active = options.activeActions || [];
    const start = width - margin - actions.length * size - (actions.length - 1) * gap;
    actions.forEach((name, index) => {
      const ax = start + index * (size + gap);
      const on = active.includes(name);
      rect(parent, 'chrome / action ' + name, ax, (h - size) / 2, size, size, { fill: on ? 'color.bg.raised' : null, r: 6 });
      icon(parent, 'chrome / action icon ' + name, ACTION_ICONS[name] || ACTION_ICONS.gear, ax + 8, (h - size) / 2 + 8, 16, {
        color: muted.includes(name) ? 'color.text.muted' : 'color.text.secondary',
        sw: 1.75,
      });
    });
    return { actionStart: start, lastCrumb, backX: hasBack ? margin - 4 : null, height: h };
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
    sectionRail, organize, SECTIONS,
  };
})();
