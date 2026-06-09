const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Organization = sequelize.define(
  "Organization",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Link to User record with role=organization",
    },
    organizationName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contactPersonName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    organizationType: {
      type: DataTypes.ENUM("club", "association", "federation", "league", "independent"),
      allowNull: false,
      defaultValue: "club",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    socialMediaLinks: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Example: {"facebook": "url", "twitter": "url", "instagram": "url"}',
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    registrationNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    canCreateLocalTournaments: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "organizations",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
    ],
  }
);

module.exports = Organization;