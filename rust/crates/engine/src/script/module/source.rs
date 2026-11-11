//! Generated Python module, type stub, and template text.

use super::*;

/// The module source, which is the same text for every open.
///
/// Everything that changes per open lives in the JSON beside it: Python keeps an imported
/// module in `sys.modules` for the whole run, so a module with baked-in values would answer
/// a later open with the table the first open had, which is empty before Scene Detector has
/// run. That cache is shared by every script VSScript evaluates in the process, including
/// another video's, so the module resolves the JSON from the open that is evaluating instead
/// of from the scenes directory it happened to be imported out of.
pub fn module_source() -> String {
    format!(
        r#""""
The data this session's script reads, generated before every sequence; do not edit.

Every name here mirrors the value the runner injected as a `condor_` variable: the
module decodes it once so a script does not have to.
"""

from __future__ import annotations

import json as _json
import os as _os
import sys as _sys
from dataclasses import dataclass
from typing import Any

__all__ = [
    "Object",
    "Scene",
    "types",
    "video_path",
    "temp_dir",
    "run_id",
    "sequence",
    "sequence_config",
    "scenes",
    "scene_count",
    "scene_at",
]

#: The document beside the module, used only when no scripting frame names its open: an
#: exported script carries its own, and no frame is left once evaluation has returned.
_FALLBACK = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "condor_data.json")
_STAMP: tuple[str, int, int] | None = None
_DOCUMENT: dict[str, Any] = {{}}
_SCENES: tuple[Scene, ...] | None = None
#: Set by an exported script, which carries its document instead of a JSON file beside it.
_PINNED = False


def _data_file() -> str:
    """The document for the script that is running.

    The module is imported once per Python runtime, and VSScript shares that runtime between
    opens, so this object is not necessarily the copy the current video's scenes directory
    holds. The open being evaluated is the one whose frame injected `condor_temp_dir`, so the
    document is resolved from the calling frame rather than from `__file__`.
    """
    frame = _sys._getframe(1)
    while frame is not None:
        value = frame.f_globals.get("condor_temp_dir")
        if isinstance(value, (bytes, bytearray)):
            value = value.decode()
        if isinstance(value, str) and value:
            return _os.path.join(value, "condor_data.json")
        frame = frame.f_back
    return _FALLBACK


def _document() -> dict[str, Any]:
    """The document this open wrote, re-read whenever the runner rewrites it."""
    global _STAMP, _DOCUMENT, _SCENES
    if _PINNED:
        return _DOCUMENT
    path = _data_file()
    stat = _os.stat(path)
    stamp = (path, stat.st_mtime_ns, stat.st_size)
    if stamp != _STAMP:
        with open(path, encoding="utf-8") as handle:
            _DOCUMENT = _json.load(handle)
        _SCENES = None
        _STAMP = stamp
    return _DOCUMENT


class Object:
    """A read-only view of one engine document.

    The engine serialises sequence data and encoder parameters as JSON. Attribute access
    keeps a script readable (`scene.sequence_data.noise_detection.noise`) while `get`,
    `keys`, and `as_dict` remain available for inspection. Assignment raises: the document
    belongs to the engine, and a script that needs a different value builds a new dict.
    """

    __slots__ = ("_values",)

    def __init__(self, values: dict[str, Any]) -> None:
        object.__setattr__(self, "_values", values)

    def __getattr__(self, name: str) -> Any:
        try:
            return self._values[name]
        except KeyError:
            # A stub field whose Rust name is a Python keyword is annotated with a trailing
            # underscore (`pass_`), so the same spelling reads the underlying `pass` value.
            if name.endswith("_") and name[:-1] in self._values:
                return self._values[name[:-1]]
            raise AttributeError(name) from None

    def __setattr__(self, name: str, value: Any) -> None:
        raise AttributeError("condor_data is read-only")

    def __getitem__(self, key: str) -> Any:
        return self._values[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._values.get(key, default)

    def keys(self):
        return self._values.keys()

    def as_dict(self) -> dict[str, Any]:
        """The underlying document, for code that wants a plain mapping."""
        return dict(self._values)

    def __repr__(self) -> str:
        return f"Object({{self._values!r}})"


def _object(value: Any) -> Any:
    """Convert a decoded JSON document into attribute objects at every level."""
    if isinstance(value, dict):
        return Object({{key: _object(item) for key, item in value.items()}})
    if isinstance(value, list):
        return tuple(_object(item) for item in value)
    return value


{types}


@dataclass(frozen=True, slots=True)
class Scene:
    """One scene range and the engine data attached to it."""

    index: int
    start: int
    end: int
    sequence_data: types.data.SequenceData
    encoder: types.encoder.Encoder

    @property
    def frame_count(self) -> int:
        """Frames the range covers."""
        return self.end - self.start


def _scenes() -> tuple[Scene, ...]:
    """Every scene in pipeline order; empty before Scene Detector has run."""
    global _SCENES
    document = _document()
    if _SCENES is None:
        _SCENES = tuple(
            Scene(
                index=row["index"],
                start=row["start"],
                end=row["end"],
                sequence_data=_object(row["sequence_data"]),
                encoder=_object(row["encoder"]),
            )
            for row in document["scenes"]
        )
    return _SCENES


def _scene_at(frame: int) -> Scene | None:
    """The scene containing `frame`, or `None` when it is outside every range."""
    for scene in _scenes():
        if scene.start <= frame < scene.end:
            return scene
    return None


def __getattr__(name: str) -> Any:
    """Read a value on access, so a module kept in `sys.modules` is never a stale open."""
    if name in ("video_path", "temp_dir", "run_id", "sequence"):
        return _document()[name]
    if name == "sequence_config":
        return _object(_document()["sequence_config"])
    if name == "scenes":
        return _scenes()
    if name == "scene_count":
        return len(_scenes())
    if name == "scene_at":
        return _scene_at
    raise AttributeError(f"module 'condor_data' has no attribute {{name!r}}")


def __dir__() -> list[str]:
    return sorted(__all__)
"#,
        types = types_source(),
    )
}

/// The `.pyi` stub for the module, which is what the editor completes against.
pub fn stub_source() -> String {
    format!(
        r#""""
The data this session's script reads, generated before every sequence; do not edit.

Every name here mirrors the value the runner injected as a `condor_` variable: the
module decodes it once so a script does not have to.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

class Object:
    """A read-only engine document with attribute access."""

    def __getattr__(self, name: str) -> Any: ...
    def __getitem__(self, key: str) -> Any: ...
    def get(self, key: str, default: Any = None) -> Any: ...
    def keys(self): ...
    def as_dict(self) -> dict[str, Any]: ...

{types}

video_path: str
"""Absolute path of the source file this run decodes."""

temp_dir: str
"""The per-video scratch directory the run writes chunks and sidecars into."""

run_id: str
"""Correlation id of the run that opened the script."""

sequence: str
"""The sequence this open belongs to, empty before the first one."""

sequence_config: types.sequence.SequenceConfig
"""The sequence configuration this open runs under; a disabled stage is `None`."""

@dataclass(frozen=True, slots=True)
class Scene:
    """One scene range and the engine data attached to it."""

    index: int
    start: int
    end: int
    sequence_data: types.data.SequenceData
    encoder: types.encoder.Encoder
    @property
    def frame_count(self) -> int: ...

scenes: tuple[Scene, ...]
"""Every scene in pipeline order; empty before Scene Detector has run."""

scene_count: int
"""Number of scenes in `scenes`."""

def scene_at(frame: int) -> Scene | None:
    """The scene containing `frame`, or `None` when it is outside every range."""
    ...
"#,
        types = types_source(),
    )
}

/// The starting script for a new custom input.
///
/// It imports the generated module, opens the queued video, and sets that source as the
/// output. Filtering is the user's choice: one whole-clip example is commented, and so are
/// the per-scene methods, including the FrameEval escape hatch. A new input is therefore a
/// valid clip before Scene Detector has run and does not alter the video by itself.
pub fn template_source() -> String {
    // The raw literal starts with a newline so its `"""` docstring never meets the `r#"`
    // delimiter: doing that swallows a quote and hands Python an unterminated string.
    r#"
"""One input for the whole video.

The engine evaluates this script once per open. `cd.video_path` is the file the video was
queued with; `cd.scenes` is the scene table when Scene Detector has run. Per-scene filtering
is optional; the commented examples at the end show how, and what they cost.
"""

import sys

import vapoursynth as vs

# The runner writes condor_data.py into the scenes directory on every open and injects that
# directory as condor_temp_dir, so the module is importable without copying it here.
sys.path.insert(0, condor_temp_dir.decode())

import condor_data as cd

core = vs.core

# The file the video was queued with, so this script follows the queue rather than naming
# one machine's path.
src = core.ffms2.Source(source=cd.video_path)

# Apply the filters this video needs. The core filter below is a placeholder; uncomment it
# or replace it with the filters you want.
# src = core.std.FlipHorizontal(src)

out = src
out.set_output()

# ---------------------------------------------------------------------------
# Optional: per-scene filtering
#
# A scene is a frame range in this one script, not a second script: `cd.scenes` carries
# `start`, `end`, `index`, read-only `sequence_data`, and the scene's `encoder` document.
# `cd.sequence_config` is the run's configuration. Nothing below runs until uncommented.
#
# A cheap filter, with no per-instance allocation, may be applied to each range directly.
# Splice the parts progressively; one `std.Splice` over every part is slower (S5):
#
# parts = []
# for scene in cd.scenes:
#     part = src[scene.start : scene.end]
#     if scene.index % 2 == 0:
#         part = core.std.FlipHorizontal(part)
#     parts.append(part)
# if parts:
#     out = parts[0]
#     for part in parts[1:]:
#         out = core.std.Splice([out, part])
# out.set_output()
#
# A filter that allocates device memory (NLMeans, BM3D, MVTools) keeps that memory for the
# life of the graph. Do not build one per scene: a 278-scene video would hold 278 instances
# and exhaust an 8 GB card before the first frame. If its parameters are discrete, build one
# instance per distinct parameter set over the whole source, then slice its output:
#
# variants = {}
#
# def variant(key):
#     if key not in variants:
#         variants[key] = my_filter(src, key)
#     return variants[key]
#
# parts = [
#     variant(choose_strength(scene))[scene.start : scene.end]
#     for scene in cd.scenes
# ]
# if parts:
#     out = parts[0]
#     for part in parts[1:]:
#         out = core.std.Splice([out, part])
# out.set_output()
#
# If every scene needs a different value, no grouping is exact. `std.FrameEval` can dispatch
# each frame to a clip built with that scene's value, but it is a per-frame dispatcher, not a
# free per-scene filter: it calls the selector for every frame, and a cache miss rebuilds the
# filter and allocates its memory again. The engine reads one script from several workers, so
# the cache must cover the scenes in flight. A cache of one thrashes as the readers alternate;
# a cache per scene grows with the scene count. Bound it deliberately and size the bound to
# the readers a run can have in flight:
#
# from functools import lru_cache
#
# # The engine opens one reader per worker; two covers one reader and a preview. Raise
# # it only to the run's worker count: every entry holds a filter instance, and every
# # eviction rebuilds one.
# CACHE_SCENES = 2
#
# @lru_cache(maxsize=CACHE_SCENES)
# def scene_clip(index):
#     scene = cd.scenes[index]
#     return my_filter(src, choose_strength(scene))
#
# def selector(n):
#     scene = cd.scene_at(n)
#     return src if scene is None else scene_clip(scene.index)
#
# out = core.std.FrameEval(src, selector, clip_src=[src])
# out.set_output()
#
# In the measured run, two readers alternating between scenes with a one-scene cache built
# the filter for every frame (5.9 fps); a two-scene cache built it twice and ran at 9.5 fps,
# against 10.6 fps for the grouped graph. Budget the rebuilds, not only the memory.
#
# FrameEval is an escape hatch, not the default. It is worth its rebuild cost only when the
# parameter is continuous or cannot be grouped; otherwise use the variant example above.
"#
    .trim_start()
    .to_owned()
}

/// Write the module and its document for one open, creating the scenes directory when it
/// does not exist yet.
///
/// The module text does not change, so a Python runtime keeps it cached; the JSON is written
/// next to it every time, and an accessor in the module re-reads it. That is what makes a
/// later sequence see the scenes an earlier one produced. The accessor follows the running
/// script's `condor_temp_dir`, because a runtime shared with another video can hand the
/// script a module imported from that video's directory.
/// The Python declarations of the two engine documents, from their generated JSON Schema.
///
/// An untyped `Object` forces a script to guess every field name, and a guess that is wrong
/// fails only when the sequence opens. The engine derives `JsonSchema` for the documents it
/// serialises, so the same schema the contracts use can annotate the stub: every known field
/// becomes an attribute with its Python type, a nested document becomes a class of its own,
/// and an encoder variant becomes a class whose single field names the variant. The schema
/// carries no defaults, so a field is annotated but never assumed present.
///
/// The text depends only on the engine's types, so it is built once per process rather than
/// on every sequence open.
fn types_source() -> &'static str {
    static TYPES: OnceLock<String> = OnceLock::new();
    TYPES.get_or_init(|| {
        let data =
            serde_json::to_value(schemars::schema_for!(DefaultSequenceData)).unwrap_or(Value::Null);
        let encoder = serde_json::to_value(schemars::schema_for!(Encoder)).unwrap_or(Value::Null);
        let config =
            serde_json::to_value(schemars::schema_for!(RunnerConfig)).unwrap_or(Value::Null);
        let mut types = StubTypes::default();
        types.collect(&data);
        types.collect(&encoder);
        types.collect(&config);
        types.declare_root(&data, "SequenceData");
        types.declare_root(&encoder, "Encoder");
        types.declare_root(&config, "SequenceConfig");
        types.render()
    })
}

/// The root of each document tree, and the namespace module it is declared under.
///
/// The three roots are the documents this application serialises: the configuration the open
/// runs under, the data it wrote, and the encoder each scene used.
const ROOTS: [(&str, &str); 3] = [
    ("SequenceConfig", "sequence"),
    ("SequenceData", "data"),
    ("Encoder", "encoder"),
];

/// One document class, before the nesting in the stub is decided.
struct StubClass {
    name: String,
    doc: Option<String>,
    fields: Vec<(String, String)>,
    /// Set for a definition the schema shipped no body for: the stub writes `Name = Any`.
    alias: Option<String>,
}

/// Class declarations accumulated from one or more JSON Schemas.
#[derive(Default)]
struct StubTypes {
    definitions: BTreeMap<String, Value>,
    classes: Vec<StubClass>,
    declared: BTreeSet<String>,
}

impl StubTypes {
    /// Take every `$defs` entry, so a nested `$ref` resolves without a second lookup.
    fn collect(&mut self, schema: &Value) {
        let Some(definitions) = schema.get("$defs").and_then(Value::as_object) else {
            return;
        };
        for (name, definition) in definitions {
            self.definitions.insert(name.clone(), definition.clone());
        }
    }

    /// Declare a schema's root class under the module's own name for it.
    ///
    /// `schema_for!` makes every root a `$ref` to a definition named after the Rust type.
    /// Following that reference literally declared `RunnerConfig`, while the stub annotates
    /// `sequence_config: SequenceConfig`; the editor then resolved the annotation to no
    /// class at all and completed nothing after `cd.sequence_config.`. Resolving the
    /// definition and declaring it as the module's name keeps the annotation true.
    fn declare_root(&mut self, schema: &Value, name: &str) {
        let Some(reference) = schema.get("$ref").and_then(Value::as_str) else {
            let _ = self.type_of(schema, name);
            return;
        };
        let key = reference.rsplit('/').next().unwrap_or(reference).to_owned();
        let Some(definition) = self.definitions.get(&key).cloned() else {
            let _ = self.type_of(schema, name);
            return;
        };
        if self.declared.contains(name) {
            return;
        }
        self.declared.insert(name.to_owned());
        // The Rust name is the same document; declaring it too would add a duplicate class.
        self.declared.insert(key);
        if definition.get("properties").is_some() {
            self.class(name, &definition, None);
        } else if let Some(branches) = definition.get("oneOf").and_then(Value::as_array) {
            self.enumeration(branches, name);
        } else {
            self.classes.push(StubClass {
                name: name.to_owned(),
                doc: None,
                fields: Vec::new(),
                alias: Some("Any".to_owned()),
            });
        }
    }

    /// The Python annotation for a schema, declaring any class the annotation names.
    fn type_of(&mut self, schema: &Value, hint: &str) -> String {
        if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
            return self.reference(reference);
        }
        if let Some(branches) = schema.get("anyOf").and_then(Value::as_array) {
            return self.union(branches, hint);
        }
        if let Some(branches) = schema.get("oneOf").and_then(Value::as_array) {
            return self.enumeration(branches, hint);
        }
        if let Some(kinds) = schema.get("type").and_then(Value::as_array) {
            let mut parts = Vec::new();
            for kind in kinds {
                let part = match kind.as_str() {
                    Some("object") => self.object(schema, hint),
                    Some("array") => self.array(schema, hint),
                    Some("null") => "None".to_owned(),
                    Some(other) => scalar(other).to_owned(),
                    None => "Any".to_owned(),
                };
                if !parts.contains(&part) {
                    parts.push(part);
                }
            }
            return parts.join(" | ");
        }
        match schema.get("type").and_then(Value::as_str) {
            Some("object") => self.object(schema, hint),
            Some("array") => self.array(schema, hint),
            Some(kind) => scalar(kind).to_owned(),
            _ if schema.get("const").is_some() => "str".to_owned(),
            _ => "Any".to_owned(),
        }
    }

    fn union(&mut self, branches: &[Value], hint: &str) -> String {
        let mut parts = Vec::new();
        for branch in branches {
            let part = self.type_of(branch, hint);
            if !parts.contains(&part) {
                parts.push(part);
            }
        }
        parts.join(" | ")
    }

    fn reference(&mut self, reference: &str) -> String {
        let name = reference.rsplit('/').next().unwrap_or(reference).to_owned();
        if let Some(definition) = self.definitions.get(&name).cloned() {
            // A string or integer enum is that value in the document, not an object a
            // script walks: annotating it as a class would declare a type that carries
            // no members and invite completion after a `str`.
            if let Some(kind) = scalar_enum(&definition) {
                return kind.to_owned();
            }
            // A tagged union becomes a class of variants; a union of literal tags is a
            // scalar, and `enumeration` returns the primitive annotation for it.
            if let Some(branches) = definition.get("oneOf").and_then(Value::as_array) {
                return self.enumeration(branches, &name);
            }
            self.declare(&name, &definition);
            return name;
        }
        // A schema can reference a definition it did not ship (the upstream engine's
        // `FFPixelFormat` is one). Annotating the bare name would name a class the stub
        // never declares, and completion would silently stop at that field, so the honest
        // fallback is the untyped value the generator uses everywhere else.
        "Any".to_owned()
    }

    fn object(&mut self, schema: &Value, hint: &str) -> String {
        if schema.get("properties").is_none() {
            // A map with a typed value is still typed: `scenecut_scores` maps a frame to a
            // `ScenecutScore` and encoder CLI options map a name to a `CLIParameter`. Only
            // a map whose values the schema does not describe stays `Any`.
            let values = schema
                .get("additionalProperties")
                .filter(|values| values.is_object())
                .or_else(|| {
                    schema
                        .get("patternProperties")
                        .and_then(Value::as_object)
                        .and_then(|patterns| patterns.values().next())
                });
            if let Some(values) = values {
                let value_type = self.type_of(values, &format!("{hint}Value"));
                return format!("dict[str, {value_type}]");
            }
            return "dict[str, Any]".to_owned();
        }
        self.declare(hint, schema);
        hint.to_owned()
    }

    fn array(&mut self, schema: &Value, hint: &str) -> String {
        // A Rust tuple serialises as a fixed `prefixItems` list, not as a homogeneous array.
        if let Some(items) = schema.get("prefixItems").and_then(Value::as_array) {
            let parts: Vec<String> = items
                .iter()
                .enumerate()
                .map(|(index, item)| self.type_of(item, &format!("{hint}{index}")))
                .collect();
            if parts.len() == 1 {
                return format!("tuple[{},]", parts[0]);
            }
            return format!("tuple[{}]", parts.join(", "));
        }
        let item_type = schema
            .get("items")
            .map_or_else(|| "Any".to_owned(), |items| self.type_of(items, hint));
        format!("tuple[{item_type}, ...]")
    }

    fn declare(&mut self, name: &str, schema: &Value) {
        if self.declared.contains(name) {
            return;
        }
        if schema.get("properties").is_some() {
            self.declared.insert(name.to_owned());
            self.class(name, schema, None);
            return;
        }
        self.declared.insert(name.to_owned());
        self.classes.push(StubClass {
            name: name.to_owned(),
            doc: None,
            fields: Vec::new(),
            alias: Some("Any".to_owned()),
        });
    }

    fn class(&mut self, name: &str, schema: &Value, description: Option<&str>) {
        let mut fields = Vec::new();
        if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
            for (field, property) in properties {
                let field_type = self.type_of(property, &format!("{name}{}", pascal(field)));
                fields.push((python_field(field), field_type));
            }
        }
        let description = description
            .or_else(|| schema.get("description").and_then(Value::as_str))
            .map(str::to_owned);
        self.classes.push(StubClass {
            name: name.to_owned(),
            doc: description,
            fields,
            alias: None,
        });
    }

    /// A Rust enum with a tag field is a Python class whose single field names the variant.
    /// A string-only enum has nothing to declare, so it is annotated as `str` instead.
    fn enumeration(&mut self, branches: &[Value], name: &str) -> String {
        let mut variants = Vec::new();
        for branch in branches {
            let Some((tag, payload)) = single_tag(branch) else {
                return "str".to_owned();
            };
            let variant_name = format!("{name}{}", pascal(&tag));
            let payload_type = self.type_of(&payload, &variant_name);
            // A unit variant is a field named after the variant, and one of those is
            // `None`; a class body cannot declare a keyword, so it is renamed like any
            // other keyword field.
            variants.push((python_field(&tag), payload_type));
        }
        if variants.is_empty() {
            return "Any".to_owned();
        }
        self.declared.insert(name.to_owned());
        // Exactly one variant field is present on an instance. Marking each optional would
        // describe a document the run never writes, so the class docstring states the rule.
        self.classes.push(StubClass {
            name: name.to_owned(),
            doc: Some("One encoder variant; exactly one field is present.".to_owned()),
            fields: variants,
            alias: None,
        });
        name.to_owned()
    }

    /// Render the declarations as one tree of namespaces, not a flat list.
    ///
    /// A schema has one class per document, all siblings of each other, and a flat stub put
    /// every one of them beside the module's data values: `cd.SequenceConfig` then sat where
    /// `cd.sequence_config` belongs, and the list of what a script can read was mostly type
    /// names. The declarations are grouped into `types.sequence`, `types.data`, and
    /// `types.encoder` — one namespace per document the stub describes — and nested under the
    /// document that references them inside that namespace, so the module level carries the
    /// values a script reads and one name for their types.
    fn render(&self) -> String {
        let parent = self.nesting();
        let group = self.groups(&parent);
        let mut text = String::from(
            "class types:\n    \"\"\"The engine document types, grouped by the document they describe.\n\n    `sequence` is the configuration this open runs under, `data` is what the sequence\n    wrote, and `encoder` is the encoder document. These are namespaces, not values: a\n    script reads `cd.sequence_config`, never `cd.types`.\n    \"\"\"\n\n",
        );
        for (_, namespace) in ROOTS {
            text.push_str(&format!("    class {namespace}:\n"));
            let mut written = BTreeSet::new();
            for class in &self.classes {
                let in_group =
                    group.get(class.name.as_str()).map(String::as_str) == Some(namespace);
                let nested_inside = parent
                    .get(class.name.as_str())
                    .and_then(|owner| group.get(*owner))
                    .map(String::as_str)
                    == Some(namespace);
                if in_group && !nested_inside {
                    self.write_class(&mut text, class, 2, &parent, &group, &mut written);
                }
            }
        }
        text
    }

    /// The namespace each declaration belongs to, keyed by the class's own name.
    ///
    /// A class under a root's parent chain belongs to that root's namespace. A document two
    /// roots share — a quality pass, an encoder parameter — is nested under neither, so it
    /// takes the namespace of the first class that names it; a class nothing references at all
    /// falls back to `data`, which keeps every declaration reachable by one path.
    fn groups(&self, parent: &BTreeMap<&str, &str>) -> BTreeMap<String, String> {
        let mut group: BTreeMap<String, String> = BTreeMap::new();
        for (root, namespace) in ROOTS {
            group.insert(root.to_owned(), namespace.to_owned());
            let mut frontier = vec![root.to_owned()];
            while let Some(owner) = frontier.pop() {
                for class in &self.classes {
                    if parent.get(class.name.as_str()) == Some(&owner.as_str())
                        && !group.contains_key(class.name.as_str())
                    {
                        group.insert(class.name.clone(), namespace.to_owned());
                        frontier.push(class.name.clone());
                    }
                }
            }
        }
        loop {
            let mut assigned = false;
            for class in &self.classes {
                let Some(namespace) = group.get(class.name.as_str()).cloned() else {
                    continue;
                };
                for (_, annotation) in &class.fields {
                    for token in identifiers(annotation) {
                        if !self.declared.contains(token) || group.contains_key(token) {
                            continue;
                        }
                        if self.classes.iter().any(|known| known.name == token) {
                            group.insert(token.to_owned(), namespace.clone());
                            assigned = true;
                        }
                    }
                }
            }
            if !assigned {
                break;
            }
        }
        for class in &self.classes {
            group
                .entry(class.name.clone())
                .or_insert_with(|| "data".to_owned());
        }
        group
    }

    /// The dotted name a declaration is reachable by, e.g. `types.data.NoiseDetectorData`.
    fn declared_path(
        &self,
        name: &str,
        parent: &BTreeMap<&str, &str>,
        group: &BTreeMap<String, String>,
    ) -> String {
        let namespace = group.get(name).map_or("data", String::as_str);
        let mut chain = vec![name.to_owned()];
        let mut current = name;
        while let Some(owner) = parent.get(current) {
            chain.push((*owner).to_owned());
            current = owner;
        }
        chain.reverse();
        format!("types.{namespace}.{}", chain.join("."))
    }

    /// A field annotation, with every class outside the declaring body written by its path.
    ///
    /// A nested class body cannot resolve a name from an enclosing class scope: Python's
    /// `get_type_hints` looks in the class's own namespace and the module globals, so a
    /// shared document declared at a namespace's top level is not visible from a class
    /// nested below it. Only a sibling declared in the same body stays bare — that is what the
    /// generated tree reads best as — and every other class reference is written in full.
    fn scope_annotation(
        &self,
        annotation: &str,
        owner: &str,
        parent: &BTreeMap<&str, &str>,
        group: &BTreeMap<String, String>,
    ) -> String {
        let mut text = String::with_capacity(annotation.len());
        let mut token = String::new();
        let flush = |token: &mut String, text: &mut String| {
            if token.is_empty() {
                return;
            }
            let known = self.classes.iter().any(|class| class.name == *token);
            let sibling = parent.get(token.as_str()).copied() == Some(owner);
            if known && !sibling {
                text.push_str(&self.declared_path(token, parent, group));
            } else {
                text.push_str(token);
            }
            token.clear();
        };
        for character in annotation.chars() {
            if character.is_alphanumeric() || character == '_' {
                token.push(character);
                continue;
            }
            flush(&mut token, &mut text);
            text.push(character);
        }
        flush(&mut token, &mut text);
        text
    }

    /// The class each declaration is nested inside, keyed by the nested class's own name.
    ///
    /// A class is nested under the one class that references it, so the tree follows the
    /// schema's shape rather than its declaration order. A document several classes share —
    /// an input, a metric, an encoder parameter — belongs to none of them, so it stays at its
    /// namespace's top level, where it is declared once instead of copied into an owner.
    /// A reference back to an ancestor is skipped: the schema may describe a recursive
    /// document, and Python cannot nest a class inside its own descendant.
    fn nesting(&self) -> BTreeMap<&str, &str> {
        let mut owners: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
        for class in &self.classes {
            for (_, annotation) in &class.fields {
                for token in identifiers(annotation) {
                    if token == class.name || !self.declared.contains(token) {
                        continue;
                    }
                    if self.classes.iter().any(|known| known.name == token) {
                        let entry = owners.entry(token).or_default();
                        if !entry.contains(&class.name.as_str()) {
                            entry.push(class.name.as_str());
                        }
                    }
                }
            }
        }
        let mut parent: BTreeMap<&str, &str> = BTreeMap::new();
        for (child, references) in owners {
            let [owner] = references.as_slice() else {
                continue;
            };
            let owner: &str = owner;
            if !self.sits_under(&parent, child, owner) {
                parent.insert(child, owner);
            }
        }
        parent
    }

    /// Whether nesting `child` under `owner` would close a cycle in the parent chain.
    fn sits_under(&self, parent: &BTreeMap<&str, &str>, child: &str, owner: &str) -> bool {
        let mut current = Some(owner);
        for _ in 0..self.classes.len().max(1) + 1 {
            let Some(node) = current else {
                return false;
            };
            if node == child {
                return true;
            }
            current = parent.get(node).copied();
        }
        true
    }

    fn write_class(
        &self,
        text: &mut String,
        class: &StubClass,
        depth: usize,
        parent: &BTreeMap<&str, &str>,
        group: &BTreeMap<String, String>,
        written: &mut BTreeSet<String>,
    ) {
        if !written.insert(class.name.clone()) {
            return;
        }
        let pad = "    ".repeat(depth);
        let inner = "    ".repeat(depth + 1);
        if let Some(alias) = &class.alias {
            text.push_str(&format!("{pad}{} = {alias}\n\n", class.name));
            return;
        }
        // Every generated class describes the same read-only document, so it inherits the
        // helpers (`get`, `keys`, `as_dict`, item access) a script may call on any of them.
        text.push_str(&format!("{pad}class {}(Object):\n", class.name));
        let description = class
            .doc
            .as_deref()
            .unwrap_or("One engine document, as the run wrote it.");
        text.push_str(&format!(
            "{inner}\"\"\"{}\"\"\"\n\n",
            description.replace("\"\"\"", "'''")
        ));
        // Nested documents come first: a field annotated with one then reads top to bottom.
        for child in &self.classes {
            if parent.get(child.name.as_str()).copied() == Some(class.name.as_str()) {
                self.write_class(text, child, depth + 1, parent, group, written);
            }
        }
        if class.fields.is_empty() {
            text.push_str(&format!("{inner}...\n\n"));
        } else {
            for (field, annotation) in &class.fields {
                let annotation = self.scope_annotation(annotation, &class.name, parent, group);
                text.push_str(&format!("{inner}{field}: {annotation}\n"));
            }
            text.push('\n');
        }
    }
}

/// The identifiers an annotation names, so a field can be matched to its declaration.
fn identifiers(annotation: &str) -> impl Iterator<Item = &str> {
    annotation
        .split(|character: char| !character.is_alphanumeric() && character != '_')
        .filter(|token| !token.is_empty())
}

/// The tag and payload of a Rust enum variant serialised as a single-field object.
fn single_tag(branch: &Value) -> Option<(String, Value)> {
    let properties = branch.get("properties").and_then(Value::as_object)?;
    if properties.len() != 1 {
        return None;
    }
    let (tag, payload) = properties.iter().next()?;
    let required = branch.get("required").and_then(Value::as_array)?;
    if !required
        .iter()
        .any(|value| value.as_str() == Some(tag.as_str()))
    {
        return None;
    }
    Some((tag.clone(), payload.clone()))
}

/// The annotation for a definition that enumerates primitive values, if it is one.
///
/// Schemars writes both `{"type": "string", "enum": [...]}` and, for a unit enum it
/// renames, the bare `{"enum": [...]}` list. Either way the document carries the value,
/// not an object.
fn scalar_enum(definition: &Value) -> Option<&'static str> {
    let values = definition.get("enum")?.as_array()?;
    if values.iter().all(Value::is_string) {
        return Some("str");
    }
    if values.iter().all(|value| value.is_i64() || value.is_u64()) {
        return Some("int");
    }
    None
}

/// A Python annotation for a JSON schema primitive.
fn scalar(kind: &str) -> &'static str {
    match kind {
        "integer" => "int",
        "number" => "float",
        "boolean" => "bool",
        "string" => "str",
        "null" => "None",
        _ => "Any",
    }
}

/// A field name that is legal Python.
///
/// An engine field can be named after a Python keyword (`pass` on an encoder, `global` in a
/// decoder document); a class body may not declare it, so the stub appends an underscore.
/// `Object.__getattr__` strips that underscore when it reads the underlying document.
fn python_field(field: &str) -> String {
    if PYTHON_KEYWORDS.contains(&field) {
        format!("{field}_")
    } else {
        field.to_owned()
    }
}

/// The keywords a class body cannot declare as a field name.
const PYTHON_KEYWORDS: [&str; 35] = [
    "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
    "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import",
    "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while",
    "with", "yield",
];

fn pascal(value: &str) -> String {
    value
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut characters = part.chars();
            match characters.next() {
                Some(first) => first.to_uppercase().collect::<String>() + characters.as_str(),
                None => String::new(),
            }
        })
        .collect()
}
