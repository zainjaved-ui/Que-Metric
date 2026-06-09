// models/VenueApprovalRequest.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const VenueApprovalRequest = sequelize.define(
  "VenueApprovalRequest",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "The organization requesting to use the venue",
    },
    venueOwnerId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Reference to VenueOwner (the venue itself)",
    },
    requestStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Current status of the approval request",
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Reason for rejection (if rejected)",
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "When the request was created",
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the request was approved",
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the request was rejected",
    },
    approvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID of the venue owner who approved",
    },
    rejectedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID of the venue owner who rejected",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "When the approval request expires (24 hours from creation)",
    },
  },
  {
    tableName: "venue_approval_requests",
    timestamps: true,
    indexes: [
      { fields: ["organizationId"] },
      { fields: ["venueOwnerId"] },
      { fields: ["requestStatus"] },
      { fields: ["organizationId", "venueOwnerId"], unique: true },
    ],
  }
);

module.exports = VenueApprovalRequest;
