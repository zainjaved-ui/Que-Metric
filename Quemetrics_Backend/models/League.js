// models/League.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const League = sequelize.define(
  "League",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which organization created this league",
    },
    seasonId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Season this league belongs to",
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    sport: {
      type: DataTypes.STRING(100),
      allowNull: false,
      set(value) {
        if (value) {
          this.setDataValue('sport', value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
        }
      }
    },
    // Common fields for all leagues
    maxPlayers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Maximum players allowed in the league",
    },
    minPlayers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Minimum players required for the league",
    },
    format: {
      type: DataTypes.ENUM("round_robin", "knockout", "double_elimination", "roundRobin", "homeAway", "groupsKnockout", "swiss", "custom"),
      allowNull: true,
      comment: "League format (for Snooker/Pool)",
    },
    // Pool-specific fields
    gameType: {
      type: DataTypes.ENUM("8-ball", "9-ball", "10-ball"),
      allowNull: true,
      comment: "Pool game type",
    },
    matchFormat: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Pool match format (e.g., 'Race to 5', 'Race to 7')",
    },
    // Poker-specific fields
    tournamentType: {
      type: DataTypes.ENUM("freezeout", "rebuy", "knockout"),
      allowNull: true,
      comment: "Poker tournament type",
    },
    buyInAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Poker buy-in amount (optional)",
    },
    // League start and end dates (set from season)
    leagueStartDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      // field: 'seasonStart',
      comment: "League start date (from season)"
    },
    leagueEndDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      // field: 'seasonEnd',
      comment: "League end date (from season)"
    },
    legacyDivisions: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Legacy: Use Division model instead - renamed to avoid conflict with associations",
    },
    scoringFormat: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("draft", "registration_open", "active", "completed", "cancelled"),
      allowNull: false,
      defaultValue: "draft",
    },
    totalPlayers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total number of players currently enrolled in the league",
    },
    currentRound: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Current active round of the league",
    },
    fixtureStrategy: {
      type: DataTypes.ENUM("full_schedule", "round_by_round"),
      defaultValue: "full_schedule",
      comment: "Strategy for generating fixtures",
    },
    byeLogic: {
      type: DataTypes.ENUM("highest_ranked", "manual", "random", "lowest_ranked"),
      defaultValue: "random",
      comment: "Logic for assigning byes in each round",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    venue: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    venueOwnerId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to VenueOwner (the venue for this league)",
    },
    venueApprovalRequestId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Reference to VenueApprovalRequest if using another organizer venue",
    },
    fixturesGenerated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Whether fixtures have been generated",
    },
    lateEnrollmentAllowed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Allow late enrollment after publishing",
    },
    // League type & join configuration
    leagueType: {
      type: DataTypes.ENUM("fixed", "rolling"),
      allowNull: false,
      defaultValue: "fixed",
      comment: "fixed = fixtures locked after generation; rolling = fixtures regenerate when new player joins",
    },
    joinAllowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Whether players are allowed to self-join this league",
    },
    lateJoinAllowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Whether players can join after league becomes active (ongoing)",
    },
    // New wizard configuration fields
    clubId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Club this league belongs to",
    },
    clubName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Club name (cached for display)",
    },
    venueIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of venue names/IDs for this league",
      get() {
        let raw = this.getDataValue('venueIds');
        if (!raw) return [];
        while (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw);
          } catch (e) {
            return [];
          }
        }
        return Array.isArray(raw) ? raw : [];
      }
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Game ID (references games table)",
    },
    gameName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Game name (cached for display)",
    },
    gameSeasonId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Game season identifier",
    },
    visibility: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "public",
      comment: "League visibility: public, private, or invite",
    },
    registrationOpen: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: "Registration opening date",
    },
    registrationClose: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      comment: "Registration closing date",
    },
    // Complete wizard configuration stored as JSON
    basicInfo: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Basic league information from wizard step 1",
    },
    structure: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "League structure configuration from wizard step 2",
    },
    matchRules: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Match rules configuration from wizard step 3",
    },
    pointsSystem: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Points and scoring system from wizard step 4",
    },
    tieBreakPriority: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [
        "headToHead",
        "frameDifference",
        "framesWon",
        "highestBreak",
        "wins",
        "winPercentage",
        "random",
      ],
      comment: "Tie-break priority order from wizard step 4",
    },
    standingsDisplay: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        columns: [
          "matchesPlayed",
          "wins",
          "losses",
          "draws",
          "points",
          "framesWon",
          "framesConceded",
          "frameDifference",
          "whitewashes",
          "highestBreak",
          "winPercent",
          "streak",
        ],
      },
      comment: "Standings table display configuration from wizard step 5",
    },
    scheduling: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Scheduling engine configuration from wizard step 6",
    },
    reporting: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Match reporting system from wizard step 7",
    },
    advanced: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Advanced settings from wizard step 8",
    },
    joinCode: {
      type: DataTypes.STRING(10),
      allowNull: true,
      unique: true,
      comment: "Short alphanumeric code for joining (e.g., ABC-123)",
    },
    generalInviteToken: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      comment: "Unique token for shareable join links",
    },
  },
  {
    tableName: "leagues",
    timestamps: true,
  }
);

module.exports = League;