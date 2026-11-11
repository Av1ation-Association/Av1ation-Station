import descriptorSchema from "../../../../../schema/encoder/parameter-descriptor.json";

/**
 * The descriptor contract in the shape Monaco's JSON language service reads.
 *
 * The page's own diagnostics still come from the generated Zod contract; this copy exists so
 * the language service can answer what the contract already answers — what each field means,
 * which keys a descriptor takes, and which values a closed set accepts — instead of a
 * hand-written description list drifting away from the Rust model. The schema is the
 * committed artifact itself, so a field added to the engine is documented in the editor the
 * next time the schema is emitted.
 *
 * `$defs` moves to the root because a `$ref` resolves against the document it appears in,
 * and the descriptor object becomes the value of every entry in the map, which is exactly
 * what the document is: a map of descriptors keyed by CLI spelling.
 */
const { $schema, $defs, ...descriptor } = descriptorSchema as Record<string, unknown>;

/** What the JSON editor offers: folding, field hovers and completion inside a descriptor. */
export const DESCRIPTOR_DOCUMENT_SCHEMA: Record<string, unknown> = {
    $schema,
    type: "object",
    description: "Every descriptor the encoder should offer, keyed by canonical CLI spelling.",
    additionalProperties: descriptor,
    ...($defs === undefined ? {} : { $defs }),
};
