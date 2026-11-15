export function InstallSection() {
    return (
        <section
            id="install"
            className="site-section site-section--install"
            aria-labelledby="install-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="install-title">The toolchain travels with the app.</h2>
                        <p>
                            A bundled build carries FFmpeg, VapourSynth, MKVToolNix, the encoders,
                            the scene model, and the native quality metrics. Nothing downloads at
                            install or run time.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        Choose per capability. Prefer your own binary? The system build can use it
                        without removing the app&apos;s other tools.
                    </p>
                </header>

                <div className="install-grid">
                    <div className="install-copy">
                        <h3>Bundled</h3>
                        <p>
                            One installer, one pinned toolchain. A clean Windows or Linux machine
                            can detect scenes and run an encode without assembling Python,
                            VapourSynth, FFmpeg, and an encoder first.
                        </p>
                        <ul>
                            <li>FFmpeg and MKVToolNix for muxing and concatenation</li>
                            <li>SVT-AV1, x265, x264, and the other encoder executables</li>
                            <li>VapourSynth and the interpreter it loads</li>
                            <li>TransNetV2 and the native metric libraries</li>
                        </ul>
                    </div>
                    <div className="install-copy">
                        <h3>System</h3>
                        <p>
                            Use the tools already on the machine. Each capability resolves
                            independently, so a system VapourSynth can sit beside a bundled encoder,
                            or the other way around.
                        </p>
                        <p>
                            The Dependencies screen reports the selected provider and the
                            alternatives. Rejected paths stay transient; accepted ones are
                            remembered and probed again at startup.
                        </p>
                        <a className="site-text-link" href="/docs/">
                            Read the dependency documentation
                        </a>
                    </div>
                </div>

                <dl className="platform-line">
                    <div>
                        <dt>Windows x64</dt>
                        <dd>Bundled and system installers in 0.1.0</dd>
                    </div>
                    <div>
                        <dt>Linux x64</dt>
                        <dd>Debian package and AppImage in 0.1.0</dd>
                    </div>
                    <div>
                        <dt>macOS</dt>
                        <dd>Not in the current pre-release</dd>
                    </div>
                </dl>
            </div>
        </section>
    );
}
