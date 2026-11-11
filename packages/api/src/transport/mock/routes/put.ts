import type { ParameterDescriptor } from "@av1ation/contracts";
import { ApiError } from "../../types";
import type { MockTransport } from "../../mock";

export async function put(state: MockTransport, path: string, body: unknown): Promise<void> {
    const parameters = /^\/api\/encoders\/([^/]+)\/parameters$/u.exec(path);
    if (parameters === null) {
        throw new ApiError(404, null, `No mock route for PUT ${path}.`);
    }
    const id = decodeURIComponent(parameters[1] ?? "");
    const update = body as {
        parameters?: Record<string, ParameterDescriptor>;
    };
    state.parameterOverrides.set(id, update.parameters ?? {});
}
