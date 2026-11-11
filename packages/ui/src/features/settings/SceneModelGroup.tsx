import { useHealth, usePickModel, useSaveSceneModel, useSettings } from "@av1ation/api";

import { Button } from "../../shared/Button";
import { HostPathField } from "./HostPathField";
import { useHostPathField } from "./useHostPathField";

/**
 * The one model file the neural detector needs.
 *
 * It is not project configuration: the same file serves every project, so it is located
 * here instead of being retyped in each project's Scene detection section. Locating applies
 * immediately; on a host without a picker the field is still typed and applied with Save
 * or Enter (`AGENTS.md` §2.7).
 */
export function SceneModelGroup() {
    const settings = useSettings();
    const health = useHealth();
    const saveModel = useSaveSceneModel();
    const pickModel = usePickModel();
    const saved = settings.data?.scene_model ?? "";
    const check = health.data?.preflight.checks.find((entry) => entry.id === "scene-model");
    const available = check?.available === true;
    // The resolved file is what the engine would load with no override. Putting it in the
    // field is the difference between an "Automatic" label and a path the user can act on;
    // saving it pins the path, clearing restores the search.
    const resolved = saved !== "" ? saved : (check?.detail ?? "");
    const field = useHostPathField({
        stored: resolved,
        pick: pickModel,
        save: (path) => saveModel.mutateAsync(path),
        empty: "clear",
        describeSaveFailure: (error) =>
            error instanceof Error
                ? `The model path was not saved: ${error.message}`
                : "The model path was not saved. Try again.",
    });

    return (
        <section aria-labelledby="dependency-scene-detection" className="mb-5 break-inside-avoid">
            <h2
                id="dependency-scene-detection"
                className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted"
            >
                Scene detection
            </h2>
            <div className="rounded-lg border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span className="min-w-0 flex-1 text-[13px] text-ink">TransNetV2 model</span>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${
                            available
                                ? "border-success/30 bg-success-soft text-success"
                                : "border-line-strong bg-raised text-ink-secondary"
                        }`}
                    >
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                        {check === undefined
                            ? "Checking"
                            : available
                              ? "Available"
                              : "Not installed"}
                    </span>
                </div>
                <div className="px-4 py-3">
                    <HostPathField
                        field={field}
                        label="TransNetV2 model path"
                        placeholder="Path to transnetv2.onnx"
                        disabled={settings.data === undefined}
                        footer={
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                                <p className="m-0 text-[10.5px] leading-relaxed text-ink-muted">
                                    {saved === ""
                                        ? "The field shows the file the engine's search found. Saving pins it; clearing restores the search."
                                        : "Pinned for every project. Clearing the field restores the engine's automatic search."}
                                </p>
                                {saved === "" ? null : (
                                    <Button
                                        variant="ghost"
                                        className="h-7 px-2 text-[11px]"
                                        disabled={field.pending}
                                        onClick={() => field.submit("")}
                                    >
                                        Use the engine&apos;s search
                                    </Button>
                                )}
                            </div>
                        }
                    />
                </div>
            </div>
        </section>
    );
}
