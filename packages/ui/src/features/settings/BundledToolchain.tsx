import { useToolchain } from "@av1ation/api";

import { Button } from "../../shared/Button";
import { Kicker } from "./Kicker";

/**
 * The reviewed lock projected into the running binary.
 *
 * This is the About surface's audit list: component identity, version, licence, source and
 * artifact hash. Installed paths are deliberately absent, so the list can be shown on a LAN
 * browser without exposing the host filesystem.
 */
export function BundledToolchain() {
    const toolchain = useToolchain();
    const components = toolchain.data?.components ?? [];

    return (
        <section
            className="mt-6 overflow-hidden rounded-lg border border-line bg-surface"
            aria-labelledby="about-toolchain-heading"
        >
            <header className="border-b border-line px-5 py-4">
                <Kicker>Bundled toolchain</Kicker>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3
                        id="about-toolchain-heading"
                        className="m-0 text-[13px] font-semibold text-ink"
                    >
                        Components in this build
                    </h3>
                    {toolchain.data === undefined ? null : (
                        <span className="text-[10.5px] text-ink-muted">
                            {String(components.length)}{" "}
                            {components.length === 1 ? "component" : "components"}
                        </span>
                    )}
                </div>
                {toolchain.data === undefined ? (
                    <p className="mt-1 mb-0 text-[11px] leading-relaxed text-ink-secondary">
                        The components recorded in this target's reviewed lock.
                    </p>
                ) : (
                    <p className="mt-1 mb-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] leading-relaxed text-ink-secondary">
                        <span className="font-mono text-[10.5px]">{toolchain.data.target}</span>
                        <span className="text-ink-muted">
                            Lock{" "}
                            <span className="font-mono text-[10.5px]">
                                {toolchain.data.revision}
                            </span>
                        </span>
                    </p>
                )}
                <p className="mt-1.5 mb-0 text-[10.5px] leading-relaxed text-ink-muted">
                    Only the components recorded for this target are listed. Installed paths stay
                    out of this response.
                </p>
            </header>

            {toolchain.isPending ? (
                <div className="grid gap-px bg-line-subtle sm:grid-cols-2">
                    {[0, 1, 2, 3].map((row) => (
                        <div key={row} className="bg-surface px-5 py-3.5">
                            <div className="h-3 w-32 animate-pulse rounded-sm bg-raised" />
                            <div className="mt-2 h-2.5 w-48 animate-pulse rounded-sm bg-raised" />
                        </div>
                    ))}
                </div>
            ) : null}

            {toolchain.isError ? (
                <div role="alert" className="px-5 py-4">
                    <p className="m-0 text-[12px] font-medium text-ink">
                        The toolchain summary could not be loaded
                    </p>
                    <p className="mt-1 mb-3 text-[11px] leading-relaxed text-ink-secondary">
                        {toolchain.error instanceof Error
                            ? toolchain.error.message
                            : "The service did not return its lock summary."}
                    </p>
                    <Button
                        variant="secondary"
                        className="h-8 px-2.5 text-[11.5px]"
                        onClick={() => void toolchain.refetch()}
                    >
                        Try again
                    </Button>
                </div>
            ) : null}

            {toolchain.data !== undefined && components.length === 0 ? (
                <p role="status" className="m-0 px-5 py-4 text-[11.5px] text-ink-secondary">
                    No components are recorded for this target.
                </p>
            ) : null}

            {components.length > 0 ? (
                <ul className="m-0 grid list-none gap-px border-t border-line bg-line-subtle p-0 sm:grid-cols-2">
                    {components.map((component) => (
                        <li key={component.id} className="min-w-0 bg-surface px-5 py-3.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span
                                    className="min-w-0 truncate font-mono text-[11px] font-medium text-ink"
                                    title={component.id}
                                >
                                    {component.id}
                                </span>
                                <span className="text-[10.5px] text-ink-muted">
                                    {component.version}
                                </span>
                                <span className="ml-auto rounded-full border border-line-strong bg-raised px-2 py-0.5 font-mono text-[9.5px] text-ink-secondary">
                                    {component.license}
                                </span>
                            </div>
                            <div className="mt-1.5 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                                <a
                                    href={component.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open source for ${component.id}`}
                                    className="shrink-0 text-[11px] text-link hover:underline"
                                >
                                    Source
                                </a>
                                <span className="min-w-0 break-all font-mono text-[9.5px] leading-relaxed text-ink-muted">
                                    {component.sha256}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}
