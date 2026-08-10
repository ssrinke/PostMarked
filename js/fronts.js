// Curated front-artwork manifest (v1.8 §1) — single source of truth for which files exist on
// disk at assets/fronts/{shelf}-{n}.jpg. Keep this accurate to the files present; empty/missing
// shelves fall back to defaultShelf.

export const defaultShelf = 'meadow';

export const shelves = {
  coast: [],
  mountains: [],
  city: [],
  tropics: [],
  nordic: [],
  meadow: ['meadow-1', 'meadow-2'],
};

// Countries coarsely mapped to a shelf; refine later — the shelfFor() signature is the contract.
const COAST_COUNTRIES = ['Portugal', 'Greece', 'Croatia', 'Italy', 'Spain', 'Ireland', 'Netherlands', 'Denmark', 'Japan', 'New Zealand'];
const MOUNTAIN_COUNTRIES = ['Switzerland', 'Austria', 'Nepal', 'Chile', 'Peru', 'Georgia', 'Kyrgyzstan'];

export function shelfFor(lat, lng, country) {
  if (Math.abs(lat) >= 55) return 'nordic';
  if (Math.abs(lat) <= 23.5) return 'tropics';
  if (country && COAST_COUNTRIES.includes(country)) return 'coast';
  if (country && MOUNTAIN_COUNTRIES.includes(country)) return 'mountains';
  return 'meadow';
}

// Fronts available for a shelf, falling back to defaultShelf when the shelf is empty/unknown.
export function frontsForShelf(shelf) {
  const list = shelves[shelf];
  if (list && list.length > 0) return list;
  return shelves[defaultShelf];
}

export const FRONT_ID_RE = /^[a-z]+-[0-9]{1,2}$/;
