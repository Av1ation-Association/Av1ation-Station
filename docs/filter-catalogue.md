# Input Filter Catalogue

Every filter in the engine's typed input model, and the control the application draws for
it. The engine source of truth is
`andean-condor/src/vapoursynth/vapoursynth_filters.rs` and
`andean-condor/src/core/input/ffms2_filter.rs` at the pinned revision. If this catalogue
and that source disagree, the catalogue is wrong.

`FilterDescriptor` is app-owned: the engine exposes a Rust enum, not labels, groups,
minima, or widget preferences. The app supplies those and a contract test asserts that each
engine variant has exactly one descriptor, so a new engine filter fails CI instead of
appearing uneditable.

## 1. Two targets, not one list

| Target | Enum | Where it applies |
| --- | --- | --- |
| Native FFMS2 | `Ffms2Filter` | `Input::Video` only. One variant. |
| VapourSynth | `VapourSynthFilter` | `Input::VapourSynth` and `Input::VapourSynthScript`. Nine variants. |

The native list is not a subset of the VapourSynth list. `Ffms2Filter::OutputFormat` can
express a bit-depth, chroma, and resolution conversion; it cannot crop or trim, and it
always uses bicubic when it resizes. Offering a scaler choice there would be a lie, so the
native Add action skips the picker and opens that single form.

## 2. How the form is built

Every filter field reuses `ParameterDescriptor` (`kind`, `default`, `widget`, `group`,
`advanced`, `relations`) but never carries a CLI delimiter. The form is generated from
those descriptors, not hand-written per filter. The workflow is:

1. **Add** opens one sheet: a searchable type pane, grouped by target, recents first, with
   focus in the search field.
2. Choosing a type renders its generated form in the sheet's right pane. The input section
   stays behind the sheet; the list does not reflow.
3. **Add filter** inserts at the focused position and closes. The sheet stays open only when
   **Add another** is checked.
4. Every configured row can be edited, duplicated, reordered, or removed. Duplicate copies
   all values and inserts below the source row.

At **project scope** no source exists. Fields that depend on the source (aspect ratio,
crop bounds, trim bounds, output format compatibility) are shown without a fabricated
value and state that geometry is validated when a video is added. At **video scope** the
form is prefilled from `clip_info` and the same constraints validate inline.

`Widget` selection follows `contracts.md` §6.3. A filter field may override the automatic
presentation, but not the kind. The type pane is not a filter: it lists only descriptors
whose `applies_to` matches the current input.

## 3. Native FFMS2 — `OutputFormat`

All fields are optional; an unset field keeps the decoded value. The engine resolves the
bit-depth/chroma pair to an `FFPixelFormat` and rejects a combination with no fixed output
format rather than silently substituting one.

| Field | Kind | Control | App-owned rule |
| --- | --- | --- | --- |
| `bit_depth` | Choice `u8` | segmented `8 · 10 · 12` | Optional. At video scope, disable values the source/decoder cannot produce. |
| `chroma` | Choice | dropdown `Yuv420 · Yuv422 · Yuv444 · Monochrome` | Optional. `Monochrome` is valid with every bit depth the engine maps. |
| `width` | Number `u32` | integer input | Optional; positive. Paired with height by aspect lock. |
| `height` | Number `u32` | integer input | Optional; positive. Paired with width. |

`FFMS2` always resizes with bicubic, so no scaler field exists. When only one dimension is
set, the UI completes the pair from the source ratio when known; at project scope it tells
the user both dimensions are required for a reliable conversion.

## 4. VapourSynth filters

The fields below are exactly the engine enum's fields. "Optional" means the engine accepts
`None`; it does not mean the UI hides the field. A filter with a `Vec<f64>` field is edited
per plane (Y, Cb, Cr), with a clear "apply to all planes" action.

| Filter | Group | Fields and kinds | UI notes |
| --- | --- | --- | --- |
| `Crop` | Geometry | `top`, `bottom`, `left`, `right`: optional `usize` | Four integer inputs around a frame preview. Positive values only. The sum on an axis must be less than the source dimension; this is checked when clip info exists. No negative crop in the engine. |
| `Resize` | Geometry | `scaler`: optional choice; `width`, `height`: optional `usize`; `format`: optional `FFPixelFormat` choice | Scaler options are the engine's `Scaler` enum: `bicubic`, `bilinear`, `bob`, `lanczos`, `point`, `spline16`, `spline36`, `spline64`. Width/height pair with the aspect lock. `format` is a searchable choice, not a free string. |
| `Trim` | Temporal | `start`, `end`: optional `usize` | Frame numbers, not timecodes; the form shows both. `end` is exclusive. `start < end`, and both must be inside the source when known. At most one trim is normally useful; duplicates are allowed but the summary states the final range. |
| `Rescale` | Geometry · advanced | `kernel`: `VSJETKernel` required; `width`, `height`: `usize` required; `doubler`: `Doubler` required | A nested enum editor, not a fixed dropdown. `VSJETKernel` has structural variants (for example `Bicubic { b, c, linear, border_handling }`); the form changes its subfields with the variant. Requires `vodesfunc`/`vskernels`/`vsscale`; surface the plugin check before offering it. |
| `WNNM` | Denoise · advanced | `sigma`: optional `Vec<f64>`; `block_size`, `block_step`, `group_size`, `bm_range`, `radius`, `ps_num`, `ps_range`: optional `usize`; `residual`, `adaptive_aggregation`: optional `bool` | Per-plane sigma up to three values. Positive integer sizes. Defaults are the engine's WNNM pair when used by noise detection; a manually added filter starts empty. Requires `vszip`. |
| `Bilateral` | Denoise · advanced | `sigma_s`, `sigma_r`: optional `Vec<f64>`; `planes`: optional `Vec<bool>`; `algorithm`, `pbficnum`: optional `Vec<u32>` | Per-plane vectors. `planes` is a three-checkbox group, not a text field. `algorithm` and `pbficnum` are numeric lists; their allowed values are not exposed by the engine, so they are labelled advanced and unvalidated beyond type. Requires `vszip`. |
| `Degrain` | Denoise · advanced | 41 optional fields: motion (`blksize`, `overlap`, `pad`, `pel`, `sharp`, `rfilter`, `radius`, `search`, `searchparam`, `mvlambda`, `chroma`, `lsad`, `plevel`, `globalmv`, `pnew`, `pzero`, `pglobal`, `badsad`, `badrange`, `meander`, `trymany`, `satd`), recalculate (`recalculate`, `recalc_thsad`, `recalc_smooth`, `recalc_blksize`, `recalc_overlap`), degrain (`thsad`, `thsad2`, `planes`, `limit`, `thscd1`, `thscd2`), plus `prefix` | A composite motion-compensated filter. First screen shows the six fields that matter (radius, blksize, overlap, pel, thsad, recalculate); the remaining 35 live under **Advanced** grouped by phase. Vectors are per-plane. `prefix` is a text field used in generated node names. Requires `mvutensils`. |
| `ZoomDegrain` | Denoise · advanced | 49 optional fields: super (`hpad`, `vpad`, `pel`, `levels`, `chroma`, `sharp`, `rfilter`), analysis (`blksize`, `blksizev`, `search`, `searchparam`, `pelsearch`, `lambda`, `lsad`, `plevel`, `global`, `pnew`, `pzero`, `pglobal`, `badsad`, `badrange`, `truemotion`, `meander`, `trymany`, `fields`, `tff`, `search_coarse`, `dct`), recalculate (`recalculate`, `recalc_thsad`, `recalc_smooth`, `recalc_blksize`, `recalc_blksizev`, `recalc_search`, `recalc_searchparam`, `recalc_lambda`, `recalc_overlap`, `recalc_overlapv`, `recalc_divide`), degrain (`thsad`, `thsadc`, `plane`, `limit`, `limitc`, `thscd1`, `thscd2`) | Same composite editor as `Degrain`, grouped in four phases. Every field is optional. `plane` is an integer, not a boolean. Requires `zoomvtools`. |
| `FGS` | Grain · advanced | `iso`: required `u32`; `chroma_iso`: optional `u32`; `cy`, `ccb`, `ccr`: optional `Vec<i8>`; `dynamic_seed`: optional `bool` | ISO is required by the engine; 0 is a valid unsigned value but produces no useful grain, so the UI's minimum is 1. Coefficient lists are per-channel; the engine accepts at most 24 luma and 25 per chroma coefficient, which the UI enforces before sending. Requires `com.vs.fgs`. |

The grouped long filters exist because the engine's enum is flat and huge. Grouping is a
presentation rule owned by the descriptor; it does not change serialization, and every
field remains reachable and searchable. A filter form that hides 35 fields without a
disclosure is not acceptable; one that shows all 41 at once at 13px is also not acceptable.
Group + advanced disclosure is the compromise.

## 5. Cross-field rules

| Rule | Where | Why |
| --- | --- | --- |
| Width and height share an aspect lock | `FieldLink::AspectRatio` | Unlocking is a valid state, so this is not a `ParameterRelation`. At project scope the ratio is unknown, so the lock is unavailable. |
| Crop sums stay inside the frame | App-owned filter check with clip info | Four separate fields; pairwise relations cannot express the axis sum. |
| Trim `start < end` | `ParameterRelation::LessThanOrEqual` on the same filter | Pairwise and type-safe. |
| FGS coefficient-list length | `CollectionSpec.max_items` | 24 luma / 25 chroma; the engine's limit is structural but not a JSON Schema bound. |
| Choice values come from the engine enum | Generated schema | The UI never invents a scaler, kernel, pixel format, or model name. |

Geometry and trim checks that need the source run when clip info exists, including the
service's expansion check. At project scope the form says they are pending; it does not
invent a 1920×1080 baseline. This is the only place a project-scope filter is knowingly
saved without full validation, and the reason is that the source genuinely does not exist
yet.

## 6. Availability

Filters that call an external VapourSynth plugin are available only when the preflight
reports that plugin. The current preflight checks the metric plugins; it must extend the
same probe to `vszip`, `mvutensils`, `zoomvtools`, `com.vs.fgs`, and the rescale bundle.
Until then, the form labels those filters "requires plugin" and the run returns a preflight
error naming the missing module. A disabled filter states the missing module and a link; it
is never simply absent with no explanation.

The core filters (`Crop`, `Resize`, `Trim`) need only VapourSynth's standard library and
are always offered when a VapourSynth input is possible. The native `OutputFormat` needs
only FFMS2.

## 7. What is deliberately not exposed

- The raw comma-separated CLI filter syntax. The typed enum is the model; a raw string would
  bypass validation and the descriptor model.
- `Splice`. The engine's typed enum has no such variant; it is a script primitive, not an
  input filter.
- Per-scene filters. A filter list belongs to an input; per-scene behaviour is the script
  reading scene data (AGENTS §2.10).
- Minimum and maximum values invented for fields the engine does not document. Unknown
  bounds render as a number input marked "unbounded"; the server still validates the type
  and the pairwise rules.
