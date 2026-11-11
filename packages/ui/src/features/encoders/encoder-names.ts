import type { EncoderDescriptor } from "@av1ation/contracts";

/**
 * The name each encoder is known by, rather than its binary's name.
 *
 * The catalogue is read by people choosing a codec, not by build scripts; `svt-av1` and
 * `vpx` are the executable's names, and the full names are what the encoder's own
 * documentation uses.
 */
const FRIENDLY_NAMES: Record<string, string> = {
    aom: "Alliance for Open Media AV1 encoder",
    rav1e: "Rust AV1 encoder",
    vpx: "Alliance for Open Media VP8/VP9",
    "svt-av1": "Scalable Video Technology for AV1",
    avm: "Alliance for Open Media Video Model",
    x264: "VideoLAN x264",
    x265: "MulticoreWare x265",
    vvenc: "Fraunhofer Versatile Video Encoder",
    ffmpeg: "FFmpeg",
};

/** A saved build keeps its own name; a built-in is named by its family. */
export function friendlyName(encoder: EncoderDescriptor): string {
    return encoder.fork ? encoder.label : (FRIENDLY_NAMES[encoder.base] ?? encoder.label);
}
