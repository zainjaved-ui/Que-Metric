const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ClubMember = sequelize.define(
  "ClubMember",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Club this membership belongs to",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID (maintains single identity across roles)",
    },
    playerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Optional link to player profile",
    },
    role: {
      type: DataTypes.ENUM("club_admin", "assistant_admin", "member"),
      allowNull: false,
      defaultValue: "member",
      comment: "Club Admin: full control | Assistant Admin: manage members | Member: basic access",
    },
    status: {
      type: DataTypes.ENUM("pending", "active", "suspended", "removed", "rejected"),
      allowNull: false,
      defaultValue: "pending",
      comment: "Member status: pending=awaiting approval, active=member, suspended=temp ban, removed=kicked, rejected=join request denied",
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "When the user joined the club",
    },
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID of the admin who invited this member",
    },
    joinMethod: {
      type: DataTypes.ENUM("created", "invited", "code", "public", "request"),
      allowNull: false,
      defaultValue: "request",
      comment: "How the member joined: club creator | invited | join code | public join | request approval",
    },
  },
  {
    tableName: "club_members",
    timestamps: true,
    indexes: [
      { fields: ["clubId"] },
      { fields: ["userId"] },
      { fields: ["playerId"] },
      { fields: ["role"] },
      { fields: ["status"] },
      // Ensure a user can only have one membership per club
      { fields: ["clubId", "userId"], unique: true },
    ],
    hooks: {
      beforeCreate: (member) => {
        // Ensure valid status - default to pending if empty
        if (!member.status || member.status === '') {
          member.status = 'pending';
        }
        // Ensure valid joinMethod - default to public if empty
        if (!member.joinMethod || member.joinMethod === '') {
          member.joinMethod = 'public';
        }
      },
      beforeUpdate: (member) => {
        // Prevent empty status values
        if (member.changed('status') && (!member.status || member.status === '')) {
          member.status = 'pending';
        }
        // Prevent empty joinMethod values
        if (member.changed('joinMethod') && (!member.joinMethod || member.joinMethod === '')) {
          member.joinMethod = 'public';
        }
      }
    }
  }
);

module.exports = ClubMember;
