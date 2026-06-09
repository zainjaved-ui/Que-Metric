const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

let ensured = false;

/** Adds venue_owners.venues JSON if missing (embedded tables/slots). Safe to call repeatedly. */
async function ensureVenueOwnerVenuesColumn() {
  if (ensured) return;
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable("venue_owners");
    if (!tableDesc.venues) {
      await qi.addColumn("venue_owners", "venues", {
        type: DataTypes.JSON,
        allowNull: true,
      });
      console.log("[schema] Added column venues to venue_owners");
    }
    ensured = true;
  } catch (e) {
    console.error("[schema] ensureVenueOwnerVenuesColumn:", e.message || e);
  }
}

module.exports = { ensureVenueOwnerVenuesColumn };
