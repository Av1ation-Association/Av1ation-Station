/** Boundary fixtures for hook responses that are not generated Rust contracts. */
import type { ZodType } from "zod";

import { ConfigSchemasSchema } from "./configuration";
import configSchemasFixture from "./fixtures/config-schemas.json";
import removedVideoIdsFixture from "./fixtures/removed-video-ids.json";
import { RemovedVideoIdsSchema } from "./queue";

/** One local hook boundary and the fixture its schema must parse. */
export interface LocalBoundaryFixture {
    readonly name: string;
    readonly schema: ZodType;
    readonly fixturePath: string;
    readonly fixture: unknown;
}

/**
 * Two hook responses have no generated Rust model: the engine's raw JSON Schema envelope
 * and the remove-videos id list. Their fixtures live beside the hooks so the API-level
 * boundary test can prove they still parse without teaching the contracts package about
 * the API.
 */
export const LOCAL_BOUNDARY_FIXTURES = [
    {
        name: "ConfigSchemas",
        schema: ConfigSchemasSchema,
        fixturePath: "config-schemas.json",
        fixture: configSchemasFixture,
    },
    {
        name: "RemovedVideoIds",
        schema: RemovedVideoIdsSchema,
        fixturePath: "removed-video-ids.json",
        fixture: removedVideoIdsFixture,
    },
] as const satisfies readonly LocalBoundaryFixture[];
