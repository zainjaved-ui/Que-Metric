const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Tracks tournament venue-usage requests when an organizer selects
// another organizer's venue.
const VenueRequest = sequelize.define(
  "VenueRequest",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // The venue being requested (stored as VenueOwner.id).
    venueId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // Organization that requested the venue usage.
    requesterOrganizerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // Venue owner that must accept/reject the request.
    venueOwnerId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },
  },
  {
    tableName: "venue_requests",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["venueId"] },
      { fields: ["requesterOrganizerId"] },
      { fields: ["venueOwnerId"] },
      { fields: ["status"] },
    ],
    // Let the DB migration handle the unique constraint.
  }
);

module.exports = VenueRequest;

