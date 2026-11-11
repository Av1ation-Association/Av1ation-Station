//! Fresh imports for a VapourSynth script.
//!
//! VSScript shares one CPython runtime for every environment in the process, so Python's
//! module table outlives a script. A script imports its own helpers (`toolkit.py`); once one
//! of those files is edited, importing it again finds the old module object and runs the code
//! loaded before the edit. Nothing outside Python can clear that table, so every open of a
//! script asks a throwaway environment to drop the modules whose files changed.
//!
//! Only a changed module is dropped. Installed packages and the generated `condor_data` stay
//! loaded: the runner rewrites that module's document rather than its code, and a preview
//! open must not pay a user library's import cost on every seek.

use std::panic::{self, AssertUnwindSafe};

use andean_condor::models::input::Input as InputModel;

/// The Python that drops the local modules whose files changed since they were imported.
///
/// The record lives in `sys.modules` because that table is the only store that survives an
/// environment. A module whose stamp (mtime and size) has not been recorded is dropped once,
/// so its current file is what runs; after that it is kept until its file changes again.
const REFRESH: &str = r#"
import os
import sys

try:
    import site
    installed = list(site.getsitepackages())
    user = site.getusersitepackages()
    installed.extend(user if isinstance(user, list) else [user])
except Exception:
    installed = []
installed.extend([sys.prefix, sys.base_prefix, sys.exec_prefix, sys.base_exec_prefix])
roots = tuple(os.path.normcase(os.path.abspath(root)) for root in installed if root)

key = "_condor_script_imports"
state = sys.modules.get(key)
if state is None:
    import types
    state = types.ModuleType(key)
    state.seen = {}
    sys.modules[key] = state


def installed_beside_python(path):
    return any(path == root or path.startswith(root + os.sep) for root in roots)


for name, module in list(sys.modules.items()):
    file = getattr(module, "__file__", None)
    if (
        file is None
        or name in ("__main__", "builtins", "condor_data", key)
        or name.lower().startswith("vapoursynth")
        or name.lower().startswith("_vapoursynth")
    ):
        continue
    path = os.path.normcase(os.path.abspath(file))
    try:
        stat = os.stat(file)
        stamp = (stat.st_mtime_ns, stat.st_size)
    except OSError:
        stamp = None
    if installed_beside_python(path):
        state.seen[path] = stamp
        continue
    if state.seen.get(path) != stamp:
        state.seen[path] = stamp
        del sys.modules[name]
"#;

/// Drop the local imports of `model` whose files changed since they were loaded.
///
/// Only a script evaluates Python. A native input is left alone, and a host without
/// VapourSynth does nothing: the open that follows reports the missing dependency itself, in
/// words the user can act on. A refresh that fails does not fail the open either, because the
/// script itself may still run.
pub fn refresh(model: &InputModel) {
    if !matches!(model, InputModel::VapourSynthScript { .. }) {
        return;
    }
    // `Environment::new` panics when the VSScript API is absent, so the core API is checked
    // first and a remaining load failure is caught. The preflight probe uses the same guard.
    if vapoursynth::api::API::get().is_none() {
        return;
    }
    let refreshed = panic::catch_unwind(AssertUnwindSafe(|| {
        let Ok(mut environment) = vapoursynth::prelude::Environment::new() else {
            return;
        };
        if let Err(error) = environment.eval_script(REFRESH) {
            tracing::debug!(%error, "the script's imported modules could not be refreshed");
        }
    }));
    if refreshed.is_err() {
        tracing::debug!("the script's imported modules could not be refreshed");
    }
}
