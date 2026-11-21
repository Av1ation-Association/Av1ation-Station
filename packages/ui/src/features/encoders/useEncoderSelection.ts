import { useMemo } from "react";

import { useEncoders } from "@av1ation/api";

import { resolveEncoderSelection, type EncoderSelection } from "./encoder-selection";

/**
 * The encoder catalogue query and the selection it resolves for one document.
 *
 * The editor passes the document in and receives the build, catalogue, and warning without
 * re-deriving them; the pure resolver is covered by fixture tests.
 */
export function useEncoderSelection(value: unknown): {
    encoders: ReturnType<typeof useEncoders>;
    selection: EncoderSelection;
} {
    const encoders = useEncoders();
    const selection = useMemo(
        () => resolveEncoderSelection(encoders.data, encoders.isSuccess, value),
        [encoders.data, encoders.isSuccess, value],
    );
    return { encoders, selection };
}
