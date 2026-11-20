use super::*;

mod essential;
mod five_fish;

/// One shipped fork's differences from the base encoder's table.
///
/// A fork is the base catalogue plus the rows its own build adds, describes differently, or
/// does not accept. Inherited rows are not copied here, so a correction to the base table
/// reaches every fork that did not state a difference.
pub(super) struct ForkTable {
    /// Rows the fork's build offers and the base table does not.
    pub(super) additions: &'static [CatalogueEntry],
    /// Base rows the fork's help or documentation describes differently.
    pub(super) overrides: &'static [CatalogueEntry],
    /// Base rows the fork's build does not accept.
    pub(super) removals: &'static [&'static str],
}

/// The shipped differences for one known fork, if this build knows it.
pub(super) fn table(id: &str) -> Option<ForkTable> {
    match id {
        "svt-av1-essential" => Some(ForkTable {
            additions: essential::ADDITIONS,
            overrides: essential::OVERRIDES,
            removals: essential::REMOVALS,
        }),
        "svt-av1-5fish" => Some(ForkTable {
            additions: five_fish::ADDITIONS,
            overrides: five_fish::OVERRIDES,
            removals: five_fish::REMOVALS,
        }),
        _ => None,
    }
}
