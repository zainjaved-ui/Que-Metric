const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const EmailVerification = sequelize.define(
  "EmailVerification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User who needs to verify email",
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Verification token - can be shared across multiple users for dual registration",
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
  },
  {
    tableName: "email_verifications",
    timestamps: true,
    indexes: [
      { fields: ["token"] },
      { fields: ["userId"] },
      { fields: ["used"] },
    ],
  }
);

module.exports = EmailVerification;
