/**
 * VenueOwner resolution: embedded `venues` JSON and/or club `venues` JSON via `venueIds` (venue_* tokens).
 */

const { Club } = require("../models");

const parseVenueCollections = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : Object.values(parsed || {});
    } catch (_) {
      return [];
    }
  }
  if (typeof raw === "object") return Object.values(raw || {});
  return [];
};

const parseClubVenuesArray = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") return Object.values(raw || {});
  return [];
};

const normalizeVenueToken = (value) =>
  String(value || "")
    .replace(/^(venue_|virtual_)/, "")
    .trim();

const normalizeSlotRow = (slot) => {
  if (!slot || typeof slot !== "object") return null;
  const out = { ...slot };
  if (out.tableName == null && out.table != null) out.tableName = out.table;
  return out;
};

const getVenueOwnerIdsArray = (venueOwner) => {
  const raw = venueOwner?.venueIds;
  if (Array.isArray(raw)) return raw.filter((x) => x != null && String(x).trim() !== "");
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

/**
 * Prefer sub-venue business names over VenueOwner.name (often the person's name).
 */
const pickVenueOwnerEmbeddedDisplayName = (ownerVenues, venueOwner) => {
  if (!ownerVenues.length) {
    return venueOwner.venueName || venueOwner.name || "Venue";
  }
  if (ownerVenues.length === 1) {
    const m = ownerVenues[0];
    return m.name || m.venueName || venueOwner.venueName || venueOwner.name || "Venue";
  }
  const parts = ownerVenues.map((m) => m.name || m.venueName).filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return venueOwner.venueName || venueOwner.name || "Venue";
};

/**
 * @param {object} venueOwner Sequelize VenueOwner instance or plain row
 * @returns {{ displayName: string, tables: string[], slots: object[], ownerVenues: object[] }}
 */
function mergeVenueOwnerEmbeddedVenues(venueOwner) {
  const ownerVenues = parseVenueCollections(venueOwner?.venues);
  const tableAccum = [];
  const slotAccum = [];

  if (ownerVenues.length > 0) {
    for (const m of ownerVenues) {
      if (Array.isArray(m.tables)) {
        for (const t of m.tables) {
          if (typeof t === "string") tableAccum.push(t.trim());
          else if (t?.name || t?.label) tableAccum.push(String(t.name || t.label).trim());
        }
      }
      if (Array.isArray(m.slots)) {
        for (const s of m.slots) {
          const norm = normalizeSlotRow(s);
          if (norm) slotAccum.push(norm);
        }
      }
    }
  }

  const uniqueTables = [...new Set(tableAccum.filter(Boolean))];
  const numTables = uniqueTables.length || Math.max(Number(venueOwner.numberOfTables) || 0, 2);
  const tableList = uniqueTables.length ? uniqueTables : Array.from({ length: numTables }, (_, i) => `Table ${i + 1}`);

  const displayName = pickVenueOwnerEmbeddedDisplayName(ownerVenues, venueOwner);

  return {
    displayName,
    tables: tableList,
    slots: slotAccum,
    ownerVenues,
  };
}

/**
 * Match venue_* tokens against clubs' embedded venues JSON.
 * @returns {Array<{ venue: object, clubId: string, clubName: string }>}
 */
function matchClubTokensToEmbeddedVenues(clubTokens, clubs) {
  const matchedEmbedded = [];
  if (!clubs || !clubs.length) return matchedEmbedded;
  for (const token of clubTokens) {
    const tok = String(token).trim();
    const reqNorm = normalizeVenueToken(tok);
    for (const club of clubs) {
      const rawVenues = club.get ? club.get("venues") : club.venues;
      const list = parseClubVenuesArray(rawVenues);
      const v = list.find((x) => {
        const xid = String(x?.id || x?.venueId || "").trim();
        return xid === tok || normalizeVenueToken(xid) === reqNorm;
      });
      if (v) {
        matchedEmbedded.push({ venue: v, clubId: club.id, clubName: club.name });
        break;
      }
    }
  }
  return matchedEmbedded;
}

/**
 * Resolve club-embedded venues referenced by VenueOwner.venueIds (venue_* / virtual_*).
 * Prefer scope.clubId (tournament host club) first; if the venue id is not in that club's JSON
 * (venue lives under another club in the same org), search all org clubs.
 * @param {object} scope {{ clubId?: string, organizationId?: string }}
 * @returns {Promise<{ displayName: string, tables: string[], slots: object[] } | null>}
 */
async function tryMergeVenueOwnerClubLinkedVenues(venueOwner, scope = {}) {
  const ids = (scope.venueIds && scope.venueIds.length > 0) ? scope.venueIds : getVenueOwnerIdsArray(venueOwner);
  const clubTokens = ids.filter((id) => {
    const s = String(id || "");
    return s.startsWith("venue_") || s.startsWith("virtual_");
  });
  if (clubTokens.length === 0) return null;

  const orgId = scope.organizationId || venueOwner.organizationId;

  let clubs = scope.prefetchedClubs || [];
  
  if (clubs.length === 0 && scope.clubId) {
    const c = await Club.findByPk(scope.clubId, { attributes: ["id", "name", "venues"] });
    if (c) clubs = [c];
  }

  if (clubs.length === 0 && orgId) {
    clubs = await Club.findAll({
      where: { organizationId: orgId },
      attributes: ["id", "name", "venues"],
    });
  }
  if (!clubs || !clubs.length) return null;

  let matchedEmbedded = matchClubTokensToEmbeddedVenues(clubTokens, clubs);

  // Host club (e.g. tournament.clubId) may differ from the club that owns the venue_* row
  if (matchedEmbedded.length === 0 && scope.clubId && orgId) {
    const allOrgClubs = await Club.findAll({
      where: { organizationId: orgId },
      attributes: ["id", "name", "venues"],
    });
    matchedEmbedded = matchClubTokensToEmbeddedVenues(clubTokens, allOrgClubs);
  }

  if (matchedEmbedded.length === 0) return null;

  const tableAccum = [];
  const slotAccum = [];
  for (const { venue } of matchedEmbedded) {
    if (Array.isArray(venue.tables)) {
      for (const t of venue.tables) {
        if (typeof t === "string") tableAccum.push(t.trim());
        else if (t?.name || t?.label) tableAccum.push(String(t.name || t.label).trim());
      }
    }
    if (Array.isArray(venue.slots)) {
      for (const s of venue.slots) {
        const norm = normalizeSlotRow(s);
        if (norm) slotAccum.push(norm);
      }
    }
  }

  const uniqueTables = [...new Set(tableAccum.filter(Boolean))];
  const displayName =
    matchedEmbedded.length === 1
      ? matchedEmbedded[0].venue.name || matchedEmbedded[0].venue.venueName || "Venue"
      : matchedEmbedded.map((m) => m.venue.name || m.venue.venueName).filter(Boolean).join(" · ") || "Venue";

  const numTables = uniqueTables.length || Math.max(Number(venueOwner.numberOfTables) || 0, 2);
  const tableList = uniqueTables.length ? uniqueTables : Array.from({ length: numTables }, (_, i) => `Table ${i + 1}`);

  return {
    displayName,
    tables: tableList,
    slots: slotAccum,
  };
}

/**
 * Full resolution for a VenueOwner row: club-linked venueIds first, then embedded `venues` JSON, then defaults.
 * @param {object} scope {{ clubId?: string, organizationId?: string }} — pass tournament.clubId for bookings
 */
async function resolveVenueOwnerMerged(venueOwner, scope = {}) {
  const ids = (scope.venueIds && scope.venueIds.length > 0) ? scope.venueIds : getVenueOwnerIdsArray(venueOwner);
  const hasClubTokens = ids.some((id) => {
    const s = String(id || "");
    return s.startsWith("venue_") || s.startsWith("virtual_");
  });

  const embedded = mergeVenueOwnerEmbeddedVenues(venueOwner);

  if (hasClubTokens) {
    const fromClub = await tryMergeVenueOwnerClubLinkedVenues(venueOwner, scope);
    if (fromClub) {
      return {
        displayName: fromClub.displayName,
        tables: fromClub.tables.length ? fromClub.tables : embedded.tables,
        slots: fromClub.slots.length ? fromClub.slots : embedded.slots,
      };
    }
  }

  return embedded;
}

/**
 * Returns a structured list of venues (both club-linked and embedded).
 * Each venue object contains its id, name, tables, and slots.
 */
async function resolveVenueOwnerStructured(venueOwner, scope = {}) {
  const ids = getVenueOwnerIdsArray(venueOwner);
  const clubTokens = ids.filter((id) => {
    const s = String(id || "");
    return s.startsWith("venue_") || s.startsWith("virtual_");
  });

  const venues = [];
  const orgId = scope.organizationId || venueOwner.organizationId;

  // 1. Resolve Club-Linked Venues
  if (clubTokens.length > 0 && orgId) {
    const clubs = await Club.findAll({
      where: { organizationId: orgId },
      attributes: ["id", "name", "venues"],
    });
    
    const matched = matchClubTokensToEmbeddedVenues(clubTokens, clubs);
    for (const m of matched) {
      const v = m.venue;
      venues.push({
        id: v.id || v.venueId,
        name: v.name || v.venueName || "Unnamed Venue",
        source: "club",
        clubName: m.clubName,
        clubId: m.clubId,
        tables: parseVenueCollections(v.tables).map((t, idx) => ({
          id: idx + 1,
          name: typeof t === 'string' ? t : (t.name || t.label || `Table ${idx + 1}`),
          identifier: typeof t === 'string' ? t : (t.id || t.identifier || t.name)
        })),
        slots: (v.slots || []).map(normalizeSlotRow).filter(Boolean)
      });
    }
  }

  // 2. Resolve Embedded Venues
  const embeddedList = parseVenueCollections(venueOwner?.venues);
  for (const v of embeddedList) {
    venues.push({
      id: v.id || v.venueId || `embedded-${venues.length}`,
      name: v.name || v.venueName || venueOwner.venueName || "Embedded Venue",
      source: "embedded",
      tables: parseVenueCollections(v.tables).map((t, idx) => ({
        id: idx + 1,
        name: typeof t === 'string' ? t : (t.name || t.label || `Table ${idx + 1}`),
        identifier: typeof t === 'string' ? t : (t.id || t.identifier || t.name)
      })),
      slots: (v.slots || []).map(normalizeSlotRow).filter(Boolean)
    });
  }

  // 3. Fallback to VenueOwner defaults if no venues found
  if (venues.length === 0) {
    const numTables = Math.max(Number(venueOwner.numberOfTables) || 0, 2);
    venues.push({
      id: "default",
      name: venueOwner.venueName || venueOwner.name || "Default Venue",
      source: "default",
      tables: Array.from({ length: numTables }, (_, i) => ({
        id: i + 1,
        name: `Table ${i + 1}`,
        identifier: `table${i + 1}`
      })),
      slots: []
    });
  }

  return venues;
}

module.exports = {
  mergeVenueOwnerEmbeddedVenues,
  resolveVenueOwnerMerged,
  resolveVenueOwnerStructured,
  tryMergeVenueOwnerClubLinkedVenues,
  parseVenueCollections,
  normalizeSlotRow,
  getVenueOwnerIdsArray,
  normalizeVenueToken,
};
