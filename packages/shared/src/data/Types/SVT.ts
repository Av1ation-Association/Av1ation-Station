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
    'max-32-tx-size': number;
    'noise-norm-strength': number;

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
    'chroma-qm-min': number;
    'chroma-qm-max': number;
    'lambda-scale-factors': string;
    'roi-map-file': number;
    'enable-variance-boost': number;
    'variance-boost-strength': number;
    'variance-octile': number;
    'enable-alt-curve': number;
    'psy-rd': number;
    'spy-rd': number;
    'sharp-tx': number;
    'qp-scale-compress-strength': number;
    'tf-strength': number;
    'kf-tf-strength': number;
    'luminance-qp-bias': number;
    sharpness: number;

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
    'chroma-sample-position': number;
    'mastering-display': string;
    'content-light': string;

    [key: string]: number | string;
}

// #region Color Description

export enum ColorPrimaries {
    bt709 = 1,
    unspecified = 2,
    bt470m = 4,
    bt470bg = 5,
    bt601 = 6,
    smpte240 = 7,
    film = 8,
    bt2020 = 9,
    xyz = 10,
    smpte431 = 11,
    smpte432 = 12,
    ebu3213 = 22,
}

export function ColorPrimariestoString(primaries: ColorPrimaries) {
    switch (primaries) {
        case ColorPrimaries.bt709: return 'BT.709';
        default:
        case ColorPrimaries.unspecified: return 'Unspecified';
        case ColorPrimaries.bt470m: return 'BT.470 System M (historical)';
        case ColorPrimaries.bt470bg: return 'BT.470 System B, G (historical)';
        case ColorPrimaries.bt601: return 'BT.601';
        case ColorPrimaries.smpte240: return 'SMPTE 240';
        case ColorPrimaries.film: return 'Generic film (color filters using illuminant C)';
        case ColorPrimaries.bt2020: return 'BT.2020, BT.2100';
        case ColorPrimaries.xyz: return 'SMPTE 428 (CIE 1921 XYZ)';
        case ColorPrimaries.smpte431: return 'SMPTE RP 431-2';
        case ColorPrimaries.smpte432: return 'SMPTE EG 432-1';
        case ColorPrimaries.ebu3213: return 'EBU Tech. 3213-E';
    }
}

export enum TransferCharacteristics {
    bt709 = 1,
    unspecified = 2,
    bt470m = 4,
    bt470bg = 5,
    bt601 = 6,
    smpte240 = 7,
    linear = 8,
    log100 = 9,
    log100sqrt10 = 10,
    iec61966 = 11,
    bt1361 = 12,
    srgb = 13,
    bt202010 = 14,
    bt202012 = 15,
    smpte2084 = 16,
    smpte428 = 17,
    hlg = 18,
}

export function TransferCharacteristicstoString(transfer: TransferCharacteristics) {
    switch (transfer) {
        case TransferCharacteristics.bt709 : return 'BT.709 ';
        default:
        case TransferCharacteristics.unspecified : return 'Unspecified';
        case TransferCharacteristics.bt470m : return 'BT.470 System M (historical)';
        case TransferCharacteristics.bt470bg : return 'BT.470 System B, G (historical) ';
        case TransferCharacteristics.bt601 : return 'BT.601';
        case TransferCharacteristics.smpte240 : return 'SMPTE 240 M';
        case TransferCharacteristics.linear : return 'Linear';
        case TransferCharacteristics.log100 : return 'Logarithmic (100 : 1 range)';
        case TransferCharacteristics.log100sqrt10 : return 'Logarithmic (100 * Sqrt(10) : 1 range)';
        case TransferCharacteristics.iec61966 : return 'IEC 61966-2-4';
        case TransferCharacteristics.bt1361 : return 'BT.1361';
        case TransferCharacteristics.srgb : return 'sRGB or sYCC';
        case TransferCharacteristics.bt202010 : return 'BT.2020 10-bit systems';
        case TransferCharacteristics.bt202012 : return 'BT.2020 12-bit systems';
        case TransferCharacteristics.smpte2084 : return 'SMPTE ST 2084, ITU BT.2100 PQ';
        case TransferCharacteristics.smpte428 : return 'SMPTE ST 428';
        case TransferCharacteristics.hlg : return 'BT.2100 HLG, ARIB STD-B67';
    }
}

export enum MatrixCoefficients {
    identity = 0,
    bt709 = 1,
    unspecified = 2,
    fcc = 4,
    bt470bg = 5,
    bt601 = 6,
    smpte240 = 7,
    ycgco = 8,
    bt2020ncl = 9,
    bt2020cl = 10,
    smpte2085 = 11,
    chromancl = 12,
    chromacl = 13,
    ictcp = 14,
}

export function MatrixCoefficientsToString(matrix: MatrixCoefficients) {
    switch (matrix) {
        case MatrixCoefficients.identity: return 'Identity matrix';
        case MatrixCoefficients.bt709: return 'BT.709';
        default:
        case MatrixCoefficients.unspecified: return 'Unspecified';
        case MatrixCoefficients.fcc: return 'US FCC 73.628';
        case MatrixCoefficients.bt470bg: return 'BT.470 System B, G (historical)';
        case MatrixCoefficients.bt601: return 'BT.601';
        case MatrixCoefficients.smpte240: return 'SMPTE 240 M';
        case MatrixCoefficients.ycgco: return 'YCgCo';
        case MatrixCoefficients.bt2020ncl: return 'BT.2020 non-constant luminance, BT.2100 YCbCr';
        case MatrixCoefficients.bt2020cl: return 'BT.2020 constant luminance';
        case MatrixCoefficients.smpte2085: return 'SMPTE ST 2085 YDzDx';
        case MatrixCoefficients.chromancl: return 'Chromaticity-derived non-constant luminance';
        case MatrixCoefficients.chromacl: return 'Chromaticity-derived constant luminance';
        case MatrixCoefficients.ictcp: return 'BT.2100 ICtCp';
    }
}

export enum ColorRange {
    studio = 0,
    full = 1,
}

export function ColorRangetoString(range: ColorRange) {
    switch (range) {
        default:
        case ColorRange.studio: return 'Studio';
        case ColorRange.full: return 'Full';
    }
}

export enum ChromaSamplePosition {
    Unknown = 0,
    VerticalLeft = 1,
    ColocatedTopLeft = 2
}

export function ChromaSamplePositiontoString(position: ChromaSamplePosition) {
    switch (position) {
        default:
        case ChromaSamplePosition.Unknown: return 'Unknown';
        case ChromaSamplePosition.VerticalLeft: return 'Vertical/Left';
        case ChromaSamplePosition.ColocatedTopLeft: return 'Colocated/Topleft';
    }
}

// #endregion Color Description