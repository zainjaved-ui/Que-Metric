const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Club = sequelize.define(
  "Club",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Optional link to parent organization (platform-owned entity)",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: false,
      comment: "Club name (required)",
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "URL-friendly unique identifier",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Optional club description",
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Optional club logo",
    },
    visibility: {
      type: DataTypes.ENUM("public", "private"),
      allowNull: false,
      defaultValue: "private",
      comment: "Public clubs are discoverable, private clubs are invite-only",
    },
    status: {
      type: DataTypes.ENUM("pending", "active", "archived", "suspended"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Pending: awaiting verification | Active: operational | Archived: read-only historical | Suspended: restricted access",
    },
    joinSettings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        method: "invite", // invite | code | open
        requireApproval: false,
        joinCode: null,
        codeExpiry: null,
      },
      comment: "Join configuration: invite-only, join via code, or open registration",
    },
    memberCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Cached count of active members",
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID of club creator (becomes first admin)",
    },
    // Contact information (REQUIRED)
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true,
      },
      comment: "Contact email (required)",
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Contact phone (required)",
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Club address (required)",
    },
    contactPerson: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Contact person name (optional)",
    },
    gameIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Linked game IDs",
    },
    sportTypes: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "Array of sport types: ['Snooker'], ['Pool'], ['Poker'], etc.",
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Verification status - green check (true), yellow warning (false)",
    },
    verificationNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Admin notes for verification status",
    },
    venues: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of venue objects with tables and time slots",
      get() {
        const rawValue = this.getDataValue('venues');
        // Handle different data formats
        if (!rawValue) return [];
        if (typeof rawValue === 'string') {
          try {
            const parsed = JSON.parse(rawValue);
            return Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.error('Error parsing venues JSON:', e);
            return [];
          }
        }
        if (Array.isArray(rawValue)) return rawValue;
        return [];
      },
      set(value) {
        // Ensure we're always storing an array
        const venues = Array.isArray(value) ? value : [];
        this.setDataValue('venues', venues);
      },
    },
  },
  {
    tableName: "clubs",
    timestamps: true,
    indexes: [
      { fields: ["organizationId"] },
      { fields: ["slug"], unique: true },
      { fields: ["status"] },
      { fields: ["visibility"] },
      { fields: ["createdBy"] },
    ],
  }
);

module.exports = Club;
