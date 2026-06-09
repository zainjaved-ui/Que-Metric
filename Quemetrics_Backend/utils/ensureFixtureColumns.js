const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");

let ensured = false;

/** Adds missing columns to fixtures table if they don't exist. Safe to call repeatedly. */
async function ensureFixtureColumns() {
  if (ensured) return;
  try {
    const qi = sequelize.getQueryInterface();
    const tableDesc = await qi.describeTable("fixtures");

    // Check for 'date' column
    if (!tableDesc.date) {
      await qi.addColumn("fixtures", "date", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Actual date/time the match was played"
      });
      console.log("[schema] Added column 'date' to fixtures");
    }

    // Check for 'scheduledDate' column (just in case)
    if (!tableDesc.scheduledDate) {
      await qi.addColumn("fixtures", "scheduledDate", {
        type: DataTypes.DATE,
        allowNull: true,
      });
      console.log("[schema] Added column 'scheduledDate' to fixtures");
    }

    // Check for 'stage' column (used in knockout/swiss)
    if (!tableDesc.stage) {
      await qi.addColumn("fixtures", "stage", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'league'
      });
      console.log("[schema] Added column 'stage' to fixtures");
    }

    // Check for 'matchIndex' column
    if (!tableDesc.matchIndex) {
      await qi.addColumn("fixtures", "matchIndex", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
      console.log("[schema] Added column 'matchIndex' to fixtures");
    }

    // Check for 'resultData' column
    if (!tableDesc.resultData) {
      await qi.addColumn("fixtures", "resultData", {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      });
      console.log("[schema] Added column 'resultData' to fixtures");
    }

    ensured = true;
  } catch (e) {
    console.error("[schema] ensureFixtureColumns error:", e.message || e);
  }
}

module.exports = { ensureFixtureColumns };
