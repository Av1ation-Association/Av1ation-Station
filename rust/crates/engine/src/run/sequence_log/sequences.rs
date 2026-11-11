//! One descriptor per engine sequence, reading the scene table and run context.

use super::*;

pub(super) fn scene_detector(scenes: &[Value], context: Context<'_>) -> String {
    let Some(last) = scenes.last() else {
        return "Scene Detector: no scenes detected".to_owned();
    };
    let first = number(&scenes[0], "/start_frame").unwrap_or(0.0);
    let end = number(last, "/end_frame").unwrap_or(0.0);
    // A resumed run only swept the frames after the table it started from; dividing the
    // whole source by this run's clock would report a speed the machine never reached.
    let swept = (end - context.last_end_before as f64).max(0.0);
    let fps = if swept > 0.0 && context.elapsed_seconds > 0.0 {
        format!(" · {:.0} fps", swept / context.elapsed_seconds)
    } else {
        String::new()
    };
    format!(
        "Scene Detector: {} scenes · frames {}–{} · {}{}",
        with_commas(scenes.len() as u64),
        with_commas(first.max(0.0) as u64),
        with_commas((end - 1.0).max(0.0) as u64),
        duration(context.elapsed_seconds),
        fps,
    )
}

pub(super) fn noise_detector(scenes: &[Value], context: Context<'_>) -> Records {
    let mut detail = Vec::new();
    let mut measured = Vec::new();
    for (index, scene) in scenes.iter().enumerate() {
        let Some(noise) = number(scene, "/sequence_data/noise_detection/noise") else {
            continue;
        };
        measured.push(noise);
        let mut line = format!("{} · noise {noise:.4}", scene_prefix(index, scene));
        if let Some(luminance) = number(scene, "/sequence_data/noise_detection/luminance") {
            line.push_str(&format!(" · luminance {luminance:.3}"));
        }
        detail.push(line);
    }
    let summary = if measured.is_empty() {
        "Noise Detector: no scene was measured".to_owned()
    } else {
        // One frame is sampled per scene, so this run's rate is scenes per second, not
        // frame rate. A resumed run only measured the scenes that were still pending.
        let newly = measured.len().saturating_sub(context.measured_before);
        let rate = if newly > 0 && context.elapsed_seconds > 0.0 {
            format!(" · {:.2} scenes/s", newly as f64 / context.elapsed_seconds)
        } else {
            String::new()
        };
        format!(
            "Noise Detector: {} scenes · noise {:.4}–{:.4} · median {:.4} · mean {:.4} · {}{}",
            with_commas(measured.len() as u64),
            measured.iter().copied().fold(f64::INFINITY, f64::min),
            measured.iter().copied().fold(f64::NEG_INFINITY, f64::max),
            median(&measured),
            mean(&measured).unwrap_or(0.0),
            duration(context.elapsed_seconds),
            rate,
        )
    };
    Records {
        detail,
        summary: vec![summary],
    }
}

pub(super) fn noise_scaler(scenes: &[Value], config: &Value) -> String {
    let minimum = number(config, "/noise_scaler/minimum_scaler").unwrap_or(f64::NEG_INFINITY);
    let maximum = number(config, "/noise_scaler/maximum_scaler").unwrap_or(f64::INFINITY);
    let mut scaled = 0_usize;
    let mut unchanged = 0_usize;
    let mut clamped = 0_usize;
    for scene in scenes {
        let Some(scaler) = number(scene, "/sequence_data/noise_scaling/scaler") else {
            continue;
        };
        if scaler > 1.0 + 1e-9 {
            scaled += 1;
        } else {
            unchanged += 1;
        }
        if (scaler - minimum).abs() < 1e-9 || (scaler - maximum).abs() < 1e-9 {
            clamped += 1;
        }
    }
    if scaled + unchanged == 0 {
        return "Noise Scaler: no scene carries a scaler".to_owned();
    }
    let threshold = number(config, "/noise_scaler/threshold").map_or_else(
        || "threshold unset".to_owned(),
        |value| format!("threshold {value:.4}"),
    );
    format!(
        "Noise Scaler: {} scaled, {} unchanged · {} clamped · {threshold}",
        with_commas(scaled as u64),
        with_commas(unchanged as u64),
        with_commas(clamped as u64),
    )
}

pub(super) fn target_quality(scenes: &[Value], config: &Value) -> Records {
    let mut detail = Vec::new();
    let mut per_pass: BTreeMap<usize, Vec<&Value>> = BTreeMap::new();
    let mut probed = 0_usize;
    let mut probes = 0_usize;
    let mut final_quantizers = Vec::new();

    for (index, scene) in scenes.iter().enumerate() {
        let passes = passes_of(scene);
        let Some(last) = passes.last().copied() else {
            continue;
        };
        probed += 1;
        probes += passes.len();
        for (position, pass) in passes.iter().enumerate() {
            per_pass.entry(position).or_default().push(*pass);
        }
        let mut line = scene_prefix(index, scene);
        if let Some(quantizer) = number(last, "/quantizer") {
            final_quantizers.push(quantizer);
            line.push_str(&format!(" · Q{quantizer:.0}"));
        }
        if let Some(score) = mean(&passes_scores(last)) {
            line.push_str(&format!(" · score {score:.1}"));
        }
        // The engine stores a probe's bitrate in bits per second.
        if let Some(bitrate) = number(last, "/bitrate").filter(|value| *value > 0.0) {
            line.push_str(&format!(" · {:.1} Mbps", bitrate / 1_000_000.0));
        }
        line.push_str(&format!(
            " · {}",
            plural(passes.len() as u64, "probe", "probes")
        ));
        detail.push(line);
    }

    let mut summary = Vec::new();
    for (position, passes) in &per_pass {
        let quantizers: Vec<f64> = passes
            .iter()
            .filter_map(|pass| number(pass, "/quantizer"))
            .collect();
        let scores: Vec<f64> = passes
            .iter()
            .filter_map(|pass| mean(&passes_scores(pass)))
            .collect();
        let bitrates: Vec<f64> = passes
            .iter()
            .filter_map(|pass| number(pass, "/bitrate"))
            .filter(|value| *value > 0.0)
            .collect();
        let mut line = format!(
            "Target Quality pass {}: {} scenes",
            position + 1,
            with_commas(passes.len() as u64),
        );
        if let (Some(low), Some(high), Some(centre)) = (
            quantizers.iter().copied().reduce(f64::min),
            quantizers.iter().copied().reduce(f64::max),
            mean(&quantizers),
        ) {
            line.push_str(&format!(" · Q{low:.0}–Q{high:.0} · mean Q{centre:.1}"));
        }
        if let Some(score) = mean(&scores) {
            line.push_str(&format!(" · mean score {score:.1}"));
        }
        if let Some(bitrate) = mean(&bitrates) {
            line.push_str(&format!(" · mean {:.1} Mbps", bitrate / 1_000_000.0));
        }
        summary.push(line);
    }

    if probed == 0 {
        summary.push("Target Quality: no scene was probed".to_owned());
        return Records { detail, summary };
    }
    let mut line = format!(
        "Target Quality: {} scenes · {} · Q{:.0}–Q{:.0} · mean Q{:.1}",
        with_commas(probed as u64),
        plural(probes as u64, "probe", "probes"),
        final_quantizers
            .iter()
            .copied()
            .fold(f64::INFINITY, f64::min),
        final_quantizers
            .iter()
            .copied()
            .fold(f64::NEG_INFINITY, f64::max),
        mean(&final_quantizers).unwrap_or(0.0),
    );
    if let Some(metric) = enum_label(config.pointer("/target_quality/metric")) {
        line.push_str(&format!(" · {metric}"));
    }
    summary.push(line);

    Records { detail, summary }
}

pub(super) fn speed_scaler(scenes: &[Value], config: &Value) -> String {
    let mut counts: BTreeMap<u64, usize> = BTreeMap::new();
    for scene in scenes {
        let Some(speed) = scene
            .get("encoder")
            .and_then(catalogue::encoder_speed)
            .filter(|value| *value >= 0.0)
        else {
            continue;
        };
        // A whole preset number is the common case; a fractional speed is a fork's choice,
        // so the summary rounds to a tenth and keeps its distribution readable.
        *counts.entry((speed * 10.0).round() as u64).or_default() += 1;
    }
    if counts.is_empty() {
        return "Speed Scaler: no scene carries a speed".to_owned();
    }
    let counted: usize = counts.values().sum();
    let low = counts.keys().next().copied().unwrap_or(0);
    let high = counts.keys().next_back().copied().unwrap_or(0);
    let mut ordered: Vec<(u64, usize)> = counts.into_iter().collect();
    ordered.sort_by(|left, right| right.1.cmp(&left.1).then(left.0.cmp(&right.0)));
    let distribution: Vec<String> = ordered
        .iter()
        .take(3)
        .map(|(tenths, count)| {
            format!(
                "{} at {}",
                with_commas(*count as u64),
                tenths_label(*tenths)
            )
        })
        .collect();
    let distribution = if ordered.len() > 3 {
        format!("{}, +{} more", distribution.join(", "), ordered.len() - 3)
    } else {
        distribution.join(", ")
    };
    let points = config
        .pointer("/speed_scaler/speed_quantizers")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    format!(
        "Speed Scaler: {} scenes · speeds {}–{} · {} configured points · {distribution}",
        with_commas(counted as u64),
        tenths_label(low),
        tenths_label(high),
        points,
    )
}

pub(super) fn bitrate_optimizer(scenes: &[Value], config: &Value) -> String {
    let Some(sigma) = number(config, "/bitrate_optimizer/bitrate_sigma_threshold") else {
        return "Bitrate Optimizer: inert, no sigma threshold set".to_owned();
    };
    // The optimizer reads Target Quality's final pass, so its evidence is that pass rather
    // than a record of its own.
    let passes: Vec<(f64, f64)> = scenes
        .iter()
        .filter_map(|scene| {
            let pass = last_pass(scene)?;
            Some((number(pass, "/quantizer")?, number(pass, "/bitrate")?))
        })
        .filter(|(_, bitrate)| *bitrate > 0.0)
        .collect();
    if passes.is_empty() {
        return "Bitrate Optimizer: no Target Quality pass to compare".to_owned();
    }
    let bitrates: Vec<f64> = passes.iter().map(|(_, bitrate)| *bitrate).collect();
    let boundary = mean(&bitrates).unwrap_or(0.0) + sigma * deviation(&bitrates);
    let raised = passes
        .iter()
        .filter(|(_, bitrate)| *bitrate > boundary)
        .count();
    // Every raised scene is set to the mean quantizer, so one value describes all of them.
    let target = mean(
        &passes
            .iter()
            .filter(|(_, bitrate)| *bitrate > boundary)
            .map(|(quantizer, _)| *quantizer)
            .collect::<Vec<f64>>(),
    );
    let mut line = format!(
        "Bitrate Optimizer: {} of {} scenes above {sigma}σ ({:.2} Mbps)",
        with_commas(raised as u64),
        with_commas(bitrates.len() as u64),
        boundary / 1_000_000.0,
    );
    if let Some(target) = target {
        line.push_str(&format!(" · set to Q{target:.0}"));
    }
    line
}

pub(super) fn benchmarker(context: Context<'_>) -> String {
    let before = number(context.config_before, "/parallel_encoder/workers");
    let after = number(context.config_after, "/parallel_encoder/workers");
    let workers = match (before, after) {
        (None, Some(after)) => format!("workers auto → {after:.0}"),
        (Some(before), Some(after)) if (before - after).abs() > f64::EPSILON => {
            format!("workers {before:.0} → {after:.0}")
        }
        (_, Some(after)) => format!("workers {after:.0}"),
        _ => "workers unresolved".to_owned(),
    };
    let mut line = format!("Benchmarker: {workers}");
    if let Some(threshold) = number(context.config_after, "/benchmarker/threshold") {
        line.push_str(&format!(" · threshold {threshold:.0}"));
    }
    line.push_str(&format!(" · {}", duration(context.elapsed_seconds)));
    line
}

pub(super) fn parallel_encoder(scenes: &[Value], context: Context<'_>) -> Records {
    let mut detail = Vec::new();
    let mut sizes = Vec::new();
    let mut frames = 0_f64;
    for (index, scene) in scenes.iter().enumerate() {
        let Some(bytes) = number(scene, "/sequence_data/parallel_encoder/bytes") else {
            continue;
        };
        if bytes <= 0.0 {
            continue;
        }
        sizes.push(bytes);
        let count = scene_frames(scene);
        frames += count;
        let mut line = format!(
            "{} · {} · {} frames",
            scene_prefix(index, scene),
            bytes_label(bytes),
            with_commas(count.max(0.0) as u64),
        );
        if let Some(fps) = context.fps.filter(|fps| *fps > 0.0) {
            let seconds = count / fps;
            if seconds > 0.0 {
                line.push_str(&format!(
                    " · {:.1} Mbps",
                    bytes * 8.0 / seconds / 1_000_000.0
                ));
            }
        }
        if let (Some(start), Some(end)) = (
            number(scene, "/sequence_data/parallel_encoder/started_on"),
            number(scene, "/sequence_data/parallel_encoder/completed_on"),
        ) {
            // The engine stores these in milliseconds.
            let seconds = (end - start) / 1_000.0;
            if (0.1..=86_400.0).contains(&seconds) {
                line.push_str(&format!(" · {seconds:.1}s encode"));
            }
        }
        detail.push(line);
    }

    let summary = if sizes.is_empty() {
        "Parallel Encoder: no chunk was written".to_owned()
    } else {
        let total: f64 = sizes.iter().sum();
        let mut line = format!(
            "Parallel Encoder: {}/{} chunks · {} · median {}",
            with_commas(sizes.len() as u64),
            with_commas(scenes.len() as u64),
            bytes_label(total),
            bytes_label(median(&sizes)),
        );
        if context.elapsed_seconds > 0.0 && frames > 0.0 {
            line.push_str(&format!(" · {:.1} fps", frames / context.elapsed_seconds));
        }
        if let Some(workers) = number(context.config_after, "/parallel_encoder/workers") {
            line.push_str(&format!(" · {workers:.0} workers"));
        }
        line
    };
    Records {
        detail,
        summary: vec![summary],
    }
}

pub(super) fn scene_concatenator(scenes: &[Value], config: &Value) -> String {
    let chunks: Vec<f64> = scenes
        .iter()
        .filter_map(|scene| number(scene, "/sequence_data/parallel_encoder/bytes"))
        .filter(|value| *value > 0.0)
        .collect();
    let mut line = format!(
        "Scene Concatenator: {} {}",
        with_commas(chunks.len() as u64),
        plural(chunks.len() as u64, "chunk", "chunks"),
    );
    if let Some(output) = config
        .pointer("/scene_concatenator/output")
        .and_then(Value::as_str)
    {
        line.push_str(&format!(" → {}", file_name(output)));
    }
    if let Some(method) = enum_label(config.pointer("/scene_concatenator/method")) {
        line.push_str(&format!(" · {method}"));
    }
    if !chunks.is_empty() {
        line.push_str(&format!(" · {}", bytes_label(chunks.iter().sum::<f64>())));
    }
    line
}

pub(super) fn quality_check(scenes: &[Value], config: &Value) -> String {
    let scores: Vec<f64> = scenes
        .iter()
        .filter_map(|scene| {
            let pass = scene.pointer("/sequence_data/quality_check/quality")?;
            mean(&passes_scores(pass))
        })
        .collect();
    if scores.is_empty() {
        return "Quality Check: no scene was scored".to_owned();
    }
    let mut line = format!(
        "Quality Check: {} scenes · mean {:.1} · min {:.1} · p5 {:.1}",
        with_commas(scores.len() as u64),
        mean(&scores).unwrap_or(0.0),
        scores.iter().copied().fold(f64::INFINITY, f64::min),
        percentile(&scores, 0.05),
    );
    if let Some(metric) = enum_label(config.pointer("/quality_check/metric")) {
        line.push_str(&format!(" · {metric}"));
    }
    line
}
