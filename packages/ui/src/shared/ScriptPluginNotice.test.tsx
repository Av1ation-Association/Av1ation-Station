// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScriptPluginNotice } from "./ScriptPluginNotice";

afterEach(cleanup);

const problem = {
    context: "Encoding",
    namespace: "hqdn3d",
    detail: "The Encoding script uses the `hqdn3d` VapourSynth plugin, but it is not installed.",
    remediation: "Install the `hqdn3d` VapourSynth plugin, or remove the filter that uses it.",
};

describe("ScriptPluginNotice", () => {
    it("names the missing namespace and the script that calls it", () => {
        render(<ScriptPluginNotice problems={[problem]} />);

        const region = screen.getByRole("region", {
            name: "VapourSynth plugin notice",
        });
        expect(region.textContent).toContain("hqdn3d");
        expect(region.textContent).toContain("not installed");
    });

    it("hides a problem owned by another page's input", () => {
        const { container } = render(
            <ScriptPluginNotice problems={[problem]} contexts={["General input"]} />,
        );

        expect(container.childElementCount).toBe(0);
    });

    it("says which input needs attention when one page owns two", () => {
        render(
            <ScriptPluginNotice
                problems={[
                    {
                        ...problem,
                        context: "Target quality",
                        namespace: "fmtc",
                        detail: "The Target quality script uses the `fmtc` VapourSynth plugin, but it is not installed.",
                    },
                    {
                        ...problem,
                        context: "Target quality metric input",
                        namespace: "vship",
                        detail: "The Target quality metric input script uses the `vship` VapourSynth plugin, but it is not installed.",
                    },
                ]}
                contexts={["Target quality", "Target quality metric input"]}
            />,
        );

        const region = screen.getByRole("region", {
            name: "VapourSynth plugin notice",
        });
        expect(region.textContent).toContain("Target quality:");
        expect(region.textContent).toContain("Target quality metric input:");
    });

    it("does not call the plugin missing when only one function is absent", () => {
        render(
            <ScriptPluginNotice
                problems={[
                    {
                        ...problem,
                        function: "Hqdn3d",
                        detail: "The Encoding script calls `core.hqdn3d.Hqdn3d`, but the `hqdn3d` plugin does not provide `Hqdn3d`.",
                        remediation:
                            "Install a build of the `hqdn3d` plugin that provides `Hqdn3d`, or remove the filter that calls it.",
                    },
                ]}
            />,
        );

        const region = screen.getByRole("region", {
            name: "VapourSynth plugin notice",
        });
        expect(region.textContent).toContain(
            "VapourSynth plugin references need attention: hqdn3d",
        );
        expect(region.textContent).not.toContain("Missing VapourSynth plugin");
    });

    it("shows a scan error even when no namespace is missing", () => {
        render(
            <ScriptPluginNotice
                problems={[]}
                error="The VapourSynth scripts could not be checked: the script file is missing."
            />,
        );

        const region = screen.getByRole("region", {
            name: "VapourSynth plugin notice",
        });
        expect(region.textContent).toContain("could not be checked");
    });

    it("hides a scan error that names another page's input", () => {
        const { container } = render(
            <ScriptPluginNotice
                problems={[]}
                error="The VapourSynth script for Encoding could not be read (missing.vpy): not found"
                contexts={["General input"]}
            />,
        );

        expect(container.childElementCount).toBe(0);
    });

    it("renders nothing when every reference resolves", () => {
        const { container } = render(<ScriptPluginNotice problems={[]} />);

        expect(container.childElementCount).toBe(0);
    });
});
