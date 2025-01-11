// https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Parameters.md
export interface Parameters {
    errlog: string;
    'stat-file': string;
    'pred-struct-file': string;
    progress: number;
    'no-progress': number;
    preset: number;
    nch: number;

    // Global Options
    skip: number;
    nb: number;
    'color-format': number;
    profile: number;
    level: number;
    'enable-hdr': number;
    fps: number;
    'fps-num': number;
    'fps-denom': number;
    'input-depth': number;
    inj: number;
    'inj-frm-rt': number;
    'enable-stat-report': number;
    asm: number;
    lp: number;
    pin: number;
    ss: number;
    'fast-decode': number;
    tune: number;

    // Rate Control Options 
    rc: number;
    qp: number;
    crf: number;
    tbr: number | string;
    mbr: number;
    'use-q-file': number;
    qpfile: string;
    'max-qp': number;
    'min-qp': number;
    'aq-mode': number;
    'use-fixed-qindex-offsets': number;
    'key-frame-qindex-offset': number;
    'key-frame-chroma-qindex-offset': number;
    'luma-y-dc-qindex-offset': number;
    'chroma-u-dc-qindex-offset': number;
    'chroma-u-ac-qindex-offset': number;
    'chroma-v-dc-qindex-offset': number;
    'chroma-v-ac-qindex-offset': number;
    'qindex-offsets': string;
    'chroma-qindex-offsets': string;
    'undershoot-pct': number;
    'overshoot-pct': number;
    'mbr-overshoot-pct': number;
    'buf-sz': number;
    'buf-initial-sz': number;
    'buf-optimal-sz': number;
    'recode-loop': number;
    'bias-pct': number;
    'minsection-pct': number;
    'maxsection-pct': number;
    'gop-constraint-rc': number;
    'enable-qm': number;
    'qm-min': number;
    'qm-max': number;
    'lambda-scale-factors': string;
    'roi-map-file': number;
    'enable-variance-boost': number;
    'variance-boost-strength': number;
    'variance-octile': number;

    // Multi-Pass Options
    pass: number;
    stats: string;
    passes: number;

    // GOP size and type Options
    keyint: number;
    'irefresh-type': number;
    scd: number;
    lookahead: number;
    'hierarchical-levels': number;
    'pred-struct': number;
    'force-key-frames': string;
    'enable-dg': number;
    'startup-mg-size': number;

    // AV1 Specific Options
    'tile-rows': number;
    'tile-columns': number;
    'enable-dlf': number;
    'enable-cdef': number;
    'enable-restoration': number;
    'enable-tpl-la': number;
    'enable-mfmv': number;
    'enable-tf': number;
    'enable-overlays': number;
    scm: number;
    rmv: number;
    'film-grain': number;
    'film-grain-denoise': number;
    'superres-mode': number;
    'superres-denom': number;
    'superres-kf-denom': number;
    'superres-qthres': number;
    'superres-kf-qthres': number;
    'sframe-dist': number;
    'sframe-mode': number;
    'resize-mode': number;
    'resize-denom': number;
    'resize-kf-denom': number;
    'frame-resz-events': string;
    'frame-resz-kf-denoms': number;
    'frame-resz-denoms': number;

    // Color Description Options
    'color-primaries': number;
    'transfer-characteristics': number;
    'matrix-coefficients': number;
    'color-range': number;
    'chroma-sample-position': string;
    'mastering-display': string;
    'content-light': string;

    [key: string]: number | string;
}