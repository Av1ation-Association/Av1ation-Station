// Token snapshot — run in the connected Penpot tab after any token change.
// Returns every set as name→value pairs; save the result as
// design/penpot/tokens.json and commit it with the design change.
//
// The Penpot library remains the source of truth. This file exists so a value
// change shows up in a diff instead of only inside the design file.

const sets = penpot.library.local.tokens.sets;

return {
  form: 'penpot-token-snapshot/1',
  sets: Object.fromEntries(
    sets.map((set) => [
      set.name,
      Object.fromEntries(set.tokens.map((token) => [token.name, token.value])),
    ]),
  ),
};
