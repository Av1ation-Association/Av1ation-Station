/** What a confirmed "Reset data" permanently deletes, in the user's words. */
export function resetDataCopy(sequence: string, name: string): string {
    switch (sequence) {
        case "SceneDetector":
            return `Every detected scene is deleted, together with the encoded chunks and scratch data that depended on them. The source and project configuration stay untouched.`;
        case "NoiseDetector":
            return `The measured noise and luminance for every scene are deleted. Noise Scaler and later results that read them are removed too.`;
        case "NoiseScaler":
            return `Every scene's noise scaling and Photon Noise table are deleted, including the video encoder's Photon Noise. Encoded chunks stay.`;
        case "TargetQuality":
            return `Every scene's Target Quality passes and scores are deleted. Each scene's quantizer is restored to the video encoder's value, and the Target Quality probe folder is removed.`;
        case "SpeedScaler":
            return `Every scene's encoder speed is restored to the main encoder's speed. No chunks or measurements are touched.`;
        case "ParallelEncoder":
            return `Every encoded scene chunk and the Parallel Encoder scratch folder are deleted. Target Quality probes, the concatenated output, and the configuration stay.`;
        case "SceneConcatenator":
            return `The finished output file is deleted from disk. Encoded scene chunks and configuration stay, so it can be rebuilt without re-encoding.`;
        case "QualityCheck":
            return `Every scene's quality scores are deleted. The output file and the encode itself stay.`;
        default:
            return `${name} has no stored result this action can delete.`;
    }
}
