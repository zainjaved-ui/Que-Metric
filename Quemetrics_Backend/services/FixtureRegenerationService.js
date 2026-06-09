// services/FixtureRegenerationService.js
const {
  Tournament,
  TournamentParticipant,
  TournamentMatch,
  TournamentRound,
  TournamentFormat,
  TournamentScoringRules,
  TournamentFixtureRegeneration,
  TournamentGroup,
  AuditLog,
  Player,
  Fixture,
} = require("../models");
const { BracketGenerator } = require("../controllers/tournamentManager");
const NotificationService = require("./NotificationService");
const sequelize = require("../config/db");
const { Op } = require('sequelize');

const VALID_LATE_REGISTRATION_MODES = new Set([
  'disabled',
  'allow_before_fixture',
  'allow_with_regeneration',
  'allow_with_qualifier',
  'allow_with_waitlist',
]);

/**
 * FixtureRegenerationService
 *
 * Handles intelligent fixture regeneration for late tournament entries.
 * Supports all tournament formats with format-specific logic.
 * Maintains transaction safety and audit trails.
 */
class FixtureRegenerationService {
  static isPowerOfTwo(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && (number & (number - 1)) === 0;
  }

  static toBoolean(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  static endOfDayUTC(input) {
    const d = input instanceof Date ? input : new Date(input);
    if (!d || Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  }

  /**
   * Backward compatibility:
   * - if allowLateRegistration=true but mode is missing/disabled, treat as allow_with_regeneration.
   */
  static getEffectiveLateRegistrationMode(tournament) {
    const allowLateRegistration = this.toBoolean(tournament?.allowLateRegistration);
    if (!allowLateRegistration) return 'disabled';

    const rawMode = String(tournament?.lateRegistrationMode || '').trim();
    if (!VALID_LATE_REGISTRATION_MODES.has(rawMode) || rawMode === 'disabled') {
      return 'allow_with_regeneration';
    }
    return rawMode;
  }

  static getAllowedStrategiesByMode(mode) {
    const map = {
      disabled: [],
      allow_before_fixture: ['regenerate'],
      allow_with_regeneration: ['regenerate', 'qualifier', 'waitlist', 'fill_bye'],
      allow_with_qualifier: ['qualifier', 'waitlist'],
      allow_with_waitlist: ['waitlist'],
    };
    return map[mode] || [];
  }

  static getLateEntryDeadlineEndUTC(tournament) {
    const deadlineBase = tournament?.lateRegistrationDeadline || tournament?.startDate || tournament?.registrationDeadline;
    return this.endOfDayUTC(deadlineBase);
  }

  static validateLateEntryPolicy(tournament, strategy, options = {}) {
    const now = options.now || new Date();
    const fixturesExist = options.fixturesExist;
    const mode = this.getEffectiveLateRegistrationMode(tournament);
    const allowedStrategies = this.getAllowedStrategiesByMode(mode);

    if (mode === 'disabled') {
      return {
        canAdd: false,
        reason: 'LATE_REGISTRATION_DISABLED',
        message: 'Late registration is disabled for this tournament.',
        mode,
        allowedStrategies,
      };
    }

    const lateDeadlineEnd = this.getLateEntryDeadlineEndUTC(tournament);
    if (!lateDeadlineEnd || now.getTime() > lateDeadlineEnd.getTime()) {
      return {
        canAdd: false,
        reason: 'LATE_DEADLINE_PASSED',
        message: lateDeadlineEnd
          ? `Late registration deadline passed on ${lateDeadlineEnd.toLocaleDateString()}`
          : 'Late registration deadline has passed.',
        mode,
        allowedStrategies,
      };
    }

    if (tournament.fixtureRegenerationCount >= tournament.maxFixtureRegenerations) {
      return {
        canAdd: false,
        reason: 'REGENERATION_LIMIT_EXCEEDED',
        message: `Maximum bracket regenerations (${tournament.maxFixtureRegenerations}) reached`,
        mode,
        allowedStrategies,
      };
    }

    if (mode === 'allow_before_fixture') {
      const started = ['fixtures_generated', 'in_progress', 'completed'].includes(String(tournament.status || ''));
      const hasFixtures = typeof fixturesExist === 'boolean' ? fixturesExist : false;
      if (started || hasFixtures) {
        return {
          canAdd: false,
          reason: 'LATE_ENTRY_MODE_BEFORE_FIXTURE_ONLY',
          message: 'Late entry mode allows additions only before fixtures are generated.',
          mode,
          allowedStrategies,
        };
      }
    }

    if (strategy && !allowedStrategies.includes(strategy)) {
      return {
        canAdd: false,
        reason: 'LATE_ENTRY_STRATEGY_NOT_ALLOWED',
        message: `Strategy "${strategy}" is not allowed for late registration mode "${mode}".`,
        mode,
        allowedStrategies,
      };
    }

    return {
      canAdd: true,
      reason: 'OK',
      message: 'Late entry is allowed.',
      mode,
      allowedStrategies,
    };
  }

  /** Map UI alias to DB-safe reseed enum (tournament_fixture_regenerations.reseedStrategy). */
  static normalizeReseedStrategy(reseedStrategy) {
    const s = reseedStrategy || 'random';
    if (s === 'lower_priority') return 'prioritize_existing';
    if (s === 'random' || s === 'ranked' || s === 'prioritize_existing') return s;
    return 'random';
  }

  /**
   * Main method: Add late player with strategy
   *
   * @param {Object} params - {tournamentId, playerId, strategy, reseedStrategy, userId}
   * @returns {Object} - {success, action, details, regenerationId}
   */
  static async addLatePlayerWithStrategy(params) {
    const { tournamentId, playerId, strategy, userId } = params;
    const reseedStrategy = FixtureRegenerationService.normalizeReseedStrategy(params.reseedStrategy);

    try {
      // ===== STEP 1: Validate tournament state =====
      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament) {
        throw new Error('Tournament not found');
      }

      const fixturesExist = (await TournamentMatch.count({ where: { tournamentId } })) > 0;
      const validationState = this.validateCanAddLatePlayer(tournament, strategy, { fixturesExist });
      if (!validationState.canAdd) {
        return {
          success: false,
          reason: validationState.reason,
          message: validationState.message,
        };
      }

      // ===== STEP 2: Check player not already registered =====
      const existing = await TournamentParticipant.findOne({
        where: { tournamentId, playerId },
      });
      if (existing) {
        throw new Error('Player already registered for this tournament');
      }

      // ===== STEP 3: Decide what to do based on tournament state =====

      // If fixtures exist and user requested full regeneration, check if regeneration is possible
      let actualStrategy = strategy;
      if (fixturesExist && strategy === 'regenerate') {
        // Any match not in 'scheduled' state is considered played/started
        const nonScheduledCount = await TournamentMatch.count({
          where: {
            tournamentId,
            status: { [Op.ne]: 'scheduled' }
          }
        });

        if (nonScheduledCount > 0) {
          // Regeneration not possible - auto-fallback to alternative strategies
          // Try: fill_bye → qualifier → waitlist
          console.log(`[Late Entry] Regenerate not possible (${nonScheduledCount} matches played). Attempting auto-fallback...`);
          actualStrategy = 'fill_bye'; // Try fill_bye first
        }
      }

      if (fixturesExist && actualStrategy === 'qualifier') {
        const [format, approvedCount] = await Promise.all([
          TournamentFormat.findOne({ where: { tournamentId } }),
          TournamentParticipant.count({ where: { tournamentId, status: 'approved' } }),
        ]);

        if (
          format?.type === 'knockout' &&
          this.isPowerOfTwo(approvedCount + 1)
        ) {
          throw new Error(
            `Qualifier is not available when late entry makes the bracket a full field (${approvedCount + 1} players). Use fill_bye or regenerate instead.`
          );
        }
      }

      // ===== STEP 4: Add player with late registration flags =====
      // Organizer late-entry API: always approve so bracket ops see the player immediately.
      const participant = await TournamentParticipant.create({
        tournamentId,
        playerId,
        registrationMethod: 'admin',
        status: 'approved',
        approvedDate: new Date(),
        registrationDate: new Date(),
        registeredLate: true,
        registrationPhase: actualStrategy === 'qualifier' ? 'qualifier' : (actualStrategy === 'waitlist' ? 'waitlist' : 'late'),
      });

      if (!fixturesExist) {
        // No fixtures yet - just add and wait for generation
        await tournament.increment('currentParticipantCount');
        await AuditLog.create({
          action: 'late_player_added_before_fixtures',
          entityType: 'tournament_participant',
          entityId: participant.id,
          userId,
          notes: `Late player added (before fixtures). Will be included in next generation.`,
        });

        return {
          success: true,
          action: 'QUEUED_FOR_GENERATION',
          details: {
            message: 'Player added. Will be included when fixtures are generated.',
            participantId: participant.id,
          },
        };
      }

      // Fixtures exist - handle based on strategy with auto-fallback
      if (actualStrategy === 'regenerate') {
        return await this.regenerateBracketForLateEntry(
          tournamentId,
          participant,
          reseedStrategy,
          userId,
          tournament
        );
      } else if (actualStrategy === 'fill_bye') {
        try {
          return await this.fillExistingBYE(
            tournamentId,
            participant,
            userId,
            tournament
          );
        } catch (byeError) {
          console.log('[Late Entry] fill_bye failed:', byeError?.message || byeError);
          const nonScheduledCount = await TournamentMatch.count({
            where: {
              tournamentId,
              status: { [Op.ne]: 'scheduled' },
            },
          });
          if (nonScheduledCount === 0) {
            console.log('[Late Entry] fill_bye → full regenerate (all matches still scheduled)');
            return await this.regenerateBracketForLateEntry(
              tournamentId,
              participant,
              reseedStrategy,
              userId,
              tournament,
              { regenerationStrategyLabel: 'fill_bye', forcedByesHandling: null }
            );
          }
          console.log('[Late Entry] fill_bye → qualifier fallback (some matches started)');
          actualStrategy = 'qualifier';
        }
      }

      if (actualStrategy === 'qualifier') {
        const format = await TournamentFormat.findOne({ where: { tournamentId } });
        if (format && format.type === 'knockout') {
          return await this.regenerateBracketForLateEntry(
            tournamentId,
            participant,
            reseedStrategy,
            userId,
            tournament,
            { regenerationStrategyLabel: 'qualifier', forcedByesHandling: 'preliminary_round' }
          );
        }
        return await this.regenerateBracketForLateEntry(
          tournamentId,
          participant,
          reseedStrategy,
          userId,
          tournament,
          { regenerationStrategyLabel: 'qualifier', forcedByesHandling: null }
        );
      } else if (actualStrategy === 'waitlist') {
        return await this.addToWaitlist(
          tournamentId,
          participant,
          userId,
          tournament
        );
      }

      throw new Error(`Unknown strategy: ${actualStrategy}`);
    } catch (error) {
      console.error('Error in addLatePlayerWithStrategy:', error);
      throw error;
    }
  }

  /**
   * Validate if late player can be added
   */
  static validateCanAddLatePlayer(tournament, strategy, options = {}) {
    const policy = this.validateLateEntryPolicy(tournament, strategy, options);
    if (!policy.canAdd) return policy;

    // Check if tournament started (any match completed)
    if (tournament.status === 'in_progress' || tournament.status === 'completed') {
      if (strategy === 'regenerate') {
        return {
          canAdd: false,
          reason: 'REGENERATE_NOT_ALLOWED_AFTER_START',
          message: 'Regenerate is not allowed after tournament start. Use qualifier, fill_bye, or waitlist.',
          mode: policy.mode,
          allowedStrategies: policy.allowedStrategies,
        };
      }

      return {
        canAdd: true,
        requiresSpecialHandling: true,
        reason: 'TOURNAMENT_STARTED',
        message: 'Tournament has started. Regenerate is blocked; use qualifier, fill_bye, or waitlist.',
        mode: policy.mode,
        allowedStrategies: policy.allowedStrategies,
      };
    }

    return policy;
  }

  /**
   * Regenerate bracket for late entry
   */
  static async regenerateBracketForLateEntry(tournamentId, newParticipant, reseedStrategy, userId, tournament, options = {}) {
    const regenerationStrategyLabel = options.regenerationStrategyLabel || 'regenerate';
    const forcedByesHandling = options.forcedByesHandling != null ? options.forcedByesHandling : null;
    const transaction = await sequelize.transaction();

    try {
      // ===== Get current state =====
      const format = await TournamentFormat.findOne({ where: { tournamentId } });
      const oldMatches = await TournamentMatch.findAll({ where: { tournamentId } });
      const allParticipants = await TournamentParticipant.findAll({
        where: { tournamentId, status: 'approved' },
      });

      const oldMatchCount = oldMatches.length;
      const oldParticipantCount = allParticipants.length - 1; // Subtract the newly added
      const newParticipantCount = allParticipants.length;

      // ===== Validate can regenerate =====
      const canRegenerate = oldMatches.every(m => m.status === 'scheduled');
      if (!canRegenerate) {
        throw new Error('Cannot regenerate: Some matches have already been played');
      }

      // ===== Delete old brackets (archive for audit trail) =====
      const oldRounds = await TournamentRound.findAll({ where: { tournamentId } });
      const oldRoundIds = oldRounds.map(r => r.id);
      const oldMatchIds = oldMatches.map(m => m.id);

      await TournamentRound.destroy({ where: { tournamentId }, transaction });
      await TournamentMatch.destroy({ where: { tournamentId }, transaction });

      // ===== Re-seed all participants including late player =====
      const seededParticipants = this.reseedParticipants(allParticipants, reseedStrategy, newParticipant.id);

      // Update seeds in database
      for (const [index, participant] of seededParticipants.entries()) {
        await participant.update({ seed: index + 1 }, { transaction });
      }

      // ===== Generate new fixtures based on format =====
      let newMatches = [];
      let newRounds = [];
      const seededPlayerIds = seededParticipants.map(p => p.playerId).filter(Boolean);

      if (format.type === 'knockout') {
        const result = await this.generateKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          transaction,
          { forcedByesHandling }
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === 'round_robin') {
        const result = await this.generateRoundRobinBracket(
          seededPlayerIds,
          tournamentId,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === 'groups_knockout') {
        const result = await this.generateGroupsKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === 'swiss') {
        const result = await this.generateSwissBracket(
          seededParticipants,
          tournamentId,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      }

      // ===== Track regeneration in audit model =====
      const regenerationRound = tournament.fixtureRegenerationCount + 1;
      const regenStrategyEnum =
        regenerationStrategyLabel === 'qualifier'
          ? 'qualifier'
          : regenerationStrategyLabel === 'fill_bye'
            ? 'fill_bye'
            : 'regenerate';

      await TournamentFixtureRegeneration.create(
        {
          tournamentId,
          generationRound: regenerationRound,
          strategy: regenStrategyEnum,
          oldMatchCount,
          newMatchCount: newMatches.length,
          oldParticipantCount,
          newParticipantCount,
          newPlayerIds: [newParticipant.id],
          deletedMatchIds: oldMatchIds,
          deletedRoundIds: oldRoundIds,
          createdMatches: newMatches.map(m => m.id),
          createdRounds: newRounds.map(r => r.id),
          triggeredBy: userId,
          reseedStrategy,
          affectedPlayerCount: oldParticipantCount, // All affected due to potential new opponents
          status: 'success',
        },
        { transaction }
      );

      // ===== Update tournament metadata =====
      await tournament.update(
        {
          fixtureRegenerationCount: regenerationRound,
          lastFixtureRegenerationAt: new Date(),
          pendingLatePlayerCount: 0,
          currentParticipantCount: newParticipantCount,
        },
        { transaction }
      );

      // ===== Log action =====
      await AuditLog.create(
        {
          action: 'bracket_regenerated_for_late_entry',
          entityType: 'tournament',
          entityId: tournamentId,
          userId,
          notes: `Bracket regenerated for late entry. Old: ${oldParticipantCount} players (${oldMatchCount} matches) → New: ${newParticipantCount} players (${newMatches.length} matches)`,
        },
        { transaction }
      );

      await transaction.commit();

      // ===== Send notifications =====
      const newPlayer = await Player.findByPk(newParticipant.playerId);
      const newPlayerName = newPlayer?.displayName || newPlayer?.name || 'New Player';

      try {
        await NotificationService.notifyBracketRegenerated({
          tournamentId,
          oldMatchCount,
          newMatchCount: newMatches.length,
          affectedPlayerCount: oldParticipantCount,
          userId,
          reseedStrategy,
        });
      } catch (notificationError) {
        console.warn('Warning: Failed to send notifications:', notificationError.message);
        // Don't throw - operation succeeded even if notifications failed
      }

      const regenAction =
        regenerationStrategyLabel === 'qualifier'
          ? 'QUALIFIER_REGENERATED'
          : regenerationStrategyLabel === 'fill_bye'
            ? 'REGENERATED_FROM_FILL_BYE_FALLBACK'
            : 'REGENERATED';

      return {
        success: true,
        action: regenAction,
        details: {
          message:
            regenerationStrategyLabel === 'qualifier'
              ? `Qualifier bracket created (preliminary round) with new late entry`
              : `Bracket regenerated successfully with new late entry`,
          oldMatchCount,
          newMatchCount: newMatches.length,
          oldParticipantCount,
          newParticipantCount,
          affectedPlayers: oldParticipantCount,
          regenerationRound,
        },
      };
    } catch (error) {
      await transaction.rollback();
      console.error('Error regenerating bracket:', error);
      throw error;
    }
  }

  /**
   * Add player to waitlist
   */
  static async addToWaitlist(tournamentId, participant, userId, tournament) {
    try {
      await participant.update({
        registrationPhase: 'waitlist',
        status: 'pending',
      });

      await AuditLog.create({
        action: 'late_player_added_to_waitlist',
        entityType: 'tournament_participant',
        entityId: participant.id,
        userId,
        notes: `Late player added to waitlist`,
      });

      // ===== Send notifications =====
      const newPlayer = await Player.findByPk(participant.playerId);
      const newPlayerName = newPlayer?.displayName || newPlayer?.name || 'New Player';

      try {
        await NotificationService.notifyTournamentParticipants({
          tournamentId,
          type: 'late_player_added',
          title: `📋 ${newPlayerName} Added to Waitlist`,
          message: `${newPlayerName} has been added to the tournament waitlist. They will enter the bracket if a spot becomes available.`,
          relatedEntityId: tournamentId,
          userId,
          excludePlayerIds: [participant.playerId],
        });
      } catch (notificationError) {
        console.warn('Warning: Failed to send notifications:', notificationError.message);
      }

      return {
        success: true,
        action: 'QUEUED_FOR_WAITLIST',
        details: {
          message: 'Player added to waitlist',
          participantId: participant.id,
          note: 'Will enter tournament if spot becomes available or in losers bracket',
        },
      };
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  /**
   * Fill existing BYE slots (knockout only)
   */
  static async fillExistingBYE(tournamentId, participant, userId, tournament) {
    try {
      // Find a match with player2Id = null (BYE slot)
      const byeMatch = await TournamentMatch.findOne({
        where: { tournamentId, player2Id: null },
      });

      if (!byeMatch) {
        throw new Error('No BYE slots available to fill');
      }

      // Update the BYE match to include the new player
      await byeMatch.update({
        player2Id: participant.playerId,
        isWalkover: false,
        status: 'scheduled',
        isScheduled: false,
        bookingTime: null,
        bookingConfirmedBy: null,
        bookingConfirmedAt: null,
      });

      await tournament.increment('currentParticipantCount');

      await AuditLog.create({
        action: 'late_player_filled_bye_slot',
        entityType: 'tournament_match',
        entityId: byeMatch.id,
        userId,
        notes: `Late player filled BYE slot in match ${byeMatch.id}`,
      });

      // ===== Send notifications =====
      const newPlayer = await Player.findByPk(participant.playerId);
      const newPlayerName = newPlayer?.displayName || newPlayer?.name || 'New Player';

      try {
        await NotificationService.notifyTournamentParticipants({
          tournamentId,
          type: 'late_player_added',
          title: `⚡ ${newPlayerName} Filled BYE Slot`,
          message: `${newPlayerName} has been added to the tournament by filling a BYE slot. The bracket remains unchanged.`,
          relatedEntityId: tournamentId,
          userId,
          excludePlayerIds: [participant.playerId],
        });
      } catch (notificationError) {
        console.warn('Warning: Failed to send notifications:', notificationError.message);
      }

      return {
        success: true,
        action: 'FILLED_BYE',
        details: {
          message: 'Late player assigned to BYE slot',
          participantId: participant.id,
          matchId: byeMatch.id,
          opponent: `Player seed ${byeMatch.seed1 || 'TBD'}`,
        },
      };
    } catch (error) {
      console.error('Error filling BYE:', error);
      throw error;
    }
  }

  /**
   * Re-seed participants with late player getting lower priority
   */
  static reseedParticipants(participants, strategy, latePlayerIdOrIds) {
    let sorted = [...participants];
    const lateIds = Array.isArray(latePlayerIdOrIds)
      ? latePlayerIdOrIds
      : latePlayerIdOrIds
        ? [latePlayerIdOrIds]
        : [];

    if (strategy === 'random') {
      sorted = sorted.sort(() => Math.random() - 0.5);
    } else if (strategy === 'ranked') {
      sorted = sorted.sort((a, b) => {
        const aRanking = a.rankingProfile?.rolling12MonthPoints || 0;
        const bRanking = b.rankingProfile?.rolling12MonthPoints || 0;
        return bRanking - aRanking; // Higher ranking = lower seed number (better)
      });
    } else if (strategy === 'prioritize_existing') {
      // Existing players keep their relative position, new player at end
      const lateIdSet = new Set(lateIds);
      const existing = sorted.filter((p) => !lateIdSet.has(p.id));
      const latePlayers = sorted.filter((p) => lateIdSet.has(p.id));

      // Deterministic: keep existing by current seed ASC, then append late players
      // (late players always get the lowest seeds).
      const existingSorted = [...existing].sort((a, b) => {
        const as = a.seed == null ? Number.POSITIVE_INFINITY : a.seed;
        const bs = b.seed == null ? Number.POSITIVE_INFINITY : b.seed;
        return as - bs;
      });

      const orderMap = new Map(lateIds.map((id, idx) => [id, idx]));
      latePlayers.sort((a, b) => {
        const ai = orderMap.get(a.id) ?? Number.POSITIVE_INFINITY;
        const bi = orderMap.get(b.id) ?? Number.POSITIVE_INFINITY;
        return ai - bi;
      });

      sorted = [...existingSorted, ...latePlayers];
    }

    return sorted;
  }

  /**
   * Generate knockout bracket with new participant count
   */
  static async generateKnockoutBracket(seededPlayerIds, tournamentId, format, tournament, transaction, bracketOptions = {}) {
    const effHandling =
      bracketOptions.forcedByesHandling != null && bracketOptions.forcedByesHandling !== ''
        ? bracketOptions.forcedByesHandling
        : format.byesHandling || 'auto_expand';
    const result = BracketGenerator.generateKnockoutMatches(
      seededPlayerIds,
      tournamentId,
      effHandling
    );

    const matches = result.matches;
    const defaultRoundType = 'knockout_16';

    const byRound = new Map();
    for (const m of matches) {
      const rn = m.roundNumber != null ? Number(m.roundNumber) : 1;
      if (!byRound.has(rn)) byRound.set(rn, []);
      byRound.get(rn).push(m);
    }
    const roundNums = [...byRound.keys()].sort((a, b) => a - b);
    const minRn = roundNums.length ? Math.min(...roundNums) : 1;

    const startDateObj = tournament.startDate instanceof Date
      ? tournament.startDate
      : new Date(tournament.startDate);

    const createdRounds = [];
    const allMatchRecords = [];

    for (const rn of roundNums) {
      const roundMatches = byRound.get(rn) || [];
      const sampleRt = roundMatches[0]?.roundType || defaultRoundType;
      const name =
        rn === 0
          ? 'Round 0 (Qualifier)'
          : `Round ${rn}`;
      const descObj = {
        knockoutBracketSize: result.bracketSize,
        // Only include byeByPairIndex if there are actual BYEs (byeCount > 0)
        byeByPairIndex: rn === minRn && result.byeCount > 0 ? (result.byeByPairIndex || {}) : {},
      };

      console.log(`[generateKnockoutBracket] Round ${rn}: bracketSize=${result.bracketSize}, byeCount=${result.byeCount}, byeByPairIndex=`, JSON.stringify(result.byeByPairIndex || {}));
      if (result.isPreliminary && rn === 0) {
        descObj.isPreliminaryRound = true;
      }

      const round = await TournamentRound.create(
        {
          tournamentId,
          roundNumber: rn,
          roundType: sampleRt,
          name,
          status: 'not_started',
          totalMatches: roundMatches.length,
          description: JSON.stringify(descObj),
        },
        { transaction }
      );

      await round.update({ totalMatches: roundMatches.length }, { transaction });
      createdRounds.push(round);

      const batch = await TournamentMatch.bulkCreate(
        roundMatches.map((m) => ({
          ...m,
          roundId: round.id,
          scheduledDate: startDateObj,
          scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
        })),
        { transaction }
      );
      allMatchRecords.push(...batch);

      // Store in fixtures table for unified access
      const fixtureRecords = batch.map((match) => {
        let winnerId = null;
        let loserId = null;
        if (match.winner === "player1" && match.player1Id) {
          winnerId = match.player1Id;
          loserId = match.player2Id;
        } else if (match.winner === "player2" && match.player2Id) {
          winnerId = match.player2Id;
          loserId = match.player1Id;
        }

        return {
          id: require('uuid').v4(),
          tournamentId,
          leagueId: null,
          divisionId: null,
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          round: match.roundNumber,
          matchNumber: match.matchNumber,
          scheduledDate: startDateObj,
          date: match.playedDate || null,
          player1Frames: match.player1FramesWon || 0,
          player2Frames: match.player2FramesWon || 0,
          player1RackWins: match.player1FramesWon || 0,
          player2RackWins: match.player2FramesWon || 0,
          winnerId,
          loserId,
          status: match.status === "bye" ? "bye" : (match.status === "completed" ? "completed" : "scheduled"),
          stage: "knockout",
          matchIndex: match.matchNumber,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      try {
        await Fixture.bulkCreate(fixtureRecords, { transaction });
      } catch (err) {
        console.error("[FixtureRegenerationService] Error storing fixtures:", err.message);
      }
    }

    return {
      matches: allMatchRecords,
      rounds: createdRounds,
    };
  }

  /**
   * Generate round-robin bracket with recalculated rounds
   */
  static async generateRoundRobinBracket(seededPlayerIds, tournamentId, tournament, transaction) {
    const players = await Player.findAll({
      where: { id: seededPlayerIds },
      attributes: ["id", "name"],
      transaction,
    });
    const playerNamesById = Object.fromEntries(players.map((p) => [p.id, p.name]));

    const result = BracketGenerator.generateRoundRobinMatches(
      seededPlayerIds,
      tournamentId,
      playerNamesById
    );
    const matches = result.matches;
    const { roundsMeta } = result;

    const matchesByRound = {};
    for (const m of matches) {
      matchesByRound[m.roundNumber] = (matchesByRound[m.roundNumber] || 0) + 1;
    }

    const roundRows = roundsMeta.map((meta) => ({
      tournamentId,
      roundNumber: meta.roundNumber,
      roundType: "group_stage",
      name: `Round ${meta.roundNumber}`,
      status: meta.roundNumber === 1 ? "in_progress" : "not_started",
      totalMatches: matchesByRound[meta.roundNumber] || 0,
      description: JSON.stringify({
        byePlayers: meta.byePlayers,
        roundRobin: true,
      }),
    }));

    const createdRounds = await TournamentRound.bulkCreate(roundRows, { transaction });
    const roundNumToId = Object.fromEntries(createdRounds.map((r) => [r.roundNumber, r.id]));

    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    const startDateObj = tournament.startDate instanceof Date
      ? tournament.startDate
      : new Date(tournament.startDate);

    const matchRecords = await TournamentMatch.bulkCreate(
      matches.map((m) => ({
        ...m,
        roundId: roundNumToId[m.roundNumber],
        bestOfFrames: format?.bestOfFrames ?? null,
        scheduledDate: startDateObj,
        scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
      })),
      { transaction }
    );

    // Store in fixtures table for unified access
    const fixtureRecords = matchRecords.map((match) => {
      let winnerId = null;
      let loserId = null;
      if (match.winner === "player1" && match.player1Id) {
        winnerId = match.player1Id;
        loserId = match.player2Id;
      } else if (match.winner === "player2" && match.player2Id) {
        winnerId = match.player2Id;
        loserId = match.player1Id;
      }

      return {
        id: require('uuid').v4(),
        tournamentId,
        leagueId: null,
        divisionId: null,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        round: match.roundNumber,
        matchNumber: match.matchNumber,
        scheduledDate: startDateObj,
        date: match.playedDate || null,
        player1Frames: match.player1FramesWon || 0,
        player2Frames: match.player2FramesWon || 0,
        player1RackWins: match.player1FramesWon || 0,
        player2RackWins: match.player2FramesWon || 0,
        winnerId,
        loserId,
        status: match.status === "bye" ? "bye" : (match.status === "completed" ? "completed" : "scheduled"),
        stage: "group",
        matchIndex: match.matchNumber,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    try {
      await Fixture.bulkCreate(fixtureRecords, { transaction });
    } catch (err) {
      console.error("[FixtureRegenerationService] Error storing fixtures:", err.message);
    }

    return {
      matches: matchRecords,
      rounds: createdRounds,
    };
  }

  /**
   * Generate groups + knockout bracket
   */
  static async generateGroupsKnockoutBracket(seededPlayerIds, tournamentId, format, tournament, transaction) {
    const result = BracketGenerator.generateGroupKnockoutMatches(
      seededPlayerIds,
      tournamentId,
      format.groupCount,
      format.playersPerGroup,
      format.qualifiersPerGroup
    );

    const matches = result.matches;
    const startDateObj = tournament.startDate instanceof Date
      ? tournament.startDate
      : new Date(tournament.startDate);

    const groupsMeta = Array.isArray(result.groups) ? result.groups : [];
    const knockoutStartRound = result.knockoutStartRound != null ? Number(result.knockoutStartRound) : null;
    const groupStageRoundCount =
      knockoutStartRound != null && Number.isFinite(knockoutStartRound) && knockoutStartRound > 1
        ? knockoutStartRound - 1
        : Math.max(1, ...matches.map((m) => Number(m.roundNumber) || 1));

    const matchesByRound = {};
    const matchesByGroupRound = new Map(); // key: `${groupNumber}|${roundNumber}`
    for (const m of matches) {
      matchesByRound[m.roundNumber] = (matchesByRound[m.roundNumber] || 0) + 1;
      const key = `${m.groupNumber ?? "null"}|${m.roundNumber}`;
      const list = matchesByGroupRound.get(key) || [];
      list.push(m);
      matchesByGroupRound.set(key, list);
    }

    const roundRows = [];
    for (let rn = 1; rn <= groupStageRoundCount; rn++) {
      const byePlayers = [];

      for (const group of groupsMeta) {
        const groupPlayerIds = Array.isArray(group.playerIds) ? group.playerIds : [];
        const realN = groupPlayerIds.length;
        if (realN < 2) continue;

        const groupRoundsCount = realN % 2 === 0 ? realN - 1 : realN;
        if (rn > groupRoundsCount) continue;

        if (realN % 2 === 0) continue; // even group => never has byes

        const key = `${group.groupNumber}|${rn}`;
        const matchesInThisGroupRound = matchesByGroupRound.get(key) || [];
        const playedSet = new Set();
        for (const m of matchesInThisGroupRound) {
          if (m.player1Id) playedSet.add(m.player1Id);
          if (m.player2Id) playedSet.add(m.player2Id);
        }

        const restPlayers = groupPlayerIds.filter((pid) => !playedSet.has(pid));
        if (restPlayers.length !== 1) {
          throw new Error(
            `Group-stage BYE computation failed: group ${group.groupNumber} round ${rn} expected 1 rest, got ${restPlayers.length}`
          );
        }
        byePlayers.push({ playerId: restPlayers[0] });
      }

      roundRows.push({
        tournamentId,
        roundNumber: rn,
        roundType: "group_stage",
        name: `Group Stage - Round ${rn}`,
        status: rn === 1 ? "in_progress" : "not_started",
        totalMatches: matchesByRound[rn] || 0,
        description: JSON.stringify({
          byePlayers,
          roundRobin: true,
        }),
      });
    }

    const createdRounds = await TournamentRound.bulkCreate(roundRows, { transaction });
    const roundNumToId = Object.fromEntries(createdRounds.map((r) => [r.roundNumber, r.id]));

    const matchRecords = await TournamentMatch.bulkCreate(
      matches.map((m) => {
        const roundId = roundNumToId[m.roundNumber];
        if (!roundId) {
          throw new Error(`Missing TournamentRound for group-stage match roundNumber=${m.roundNumber}`);
        }
        return {
          ...m,
          roundId,
          scheduledDate: startDateObj,
          scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
        };
      }),
      { transaction }
    );

    // Store in fixtures table for unified access
    const fixtureRecords = matchRecords.map((match) => {
      let winnerId = null;
      let loserId = null;
      if (match.winner === "player1" && match.player1Id) {
        winnerId = match.player1Id;
        loserId = match.player2Id;
      } else if (match.winner === "player2" && match.player2Id) {
        winnerId = match.player2Id;
        loserId = match.player1Id;
      }

      return {
        id: require('uuid').v4(),
        tournamentId,
        leagueId: null,
        divisionId: null,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        round: match.roundNumber,
        matchNumber: match.matchNumber,
        scheduledDate: startDateObj,
        date: match.playedDate || null,
        player1Frames: match.player1FramesWon || 0,
        player2Frames: match.player2FramesWon || 0,
        player1RackWins: match.player1FramesWon || 0,
        player2RackWins: match.player2FramesWon || 0,
        winnerId,
        loserId,
        status: match.status === "bye" ? "bye" : (match.status === "completed" ? "completed" : "scheduled"),
        stage: "group",
        matchIndex: match.matchNumber,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    try {
      await Fixture.bulkCreate(fixtureRecords, { transaction });
    } catch (err) {
      console.error("[FixtureRegenerationService] Error storing fixtures:", err.message);
    }

    // Create group records
    if (result.groups && result.groups.length > 0) {
      const { TournamentGroup } = require("../models");
      await TournamentGroup.bulkCreate(
        result.groups.map(group => ({
          tournamentId,
          groupNumber: group.groupNumber,
          groupName: `Group ${String.fromCharCode(64 + group.groupNumber)}`,
          playerIds: group.playerIds || [],
          totalPlayers: (group.playerIds || []).length,
          currentRound: 1,
          qualifiedPlayerIds: [],
          totalQualified: 0,
          status: (group.playerIds || []).length >= 2 ? 'in_progress' : 'not_started',
        })),
        { transaction }
      );
    }

    if (result.knockoutStartRound != null) {
      await format.update({ knockoutStartRound: result.knockoutStartRound }, { transaction });
    }

    return {
      matches: matchRecords,
      rounds: createdRounds,
    };
  }

  /**
   * Generate Swiss bracket (only Round 1)
   */
  static async generateSwissBracket(seededParticipants, tournamentId, tournament, transaction) {
    const { TournamentFormat } = require('../models');
    const SwissPairingEngine = require('./SwissPairingEngine');
    const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
    const n = (seededParticipants || []).filter((p) => p.playerId).length;
    if (format && !format.maxRounds && n >= 2) {
      await format.update({ maxRounds: SwissPairingEngine.defaultSwissRoundCount(n) }, { transaction });
    }
    const pairings = BracketGenerator.generateSwissPairings(seededParticipants, {
      seeding: format?.seeding || 'random',
    });
    const matches = pairings.map(pair => ({
      tournamentId,
      roundNumber: 1,
      roundType: 'swiss',
      player1Id: pair.player1Id,
      player2Id: pair.player2Id,
      status: pair.player2Id ? 'scheduled' : 'completed',
      winner: pair.player2Id ? null : 'player1',
      // Swiss BYE rows are identified by `player2Id: null` and always score +1.
      // Do not mark as walkovers.
      isWalkover: false,
    }));

    const round = await TournamentRound.create(
      {
        tournamentId,
        roundNumber: 1,
        roundType: 'swiss',
        name: 'Round 1',
        status: 'not_started',
        totalMatches: matches.filter((m) => m.player2Id).length,
      },
      { transaction }
    );

    const startDateObj = tournament.startDate instanceof Date
      ? tournament.startDate
      : new Date(tournament.startDate);

    const matchRecords = await TournamentMatch.bulkCreate(
      matches.map(m => ({
        ...m,
        roundId: round.id,
        scheduledDate: startDateObj,
        scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
      })),
      { transaction }
    );

    // Store in fixtures table for unified access
    const fixtureRecords = matchRecords.map((match) => {
      let winnerId = null;
      let loserId = null;
      if (match.winner === "player1" && match.player1Id) {
        winnerId = match.player1Id;
        loserId = match.player2Id;
      } else if (match.winner === "player2" && match.player2Id) {
        winnerId = match.player2Id;
        loserId = match.player1Id;
      }

      return {
        id: require('uuid').v4(),
        tournamentId,
        leagueId: null,
        divisionId: null,
        player1Id: match.player1Id,
        player2Id: match.player2Id,
        round: match.roundNumber || 1,
        matchNumber: match.matchNumber,
        scheduledDate: startDateObj,
        date: match.playedDate || null,
        player1Frames: match.player1FramesWon || 0,
        player2Frames: match.player2FramesWon || 0,
        player1RackWins: match.player1FramesWon || 0,
        player2RackWins: match.player2FramesWon || 0,
        winnerId,
        loserId,
        status: match.status === "bye" ? "bye" : (match.status === "completed" ? "completed" : "scheduled"),
        stage: "swiss",
        matchIndex: match.matchNumber,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    try {
      await Fixture.bulkCreate(fixtureRecords, { transaction });
    } catch (err) {
      console.error("[FixtureRegenerationService] Error storing fixtures:", err.message);
    }

    return {
      matches: matchRecords,
      rounds: [round],
    };
  }

  /**
   * Multi-player late entry handler (supports preview mode).
   *
   * This is the backend implementation for:
   * POST /api/tournaments/:id/late-entry
   *
   * - preview=true: does not write to DB; returns impact only.
   * - preview=false: performs DB writes + returns action details.
   */
  static async addLatePlayersWithStrategy(params) {
    const {
      tournamentId,
      playerIds,
      strategy,
      reseedType,
      userId,
      preview = false,
    } = params || {};

    if (!tournamentId) throw new Error("TournamentId is required");
    if (!Array.isArray(playerIds) || playerIds.length === 0) throw new Error("players is required");

    const uniquePlayerIds = [...new Set(playerIds)].filter(Boolean);
    if (uniquePlayerIds.length === 0) throw new Error("players is required");

    const validStrategies = ["regenerate", "qualifier", "waitlist", "fill_bye"];
    if (!validStrategies.includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}`);
    }

    const tournament = await Tournament.findByPk(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const fixturesExistForPolicy = (await TournamentMatch.count({ where: { tournamentId } })) > 0;
    const validationState = this.validateCanAddLatePlayer(tournament, strategy, {
      fixturesExist: fixturesExistForPolicy,
    });
    if (!validationState.canAdd) {
      throw new Error(validationState.reason || validationState.message || 'LATE_ENTRY_NOT_ALLOWED');
    }

    const tournamentStarted = ["in_progress", "completed"].includes(tournament.status);

    // De-dup + validate "not already registered"
    const existing = await TournamentParticipant.findAll({
      where: { tournamentId, playerId: { [Op.in]: uniquePlayerIds } },
      attributes: ["playerId"],
    });
    const existingSet = new Set(existing.map((p) => p.playerId));
    const newPlayerIds = uniquePlayerIds.filter((pid) => !existingSet.has(pid));

    if (newPlayerIds.length === 0) {
      throw new Error("NO_NEW_PLAYERS");
    }

    // Validate that all late players exist as Players records.
    const playersFound = await Player.findAll({
      where: { id: { [Op.in]: newPlayerIds } },
      attributes: ["id"],
    });
    if (playersFound.length !== newPlayerIds.length) {
      throw new Error("One or more players are invalid");
    }

    const format = await TournamentFormat.findOne({ where: { tournamentId } });
    if (!format) throw new Error("Tournament format not found");

    if (reseedType != null && !["random", "lower_priority"].includes(reseedType)) {
      throw new Error("Invalid reseedType");
    }

    const reseedStrategy = FixtureRegenerationService.normalizeReseedStrategy(reseedType);

    const approvedParticipants = await TournamentParticipant.findAll({
      where: { tournamentId, status: "approved" },
      order: [["seed", "ASC"]],
    });
    const oldApprovedCount = approvedParticipants.length;
    const lateCount = newPlayerIds.length;
    const playerCountAfterLateEntry = oldApprovedCount + lateCount;

    const oldMatchCount = await TournamentMatch.count({ where: { tournamentId } });

    if (
      format.type === "knockout" &&
      strategy === "qualifier" &&
      this.isPowerOfTwo(playerCountAfterLateEntry)
    ) {
      throw new Error(
        `Qualifier is not available when late entry makes the bracket a full field (${playerCountAfterLateEntry} players). Use fill_bye or regenerate instead.`
      );
    }

    const reseedOrderForImpact = () => {
      const existingIds = approvedParticipants.map((p) => p.playerId).filter(Boolean);
      if (reseedStrategy === "prioritize_existing") {
        // Lower Priority: late players always get the lowest seeds.
        return [...existingIds, ...newPlayerIds];
      }
      // Random (or fallback): seed order doesn't affect match COUNT for single-elim.
      const all = [...existingIds, ...newPlayerIds];
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      return all;
    };

    const seededPlayerIdsNew = reseedOrderForImpact();

    const simulateKnockoutMatchCount = (playerIdOrder, byesHandling) => {
      const result = BracketGenerator.generateKnockoutMatches(
        playerIdOrder,
        tournamentId,
        byesHandling
      );
      return result.matches.length;
    };

    const computeKnockoutByeSlotsAvailable = async ({ roundNumber, byeByPairIndex }) => {
      // A "bye slot" is available if there is no DB match row already using that slot
      // (or the DB match row is a true BYE/rest row with player2Id == null).
      const byeEntries = Object.entries(byeByPairIndex || {}).filter(([, pid]) => Boolean(pid));
      if (byeEntries.length === 0) return [];

      const parsed = byeEntries
        .map(([pairIdxStr, pid]) => {
          const pairIdx = Number(pairIdxStr);
          const matchNumber = pairIdx + 1;
          return { pairIdx, matchNumber, byeRecipientId: pid };
        })
        .filter((x) => Number.isFinite(x.pairIdx) && Number.isFinite(x.matchNumber));

      const matchNumbers = parsed.map((x) => x.matchNumber);
      const existingMatches = await TournamentMatch.findAll({
        where: { tournamentId, roundNumber, matchNumber: { [Op.in]: matchNumbers } },
        attributes: ["id", "matchNumber", "player1Id", "player2Id"],
      });

      const rowsBySlot = new Map(); // key = matchNumber|player1Id => { id, player2Id }
      for (const m of existingMatches) {
        const k = `${m.matchNumber}|${m.player1Id}`;
        rowsBySlot.set(k, { id: m.id, player2Id: m.player2Id ?? null });
      }

      const available = [];
      for (const { pairIdx, matchNumber, byeRecipientId } of parsed) {
        const k = `${matchNumber}|${byeRecipientId}`;
        const row = rowsBySlot.get(k);

        // Available if there's no row yet (metadata BYE) OR the row is a true BYE/rest row (DB row with player2Id == null).
        if (!row) {
          available.push({
            pairIdx,
            matchNumber,
            byeRecipientId,
            existingByeMatchId: null,
          });
        } else if (row.player2Id === null) {
          available.push({
            pairIdx,
            matchNumber,
            byeRecipientId,
            existingByeMatchId: row.id,
          });
        }
      }

      available.sort((a, b) => a.pairIdx - b.pairIdx);
      return available;
    };

    const findKnockoutByeRound = async () => {
      const rounds = await TournamentRound.findAll({
        where: { tournamentId },
        attributes: ["id", "roundNumber", "roundType", "description"],
        order: [["roundNumber", "ASC"]],
      });

      for (const r of rounds) {
        if (!r.description) continue;
        let desc;
        try {
          desc = JSON.parse(r.description);
        } catch {
          desc = null;
        }
        const byeByPairIndex = desc?.byeByPairIndex;
        if (byeByPairIndex && typeof byeByPairIndex === "object") {
          const keys = Object.keys(byeByPairIndex).filter((k) => Boolean(byeByPairIndex[k]));
          if (keys.length > 0) {
            return { roundRow: r, byeByPairIndex };
          }
        }
      }

      return null;
    };

    // ======================
    // PREVIEW MODE (impact)
    // ======================
    if (preview) {
      const playerCountAfter =
        strategy === "waitlist" ? oldApprovedCount : oldApprovedCount + lateCount;

      const playerCountText =
        strategy === "waitlist"
          ? `${oldApprovedCount} → ${oldApprovedCount} (queued +${lateCount})`
          : `${oldApprovedCount} → ${playerCountAfter}`;

      let matches;
      let warning = null;

      if (strategy === "waitlist") {
        matches = { unchanged: oldMatchCount, regenerated: 0, added: 0 };
        warning = "Player will be added after current matches complete";
      } else if (format.type === "knockout" && strategy === "fill_bye") {
        const byeRound = await findKnockoutByeRound();
        if (!byeRound) {
          const newMatchCount = simulateKnockoutMatchCount(
            seededPlayerIdsNew,
            format.byesHandling || "auto_expand"
          );
          matches = { regenerated: oldMatchCount, unchanged: 0, added: newMatchCount };
          warning = "Will only work if BYE slots are available (no BYE slots found; regenerating instead)";
        } else {
          const availableSlots = await computeKnockoutByeSlotsAvailable({
            roundNumber: byeRound.roundRow.roundNumber,
            byeByPairIndex: byeRound.byeByPairIndex,
          });
          if (availableSlots.length >= lateCount) {
            const toFill = availableSlots.slice(0, lateCount);
            const createCount = toFill.filter((s) => s.existingByeMatchId == null).length;
            matches = { unchanged: oldMatchCount, regenerated: 0, added: createCount };
            warning = "Will only work if BYE slots are available";
          } else {
            const newMatchCount = simulateKnockoutMatchCount(
              seededPlayerIdsNew,
              format.byesHandling || "auto_expand"
            );
            matches = { regenerated: oldMatchCount, unchanged: 0, added: newMatchCount };
            warning =
              "Will only work if BYE slots are available (not enough BYE slots; regenerating instead)";
          }
        }
      } else if (format.type === "knockout" && strategy === "qualifier") {
        const newMatchCount = simulateKnockoutMatchCount(
          seededPlayerIdsNew,
          "preliminary_round"
        );
        matches = { regenerated: oldMatchCount, unchanged: 0, added: newMatchCount };
        warning = "New player must win qualifier to join main bracket";
      } else {
        // regenerate OR any non-knockout strategy: compute format-specific new match count.
        let newMatchCount;
        if (format.type === "knockout") {
          const byesHandling = format.byesHandling || "auto_expand";
          newMatchCount = simulateKnockoutMatchCount(seededPlayerIdsNew, byesHandling);
        } else if (format.type === "round_robin") {
          // Round-robin: every pair plays once → N*(N-1)/2
          const n = seededPlayerIdsNew.length;
          newMatchCount = (n * (n - 1)) / 2;
        } else if (format.type === "swiss") {
          // Swiss: ceil(N/2) pairings per round × estimated round count
          const n = seededPlayerIdsNew.length;
          const defaultRounds = Math.max(3, Math.ceil(Math.log2(n)));
          const maxRounds = format.maxRounds || defaultRounds;
          newMatchCount = Math.floor(n / 2) * maxRounds;
        } else if (format.type === "groups_knockout") {
          // Groups: each group is an internal round-robin + knockout stage
          const n = seededPlayerIdsNew.length;
          const groupCount = format.groupCount || Math.max(2, Math.ceil(n / (format.playersPerGroup || 4)));
          const ppg = Math.ceil(n / groupCount);
          const groupMatches = groupCount * ((ppg * (ppg - 1)) / 2);
          const qualifiers = groupCount * (format.qualifiersPerGroup || 2);
          const koMatches = qualifiers > 1 ? qualifiers - 1 : 0;
          newMatchCount = groupMatches + koMatches;
        } else {
          // Unknown format: rough estimate using knockout math as fallback
          const byesHandling = format.byesHandling || "auto_expand";
          newMatchCount = simulateKnockoutMatchCount(seededPlayerIdsNew, byesHandling);
        }
        matches = { regenerated: oldMatchCount, unchanged: 0, added: newMatchCount };
        warning = "All existing matches will be deleted and recreated";
      }

      return {
        success: true,
        action: "LATE_ENTRY_PREVIEW",
        impact: {
          playerCountText,
          playerCountBefore: oldApprovedCount,
          playerCountAfter,
          matches,
          warning,
          strategyUsed: strategy,
          newPlayerIds,
        },
      };
    }

    // ======================
    // CONFIRM MODE (write)
    // ======================
    // Waitlist is independent: add participants, no fixture changes.
    if (strategy === "waitlist") {
      const addResults = [];
      for (const pid of newPlayerIds) {
        // Reuse existing single-player implementation to keep behavior consistent.
        const r = await FixtureRegenerationService.addLatePlayerWithStrategy({
          tournamentId,
          playerId: pid,
          strategy: "waitlist",
          reseedStrategy,
          userId,
        });
        addResults.push(r);
      }

      return {
        success: true,
        action: "QUEUED_FOR_WAITLIST",
        details: { addedPlayerIds: newPlayerIds, results: addResults },
      };
    }

    // For regenerate/qualifier/fill_bye, we need a transaction.
    const transaction = await sequelize.transaction();
    try {
      // Create participant records first.
      const createdParticipants = [];
      for (const pid of newPlayerIds) {
        const participant = await TournamentParticipant.create(
          {
            tournamentId,
            playerId: pid,
            registrationMethod: "admin",
            status: "approved",
            approvedDate: new Date(),
            registrationDate: new Date(),
            registeredLate: true,
            registrationPhase:
              strategy === "qualifier" ? "qualifier" : strategy === "waitlist" ? "waitlist" : "late",
          },
          { transaction }
        );
        createdParticipants.push(participant);
      }

      const oldMatches = await TournamentMatch.findAll({ where: { tournamentId }, transaction });
      const canRegenerate = oldMatches.every((m) => m.status === "scheduled");
      if (!canRegenerate && strategy === "regenerate") {
        throw new Error("Cannot regenerate: Some matches have already been played");
      }

      // Decide actual action for fill_bye (might fallback to regeneration)
      if (format.type === "knockout" && strategy === "fill_bye") {
        const byeRound = await findKnockoutByeRound();
        if (!byeRound) {
          // Fallback regenerate
          if (tournamentStarted) throw new Error("REGENERATE_NOT_ALLOWED_AFTER_START");
          const regenResult = await this.regenerateBracketForLateEntries(
            tournamentId,
            createdParticipants,
            reseedStrategy,
            userId,
            tournament,
            {
              regenerationStrategyLabel: "fill_bye",
              forcedByesHandling: null,
            },
            transaction
          );
            await transaction.commit();
            return regenResult;
        }

        const availableSlots = await computeKnockoutByeSlotsAvailable({
          roundNumber: byeRound.roundRow.roundNumber,
          byeByPairIndex: byeRound.byeByPairIndex,
        });

        if (availableSlots.length < createdParticipants.length) {
          if (tournamentStarted) throw new Error("REGENERATE_NOT_ALLOWED_AFTER_START");
          const regenResult = await this.regenerateBracketForLateEntries(
            tournamentId,
            createdParticipants,
            reseedStrategy,
            userId,
            tournament,
            {
              regenerationStrategyLabel: "fill_bye",
              forcedByesHandling: null,
            },
            transaction
          );
          await transaction.commit();
          return regenResult;
        }

        // Fill BYE slots by converting empty opponents into scheduled matches.
        // This keeps existing fixtures intact, only replacing BYE/rest with a real opponent.
        const roundRow = byeRound.roundRow;
        const desc = roundRow.description ? JSON.parse(roundRow.description) : {};
        desc.byeByPairIndex = desc.byeByPairIndex || {};

        const sampleMatch = await TournamentMatch.findOne({
          where: { tournamentId, roundNumber: roundRow.roundNumber },
          transaction,
        });
        const matchRoundType = sampleMatch?.roundType || "knockout_16";

        const scheduledDate = sampleMatch?.scheduledDate || tournament.startDate;
        const scheduledTime = sampleMatch?.scheduledTime || null;
        const scheduledDeadline =
          sampleMatch?.scheduledDeadline || new Date(new Date(scheduledDate).getTime() + 7 * 24 * 60 * 60 * 1000);

        const toFill = availableSlots.slice(0, createdParticipants.length);

        // Create match rows
        for (let i = 0; i < toFill.length; i++) {
          const slot = toFill[i];
          const lateParticipant = createdParticipants[i];
          if (slot.existingByeMatchId) {
            await TournamentMatch.update(
              {
                player2Id: lateParticipant.playerId,
                status: "scheduled",
                winner: null,
                isWalkover: false,
                scheduledDate,
                scheduledTime,
                scheduledDeadline,
                isScheduled: false,
                bookingTime: null,
                bookingConfirmedBy: null,
                bookingConfirmedAt: null,
              },
              { where: { id: slot.existingByeMatchId }, transaction }
            );
          } else {
            await TournamentMatch.create(
              {
                tournamentId,
                roundId: roundRow.id,
                roundNumber: roundRow.roundNumber,
                roundType: matchRoundType,
                matchNumber: slot.matchNumber,
                player1Id: slot.byeRecipientId,
                player2Id: lateParticipant.playerId,
                status: "scheduled",
                winner: null,
                isWalkover: false,
                scheduledDate,
                scheduledTime,
                scheduledDeadline,
                isScheduled: false,
                bookingTime: null,
                bookingConfirmedBy: null,
                bookingConfirmedAt: null,
              },
              { transaction }
            );
          }

          // Remove filled slot from byeByPairIndex so synthetic BYEs disappear.
          delete desc.byeByPairIndex[String(slot.pairIdx)];
        }

        await roundRow.update(
          { description: JSON.stringify(desc) },
          { transaction }
        );

        const oldParticipantCount = oldApprovedCount;
        const newParticipantCount = oldParticipantCount + createdParticipants.length;
        const oldMatchCount = oldMatches.length;

        const newMatchCount = await TournamentMatch.count({ where: { tournamentId }, transaction });

        // Audit record (treat as a "fill_bye" regeneration event).
        const regenerationRound = tournament.fixtureRegenerationCount + 1;
        await TournamentFixtureRegeneration.create(
          {
            tournamentId,
            generationRound: regenerationRound,
            strategy: "fill_bye",
            oldMatchCount,
            newMatchCount,
            oldParticipantCount,
            newParticipantCount,
            newPlayerIds: createdParticipants.map((p) => p.id),
            deletedMatchIds: [],
            deletedRoundIds: [],
            createdMatches: [],
            createdRounds: [],
            triggeredBy: userId,
            reseedStrategy,
            affectedPlayerCount: oldParticipantCount,
            status: "success",
            notes: "Converted available BYE slots into scheduled matches for late entries.",
          },
          { transaction }
        );

        await tournament.update(
          {
            fixtureRegenerationCount: regenerationRound,
            lastFixtureRegenerationAt: new Date(),
            pendingLatePlayerCount: 0,
            currentParticipantCount: newParticipantCount,
          },
          { transaction }
        );

        await AuditLog.create(
          {
            action: "late_entry_fill_bye_converted",
            entityType: "tournament",
            entityId: tournamentId,
            userId,
            notes: `Converted ${toFill.length} BYE slots into scheduled matches`,
          },
          { transaction }
        );

        await transaction.commit();

        return {
          success: true,
          action: "FILLED_BYE",
          details: { addedPlayerIds: newPlayerIds, filledCount: toFill.length },
        };
      }

      // regenerate or qualifier
      if (strategy === "regenerate") {
        const regenResult = await this.regenerateBracketForLateEntries(
          tournamentId,
          createdParticipants,
          reseedStrategy,
          userId,
          tournament,
          { regenerationStrategyLabel: "regenerate", forcedByesHandling: null },
          transaction
        );
        await transaction.commit();
        return regenResult;
      }

      if (strategy === "qualifier") {
        const regenResult = await this.regenerateBracketForLateEntries(
          tournamentId,
          createdParticipants,
          reseedStrategy,
          userId,
          tournament,
          {
            regenerationStrategyLabel: "qualifier",
            forcedByesHandling: "preliminary_round",
          },
          transaction
        );
        await transaction.commit();
        return regenResult;
      }

      throw new Error(`Unknown strategy: ${strategy}`);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  /**
   * Regenerate bracket for multiple late entries as a single operation.
   *
   * @param {string} tournamentId
   * @param {Array<TournamentParticipant>} createdParticipants - newly created participants
   * @param {string} reseedStrategy - DB-safe reseed enum (random|ranked|prioritize_existing)
   * @param {string} userId
   * @param {Tournament} tournament
   * @param {object} options
   * @param {string} options.regenerationStrategyLabel - regenerate|qualifier|fill_bye
   * @param {string|null} options.forcedByesHandling - byesHandling override for knockout (e.g., preliminary_round)
   * @param {object} transaction - sequelize transaction
   */
  static async regenerateBracketForLateEntries(
    tournamentId,
    createdParticipants,
    reseedStrategy,
    userId,
    tournament,
    options = {},
    transaction
  ) {
    const regenerationStrategyLabel = options.regenerationStrategyLabel || "regenerate";
    const forcedByesHandling =
      options.forcedByesHandling !== undefined ? options.forcedByesHandling : null;

    const ownsTx = !transaction;
    const tx = transaction || (await sequelize.transaction());

    try {
      // ===== Get current state =====
      const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction: tx });
      const oldMatches = await TournamentMatch.findAll({ where: { tournamentId }, transaction: tx });
      const allParticipants = await TournamentParticipant.findAll({
        where: { tournamentId, status: "approved" },
        transaction: tx,
        order: [["seed", "ASC"]],
      });

      const oldParticipantCount = allParticipants.length - createdParticipants.length;
      const oldMatchCount = oldMatches.length;

      // Validate can regenerate = everything still scheduled.
      const canRegenerate = oldMatches.every((m) => m.status === "scheduled");
      if (!canRegenerate) {
        throw new Error("Cannot regenerate: Some matches have already been played");
      }

      // ===== Delete old brackets =====
      const oldRounds = await TournamentRound.findAll({ where: { tournamentId }, transaction: tx });
      const oldRoundIds = oldRounds.map((r) => r.id);
      const oldMatchIds = oldMatches.map((m) => m.id);

      await TournamentRound.destroy({ where: { tournamentId }, transaction: tx });
      await TournamentMatch.destroy({ where: { tournamentId }, transaction: tx });

      // ===== Re-seed and update seeds =====
      const seededParticipants = this.reseedParticipants(
        allParticipants,
        reseedStrategy,
        createdParticipants.map((p) => p.id)
      );

      for (const [index, participant] of seededParticipants.entries()) {
        await participant.update({ seed: index + 1 }, { transaction: tx });
      }

      const seededPlayerIds = seededParticipants
        .map((p) => p.playerId)
        .filter(Boolean);

      // ===== Generate fixtures based on format =====
      let newMatches = [];
      let newRounds = [];

      if (format.type === "knockout") {
        const result = await this.generateKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          tx,
          { forcedByesHandling }
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "round_robin") {
        const result = await this.generateRoundRobinBracket(
          seededPlayerIds,
          tournamentId,
          tournament,
          tx
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "groups_knockout") {
        const result = await this.generateGroupsKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          tx
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "swiss") {
        const result = await this.generateSwissBracket(
          seededParticipants,
          tournamentId,
          tournament,
          tx
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else {
        throw new Error(`Unsupported format type: ${format.type}`);
      }

      // ===== Audit =====
      const regenerationRound = tournament.fixtureRegenerationCount + 1;
      const regenStrategyEnum =
        regenerationStrategyLabel === "qualifier"
          ? "qualifier"
          : regenerationStrategyLabel === "fill_bye"
            ? "fill_bye"
            : "regenerate";

      await TournamentFixtureRegeneration.create(
        {
          tournamentId,
          generationRound: regenerationRound,
          strategy: regenStrategyEnum,
          oldMatchCount,
          newMatchCount: newMatches.length,
          oldParticipantCount,
          newParticipantCount: allParticipants.length,
          newPlayerIds: createdParticipants.map((p) => p.id),
          deletedMatchIds: oldMatchIds,
          deletedRoundIds: oldRoundIds,
          createdMatches: newMatches.map((m) => m.id),
          createdRounds: newRounds.map((r) => r.id),
          triggeredBy: userId,
          reseedStrategy,
          affectedPlayerCount: oldParticipantCount,
          status: "success",
          notes: `Late entry regeneration: ${regenerationStrategyLabel} (forcedByesHandling=${forcedByesHandling})`,
        },
        { transaction: tx }
      );

      // ===== Update tournament metadata =====
      await tournament.update(
        {
          fixtureRegenerationCount: regenerationRound,
          lastFixtureRegenerationAt: new Date(),
          pendingLatePlayerCount: 0,
          currentParticipantCount: allParticipants.length,
        },
        { transaction: tx }
      );

      await AuditLog.create(
        {
          action: "bracket_regenerated_for_multiple_late_entries",
          entityType: "tournament",
          entityId: tournamentId,
          userId,
          notes: `Late entry regeneration (${regenerationStrategyLabel}) - oldMatchCount=${oldMatchCount}, newMatchCount=${newMatches.length}`,
        },
        { transaction: tx }
      );

      if (ownsTx) await tx.commit();

      const regenAction =
        regenerationStrategyLabel === "qualifier"
          ? "QUALIFIER_REGENERATED"
          : regenerationStrategyLabel === "fill_bye"
            ? "REGENERATED_FROM_FILL_BYE_FALLBACK"
            : "REGENERATED";

      return {
        success: true,
        action: regenAction,
        details: {
          oldMatchCount,
          newMatchCount: newMatches.length,
          oldParticipantCount,
          newParticipantCount: allParticipants.length,
          regenerationRound,
        },
      };
    } catch (e) {
      if (ownsTx) await tx.rollback();
      throw e;
    }
  }

  /**
   * Get regeneration history for a tournament
   */
  static async getRegenerationHistory(tournamentId) {
    return await TournamentFixtureRegeneration.findAll({
      where: { tournamentId },
      order: [['generationRound', 'ASC']],
    });
  }

  /** True if every match is still unplayed (scheduled / pending) or is a bye-only row (no head-to-head yet). */
  static matchAllowsFullRegeneration(m) {
    if (!m) return false;
    if (m.status === "scheduled" || m.status === "pending_confirmation") return true;
    if (m.status === "completed" && (!m.player1Id || !m.player2Id)) return true;
    return false;
  }

  /**
   * After a player withdraws before play: rebuild bracket from remaining approved players.
   * Only runs when every existing match is still scheduled (no results yet).
   * Knockout byes (odd player count) are handled by BracketGenerator.generateKnockoutMatches.
   *
   * @param {string} tournamentId
   * @param {string|null} userId - for audit (withdrawal flow may pass null)
   * @param {object} [options]
   * @returns {Promise<{ success: boolean, regenerated: boolean, reason?: string, newMatchCount?: number }>}
   */
  static async regenerateBracketAfterWithdrawal(tournamentId, userId, options = {}) {
    const transaction = await sequelize.transaction();
    try {
      const tournament = await Tournament.findByPk(tournamentId, { transaction });
      if (!tournament) throw new Error("Tournament not found");

      const format = await TournamentFormat.findOne({ where: { tournamentId }, transaction });
      if (!format) {
        console.log(`[FixtureRegeneration] No format found for tournament ${tournamentId} - still in registration mode, fixtures will be generated on lock`);
        await transaction.commit();
        return { success: true, regenerated: false, reason: "no_format_registration_not_locked" };
      }

      const oldMatches = await TournamentMatch.findAll({ where: { tournamentId }, transaction });
      const approvedParticipants = await TournamentParticipant.findAll({
        where: { tournamentId, status: "approved" },
        transaction,
        order: [["seed", "ASC"]],
      });

      if (oldMatches.length === 0) {
        // If no matches exist but there are remaining participants, generate bracket for them
        if (approvedParticipants.length >= 2) {
          console.log(`[FixtureRegeneration] No old matches but ${approvedParticipants.length} approved participants remain - generating bracket`);
          // Continue to generate new bracket below
        } else {
          // Only 0-1 participants remain, can't create bracket
          await tournament.update(
            { currentParticipantCount: approvedParticipants.length },
            { transaction }
          );
          await transaction.commit();
          return { success: true, regenerated: false, reason: "no_bracket" };
        }
      }

      // Check if existing matches allow regeneration (skip if no old matches)
      if (oldMatches.length > 0) {
        const canRegenerate = oldMatches.every((m) => FixtureRegenerationService.matchAllowsFullRegeneration(m));
        if (!canRegenerate) {
          await transaction.commit();
          return { success: true, regenerated: false, reason: "matches_in_progress_or_completed" };
        }
      }

      const oldRounds = await TournamentRound.findAll({ where: { tournamentId }, transaction });
      const oldRoundIds = oldRounds.map((r) => r.id);
      const oldMatchIds = oldMatches.map((m) => m.id);

      await TournamentRound.destroy({ where: { tournamentId }, transaction });
      await TournamentMatch.destroy({ where: { tournamentId }, transaction });
      await TournamentGroup.destroy({ where: { tournamentId }, transaction });

      const seeding = format.seeding || options.reseedStrategy || "random";
      const reseedStrategy = this.normalizeReseedStrategy(
        seeding === "ranked" ? "ranked" : seeding === "manual" ? "prioritize_existing" : "random"
      );
      const seededParticipants = this.reseedParticipants(approvedParticipants, reseedStrategy, null);
      for (const [index, participant] of seededParticipants.entries()) {
        await participant.update({ seed: index + 1 }, { transaction });
      }

      const seededPlayerIds = seededParticipants.map((p) => p.playerId).filter(Boolean);
      const newParticipantCount = approvedParticipants.length;
      const previousParticipantCount = newParticipantCount + 1;

      if (seededPlayerIds.length < 2) {
        const regenerationRound = tournament.fixtureRegenerationCount + 1;
        await tournament.update(
          {
            fixtureRegenerationCount: regenerationRound,
            lastFixtureRegenerationAt: new Date(),
            currentParticipantCount: newParticipantCount,
          },
          { transaction }
        );
        await AuditLog.create(
          {
            action: "bracket_regenerated_after_withdrawal",
            entityType: "tournament",
            entityId: tournamentId,
            userId: userId || null,
            notes: `Withdrawal: only one player remains — bracket cleared. ${options.reason || ""}`,
          },
          { transaction }
        );
        await transaction.commit();
        return {
          success: true,
          regenerated: true,
          reason: "single_player_remaining",
          newMatchCount: 0,
        };
      }

      let newMatches = [];
      let newRounds = [];

      if (format.type === "knockout") {
        const result = await this.generateKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          transaction,
          {}
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "round_robin") {
        const result = await this.generateRoundRobinBracket(
          seededPlayerIds,
          tournamentId,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "groups_knockout") {
        const result = await this.generateGroupsKnockoutBracket(
          seededPlayerIds,
          tournamentId,
          format,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else if (format.type === "swiss") {
        const result = await this.generateSwissBracket(
          seededParticipants,
          tournamentId,
          tournament,
          transaction
        );
        newMatches = result.matches;
        newRounds = result.rounds;
      } else {
        await transaction.rollback();
        return { success: false, regenerated: false, reason: `unsupported_format_${format.type}` };
      }

      const regenerationRound = tournament.fixtureRegenerationCount + 1;
      await TournamentFixtureRegeneration.create(
        {
          tournamentId,
          generationRound: regenerationRound,
          strategy: "regenerate",
          oldMatchCount: oldMatches.length,
          newMatchCount: newMatches.length,
          oldParticipantCount: previousParticipantCount,
          newParticipantCount: newParticipantCount,
          newPlayerIds: [],
          deletedMatchIds: oldMatchIds,
          deletedRoundIds: oldRoundIds,
          createdMatches: newMatches.map((m) => m.id),
          createdRounds: newRounds.map((r) => r.id),
          triggeredBy: userId || null,
          reseedStrategy,
          affectedPlayerCount: newParticipantCount,
          status: "success",
          notes: `Bracket regenerated after player withdrawal (${options.reason || "withdraw"})`,
        },
        { transaction }
      );

      await tournament.update(
        {
          fixtureRegenerationCount: regenerationRound,
          lastFixtureRegenerationAt: new Date(),
          currentParticipantCount: newParticipantCount,
        },
        { transaction }
      );

      await AuditLog.create(
        {
          action: "bracket_regenerated_after_withdrawal",
          entityType: "tournament",
          entityId: tournamentId,
          userId: userId || null,
          notes: `Withdrawal remove rule: rebuilt bracket (${newMatches.length} matches). ${options.reason || ""}`,
        },
        { transaction }
      );

      await transaction.commit();
      return {
        success: true,
        regenerated: true,
        newMatchCount: newMatches.length,
        reason: "regenerated",
      };
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }
}

module.exports = FixtureRegenerationService;
