'use strict';

// Offline zip / city-state → lat/lng resolver, no network calls.
// Uses the `zipcodes` package (bundled US zip dataset, BSD-licensed).
//
// resolveLatLng(input) returns { lat, lng } or null. Strategy:
//   1. If zip resolves → use the zip centroid.
//   2. Else if city + state resolve → use the first match's centroid.
//   3. Else null. Callers are expected to fail loud rather than guess.

const zipcodes = require('zipcodes');

// Strict: exactly 5 digits, optionally followed by -<4 digits>. Anything else
// (4-digit MA zip with a stripped leading zero, "12345abc", "12345-12345", etc.)
// returns null so the caller skips straight to the city/state centroid fallback.
// Leading zeros are preserved because we operate on the string form throughout —
// numeric inputs that have already lost a leading zero (e.g. 2134 from JSON
// numbers) won't match the 5-digit anchor and fall through, which is correct.
function normalizeZip(z) {
  if (z === null || z === undefined) return null;
  const raw = String(z).trim();
  const m = raw.match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

function normalizeState(s) {
  if (!s) return null;
  return String(s).trim().toUpperCase().slice(0, 2);
}

function normalizeCity(c) {
  if (!c) return null;
  return String(c).trim();
}

function pickFirstWithCoords(rows) {
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (row && typeof row.latitude === 'number' && typeof row.longitude === 'number') return row;
  }
  return null;
}

function resolveLatLng({ zip, city, state }) {
  const z = normalizeZip(zip);
  if (z) {
    const row = zipcodes.lookup(z);
    if (row && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
      return { lat: row.latitude, lng: row.longitude, resolver: 'zip', resolvedFrom: z };
    }
  }
  const c = normalizeCity(city);
  const s = normalizeState(state);
  if (c && s) {
    const row = pickFirstWithCoords(zipcodes.lookupByName(c, s));
    if (row) {
      return { lat: row.latitude, lng: row.longitude, resolver: 'city_state', resolvedFrom: `${c}, ${s}` };
    }
  }
  return null;
}

module.exports = { resolveLatLng };
