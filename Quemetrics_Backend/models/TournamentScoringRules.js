// models/TournamentScoringRules.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentScoringRules = sequelize.define(
  "TournamentScoringRules",
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
    // Base Points
    pointsWin: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: "Points awarded for a match win",
    },
    pointsDraw: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "Points awarded for a draw (if applicable)",
    },
    pointsLoss: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Points awarded for a loss",
    },
    pointsWalkover: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: "Points awarded if opponent walks over",
    },
    pointsDefaultWin: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: "Points if opponent defaults",
    },
    // Bonus Points System
    bonusRules: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment:
        '{"whitewash": points, "centuryBreak": points, "participation": points, "giveByePoints": bool, "byePointsValue": number, "giveRoundRobinRestPoints": bool, "roundRobinRestPointsValue": number}',
    },
    // Tie-Break Priority
    tieBreakPriority: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [
        "head_to_head",
        "frame_difference",
        "frames_won",
        "points_difference",
        "highest_break",
        "random"
      ],
      comment: "Array of tie-break criteria in priority order",
    },
    // Statistics Inclusion
    statsInclusion: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: ["frames_won", "frames_lost", "breaks", "whitewash_count"],
      comment: "Which statistics to include in standings/rankings",
    },
    // Handicap Rules
    handicapEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Enable handicap play",
    },
    handicapType: {
      type: DataTypes.ENUM("manual", "auto", "skill_based"),
      allowNull: true,
      comment: "How handicaps are determined",
    },
    handicapMethod: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Method for calculating handicap advantages",
    },
  },
  {
    tableName: "tournament_scoring_rules",
    timestamps: true,
    validate: {
      /**
       * Validate that scoring rules are non-negative and at least one value is > 0
       */
      validateScoringValues() {
        const { pointsWin, pointsDraw, pointsLoss, pointsWalkover } = this;

        // Check for negative values
        if ((pointsWin ?? 0) < 0 || (pointsDraw ?? 0) < 0 || (pointsLoss ?? 0) < 0 || (pointsWalkover ?? 0) < 0) {
          throw new Error('Scoring point values cannot be negative');
        }

        // Check that at least one value is greater than 0
        if (
          (pointsWin ?? 0) === 0 &&
          (pointsDraw ?? 0) === 0 &&
          (pointsLoss ?? 0) === 0 &&
          (pointsWalkover ?? 0) === 0
        ) {
          throw new Error('At least one scoring point value must be greater than 0');
        }
      },
    },
  }
);

module.exports = TournamentScoringRules;
