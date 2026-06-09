const { Club, VenueOwner } = require("../models");
const { resolveVenueOwnerMerged } = require("../utils/venueOwnerEmbedded");
const { ensureVenueOwnerVenuesColumn } = require("../utils/ensureVenueOwnerVenuesColumn");

const normalizeClubVenueId = (id) => String(id || "").replace(/^(venue_|virtual_)/, "");

exports.getVenueById = async (req, res) => {
  try {
    await ensureVenueOwnerVenuesColumn();
    const { venueId } = req.params;
    if (!venueId) {
      return res.status(400).json({ success: false, message: "venueId is required" });
    }

    const rawVenueId = normalizeClubVenueId(venueId);

    // 1) Resolve against club embedded venues (source of truth for venue_*/virtual_* ids)
    const clubs = await Club.findAll({ attributes: ["id", "name", "venues"] });
    for (const club of clubs) {
      const clubVenues = Array.isArray(club.venues)
        ? club.venues
        : (typeof club.venues === "string"
          ? (() => { try { return JSON.parse(club.venues); } catch { return []; } })()
          : []);
      if (!Array.isArray(clubVenues)) continue;

      const matched = clubVenues.find((v) => {
        const vid = normalizeClubVenueId(v?.id || "");
        const vname = String(v?.name || "").trim();
        return vid === rawVenueId || vname === String(venueId).trim();
      });

      if (matched) {
        const tables = Array.isArray(matched.tables) ? matched.tables : [];
        const slots = Array.isArray(matched.slots) ? matched.slots : [];
        return res.json({
          success: true,
          data: {
            id: venueId.startsWith("venue_") || venueId.startsWith("virtual_") ? venueId : `venue_${rawVenueId}`,
            sourceVenueId: rawVenueId,
            name: matched.name || matched.venueName || "Club Venue",
            venueName: matched.name || matched.venueName || "Club Venue",
            numberOfTables: tables.length,
            tables,
            slots,
            address: matched.address || "Club Venue",
            facilities: matched.facilities || "Cue Sports Facilities",
            openingHours: matched.openingHours || "Contact club for details",
            clubId: club.id,
            clubName: club.name,
            isClubVenue: true,
          },
        });
      }
    }

    // 2) Resolve composite VenueOwner venue id (ownerId:venueRef)
    if (String(venueId).includes(":")) {
      const [ownerId, venueRef] = String(venueId).split(":");
      const venueOwner = await VenueOwner.findByPk(ownerId);
      if (venueOwner) {
        let ownerVenues = [];
        try {
          ownerVenues = Array.isArray(venueOwner.venues)
            ? venueOwner.venues
            : (typeof venueOwner.venues === "string"
              ? JSON.parse(venueOwner.venues)
              : (venueOwner.venues && typeof venueOwner.venues === "object" ? Object.values(venueOwner.venues) : []));
        } catch (_) {
          ownerVenues = [];
        }

        const matched = ownerVenues.find((v) => {
          const vid = String(v?.id || v?.venueId || "").trim();
          const vname = String(v?.name || v?.venueName || "").trim();
          return vid === String(venueRef).trim() || vname === String(venueRef).trim();
        });

        if (matched) {
          const tables = Array.isArray(matched.tables) ? matched.tables : [];
          const slots = Array.isArray(matched.slots) ? matched.slots : [];
          return res.json({
            success: true,
            data: {
              id: venueId,
              sourceVenueId: matched.id || venueRef,
              venueOwnerId: ownerId,
              name: matched.name || matched.venueName || venueOwner.venueName || "Venue",
              venueName: matched.name || matched.venueName || venueOwner.venueName || "Venue",
              numberOfTables: tables.length || Number(venueOwner.numberOfTables) || 0,
              tables,
              slots,
              address: matched.address || venueOwner.address || "",
              facilities: matched.facilities || venueOwner.facilities || "",
              openingHours: matched.openingHours || venueOwner.openingHours || "",
              isVenueOwnerVenue: true,
            },
          });
        }
      }
    }

    // 3) Resolve against venue owner row id (embedded venues JSON for real names + slots)
    const venueOwner = await VenueOwner.findByPk(venueId);
    if (venueOwner) {
      const merged = await resolveVenueOwnerMerged(venueOwner, {
        organizationId: venueOwner.organizationId,
      });
      return res.json({
        success: true,
        data: {
          id: venueOwner.id,
          sourceVenueId: venueOwner.id,
          name: merged.displayName,
          venueName: merged.displayName,
          numberOfTables: merged.tables.length,
          tables: merged.tables,
          slots: merged.slots,
          address: venueOwner.address || "",
          facilities: venueOwner.facilities || "",
          openingHours: venueOwner.openingHours || "",
          isVenueOwnerVenue: true,
        },
      });
    }

    return res.status(404).json({
      success: false,
      message: "Venue not found",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch venue",
      details: error.message,
    });
  }
};

