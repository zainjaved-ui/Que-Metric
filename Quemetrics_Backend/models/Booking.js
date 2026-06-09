// models/Booking.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Booking = sequelize.define(
  "Booking",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fixtureId: {
      type: DataTypes.UUID,
      allowNull: true, // Relaxed for manual bookings
      comment: "Reference to the fixture/match being booked",
    },
    leagueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to the league (null for tournament bookings)",
    },
    tournamentMatchId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to the tournament match row (null for league bookings)",
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to the tournament (nullable for league matches)",
    },
    bookingType: {
      type: DataTypes.ENUM("league", "tournament"),
      allowNull: false,
      defaultValue: "league",
      comment: "League fixture vs tournament match booking",
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: true, // Relaxed for manual bookings
      comment: "Player who created the booking",
    },
    opponentId: {
      type: DataTypes.UUID,
      allowNull: true, // Relaxed for manual bookings
      comment: "Opponent player ID",
    },
    memberBookingName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Name for manual bookings created by venue owner"
    },
    memberBookingPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Phone number for manual bookings"
    },
    memberBookingPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Optional price field for member bookings"
    },
    venueOwnerId: {
      type: DataTypes.UUID,
      allowNull: true, // Changed to true for static venues
      comment: "Venue where the match will be played (optional for static venues)",
    },
    venueId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Static or virtual venue ID - used when venueOwnerId is null",
    },
    bookingDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Date of the match",
    },
    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: "Start time of the booking",
    },
    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
      comment: "End time of the booking",
    },
    tableNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Table number at the venue",
    },
    tableName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Display name of the table (e.g., 'Table 1')",
    },
    status: {
      type: DataTypes.ENUM("pending", "confirmed", "rejected", "cancelled", "completed"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Booking status - pending until opponent confirms/rejects",
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the opponent confirmed the booking",
    },
    confirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID who confirmed (should be opponent)",
    },

    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancelledBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID who cancelled",
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional notes from the booking player",
    },
    sport: {
      type: DataTypes.ENUM("snooker", "pool", "pooker"),
      allowNull: false,
      defaultValue: "snooker",
      comment: "Sport type for this booking",
    },
  },
  {
    tableName: "bookings",
    timestamps: true,
    indexes: [
      { fields: ["leagueId"] },
      { fields: ["tournamentId"] },
      { fields: ["fixtureId"] },
      { fields: ["playerId"] },
      { fields: ["opponentId"] },
      { fields: ["venueOwnerId"] },
    ],
  }
);

module.exports = Booking;
