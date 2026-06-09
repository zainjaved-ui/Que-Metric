const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const NameChangeHistory = sequelize.define(
  "NameChangeHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Player who changed their name",
    },
    oldName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Previous name",
    },
    newName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "New name",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Optional reason for name change",
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin who approved (if approval required)",
    },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      defaultValue: "approved",
      comment: "Approval status",
    },
  },
  {
    tableName: "name_change_history",
    timestamps: true,
    indexes: [
      { fields: ["playerId"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = NameChangeHistory;
