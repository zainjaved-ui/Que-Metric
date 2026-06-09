/** @param {unknown} s */
export function normalizeSport(s) {
  const v = String(s ?? 'snooker').trim().toLowerCase();
  if (v === 'pooker') return 'poker';
  return v;
}

/** @param {unknown} s */
export function isSportSelected(selectedSport, s) {
  return normalizeSport(s) === normalizeSport(selectedSport);
}
