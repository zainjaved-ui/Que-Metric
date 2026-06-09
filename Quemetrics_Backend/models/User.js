const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
      set(value) {
        if (typeof value === "string") {
          this.setDataValue("email", value.trim().toLowerCase());
          return;
        }
        this.setDataValue("email", value);
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("super_admin", "venue_owner", "organization", "player"),
      allowNull: false,
      defaultValue: "player",
    },
    status: {
      type: DataTypes.ENUM("Pending", "Active", "Inactive", "Suspended", "Anonymised"),
      defaultValue: "Pending",
      comment: "Account status - Pending until email verified",
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp when email was verified",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Deprecated - use status field instead",
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last significant activity (match, booking, etc.)",
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resetPasswordToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    resetPasswordExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    notificationPreferences: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        tournamentInvites: true,
        systemNotifications: true,
      },
      comment: "User notification preferences",
    },
  },
  {
    tableName: "users",
    timestamps: true,
    indexes: [
      {
        name: "users_email_unique",
        unique: true,
        fields: ["email"],
      },
    ],
  }
);

module.exports = User;