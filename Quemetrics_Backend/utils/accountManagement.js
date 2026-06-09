const { User, Player } = require("../models");
const { Op } = require("sequelize");

/**
 * ✅ ACCOUNT LIFECYCLE MANAGEMENT
 *
 * This utility handles automatic account status updates based on inactivity:
 * - After 12 months: Status → Inactive
 * - After 24 months: Anonymise account (remove personal data, keep match history)
 */

/**
 * Mark accounts as Inactive if no login for 12 months
 */
async function markInactiveAccounts() {
  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const result = await User.update(
      { status: "Inactive" },
      {
        where: {
          status: "Active",
          lastLoginAt: {
            [Op.lt]: twelveMonthsAgo,
          },
        },
      }
    );

    console.log(`[markInactiveAccounts] Marked ${result[0]} accounts as Inactive (no login for 12 months)`);
    return result[0];
  } catch (error) {
    console.error("[markInactiveAccounts] Error:", error);
    throw error;
  }
}

/**
 * Anonymise accounts after 24 months of inactivity
 * - Remove email (set to anonymised+userId@system.local)
 * - Remove personal data from Player profile
 * - Change name to "Former Player"
 * - Keep match history intact (NEVER delete competitive data)
 */
async function anonymiseInactiveAccounts() {
  try {
    const twentyFourMonthsAgo = new Date();
    twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

    // Find users to anonymise
    const usersToAnonymise = await User.findAll({
      where: {
        status: {
          [Op.in]: ["Active", "Inactive"],
        },
        lastLoginAt: {
          [Op.lt]: twentyFourMonthsAgo,
        },
      },
      include: [
        {
          model: Player,
          as: "player",
        },
      ],
    });

    let anonymisedCount = 0;

    for (const user of usersToAnonymise) {
      // Update User account
      await user.update({
        status: "Anonymised",
        email: `anonymised+${user.id}@system.local`,
        password: null, // Remove password hash
        refreshToken: null,
      });

      // Update Player profile (remove personal data but keep competitive data)
      if (user.player) {
        await user.player.update({
          name: "Former Player",
          nickname: null,
          mobileNumber: null,
          address: null,
          bio: null,
          avatarUrl: null,
          // Keep: badgeType, sports, dateOfBirth (for age category), experienceLevel
          // Keep all match history associations
        });
      }

      anonymisedCount++;
      console.log(`[anonymiseInactiveAccounts] Anonymised user ${user.id} and player profile`);
    }

    console.log(`[anonymiseInactiveAccounts] Total anonymised: ${anonymisedCount} accounts`);
    return anonymisedCount;
  } catch (error) {
    console.error("[anonymiseInactiveAccounts] Error:", error);
    throw error;
  }
}

/**
 * Run all account lifecycle checks
 * This should be called by a cron job (e.g., daily at midnight)
 */
async function runAccountLifecycleChecks() {
  console.log("[runAccountLifecycleChecks] Starting account lifecycle checks...");

  try {
    const inactiveCount = await markInactiveAccounts();
    const anonymisedCount = await anonymiseInactiveAccounts();

    console.log("[runAccountLifecycleChecks] Completed:", {
      markedInactive: inactiveCount,
      anonymised: anonymisedCount,
    });

    return {
      success: true,
      inactiveCount,
      anonymisedCount,
    };
  } catch (error) {
    console.error("[runAccountLifecycleChecks] Failed:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  markInactiveAccounts,
  anonymiseInactiveAccounts,
  runAccountLifecycleChecks,
};
