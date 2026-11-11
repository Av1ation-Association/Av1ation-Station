//! One non-cryptographic hash for values that only have to tell two documents apart.
//!
//! A preview cache path and a scene's encoder fingerprint are both comparisons, not security
//! boundaries: a collision costs a stale preview, never a wrong file served under another
//! name. FNV-1a is enough for that, and owning it in one place keeps the value a scene
//! advertises and the value the preview cache is keyed by the same function.

/// FNV-1a, 64-bit.
pub(crate) fn fnv1a(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}
