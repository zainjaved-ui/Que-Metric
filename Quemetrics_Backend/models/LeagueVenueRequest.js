const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const LeagueVenueRequest = sequelize.define(
    "LeagueVenueRequest",
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        organizationId: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: "The organization requesting to use the venue for a league",
        },
        leagueId: {
            type: DataTypes.UUID,
            allowNull: true,
            comment: "Specific league this request is for",
        },
        // Using simple strings since league may be in 'draft' phase and not fully created
        requestingEntityName: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: "Name of the league or organization creating the league",
        },
        venueOwnerId: {
            type: DataTypes.UUID,
            allowNull: false,
            comment: "The venue owner who must approve the request",
        },
        venueId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: "The ID of the requested venue (from the club's JSON venues array)",
        },
        venueName: {
            type: DataTypes.STRING(255),
            allowNull: false,
            comment: "The name of the requested venue",
        },
        status: {
            type: DataTypes.ENUM("pending", "approved", "rejected", "expired"),
            allowNull: false,
            defaultValue: "pending",
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
            comment: "Request auto-expires 24 hours after creation if not approved/rejected",
        },
        requestedDates: {
            type: DataTypes.JSON,
            allowNull: true,
            comment: "Optional specific dates/timeframes requested",
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true,
            comment: "Additional notes from the requester",
        },
        rejectionReason: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "league_venue_requests",
        timestamps: true,
        indexes: [
            { fields: ["organizationId"] },
            { fields: ["venueOwnerId"] },
            { fields: ["leagueId"] },
            { fields: ["status"] },
        ],
    }
);

module.exports = LeagueVenueRequest;
