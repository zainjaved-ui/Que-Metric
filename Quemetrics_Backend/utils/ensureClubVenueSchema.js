const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

let ensured = false;

/**
 * Ensure club_venues can store both linked venue owners and embedded club venues.
 * Safe to call repeatedly; failures are logged and treated as non-fatal.
 */
async function ensureClubVenueSchema() {
  if (ensured) return;

  try {
    const qi = sequelize.getQueryInterface();
    const table = await qi.describeTable("club_venues");

    if (!table.venueRef) {
      await qi.addColumn("club_venues", "venueRef", {
        type: DataTypes.STRING(191),
        allowNull: true,
      });
    }

    if (!table.venueName) {
      await qi.addColumn("club_venues", "venueName", {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }

    if (!table.tables) {
      await qi.addColumn("club_venues", "tables", {
        type: DataTypes.JSON,
        allowNull: true,
      });
    }

    if (!table.slots) {
      await qi.addColumn("club_venues", "slots", {
        type: DataTypes.JSON,
        allowNull: true,
      });
    }

    if (!table.metadata) {
      await qi.addColumn("club_venues", "metadata", {
        type: DataTypes.JSON,
        allowNull: true,
      });
    }

    if (!table.sourceType) {
      await qi.addColumn("club_venues", "sourceType", {
        type: DataTypes.STRING(32),
        allowNull: true,
      });
    }

    // Transition old schema: allow custom venues without venueOwnerId.
    if (table.venueOwnerId && table.venueOwnerId.allowNull === false) {
      try {
        await qi.changeColumn("club_venues", "venueOwnerId", {
          type: DataTypes.UUID,
          allowNull: true,
        });
      } catch (e) {
        console.warn("[schema] Could not relax club_venues.venueOwnerId nullability:", e.message || e);
      }
    }

    ensured = true;
  } catch (e) {
    console.error("[schema] ensureClubVenueSchema:", e.message || e);
  }
}

module.exports = { ensureClubVenueSchema };
