// Components / Parameter info — one inline icon, one compact info surface.
// Run after kit.js. Idempotent. This is a component board, not a clone of the
// 1440px Encoding screen: copying a dense screen to show one popover made the
// Penpot tab heavy enough to suspend.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '01 Components');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const old = page.findShapes({ type: 'board' }).find((b) => b.name === 'Components / Parameter info');
if (old) old.remove();

const b = K.board(null, 'Components / Parameter info', 0, 4400, 1400, 840);
K.text(b, 'title', 'Parameter info', 32, 24, 700, { size: 28, weight: 'semibold' });
K.text(
  b,
  'subtitle',
  'Every encoder parameter carries its info icon inline with the label. One compact surface holds the CLI key, the description and the documentation link.',
  32,
  62,
  1180,
  { size: 13, color: 'color.text.secondary' }
);

K.rect(b, 'specimen surface', 32, 108, 1336, 620, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });

// Field in context.
K.text(b, 'context label', 'ENCODING · PARAMETER FIELD', 56, 128, 300, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.rect(b, 'field', 56, 154, 720, 132, { fill: 'color.bg.raised', r: 8, stroke: 'color.border.default' });
K.text(b, 'field label', 'Constant Rate Factor', 76, 174, 150, { size: 12, weight: 'medium' });
K.icon(
  b,
  'field info',
  '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  220,
  175,
  16,
  { color: 'color.text.secondary', sw: 1.75 }
);
K.text(b, 'field value', '22', 700, 174, 56, { size: 12, weight: 'semibold', align: 'right' });
K.text(
  b,
  'field help',
  'Controls the quality of the video. Lower values keep more detail.',
  76,
  202,
  640,
  { size: 11.5, color: 'color.text.muted' }
);
K.rect(b, 'slider track', 76, 238, 640, 4, { fill: 'color.bg.sunken', r: 2 });
K.rect(b, 'slider fill', 76, 238, 312, 4, { fill: 'color.brand.default', r: 2 });
K.rect(b, 'slider thumb', 379, 232, 16, 16, { fill: 'color.brand.default', r: 8, stroke: 'color.bg.raised', sw: 2 });

// The info surface, opened below its icon.
K.rect(b, 'info surface', 56, 306, 440, 244, {
  fill: 'color.bg.raised',
  r: 8,
  stroke: 'color.border.strong'
});
K.rect(b, 'key chip', 72, 322, 64, 26, { fill: 'color.bg.sunken', r: 4, stroke: 'color.border.subtle' });
K.text(b, 'key chip text', '--crf', 80, 326, 48, {
  size: 11,
  family: 'JetBrains Mono',
  color: 'color.text.secondary',
  valign: 'center',
  h: 18
});
K.text(b, 'key label', 'CLI KEY', 148, 326, 80, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.text(b, 'info title', 'Constant Rate Factor', 76, 358, 380, { size: 13, weight: 'semibold' });
K.text(
  b,
  'info description',
  'Controls the quality of the video. Lower values keep more detail; higher values compress more. The encoder applies the last value set here.',
  76,
  382,
  396,
  { size: 11.5, color: 'color.text.secondary' }
);
K.rect(b, 'info divider', 76, 444, 396, 1, { fill: 'color.border.subtle' });
K.text(b, 'info docs', 'Documentation', 76, 458, 220, { size: 11.5, color: 'color.text.link' });
K.icon(
  b,
  'info docs arrow',
  '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  166,
  459,
  14,
  { color: 'color.text.link', sw: 1.75 }
);
K.text(b, 'info docs note', 'Opens the parameter reference in a new tab.', 76, 480, 300, {
  size: 10,
  color: 'color.text.muted'
});

// Behaviour and anatomy.
K.text(b, 'behaviour label', 'BEHAVIOUR', 856, 154, 200, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
const bullet = (name, y, copy) => {
  K.rect(b, name + ' dot', 856, y + 7, 4, 4, { fill: 'color.text.muted', r: 2 });
  K.text(b, name, copy, 870, y, 450, { size: 11.5, color: 'color.text.secondary' });
};
bullet('behaviour focus', 176, 'Click or keyboard focus opens it. Hover is supported but never the only trigger.');
bullet('behaviour escape', 206, 'Escape closes it and returns focus to the icon.');
bullet('behaviour placement', 236, 'It opens below the field, or above when the viewport has no room below.');
bullet('behaviour no cover', 266, 'It never covers the label or control it explains.');

K.text(b, 'anatomy label', 'ANATOMY', 856, 314, 200, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.icon(
  b,
  'anatomy icon',
  '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  856,
  338,
  16,
  { color: 'color.text.secondary', sw: 1.75 }
);
K.text(b, 'anatomy icon label', '16 px icon · 4 px after the label · vertically centred', 880, 336, 440, {
  size: 11.5,
  color: 'color.text.secondary'
});
K.text(b, 'anatomy hit label', 'The hit target is 28 × 28 px; the glyph stays 16 px.', 856, 366, 440, {
  size: 11.5,
  color: 'color.text.secondary'
});

K.text(b, 'content label', 'CONTENT', 856, 414, 200, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.text(
  b,
  'content copy',
  'CLI key · label · description · documentation link. The key is never repeated beside the label, and a parameter without help still has a surface for its key and docs link.',
  856,
  436,
  460,
  62,
  { size: 11.5, color: 'color.text.secondary' }
);

// Why this shape.
K.text(b, 'why label', 'WHY ONE SURFACE', 56, 584, 220, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.text(
  b,
  'why copy',
  'A key, a help line and a docs link do not fit under every field. Keeping them here means the grid stays five fields wide and every encoder gets the same explanation.',
  56,
  604,
  380,
  54,
  { size: 11.5, color: 'color.text.secondary' }
);
K.text(b, 'scope label', 'SCOPE', 480, 584, 200, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.text(
  b,
  'scope copy',
  'One component for built-in and user-defined encoders. The catalogue descriptor supplies the key, label, description and doc link; the board does not invent a parameter.',
  480,
  604,
  400,
  54,
  { size: 11.5, color: 'color.text.secondary' }
);
K.text(b, 'never label', 'NEVER', 928, 584, 200, {
  size: 9.5,
  weight: 'semibold',
  color: 'color.text.muted'
});
K.text(
  b,
  'never copy',
  'No hover-only reveal, no duplicate CLI key in the grid, no free-floating help text, and no separate modifier key panel.',
  928,
  604,
  400,
  54,
  { size: 11.5, color: 'color.text.secondary' }
);

K.organize(page);
return { id: b.id, kids: b.children.length };
