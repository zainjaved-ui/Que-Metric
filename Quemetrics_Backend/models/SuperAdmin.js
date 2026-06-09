const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SuperAdmin = sequelize.define(
  "SuperAdmin",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        canCreateRankedTournaments: true,
        canAccessAllData: true,
        canSendPlatformMessages: true,
        canOverrideResults: true,
        canManageUsers: true,
      },
    },
  },
  {
    tableName: "super_admins",
    timestamps: true,
  }
);

module.exports = SuperAdmin;