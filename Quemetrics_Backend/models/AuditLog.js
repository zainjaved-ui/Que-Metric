const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Examples: "result_override", "ranking_adjustment", "user_created"',
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Examples: "match", "ranking", "tournament", "user"',
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    oldValue: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    newValue: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: "IPv4 or IPv6 address",
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    updatedAt: false, // Audit logs should not be updated
    indexes: [
      { fields: ["action"] },
      { fields: ["entityType", "entityId"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = AuditLog;