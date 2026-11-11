//! Emit the route vocabulary consumed by the client and documentation generators.

use std::{env, fs, path::PathBuf, process::ExitCode};

use av1ation_service::route_manifest_json;

fn main() -> ExitCode {
    let mut output = PathBuf::from("schema/routes/manifest.json");
    let mut check = false;
    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--out" => match args.next() {
                Some(path) => output = PathBuf::from(path),
                None => {
                    eprintln!("--out needs a path");
                    return ExitCode::FAILURE;
                }
            },
            "--check" => check = true,
            other => {
                eprintln!("unknown argument: {other}");
                return ExitCode::FAILURE;
            }
        }
    }

    let rendered = format!("{}\n", route_manifest_json());
    if check {
        return match fs::read_to_string(&output) {
            Ok(existing) if existing == rendered => ExitCode::SUCCESS,
            Ok(_) => {
                eprintln!(
                    "route manifest drift: {}; run npm run routes",
                    output.display()
                );
                ExitCode::FAILURE
            }
            Err(error) => {
                eprintln!(
                    "missing route manifest {}: {error}; run npm run routes",
                    output.display()
                );
                ExitCode::FAILURE
            }
        };
    }

    if let Some(parent) = output.parent()
        && let Err(error) = fs::create_dir_all(parent)
    {
        eprintln!("could not create {}: {error}", parent.display());
        return ExitCode::FAILURE;
    }
    if let Err(error) = fs::write(&output, rendered) {
        eprintln!("could not write {}: {error}", output.display());
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
