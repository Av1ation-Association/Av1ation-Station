// The engine revision is a workspace dependency, not a crate version, so it has to be
// lifted from the manifest at build time. Cargo already rebuilds a package when its
// manifest changes; rerunning on the workspace manifest keeps this constant truthful when
// the pin moves.

const WORKSPACE_MANIFEST: &str = include_str!("../../Cargo.toml");
const ENGINE_DEPENDENCY: &str = "andean-condor =";
const ENGINE_REPOSITORY: &str = "https://github.com/BoatsMcGee/Av1an";

fn main() {
    println!("cargo:rerun-if-changed=../../Cargo.toml");

    let dependency = WORKSPACE_MANIFEST
        .lines()
        .find_map(|line| {
            let line = line.trim();
            let (_, dependency) = line.split_once(ENGINE_DEPENDENCY)?;
            Some(dependency)
        })
        .expect("the workspace must declare andean-condor");

    // A path dependency would make this build describe code no other checkout has, and a
    // different fork would stamp a revision this repository never reviewed. Refuse both.
    assert!(
        dependency.contains(&format!("git = \"{ENGINE_REPOSITORY}\"")),
        "andean-condor must come from {ENGINE_REPOSITORY}"
    );

    let (_, revision) = dependency
        .split_once("rev = \"")
        .expect("the workspace must pin andean-condor with a rev");
    let revision = revision
        .split_once('"')
        .map(|(revision, _)| revision)
        .expect("the engine revision is a quoted string");

    assert!(
        revision.len() == 40
            && revision
                .chars()
                .all(|character| character.is_ascii_hexdigit()),
        "andean-condor must be pinned to a full 40-character commit revision"
    );

    println!("cargo:rustc-env=ENGINE_REVISION={revision}");
}
