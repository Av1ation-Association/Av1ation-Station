use super::*;

mod essential;
mod five_fish;

/// The shipped table for one known fork, if this build knows it.
pub(super) fn table(id: &str) -> Option<&'static [CatalogueEntry]> {
    match id {
        "svt-av1-essential" => Some(essential::ESSENTIAL),
        "svt-av1-5fish" => Some(five_fish::FIVE_FISH),
        _ => None,
    }
}
