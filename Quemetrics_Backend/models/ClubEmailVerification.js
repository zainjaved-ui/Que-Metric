const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ClubEmailVerification = sequelize.define(
  "ClubEmailVerification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Club that needs email verification",
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Email address to be verified",
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: "Unique verification token",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "Token expiration time (24 hours from creation)",
    },
    used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Whether token has been used",
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When token was used",
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When club email was verified",
    },
  },
  {
    tableName: "club_email_verifications",
    timestamps: true,
    indexes: [
      { fields: ["token"], unique: true },
      { fields: ["clubId"] },
      { fields: ["email"] },
      { fields: ["used"] },
    ],
  }
);

module.exports = ClubEmailVerification;
