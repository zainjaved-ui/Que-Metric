// models/TournamentInvitation.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentInvitation = sequelize.define(
  "TournamentInvitation",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tournamentId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Foreign key to Tournament",
    },
    // Invitation Type
    type: {
      type: DataTypes.ENUM("direct_invite", "join_code", "open_registration_request"),
      allowNull: false,
      comment: "Type of invitation",
    },
    // Direct Invite
    invitedPlayerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "If direct invite, who is invited",
    },
    invitedEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Email of invited person (if not yet registered)",
    },
    // Join Code
    joinCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      comment: "Sharable code for joining (e.g., TOUR123)",
    },
    joinCodeExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When join code expires",
    },
    maxUsages: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Max times code can be used (null = unlimited)",
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Times code has been used",
    },
    // Invitation Status
    status: {
      type: DataTypes.ENUM("sent", "accepted", "declined", "expired", "revoked"),
      allowNull: false,
      defaultValue: "sent",
      comment: "Invitation status",
    },
    sentDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: "When invitation was sent",
    },
    respondedDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When person responded",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When direct invite expires",
    },
    // Invitation Details
    invitationMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Custom message with invite",
    },
    invitedByUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Admin/organizer who sent invite",
    },
    // Token for Email Links
    invitationToken: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: "Unique token for email invitation link",
    },
  },
  {
    tableName: "tournament_invitations",
    timestamps: true,
    indexes: [
      { fields: ["tournamentId"] },
      { fields: ["joinCode"] },
      { fields: ["invitedPlayerId"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = TournamentInvitation;
