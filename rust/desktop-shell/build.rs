fn main() {
    tauri_build::build();
    // The desktop binary links FFMS2 for native decoding. In a bundled installer that library
    // lives beside the staged tools, not in the system loader path. Both the .deb and AppImage
    // place the binary in usr/bin and the tools in usr/lib/Av1ation Station/tools, so this
    // origin-relative path works from either layout without requiring a system FFMS2 package.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib/Av1ation Station/tools/lib");
    }
}
