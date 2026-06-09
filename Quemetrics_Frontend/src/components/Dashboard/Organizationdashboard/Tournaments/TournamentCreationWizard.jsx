import React, { useState, useEffect, useCallback, useContext } from 'react';
import { FaChevronRight, FaCheck, FaSpinner } from 'react-icons/fa';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useTournament } from './useTournament';
import { AuthContext } from '../../../../contexts/AuthContext';
import ManualSeedingAssignment from '../../../Tournament/ManualSeedingAssignment';
import BracketPreview from '../../../Tournament/BracketPreview';
import VenueMultiSelect from '../../../Tournament/VenueMultiSelect';
import WithdrawalRulesConfig from './WithdrawalRulesConfig';
import {
  getByeHandlingOptions,
  getByeHandlingOption,
  formatByeStructureSummary,
  validateSeedingByeCompatibility,
  getByeHandlingDisabledState,
} from '../../../../utils/byeHandlingUtils';

// Tie-break rules — fixed list, organiser sets priority via drag-and-drop.
// Keys are sent to the backend; labels are UI-only.
const TIE_BREAK_OPTIONS = [
  { key: 'head_to_head',     label: 'Head-to-head result' },
  { key: 'frame_difference', label: 'Frame difference'    },
  { key: 'frames_won',       label: 'Frames won'          },
  { key: 'balls_potted',     label: 'Balls potted'        },
  { key: 'balls_conceded',   label: 'Balls conceded'      },
  { key: 'most_wins',        label: 'Most wins'           },
  { key: 'fewest_losses',    label: 'Fewest losses'       },
];
const DEFAULT_TIE_BREAK_ORDER = TIE_BREAK_OPTIONS.map((o) => o.key);
const TIE_BREAK_LABEL = Object.fromEntries(TIE_BREAK_OPTIONS.map((o) => [o.key, o.label]));

// Stats-column definitions per sport. The organiser toggles which appear in
// the standings table. Keys are sent to the backend; labels are UI-only.
const STATS_COLUMNS_BY_SPORT = {
  snooker: [
    { key: 'played',          label: 'Played'        },
    { key: 'won',             label: 'Won'           },
    { key: 'lost',            label: 'Lost'          },
    { key: 'drew',            label: 'Drew'          },
    { key: 'frames_won',      label: 'Frames Won'    },
    { key: 'frames_lost',     label: 'Frames Lost'   },
    { key: 'highest_break',   label: 'Highest Break' },
    { key: 'breaks_50_plus',  label: '50+ Breaks'    },
    { key: 'breaks_100_plus', label: '100+ Breaks'   },
    { key: 'points',          label: 'Points'        },
  ],
  pool: [
    { key: 'played',          label: 'Played'         },
    { key: 'won',             label: 'Won'            },
    { key: 'lost',            label: 'Lost'           },
    { key: 'drew',            label: 'Drew'           },
    { key: 'frames_won',      label: 'Frames Won'     },
    { key: 'frames_lost',     label: 'Frames Lost'    },
    { key: 'balls_potted',    label: 'Balls Potted'   },
    { key: 'balls_conceded',  label: 'Balls Conceded' },
    { key: 'seven_ball_wins', label: '7-Ball Wins'    },
    { key: 'points',          label: 'Points'         },
  ],
  pooker: [
    { key: 'played',         label: 'Played'         },
    { key: 'won',            label: 'Won'            },
    { key: 'lost',           label: 'Lost'           },
    { key: 'drew',           label: 'Drew'           },
    { key: 'frames_won',     label: 'Frames Won'     },
    { key: 'frames_lost',    label: 'Frames Lost'    },
    { key: 'balls_potted',   label: 'Balls Potted'   },
    { key: 'balls_conceded', label: 'Balls Conceded' },
    { key: 'black_finishes', label: 'Black Finishes' },
    { key: 'whitewash_wins', label: 'Whitewash Wins' },
    { key: 'points',         label: 'Points'         },
  ],
};
// Normalise sport key — the BasicInfo dropdown emits 'poker' for the third
// sport but the spec lists 'Pooker'; treat them as aliases.
function getStatsColumnsForSport(sport) {
  const k = String(sport || '').toLowerCase();
  if (k === 'poker') return STATS_COLUMNS_BY_SPORT.pooker;
  return STATS_COLUMNS_BY_SPORT[k] || STATS_COLUMNS_BY_SPORT.snooker;
}
function getDefaultStatsColumnKeys(sport) {
  return getStatsColumnsForSport(sport).map((c) => c.key);
}

function coerceBoolean(value) {
  if (value === undefined || value === null) return false;
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.Buffer &&
    globalThis.Buffer.isBuffer(value)
  ) {
    return value[0] === 1;
  }
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === 'yes') return true;
    if (s === 'false' || s === 'no' || s === '') return false;
  }
  return Boolean(value);
}

// Normalize various sportTypes shapes returned from the API into a simple array of strings
function normalizeSportTypes(sportTypes) {
  if (!sportTypes) return [];
  if (Array.isArray(sportTypes)) return sportTypes;
  if (typeof sportTypes === 'string') {
    // Try to parse JSON string first (e.g. "[\"snooker\"]")
    try {
      const parsed = JSON.parse(sportTypes);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON, fallthrough to comma-split
    }
    // Comma-separated string fallback
    return sportTypes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (typeof sportTypes === 'object') {
    // Could be an object with numeric keys or values
    try {
      const values = Object.values(sportTypes).map((v) => (v == null ? '' : String(v)));
      return values.filter(Boolean);
    } catch {
      return [];
    }
  }
  return [String(sportTypes)];
}

/**
 * Multi-step Tournament Creation Wizard
 * Step 1 (Club Selection) is mandatory - Tournament must be created under a specific club
 */
export default function TournamentCreationWizard({ onComplete, onClose, onDraftCreated, tournamentToResume = null }) {
  const { createTournament, updateTournament, loading, getMyClubs, getAllVenues, getTournamentById, validateRankingConfig } = useTournament();
  const { user } = useContext(AuthContext);

  const [createdDraftTournament, setCreatedDraftTournament] = useState(null);
  const hasDraftTournamentId = Boolean((tournamentToResume?.id || createdDraftTournament?.id) ?? null);
  const isResumingFromExisting = Boolean(tournamentToResume?.id);

  const [currentStep, setCurrentStep] = useState(() => (isResumingFromExisting ? 3 : 1));
  const [completedSteps, setCompletedSteps] = useState(() =>
    isResumingFromExisting ? new Set([1, 2]) : new Set()
  );

  const [venueApprovalState, setVenueApprovalState] = useState(
    tournamentToResume?.venueRequestStatus || createdDraftTournament?.venueRequestStatus || "none"
  );
  const [clubs, setClubs] = useState([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [_selectedClubVenues, setSelectedClubVenues] = useState([]);
  const [venues, setVenues] = useState([]);
  const [venuesLoading, setVenuesLoading] = useState(false);
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [venueQuery] = useState('');
  const [isStepNavigating, setIsStepNavigating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [venueStepNotice, setVenueStepNotice] = useState('');

  const [formData, setFormData] = useState({
    // Step 1: Club Selection (REQUIRED - Parent Entity)
    clubId: '',
    // Venue selection (optional; backend will fallback to club primary venue when empty)
    venueIds: [],

    // Step 2: Basic Info
    name: '',
    sport: 'Snooker',
    organiserType: 'independent',
    description: '',
    gameId: '',
    gameSeasonId: '',
    startDate: '',
    endDate: '',
    registrationDeadline: '',
    allowLateRegistration: false,
    lateRegistrationMode: 'allow_with_regeneration',
    lateRegistrationDeadline: '',
    maxFixtureRegenerations: 3,
    maxParticipants: '',
    minParticipants: 2,

    // Step 3: Entry Methods
    entryMethods: {
      selfRegistration: true,
      invitationLink: false,
      joinCode: false,
      adminEntry: true,
      openRequestWithApproval: false,
    },
    participantApprovalRequired: false,

    // Step 4: Format
    formatConfig: {
      type: 'knockout',
      bestOfFrames: 3,
      useRoundFormats: false,
      roundFormats: {},
      seeding: 'random',
      byesHandling: 'auto_expand',
      groupCount: 4,
      playersPerGroup: 8,
      qualifiersPerGroup: 2,
      minPlayersForVariations: 8,
      maxRounds: 5,
      manualSeedOrder: [],
      rankingSource: 'global',
    },

    // Step 5: Scoring Rules
    scoringRules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      pointsWalkover: 3,
      bonusRules: {
        whitewash: 1,
        centuryBreak: 0,
        participation: 0,
      },
      handicapEnabled: false,
    },

    // Step 6: Scheduling
    autoGenerateFixtures: true,
    flexibleScheduling: false,
    matchDeadlineEnforcement: true,
    autoForfeitOverdue: false,
    matchDeadlineDate: '',

    // Step 7: Withdrawal Rules (backend accepts aliases remove_all / 50_percent_rule / groupStage / knockout)
    withdrawalRules: {
      beforeStart: 'remove',
      duringGroup: '50_percent_rule',
      duringKnockout: 'walkover',
      cancellation: 'partial',
      fraudVoid: false,
    },

    // RANKING STEP REMOVED — ranking points are platform owner controlled only.
    // ranked / tier / minPlayersForRankingPoints / rankingPointsPerRound /
    // rankingDecayType / rankingScope are intentionally absent here; the
    // backend payload contract still tolerates them being undefined.

    // Step 5: Tie-Break Rules (drag-ordered priority list)
    tieBreakOrder: [...DEFAULT_TIE_BREAK_ORDER],

    // Step 6: Stats Columns (defaults seeded from initial sport)
    statsColumns: getDefaultStatsColumnKeys('Snooker'),

    // Step 10: Visibility & Registration (merged Privacy + Fees)
    visibility: 'public',
    publicStats: true,
    entryFee: '',
    feeCurrency: 'GBP',

    // Step 11: Additional Config
    notes: '',
    countryCode: 'GB',
  });

  // Inline validation: { fieldKey: 'Error message' } — one entry per invalid
  // field. Cleared on field-change, step-change, and successful submit.
  const [validationErrors, setValidationErrors] = useState({});

  
  // New step order — RANKING step removed (ranking points are platform owner controlled).
  const steps = [
    { num: 1,  title: 'Select Club',               icon: '🏢' },
    { num: 2,  title: 'Basic Info',                icon: '📋' },
    { num: 3,  title: 'Format & Structure',        icon: '📊' },
    { num: 4,  title: 'Scoring / Points System',   icon: '⭐' },
    { num: 5,  title: 'Tie-Break Rules',           icon: '⚖️' },
    { num: 6,  title: 'Stats Columns',             icon: '📈' },
    { num: 7,  title: 'Withdrawal Rules',          icon: '❌' },
    { num: 8,  title: 'Scheduling',                icon: '📅' },
    { num: 9,  title: 'Match Reporting & Entry',   icon: '🚪' },
    { num: 10, title: 'Visibility & Registration', icon: '👁️' },
    { num: 11, title: 'Review',                    icon: '✅' },
  ];

  // Load clubs on component mount
  useEffect(() => {
    const loadClubs = async () => {
      setClubsLoading(true);
      try {
        const clubsList = await getMyClubs();
        setClubs(clubsList || []);
      } catch (err) {
        console.error('Failed to load clubs:', err);
        alert('Failed to load your clubs. Please try again.');
      } finally {
        setClubsLoading(false);
      }
    };
    loadClubs();
  }, [getMyClubs]);

  // Load all venues (from all organizers) for selection.
  useEffect(() => {
    const loadVenues = async () => {
      setVenuesLoading(true);
      try {
        const venuesList = await getAllVenues();
        setVenues(venuesList || []);
      } catch (err) {
        console.error('Failed to load venues:', err);
        // Keep wizard usable; backend will fallback to club primary venue.
        setVenues([]);
      } finally {
        setVenuesLoading(false);
      }
    };

    loadVenues();
  }, [getAllVenues]);

  // Load available games (Snooker, Pool, Poker) for auto-population of gameId
  useEffect(() => {
    const loadGames = async () => {
      setGamesLoading(true);
      try {
        const response = await fetch('/api/match-result/games');
        if (response.ok) {
          const data = await response.json();
          setGames(data.data || []);
        } else {
          console.error('Failed to load games:', response.statusText);
        }
      } catch (err) {
        console.error('Failed to load games:', err);
      } finally {
        setGamesLoading(false);
      }
    };
    loadGames();
  }, []);

  // Helper function to get gameId by sport name
  const getGameIdBySport = (sportName) => {
    if (!sportName || !Array.isArray(games)) return '';
    const sport = String(sportName).toLowerCase();
    const game = games.find(g => g.name && String(g.name).toLowerCase() === sport);
    return game?.id || '';
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // Auto-populate gameId when sport changes
      if (field === 'sport') {
        updated.gameId = getGameIdBySport(value);
        // Reset statsColumns to the new sport's full default set so the
        // organiser starts from "all enabled" for the chosen sport.
        updated.statsColumns = getDefaultStatsColumnKeys(value);
      }
      return updated;
    });
    // Clear this field's inline error as soon as the user edits it.
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const toDateInputValue = (value) => {
    if (!value) return "";
    if (typeof value === "string") {
      // Most APIs return ISO strings; date input wants YYYY-MM-DD.
      if (value.length >= 10) return value.slice(0, 10);
      return value;
    }
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return "";
    }
  };

  // When resuming, pre-fill the wizard form with the existing tournament values.
  useEffect(() => {
    if (!tournamentToResume) return;

    const t = tournamentToResume;
    const format = t.format || {};
    const scoringRules = t.scoringRules || t.scoring_rules || {};

    setCreatedDraftTournament(null); // resuming from an existing tournament
    const persistedCompleted = Array.isArray(t.setupCompletedSteps)
      ? t.setupCompletedSteps.map((s) => Number(s)).filter((s) => Number.isInteger(s) && s >= 1 && s <= 11)
      : [1, 2];
    const normalizedCompleted = persistedCompleted.length > 0 ? persistedCompleted : [1, 2];
    const persistedCurrent = Number(t.setupCurrentStep || 3);
    const safeCurrent = Number.isInteger(persistedCurrent) ? Math.min(11, Math.max(3, persistedCurrent)) : 3;
    setCompletedSteps(new Set(normalizedCompleted));
    setCurrentStep(safeCurrent);

    setFormData((prev) => ({
      ...prev,
      clubId: t.clubId || t.club?.id || prev.clubId,
      venueIds: t.venueIds || prev.venueIds,
      name: t.name || "",
      sport: t.sport || prev.sport,
      organiserType: t.organiserType || prev.organiserType,
      description: t.description || "",
      gameId: t.gameId || getGameIdBySport(t.sport) || "",
      gameSeasonId: t.gameSeasonId || "",
      startDate: toDateInputValue(t.startDate),
      endDate: toDateInputValue(t.endDate),
      registrationDeadline: toDateInputValue(t.registrationDeadline),
      allowLateRegistration: Boolean(t.allowLateRegistration),
      lateRegistrationMode: t.lateRegistrationMode || 'allow_with_regeneration',
      lateRegistrationDeadline: toDateInputValue(t.lateRegistrationDeadline),
      maxFixtureRegenerations: t.maxFixtureRegenerations ?? 3,
      maxParticipants: t.maxParticipants ?? "",
      minParticipants: Number(t.minParticipants ?? prev.minParticipants),

      entryMethods: {
        selfRegistration: Boolean(t.allowsSelfRegistration),
        invitationLink: Boolean(t.allowsInvitations),
        joinCode: Boolean(t.allowsJoinCodes),
        adminEntry: Boolean(t.allowsAdminEntry),
        openRequestWithApproval: Boolean(t.allowsOpenRegistration),
      },

      participantApprovalRequired: Boolean(t.participantApprovalRequired ?? prev.participantApprovalRequired),

      formatConfig: {
        ...prev.formatConfig,
        type: format.type || prev.formatConfig.type,
        bestOfFrames: Number(format.bestOfFrames ?? prev.formatConfig.bestOfFrames),
        useRoundFormats: Boolean(format.useRoundFormats ?? prev.formatConfig.useRoundFormats),
        roundFormats: format.roundFormats || prev.formatConfig.roundFormats,
        seeding: format.seeding || prev.formatConfig.seeding,
        byesHandling: format.byesHandling || prev.formatConfig.byesHandling,
        groupCount: Number(format.groupCount ?? prev.formatConfig.groupCount),
        playersPerGroup: Number(format.playersPerGroup ?? prev.formatConfig.playersPerGroup),
        qualifiersPerGroup: Number(format.qualifiersPerGroup ?? prev.formatConfig.qualifiersPerGroup),
        minPlayersForVariations: Number(format.minPlayersForVariations ?? prev.formatConfig.minPlayersForVariations),
        maxRounds: format.maxRounds ?? prev.formatConfig.maxRounds,
      },

      scoringRules: {
        ...prev.scoringRules,
        pointsWin: Number(scoringRules.pointsWin ?? prev.scoringRules.pointsWin),
        pointsDraw: Number(scoringRules.pointsDraw ?? prev.scoringRules.pointsDraw),
        pointsLoss: Number(scoringRules.pointsLoss ?? prev.scoringRules.pointsLoss),
        pointsWalkover: Number(scoringRules.pointsWalkover ?? prev.scoringRules.pointsWalkover),
        bonusRules: scoringRules.bonusRules || prev.scoringRules.bonusRules,
        handicapEnabled: Boolean(scoringRules.handicapEnabled ?? prev.scoringRules.handicapEnabled),
      },

      // Scheduling + withdrawal rules
      autoGenerateFixtures: Boolean(
        t.schedulingConfig?.autoGenerateFixtures ?? t.autoGenerateFixtures ?? prev.autoGenerateFixtures
      ),
      flexibleScheduling: Boolean(
        t.schedulingConfig?.flexibleScheduling ?? t.flexibleScheduling ?? prev.flexibleScheduling
      ),
      matchDeadlineEnforcement: Boolean(
        t.schedulingConfig?.enforceDeadlines ?? t.matchDeadlineEnforcement ?? prev.matchDeadlineEnforcement
      ),
      autoForfeitOverdue: Boolean(
        t.schedulingConfig?.autoForfeit ?? t.autoForfeitOverdue ?? prev.autoForfeitOverdue
      ),
      matchDeadlineDate: toDateInputValue(t.matchDeadlineDate || prev.matchDeadlineDate),
      withdrawalRules: (() => {
        const wr = t.withdrawalRules || {};
        const rawBs = wr.beforeStart ?? wr.before_start;
        const bs =
          rawBs === 'forfeit' || rawBs === 'remove' ? rawBs : 'remove';
        const dg = wr.duringGroup || wr.groupStage || '50percent';
        const dk = wr.duringKnockout || wr.knockout || 'walkover';
        const duringGroup =
          dg === 'remove' || dg === 'remove_all'
            ? 'remove_all'
            : dg === '50percent' || dg === '50_percent_rule'
              ? '50_percent_rule'
              : dg;
        return {
          beforeStart: bs,
          duringGroup,
          duringKnockout: dk,
          cancellation: wr.cancellation || 'partial',
          fraudVoid: Boolean(wr.fraudVoid),
        };
      })(),

      // Ranking fields intentionally NOT pre-filled — ranking is platform owner controlled.

      // Tie-break + stats columns
      tieBreakOrder: Array.isArray(t.tieBreakOrder) && t.tieBreakOrder.length > 0
        ? t.tieBreakOrder
        : [...DEFAULT_TIE_BREAK_ORDER],
      statsColumns: Array.isArray(t.statsColumns) && t.statsColumns.length > 0
        ? t.statsColumns
        : getDefaultStatsColumnKeys(t.sport || prev.sport),

      // Visibility & Registration
      visibility: t.visibility || prev.visibility,
      publicStats: Boolean(t.publicStats ?? prev.publicStats),
      entryFee: t.entryFee ?? prev.entryFee,
      feeCurrency: t.feeCurrency || prev.feeCurrency,
      notes: t.notes || prev.notes,
    }));
  }, [tournamentToResume]);

  // Track venue approval so we can block Steps 3+ until the venue owner approves.
  const approvalTournamentId = tournamentToResume?.id || createdDraftTournament?.id || null;

  const refreshVenueApproval = useCallback(async () => {
    if (!approvalTournamentId) return;
    try {
      const latest = await getTournamentById(approvalTournamentId);
      const newStatus = latest?.venueRequestStatus || "none";
      setVenueApprovalState(newStatus);

      // NOTE: Removed auto-advance logic. Let user manually navigate to Step 3.
      // This allows users to freely navigate between steps instead of being trapped.
      // If approval is granted, steps 3+ become enabled, but we don't force navigation.
    } catch (err) {
      console.error("Failed to refresh venue approval status:", err);
    }
  }, [approvalTournamentId, getTournamentById]);

  useEffect(() => {
    if (!approvalTournamentId) return;

    // Initial sync.
    refreshVenueApproval();

    // Poll only while pending.
    if (venueApprovalState !== "pending") return;

    const t = window.setInterval(() => {
      refreshVenueApproval();
    }, 8000);

    return () => window.clearInterval(t);
  }, [approvalTournamentId, venueApprovalState, refreshVenueApproval]);

  const canProceedBeyondVenue = venueApprovalState === "approved" || venueApprovalState === "none";
  const shouldBlockBecauseVenuePending = !canProceedBeyondVenue && currentStep >= 3;

  useEffect(() => {
    if (canProceedBeyondVenue) setVenueStepNotice('');
  }, [canProceedBeyondVenue]);


  // handleRankedToggle removed — ranking step is platform owner controlled.

  const handleClubChange = (clubId) => {
    handleInputChange('clubId', clubId);

    // Find the selected club and load its venue information
    const selectedClub = clubs.find(c => c.id === clubId);
    if (selectedClub && selectedClub.venues) {
      setSelectedClubVenues(selectedClub.venues || []);
      // NOTE: Do NOT auto-select venues. Users must manually select from the dropdown.
      // Embedded club venues have different ID formats than getAllVenues() results,
      // causing ID mismatch and unresponsive checkboxes.
      // (Removed automatic venue selection - let user choose explicitly)

      // Auto-set sport to first available sport in club (lowercase to match dropdown options)
      const normalized = normalizeSportTypes(selectedClub.sportTypes);
      if (normalized.length > 0) {
        const sportValue = String(normalized[0]).toLowerCase();
        handleInputChange('sport', sportValue);
      }

      // Auto-set gameId from club's gameIds
      const gameIds = normalizeSportTypes(selectedClub.gameIds);
      if (gameIds.length > 0) {
        setFormData((prev) => ({
          ...prev,
          gameId: gameIds[0],
        }));
      }
    } else {
      setSelectedClubVenues([]);
    }
  };

  const handleNestedChange = (parent, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [parent]: { ...prev[parent], [field]: value },
    }));
    // Clear any error keyed at the parent (e.g. 'entryMethods', 'scoring')
    // or the dotted child key (e.g. 'withdrawalRules.beforeStart').
    setValidationErrors((prev) => {
      const dotted = `${parent}.${field}`;
      if (!prev[parent] && !prev[dotted]) return prev;
      const next = { ...prev };
      delete next[parent];
      delete next[dotted];
      return next;
    });
  };

  // Returns an object: { [fieldKey]: errorMessage } so callers can drive
  // inline rendering. Keys match the field-clear logic in handleInputChange /
  // handleNestedChange. Step numbers below follow the NEW step order.
  const validateStep = (step) => {
    const errors = {};

    switch (step) {
      case 1: // Select Club
        if (!formData.clubId) errors.clubId = 'Please select a club to create the tournament under';
        break;

      case 2: // Basic Info
        if (!formData.name.trim()) errors.name = 'Tournament name is required';
        if (!formData.startDate) errors.startDate = 'Start date is required';
        if (!formData.venueIds || formData.venueIds.length === 0) {
          errors.venueIds = 'Please select at least one venue';
        }
        if (
          formData.registrationDeadline &&
          formData.startDate &&
          new Date(formData.registrationDeadline) > new Date(formData.startDate)
        ) {
          errors.registrationDeadline = 'Registration deadline must be on or before start date';
        }
        break;

      case 3: // Format & Structure
        if (!formData.formatConfig?.type) {
          errors['formatConfig.type'] = 'Format type is required';
        }
        break;

      case 4: { // Scoring / Points System
        const { pointsWin, pointsDraw, pointsLoss, pointsWalkover } = formData.scoringRules || {};
        if ((pointsWin ?? 0) < 0 || (pointsDraw ?? 0) < 0 || (pointsLoss ?? 0) < 0 || (pointsWalkover ?? 0) < 0) {
          errors.scoringRules = 'Scoring point values cannot be negative';
        }
        if (
          (pointsWin ?? 0) === 0 &&
          (pointsDraw ?? 0) === 0 &&
          (pointsLoss ?? 0) === 0 &&
          (pointsWalkover ?? 0) === 0
        ) {
          errors.scoringRules = 'At least one scoring value must be greater than 0';
        }
        break;
      }

      case 5: // Tie-Break Rules
        if (!Array.isArray(formData.tieBreakOrder) || formData.tieBreakOrder.length === 0) {
          errors.tieBreakOrder = 'At least one tie-break rule is required';
        }
        break;

      case 6: // Stats Columns
        if (!Array.isArray(formData.statsColumns) || formData.statsColumns.length < 3) {
          errors.statsColumns = 'Select at least 3 stats columns';
        }
        break;

      case 7: { // Withdrawal Rules — all four selects must be non-empty
        const wr = formData.withdrawalRules || {};
        if (!wr.beforeStart)    errors['withdrawalRules.beforeStart']    = 'Required';
        if (!wr.duringGroup)    errors['withdrawalRules.duringGroup']    = 'Required';
        if (!wr.duringKnockout) errors['withdrawalRules.duringKnockout'] = 'Required';
        if (!wr.cancellation)   errors['withdrawalRules.cancellation']   = 'Required';
        break;
      }

      case 8: // Scheduling
        if (formData.matchDeadlineEnforcement && !formData.matchDeadlineDate) {
          errors.matchDeadlineDate = 'Please select a Match Deadline Date when deadline enforcement is enabled';
        }
        break;

      case 9: { // Match Reporting & Entry — at least one entry method enabled
        const em = formData.entryMethods || {};
        const anyOn = Boolean(
          em.selfRegistration || em.invitationLink || em.joinCode || em.adminEntry || em.openRequestWithApproval
        );
        if (!anyOn) errors.entryMethods = 'At least one entry method must be enabled';
        break;
      }

      case 10: { // Visibility & Registration
        // entryFee may be blank (free tournament); only validate if filled.
        const fee = formData.entryFee;
        if (fee !== '' && fee !== null && fee !== undefined) {
          const n = Number(fee);
          if (!Number.isFinite(n) || n < 0) {
            errors.entryFee = 'Entry fee must be a positive number';
          }
        }
        break;
      }

      default:
        break;
    }

    return errors;
  };

  const nextStep = async () => {
    if (isStepNavigating) return;

    const currentOrgId = user?.organizationId || null;

    // If a draft exists and venue approval is pending/rejected, show warning but allow user to stay on Step 2 (don't force navigation).
    if (hasDraftTournamentId && currentStep === 2 && !canProceedBeyondVenue) {
      setVenueStepNotice(
        venueApprovalState === "pending"
          ? "⏳ Venue request pending approval. Click 'Refresh Approval Status' to check for updates."
          : "❌ Venue request was rejected. Please select different venue(s)."
      );
      // NOTE: Removed auto-redirect to step 2. Let user stay on current step.
      // If they want to change venues, they can click the "Change venue" button.
      return;
    }

    // Block advancing to later steps until the venue owner approves (or no venue is required).
    if (currentStep >= 3 && !canProceedBeyondVenue) {
      setVenueStepNotice(
        venueApprovalState === "pending"
          ? "You cannot go to the next step until the venue owner approves. Use “Refresh Status”, or go back to Step 2 to pick a different venue."
          : "This venue was not approved. Go back to Step 2 and select another venue."
      );
      return;
    }

    setVenueStepNotice('');

    const errors = validateStep(currentStep);
    if (Object.keys(errors).length !== 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});

    // Before creating tournament from Step 2, check if any selected venues are external
    if (currentStep === 2 && !hasDraftTournamentId) {
      const selectedVenueObjs = formData.venueIds
        ?.map(venueId => venues.find(v => v.id === venueId))
        .filter(Boolean) || [];

      const externalVenues = selectedVenueObjs.filter(v =>
        v && currentOrgId && v.organizationId &&
        String(v.organizationId) !== String(currentOrgId)
      );

      if (externalVenues.length > 0) {
        setVenueStepNotice(
          `${externalVenues.length} of your selected ${selectedVenueObjs.length} venue(s) belong to other organizers and will require approval before you can proceed. A request will be sent to their owners.`
        );
      }
    }

    setIsStepNavigating(true);
    try {
      // After Step 2 (Basic Info) we create the tournament in `draft`, then continue in-wizard to Step 3+.
      if (currentStep === 2 && !hasDraftTournamentId) {
        const draftPayload = {
          ...formData,
          gameId: formData.gameId || undefined,
          gameSeasonId: formData.gameSeasonId || undefined,
          maxParticipants: formData.maxParticipants === '' ? null : Number(formData.maxParticipants),
          minParticipants: Number(formData.minParticipants || 2),
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
          registrationDeadline: formData.registrationDeadline || null,
          lateRegistrationDeadline: formData.allowLateRegistration
            ? formData.lateRegistrationDeadline || null
            : null,
          lateRegistrationMode: formData.allowLateRegistration
            ? formData.lateRegistrationMode || 'allow_with_regeneration'
            : 'disabled',
          maxFixtureRegenerations: Number(formData.maxFixtureRegenerations) || 3,
        };

        delete draftPayload.formatConfig;
        delete draftPayload.scoringRules;
        // Don't send empty gameId/gameSeasonId
        if (!draftPayload.gameId) delete draftPayload.gameId;
        if (!draftPayload.gameSeasonId) delete draftPayload.gameSeasonId;

        console.log('[TournamentWizard] Creating tournament with payload:', draftPayload);

        const created = await createTournament(draftPayload);
        console.log('[TournamentWizard] Tournament created:', created);

        setCreatedDraftTournament(created);
        setVenueApprovalState(created?.venueRequestStatus || "none");

        if (created?.venueRequestStatus === "pending" || created?.venueRequestStatus === "rejected") {
          setCompletedSteps((prev) => new Set(prev).add(2));
          setCurrentStep(2);
          setVenueStepNotice(
            created?.venueRequestStatus === "pending"
              ? "⏳ Venue request sent to owner(s). Click 'Refresh Approval Status' to check if approved, or wait for email confirmation."
              : "❌ Venue request was rejected. Please choose different venue(s) and try again."
          );
          onDraftCreated?.(created);
          return;
        }

        setCompletedSteps((prev) => new Set(prev).add(2));
        setCurrentStep(3);
        onDraftCreated?.(created);
        return;
      }

      const nextCompleted = new Set(completedSteps);
      nextCompleted.add(currentStep);
      const nextStepNumber = currentStep < steps.length ? currentStep + 1 : currentStep;

      setCompletedSteps(nextCompleted);
      if (currentStep < steps.length) {
        setCurrentStep(nextStepNumber);
      }

      if (hasDraftTournamentId) {
        const tournamentId = tournamentToResume?.id || createdDraftTournament?.id;
        if (tournamentId) {
          try {
            const wr = formData.withdrawalRules || {};
            await updateTournament(tournamentId, {
              setupCurrentStep: nextStepNumber,
              setupCompletedSteps: Array.from(nextCompleted).sort((a, b) => a - b),
              setupCompleted: false,
              withdrawalRules: {
                ...wr,
                beforeStart: wr.beforeStart === 'forfeit' ? 'forfeit' : 'remove',
                duringGroup: wr.duringGroup,
                duringKnockout: wr.duringKnockout,
                groupStage: wr.duringGroup,
                knockout: wr.duringKnockout,
              },
            });
          } catch (err) {
            console.warn("Failed to persist wizard progress:", err?.message || err);
          }
        }
      }
    } catch (err) {
      console.error('[TournamentWizard] Error in nextStep:', err);
      const errorMsg = err?.response?.data?.error || err?.message || 'Something went wrong advancing to the next step.';
      // Surface as a general inline error rather than a window.alert.
      setValidationErrors((prev) => ({ ...prev, _submit: errorMsg }));
    } finally {
      setIsStepNavigating(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setValidationErrors({});
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepNum) => {
    // While waiting on an external venue, block jumping back to Step 1 (club) only — Step 2 stays reachable to change venue.
    if (hasDraftTournamentId && stepNum === 1 && venueApprovalState === "pending") return;
    if (completedSteps.has(stepNum) || stepNum < currentStep) {
      setValidationErrors({});
      setCurrentStep(stepNum);
    }
  };

  const handleSubmit = async () => {
    const errors = validateStep(currentStep);

    // Additional cross-step validation & type coercion before submit
    if (formData.allowLateRegistration && !formData.lateRegistrationDeadline) {
      errors.lateRegistrationDeadline = 'Late Registration Deadline is required when Allow Late Registration is enabled';
    }
    if (!formData.clubId) {
      errors.clubId = 'Tournament must be created under a specific club. Go back to Step 1 and select your club.';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});

    if (isPublishing) return;
    setIsPublishing(true);
    try {
      // Strip ranking-related fields before sending — they are no longer
      // configurable by organisers and must not be sent from the frontend.
      const {
        ranked: _r1, tier: _r2, minPlayersForRankingPoints: _r3,
        rankingPointsPerRound: _r4, rankingDecayType: _r5, rankingScope: _r6,
        ...formDataForSubmit
      } = formData;

      const submissionData = {
        ...formDataForSubmit,
        gameId: formData.gameId || undefined,
        gameSeasonId: formData.gameSeasonId || undefined,
        // New: tie-break priority order + selected stats columns.
        tieBreakOrder: Array.isArray(formData.tieBreakOrder) ? formData.tieBreakOrder : [],
        statsColumns: Array.isArray(formData.statsColumns) ? formData.statsColumns : [],
        schedulingConfig: {
          autoGenerateFixtures: Boolean(formData.autoGenerateFixtures),
          flexibleScheduling: Boolean(formData.flexibleScheduling),
          enforceDeadlines: Boolean(formData.matchDeadlineEnforcement),
          autoForfeit: Boolean(formData.autoForfeitOverdue),
        },
        // Ensure numeric values are numbers (or null)
        maxParticipants: formData.maxParticipants === '' ? null : Number(formData.maxParticipants),
        minParticipants: Number(formData.minParticipants || 2),
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        registrationDeadline: formData.registrationDeadline || null,
        lateRegistrationDeadline: formData.allowLateRegistration ? (formData.lateRegistrationDeadline || null) : null,
        lateRegistrationMode: formData.allowLateRegistration ? (formData.lateRegistrationMode || 'allow_with_regeneration') : 'disabled',
        maxFixtureRegenerations: Number(formData.maxFixtureRegenerations) || 3,
        // Normalize nested objects (omit UI-only keys like useRoundFormats)
        formatConfig: (() => {
          const { useRoundFormats: _u, ...rest } = formData.formatConfig;
          return {
            ...rest,
            bestOfFrames: Number(formData.formatConfig.bestOfFrames || 3),
            groupCount: Number(formData.formatConfig.groupCount || 0),
            playersPerGroup: Number(formData.formatConfig.playersPerGroup || 0),
            qualifiersPerGroup: Number(formData.formatConfig.qualifiersPerGroup || 0),
            minPlayersForVariations: Number(formData.formatConfig.minPlayersForVariations || 8),
            maxRounds:
              formData.formatConfig.type === 'swiss'
                ? Number(formData.formatConfig.maxRounds || 5)
                : null,
          };
        })(),
        scoringRules: {
          ...formData.scoringRules,
          pointsWin: Number(formData.scoringRules.pointsWin || 3),
          pointsDraw: Number(formData.scoringRules.pointsDraw || 1),
          pointsLoss: Number(formData.scoringRules.pointsLoss || 0),
          pointsWalkover: Number(formData.scoringRules.pointsWalkover || 3),
        },
        withdrawalRules: {
          ...formData.withdrawalRules,
          beforeStart:
            formData.withdrawalRules.beforeStart === 'forfeit'
              ? 'forfeit'
              : 'remove',
          duringGroup: formData.withdrawalRules.duringGroup,
          duringKnockout: formData.withdrawalRules.duringKnockout,
          groupStage: formData.withdrawalRules.duringGroup,
          knockout: formData.withdrawalRules.duringKnockout,
        },
      };

      if (hasDraftTournamentId) {
        // Update existing draft tournament (do not create a new tournament / venue request).
        const tournamentId = tournamentToResume?.id || createdDraftTournament?.id;
        if (!tournamentId) {
          throw new Error('Missing tournament id for update');
        }

        const entry = submissionData.entryMethods || {};
        const updatePayload = {
          ...submissionData,
          // Setup completed metadata; registration is opened separately from dashboard action.
          setupCurrentStep: 11,
          setupCompletedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
          setupCompleted: true,
          // Back-end expects `format` (not `formatConfig`) for update.
          format: submissionData.formatConfig,
          // Back-end expects scoringRules under `scoringRules`.
          scoringRules: submissionData.scoringRules,

          // Sync entry-method JSON via boolean columns.
          allowsSelfRegistration: Boolean(entry.selfRegistration),
          allowsInvitations: Boolean(entry.invitationLink),
          allowsJoinCodes: Boolean(entry.joinCode),
          allowsAdminEntry: Boolean(entry.adminEntry),
          allowsOpenRegistration: Boolean(entry.openRequestWithApproval),
        };

        // Avoid venue/club reassignment during "resume" flow.
        delete updatePayload.formatConfig;
        delete updatePayload.entryMethods;
        delete updatePayload.venueIds;
        delete updatePayload.clubId;

        const updated = await updateTournament(tournamentId, updatePayload);
        onComplete?.(updated);
      } else {
        const tournament = await createTournament(submissionData);
        onComplete?.(tournament);
      }
    } catch (err) {
      setValidationErrors((prev) => ({
        ...prev,
        _submit: 'Error creating tournament: ' + (err?.message || err),
      }));
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-none" onClick={(e) => e.stopPropagation()}>
      <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 pr-4">
          {(isResumingFromExisting || (hasDraftTournamentId && currentStep >= 3))
            ? "Continue Tournament Setup"
            : "Create New Tournament"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200 active:scale-95"
          aria-label="Close"
        >
          <XMarkIcon className="h-6 w-6" aria-hidden />
        </button>
      </div>

      {/* Progress Steps */}
      <div className="flex overflow-x-auto px-4 py-4 gap-2 border-b border-gray-100 bg-gray-50/90">
        {steps.map((step) => (
          <button
            type="button"
            key={step.num}
            onClick={() => goToStep(step.num)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm whitespace-nowrap transition-all duration-200 active:scale-95 ${
              currentStep === step.num
                ? 'bg-blue-600 text-white shadow-sm'
                : completedSteps.has(step.num)
                ? 'bg-green-100 text-green-800'
                : 'bg-white text-gray-600 border border-gray-200'
            } ${!completedSteps.has(step.num) && step.num > currentStep ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            disabled={
              (hasDraftTournamentId && step.num === 1 && venueApprovalState === "pending") ||
              (!canProceedBeyondVenue && step.num > 2) ||
              (!completedSteps.has(step.num) && step.num > currentStep)
            }
          >
            <span className="font-bold">{completedSteps.has(step.num) ? <FaCheck /> : step.num}</span>
            <span>{step.title}</span>
          </button>
        ))}
      </div>

      {/* Step Content */}
      <div className="px-6 sm:px-8 py-6 min-h-[400px] space-y-4">
        {!canProceedBeyondVenue && currentStep >= 3 && (
          <div className="mb-4 p-4 rounded-lg border border-yellow-200 bg-yellow-50">
            <div className="font-bold text-yellow-900 mb-1">
              {venueApprovalState === "pending"
                ? "Waiting for venue owner approval"
                : "Venue approval rejected"}
            </div>
            <div className="text-sm text-yellow-800">
              {venueApprovalState === "pending"
                ? "Your venue request is pending. The venue owner must approve before you can continue to Steps 4–11."
                : "Please return to Step 2 and select another venue to continue."}
            </div>
            <div className="mt-3 flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={refreshVenueApproval}
                className="px-4 py-2 bg-white border border-yellow-200 rounded-md font-semibold hover:bg-yellow-50 transition"
              >
                Refresh Status
              </button>
              <button
                type="button"
                onClick={() => {
                  setVenueStepNotice('');
                  setCurrentStep(2);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition"
              >
                {venueApprovalState === "pending" ? "Change venue (Step 2)" : "Go to Step 2"}
              </button>
            </div>
          </div>
        )}

        {/* Inline error summary banner — only shows when the current step has
            unresolved errors. Per-field messages render inside each step. */}
        {Object.keys(validationErrors).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
            {validationErrors._submit
              ? validationErrors._submit
              : 'Please fix the errors below before continuing.'}
          </div>
        )}

        {currentStep === 1 && (
          <StepClubSelection
            formData={formData}
            handleClubChange={handleClubChange}
            clubs={clubs}
            clubsLoading={clubsLoading}
            validationErrors={validationErrors}
          />
        )}
        {currentStep === 2 && (
          <StepBasicInfo
            formData={formData}
            handleInputChange={handleInputChange}
            selectedClub={clubs.find(c => c.id === formData.clubId)}
            venues={venues}
            venuesLoading={venuesLoading}
            venueQuery={venueQuery}
            currentOrganizerId={user?.organizationId || null}
            validationErrors={validationErrors}
          />
        )}
        {currentStep === 3 && (
          <StepFormat formData={formData} handleNestedChange={handleNestedChange} validationErrors={validationErrors} />
        )}
        {currentStep === 4 && (
          <StepScoring formData={formData} handleNestedChange={handleNestedChange} validationErrors={validationErrors} />
        )}
        {currentStep === 5 && (
          <StepTieBreak formData={formData} handleInputChange={handleInputChange} validationErrors={validationErrors} />
        )}
        {currentStep === 6 && (
          <StepStatsColumns formData={formData} handleInputChange={handleInputChange} validationErrors={validationErrors} />
        )}
        {currentStep === 7 && (
          <>
            <WithdrawalRulesConfig formData={formData} handleNestedChange={handleNestedChange} />
            {/* WithdrawalRulesConfig is read-only from this file's point of
                view; surface any inline errors here, just below it. */}
            {['withdrawalRules.beforeStart','withdrawalRules.duringGroup','withdrawalRules.duringKnockout','withdrawalRules.cancellation']
              .filter((k) => validationErrors[k])
              .map((k) => (
                <p key={k} className="text-red-500 text-sm mt-1">
                  {k.replace('withdrawalRules.', '')}: {validationErrors[k]}
                </p>
              ))}
          </>
        )}
        {currentStep === 8 && (
          <StepScheduling formData={formData} handleInputChange={handleInputChange} validationErrors={validationErrors} />
        )}
        {currentStep === 9 && (
          <StepEntryMethods formData={formData} handleInputChange={handleInputChange} handleNestedChange={handleNestedChange} validationErrors={validationErrors} />
        )}
        {currentStep === 10 && (
          <StepVisibilityAndRegistration formData={formData} handleInputChange={handleInputChange} validationErrors={validationErrors} />
        )}
        {currentStep === 11 && (
          <StepReview formData={formData} clubs={clubs} />
        )}
      </div>

      {venueStepNotice && (
        <div className="px-8 pt-2">
          <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-900">
            <div className="flex items-start justify-between">
              <div>{venueStepNotice}</div>
            </div>
            {venueApprovalState === "pending" && currentStep === 2 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    refreshVenueApproval();
                  }}
                  className="px-4 py-2 bg-white border border-amber-300 rounded-md text-sm font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  🔄 Refresh Approval Status
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="px-6 sm:px-8 py-5 border-t border-gray-100 bg-gray-50/90 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
        <button
          type="button"
          onClick={prevStep}
          className="px-6 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-900 bg-white hover:bg-gray-100 transition-all duration-200 disabled:opacity-50 active:scale-95"
          disabled={currentStep === 1 || isStepNavigating || isPublishing}
        >
          Previous
        </button>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isStepNavigating || isPublishing}
            className="px-6 py-2.5 rounded-xl font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 transition-all duration-200 disabled:opacity-50 active:scale-95"
          >
            Cancel
          </button>
          {currentStep < steps.length ? (
            <button
              type="button"
              onClick={() => nextStep()}
              // Visually disabled when there are validation errors, but still
              // clickable — clicking it re-runs validation so the user can
              // see what's blocking them rather than the button being inert.
              className={`flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all duration-200 active:scale-95 shadow-sm ${
                Object.keys(validationErrors).length > 0 ? 'opacity-50 cursor-not-allowed' : ''
              } disabled:opacity-50`}
              disabled={isStepNavigating || shouldBlockBecauseVenuePending}
            >
              {isStepNavigating ? (
                <>
                  <FaSpinner className="animate-spin" /> Loading...
                </>
              ) : (
                <>
                  Next <FaChevronRight />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all duration-200 disabled:opacity-50 active:scale-95 shadow-sm"
              disabled={loading || isPublishing || (currentStep >= 3 && !canProceedBeyondVenue)}
            >
              {loading || isPublishing ? 'Saving...' : 'Publish Tournament Setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Step Components

function StepBasicInfo({ formData, handleInputChange, selectedClub, venues, venuesLoading, venueQuery, currentOrganizerId, validationErrors = {} }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Tournament Basic Information</h3>
      {selectedClub && (
        <p className="text-gray-600 mb-6">
          Creating tournament for club: <span className="font-semibold text-blue-600">{selectedClub.name}</span>
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Venues *</label>
          <p className="text-xs text-gray-600 mb-3">
            Select one or more venues where this tournament will be held.
          </p>
          <VenueMultiSelect
            venues={venues}
            selectedVenueIds={formData.venueIds || []}
            onChange={(venueIds) => handleInputChange('venueIds', venueIds)}
            venuesLoading={venuesLoading}
            currentOrganizerId={currentOrganizerId}
            allowSingleSelect={false}
            required={true}
          />
          {validationErrors.venueIds && (
            <p className="text-red-500 text-sm mt-1">{validationErrors.venueIds}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Tournament Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="e.g., Summer Slam 2025"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          {validationErrors.name && (
            <p className="text-red-500 text-sm mt-1">{validationErrors.name}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Sport *</label>
          <select
            value={formData.sport}
            onChange={(e) => handleInputChange('sport', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            {selectedClub && normalizeSportTypes(selectedClub.sportTypes).length > 0 ? (
              normalizeSportTypes(selectedClub.sportTypes).map((sport) => (
                <option key={sport} value={String(sport).toLowerCase()}>
                  {String(sport).charAt(0).toUpperCase() + String(sport).slice(1)}
                </option>
              ))
            ) : (
              <>
                <option value="snooker">Snooker</option>
                <option value="pool">Pool</option>
                <option value="poker">Poker</option>
              </>
            )}
          </select>
          <p className="text-xs text-gray-600 mt-1">Must match club's supported sports</p>
        </div>
        {/* Tournament Tier removed — ranking/tier is platform owner controlled. */}
        <div className="md:col-span-2">
          <label className="block text-sm font-semibold text-gray-900 mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Tournament details..."
            rows="3"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Start Date *</label>
          <input
            type="date"
            value={formData.startDate}
            onChange={(e) => handleInputChange('startDate', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          {validationErrors.startDate && (
            <p className="text-red-500 text-sm mt-1">{validationErrors.startDate}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">End Date</label>
          <input
            type="date"
            value={formData.endDate}
            onChange={(e) => handleInputChange('endDate', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Registration Deadline <span className="text-red-600">*</span></label>
          <p className="text-xs text-gray-600 mb-2">🔒 <strong>Players cannot join after this date.</strong> This is a strict deadline for player self-registration and invitations.</p>
          <input
            type="date"
            value={formData.registrationDeadline}
            onChange={(e) => handleInputChange('registrationDeadline', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            required
          />
          {validationErrors.registrationDeadline && (
            <p className="text-red-500 text-sm mt-1">{validationErrors.registrationDeadline}</p>
          )}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <input
              type="checkbox"
              id="allowLateReg"
              checked={formData.allowLateRegistration}
              onChange={(e) => handleInputChange('allowLateRegistration', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded cursor-pointer mt-1"
            />
            <div className="ml-3 flex-1">
              <label htmlFor="allowLateReg" className="text-sm font-semibold text-gray-900 cursor-pointer">
                ✏️ Allow Organizers to Add Late Entries
              </label>
              <p className="text-xs text-gray-700 mt-1">If enabled, you (the organizer) can manually add players even after the registration deadline has passed. Players still cannot self-register after the deadline.</p>
            </div>
          </div>
        </div>
        {formData.allowLateRegistration && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
            <div>
              <label htmlFor="lateDeadline" className="block text-sm font-semibold text-gray-900 mb-2">
                Late Registration Closes On <span className="text-red-600">*</span>
              </label>
              <p className="text-xs text-gray-700 mb-2">Last date you can manually add players to the tournament. Must be after the main registration deadline.</p>
              <input
                id="lateDeadline"
                type="date"
                value={formData.lateRegistrationDeadline}
                onChange={(e) => handleInputChange('lateRegistrationDeadline', e.target.value)}
                className="w-full px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                required
              />
              {validationErrors.lateRegistrationDeadline && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.lateRegistrationDeadline}</p>
              )}
            </div>
            {/*
            <div>
              <label htmlFor="lateMode" className="block text-sm font-semibold text-gray-900 mb-2">
                Late Entry Strategy Mode
              </label>
              <p className="text-xs text-gray-700 mb-2">Controls which fixture strategies are available when you add a late player.</p>
              <select
                id="lateMode"
                value={formData.lateRegistrationMode}
                onChange={(e) => handleInputChange('lateRegistrationMode', e.target.value)}
                className="w-full px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              >
                <option value="allow_with_regeneration">All Strategies (Regenerate, Qualifier, Waitlist, Fill BYE)</option>
                <option value="allow_with_qualifier">Qualifier + Waitlist only</option>
                <option value="allow_with_waitlist">Waitlist only</option>
                <option value="allow_before_fixture">Add before fixtures generated only</option>
              </select>
            </div>
            <div>
              <label htmlFor="maxRegens" className="block text-sm font-semibold text-gray-900 mb-2">
                Max Fixture Regenerations
              </label>
              <p className="text-xs text-gray-700 mb-2">Maximum number of times the bracket can be regenerated for late entries (1–10).</p>
              <input
                id="maxRegens"
                type="number"
                min="1"
                max="10"
                value={formData.maxFixtureRegenerations}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 3));
                  handleInputChange('maxFixtureRegenerations', val);
                }}
                className="w-full px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            </div>
            */}
          </div>
        )}
        {/* <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Game ID</label>
          <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-mono text-sm">
            {formData.gameId ? (
              <span title={formData.gameId}>{formData.gameId.slice(0, 8)}...</span>
            ) : (
              <span className="text-gray-500 italic">Select a sport above to auto-populate</span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1">Auto-populated from sport selection</p>
        </div> */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Max Participants</label>
          <input
            type="number"
            min="1"
            value={formData.maxParticipants}
            onChange={(e) => {
              const val = e.target.value;
              // Allow empty string (unlimited) or only positive integers
              if (val === '' || parseInt(val) >= 1) {
                handleInputChange('maxParticipants', val);
              }
            }}
            placeholder="Leave empty for unlimited"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <p className="text-xs text-gray-600 mt-1">Leave empty for unlimited, or enter a positive number</p>
        </div>
      </div>
    </div>
  );
}

function StepEntryMethods({ formData, handleInputChange, handleNestedChange, validationErrors = {} }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Match Reporting & Entry</h3>
      <p className="text-sm text-gray-600 mb-6">Configure how players can enter and report matches for this tournament.</p>
      {validationErrors.entryMethods && (
        <p className="text-red-500 text-sm mb-3">{validationErrors.entryMethods}</p>
      )}
      <div className="space-y-4">
        {[
          { key: 'selfRegistration', label: 'Self-Registration', desc: 'Players can register themselves' },
          { key: 'invitationLink', label: 'Invitation Links', desc: 'Send personalized invitations to players' },
          { key: 'joinCode', label: 'Join Code', desc: 'Generate shareable code for easy registration' },
          { key: 'adminEntry', label: 'Admin Entry', desc: 'Admin can add players directly' },
          { key: 'openRequestWithApproval', label: 'Open Registration with Approval', desc: 'Players request entry, admin approves' },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-start p-4 border border-gray-300 rounded-lg hover:border-blue-400 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.entryMethods[key]}
              onChange={(e) => handleNestedChange('entryMethods', key, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
            />
            <div className="ml-4">
              <label className="block text-sm font-semibold text-gray-900 cursor-pointer">{label}</label>
              <p className="text-xs text-gray-600 mt-1">{desc}</p>
            </div>
          </div>
        ))}
      </div>
      {/* <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={formData.participantApprovalRequired}
            onChange={(e) => handleInputChange('participantApprovalRequired', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded cursor-pointer"
          />
          <label className="ml-3 text-sm font-semibold text-gray-900 cursor-pointer">Require Admin Approval for All Registrations</label>
        </div>
      </div> */}
    </div>
  );
}

function StepFormat({ formData, handleNestedChange, validationErrors = {} }) {
  // ── Validation State ──────────────────────────────────────────
  const seedingByeValidation = validateSeedingByeCompatibility(
    formData.formatConfig.byesHandling,
    formData.formatConfig.seeding
  );

  const byeHandlingError =
    formData.formatConfig.type === 'knockout' &&
    !formData.formatConfig.byesHandling
      ? 'Bye handling is required'
      : seedingByeValidation.errors.length > 0
      ? seedingByeValidation.errors[0]
      : '';

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Tournament Format</h3>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Format Type</label>
          <select
            value={formData.formatConfig.type}
            onChange={(e) => handleNestedChange('formatConfig', 'type', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="knockout">Knockout</option>
            <option value="round_robin">Round Robin</option>
            <option value="swiss">Swiss</option>
            <option value="groups_knockout">Groups + Knockout</option>
            {/* <option value="ladder">Ladder</option> */}
          </select>
          {validationErrors['formatConfig.type'] && (
            <p className="text-red-500 text-sm mt-1">{validationErrors['formatConfig.type']}</p>
          )}
          <p className="text-xs text-gray-600 mt-1">Choose the tournament structure</p>
        </div>
        {formData.formatConfig.type === 'swiss' && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Number of Swiss rounds</label>
            <input
              type="number"
              min="1"
              max="20"
              value={formData.formatConfig.maxRounds ?? 5}
              onChange={(e) => handleNestedChange('formatConfig', 'maxRounds', parseInt(e.target.value, 10) || 5)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <p className="text-xs text-gray-600 mt-1">Stored on the tournament format and used for stage progression (default 5).</p>
          </div>
        )}
        {!formData.formatConfig.useRoundFormats && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Best of X Frames</label>
            <select
              value={formData.formatConfig.bestOfFrames}
              onChange={(e) =>
                handleNestedChange('formatConfig', 'bestOfFrames', parseInt(e.target.value))
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="1">1</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="7">7</option>
              <option value="9">9</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">Match format (e.g., best of 3 = first to 2 frames)</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Seeding Method</label>
          <select
            value={formData.formatConfig.seeding}
            onChange={(e) => handleNestedChange('formatConfig', 'seeding', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="random">Random</option>
            <option value="ranked">Ranked (by points)</option>
            <option value="manual">Manual</option>
          </select>
          <p className="text-xs text-gray-600 mt-1">How to arrange player positions</p>
        </div>

        {/* ── BYE HANDLING SECTION ────────────────────────────────── */}
        {formData.formatConfig.type === 'knockout' && (
          <div className="space-y-4">
            <div>
              <label
                className={`block text-sm font-semibold mb-2 ${
                  byeHandlingError ? 'text-red-600' : 'text-gray-900'
                }`}
              >
                Bye Handling
                {byeHandlingError && <span className="ml-2">*</span>}
              </label>
              <select
                value={formData.formatConfig.byesHandling}
                onChange={(e) => handleNestedChange('formatConfig', 'byesHandling', e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                  byeHandlingError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'
                }`}
              >
                <option value="">-- Select bye handling --</option>
                {getByeHandlingOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.icon} {option.label}
                  </option>
                ))}
              </select>

              {/* Error Message */}
              {byeHandlingError && (
                <p className="text-xs text-red-600 font-medium mt-1">⚠️ {byeHandlingError}</p>
              )}

              {/* Dynamic Helper Text */}
              {!byeHandlingError && formData.formatConfig.byesHandling && (
                <p className="text-xs text-blue-600 mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                  📊 {formatByeStructureSummary(formData.maxParticipants, formData.formatConfig.byesHandling)}
                </p>
              )}

              {/* Seeding Compatibility Warning */}
              {seedingByeValidation.warnings.length > 0 && (
                <div className="text-xs text-amber-700 mt-2 p-2 bg-amber-50 rounded border border-amber-200">
                  ⚠️ {seedingByeValidation.warnings[0]}
                </div>
              )}
            </div>

            {/* Bracket Preview */}
            {formData.formatConfig.byesHandling && (
              <BracketPreview
                playerCount={formData.maxParticipants}
                byeHandling={formData.formatConfig.byesHandling}
                seeding={formData.formatConfig.seeding}
                className="mt-3"
              />
            )}
          </div>
        )}

        {/* Non-knockout formats: show simple bye handling without validation */}
        {formData.formatConfig.type !== 'knockout' && (
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Byes Handling</label>
            <select
              value={formData.formatConfig.byesHandling}
              onChange={(e) => handleNestedChange('formatConfig', 'byesHandling', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="auto_expand">Auto-expand bracket (power of 2)</option>
              <option value="preliminary_round">Preliminary round</option>
              <option value="random_bye">Random bye distribution</option>
              <option value="top_seeded">Top-seeded byes (best seeds get byes)</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">How to handle unpaired players</p>
          </div>
        )}

        {/* Group Configuration for groups_knockout format */}
        {formData.formatConfig.type === 'groups_knockout' && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Number of Groups</label>
              <input
                type="number"
                min="2"
                max="8"
                value={formData.formatConfig.groupCount || 2}
                onChange={(e) => handleNestedChange('formatConfig', 'groupCount', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-600 mt-1">How many groups to divide players into</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Players per Group</label>
              <input
                type="number"
                min="2"
                max="12"
                value={formData.formatConfig.playersPerGroup || 4}
                onChange={(e) => handleNestedChange('formatConfig', 'playersPerGroup', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-600 mt-1">Target players in each group</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Qualifiers from each Group</label>
              <input
                type="number"
                min="1"
                max="8"
                value={formData.formatConfig.qualifiersPerGroup || 2}
                onChange={(e) => handleNestedChange('formatConfig', 'qualifiersPerGroup', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-600 mt-1">How many top players from each group advance</p>
            </div>
          </>
        )}

        {/* Ladder Configuration */}
        {formData.formatConfig.type === 'ladder' && (
          <>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Challenge Range</label>
              <input
                type="number"
                min="1"
                max="5"
                value={formData.formatConfig.challengeRange || 2}
                onChange={(e) => handleNestedChange('formatConfig', 'challengeRange', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-600 mt-1">How many positions above a player can challenge</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Challenge Cooldown (hours)</label>
              <input
                type="number"
                min="1"
                max="168"
                value={formData.formatConfig.challengeCooldown || 24}
                onChange={(e) => handleNestedChange('formatConfig', 'challengeCooldown', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-600 mt-1">Minimum hours between challenges from the same player</p>
            </div>
          </>
        )}

        {/* Per-round Best-of-X Configuration */}
        {formData.formatConfig.type !== 'ladder' && (
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2">
              <input
                type="checkbox"
                checked={formData.formatConfig.useRoundFormats || false}
                onChange={(e) => handleNestedChange('formatConfig', 'useRoundFormats', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Configure per-round match format
            </label>
            <p className="text-xs text-gray-600 mt-1">
              Set different best-of values per schedule round. Values are stored under &quot;1&quot;, &quot;2&quot;, … and &quot;0&quot;
              for preliminary; the server also honors keys that match each match&apos;s{' '}
              <span className="font-mono text-xs">roundType</span> (e.g. <span className="font-mono text-xs">preliminary</span>,{' '}
              <span className="font-mono text-xs">semi_final</span>).
            </p>
            {formData.formatConfig.useRoundFormats && (
              <div className="mt-3 space-y-2 pl-6 border-l-2 border-blue-200">
                {formData.formatConfig.byesHandling === 'preliminary_round' && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-24">Preliminary:</span>
                    <select
                      value={(formData.formatConfig.roundFormats || {})['0'] || formData.formatConfig.bestOfFrames || 5}
                      onChange={(e) => {
                        const rf = { ...(formData.formatConfig.roundFormats || {}) };
                        rf['0'] = parseInt(e.target.value);
                        handleNestedChange('formatConfig', 'roundFormats', rf);
                      }}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="1">Best of 1</option>
                      <option value="3">Best of 3</option>
                      <option value="5">Best of 5</option>
                      <option value="7">Best of 7</option>
                      <option value="9">Best of 9</option>
                      <option value="11">Best of 11</option>
                    </select>
                  </div>
                )}
                {['Round 1', 'Quarter-final', 'Semi-final', 'Final'].map((label, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-24">{label}:</span>
                    <select
                      value={(formData.formatConfig.roundFormats || {})[String(idx + 1)] || formData.formatConfig.bestOfFrames || 5}
                      onChange={(e) => {
                        const rf = { ...(formData.formatConfig.roundFormats || {}) };
                        rf[String(idx + 1)] = parseInt(e.target.value);
                        handleNestedChange('formatConfig', 'roundFormats', rf);
                      }}
                      className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="1">Best of 1</option>
                      <option value="3">Best of 3</option>
                      <option value="5">Best of 5</option>
                      <option value="7">Best of 7</option>
                      <option value="9">Best of 9</option>
                      <option value="11">Best of 11</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepScoring({ formData, handleNestedChange, validationErrors = {} }) {
  // Validation: Check if all scoring values are zero or any are negative
  const scoringRules = formData.scoringRules;
  const hasNegativeValue =
    (scoringRules.pointsWin ?? 0) < 0 ||
    (scoringRules.pointsDraw ?? 0) < 0 ||
    (scoringRules.pointsLoss ?? 0) < 0 ||
    (scoringRules.pointsWalkover ?? 0) < 0;

  const allValuesZero =
    (scoringRules.pointsWin ?? 0) === 0 &&
    (scoringRules.pointsDraw ?? 0) === 0 &&
    (scoringRules.pointsLoss ?? 0) === 0 &&
    (scoringRules.pointsWalkover ?? 0) === 0;

  const handleScoreChange = (field, value) => {
    const numValue = parseInt(value);
    // Allow only non-negative integers
    if (!isNaN(numValue) && numValue >= 0) {
      handleNestedChange('scoringRules', field, numValue);
    }
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Scoring Rules</h3>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900">Configure how points are awarded in matches</p>
      </div>

      {/* Validation Errors */}
      {(hasNegativeValue || allValuesZero) && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          {hasNegativeValue && (
            <p className="text-sm text-red-700 font-semibold">⚠️ Negative point values are not allowed</p>
          )}
          {allValuesZero && (
            <p className="text-sm text-red-700 font-semibold">⚠️ At least one scoring value must be greater than 0</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Points for Win</label>
          <input
            type="number"
            value={formData.scoringRules.pointsWin}
            onChange={(e) => handleScoreChange('pointsWin', e.target.value)}
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <p className="text-xs text-gray-600 mt-1">Standard victory points</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Points for Draw</label>
          <input
            type="number"
            value={formData.scoringRules.pointsDraw}
            onChange={(e) => handleScoreChange('pointsDraw', e.target.value)}
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <p className="text-xs text-gray-600 mt-1">Tied match points</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Points for Loss</label>
          <input
            type="number"
            value={formData.scoringRules.pointsLoss}
            onChange={(e) => handleScoreChange('pointsLoss', e.target.value)}
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <p className="text-xs text-gray-600 mt-1">Loss points</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Points for Walkover</label>
          <input
            type="number"
            value={formData.scoringRules.pointsWalkover}
            onChange={(e) => handleScoreChange('pointsWalkover', e.target.value)}
            min="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <p className="text-xs text-gray-600 mt-1">Opponent no-show</p>
        </div>
      </div>
      <div className="pt-6 border-t border-gray-200">
        <div className="flex items-start p-4 bg-gray-50 rounded-lg">
          <input
            type="checkbox"
            checked={formData.scoringRules.handicapEnabled}
            onChange={(e) => handleNestedChange('scoringRules', 'handicapEnabled', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-3">
            <label className="text-sm font-semibold text-gray-900 cursor-pointer">Enable Handicap</label>
            <p className="text-xs text-gray-600 mt-1">Allows starting from non-zero scores. Per-match handicap values can be set during match scheduling.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepScheduling({ formData, handleInputChange, validationErrors = {} }) {
  const minDeadlineDate = formData.startDate || '';

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Scheduling Options</h3>
      <div className="space-y-4">
        <div className="flex items-start p-4 border border-gray-300 rounded-lg hover:border-blue-400 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.autoGenerateFixtures}
            onChange={(e) => handleInputChange('autoGenerateFixtures', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-4">
            <label className="block text-sm font-semibold text-gray-900 cursor-pointer">Auto-generate all fixtures</label>
            <p className="text-xs text-gray-600 mt-1">System automatically creates match schedule</p>
          </div>
        </div>
        <div className="flex items-start p-4 border border-gray-300 rounded-lg hover:border-blue-400 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.flexibleScheduling}
            onChange={(e) => handleInputChange('flexibleScheduling', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-4">
            <label className="block text-sm font-semibold text-gray-900 cursor-pointer">Flexible scheduling</label>
            <p className="text-xs text-gray-600 mt-1">Players choose when to play within deadline</p>
          </div>
        </div>
        <div className="flex items-start p-4 border border-gray-300 rounded-lg hover:border-blue-400 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.matchDeadlineEnforcement}
            onChange={(e) => handleInputChange('matchDeadlineEnforcement', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-4">
            <label className="block text-sm font-semibold text-gray-900 cursor-pointer">Enforce match deadlines</label>
            <p className="text-xs text-gray-600 mt-1">Matches must be completed by set dates</p>
          </div>
        </div>
        {formData.matchDeadlineEnforcement && (
          <div className="ml-8 mt-2 p-4 border border-blue-200 bg-blue-50 rounded-lg">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Match Deadline Date
            </label>
            <input
              type="date"
              value={formData.matchDeadlineDate || ''}
              min={minDeadlineDate}
              onChange={(e) => handleInputChange('matchDeadlineDate', e.target.value)}
              className="w-full md:w-80 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 bg-white"
            />
            {validationErrors.matchDeadlineDate && (
              <p className="text-red-500 text-sm mt-1">{validationErrors.matchDeadlineDate}</p>
            )}
            <p className="text-xs text-gray-700 mt-2">
              Players can only book/select times on or before this date when deadline enforcement is enabled.
            </p>
          </div>
        )}
        <div className="flex items-start p-4 border border-gray-300 rounded-lg hover:border-blue-400 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.autoForfeitOverdue}
            onChange={(e) => handleInputChange('autoForfeitOverdue', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-4">
            <label className="block text-sm font-semibold text-gray-900 cursor-pointer">Auto-forfeit overdue matches</label>
            <p className="text-xs text-gray-600 mt-1">Automatically marks past deadline as forfeit</p>
          </div>
        </div>
      </div>
    </div>
  );
}


// RANKING STEP REMOVED — ranking points are platform owner controlled only.
// The component below is intentionally left defined but no longer rendered
// from the wizard step list. Do not re-wire without product/owner approval.
// eslint-disable-next-line no-unused-vars
function StepRanking({ formData, handleInputChange, onRankedChange, goToStep, validateRankingConfig }) {
  const [customPoints, setCustomPoints] = useState(false);
  const [validationState, setValidationState] = useState({
    errors: [],
    warnings: [],
    recommendations: [],
    tierPresets: null,
    recommendedMinimumPlayers: null
  });
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);

  const rankingScope = Array.isArray(formData.rankingScope) ? formData.rankingScope : [];

  // Fetch tier presets and validation when ranked is enabled or tier changes
  useEffect(() => {
    if (formData.ranked && formData.tier && validateRankingConfig) {
      loadTierPresetsAndValidate();
    }
  }, [formData.ranked, formData.tier]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTierPresetsAndValidate = async () => {
    setIsLoadingPresets(true);
    try {
      const result = await validateRankingConfig({
        ranked: formData.ranked,
        tier: formData.tier,
        rankingScope: formData.rankingScope,
        minPlayersForRankingPoints: formData.minPlayersForRankingPoints,
        rankingPointsPerRound: formData.rankingPointsPerRound
      });

      if (result.success) {
        setValidationState({
          errors: result.errors || [],
          warnings: result.warnings || [],
          recommendations: result.recommendations || [],
          tierPresets: result.tierPresets,
          recommendedMinimumPlayers: result.recommendedMinimumPlayers
        });

        // Auto-populate with tier presets if points are still at defaults or empty
        if (result.tierPresets && shouldAutoPopulatePoints(formData.rankingPointsPerRound)) {
          handleInputChange('rankingPointsPerRound', result.tierPresets);
        }
      }
    } catch (error) {
      console.error('Failed to load tier presets:', error);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  // Check if current points match default values (100/60/30/15) - if so, auto-populate with tier presets
  const shouldAutoPopulatePoints = (points) => {
    if (!points) return true;
    const isDefaults =
      points.winner === 100 &&
      points.runnerUp === 60 &&
      points.semi === 30 &&
      points.quarter === 15;
    return isDefaults;
  };

  const handleResetToTierDefaults = () => {
    if (validationState.tierPresets) {
      handleInputChange('rankingPointsPerRound', validationState.tierPresets);
      setCustomPoints(true); // Show the points section so user can see the reset
    }
  };

  const getTierScopeHint = (scope) => {
    const tier = formData.tier;
    const hints = {
      local: {
        county: '✓ Recommended for Local tournaments',
        regional: '⚠️ Unusual for Local tournaments',
        national: '⚠️ Not recommended for Local tournaments'
      },
      county: {
        county: '✓ Recommended for County tournaments',
        regional: '✓ Recommended for County tournaments',
        national: '• Allowed for County tournaments'
      },
      regional: {
        county: '• Allowed for Regional tournaments',
        regional: '✓ Recommended for Regional tournaments',
        national: '✓ Recommended for Regional tournaments'
      },
      national: {
        county: '⚠️ Unusual for National tournaments',
        regional: '• Allowed for National tournaments',
        national: '✓ Recommended for National tournaments'
      }
    };
    return hints[tier]?.[scope] || '';
  };

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Ranking System</h3>
      <div className="flex items-start p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
        <input
          id="wizard-ranked-tournament"
          type="checkbox"
          checked={Boolean(formData.ranked)}
          onChange={(e) => onRankedChange(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
        />
        <div className="ml-3">
          <label htmlFor="wizard-ranked-tournament" className="text-sm font-semibold text-gray-900 cursor-pointer">
            Is this a ranked tournament?
          </label>
          <p className="text-xs text-gray-600 mt-1">Ranked tournaments contribute to player statistics and rankings</p>
        </div>
      </div>
      {formData.ranked && (
        <div className="space-y-6">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-900">
                  <strong>Tier:</strong> {formData.tier.charAt(0).toUpperCase() + formData.tier.slice(1)}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Tournament tier affects default ranking point values
                </p>
              </div>
              {goToStep && (
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Change in Step 2
                </button>
              )}
            </div>
            {isLoadingPresets && (
              <p className="text-xs text-blue-600 mt-2">Loading tier presets...</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Minimum Players for Ranking Points
            </label>
            <input
              type="number"
              min="2"
              value={formData.minPlayersForRankingPoints}
              onChange={(e) => handleInputChange('minPlayersForRankingPoints', parseInt(e.target.value) || 2)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <p className="text-xs text-gray-600 mt-1">
              Minimum participants to award ranking points
            </p>
            {validationState.recommendedMinimumPlayers && (
              <p className="text-xs text-blue-600 mt-1">
                💡 Recommended minimum for {formData.tier} tournaments: {validationState.recommendedMinimumPlayers} players
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Ranking Scope (select all that apply)
            </label>
            <div className="space-y-3">
              {['county', 'regional', 'national'].map((scope) => {
                const hint = getTierScopeHint(scope);
                return (
                  <div key={scope}>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={rankingScope.includes(scope)}
                        onChange={(e) => {
                          const newScope = e.target.checked
                            ? [...rankingScope, scope]
                            : rankingScope.filter((s) => s !== scope);
                          handleInputChange('rankingScope', newScope);
                        }}
                        className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                      />
                      <label className="ml-3 text-sm font-medium text-gray-700 cursor-pointer">
                        {scope.charAt(0).toUpperCase() + scope.slice(1)}
                      </label>
                    </div>
                    {hint && (
                      <p className="text-xs text-gray-500 ml-7 mt-1">{hint}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-600 mt-3">Geographic scope of rating impact</p>
            {validationState.errors.some(e => e.includes('ranking scope')) && (
              <p className="text-xs text-red-600 mt-2">
                ⚠️ At least one ranking scope must be selected
              </p>
            )}
          </div>

          {/* Custom point awards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-900">
                <input
                  type="checkbox"
                  checked={customPoints}
                  onChange={(e) => setCustomPoints(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Customize point awards
              </label>
              {validationState.tierPresets && customPoints && (
                <button
                  type="button"
                  onClick={handleResetToTierDefaults}
                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Reset to tier defaults
                </button>
              )}
            </div>
            {customPoints && (
              <div className="mt-3 space-y-2 pl-6 border-l-2 border-blue-200">
                {[
                  ['winner',   '1st place (Winner)'],
                  ['runnerUp', '2nd place (Runner-up)'],
                  ['semi',     '3rd–4th (Semi-final)'],
                  ['quarter',  '5th–8th (Quarter-final)'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-48">{label}:</span>
                    <input
                      type="number"
                      min="0"
                      value={formData.rankingPointsPerRound?.[key] ?? ''}
                      onChange={(e) => {
                        const rp = { ...(formData.rankingPointsPerRound || {}) };
                        rp[key] = parseInt(e.target.value) || 0;
                        handleInputChange('rankingPointsPerRound', rp);
                      }}
                      className="w-24 px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
                {validationState.tierPresets && (
                  <div className="mt-3 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
                    <p className="font-semibold text-gray-700 mb-1">
                      Tier defaults for {formData.tier}:
                    </p>
                    <p className="text-gray-600">
                      Winner: {validationState.tierPresets.winner},
                      Runner-up: {validationState.tierPresets.runnerUp},
                      Semi: {validationState.tierPresets.semi},
                      Quarter: {validationState.tierPresets.quarter}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Display warnings and recommendations */}
          {validationState.warnings.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-semibold text-yellow-900 mb-1">⚠️ Warnings:</p>
              {validationState.warnings.map((warning, idx) => (
                <p key={idx} className="text-xs text-yellow-800 ml-4">• {warning}</p>
              ))}
            </div>
          )}

          {validationState.recommendations.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-semibold text-blue-900 mb-1">💡 Recommendations:</p>
              {validationState.recommendations.map((rec, idx) => (
                <p key={idx} className="text-xs text-blue-800 ml-4">• {rec}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Replaced by StepVisibilityAndRegistration — kept for git history; not rendered.
// eslint-disable-next-line no-unused-vars
function StepPrivacy({ formData, handleInputChange }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Privacy & Visibility</h3>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Tournament Visibility</label>
          <select
            value={formData.visibility}
            onChange={(e) => handleInputChange('visibility', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="public">Public - Anyone can view</option>
            <option value="private">Private - Invite only</option>
          </select>
          <p className="text-xs text-gray-600 mt-1">Who can see this tournament</p>
        </div>
        <div className="flex items-start p-4 bg-gray-50 border border-gray-300 rounded-lg">
          <input
            type="checkbox"
            checked={formData.publicStats}
            onChange={(e) => handleInputChange('publicStats', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-3">
            <label className="text-sm font-semibold text-gray-900 cursor-pointer">Make player statistics publicly visible</label>
            <p className="text-xs text-gray-600 mt-1">Allow public access to player stats (wins, losses, averages)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Replaced by StepVisibilityAndRegistration — kept for git history; not rendered.
// eslint-disable-next-line no-unused-vars
function StepFees({ formData, handleInputChange }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Entry Fees</h3>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900">Leave empty for free tournament</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Currency</label>
          <select
            value={formData.feeCurrency}
            onChange={(e) => handleInputChange('feeCurrency', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="GBP">£ GBP</option>
            <option value="EUR">€ EUR</option>
            <option value="USD">$ USD</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Entry Fee Amount</label>
          <input
            type="number"
            step="0.01"
            value={formData.entryFee}
            onChange={(e) => handleInputChange('entryFee', e.target.value)}
            placeholder="e.g., 25.00"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>
      <p className="text-xs text-gray-600 mt-3">Per player registration cost</p>
    </div>
  );
}

function StepReview({ formData }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Review Tournament Details</h3>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Basic Information</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Tournament Name:</dt>
              <dd className="font-semibold text-gray-900">{formData.name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Sport:</dt>
              <dd className="font-semibold text-gray-900">{formData.sport || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Dates:</dt>
              <dd className="font-semibold text-gray-900">{formData.startDate} to {formData.endDate || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Max Participants:</dt>
              <dd className="font-semibold text-gray-900">{formData.maxParticipants ? parseInt(formData.maxParticipants) : '∞'}</dd>
            </div>
          </dl>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Format & Scoring</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Tournament Format:</dt>
              <dd className="font-semibold text-gray-900">{formData.formatConfig.type.replace('_', ' ') || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Best of:</dt>
              <dd className="font-semibold text-gray-900">{formData.formatConfig.bestOfFrames} Frames</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Seeding:</dt>
              <dd className="font-semibold text-gray-900">{formData.formatConfig.seeding || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Match Deadline:</dt>
              <dd className="font-semibold text-gray-900">
                {formData.matchDeadlineEnforcement
                  ? (formData.matchDeadlineDate || 'Enabled (no date selected)')
                  : 'Not enforced'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Points for Win:</dt>
              <dd className="font-semibold text-gray-900">{formData.scoringRules.pointsWin}</dd>
            </div>
          </dl>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Additional Settings</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Visibility:</dt>
              <dd className="font-semibold text-gray-900">{formData.visibility || '—'}</dd>
            </div>
            {formData.entryFee && (
              <div className="flex justify-between">
                <dt className="text-gray-600">Entry Fee:</dt>
                <dd className="font-semibold text-gray-900">{formData.feeCurrency} {formData.entryFee}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-600">Tie-Break Order:</dt>
              <dd className="font-semibold text-gray-900 text-right max-w-[60%]">
                {Array.isArray(formData.tieBreakOrder) && formData.tieBreakOrder.length > 0
                  ? formData.tieBreakOrder.map((k) => TIE_BREAK_LABEL[k] || k).join(' → ')
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Stats Columns:</dt>
              <dd className="font-semibold text-gray-900 text-right max-w-[60%]">
                {Array.isArray(formData.statsColumns) && formData.statsColumns.length > 0
                  ? `${formData.statsColumns.length} selected`
                  : 'None'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-900">
          Please review all details. Once you click "Create Tournament", this cannot be undone. All settings can be modified later in tournament settings.
        </p>
      </div>
    </div>
  );
}

/**
 * Step 1: Club Selection - Mandatory step where user selects the club to create tournament under
 * Clubs are parent entities - tournaments must belong to a club
 */
function StepClubSelection({ formData, handleClubChange, clubs, clubsLoading, validationErrors = {} }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Select Your Club</h3>
      <p className="text-gray-600 mb-6">A tournament must be created under a specific club. This is the parent entity that hosts the tournament.</p>
      {validationErrors.clubId && (
        <p className="text-red-500 text-sm mb-3">{validationErrors.clubId}</p>
      )}

      {clubsLoading ? (
        <div className="flex items-center justify-center py-12">
          <FaSpinner className="animate-spin text-blue-600 text-3xl mr-3" />
          <span className="text-lg text-gray-900">Loading your clubs...</span>
        </div>
      ) : clubs.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h4 className="text-sm font-semibold text-yellow-900 mb-2">No Clubs Found</h4>
          <p className="text-sm text-yellow-800 mb-4">
            You don't have any clubs yet. Before creating a tournament, you need to be a member of a club.
          </p>
          <p className="text-sm text-yellow-800">
            Please ask a club administrator to add you to their club, or create a new club first.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => handleClubChange(club.id)}
              className={`p-6 rounded-lg border-2 transition text-left ${
                formData.clubId === club.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              {/* Club Logo or Icon */}
              <div className="flex items-center mb-4">
                {club.logoUrl ? (
                  <img src={club.logoUrl} alt={club.name} className="w-12 h-12 rounded-lg object-cover mr-4" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center mr-4">
                    <span className="text-xl">🏢</span>
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900">{club.name}</h4>
                  {club.status && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                      club.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {club.status.charAt(0).toUpperCase() + club.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Club Details */}
              <div className="space-y-2 mb-4">
                {normalizeSportTypes(club.sportTypes).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Sports:</p>
                    <p className="text-sm text-gray-900">{normalizeSportTypes(club.sportTypes).join(', ')}</p>
                  </div>
                )}
                {club.address && (
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Location:</p>
                    <p className="text-sm text-gray-900 truncate">{club.address}</p>
                  </div>
                )}
                {club.memberCount && (
                  <div>
                    <p className="text-xs text-gray-600 font-semibold">Members:</p>
                    <p className="text-sm text-gray-900">{club.memberCount}</p>
                  </div>
                )}
              </div>

              {/* Selection Indicator */}
              {formData.clubId === club.id && (
                <div className="flex items-center justify-between pt-4 border-t border-blue-200">
                  <span className="text-sm font-semibold text-blue-600">✓ Selected</span>
                  <span className="text-blue-600">→</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {clubs.length > 0 && !formData.clubId && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Next:</strong> After selecting your club, all tournaments and matches will be organized under it along with the club's default venue information.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Step 5: Tie-Break Rules
 * Drag-and-drop priority list. Replicates the drag pattern used in
 * ManualSeedingAssignment.jsx (HTML5 draggable + onDragStart / onDragOver /
 * onDrop), kept local so we don't take a library dependency.
 */
function StepTieBreak({ formData, handleInputChange, validationErrors = {} }) {
  const order = Array.isArray(formData.tieBreakOrder) && formData.tieBreakOrder.length > 0
    ? formData.tieBreakOrder
    : [...DEFAULT_TIE_BREAK_ORDER];
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (index) => () => setDraggedIndex(index);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (index) => () => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    handleInputChange('tieBreakOrder', next);
    setDraggedIndex(null);
  };
  const removeRule = (key) => () => {
    handleInputChange('tieBreakOrder', order.filter((k) => k !== key));
  };
  const resetToDefault = () => handleInputChange('tieBreakOrder', [...DEFAULT_TIE_BREAK_ORDER]);

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Tie-Break Rules</h3>
      <p className="text-sm text-gray-600 mb-4">
        Drag rules to set their priority. The first rule is applied first when two players are tied; ties not broken by it fall through to the next rule.
      </p>
      {validationErrors.tieBreakOrder && (
        <p className="text-red-500 text-sm mb-3">{validationErrors.tieBreakOrder}</p>
      )}
      <ul className="space-y-2 max-w-xl">
        {order.map((key, index) => (
          <li
            key={key}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(index)}
            className={`flex items-center justify-between p-3 bg-white border border-gray-300 rounded-lg cursor-move transition ${
              draggedIndex === index ? 'opacity-50 bg-gray-100' : 'hover:border-blue-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-gray-900">{TIE_BREAK_LABEL[key] || key}</span>
            </div>
            <button
              type="button"
              onClick={removeRule(key)}
              className="text-xs font-semibold text-red-600 hover:text-red-800"
              aria-label={`Remove ${TIE_BREAK_LABEL[key] || key}`}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {order.length < DEFAULT_TIE_BREAK_ORDER.length && (
        <button
          type="button"
          onClick={resetToDefault}
          className="mt-4 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
        >
          Restore default order (all 7 rules)
        </button>
      )}
    </div>
  );
}

/**
 * Step 6: Stats Columns
 * Toggle which stats appear in the standings table. The visible set depends
 * on the chosen sport. Defaults to "all enabled".
 */
function StepStatsColumns({ formData, handleInputChange, validationErrors = {} }) {
  const sport = formData.sport;
  const available = getStatsColumnsForSport(sport);
  const selected = new Set(Array.isArray(formData.statsColumns) ? formData.statsColumns : []);

  const toggle = (key) => () => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    handleInputChange('statsColumns', Array.from(next));
  };
  const enableAll  = () => handleInputChange('statsColumns', available.map((c) => c.key));
  const disableAll = () => handleInputChange('statsColumns', []);

  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Stats Columns</h3>
      <p className="text-sm text-gray-600 mb-4">
        Choose which columns appear in the standings table for this tournament. Defaults reflect the sport selected in Basic Info.
      </p>
      {validationErrors.statsColumns && (
        <p className="text-red-500 text-sm mb-3">{validationErrors.statsColumns}</p>
      )}
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={enableAll}  className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Enable all</button>
        <button type="button" onClick={disableAll} className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100">Disable all</button>
        <span className="ml-auto self-center text-xs text-gray-500">
          {selected.size} selected — minimum 3
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {available.map((col) => {
          const checked = selected.has(col.key);
          return (
            <label
              key={col.key}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                checked ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={toggle(col.key)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm font-medium text-gray-900">{col.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Step 10: Visibility & Registration
 * Merged ex-Step 9 (Privacy) and ex-Step 10 (Fees). State keys are unchanged
 * so the payload contract for the backend is unaffected.
 */
function StepVisibilityAndRegistration({ formData, handleInputChange, validationErrors = {} }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-gray-900 mb-6">Visibility & Registration</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">Tournament Visibility</label>
          <select
            value={formData.visibility}
            onChange={(e) => handleInputChange('visibility', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          >
            <option value="public">Public - Anyone can view</option>
            <option value="private">Private - Invite only</option>
          </select>
          <p className="text-xs text-gray-600 mt-1">Who can see this tournament</p>
        </div>

        <div className="flex items-start p-4 bg-gray-50 border border-gray-300 rounded-lg">
          <input
            type="checkbox"
            checked={formData.publicStats}
            onChange={(e) => handleInputChange('publicStats', e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded mt-1 cursor-pointer"
          />
          <div className="ml-3">
            <label className="text-sm font-semibold text-gray-900 cursor-pointer">Make player statistics publicly visible</label>
            <p className="text-xs text-gray-600 mt-1">Allow public access to player stats (wins, losses, averages)</p>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Entry Fee</h4>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
            Leave the amount empty for a free tournament.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Currency</label>
              <select
                value={formData.feeCurrency}
                onChange={(e) => handleInputChange('feeCurrency', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="GBP">£ GBP</option>
                <option value="EUR">€ EUR</option>
                <option value="USD">$ USD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Entry Fee Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.entryFee}
                onChange={(e) => handleInputChange('entryFee', e.target.value)}
                placeholder="e.g., 25.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              {validationErrors.entryFee && (
                <p className="text-red-500 text-sm mt-1">{validationErrors.entryFee}</p>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3">Per-player registration cost</p>
        </div>
      </div>
    </div>
  );
}
