//! The argv an encoder document produces, at the same pure builder the run reaches.

use std::path::Path;

use andean_condor::core::input::{clip_info::ClipInfo, pixel_format::PixelFormat};
use andean_condor::models::encoder::Encoder;
use serde_json::json;

/// A pathless fork's project document carries a disabled marker so the editor can restore
/// the selection after a reload. It must not become a flag the executable receives.
#[test]
fn a_pathless_forks_marker_is_ignored_by_command_construction() {
    const MARKER: &str = "__av1ation_fork_fork:svt-av1-essential";
    let mut document = json!({
        "SVTAV1": {
            "append_color_data": true,
            "executable": null,
            "ffmpeg_filter": null,
            "options": {},
            "pass": { "All": 1 },
            "photon_noise": null
        }
    });
    document["SVTAV1"]["options"][MARKER] = json!({"Bool": {"prefix": "--", "value": false}});
    let encoder: Encoder = serde_json::from_value(document).expect("the fork document is valid");
    let info = ClipInfo {
        num_frames: 1,
        format_info: PixelFormat::VapourSynth { bit_depth: 8 },
        frame_rate: (24, 1).into(),
        resolution: (1920, 1080),
        color_range: None,
        color_primaries: None,
        color_transfer_characteristic: None,
        color_space: None,
        chroma_location: None,
        mastering_display: None,
        content_light_level: None,
    };

    let arguments = encoder
        .parameters_with_output((1, 1), Path::new("out.ivf"), &info)
        .expect("the encoder arguments are constructed without files");

    assert!(
        !arguments.is_empty(),
        "the encoder still builds an argument list"
    );
    assert!(
        !arguments.iter().any(|argument| argument.contains(MARKER)),
        "the hidden marker must not reach argv: {arguments:?}"
    );
}
