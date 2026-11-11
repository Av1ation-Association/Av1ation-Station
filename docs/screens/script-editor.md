# Script editor

The script is one screen per **input**, not one project-wide script. It edits the script
document owned by General, a sequence override, or a saved project template, and it never
invents an "applies to" scope.

## Editor

### Editor layout

- **Top bar.** **Discard** and **Save** live in the 56px top bar beside the dirty-state
  indicator, exactly as on a Configuration section. The editor has no footer and no second
  pair of actions.
- **Breadcrumb.** The breadcrumb names the owning context; the page never says only
  "Script". Examples:

```text
Projects / Big Buck Bunny / General / Input / VapourSynth Script
Projects / Big Buck Bunny / Noise generation / Input / VapourSynth Script
Projects / Big Buck Bunny / Encoding / Input / VapourSynth Script
Projects / Big Buck Bunny / Target quality / Metric input / VapourSynth Script
Settings / Project Templates / <template name> / General / Input / VapourSynth Script
```

- **Editor.** Monaco, with the generated `condor_data.pyi` exposed to completion.
- **Script data panel.** Every reserved variable with its description, Python format, and
  current value, fed by the video-state endpoint.
- **Validation.** A **Validate** action and an inline error strip sit beside the panel.
- **What runs.** A read-only view shows the script as evaluated with those values listed
  beside it.
- **No "Applies to" block.** The breadcrumb is the scope.

### Editor behavior

1. **Address the input.** The page is reached from the input component on General, Scene
   detection, Noise generation, Target quality (input and metric input), Encoding, and
   Quality check. A sequence override is addressed by its part key in the page's search params
   (`?section=target-quality&part=target_quality`), so the page saves that sequence's `input`
   rather than the project's General document.
2. **Draft and save.** Save commits in place; Discard restores the last saved script; leaving
   with a draft goes through the same guard as a Configuration section, whose primary action
   saves and leaves. The guard applies to both the project and the template page.
3. **Read the variables.** The `script_data` panel lists every reserved variable with its
   description, Python format, and current value, so the user can see what the script will
   receive without running it.
4. **Validate on demand.** **Validate** posts the text; the service evaluates it and reports
   the clip it returned, the interpreter's own failure, or that this machine cannot run
   VapourSynth. Save is not disabled by validation; the service runs the same checks and
   returns the error.
5. **Complete from the generated stub.** The module level exposes `video_path`, `temp_dir`,
   `run_id`, `sequence`, `sequence_config`, `scenes`, `scene_count`, and `scene_at`.
   - Document classes live under one `types` namespace, grouped as `types.sequence`,
     `types.data`, and `types.encoder` and nested inside the class that references them, so a
     type is never offered where a value belongs.
   - Each scene's `sequence_data` and `encoder` are annotated down to every nested field, so
     completion resolves `scene.sequence_data.noise_detection.` and
     `cd.sequence_config.noise_detector.` without a second hand-written table.
   - Only a free-form map such as `scenecut_scores` stays `dict[str, Any]`.
   - Width, height, and fps are deliberately absent because the imported `VideoNode` already
     provides them.
6. **Start the language server.** Completion has two sources, and the page names the one in
   use. The service prefers a `pyright-langserver` on `PATH`, otherwise starts the Jedi it
   ships inside the chosen interpreter, otherwise falls back to `jedi-language-server` or
   `pylsp` on `PATH`. The page opens `/api/editor/lsp` and speaks LSP to it, so completion and
   hover use the user's own installed Python and VapourSynth stubs with nothing to install.
7. **Choose the interpreter.** The interpreter the server analyses is
   Settings → Dependencies → Script editor: packages belong to an interpreter, so a venv is
   invisible until that row names its `python`. The page footer states the path and the
   version the service read from it.
   - The setting is forwarded in each family's own spelling.
   - Clearing it returns to the interpreter the service resolves from the machine: an
     activated `VIRTUAL_ENV` or `CONDA_PREFIX`, then `PATH`, then the Windows launcher's
     installs, then the staged bundled runtime.
8. **Fall back honestly.** The generated stub is written into the service's temporary
   workspace and opened there, which is what makes `import condor_data` resolve.
   - A missing server, a refused socket, a slow first answer, or an empty result falls back to
     the bundled tables — Python builtins, the VapourSynth API, core plugin functions, and the
     generated module — so the editor is never empty. The demo host reports no bridge and
     keeps the bundled copy.
   - One server process exists per open page; leaving closes the socket and the service kills
     the child.
   - Scene edits are frame ranges, and the editor warns when a script references a stale
     scene field.
9. **Seed a custom script.** Choosing `Edit a custom VapourSynth script` seeds the generated
   template into the document rather than an empty buffer, because the service refuses an
   empty custom script and the script page is where its text is written. The page seeds the
   same template when it opens an empty one.
10. **Convert a file source.** When the input is `VapourSynthScript::Path`, the screen offers
    `Edit file` (opens the original) and `Copy into app` (converts to `::Text`). Copying warns
    that the script no longer has the external file's directory on its import path, so a
    relative `import` or relative source path will fail unless the user provides the input
    video path.
11. **Handle a missing source.** A script without a resolvable source path is still valid
    Python; it simply cannot produce frames, and the preview explains that instead of failing
    at run time.
12. **Forward helper imports.** An inline script that imports its own helper module does what
    VSScript requires: `sys.path.insert(0, r"<directory>")` before the import.
    - The editor reads a literal `sys.path.insert` or `sys.path.append` path from the document
      and forwards it to the language server as an extra search path, so `import toolkit`
      completes in the editor and resolves in the run.
    - A path computed at run time still runs, but is not forwarded, because the editor cannot
      know its value before the script executes.
13. **Preview only with a video.** Preview is **video-context only**. On the project screen it
    is disabled with the reason "Choose a video to preview"; on a video screen it previews
    that video. If the queue is empty there is nothing to choose, and the control says so.
    The project editor never opens a file picker to invent a video for preview.

### Editor states

| State | Contract |
| --- | --- |
| Loading | The editor shell shows the script document while the language server starts; completion falls back to the bundled tables until an LSP answer arrives. |
| Empty | An empty custom script is seeded from the generated template; a file source opens its text. An empty buffer is never saved. |
| Error | Validation errors appear in the strip with the service's message; a save failure stays inline; a missing/refused/slow LSP falls back rather than emptying the editor. |
| Populated | The script, reserved variables, generated stub, and completion are available; the read-only "what runs" view reflects the current values. |
| Locked | The editor has no separate lock; saving follows the owning section's run lock and the service answers `423`. Preview stays read-only. |

### Editor data and contracts

- **Route.** The page carries the owning section and part in its search params; the saved
  value is that context's `input`, never a project-wide script.
- **Routes and services.** `/api/editor/lsp`;
  `GET /api/projects/{project_id}/videos/{video_id}/state` for `script_data`; the generated
  `condor_data.pyi` from the same generator the runner uses.
- **Input documents.** `VapourSynthScript::Path` keeps a file path; `::Text` keeps the script
  in the owning document. A file is used as written; **Copy into app** converts it to text.
- **No second type table.** Completion is parsed from the generated stub, never a hand-written
  symbol list.
