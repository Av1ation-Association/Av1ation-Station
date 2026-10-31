// Video / Track map — the child screen of the video's Concatenation section.
// It makes the engine's track model visible: the encoded scenes own the only
// video track, and every other output stream comes from the video's input.
// Run after kit.js. Idempotent by board name.
const K = storage.K;
const page = penpot.currentFile.pages.find((p) => p.name === '06 Video');
if (penpot.currentPage.id !== page.id) await penpot.openPage(page);

const NAME = 'Video / Track map';
const old = page.findShapes({ type: 'board' }).find((b) => b.name === NAME);
if (old) old.remove();

const W = 1440;
const H = 960;
const b = K.board(null, NAME, 1504, 2048, W, H);
K.chrome(b, W, [
  { label: 'Projects' },
  { label: 'Big Buck Bunny' },
  { label: 'bunny_2160p.mkv' },
  { label: 'Concatenation' },
  { label: 'Track map', current: true },
]);

const tw = (s, size) => Math.round(String(s).length * size * 0.56);
const text = (name, value, x, y, w, o) => K.text(b, name, value, x, y, w, o);
const note = (name, value, x, y, w, h) =>
  K.text(b, name, value, x, y, w, { size: 10, color: 'color.text.muted', h: h || 16, lh: 1.5 });
const label = (name, value, x, y, w) =>
  K.text(b, name, value, x, y, w, { size: 9.5, weight: 'medium', color: 'color.text.secondary', h: 14 });
const card = (name, x, y, w, h) =>
  K.rect(b, name, x, y, w, h, { fill: 'color.bg.surface', r: 10, stroke: 'color.border.subtle' });

// Top bar draft controls.
K.rect(b, 'topbar dot', 976, 25, 6, 6, { fill: 'color.state.warning', r: 3 });
text('topbar status', 'Unsaved changes', 990, 0, 126, { size: 10.5, color: 'color.text.secondary', valign: 'center', h: 56 });
K.rect(b, 'topbar cancel', 1128, 12, 76, 32, { fill: null, r: 5 });
text('topbar cancel t', 'Cancel', 1128, 12, 76, { size: 11, color: 'color.text.secondary', align: 'center', valign: 'center', h: 32 });
K.rect(b, 'topbar save', 1212, 12, 76, 32, { fill: 'color.brand.default', r: 5 });
text('topbar save t', 'Save', 1212, 12, 76, { size: 11, weight: 'semibold', color: 'color.text.on-brand', align: 'center', valign: 'center', h: 32 });

// Local rail: the video's Configuration sections, not the project queue.
const SECTIONS = ['General', 'Scene detection', 'Noise generation', 'Target quality', 'Encoding', 'Concatenation', 'Quality check'];
K.rect(b, 'rail', 0, 56, 232, H - 56, { fill: 'color.bg.surface' });
K.rect(b, 'rail edge', 231, 56, 1, H - 56, { fill: 'color.border.default', r: 0 });
label('rail caption', 'CONFIGURATION', 20, 88, 180);
note('rail sub', 'Video overrides', 20, 104, 180, 14);
SECTIONS.forEach((name, i) => {
  const y = 144 + i * 40;
  const on = name === 'Concatenation';
  if (on) K.rect(b, 'rail active ' + i, 8, y, 216, 34, { fill: 'color.bg.raised', r: 5 });
  K.rect(b, 'rail dot ' + i, 20, y + 13, 8, 8, {
    fill: i <= 5 ? 'color.state.success' : 'color.border.strong',
    r: 4,
  });
  text('rail label ' + i, name, 42, y, 150, {
    size: 11.5,
    weight: on ? 'medium' : 'regular',
    color: on ? 'color.text.primary' : 'color.text.secondary',
    valign: 'center',
    h: 34,
  });
  text('rail status ' + i, i <= 5 ? 'Done' : '—', 158, y, 72, {
    size: 9,
    family: 'JetBrains Mono',
    color: 'color.text.muted',
    align: 'right',
    valign: 'center',
    h: 34,
  });
});
K.rect(b, 'rail sep', 20, 438, 192, 1, { fill: 'color.border.subtle', r: 0 });
note(
  'rail note',
  'The project chooses the method. This track map belongs to this video, because it describes these encoded streams.',
  20,
  456,
  192,
  60,
);
text('rail reset', 'Reset track map', 42, 550, 150, { size: 11, color: 'color.brand.text', h: 18 });
note('rail lock', 'Encoding is locked while a run is active.', 20, 578, 192, 28);

// Header.
text('title', 'Track map', 264, 80, 400, { size: 20, weight: 'semibold', h: 28 });
note(
  'subtitle',
  'Choose what travels with the encoded video. The video track is already decided by the encoded scenes; audio, subtitles and attachments come from the input.',
  264,
  112,
  760,
  32,
);
K.rect(b, 'method chip', 1112, 86, 296, 26, { fill: 'color.bg.raised', r: 999, stroke: 'color.border.default' });
K.icon(b, 'method icon', '<path d="M4 7h16M4 12h16M4 17h10"/>', 1126, 92, 14, { color: 'color.text.secondary' });
text('method t', 'mkvmerge · inherited from project', 1148, 86, 250, {
  size: 10.5,
  color: 'color.text.secondary',
  valign: 'center',
  h: 26,
});

// The encoded video track is a fact, not a choice.
card('video row', 264, 160, 1144, 74);
K.icon(
  b,
  'video lock',
  '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  288,
  188,
  16,
  { color: 'color.text.secondary' },
);
text('video title', 'Video · from encoded scenes', 318, 174, 440, { size: 13, weight: 'medium', h: 20 });
note(
  'video sub',
  'AV1 · 10-bit · 4:2:0 · every encoded chunk is concatenated into this one track. The source video is never copied.',
  318,
  196,
  820,
  20,
);
K.rect(b, 'video chip', 1292, 178, 92, 22, { fill: 'color.state.success-bg', r: 999, stroke: 'color.state.success' });
text('video chip t', 'Locked', 1302, 178, 72, { size: 10, color: 'color.state.success', valign: 'center', h: 22 });

// Left: virtualized track list.
card('track list', 264, 250, 704, 592);
text('list head', 'Tracks', 288, 270, 120, { size: 14, weight: 'semibold', h: 20 });
note('list count', '5 included · 9 total', 360, 273, 220, 16);
text('list propose', 'Probe again', 840, 272, 104, { size: 10.5, color: 'color.brand.text', align: 'right', h: 16 });
K.rect(b, 'list rule', 288, 298, 656, 1, { fill: 'color.border.subtle', r: 0 });

const TRACKS = [
  ['Video · encoded', 'AV1 10-bit · from encoded chunks', 'locked'],
  ['Audio 1 · English 5.1', 'Input · AAC 48 kHz · 6 ch', 'on', true],
  ['Audio 2 · Commentary', 'Input · AAC 48 kHz · 2 ch', 'on'],
  ['Subtitle 3 · English SDH', 'Input · SubRip · forced', 'on'],
  ['Subtitle 4 · Français', 'Input · SubRip', 'off'],
  ['Attachment 5 · cover.jpg', 'Input · JPEG · 480 KB', 'on'],
  ['Extra file · commentary.m4a', 'Added file · AAC stereo', 'on'],
];
TRACKS.forEach(([name, sub, state, selected], i) => {
  const y = 304 + i * 58;
  if (selected) K.rect(b, 'tr sel ' + i, 280, y, 672, 54, { fill: 'color.brand.subtle', r: 6 });
  if (state === 'locked') {
    K.icon(b, 'tr lock ' + i, '<rect width="12" height="8" x="2" y="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>', 292, y + 19, 16, { color: 'color.text.muted' });
  } else {
    const on = state === 'on';
    K.rect(b, 'tr toggle ' + i, 292, y + 18, 18, 18, {
      fill: on ? 'color.brand.default' : null,
      r: 4,
      stroke: on ? 'color.brand.default' : 'color.border.strong',
    });
    if (on) K.icon(b, 'tr check ' + i, '<path d="m5 12 4 4 10-10"/>', 295, y + 21, 12, { color: 'color.text.on-brand', sw: 2.2 });
  }
  text('tr name ' + i, name, 324, y + 10, 430, {
    size: 11.5,
    weight: i === 0 ? 'regular' : 'medium',
    color: i === 0 ? 'color.text.muted' : 'color.text.primary',
    h: 18,
  });
  note('tr sub ' + i, sub, 324, y + 29, 480, 14);
  if (state === 'locked') {
    K.rect(b, 'tr locked chip ' + i, 846, y + 17, 76, 20, { fill: 'color.state.neutral-bg', r: 999, stroke: 'color.state.neutral' });
    text('tr locked t ' + i, 'Always', 853, y + 17, 62, { size: 9.5, color: 'color.state.neutral', valign: 'center', h: 20 });
  } else {
    K.icon(b, 'tr chevron ' + i, '<path d="m9 18 6-6-6-6"/>', 916, y + 20, 14, { color: 'color.text.muted' });
  }
  if (i < TRACKS.length - 1) K.rect(b, 'tr rule ' + i, 304, y + 56, 624, 1, { fill: 'color.border.subtle', r: 0 });
});
note('list foot', '7 of 9 tracks shown · the list is virtualized; 40-track remuxes stay one list.', 288, 728, 600, 16);
text('list add', '+ Add an extra file', 288, 764, 180, { size: 10.5, color: 'color.brand.text', h: 16 });
note('list tip', 'Select a row to edit its container metadata. Copy is the default for every source stream.', 288, 790, 640, 28);

// Right: method-specific inspector.
card('detail', 984, 250, 424, 592);
text('detail head', 'Audio 1', 1008, 270, 200, { size: 15, weight: 'semibold', h: 22 });
K.rect(b, 'detail chip', 1300, 270, 84, 20, { fill: 'color.state.success-bg', r: 999, stroke: 'color.state.success' });
text('detail chip t', 'Included', 1310, 270, 64, { size: 9.5, color: 'color.state.success', valign: 'center', h: 20 });
note('detail sub', 'English 5.1 · source stream 1 of 3 audio', 1008, 294, 376, 16);

label('NAME', 'NAME', 1008, 326, 200);
K.rect(b, 'name box', 1008, 344, 376, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('name value', 'English 5.1 (main)', 1020, 344, 340, { size: 11, valign: 'center', h: 32 });
label('LANGUAGE', 'LANGUAGE', 1008, 392, 160);
K.rect(b, 'lang box', 1008, 410, 180, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('lang value', 'English (eng)', 1020, 410, 140, { size: 11, valign: 'center', h: 32 });
K.icon(b, 'lang chev', '<path d="m6 9 6 6 6-6"/>', 1160, 420, 14, { color: 'color.text.muted' });
label('DELAY', 'DELAY', 1204, 392, 160);
K.rect(b, 'delay box', 1204, 410, 180, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('delay value', '0 ms', 1216, 410, 140, { size: 11, family: 'JetBrains Mono', valign: 'center', h: 32 });

label('FLAGS', 'FLAGS', 1008, 462, 100);
text('more flags', 'More flags', 1284, 462, 100, { size: 10, color: 'color.brand.text', align: 'right', h: 14 });
const FLAGS = [
  ['Default', true],
  ['Forced', false],
  ['Enabled', true],
];
FLAGS.forEach(([name, on], i) => {
  const x = 1008 + i * 126;
  K.rect(b, 'flag toggle ' + i, x, 482, 28, 16, { fill: on ? 'color.brand.default' : 'color.bg.raised', r: 8, stroke: on ? null : 'color.border.strong' });
  K.rect(b, 'flag knob ' + i, on ? x + 14 : x + 2, 484, 12, 12, { fill: 'color.text.on-brand', r: 6 });
  text('flag name ' + i, name, x + 36, 480, 90, { size: 10.5, color: 'color.text.secondary', h: 20 });
});

K.rect(b, 'detail rule 1', 1008, 518, 376, 1, { fill: 'color.border.subtle', r: 0 });
text('mkv head', 'mkvmerge options', 1008, 532, 240, { size: 11.5, weight: 'semibold', h: 18 });
label('SBR / CORE', 'AAC SBR', 1008, 560, 220);
K.rect(b, 'sbr box', 1008, 578, 100, 32, { fill: 'color.bg.sunken', r: 5, stroke: 'color.border.default' });
text('sbr value', 'Not set', 1020, 578, 74, { size: 11, valign: 'center', h: 32 });
K.icon(b, 'sbr chev', '<path d="m6 9 6 6 6-6"/>', 1078, 588, 14, { color: 'color.text.muted' });
label('reduce label', 'REDUCE TO CORE', 1120, 560, 220);
K.rect(b, 'reduce toggle', 1120, 580, 28, 16, { fill: 'color.bg.raised', r: 8, stroke: 'color.border.strong' });
K.rect(b, 'reduce knob', 1122, 582, 12, 12, { fill: 'color.text.on-brand', r: 6 });
text('reduce state', 'Off', 1156, 578, 60, { size: 10.5, color: 'color.text.secondary', h: 20 });
note('sbr note', 'mkvmerge only. Subtitle adds compression and charset; attachments are copy-only.', 1008, 614, 376, 14);

K.rect(b, 'detail rule 2', 1008, 626, 376, 1, { fill: 'color.border.subtle', r: 0 });
K.rect(b, 'copy note', 1008, 646, 376, 82, { fill: 'color.bg.sunken', r: 8, stroke: 'color.border.subtle' });
K.icon(b, 'copy note icon', '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>', 1024, 662, 16, { color: 'color.text.secondary' });
text('copy note head', 'Copied, not re-encoded', 1050, 658, 300, { size: 11.5, weight: 'medium', h: 18 });
note('copy note body', 'This pane writes container metadata. The audio codec and bitstream stay untouched. Re-encoding is an FFmpeg-only action.', 1024, 680, 344, 42);

note('detail foot', 'Track 1 · 6 channels · 48 kHz · 640 kb/s', 1008, 748, 376, 16);
note('detail foot 2', 'FFmpeg shows copy / re-encode, codec, filter and parameters instead. Data streams copy automatically.', 1008, 772, 376, 30);

// Proposal actions; Save is still the commit.
note('proposal note', 'Proposal read 9 source streams from ffprobe at 14:22. Nothing changes until Save.', 264, 872, 760, 32);
K.rect(b, 'proposal reset', 1116, 866, 116, 32, { fill: null, r: 5 });
text('proposal reset t', 'Reset proposal', 1116, 866, 116, { size: 10.5, color: 'color.text.secondary', align: 'center', valign: 'center', h: 32 });
K.rect(b, 'proposal use', 1244, 866, 164, 32, { fill: 'color.bg.raised', r: 5, stroke: 'color.border.default' });
text('proposal use t', 'Use proposal', 1244, 866, 164, { size: 10.5, color: 'color.text.primary', align: 'center', valign: 'center', h: 32 });


K.organize(page);
