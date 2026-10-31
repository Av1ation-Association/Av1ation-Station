// Components / Icon actions — revised for an expanding host component.
// Run in the connected Penpot tab after kit.js. Idempotent: the current board
// is removed, while any renamed superseded board is preserved.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '01 Components');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const old = page.findShapes({ type: 'board' }).find((b) => b.name === 'Components / Icon actions');
if (old) old.remove();
const prior = page.findShapes({ type: 'board' }).find((b) => b.name === 'Components / Icon actions — superseded');

const b = K.board(null, 'Components / Icon actions', 0, 3296, 1400, 852);
K.text(b, 'title', 'Icon actions', 32, 24, 700, { size: 28, weight: 'semibold' });
K.text(b, 'subtitle', 'The control itself widens to hold its label. There is no overlay plaque and no tooltip.', 32, 62, 1180, { size: 13, color: 'color.text.secondary' });

const card = (name, x, y, w, h) => {
  K.rect(b, name + ' / surface', x, y, w, h, { fill: 'color.bg.surface', r: 8, stroke: 'color.border.subtle' });
  return { x, y, w, h };
};
const pill = (name, x, y, w, h, opts = {}) => {
  K.rect(b, name + ' / surface', x, y, w, h, {
    fill: opts.fill || 'color.bg.raised',
    r: opts.r == null ? 6 : opts.r,
    stroke: opts.stroke || 'color.border.default',
    sw: opts.sw || 1,
  });
  return { x, y, w, h };
};
const label = (name, value, x, y, w, opts = {}) => K.text(b, name, value, x, y, w, opts);
const arrow = (name, x, y) => K.icon(b, name, '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', x, y, 16, { color: 'color.text.muted' });

// 1. Collapsed → expanding → expanded, right side.
card('expansion', 32, 96, 820, 248);
label('expansion / head', 'EXPANSION · RIGHT (DEFAULT)', 56, 116, 400, { size: 11, weight: 'semibold', color: 'color.text.muted' });
pill('collapsed', 56, 154, 32, 32, { r: 6 });
K.icon(b, 'collapsed / glyph', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 64, 162, 16, { color: 'color.text.secondary' });
label('collapsed / state', 'collapsed · 32px', 52, 196, 120, { size: 11, color: 'color.text.muted' });

arrow('expansion / arrow 1', 106, 162);
pill('mid', 140, 154, 62, 32, { r: 6, stroke: 'color.border.strong' });
K.icon(b, 'mid / glyph', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 148, 162, 16, { color: 'color.text.secondary' });
label('mid / text', 'Sea…', 170, 162, 28, { size: 13, color: 'color.text.primary' });
label('mid / state', 'in motion · 160ms', 138, 196, 120, { size: 11, color: 'color.text.muted' });

arrow('expansion / arrow 2', 218, 162);
pill('expanded', 252, 154, 112, 32, { r: 6, stroke: 'color.border.strong' });
K.icon(b, 'expanded / glyph', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 260, 162, 16, { color: 'color.text.secondary' });
label('expanded / text', 'Search', 284, 162, 64, { size: 13, weight: 'medium' });
label('expanded / state', 'expanded · 112px', 250, 196, 140, { size: 11, color: 'color.text.muted' });

label('expansion / hint', 'The right edge moves. The icon stays anchored at the leading edge and the label is revealed inside the same fill.', 56, 232, 740, { size: 12, color: 'color.text.secondary' });
label('expansion / motion', 'MOTION', 56, 272, 80, { size: 11, weight: 'semibold', color: 'color.text.muted' });
label('expansion / motion body', 'width 32→112px and label opacity 0→1 over 160ms ease-out; collapse 100ms. Reduced motion: instant, no translate.', 56, 292, 740, { size: 12, color: 'color.text.secondary' });

// 2. Left expansion and tones.
card('left', 872, 96, 496, 248);
label('left / head', 'EXPANSION · LEFT', 896, 116, 300, { size: 11, weight: 'semibold', color: 'color.text.muted' });
pill('left / collapsed', 1152, 154, 32, 32, { r: 6 });
K.icon(b, 'left / collapsed glyph', '<path d="M4 7h16M4 12h16M4 17h10"/>', 1160, 162, 16, { color: 'color.text.secondary' });
pill('left / expanded', 1044, 154, 140, 32, { r: 6, stroke: 'color.border.strong' });
label('left / text', 'More actions', 1060, 162, 84, { size: 13, weight: 'medium' });
K.icon(b, 'left / expanded glyph', '<path d="M4 7h16M4 12h16M4 17h10"/>', 1160, 162, 16, { color: 'color.text.secondary' });
label('left / state', 'collapsed', 1158, 196, 60, { size: 11, color: 'color.text.muted' });
label('left / state 2', 'right edge fixed', 1060, 196, 120, { size: 11, color: 'color.text.muted' });
label('left / note', 'Left expansion is for trailing-edge controls: the icon anchors right so the group does not push the window edge.', 896, 232, 448, { size: 12, color: 'color.text.secondary' });

label('tones / head', 'TONES', 896, 272, 80, { size: 11, weight: 'semibold', color: 'color.text.muted' });
pill('tone ghost', 896, 292, 32, 32, { fill: null, stroke: null });
K.icon(b, 'tone ghost glyph', '<path d="m9 18 6-6-6-6"/>', 904, 300, 16, { color: 'color.text.secondary' });
pill('tone secondary', 944, 292, 32, 32, { fill: 'color.bg.raised' });
K.icon(b, 'tone secondary glyph', '<path d="M12 5v14M5 12h14"/>', 952, 300, 16, { color: 'color.text.secondary' });
pill('tone danger', 992, 292, 32, 32, { fill: 'color.state.danger-bg', stroke: 'color.state.danger' });
K.icon(b, 'tone danger glyph', '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>', 1000, 300, 16, { color: 'color.state.danger' });

// 3. Sizes, focus, disabled.
card('sizes', 32, 368, 820, 188);
label('sizes / head', 'SIZES', 56, 388, 200, { size: 11, weight: 'semibold', color: 'color.text.muted' });
pill('size sm', 56, 418, 28, 28, { r: 5 });
K.icon(b, 'size sm glyph', '<path d="M4 7h16M4 12h16M4 17h10"/>', 62, 424, 14, { color: 'color.text.secondary' });
label('size sm / t', 'sm · 28px · icon 14', 56, 454, 160, { size: 11, color: 'color.text.muted' });
pill('size md', 216, 414, 32, 32, { r: 6 });
K.icon(b, 'size md glyph', '<path d="M4 7h16M4 12h16M4 17h10"/>', 224, 422, 16, { color: 'color.text.secondary' });
label('size md / t', 'md · 32px · icon 16', 216, 454, 160, { size: 11, color: 'color.text.muted' });
pill('size lg', 376, 410, 36, 36, { r: 7 });
K.icon(b, 'size lg glyph', '<path d="M4 7h16M4 12h16M4 17h10"/>', 385, 419, 18, { color: 'color.text.secondary' });
label('size lg / t', 'lg · 36px · icon 18', 376, 454, 160, { size: 11, color: 'color.text.muted' });
pill('focus', 556, 410, 112, 36, { r: 7, stroke: 'color.border.focus', sw: 2 });
K.icon(b, 'focus glyph', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 566, 420, 16, { color: 'color.text.secondary' });
label('focus / t', 'Search', 590, 420, 64, { size: 13, weight: 'medium' });
label('focus / state', 'focus-visible · 2px ring', 556, 454, 180, { size: 11, color: 'color.text.muted' });
label('sizes / note', 'The expanded width is measured from the label, not a fixed max: long labels grow further, and a 40-character label is clamped with an ellipsis.', 56, 492, 760, { size: 12, color: 'color.text.secondary' });

// 4. Status chips use the same expansion.
card('chips', 872, 368, 496, 188);
label('chips / head', 'STATUS CHIPS · SAME RULE', 896, 388, 300, { size: 11, weight: 'semibold', color: 'color.text.muted' });
pill('chip success', 896, 416, 24, 24, { fill: 'color.state.success-bg', stroke: 'color.state.success', r: 999 });
K.icon(b, 'chip success glyph', '<path d="m5 12 4 4L19 7"/>', 902, 422, 12, { color: 'color.state.success', sw: 2 });
pill('chip success x', 932, 412, 124, 32, { fill: 'color.state.success-bg', stroke: 'color.state.success', r: 999 });
K.icon(b, 'chip success x glyph', '<path d="m5 12 4 4L19 7"/>', 944, 420, 16, { color: 'color.state.success', sw: 2 });
label('chip success x label', 'Complete', 968, 420, 72, { size: 12, weight: 'medium', color: 'color.text.primary' });
label('chips / note', 'Collapsed 24px; expanded width comes from the word. The icon never moves; the tone stays on the fill and the glyph.', 896, 456, 448, { size: 12, color: 'color.text.secondary' });
pill('chip warn', 896, 492, 24, 24, { fill: 'color.state.warning-bg', stroke: 'color.state.warning', r: 999 });
K.icon(b, 'chip warn glyph', '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', 902, 498, 12, { color: 'color.state.warning', sw: 2 });
pill('chip danger', 944, 492, 24, 24, { fill: 'color.state.danger-bg', stroke: 'color.state.danger', r: 999 });
K.icon(b, 'chip danger glyph', '<path d="M18 6 6 18M6 6l12 12"/>', 950, 498, 12, { color: 'color.state.danger', sw: 2 });
pill('chip neutral', 992, 492, 24, 24, { fill: 'color.state.neutral-bg', stroke: 'color.state.neutral', r: 999 });
K.icon(b, 'chip neutral glyph', '<circle cx="12" cy="12" r="4"/>', 998, 498, 12, { color: 'color.state.neutral' });

// 5. Placement rules.
card('rules', 32, 568, 1336, 132);
label('rules / head', 'PLACEMENT', 56, 588, 200, { size: 11, weight: 'semibold', color: 'color.text.muted' });
label('rules / body', 'Use an expanding action only where the row can absorb the width change. In a tight cluster, use the labelled button. In a virtualized row, the action must not change the row height. The label is inside the control, so it is never a tooltip and never an overlay on the next control.', 56, 610, 1260, { size: 13, color: 'color.text.secondary' });
label('rules / a11y', 'The button keeps its aria-label; the visible word repeats it. Focus reveals the same word, and the expanded state is reachable by keyboard alone.', 56, 652, 1260, { size: 12, color: 'color.text.muted' });


K.organize(page);
