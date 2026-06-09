// models/TournamentFormat.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const TournamentFormat = sequelize.define(
  "TournamentFormat",
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
    // Main Format Type
    type: {
      type: DataTypes.ENUM("knockout", "round_robin", "swiss", "groups_knockout", "ladder", "custom"),
      allowNull: false,
      defaultValue: "knockout",
      comment: "Tournament structure type",
    },
    // Match Configuration
    bestOfFrames: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 3,
      comment: "Best of X frames (e.g., 3, 5, 7, 9). Null when useRoundFormats is true.",
    },
    playAllFrames: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Force play all frames even if winner determined",
    },
    // Seeding Strategy
    seeding: {
      type: DataTypes.ENUM("random", "ranked", "manual"),
      allowNull: false,
      defaultValue: "random",
      comment: "How players are seeded into brackets/groups",
    },
    // Ranking source for seeded tournaments
    rankingSource: {
      type: DataTypes.ENUM("global", "league_table"),
      defaultValue: "global",
      comment: "For ranked seeding: use global ranking or current league points",
    },
    // Manual seed order (array of player IDs in seed position order)
    manualSeedOrder: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'For manual seeding: [playerId1, playerId2, ...] in seed position order',
    },
    // Per-Round Match Format Override
    useRoundFormats: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'When true, use per-round bestOf mapping (roundFormats) instead of global bestOfFrames',
    },
    roundFormats: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Per-round bestOf mapping: {"1": 3, "2": 5, "semi_final": 7, "final": 9}',
    },
    // Bracket Structure
    byesHandling: {
      type: DataTypes.ENUM("auto_expand", "preliminary_round", "random_bye", "top_seeded"),
      defaultValue: "auto_expand",
      comment: "Power-of-two enforcement: expand bracket, use preliminary, random bye, or top-seeded byes",
    },
    preliminaryRoundSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of players in preliminary round (if byesHandling = preliminary_round)",
    },
    // Group Configuration (for groups_knockout)
    groupCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of groups",
    },
    playersPerGroup: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Target players per group",
    },
    qualifiersPerGroup: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number advancing from each group",
    },
    // First round number of knockout stage after group stage (persisted after bracket gen)
    knockoutStartRound: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For groups_knockout: round where knockout begins (saved when fixtures are generated)",
    },
    // Swiss: total scheduled rounds (wizard / organizer config)
    maxRounds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "For swiss: number of rounds to play (default 5 if unset)",
    },
    // Ladder Configuration (for ladder format)
    challengeRange: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 2,
      comment: "How many positions up a player can challenge in ladder format",
    },
    challengeCooldown: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 24,
      comment: "Hours between challenges in ladder format",
    },
    // Divisional Play
    allowDivisions: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Allow multiple skill divisions",
    },
    divisionCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of divisions if enabled",
    },
    promotionRules: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: { type: "none" },
      comment: '{"type": "none|top_n_promote|bottom_n_relegate", "count": n}',
    },
    // Minimum Players Threshold
    minPlayersForVariations: {
      type: DataTypes.INTEGER,
      defaultValue: 8,
      comment: "Minimum players to award ranking points",
    },
  },
  {
    tableName: "tournament_formats",
    timestamps: true,
  }
);

module.exports = TournamentFormat;
