// Video / Concatenation — the video's Concatenation section.
//
// The Method card carries the method radios and the selected method's grouped track
// map, because the method decides which streams can be mapped. Chapters, metadata and
// extra inputs are separate engine fields and separate cards. The live board is the
// authority; this generator is its checked-in source.
//
// Run after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '06 Video');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Video / Concatenation';
for (const oldName of [NAME, 'Video / Track map']) {
  const old = page.findShapes({ type: 'board' }).find((b) => b.name === oldName);
  if (old) old.remove();
}

const W = 1440;
const H = 1660;
const b = K.board(null, NAME, 1504, 2048, W, H);
K.chrome(b, W, [
  { label: 'Projects' },
  { label: 'Demo Project' },
  { label: 'bunny_1080p.mkv' },
  { label: 'Concatenation', current: true },
]);

const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
const note = (name, value, x, y, w, h) =>
  K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.45 });
const label = (name, value, x, y, w) =>
  K.text(b, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });
const card = (name, x, y, w, h) =>
  K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.default' });

K.rect(b, 'btn Start', 1228, 12, 92, 32, { fill: 'color.brand.default', r: 5 });
text('btn t Start', 'Start', 1228, 12, 92, {
  size: 11, weight: 'semibold', color: 'color.text.on-brand',
  align: 'center', valign: 'center', h: 32,
});

const TABS = [
  ['Configuration', 32, 107],
  ['Scenes', 176, 56],
  ['History', 262, 58],
  ['Logs', 338, 41],
];
K.rect(b, 'video tabs', 0, 56, W, 44, { fill: 'color.bg.base', r: 0 });
TABS.forEach(([tab, x, width]) => {
  text('tab ' + tab, tab, x, 56, width, {
    size: 12.5, color: 'color.text.muted', align: 'center', valign: 'center', h: 44,
  });
});
K.rect(b, 'tab edge', 0, 100, W, 1, { fill: 'color.border.default', r: 0 });
text('tab note', '96 scenes · 3 overrides', 1088, 56, 320, {
  size: 10, family: 'JetBrains Mono', color: 'color.text.muted',
  align: 'right', valign: 'center', h: 44,
});

text('concat title', 'Concatenation', 32, 118, 160, { size: 20, weight: 'semibold', h: 28 });
K.rect(b, 'concat inherited chip', 190, 120, 82, 22, {
  fill: null, r: 999, stroke: 'color.border.strong',
});
text('concat inherited', 'INHERITED', 190, 120, 82, {
  size: 8.5, family: 'JetBrains Mono', color: 'color.text.muted',
  align: 'center', valign: 'center', h: 22,
});
note('concat description', 'Joins the encoded chunks into the final file.', 32, 150, 900, 20);

// ---- Method card -----------------------------------------------------------
card('concat method card', 32, 192, 1040, 780);
text('concat method title', 'Method', 52, 214, 300, { size: 16, weight: 'semibold', h: 24 });
note('concat method sub', 'Default for every video; a video may choose a different method.', 52, 238, 760);

const METHODS = [
  ['mkvmerge', 'Matroska-native. Video is the encoded track; source audio, subtitles and attachments follow.', true],
  ['FFmpeg', 'Broad format support. Video is the encoded track; source streams can be copied or filtered.', false],
  ['IVF', 'Raw AV1 elementary stream. No container, no other streams, no chapters.', false],
];
METHODS.forEach(([name, detail, on], i) => {
  const x = 52 + i * 336;
  K.rect(b, 'concat method ' + name, x, 274, 324, 112, {
    fill: on ? 'color.brand.subtle' : 'color.bg.sunken',
    r: 8,
    stroke: on ? 'color.brand.default' : 'color.border.default',
  });
  K.rect(b, 'concat method radio ' + name, x + 16, 290, 14, 14, {
    fill: on ? 'color.brand.default' : null, r: 7,
    stroke: on ? 'color.brand.default' : 'color.border.strong',
  });
  if (on) K.rect(b, 'concat method dot ' + name, x + 20, 294, 6, 6, { fill: 'color.text.on-brand', r: 3 });
  text('concat method label ' + name, name, x + 38, 286, 240, {
    size: 11.5, weight: 'medium', color: on ? 'color.text.primary' : 'color.text.secondary', h: 22,
  });
  note('concat method detail ' + name, detail, x + 16, 314, 292, 56);
});

K.rect(b, 'concat method rule', 52, 408, 1000, 1, { fill: 'color.border.subtle', r: 0 });
text('concat track title', 'Track map', 52, 426, 200, { size: 13, weight: 'semibold', h: 22 });
note('concat track note', 'Choose what travels with the encoded scenes. The encoded video is always included.', 52, 448, 700);
text('concat reset action', 'Reset map', 792, 428, 100, {
  size: 10, color: 'color.brand.text', align: 'right', h: 18,
});
text('concat probe', 'Probe again', 916, 428, 104, {
  size: 10.5, color: 'color.brand.text', align: 'right', h: 18,
});
text('concat track count', '5 included · 6 total', 842, 448, 178, {
  size: 9, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 18,
});

K.rect(b, 'concat tracks', 52, 492, 976, 396, {
  fill: 'color.bg.sunken', r: 8, stroke: 'color.border.subtle',
});

const groupHeader = (name, count, y) => {
  text('map chevron ' + name, '▾', 64, y + 6, 14, { size: 10, color: 'color.text.muted', h: 18 });
  text('map group ' + name, name, 82, y, 160, { size: 11, weight: 'semibold', h: 30, valign: 'center' });
  text('map count ' + name, count, 852, y, 156, {
    size: 9, family: 'JetBrains Mono', color: 'color.text.muted',
    align: 'right', valign: 'center', h: 30,
  });
};

// Shared Switch geometry: 36 x 20 track, 14 px thumb, 3 px off / 18 px on. The dropped
// row exists to show both positions; the old bespoke switch pinned its thumb at 13 px.
const toggle = (name, x, y, on) => {
  K.rect(b, name + ' track', x, y, 36, 20, {
    fill: on ? 'color.brand.default' : 'color.bg.raised', r: 999,
    stroke: on ? 'color.brand.default' : 'color.border.strong',
  });
  K.rect(b, name + ' thumb', x + (on ? 18 : 3), y + 3, 14, 14, {
    fill: on ? 'color.text.on-brand' : 'color.text.muted', r: 7,
  });
};

const row = (name, y, detail, on) => {
  K.rect(b, 'map rule ' + name, 52, y, 976, 1, { fill: 'color.border.subtle', r: 0 });
  toggle('map switch ' + name, 66, y + 16, on);
  text('map name ' + name, name, 116, y + 7, 600, { size: 11.5, weight: 'medium', h: 18 });
  note('map sub ' + name, detail, 116, y + 24, 600, 16);
  text('map state ' + name, on ? 'Copied' : 'Dropped', 880, y + 8, 84, {
    size: 9, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 16,
  });
  text('map options ' + name, '▾', 1000, y + 6, 16, { size: 10, color: 'color.text.muted', h: 18 });
};

groupHeader('Audio', '2 / 2', 504);

// The encoded video is locked at main-input scope; no source video row is offered.
K.rect(b, 'map rule video', 52, 534, 976, 1, { fill: 'color.border.subtle', r: 0 });
text('map name video', 'Video · encoded', 66, 541, 500, { size: 11.5, weight: 'medium', h: 18 });
note('map sub video', 'From the encoded scenes · always included', 66, 558, 500, 16);
K.rect(b, 'map always chip', 872, 549, 96, 20, { fill: null, r: 999, stroke: 'color.border.strong' });
text('map always', 'ALWAYS', 872, 549, 96, {
  size: 8.5, family: 'JetBrains Mono', color: 'color.text.muted',
  align: 'center', valign: 'center', h: 20,
});
text('map options video', '▾', 1000, 541, 16, { size: 10, color: 'color.text.muted', h: 18 });

row('Audio 1 · English · AAC · 5.1', 586, 'Input · AAC · 6 ch · eng · default', true);
row('Audio 2 · Commentary · AAC · stereo', 638, 'Input · AAC · 2 ch · eng', true);

groupHeader('Subtitles', '1 / 2', 690);
row('Subtitle 1 · English · SRT', 720, 'Input · SRT · eng · default', true);
row('Subtitle 2 · Signs · ASS', 772, 'Input · ASS · eng', false);

groupHeader('Attachments', '1 source', 824);
text('map attach kind', 'ATTACH', 66, 848, 44, {
  size: 7.5, family: 'JetBrains Mono', color: 'color.text.muted', h: 14,
});
text('map attach name', 'cover.jpg', 116, 846, 300, { size: 11, weight: 'medium', h: 16 });
note('map attach detail', 'image/jpeg · 42 KB · copied automatically', 116, 862, 420, 14);
text('map attach state', 'Read-only', 880, 846, 84, {
  size: 9, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 16,
});

note('concat track foot', 'Source streams come from the main input. The encoded video track is never replaced or dropped here.', 52, 898, 620);
note('concat reset', 'Reset removes options and additions.', 690, 898, 338);

// ---- Aside -----------------------------------------------------------------
card('concat aside', 1096, 192, 312, 258);
text('concat aside title', 'What it produces', 1116, 212, 240, { size: 13, weight: 'semibold', h: 22 });
[
  ['Final file', 'The encoded chunks joined in scene order.'],
  ['Track metadata', 'Chapters, tracks and attachments as configured.'],
  ['Muxer output', 'Written atomically; the chunks stay on disk.'],
].forEach(([title, detail], i) => {
  const y = 246 + i * 48;
  text('concat output ' + i, title, 1116, y, 250, { size: 10.5, weight: 'medium', h: 16 });
  note('concat output detail ' + i, detail, 1116, y + 17, 270, 28);
});

// ---- Chapters --------------------------------------------------------------
card('concat chapters card', 32, 992, 1040, 170);
text('chapters title', 'Chapters', 52, 1012, 240, { size: 14, weight: 'semibold', h: 22 });
note('chapters sub', 'Copy the source chapter list into the output.', 52, 1034, 700);
toggle('chapters switch', 52, 1068, true);
text('chapters copy', 'Copy source chapters', 100, 1066, 320, { size: 11.5, weight: 'medium', h: 20 });
text('chapters state', 'Copied · 12 chapters', 820, 1068, 200, {
  size: 9, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 18,
});
label('chapters lang label', 'Language', 52, 1102, 120);
label('chapters charset label', 'Charset', 268, 1102, 120);
K.rect(b, 'chapters lang field', 52, 1118, 200, 28, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('chapters lang value', 'eng', 62, 1118, 180, { size: 11, valign: 'center', h: 28 });
K.rect(b, 'chapters charset field', 268, 1118, 200, 28, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('chapters charset value', 'UTF-8', 278, 1118, 180, { size: 11, valign: 'center', h: 28 });
note('chapters lang note', 'mkvmerge only; FFmpeg has no chapter language or charset.', 496, 1118, 480, 28);

// ---- Metadata --------------------------------------------------------------
card('concat metadata card', 32, 1182, 1040, 220);
text('metadata title', 'Metadata', 52, 1202, 240, { size: 14, weight: 'semibold', h: 22 });
note('metadata sub', 'Copy the source tags, or write this output title and tags.', 52, 1224, 760);
toggle('metadata switch', 52, 1256, true);
text('metadata copy', 'Copy source tags', 100, 1254, 320, { size: 11.5, weight: 'medium', h: 20 });
text('metadata state', 'Copied', 820, 1256, 200, {
  size: 9, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 18,
});
label('metadata title label', 'Title', 52, 1292, 300);
K.rect(b, 'metadata title field', 52, 1308, 420, 28, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('metadata title value', 'Big Buck Bunny', 62, 1308, 400, { size: 11, valign: 'center', h: 28 });
text('metadata tags label', 'Tags', 500, 1292, 160, {
  size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14,
});
text('metadata add tag', '+ Add tag', 900, 1292, 80, { size: 10, color: 'color.brand.text', align: 'right', h: 14 });
const tagRow = (y, key, value) => {
  K.rect(b, 'tag key ' + key, 500, y, 180, 26, { fill: 'color.bg.sunken', r: 4, stroke: 'color.border.default' });
  text('tag key text ' + key, key, 508, y, 164, {
    size: 9.5, family: 'JetBrains Mono', color: 'color.text.secondary', valign: 'center', h: 26,
  });
  K.rect(b, 'tag value ' + key, 688, y, 288, 26, { fill: 'color.bg.sunken', r: 4, stroke: 'color.border.default' });
  text('tag value text ' + key, value, 696, y, 272, { size: 10, valign: 'center', h: 26 });
};
tagRow(1308, 'TITLE', 'Big Buck Bunny');
tagRow(1340, 'ENCODER', 'Av1ation Station');
note('metadata note', 'Keys replace an existing value; they are never duplicated.', 52, 1364, 420);

// ---- Extra inputs ----------------------------------------------------------
card('concat extra card', 32, 1422, 1040, 170);
text('extra title', 'Extra inputs', 52, 1442, 240, { size: 14, weight: 'semibold', h: 22 });
note('extra sub', 'Merged after the main input in list order. Each file is probed when its card is opened.', 52, 1464, 760);
K.rect(b, 'extra add', 944, 1434, 104, 30, { fill: null, r: 5, stroke: 'color.border.strong' });
text('extra add label', '+ Add file', 944, 1434, 104, {
  size: 10.5, color: 'color.text.primary', align: 'center', valign: 'center', h: 30,
});
K.rect(b, 'extra row', 52, 1496, 976, 48, { fill: 'color.bg.sunken', r: 6, stroke: 'color.border.subtle' });
text('extra chevron', '▸', 64, 1502, 14, { size: 10, color: 'color.text.muted', h: 18 });
text('extra name', 'commentary.mka', 88, 1503, 320, { size: 11, weight: 'medium', h: 16 });
note('extra path', 'D:/media/bunny/commentary.mka', 88, 1519, 420, 14);
text('extra chip', 'MKVMERGE', 872, 1510, 96, {
  size: 8, family: 'JetBrains Mono', color: 'color.text.muted', align: 'right', h: 16,
});
text('extra move', '↑↓', 956, 1510, 40, {
  size: 10, color: 'color.text.secondary', align: 'right', h: 16,
});
note('extra note', 'Changing a path clears the old track, chapter and metadata choices.', 52, 1556, 760);

note('concat page note', 'Chunks are retained after concatenation unless Storage opts in to deleting them.', 32, 1612, 900);

K.organize(page);
return {
  board: NAME,
  children: page.findShapes({ type: 'board' }).find((x) => x.name === NAME)?.children.length,
};
