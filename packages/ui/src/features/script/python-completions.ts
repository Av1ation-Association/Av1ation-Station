/**
 * The Python and VapourSynth symbols the script editor completes.
 *
 * The desktop window has no network, so completion cannot ask a language server or read a
 * VS Code extension. These tables are the part of the editor's environment that is stable:
 * Python's own keywords and builtins, the VapourSynth module surface, and the plugin
 * functions a script for this application normally calls. The generated `condor_data`
 * module is *not* here; its members are parsed from the stub the service generates, so a
 * field the runner adds appears in completion without a second table.
 *
 * This is deliberately not a type checker. Full inference needs the user's installed
 * environment and a language server, which a sandboxed webview cannot load; the editor
 * states that in the page rather than pretending a bundled list is Pyright.
 */

/** One symbol offered after a module, core, or plugin namespace. */
export interface ApiSymbol {
    label: string;
    /** The signature or type shown beside the name. */
    detail: string;
    /** A short explanation, when the symbol needs one. */
    documentation?: string;
    kind: "function" | "class" | "value" | "module";
}

/** Python keywords, completed as they are typed. */
export const PYTHON_KEYWORDS: string[] = [
    "False",
    "None",
    "True",
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "case",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "match",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
];

/** Builtins a script reaches for without importing anything. */
export const PYTHON_BUILTINS: ApiSymbol[] = [
    { label: "abs", detail: "abs(x)", kind: "function" },
    { label: "all", detail: "all(iterable)", kind: "function" },
    { label: "any", detail: "any(iterable)", kind: "function" },
    { label: "bool", detail: "bool(x)", kind: "class" },
    { label: "bytes", detail: "bytes(x)", kind: "class" },
    { label: "callable", detail: "callable(x)", kind: "function" },
    { label: "dict", detail: "dict(items)", kind: "class" },
    { label: "enumerate", detail: "enumerate(iterable, start=0)", kind: "class" },
    { label: "Exception", detail: "Exception", kind: "class" },
    { label: "float", detail: "float(x)", kind: "class" },
    { label: "getattr", detail: "getattr(object, name[, default])", kind: "function" },
    { label: "hasattr", detail: "hasattr(object, name)", kind: "function" },
    { label: "int", detail: "int(x, base=10)", kind: "class" },
    { label: "isinstance", detail: "isinstance(object, classinfo)", kind: "function" },
    { label: "len", detail: "len(x)", kind: "function" },
    { label: "list", detail: "list(iterable)", kind: "class" },
    { label: "max", detail: "max(iterable)", kind: "function" },
    { label: "min", detail: "min(iterable)", kind: "function" },
    { label: "open", detail: "open(file, mode='r')", kind: "function" },
    { label: "print", detail: "print(*values)", kind: "function" },
    { label: "range", detail: "range(stop) / range(start, stop[, step])", kind: "class" },
    { label: "repr", detail: "repr(x)", kind: "function" },
    { label: "reversed", detail: "reversed(sequence)", kind: "function" },
    { label: "round", detail: "round(number[, ndigits])", kind: "function" },
    { label: "set", detail: "set(iterable)", kind: "class" },
    { label: "sorted", detail: "sorted(iterable, key=None, reverse=False)", kind: "function" },
    { label: "str", detail: "str(x)", kind: "class" },
    { label: "sum", detail: "sum(iterable)", kind: "function" },
    { label: "tuple", detail: "tuple(iterable)", kind: "class" },
    { label: "ValueError", detail: "ValueError", kind: "class" },
    { label: "zip", detail: "zip(*iterables)", kind: "function" },
];

/** Modules a script imports by name, offered as completions for the import itself. */
export const PYTHON_MODULES: ApiSymbol[] = [
    {
        label: "json",
        detail: "json.loads / json.dumps",
        documentation: "Import it before parsing JSON by hand.",
        kind: "module",
    },
    { label: "math", detail: "math", kind: "module" },
    { label: "os", detail: "os", kind: "module" },
    { label: "pathlib", detail: "pathlib", kind: "module" },
    { label: "sys", detail: "sys", kind: "module" },
    { label: "vapoursynth", detail: "The VapourSynth module, imported as vs", kind: "module" },
];

/** The `vapoursynth` module's public surface, completed after `vs.`. */
export const VAPOURSYNTH_MODULE: ApiSymbol[] = [
    {
        label: "core",
        detail: "the loaded VapourSynth core",
        documentation: "Every source and filter is reached through this object.",
        kind: "value",
    },
    { label: "VideoNode", detail: "class VideoNode", kind: "class" },
    { label: "VideoFrame", detail: "class VideoFrame", kind: "class" },
    { label: "AudioNode", detail: "class AudioNode", kind: "class" },
    { label: "VideoFormat", detail: "class VideoFormat", kind: "class" },
    { label: "VideoInfo", detail: "class VideoInfo", kind: "class" },
    { label: "RGB", detail: "color family constant", kind: "value" },
    { label: "YUV", detail: "color family constant", kind: "value" },
    { label: "GRAY", detail: "color family constant", kind: "value" },
    { label: "COMPAT", detail: "color family constant", kind: "value" },
    { label: "Error", detail: "class Error(Exception)", kind: "class" },
];

/** The plugin namespaces `core.` exposes for the imports this application offers. */
export const CORE_PLUGINS: ApiSymbol[] = [
    { label: "std", detail: "core plugin · standard filters", kind: "module" },
    { label: "resize", detail: "core plugin · scaling and color space", kind: "module" },
    { label: "ffms2", detail: "core plugin · FFmpegSource", kind: "module" },
    { label: "bs", detail: "core plugin · BestSource", kind: "module" },
    { label: "lsmas", detail: "core plugin · L-SMASH Works", kind: "module" },
    { label: "d2v", detail: "core plugin · DGMPGDec", kind: "module" },
    { label: "dgdecodenv", detail: "core plugin · DGDecNV", kind: "module" },
    { label: "fmtc", detail: "core plugin · format conversion (optional)", kind: "module" },
    { label: "hqdn3d", detail: "core plugin · denoise (optional)", kind: "module" },
];

const STD: ApiSymbol[] = [
    {
        label: "BlankClip",
        detail: "BlankClip(clip=None, width=640, height=480, format=None, length=1)",
        documentation: "A synthetic clip; useful for exercising a script without a source.",
        kind: "function",
    },
    { label: "Crop", detail: "Crop(clip, left=0, right=0, top=0, bottom=0)", kind: "function" },
    {
        label: "SetOutput",
        detail: "SetOutput(clip, index=0)",
        documentation: "Same as clip.set_output(index); either makes the graph complete.",
        kind: "function",
    },
    { label: "Splice", detail: "Splice(clips, mismatch=False)", kind: "function" },
    { label: "Trim", detail: "Trim(clip, first=None, last=None)", kind: "function" },
    { label: "AddBorders", detail: "AddBorders(clip, left, right, top, bottom)", kind: "function" },
    { label: "FlipHorizontal", detail: "FlipHorizontal(clip)", kind: "function" },
    { label: "FlipVertical", detail: "FlipVertical(clip)", kind: "function" },
    { label: "Transpose", detail: "Transpose(clip)", kind: "function" },
    { label: "AssumeFPS", detail: "AssumeFPS(clip, fpsnum, fpsden=1)", kind: "function" },
    { label: "SelectEvery", detail: "SelectEvery(clip, cycle, offsets)", kind: "function" },
    { label: "Interleave", detail: "Interleave(clips)", kind: "function" },
    { label: "Loop", detail: "Loop(clip, times=None, start=0, end=None)", kind: "function" },
    {
        label: "ModifyFrame",
        detail: "ModifyFrame(clip, selector, modifier)",
        documentation: "Runs Python on selected frames; the modifier must return a frame.",
        kind: "function",
    },
    {
        label: "ShufflePlanes",
        detail: "ShufflePlanes(clips, planes, colorfamily)",
        kind: "function",
    },
    {
        label: "PlaneDifference",
        detail: "PlaneDifference(clip_a, clip_b, plane)",
        kind: "function",
    },
];

const RESIZE: ApiSymbol[] = [
    {
        label: "Bicubic",
        detail: "Bicubic(clip, width, height, format=None, b=1/3, c=1/3)",
        kind: "function",
    },
    { label: "Bilinear", detail: "Bilinear(clip, width, height, format=None)", kind: "function" },
    {
        label: "Lanczos",
        detail: "Lanczos(clip, width, height, format=None, filter_param=3)",
        kind: "function",
    },
    { label: "Point", detail: "Point(clip, width, height, format=None)", kind: "function" },
    { label: "Spline16", detail: "Spline16(clip, width, height, format=None)", kind: "function" },
    { label: "Spline36", detail: "Spline36(clip, width, height, format=None)", kind: "function" },
    { label: "Spline64", detail: "Spline64(clip, width, height, format=None)", kind: "function" },
];

/** Functions per plugin namespace; a namespace with no entry completes to nothing. */
export const PLUGIN_FUNCTIONS: Record<string, ApiSymbol[]> = {
    std: STD,
    resize: RESIZE,
    ffms2: [
        {
            label: "Source",
            detail: "Source(source, cachefile=None, ...)",
            documentation: "Opens the file FFMS2 indexes; pass cd.video_path for the queued video.",
            kind: "function",
        },
    ],
    bs: [
        {
            label: "VideoSource",
            detail: "VideoSource(source, cachepath=None, ...)",
            kind: "function",
        },
        { label: "AudioSource", detail: "AudioSource(source, ...)", kind: "function" },
    ],
    lsmas: [
        {
            label: "LWLibavSource",
            detail: "LWLibavSource(source, cachefile=None, ...)",
            kind: "function",
        },
        {
            label: "LWLibavAudioSource",
            detail: "LWLibavAudioSource(source, ...)",
            kind: "function",
        },
    ],
    d2v: [{ label: "Source", detail: "Source(path, ...)", kind: "function" }],
    dgdecodenv: [{ label: "DGSource", detail: "DGSource(source, ...)", kind: "function" }],
    fmtc: [
        {
            label: "resample",
            detail: "resample(clip, w=None, h=None, fmt=None, ...)",
            kind: "function",
        },
        {
            label: "transfer",
            detail: "transfer(clip, transfer_in_s=None, transfer_out_s=None, ...)",
            kind: "function",
        },
        {
            label: "matrix",
            detail: "matrix(clip, mat_in_s=None, mat_out_s=None, ...)",
            kind: "function",
        },
        {
            label: "primaries",
            detail: "primaries(clip, prim_in_s=None, prim_out_s=None, ...)",
            kind: "function",
        },
        { label: "bitdepth", detail: "bitdepth(clip, bits=None, ...)", kind: "function" },
    ],
    hqdn3d: [
        {
            label: "Hqdn3d",
            detail: "Hqdn3d(clip, luma_spatial=None, chroma_spatial=None, ...)",
            kind: "function",
        },
    ],
};
