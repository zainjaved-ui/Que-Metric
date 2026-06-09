// models/Tournament.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Tournament = sequelize.define(
  "Tournament",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Which organization is hosting this tournament",
    },
    clubId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Tournament must belong to a club (club is the parent entity)",
    },
    venueId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Primary venue (can have multiple via venueIds)",
    },
    // Basic Info
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "URL-friendly slug",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Sport & Game
    sport: {
      type: DataTypes.STRING(100),
      allowNull: false,
      set(value) {
        if (value) {
          this.setDataValue('sport', value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
        }
      }
    },
    gameId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "If linked to specific game",
    },
    // Organizer Type
    organiserType: {
      type: DataTypes.ENUM("independent", "official_club", "regional", "major"),
      defaultValue: "independent",
    },
    // Ranking & Tier System
    ranked: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Is this a ranked tournament",
    },
    tier: {
      type: DataTypes.ENUM("local", "county", "regional", "national", "international"),
      defaultValue: "local",
      comment: "Tournament tier: Local, County, Regional, or National",
    },
    isOfficialRanking: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Only official tournaments contribute to rankings",
    },
    officialApprovedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Platform owner/super admin who marked this tournament as official",
    },
    officialApprovedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When tournament was marked as official for ranking",
    },
    sanctionStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      defaultValue: "pending",
      comment: "Tier 1&2 require approval",
    },
    // Dates & Deadlines
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    registrationDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last day for standard registration",
    },
    lateRegistrationDeadline: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Last day for late registration (if enabled)",
    },
    matchDeadlineDate: {
      type: DataTypes.VIRTUAL,
      get() {
        // Expose tournament match deadline only when deadline enforcement is enabled.
        if (!this.getDataValue("matchDeadlineEnforcement")) {
          return null;
        }
        const rawPrivacy = this.getDataValue("privacySettings");
        let privacy = rawPrivacy;
        if (typeof rawPrivacy === "string") {
          try {
            privacy = JSON.parse(rawPrivacy);
          } catch {
            privacy = {};
          }
        }
        if (!privacy || typeof privacy !== "object") privacy = {};
        return privacy.matchDeadlineDate || null;
      },
      set(value) {
        const rawPrivacy = this.getDataValue("privacySettings");
        let privacy = rawPrivacy;
        if (typeof rawPrivacy === "string") {
          try {
            privacy = JSON.parse(rawPrivacy);
          } catch {
            privacy = {};
          }
        }
        if (!privacy || typeof privacy !== "object") privacy = {};
        privacy.matchDeadlineDate = value || null;
        this.setDataValue("privacySettings", privacy);
      },
    },
    allowLateRegistration: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Venue(s)
    venueIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of venue IDs if multiple",
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "County from venue postcode",
    },
    // Participant Limits
    maxParticipants: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "null = unlimited",
    },
    minParticipants: {
      type: DataTypes.INTEGER,
      defaultValue: 2,
      comment: "Minimum for tournament to run",
    },
    currentParticipantCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Current registered (approved) participants",
    },
    minPlayersForRankingPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 8,
      comment: "Minimum entry for ranking points to be awarded",
    },
    // Entry Methods
    entryMethods: {
      type: DataTypes.JSON,
      defaultValue: {
        selfRegistration: true,
        invitationLink: true,
        joinCode: true,
        adminEntry: true,
        openRequestWithApproval: true,
      },
      comment: "Which entry methods are enabled",
    },
    // Entry Methods (individual flags for easier querying)
    allowsSelfRegistration: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Players can register themselves",
    },
    allowsInvitations: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Players can be invited via email links",
    },
    allowsJoinCodes: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Players can join with unique codes",
    },
    allowsAdminEntry: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Admin can add players directly",
    },
    allowsOpenRegistration: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Players can request to join directly",
    },
    // Fees
    entryFee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    feeCurrency: {
      type: DataTypes.STRING(3),
      defaultValue: "GBP",
    },
    // Status & Progress
    status: {
      type: DataTypes.ENUM("draft", "registration", "registration_closed", "fixtures_generated", "in_progress", "completed", "archived", "cancelled"),
      defaultValue: "draft",
    },
    venueRequestStatus: {
      type: DataTypes.ENUM("none", "pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "none",
      comment: "Tracks venue approval workflow for tournament start",
    },
    setupCurrentStep: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: "Current wizard step in setup flow (1-11)",
    },
    setupCompletedSteps: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: "Array of completed setup steps",
    },
    setupCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "True when all setup steps are completed",
    },
    currentRound: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Which round is currently active",
    },
    participantApprovalRequired: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "If true, registrations need admin approval",
    },
    visibility: {
      type: DataTypes.ENUM("public", "private"),
      defaultValue: "public",
    },
    publicStats: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Can non-participants see tournament stats",
    },
    // Format Configuration
    formatId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Foreign key to TournamentFormat",
    },
    scoringRulesId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Foreign key to TournamentScoringRules",
    },
    // Withdrawal Rules
    withdrawalRules: {
      type: DataTypes.JSON,
      defaultValue: {
        beforeStart: "remove",
        duringGroup: "50_percent_rule",
        duringKnockout: "walkover",
        cancellation: "partial",
        fraudVoid: false,
      },
      comment:
        "beforeStart: remove|forfeit; duringGroup: remove|remove_all|50_percent_rule|walkover; duringKnockout: walkover|void",
    },
    // Scheduling
    autoGenerateFixtures: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    flexibleScheduling: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    matchDeadlineEnforcement: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    autoForfeitOverdue: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    schedulingConfig: {
      type: DataTypes.VIRTUAL,
      get() {
        return {
          autoGenerateFixtures: this.getDataValue("autoGenerateFixtures"),
          flexibleScheduling: this.getDataValue("flexibleScheduling"),
          enforceDeadlines: this.getDataValue("matchDeadlineEnforcement"),
          autoForfeit: this.getDataValue("autoForfeitOverdue"),
        };
      },
      set(value) {
        if (!value || typeof value !== "object") return;
        if (value.autoGenerateFixtures !== undefined) {
          this.setDataValue("autoGenerateFixtures", Boolean(value.autoGenerateFixtures));
        }
        if (value.flexibleScheduling !== undefined) {
          this.setDataValue("flexibleScheduling", Boolean(value.flexibleScheduling));
        }
        if (value.enforceDeadlines !== undefined) {
          this.setDataValue("matchDeadlineEnforcement", Boolean(value.enforceDeadlines));
        }
        if (value.autoForfeit !== undefined) {
          this.setDataValue("autoForfeitOverdue", Boolean(value.autoForfeit));
        }
      },
    },
    adminCanAdjustFixtures: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Ranking Points
    rankingPointsPerRound: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {
        winner: 100,
        runnerUp: 60,
        semi: 30,
        quarter: 15,
      },
      comment: "Points awarded per finishing position",
    },
    rankingDecayType: {
      type: DataTypes.ENUM("rolling_12_months", "fixed_season", "none"),
      defaultValue: "rolling_12_months",
    },
    rankingScope: {
      type: DataTypes.JSON,
      defaultValue: ["county"],
      comment: "Array: county, regional, national",
    },
    // Privacy & Reporting
    privacySettings: {
      type: DataTypes.JSON,
      defaultValue: {
        publicPage: true,
        publicStats: true,
        anonymousPlayers: false,
      },
    },
    // Standings Display Configuration
    standingsDisplay: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Configuration for which columns to display in standings (similar to League standings)",
    },
    // Statistics & Archive
    totalMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    completedMatches: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Archival
    isArchived: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "After completion, tournaments can be archived",
    },
    archivedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Bracket Management
    bracketStatus: {
      type: DataTypes.ENUM("not_generated", "generated", "locked", "scheduled"),
      defaultValue: "not_generated",
      comment: "Workflow state: not_generated → generated → locked → scheduled",
    },
    bracketGeneratedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When bracket was generated",
    },
    bracketLockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When bracket was locked (prevents viewing until scheduled)",
    },
    bracketLockedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User ID who locked the bracket",
    },
    allMatchesScheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When all matches were scheduled (visible to players)",
    },
    // Late Registration & Fixture Regeneration
    lateRegistrationMode: {
      type: DataTypes.STRING(50),
      defaultValue: "disabled",
      comment: "How late registrations are handled after deadline: disabled, allow_before_fixture, allow_with_regeneration, allow_with_qualifier, allow_with_waitlist",
    },
    pendingLatePlayerCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Count of players added during late registration phase, pending fixture regeneration",
    },
    lastFixtureRegenerationAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of last bracket regeneration for late entries",
    },
    fixtureRegenerationCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total number of times bracket has been regenerated (audit)",
    },
    maxFixtureRegenerations: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      comment: "Maximum times bracket can be regenerated to preserve tournament credibility",
    },
    // Metadata
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "tournaments",
    timestamps: true,
    indexes: [
      { fields: ["organizationId"] },
      { fields: ["status"] },
      { fields: ["startDate"] },
      { fields: ["tier"] },
      { fields: ["ranked"] },
      { fields: ["isOfficialRanking"] },
    ],
  }
);

module.exports = Tournament;