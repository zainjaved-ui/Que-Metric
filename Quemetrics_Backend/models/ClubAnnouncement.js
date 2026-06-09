const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ClubAnnouncement = sequelize.define(
  "ClubAnnouncement",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Club this announcement belongs to",
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID of the admin who created this announcement",
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: "Announcement title",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Announcement body",
    },
    priority: {
      type: DataTypes.ENUM("normal", "important", "urgent"),
      allowNull: false,
      defaultValue: "normal",
      comment: "Priority level affects display and notifications",
    },
    isPinned: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Pinned announcements appear at the top",
    },
    sendNotification: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Whether to trigger notifications to members",
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the announcement was published (null = draft)",
    },
  },
  {
    tableName: "club_announcements",
    timestamps: true,
    indexes: [
      { fields: ["clubId"] },
      { fields: ["authorId"] },
      { fields: ["publishedAt"] },
      { fields: ["isPinned"] },
    ],
  }
);

module.exports = ClubAnnouncement;
