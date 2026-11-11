import { expect, it } from "vitest";

import { parseStub, resolveExpression, sceneVariables } from "./python-stub";

const STUB = `# Generated; do not edit.
video_path: str
"""The source file this run decodes."""

temp_dir: str
"""The per-video scratch directory."""

run_id: str

@dataclass(frozen=True, slots=True)
class Scene:
    """One scene range."""

    index: int
    start: int
    end: int
    @property
    def frame_count(self) -> int: ...

scenes: tuple[Scene, ...]

def scene_at(frame: int) -> Scene | None:
    """The scene containing \`frame\`."""
    ...
`;

it("reads lowercase module values, the class, and its members out of the generated stub", () => {
    const module = parseStub(STUB);

    expect(module.members.map((member) => member.name)).toEqual([
        "video_path",
        "temp_dir",
        "run_id",
        "Scene",
        "scenes",
        "scene_at",
    ]);
    const videoPath = module.members.find((member) => member.name === "video_path");
    // The docstring stays out of the annotation: a type that carried prose could not be
    // resolved to the class it names, so `cd.sequence_config.` completed nothing.
    expect(videoPath?.detail).toBe("str");
    expect(videoPath?.doc).toContain("The source file this run decodes");
    const scene = module.classes.Scene;
    expect(scene?.doc).toContain("One scene range");
    expect(scene?.members.map((member) => member.name)).toEqual([
        "index",
        "start",
        "end",
        "frame_count",
    ]);
    expect(scene?.members[3]?.kind).toBe("method");
    // A module-level docstring must not be attached to the next declaration as if it were.
    const sceneAt = module.members.find((member) => member.name === "scene_at");
    expect(sceneAt?.detail).toContain("Scene | None");
});

const TYPED_STUB = `class NoiseDetectorData(Object):
    """Detector output."""

    noise: float

class SceneDetectorData(Object):
    created_on: int

class SequenceData(Object):
    noise_detection: NoiseDetectorData | None
    scene_detection: SceneDetectorData

class EncoderPasses(Object):
    """One encoder variant; exactly one field is present."""

    All: int
    Specific: tuple[int, int]

class EncoderX264(Object):
    pass_: EncoderPasses

class Encoder(Object):
    """One encoder variant; exactly one field is present."""

    X264: EncoderX264

@dataclass(frozen=True, slots=True)
class Scene:
    index: int
    sequence_data: SequenceData
    encoder: Encoder

scenes: tuple[Scene, ...]
`;

it("resolves a chain through the generated document classes", () => {
    const module = parseStub(TYPED_STUB);
    const names = sceneVariables("for scene in cd.scenes:\n");

    expect(resolveExpression(module, "scene.sequence_data", names)?.name).toBe("SequenceData");
    expect(resolveExpression(module, "scene.sequence_data.noise_detection", names)?.name).toBe(
        "NoiseDetectorData",
    );
    expect(resolveExpression(module, "scene.sequence_data.noise_detection.noise", names)).toBe(
        null,
    );
    expect(resolveExpression(module, "scene.encoder", names)?.name).toBe("Encoder");
    expect(resolveExpression(module, "scene.encoder.X264", names)?.name).toBe("EncoderX264");
    // A capitalised enum variant is still a field of its class.
    const passes = resolveExpression(module, "scene.encoder.X264.pass_", names);
    expect(passes?.members.map((member) => member.name)).toEqual(["All", "Specific"]);
    // A Scene read out of the module table resolves the same as a loop variable.
    expect(resolveExpression(module, "cd.scenes[0]", new Set())?.name).toBe("Scene");
    expect(resolveExpression(module, "cd.scenes", new Set())?.name).toBeUndefined();
});

const NESTED_STUB = `class Object:
    """A read-only engine document."""

class SequenceConfig(Object):
    """The stages this open runs."""

    class NoiseDetectorConfig(Object):
        """Threshold the detector used."""

        threshold: float

    noise_detector: NoiseDetectorConfig | None

sequence_config: SequenceConfig
"""The sequence configuration this open runs under."""
`;

it("resolves a document nested inside the class that uses it", () => {
    const module = parseStub(NESTED_STUB);

    // Only the values are declared at module level; the nested document is a type.
    expect(module.members.map((member) => member.name)).toEqual([
        "Object",
        "SequenceConfig",
        "sequence_config",
    ]);
    // The nested document is a member too, so a namespace completes the types under it
    // while the field list still carries the value a script reads.
    expect(module.classes["SequenceConfig"]?.members.map((member) => member.name)).toEqual([
        "NoiseDetectorConfig",
        "noise_detector",
    ]);

    const config = resolveExpression(module, "cd.sequence_config", new Set());
    expect(config?.path).toBe("SequenceConfig");
    const detector = resolveExpression(module, "cd.sequence_config.noise_detector", new Set());
    expect(detector?.path).toBe("SequenceConfig.NoiseDetectorConfig");
    expect(detector?.members.map((member) => member.name)).toEqual(["threshold"]);
    expect(detector?.doc).toContain("Threshold the detector used");
    expect(
        resolveExpression(module, "cd.sequence_config.noise_detector.threshold", new Set()),
    ).toBe(null);
});

const NAMESPACED_STUB = `class Object:
    """A read-only engine document."""

class types:
    """The engine document types."""

    class sequence:
        class SequenceConfig(Object):
            class NoiseDetectorConfig(Object):
                threshold: float

            noise_detector: NoiseDetectorConfig | None

    class data:
        class SceneData(Object):
            created_on: int

        class SequenceData(Object):
            scene_detection: SceneData

    class encoder:
        class Encoder(Object):
            class EncoderX264(Object):
                passes: int

            X264: EncoderX264

sequence_config: types.sequence.SequenceConfig
scenes: tuple[Scene, ...]

@dataclass(frozen=True, slots=True)
class Scene:
    sequence_data: types.data.SequenceData
    encoder: types.encoder.Encoder
`;

it("groups the generated types under namespaces instead of beside the values", () => {
    const module = parseStub(NAMESPACED_STUB);
    const names = sceneVariables("for scene in cd.scenes:\n");

    // The module level carries one name for the types; the declarations live under it.
    expect(module.members.map((member) => member.name)).toEqual([
        "Object",
        "types",
        "sequence_config",
        "scenes",
        "Scene",
    ]);
    expect(module.byName.types?.members.map((member) => member.name)).toEqual([
        "sequence",
        "data",
        "encoder",
    ]);

    // A class is no longer a value: `cd.SequenceConfig` names nothing, so the picker
    // cannot offer it where `cd.sequence_config` belongs.
    expect(resolveExpression(module, "cd.SequenceConfig", new Set())).toBe(null);
    expect(resolveExpression(module, "cd.types.sequence.SequenceConfig", new Set())?.path).toBe(
        "types.sequence.SequenceConfig",
    );

    const config = resolveExpression(module, "cd.sequence_config", names);
    expect(config?.path).toBe("types.sequence.SequenceConfig");
    const detector = resolveExpression(module, "cd.sequence_config.noise_detector", names);
    expect(detector?.path).toBe("types.sequence.SequenceConfig.NoiseDetectorConfig");
    expect(detector?.members.map((member) => member.name)).toEqual(["threshold"]);

    // A Scene field annotated with a cross-namespace path still resolves through it.
    expect(resolveExpression(module, "scene.sequence_data", names)?.path).toBe(
        "types.data.SequenceData",
    );
    expect(resolveExpression(module, "scene.encoder.X264", names)?.path).toBe(
        "types.encoder.Encoder.EncoderX264",
    );
});

it("only treats a variable as a Scene when it was bound to one", () => {
    const names = sceneVariables(
        [
            "import condor_data as cd",
            "for scene in cd.scenes:",
            "    part = clip[scene.start:scene.end]",
        ].join("\n"),
    );
    expect(names.has("scene")).toBe(true);
    expect(names.has("part")).toBe(false);

    const direct = sceneVariables("first = cd.scene_at(120)\n");
    expect(direct.has("first")).toBe(true);
});
