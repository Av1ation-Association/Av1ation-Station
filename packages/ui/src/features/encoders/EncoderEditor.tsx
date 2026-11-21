import { useState, type ReactNode } from "react";

import type { EncoderDescriptor } from "@av1ation/contracts";

import type { JsonSchema } from "../../shared/schema/config-schema";
import type { DocumentScope } from "../../shared/model/project-sections";
import { EncoderChoiceSection } from "./EncoderChoiceSection";
import { EncoderCommandPreview } from "./EncoderCommandPreview";
import { ENCODER_CHOICES, buildDocument, commandPreview, variantSchema } from "./encoder-document";
import { EncoderParametersSection } from "./EncoderParametersSection";
import { encoderChoiceDocument } from "./encoder-selection";
import { EncoderSettingsSection } from "./EncoderSettingsSection";
import { useEncoderSelection } from "./useEncoderSelection";

/**
 * One encoder selection: the encoder, the build it runs, and the options sent to it.
 *
 * The catalogue's descriptors decide the controls, because an encoder parameter set differs
 * per encoder and per fork. Options are the engine's own `CLIParameter` map, edited one row
 * per flag, so a value never appears as a raw JSON object. `passes` is only ever written as
 * `All(n)`: a specific pass of a set is internal to the encoder's own multipass run.
 */
export function EncoderEditor({
    root,
    node,
    value,
    onChange,
    locked,
    workers,
    scope = "project",
}: {
    root: JsonSchema;
    node: JsonSchema;
    value: unknown;
    onChange: (next: unknown) => void;
    locked: boolean;
    /** The Workers control, rendered in the Encoder row so both share one band. */
    workers?: ReactNode;
    /** Whose encoder this is: a project default, a template, a video's sequence, or one scene. */
    scope?: DocumentScope | "scene";
}) {
    const { encoders, selection } = useEncoderSelection(value);
    const {
        variant,
        body,
        options,
        visibleOptions,
        catalogue,
        buildLabel,
        selectedFork,
        marker,
        choice,
        executable,
    } = selection;
    const schema = variantSchema(root, node, variant);
    const [previewOpen, setPreviewOpen] = useState(false);

    const setBody = (patch: Record<string, unknown>) => {
        if (variant === null) {
            return;
        }
        onChange({ [variant]: { ...body, ...patch } });
    };

    const setOption = (name: string, parameter: unknown) => {
        setBody({ options: { ...options, [name]: parameter } });
    };

    const removeOption = (name: string) => {
        const next = { ...options };
        delete next[name];
        setBody({ options: next });
    };

    const chooseEncoder = (entry: (typeof ENCODER_CHOICES)[number]) => {
        // A saved build shares the variant with its base, so the variant alone cannot say
        // the built-in is already in use: choosing it from one of its builds resets the
        // executable back to PATH. A marker naming a deleted build is the exception: the
        // document still selects a build, so choosing the base has to replace it and drop
        // the marker, which is what the warning tells the user to do.
        if (
            locked ||
            (entry.variant === variant && selectedFork === undefined && marker === null)
        ) {
            return;
        }
        onChange({ [entry.variant]: encoderChoiceDocument(entry, encoders.data) });
    };

    /** Start the project from a saved build, executable and custom flags included. */
    const chooseFork = (fork: EncoderDescriptor) => {
        if (locked || fork === selectedFork) {
            return;
        }
        const document = buildDocument(fork);
        if (document !== null) {
            onChange({ [document.variant]: document.body });
        }
    };

    const fields = Object.keys(schema.properties ?? {});
    const copy =
        scope === "scene"
            ? {
                  head: "The encoder this scene is encoded with. Other scenes keep the section's encoder.",
                  foot: "Builds from Settings → Encoders appear in the same list.",
              }
            : scope === "video"
              ? {
                    head: "The encoder every scene of this video is encoded with. A scene can choose another.",
                    foot: "An individual scene can override this encoder. Builds from Settings → Encoders appear in the same list.",
                }
              : scope === "template"
                ? {
                      head: "The encoder a new project starts with. A project, a video, or an individual scene can choose another.",
                      foot: "Builds from Settings → Encoders appear in the same list.",
                  }
                : {
                      head: "The encoder every scene is encoded with. A video or a scene can choose another.",
                      foot: "A video or an individual scene can override this encoder. Builds from Settings → Encoders appear in the same list.",
                  };
    const command = commandPreview(executable, buildLabel, variant, options);

    return (
        <>
            <EncoderChoiceSection
                encoders={encoders.data}
                selection={selection}
                locked={locked}
                passable={fields.includes("pass")}
                workers={workers}
                copy={copy}
                onChooseEncoder={chooseEncoder}
                onChooseFork={chooseFork}
                onPasses={(count) => setBody({ pass: { All: count } })}
            />
            <EncoderSettingsSection
                body={body}
                fields={fields}
                choice={choice}
                locked={locked}
                onPatch={setBody}
            />
            <EncoderParametersSection
                catalogue={catalogue}
                options={options}
                visibleOptions={visibleOptions}
                buildLabel={buildLabel}
                locked={locked}
                onSetOption={setOption}
                onRemoveOption={removeOption}
                onPreview={() => setPreviewOpen(true)}
            />
            <EncoderCommandPreview
                open={previewOpen}
                command={command}
                onClose={() => setPreviewOpen(false)}
            />
        </>
    );
}
