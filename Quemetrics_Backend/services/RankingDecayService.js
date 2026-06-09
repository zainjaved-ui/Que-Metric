// const { RankingEngine } = require("../controllers/tournamentManager");

/**
 * Ranking Points Decay disabled temporarily — scheduled decay runs are not started (see app.js).
 * Original implementation preserved in block comments below.
 */
class RankingDecayService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the ranking decay service.
   * Runs daily to apply gradual decay to all ranking points.
   */
  start(/* intervalMs = 24 * 60 * 60 * 1000 */) {
    // Ranking Points Decay disabled temporarily
    return;
    /*
    if (this.intervalId) {
      console.log("[RankingDecayService] Already running");
      return;
    }

    console.log("[RankingDecayService] Starting (interval: every", Math.round(intervalMs / 3600000), "hours)");

    // Run immediately on startup
    this.runDecay();

    // Schedule periodic runs
    this.intervalId = setInterval(() => this.runDecay(), intervalMs);
    */
  }

  stop() {
    // Ranking Points Decay disabled temporarily
    return;
    /*
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[RankingDecayService] Stopped");
    }
    */
  }

  async runDecay() {
    // Ranking Points Decay disabled temporarily
    return;
    /*
    if (this.isRunning) {
      console.log("[RankingDecayService] Skipping (previous run still in progress)");
      return;
    }

    this.isRunning = true;
    try {
      const { RankingEngine } = require("../controllers/tournamentManager");
      const result = await RankingEngine.applyRankingDecay();
      if (result.expired > 0 || result.decayed > 0) {
        console.log(
          `[RankingDecayService] Processed ${result.processed} records: ${result.expired} expired, ${result.decayed} decayed`
        );
      }
    } catch (error) {
      console.error("[RankingDecayService] Error:", error.message);
    } finally {
      this.isRunning = false;
    }
    */
  }
}

module.exports = new RankingDecayService();
