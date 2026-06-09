/**
 * Registration Deadline Service
 * Automatically closes tournament registration when deadline is reached
 * Triggers auto-fixture generation on close (if prerequisites met)
 * Prevents duplicate fixtures through deduplication checks
 */

const {
  Tournament,
  TournamentParticipant,
  TournamentMatch,
  AuditLog,
  TournamentFormat,
  TournamentScoringRules,
  TournamentRound,
  PlayerRankingProfile,
  Fixture,
} = require("../models");
const { BracketGenerator } = require("../controllers/tournamentManager");
const { getRegistrationOpenStateUTC } = require("../utils/registrationWindow");

class RegistrationDeadlineService {
  /**
   * Check and close registrations for tournaments past their deadline
   * Called periodically to auto-close registrations
   */
  static async processRegistrationDeadlines() {
    try {
      console.log("[RegistrationDeadlineService] Processing registration deadlines...");

      // Find tournaments still in "registration" state, then close them when they are
      // past the *end of the registration deadline day* (UTC).
      //
      // This avoids closing at 00:00 when registrationDeadline is stored as a date-only value.
      const now = new Date();
      const tournamentsInRegistration = await Tournament.findAll({
        where: { status: "registration" },
      });

      const tournamentsToClose = tournamentsInRegistration.filter((t) => {
        const { open } = getRegistrationOpenStateUTC(t, now);
        return !open;
      });

      if (tournamentsToClose.length === 0) {
        console.log("[RegistrationDeadlineService] No tournaments to close");
        return { processed: 0, closed: 0, failed: 0 };
      }

      console.log(`[RegistrationDeadlineService] Found ${tournamentsToClose.length} tournaments past deadline`);

      let closed = 0;
      let failed = 0;

      for (const tournament of tournamentsToClose) {
        try {
          await this.closeTournamentRegistration(tournament);
          closed++;
        } catch (err) {
          console.error(`[RegistrationDeadlineService] Failed to close tournament ${tournament.id}:`, err.message);
          failed++;
        }
      }

      console.log(`[RegistrationDeadlineService] Processed: ${tournamentsToClose.length}, Closed: ${closed}, Failed: ${failed}`);
      return { processed: tournamentsToClose.length, closed, failed };
    } catch (error) {
      console.error("[RegistrationDeadlineService] Error processing deadlines:", error);
      throw error;
    }
  }

  /**
   * Close registration for a specific tournament
   * Attempts auto-fixture generation if prerequisites met
   */
  static async closeTournamentRegistration(tournament) {
    try {
      console.log(`[RegistrationDeadlineService] Closing registration for tournament ${tournament.id}`);

      // Update status to registration_closed
      await tournament.update({ status: "registration_closed" });

      // Log the automatic close action
      await AuditLog.create({
        action: "tournament_registration_auto_closed",
        entityType: "tournament",
        entityId: tournament.id,
        userId: tournament.organizationId, // Use organization as system user
        notes: `Registration automatically closed at deadline: ${tournament.registrationDeadline}`,
      });

      // Attempt auto fixture generation
      await this.attemptAutoFixtureGeneration(tournament);

      console.log(`[RegistrationDeadlineService] ✅ Successfully closed registration for tournament ${tournament.id}`);
    } catch (error) {
      console.error(`[RegistrationDeadlineService] Error closing tournament ${tournament.id}:`, error);
      throw error;
    }
  }

  /**
   * Attempt automatic fixture generation when registration closes
   * Includes deduplication to prevent duplicate matches
   */
  static async attemptAutoFixtureGeneration(tournament) {
    try {
      // Check if matches already exist (deduplication)
      const existingMatches = await TournamentMatch.count({
        where: { tournamentId: tournament.id },
      });

      if (existingMatches > 0) {
        console.warn(
          `[RegistrationDeadlineService] Skipping fixture generation for tournament ${tournament.id}: ${existingMatches} matches already exist`
        );
        return;
      }

      // Get prerequisites
      const format = await TournamentFormat.findOne({
        where: { tournamentId: tournament.id },
      });

      const scoringRules = await TournamentScoringRules.findOne({
        where: { tournamentId: tournament.id },
      });

      const participants = await TournamentParticipant.findAll({
        where: { tournamentId: tournament.id, status: "approved" },
        include: [
          {
            association: "player",
            include: [{ model: PlayerRankingProfile, as: "rankingProfile" }],
          },
        ],
      });

      // Check prerequisites
      if (!format) {
        console.warn(`[RegistrationDeadlineService] No format configured for tournament ${tournament.id}`);
        return;
      }

      if (!scoringRules) {
        console.warn(`[RegistrationDeadlineService] No scoring rules for tournament ${tournament.id}`);
        return;
      }

      if (participants.length < 2) {
        console.warn(
          `[RegistrationDeadlineService] Insufficient participants for tournament ${tournament.id}: ${participants.length} < 2`
        );
        return;
      }

      // Generate fixtures
      console.log(
        `[RegistrationDeadlineService] Auto-generating fixtures for tournament ${tournament.id} with ${participants.length} participants`
      );

      const seedingType = format.seeding || "random";
      const seededParticipants = BracketGenerator.applySeeding(participants, seedingType);
      const seededPlayerIds = seededParticipants
        .map((p) => p.playerId)
        .filter((id) => id != null);

      // Update seed numbers
      for (let i = 0; i < seededParticipants.length; i++) {
        await seededParticipants[i].update({ seed: i + 1 });
      }

      if (seededPlayerIds.length < 2) {
        console.warn(`[RegistrationDeadlineService] Invalid player IDs for tournament ${tournament.id}`);
        return;
      }

      // Generate matches based on format
      let matches = [];
      let knockoutRoundMeta = null;
      let rrRoundsMeta = null;
      if (format.type === "knockout") {
        const result = BracketGenerator.generateKnockoutMatches(
          seededPlayerIds,
          tournament.id,
          format.byesHandling || "random_bye"
        );
        matches = result.matches;
        knockoutRoundMeta = {
          bracketSize: result.bracketSize,
          byeByPairIndex: result.byeByPairIndex || {},
        };
      } else if (format.type === "round_robin") {
        const playerNamesById = {};
        for (const p of seededParticipants) {
          if (p.playerId && p.player?.name) playerNamesById[p.playerId] = p.player.name;
        }
        const result = BracketGenerator.generateRoundRobinMatches(
          seededPlayerIds,
          tournament.id,
          playerNamesById
        );
        matches = result.matches;
        rrRoundsMeta = result.roundsMeta;
      } else if (format.type === "swiss") {
        const SwissPairingEngine = require("./SwissPairingEngine");
        const n = seededPlayerIds.length;
        if (!format.maxRounds && n >= 2) {
          await format.update({ maxRounds: SwissPairingEngine.defaultSwissRoundCount(n) });
        }
        const pairings = BracketGenerator.generateSwissPairings(seededParticipants, {
          seeding: format.seeding || "random",
        });
        matches = pairings.map((pair) => ({
          tournamentId: tournament.id,
          roundNumber: 1,
          roundType: "swiss",
          player1Id: pair.player1Id,
          player2Id: pair.player2Id,
          status: pair.player2Id ? "scheduled" : "completed",
          winner: pair.player2Id ? null : "player1",
          // Swiss BYE rows are identified by `player2Id: null` and always score +1.
          // Do not mark as walkovers.
          isWalkover: false,
        }));
      } else if (format.type === "groups_knockout") {
        const result = BracketGenerator.generateGroupKnockoutMatches(
          seededPlayerIds,
          tournament.id,
          format.groupCount,
          format.playersPerGroup,
          format.qualifiersPerGroup
        );
        matches = result.matches;
      }

      if (matches.length === 0) {
        console.warn(`[RegistrationDeadlineService] No matches generated for tournament ${tournament.id}`);
        return;
      }

      // Create round
      const roundType =
        format.type === "knockout"
          ? "knockout_16"
          : format.type === "round_robin"
          ? "group_stage"
          : format.type === "groups_knockout"
          ? "group_stage"
          : format.type;

      const startDateObj = tournament.startDate instanceof Date
        ? tournament.startDate
        : new Date(tournament.startDate);

      if (format.type === "round_robin" && rrRoundsMeta) {
        const matchesByRound = {};
        for (const m of matches) {
          matchesByRound[m.roundNumber] = (matchesByRound[m.roundNumber] || 0) + 1;
        }
        const roundRows = rrRoundsMeta.map((meta) => ({
          tournamentId: tournament.id,
          roundNumber: meta.roundNumber,
          roundType,
          name: `Round ${meta.roundNumber}`,
          status: meta.roundNumber === 1 ? "in_progress" : "not_started",
          totalMatches: matchesByRound[meta.roundNumber] || 0,
          description: JSON.stringify({
            byePlayers: meta.byePlayers,
            roundRobin: true,
          }),
        }));
        const createdRounds = await TournamentRound.bulkCreate(roundRows);
        const roundNumToId = Object.fromEntries(createdRounds.map((r) => [r.roundNumber, r.id]));

        const createdMatches = await TournamentMatch.bulkCreate(
          matches.map((m) => ({
            ...m,
            roundId: roundNumToId[m.roundNumber],
            bestOfFrames: format.bestOfFrames ?? null,
            scheduledDate: startDateObj,
            scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
          }))
        );

        // Store in fixtures table for unified access
        const fixtureRecords = createdMatches.map((match) => {
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
            tournamentId: tournament.id,
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
          await Fixture.bulkCreate(fixtureRecords);
        } catch (err) {
          console.error("[RegistrationDeadlineService] Error storing fixtures:", err.message);
        }
      } else {
        const totalRoundMatches =
          format.type === "swiss"
            ? matches.filter((m) => m.player2Id).length
            : matches.length;
        const round = await TournamentRound.create({
          tournamentId: tournament.id,
          roundNumber: 1,
          roundType,
          name: "Round 1",
          status: "not_started",
          totalMatches: totalRoundMatches,
        });

        if (format.type === "knockout" && knockoutRoundMeta?.bracketSize) {
          await round.update({
            description: JSON.stringify({
              knockoutBracketSize: knockoutRoundMeta.bracketSize,
              byeByPairIndex: knockoutRoundMeta.byeByPairIndex || {},
            }),
            totalMatches: matches.length,
          });
        }

        const createdMatches = await TournamentMatch.bulkCreate(
          matches.map((m) => ({
            ...m,
            roundId: round.id,
            scheduledDate: startDateObj,
            scheduledDeadline: new Date(startDateObj.getTime() + 7 * 24 * 60 * 60 * 1000),
          }))
        );

        // Store in fixtures table for unified access
        const fixtureRecords = createdMatches.map((match) => {
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
            tournamentId: tournament.id,
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
            stage: format.type === "knockout" ? "knockout" : (format.type === "swiss" ? "swiss" : "knockout"),
            matchIndex: match.matchNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        try {
          await Fixture.bulkCreate(fixtureRecords);
        } catch (err) {
          console.error("[RegistrationDeadlineService] Error storing fixtures:", err.message);
        }
      }

      // Update tournament status
      await tournament.update({
        status: "in_progress",
        currentRound: 1,
        bracketStatus: "generated",
        bracketGeneratedAt: new Date(),
      });

      // Log success
      await AuditLog.create({
        action: "bracket_auto_generated",
        entityType: "tournament",
        entityId: tournament.id,
        userId: tournament.organizationId,
        notes: `Auto-generated ${matches.length} matches on registration deadline (${format.type})`,
      });

      console.log(`[RegistrationDeadlineService] ✅ Auto-generated ${matches.length} fixtures for tournament ${tournament.id}`);
    } catch (error) {
      console.warn(
        `[RegistrationDeadlineService] Auto fixture generation failed for tournament ${tournament.id}:`,
        error.message
      );
      // Don't throw - allow manual fixture generation as fallback
    }
  }
}

module.exports = RegistrationDeadlineService;
