// Components / Filter composer — one sheet: type, fields, confirm.
// Run after kit.js. Idempotent.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '01 Components');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);
const old = page.findShapes({ type: 'board' }).find((b) => b.name === 'Components / Filter composer');
if (old) old.remove();
const b = K.board(null, 'Components / Filter composer', 1464, 3296, 1400, 1040);
const U = storage.U(b);

K.text(b, 'title', 'Filter composer', 32, 24, 700, { size: 28, weight: 'semibold' });
K.text(b, 'subtitle', 'One sheet: choose a type, set its fields, confirm. There is no second dialog and no JSON.', 32, 62, 1100, { size: 13, color: 'color.text.secondary' });

// Context behind the sheet.
K.rect(b, 'context card', 32, 108, 1336, 620, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });
K.text(b, 'context head', 'Input', 56, 128, 200, { size: 15, weight: 'semibold' });
U.seg(56, 160, ['FFMS2', 'VapourSynth', 'VapourSynth script'], 1, { w: 168 });
K.text(b, 'context filters', 'Filters', 56, 220, 120, { size: 10, weight: 'medium', color: 'color.text.secondary' });

// Scrim and sheet.
K.rect(b, 'scrim', 0, 56, 1400, 800, { fill: 'color.bg.base', op: 0.78 });
K.rect(b, 'sheet', 200, 120, 1000, 800, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.strong' });
K.text(b, 'sheet title', 'Add filter', 224, 144, 300, { size: 20, weight: 'semibold' });
U.note('VapourSynth input · the list behind stays in place', 224, 174, 500, 20);
K.icon(b, 'close', '<path d="M18 6 6 18M6 6l12 12"/>', 1156, 146, 16, { color: 'color.text.muted' });
U.divider(200, 204, 1000);

// Type pane.
U.label('Filter type', 224, 224, 120);
K.rect(b, 'type search', 224, 246, 252, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.focus' });
K.icon(b, 'type search icon', '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 234, 255, 14, { color: 'color.text.muted' });
K.text(b, 'type search text', 'res', 256, 252, 200, { size: 12, color: 'color.text.muted' });
K.text(b, 'group recent', 'RECENT', 224, 292, 120, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
K.rect(b, 'type resize', 224, 310, 252, 40, { fill: 'color.brand.subtle', r: 5, stroke: 'color.brand.default' });
K.icon(b, 'type resize icon', '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>', 236, 322, 16, { color: 'color.brand.text' });
K.text(b, 'type resize name', 'Resize', 262, 318, 160, { size: 12, weight: 'medium' });
K.text(b, 'type resize tag', 'Geometry', 384, 320, 80, { size: 10, color: 'color.text.muted', align: 'right' });
K.rect(b, 'type crop', 224, 354, 252, 40, { fill: 'color.bg.raised', r: 5, stroke: 'color.border.subtle' });
K.icon(b, 'type crop icon', '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>', 236, 366, 16, { color: 'color.text.secondary' });
K.text(b, 'type crop name', 'Crop', 262, 362, 160, { size: 12 });
K.text(b, 'type crop tag', 'Geometry', 384, 364, 80, { size: 10, color: 'color.text.muted', align: 'right' });
K.text(b, 'group temporal', 'TEMPORAL', 224, 412, 120, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
K.rect(b, 'type trim', 224, 430, 252, 40, { fill: 'color.bg.raised', r: 5, stroke: 'color.border.subtle' });
K.text(b, 'type trim name', 'Trim', 262, 438, 160, { size: 12 });
K.text(b, 'type trim tag', 'Temporal', 384, 440, 80, { size: 10, color: 'color.text.muted', align: 'right' });
K.text(b, 'group denoise', 'DENOISE', 224, 488, 120, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
K.rect(b, 'type hqdn3d', 224, 506, 252, 40, { fill: 'color.bg.raised', r: 5, stroke: 'color.border.subtle' });
K.text(b, 'type hqdn3d name', 'hqdn3d', 262, 514, 160, { size: 12 });
K.text(b, 'type hqdn3d tag', 'Denoise', 384, 516, 80, { size: 10, color: 'color.text.muted', align: 'right' });
U.note('Type to filter; ↑ ↓ moves, Enter chooses. The native FFMS2 input has one type, so Add opens this form with it already selected.', 224, 570, 252, 80);
U.note('The pane lists only filters valid for this input; an inapplicable type cannot be chosen.', 224, 668, 252, 60);

// Form pane.
K.text(b, 'form title', 'Resize', 524, 224, 400, { size: 18, weight: 'semibold' });
U.note('Source 3840 × 2160 · 16:9 · 23.976 fps', 524, 252, 500, 20);
U.divider(508, 284, 668);
U.label('Size · pixels', 524, 300, 160);
U.box(524, 322, 180, '1920', { mono: true });
K.rect(b, 'link', 712, 326, 22, 24, { fill: 'color.brand.subtle', r: 4, stroke: 'color.brand.default' });
K.icon(b, 'link icon', '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1 1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1-1"/>', 715, 331, 16, { color: 'color.brand.text' });
U.box(742, 322, 180, '1080', { mono: true });
K.text(b, 'ratio', 'Aspect locked · 16:9', 524, 360, 300, { size: 10.5, color: 'color.text.link' });
U.note('Unlock to set non-square pixels. Reset restores the source ratio.', 700, 358, 300, 20);
K.text(b, 'preset label', 'PRESETS', 524, 392, 100, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
['1080p', '720p', '540p', 'Source'].forEach((p, i) => {
  const x = 524 + i * 70;
  K.rect(b, 'preset ' + i, x, 410, 62, 26, { fill: i === 0 ? 'color.bg.raised' : 'color.bg.sunken', r: 4, stroke: 'color.border.default' });
  K.text(b, 'preset t ' + i, p, x, 410, 62, { size: 10, color: 'color.text.secondary', align: 'center', valign: 'center', h: 26 });
});
U.note('A preset fills the fields. It never locks them.', 828, 412, 300, 20);
U.divider(508, 456, 668);
U.label('Scaler', 524, 470, 100);
U.box(524, 488, 300, 'Lanczos', { chev: true });
U.label('Output format', 848, 470, 140);
U.box(848, 488, 320, 'Keep source', { chev: true });
U.note('Width and height accept even integers. Odd values are rejected inline, never rounded.', 524, 550, 640, 20);
U.note('The form is generated from the filter descriptor. A field the engine does not have cannot be invented here.', 524, 578, 640, 34);

// Footer.
U.divider(200, 840, 1000);
K.rect(b, 'stay box', 224, 862, 14, 14, { fill: 'color.bg.sunken', r: 3, stroke: 'color.border.strong' });
K.text(b, 'stay label', 'Add another', 246, 858, 140, { size: 11.5, color: 'color.text.secondary' });
U.note('Keeps the sheet open with the same type after Add.', 246, 876, 340, 20);
U.btn(944, 856, 'Cancel', { ghost: true, w: 100 });
U.btn(1056, 856, 'Add filter', { primary: true, w: 120 });

// Why this shape.
K.text(b, 'why head', 'WHY ONE SHEET', 32, 940, 200, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
U.note('A popover picker plus an inline form splits one decision across two surfaces and leaves the list reflowing mid-edit.', 32, 960, 420, 44);
K.text(b, 'fast head', 'FASTER PATHS', 490, 940, 200, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
U.note('Search-first, presets, and Duplicate on an existing row cover repeats without reopening this sheet.', 490, 960, 420, 44);
K.text(b, 'native head', 'NATIVE FFMS2', 948, 940, 200, { size: 9.5, weight: 'semibold', color: 'color.text.muted' });
U.note('One filter type means no type pane. The sheet opens directly on the Output format fields.', 948, 960, 420, 44);
K.organize(page);
return { id: b.id, kids: b.children.length };
