const cron = require("node-cron");
const { runAccountLifecycleChecks } = require("../utils/accountManagement");
const { autoConfirmExpiredResults } = require("../services/matchResultEnforcementService");
const { processAutoForfeitForAllTournaments } = require("../services/TournamentSchedulingService");
const RankingSnapshotService = require("../services/RankingSnapshotService");

/**
 * ✅ CRON JOB SCHEDULER
 *
 * Schedules automated tasks for account lifecycle management and match results
 */

function initializeCronJobs() {
  console.log("[CRON] Initializing scheduled tasks...");

  // Run account lifecycle checks daily at 2:00 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("[CRON] Running daily account lifecycle checks...");
    try {
      await runAccountLifecycleChecks();
    } catch (err) {
      console.error("[CRON] Error in account lifecycle checks:", err);
    }
  });

  // Run match result auto-confirmation every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[CRON] Running hourly match result auto-confirmation checks...");
    try {
      await autoConfirmExpiredResults();
    } catch (err) {
      console.error("[CRON] Error in match result auto-confirmation:", err);
    }
  });

  // Run auto-forfeit for overdue matches every hour
  cron.schedule("0 * * * *", async () => {
    console.log("[CRON] Running hourly auto-forfeit checks for overdue matches...");
    try {
      const result = await processAutoForfeitForAllTournaments();
      if (result.updated > 0) {
        console.log(`[CRON] Auto-forfeited ${result.updated} overdue matches`);
      }
    } catch (err) {
      console.error("[CRON] Error in auto-forfeit checks:", err);
    }
  });

  // Build season ranking snapshots every hour (append-only snapshot batches).
  cron.schedule("15 * * * *", async () => {
    console.log("[CRON] Rebuilding season ranking snapshots...");
    try {
      const results = await RankingSnapshotService.rebuildActiveSeasonSnapshots();
      const successCount = results.filter((r) => r?.success).length;
      console.log(`[CRON] Ranking snapshots complete: ${successCount}/${results.length} successful`);
    } catch (err) {
      console.error("[CRON] Error rebuilding ranking snapshots:", err);
    }
  });

  console.log("[CRON] ✓ Match result auto-confirmation scheduled (hourly)");
  console.log("[CRON] ✓ Auto-forfeit for overdue matches scheduled (hourly)");
  console.log("[CRON] ✓ Season ranking snapshot rebuild scheduled (hourly at :15)");
  console.log("[CRON] ✓ Account lifecycle checks scheduled (daily at 2:00 AM)");
}

module.exports = { initializeCronJobs };
