// models/VenueOwner.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const VenueOwner = sequelize.define(
  "VenueOwner",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which organization this venue owner works for",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Email for invitation, moved to User table after acceptance",
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Venue-specific fields
    venueName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Name of the venue",
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Full address of the venue",
    },
    numberOfTables: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of tables at the venue",
    },
    facilities: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Description of facilities available",
    },
    openingHours: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Venue opening hours",
    },
    // Invitation fields
    invitationToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Token for email invitation",
    },
    invitationExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isInviteAccepted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Record whether the invitation email was successfully sent
    emailSent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    emailSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("pending", "active", "archived", "inactive"),
      defaultValue: "active",
      comment: "Venue status: pending (awaiting verification), active (operational), archived (historical), inactive (temporarily disabled)",
    },
    // IDs of venues this owner is assigned to (array of venue identifiers)
    venues: {
      type: DataTypes.JSON,
      allowNull: true,
      comment:
        "Embedded venue definitions (name, tables, slots) — business venue name, not the owner's personal name",
    },
    venueIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of venue IDs assigned to this venue owner",
      get() {
        let raw = this.getDataValue('venueIds');
        if (!raw) return [];
        while (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw);
          } catch (e) {
            return [];
          }
        }
        return Array.isArray(raw) ? raw : [];
      },
      set(val) {
        const arr = Array.isArray(val) ? val : [];
        this.setDataValue('venueIds', arr);
      },
    },
  },
  {
    tableName: "venue_owners",
    timestamps: true,
  }
);

module.exports = VenueOwner;
