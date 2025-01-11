export interface Parameters {
    // #region General

    /**
     * Show usage options and exit
     * @default false
     */
    help: boolean;

    /**
     * Config file to use
     */
    cfg: string;

    /**
     * Debug mode (makes output deterministic)
     * @default false
     */
    debug: boolean;

    /**
     * Output filename
     */
    output: string;

    /**
     * Codec to use
     * @default 'av1'
     */
    codec: string;

    /**
     * Number of passes (1/2/3)
     */
    passes: 1 | 2 | 3;

    /**
     * Pass to execute (1/2/3)
     */
    pass: 1 | 2 | 3;

    /**
     * First pass statistics file name
     */
    fpf: string;

    /**
     * Stop encoding after n input frames
     */
    limit: number;

    /**
     * Skip the first n input frames
     */
    skip: number;

    /**
     * Use Good Quality Deadline
     * @default false
     */
    good: boolean;

    /**
     * Use Realtime Quality Deadline
     * @default false
     */
    rt: boolean;

    /**
     * Use all intra mode
     * @default false
     */
    allintra: boolean;

    /**
     * Do not print encode progress
     * @default false
     */
    quiet: boolean;

    /**
     * Show encoder parameters
     * @default false
     */
    verbose: boolean;

    /**
     * Show PSNR in status line (0: Disable PSNR status line display, 1: PSNR calculated using input bit-depth (default), 2: PSNR calculated using stream bit-depth); takes default option when arguments are not specified
     * @default 1 (PSNR calculated using input bit-depth)
     */
    psnr: number;

    /**
     * Output WebM (default when WebM IO is enabled)
     */
    webm: boolean;

    /**
     * Output IVF
     */
    ivf: boolean;

    /**
     * Output OBU
     */
    obu: boolean;

    /**
     * Show quantizer histogram (n-buckets)
     */
    'q-hist': number;

    /**
     * Show rate histogram (n-buckets)
     */
    'rate-hist': number;

    /**
     * Disable warnings about potentially incorrect encode settings
     * @default false
     */
    'disable-warnings': boolean;

    /**
     * Display warnings, but do not prompt user to continue
     * @default false
     */
    'disable-warning-prompt': boolean;

    /**
     * Test encode/decode mismatch
     * off, fatal, warn
     */
    'test-decode': 'off' | 'fatal' | 'warn';

    // #endregion General

    // #region Global

    /**
     * Input file is NV12
     * @default false
     */
    nv12: boolean;

    /**
     * Input file is YV12
     * @default false
     */
    yv12: boolean;

    /**
     * Input file is I420 (default)
     * @default true
     */
    i420: boolean;

    /**
     * Input file is I422
     * @default false
     */
    i422: boolean;

    /**
     * Input file is I444
     * @default false
     */
    i444: boolean;

    /**
     * Usage profile number to use
     */
    usage: 0 | 1 | 2;

    /**
     * Max number of threads to use
     */
    threads: number;

    /**
     * Bitstream profile number to use
     */
    profile: number;

    /**
     * Frame width
     */
    width: number;

    /**
     * Frame height
     */
    height: number;

    /**
     * Maximum frame width value to force
     */
    'forced_max_frame_width': number;

    /**
     * Maximum frame height value to force
     */
    'forced_max_frame_height': number;

    /**
     * Stereo 3D video format
     */
    'stereo-mode': 'mono' | 'left-right' | 'bottom-top' | 'top-bottom' | 'right-left';

    /**
     * Output timestamp precision (fractional seconds)
     */
    timebase: number;

    /**
     * Stream frame rate (rate/scale)
     */
    fps: string;

    /**
     * Enable global error resiliency features
     */
    'global-error-resilient': string;

    /**
     * Bit depth for codec
     * @default 10
     */
    'bit-depth': 8 | 10 | 12;

    /**
     * Bit depth of input
     */
    'input-bit-depth': number;

    /**
     * Max number of frames to lag
     */
    'lag-in-frames': number;

    /**
     * Large scale tile coding (0: off (default), 1: on (ivf output only))
     * @default 0 (off)
     */
    'large-scale-tile': 0 | 1;

    /**
     * Monochrome video (no chroma planes)
     * @default false
     */
    monochrome: boolean;

    /**
     * Use full header for still picture
     * @default false
     */
    'full-still-picture-hdr': boolean;

    /**
     * Force use of 16-bit pipeline
     * @default false
     */
    'use-16bit-internal': boolean;

    /**
     * Save as Annex-B
     */
    annexb: string;

    // #endregion Global
    
    // #region Rate Control

    /**
     * Temporal resampling threshold (buf %)
     */
    'drop-frame': number;

    /**
     * Frame resize mode (0: off (default), 1: fixed, 2: random, 3: dynamic)
     * @default 0 (off)
     */
    'resize-mode': 0 | 1 | 2 | 3;

    /**
     * Frame resize denominator
     */
    'resize-denominator': number;

    /**
     * Frame resize keyframe denominator
     */
    'resize-kf-denominator': number;

    /**
     * Frame super-resolution mode (0: disabled (default), 1: fixed, 2: random, 3: qthresh, 4: auto)
     * @default 0 (disabled)
     */
    'superres-mode': 0 | 1 | 2 | 3 | 4;

    /**
     * Frame super-resolution denominator
     */
    'superres-denominator': number;

    /**
     * Frame super-resolution keyframe denominator
     */
    'superres-kf-denominator': number;

    /**
     * Frame super-resolution qindex threshold
     */
    'superres-qthresh': number;

    /**
     * Frame super-resolution keyframe qindex threshold
     */
    'superres-kf-qthresh': number;

    /**
     * Rate control mode
     * vbr, cbr, cq, q
     */
    'end-usage': 'vbr' | 'cbr' | 'cq' | 'q';

    /**
     * Bitrate (kbps)
     */
    'target-bitrate': number;

    /**
     * Minimum (best) quantizer
     */
    'min-q': number;

    /**
     * Maximum (worst) quantizer
     */
    'max-q': number;

    /**
     * Datarate undershoot (min) target (%)
     */
    'undershoot-pct': number;

    /**
     * Datarate overshoot (max) target (%)
     */
    'overshoot-pct': number;

    /**
     * Client buffer size (ms)
     */
    'buf-sz': number;

    /**
     * Client initial buffer size (ms)
     */
    'buf-initial-sz': number;

    /**
     * Client optimal buffer size (ms)
     */
    'buf-optimal-sz': number;

    /**
     * CBR/VBR bias (0=CBR, 100=VBR)
     */
    'bias-pct': number;

    /**
     * GOP min bitrate (% of target)
     */
    'minsection-pct': number;

    /**
     * GOP max bitrate (% of target)
     */
    'maxsection-pct': number;

    // #endregion Rate Control

    // #region Keyframe Placement

    /**
     * Enable forward reference keyframes
     */
    'enable-fwd-kf': string;

    /**
     * Minimum keyframe interval (frames)
     */
    'kf-min-dist': number;

    /**
     * Maximum keyframe interval (frames)
     */
    'kf-max-dist': number;

    /**
     * Disable keyframe placement
     * @default false
     */
    'disable-kf': boolean;

    /**
     * S-Frame interval (frames)
     */
    'sframe-dist': number;

    /**
     * S-Frame insertion mode (1..2)
     */
    'sframe-mode': number;

    // #endregion Keyframe Placement

    // #region AV1 Specific

    /**
     * Speed setting (0..6 in good mode, 5..11 in realtime mode, 0..9 in all intra mode)
     */
    'cpu-used': number;

    /**
     * Enable automatic alt reference frames
     */
    'auto-alt-ref': string;

    /**
     * Bias towards block sharpness in rate-distortion optimization of transform coefficients (0..7), default is 0
     * @default 0
     */
    'sharpness': number;

    /**
     * Motion detection threshold
     */
    'static-thresh': number;

    /**
     * Enable row based multi-threading (0: off, 1: on (default))
     * @default 1 (on)
     */
    'row-mt': 0 | 1;

    /**
     * Enable frame parallel multi-threading (0: off (default), 1: on)
     * @default 0 (off)
     */
    'fp-mt': 0 | 1;

    /**
     * Number of tile columns to use, log2
     */
    'tile-columns': number;

    /**
     * Number of tile rows to use, log2
     */
    'tile-rows': number;

    /**
     * RDO based on frame temporal dependency (0: off, 1: backward source based); required for deltaq mode
     */
    'enable-tpl-model': boolean;

    /**
     * Apply temporal filtering on key frame (0: no filter, 1: filter without overlay (default), 2: filter with overlay - experimental, may break random access in players)
     * @default 1 (filter without overlay)
     */
    'enable-keyframe-filtering': number;

    /**
     * AltRef max frames (0..15)
     */
    'arnr-maxframes': number;

    /**
     * AltRef filter strength (0..6)
     */
    'arnr-strength': number;

    /**
     * Distortion metric tuned with
     * psnr, ssim, vmaf_with_preprocessing, vmaf_without_preprocessing, vmaf, vmaf_neg, butteraugli, vmaf_saliency_map
     */
    'tune': 'psnr' | 'ssim' | 'vmaf_with_preprocessing' | 'vmaf_without_preprocessing' | 'vmaf' | 'vmaf_neg' | 'butteraugli' | 'vmaf_saliency_map';

    /**
     * Constant/Constrained Quality level
     */
    'cq-level': number;

    /**
     * Max I-frame bitrate (pct)
     */
    'max-intra-rate': number;

    /**
     * Max P-frame bitrate (pct)
     */
    'max-inter-rate': number;

    /**
     * Boost for Golden Frame in CBR mode (pct)
     */
    'gf-cbr-boost': number;

    /**
     * Lossless mode (0: false (default), 1: true)
     * @default 0 (false)
     */
    'lossless': 0 | 1;

    /**
     * Enable the constrained directional enhancement filter (0: false, 1: true (default), 2: disable for non-reference frames)
     * @default 1 (true)
     */
    'enable-cdef': 0 | 1 | 2;

    /**
     * Enable the loop restoration filter (0: false (default in realtime mode), 1: true (default in non-realtime mode))
     * @default 1 (true)
     */
    'enable-restoration': 0 | 1;

    /**
     * Enable rectangular partitions (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-rect-partitions': 0 | 1;

    /**
     * Enable ab partitions (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-ab-partitions': 0 | 1;

    /**
     * Enable 1:4 and 4:1 partitions (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-1to4-partitions': 0 | 1;

    /**
     * Set min partition size (4:4x4, 8:8x8, 16:16x16, 32:32x32, 64:64x64, 128:128x128); with 4k+ resolutions or higher speed settings, min partition size will have a minimum of 8
     */
    'min-partition-size': number;

    /**
     * Set max partition size (4:4x4, 8:8x8, 16:16x16, 32:32x32, 64:64x64, 128:128x128)
     */
    'max-partition-size': number;

    /**
     * Enable dual filter (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-dual-filter': 0 | 1;

    /**
     * Enable chroma delta quant (0: false (default), 1: true)
     * @default 0 (false)
     */
    'enable-chroma-deltaq': 0 | 1;

    /**
     * Enable intra edge filtering (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-intra-edge-filter': 0 | 1;

    /**
     * Enable order hint (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-order-hint': 0 | 1;

    /**
     * Enable 64-pt transform (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-tx64': 0 | 1;

    /**
     * Enable extended transform type (0: false, 1: true (default)) including FLIPADST_DCT, DCT_FLIPADST, FLIPADST_FLIPADST, ADST_FLIPADST, FLIPADST_ADST, IDTX, V_DCT, H_DCT, V_ADST, H_ADST, V_FLIPADST, H_FLIPADST
     * @default 1 (true)
     */
    'enable-flip-idtx': 0 | 1;

    /**
     * Enable rectangular transform (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-rect-tx': 0 | 1;

    /**
     * Enable distance-weighted compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-dist-wtd-comp': 0 | 1;

    /**
     * Enable masked (wedge/diff-wtd) compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-masked-comp': 0 | 1;

    /**
     * Enable one sided compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-onesided-comp': 0 | 1;

    /**
     * Enable interintra compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-interintra-comp': 0 | 1;

    /**
     * Enable smooth interintra mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-smooth-interintra': 0 | 1;

    /**
     * Enable difference-weighted compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-diff-wtd-comp': 0 | 1;

    /**
     * Enable interinter wedge compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-interinter-wedge': 0 | 1;

    /**
     * Enable interintra wedge compound (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-interintra-wedge': 0 | 1;

    /**
     * Enable global motion (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-global-motion': 0 | 1;

    /**
     * Enable local warped motion (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-warped-motion': 0 | 1;

    /**
     * Enable filter intra prediction mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-filter-intra': 0 | 1;

    /**
     * Enable smooth intra prediction modes (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-smooth-intra': 0 | 1;

    /**
     * Enable Paeth intra prediction mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-paeth-intra': 0 | 1;

    /**
     * Enable chroma from luma intra prediction mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-cfl-intra': 0 | 1;

    /**
     * Enable diagonal (D45 to D203) intra prediction modes, which are a subset of directional modes; has no effect if enable-directional-intra is 0 (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-diagonal-intra': 0 | 1;

    /**
     * Force video mode even for a single frame (0: false (default), 1: true)
     * @default 0
     */
    'force-video-mode': 0 | 1;

    /**
     * Enable OBMC (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-obmc': 0 | 1;

    /**
     * Enable coding overlay frames (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-overlay': 0 | 1;

    /**
     * Enable palette prediction mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-palette': 0 | 1;

    /**
     * Enable intra block copy prediction mode (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-intrabc': 0 | 1;

    /**
     * Enable intra angle delta (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-angle-delta': 0 | 1;

    /**
     * Disable trellis optimization of quantized coefficients (0: false 1: true  2: true for rd search 3: true for estimate yrd search (default))
     * @default 3
     */
    'disable-trellis-quant': 0 | 1 | 2 | 3;

    /**
     * Enable quantisation matrices (0: false (default), 1: true)
     * @default 0 (false)
     */
    'enable-qm': 0 | 1;

    /**
     * Min quant matrix flatness (0..15), default is 8
     * @default 8
     */
    'qm-min': number;

    /**
     * Max quant matrix flatness (0..15), default is 15
     * @default 15
     */
    'qm-max': number;

    /**
     * Use reduced set of transform types
     */
    'reduced-tx-type-set': string;

    /**
     * Use DCT only for INTRA modes
     */
    'use-intra-dct-only': string;

    /**
     * Use DCT only for INTER modes
     */
    'use-inter-dct-only': string;

    /**
     * Use Default-transform only for INTRA modes
     */
    'use-intra-default-tx-only': string;

    /**
     * Use adaptive quantize_b
     */
    'quant-b-adapt': string;

    /**
     * Update freq for coeff costs. 0: SB, 1: SB Row per Tile, 2: Tile, 3: Off
     */
    'coeff-cost-upd-freq': 0 | 1 | 2 | 3;

    /**
     * Update freq for mode costs. 0: SB, 1: SB Row per Tile, 2: Tile, 3: Off
     */
    'mode-cost-upd-freq': 0 | 1 | 2 | 3;

    /**
     * Update freq for mv costs. 0: SB, 1: SB Row per Tile, 2: Tile, 3: Off
     */
    'mv-cost-upd-freq': 0 | 1 | 2 | 3;

    /**
     * Enable frame parallel decodability features (0: false (default), 1: true)
     * @default 0 (false)
     */
    'frame-parallel': 0 | 1;

    /**
     * Enable error resilient features (0: false (default), 1: true)
     * @default 0 (false)
     */
    'error-resilient': 0 | 1;

    /**
     * Adaptive quantization mode (0: off (default), 1: variance, 2: complexity, 3: cyclic refresh)
     * @default 0 (off)
     */
    'aq-mode': 0 | 1 | 2 | 3;

    /**
     * Delta qindex mode (0: off, 1: deltaq objective (default), 2: deltaq placeholder, 3: key frame visual quality, 4: user rating based visual quality optimization); requires --enable-tpl-model=1
     * @default 1 (deltaq objective)
     */
    'deltaq-mode': 0 | 1 | 2 | 3 | 4;

    /**
     * Deltaq strength for --deltaq-mode=4 (%)
     */
    'deltaq-strength': number;

    /**
     * Enable delta-lf-mode (0: off (default), 1: on)
     * @default 0 (off)
     */
    'delta-lf-mode': 0 | 1;

    /**
     * Enable frame periodic boost (0: off (default), 1: on)
     * @default 0 (off)
     */
    'frame-boost': 0 | 1;

    /**
     * Noise sensitivity (frames to blur)
     */
    'noise-sensitivity': string;

    /**
     * Tune content type
     * default, screen, film
     * @default 'default'
     */
    'tune-content': 'default' | 'screen' | 'film';

    /**
     * CDF update mode for entropy coding (0: no CDF update, 1: update CDF on all frames (default), 2: selectively update CDF on some frames)
     * @default 1 (update CDF on all frames)
     */
    'cdf-update-mode': 0 | 1 | 2;

    /**
     * Color primaries (CICP) of input content:
     * bt709, unspecified, bt601, bt470m, bt470bg, smpte240, film, bt2020, xyz, smpte431, smpte432, ebu3213
     * @default 'unspecified'
     */
    'color-primaries': 'bt709' | 'unspecified' | 'bt601' | 'bt470m' | 'bt470bg' | 'smpte240' | 'film' | 'bt2020' | 'xyz' | 'smpte431' | 'smpte432' | 'ebu3213';

    /**
     * Transfer characteristics (CICP) of input content:
     * unspecified, bt709, bt470m, bt470bg, bt601, smpte240, lin, log100, log100sq10, iec61966, bt1361, srgb, bt2020-10bit, bt2020-12bit, smpte2085, hlg, smpte428
     * @default 'unspecified'
     */
    'transfer-characteristics': 'unspecified' | 'bt709' | 'bt470m' | 'bt470bg' | 'bt601' | 'smpte240' | 'lin' | 'log100' | 'log100sq10' | 'iec61966' | 'bt1361' | 'srgb' | 'bt2020-10bit' | 'bt2020-12bit' | 'smpte2085' | 'hlg' | 'smpte428';

    /**
     * Matrix coefficients (CICP) of input content:
     * identity, bt709, unspecified, fcc73, bt470bg, bt601, smpte240, ycgco, bt2020ncl, bt2020cl, smpte2085, chromncl, chromcl, ictcp
     * @default 'unspecified'
     */
    'matrix-coefficients': 'identity' | 'bt709' | 'unspecified' | 'fcc73' | 'bt470bg' | 'bt601' | 'smpte240' | 'ycgco' | 'bt2020ncl' | 'bt2020cl' | 'smpte2085' | 'chromncl' | 'chromcl' | 'ictcp';

    /**
     * The chroma sample position when chroma 4:2:0 is signaled:
     * unknown, vertical, colocated
     * @default 'unknown'
     */
    'chroma-sample-position': 'unknown' | 'vertical' | 'colocated';

    /**
     * Min gf/arf frame interval (default 0, indicating in-built behavior)
     * @default 0 (indicating in-built behavior)
     */
    'min-gf-interval': number;

    /**
     * Max gf/arf frame interval (default 0, indicating in-built behavior)
     * @default 0 (indicating in-built behavior)
     */
    'max-gf-interval': number;

    /**
     * Min height for GF group pyramid structure (0 (default) to 5)
     * @default 0
     */
    'gf-min-pyr-height': number;

    /**
     * Maximum height for GF group pyramid structure (0 to 5 (default))
     * @default 5
     */
    'gf-max-pyr-height': number;

    /**
     * Superblock size to use
     * dynamic, 64, 128
     */
    'sb-size': 'dynamic' | '64' | '128';

    /**
     * Maximum number of tile groups, default is 1
     * @default 1
     */
    'num-tile-groups': number;

    /**
     * MTU size for a tile group, default is 0 (no MTU targeting), overrides maximum number of tile groups
     * @default 0 (no MTU targeting)
     */
    'mtu-size': number;

    /**
     * Signal timing info in the bitstream (model only works for no hidden frames, no super-res yet):
     * unspecified, constant, model
     */
    'timing-info': 'unspecified' | 'constant' | 'model';

    /**
     * Film grain test vectors (0: none (default), 1: test-1  2: test-2, ... 16: test-16)
     * @default 0 (none)
     */
    'film-grain-test': number;

    /**
     * Path to file containing film grain parameters
     */
    'film-grain-table': string;

    /**
     * Amount of noise (from 0 = don't denoise, to 50)
     */
    'denoise-noise-level': number;

    /**
     * Denoise block size (default = 32)
     */
    'denoise-block-size': number;

    /**
     * Apply denoising to the frame being encoded when denoise-noise-level is enabled (0: false, 1: true (default))
     * @default 1 (true)
     */
    'enable-dnl-denoising': 0 | 1;

    /**
     * Maximum number of reference frames allowed per frame (3 to 7 (default))
     * @default 7
     */
    'max-reference-frames': number;

    /**
     * Use reduced set of single and compound references (0: off (default), 1: on)
     * @default 0 (off)
     */
    'reduced-reference-set': 0 | 1;

    /**
     * Enable temporal mv prediction (default is 1)
     * @default '1'
     */
    'enable-ref-frame-mvs': string;

    /**
     * Target sequence level index. Possible values are in the form of "ABxy". AB: Operating point (OP) index, xy: Target level index for the OP. E.g. "0" means target level index 0 (2.0) for the 0th OP, "1019" means target level index 19 (6.3) for the 10th OP.
     */
    'target-seq-level-idx': number;

    /**
     * Set bit mask to specify which tier each of the 32 possible operating points conforms to. Bit value 0 (default): Main Tier, 1: High Tier.
     * @default 0
     */
    'set-tier-mask': number;

    /**
     * Set minimum compression ratio. Take integer values. Default is 0. If non-zero, encoder will try to keep the compression ratio of each frame to be higher than the given value divided by 100.
     * @default 0
     */
    'min-cr': number;

    /**
     * Set average corpus complexity per mb for single pass VBR using lap. (0..10000), default is 0
     * @default 0
     */
    'vbr-corpus-complexity-lap': number;

    /**
     * Chroma subsampling x value
     */
    'input-chroma-subsampling-x': string;

    /**
     * Chroma subsampling y value
     */
    'input-chroma-subsampling-y': string;

    /**
     * Update freq for dv costs. 0: SB, 1: SB Row per Tile, 2: Tile, 3: Off
     */
    'dv-cost-upd-freq': 0 | 1 | 2 | 3;

    /**
     * Partition information read and write path
     */
    'partition-info-path': string;

    // TODO TO DO TODO TODO TODO
    /**
     * Enable directional intra prediction modes (0: false, 1: true (default))
     * @default 1
     */
    'enable-directional-intra': 0 | 1;

    /**
     * Enable transform size search to find the best size for each block. If false, transforms always have the largest possible size (0: false, 1: true (default)). Ignored in non rd pick mode in real-time coding.
     * @default 1
     */
    'enable-tx-size-search': 0 | 1;

    /**
     * Control loop filtering (0: Loopfilter disabled for all frames, 1: Enable loopfilter for all frames (default), 2: Disable loopfilter for non-reference frames, 3: Disable loopfilter for frames with low motion)
     * @default 1 (Enable loopfilter for all frames)
     */
    'loopfilter-control': 0 | 1 | 2 | 3;

    /**
     * Automatically turn off several intra coding tools for allintra mode; only in effect if --deltaq-mode=3
     */
    'auto-intra-tools-off': 0 | 1;

    /**
     * Enable rate guide deltaq (1), by default off (0). It requires --deltaq-mode=3. If turned on, it requires an input file specified by --rate-distribution-info.
     * @default 0 (off)
     */
    'enable-rate-guide-deltaq': 0 | 1;

    /**
     * Rate distribution information input. It requires --enable-rate-guide-deltaq=1.
     */
    'rate-distribution-info': string;

    // /**
    //  * Number of passes (1/2/3)
    //  */
    // 'passes': 1 | 2 | 3;

    /**
     * The output file for the first two passes for three-pass encoding
     */
    'two-pass-output': string;

    /**
     * Log file from second pass
     */
    'second-pass-log': string;

    /**
     * Set distance between forward keyframes. A value of -1 (default) means no repetitive forward keyframes.
     * @default -1 (no repetitive forward keyframes)
     */
    'fwd-kf-dist': number;

    /**
     * When set to 1, exit the encoder when it fails to encode to a given target level
     */
    'strict-level-conformance': 0 | 1;

    /**
     * When set to 1, enable the superblock level qp sweep for a given lambda to minimize the rdcost.
     */
    'sb-qp-sweep': 0 | 1;

    /**
     * Distortion metric to use for in-block optimization
     * psnr, qm-psnr
     */
    'dist-metric': 'psnr' | 'qm-psnr';

    /**
     * Maximum height of pyramid structure used for the GOP starting with a key frame (-1 to 5). When set to -1 (default), it does not have any effect. The actual maximum pyramid height will be the minimum of this value and the value of gf_max_pyr_height.
     * @default -1
     */
    'kf-max-pyr-height': number;

    // #endregion AV1 Specific

}