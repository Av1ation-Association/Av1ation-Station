//! Produces the Python language-server archive this crate embeds.
//!
//! The archive is a build artifact, not source. `assets/python-lsp.lock` pins every
//! distribution's wheel URL and SHA-256 digest, and `scripts/vendor-python-lsp.mjs` turns
//! those pins into the ZIP that `lsp_bundle` includes. That keeps a binary out of Git and
//! gives CI the same archive as a local build, because both run this script from the same
//! lock.
//!
//! `AV1ATION_PYTHON_LSP_ZIP` points the build at an archive produced elsewhere, which is
//! how an offline builder or a CI artifact cache avoids the download. Wheels are cached
//! under `OUT_DIR`, so a rebuild after the first one needs no network either.

use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=assets/python-lsp.lock");
    println!("cargo:rerun-if-changed=../../../scripts/vendor-python-lsp.mjs");
    println!("cargo:rerun-if-changed=../../../scripts/toolchain-summary.mjs");
    println!("cargo:rerun-if-changed=../../../packaging/toolchain.lock.json");
    println!("cargo:rerun-if-env-changed=AV1ATION_PYTHON_LSP_ZIP");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("cargo sets OUT_DIR"));
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("cargo sets it"));
    let target = env::var("TARGET").expect("cargo sets TARGET");
    let summary = out_dir.join("toolchain-summary.json");
    let status = Command::new("node")
        .arg(manifest.join("../../../scripts/toolchain-summary.mjs"))
        .arg("--lock")
        .arg(manifest.join("../../../packaging/toolchain.lock.json"))
        .arg("--target")
        .arg(&target)
        .arg("--out")
        .arg(&summary)
        .status();
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => {
            panic!("scripts/toolchain-summary.mjs failed ({status}); run it directly to see why")
        }
        Err(error) => panic!(
            "could not start node for scripts/toolchain-summary.mjs: {error}. Node is part of \
             this repository's toolchain (see .nvmrc)"
        ),
    }

    let archive = out_dir.join("python-lsp.zip");
    if let Some(provided) = env::var_os("AV1ATION_PYTHON_LSP_ZIP") {
        fs::copy(&provided, &archive)
            .expect("AV1ATION_PYTHON_LSP_ZIP must name a readable archive");
        return;
    }

    let status = Command::new("node")
        .arg(manifest.join("../../../scripts/vendor-python-lsp.mjs"))
        .arg("--lock")
        .arg(manifest.join("assets/python-lsp.lock"))
        .arg("--wheels")
        .arg(out_dir.join("wheels"))
        .arg("--out")
        .arg(&archive)
        .status();
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => panic!(
            "scripts/vendor-python-lsp.mjs failed ({status}); run it directly to see why, \
             or point AV1ATION_PYTHON_LSP_ZIP at a prebuilt archive"
        ),
        Err(error) => panic!(
            "could not start node for scripts/vendor-python-lsp.mjs: {error}. Node is part of \
             this repository's toolchain (see .nvmrc); alternatively point \
             AV1ATION_PYTHON_LSP_ZIP at a prebuilt archive"
        ),
    }
}
