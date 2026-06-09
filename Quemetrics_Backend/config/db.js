const { Sequelize } = require("sequelize");
require("dotenv").config(); // load .env variables

// Default to development if NODE_ENV not set
const nodeEnv = process.env.NODE_ENV || "development";
const isDevelopment = nodeEnv === "development";

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || "mysql",
    logging: isDevelopment ? console.log : false,
    // NOTE: MySQL `max_user_connections` is typically low; an oversized Sequelize pool
    // can trigger `ER_TOO_MANY_USER_CONNECTIONS`. Cap pool size to a safe upper bound.
    dialectOptions: {
      connectTimeout: 10000,   // 10s to establish connection
      // socketTimeout: 45000,    // 45s max for any query (matches server request timeout)
    },
    
    pool: {
      max: Math.min(Number(process.env.DB_POOL_MAX) || 5, 50),
      min: Math.min(Number(process.env.DB_POOL_MIN) || 0, 2),
      // If the pool can't provide a connection quickly, fail fast instead of piling up.
      acquire: Number(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: Number(process.env.DB_POOL_IDLE) || 10000,
      evict: 10000,  // Check for dead connections every 10s
      validate: (connection) => {
        // Return false = connection is dead, pool will get a new one
        return connection && connection.threadId != null;
      },
    },
    logging: isDevelopment ? console.log : false,
  }
);

// ============================================================================
// Initialize Database - Authentication, Migrations, and Sync
// ============================================================================
// Export a promise that resolves when initialization is complete
const dbInitPromise = (async () => {
  try {
    // Authenticate connection
    await sequelize.authenticate();
    console.log(`✅ Database authenticated. [Connected to: ${process.env.DB_NAME}]\n`);

    // Load models
    require("../models");
    console.log("✅ Models loaded.");

    // Sync database with models - this replaces the manual migration runner
    // ONLY run if DB_SYNC is explicitly set to 'true' to prevent overhead/crashes on every startup
    const shouldSync = process.env.DB_SYNC === 'true';

    if (shouldSync) {
      console.log("🔄 Synchronizing database schema...");
      const syncOptions = {
        // alter: { drop: true }, // Allow dropping orphan indexes/columns to fix schema issues
        logging: isDevelopment ? console.log : false
      };

      if (isDevelopment) {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      }

      await sequelize.sync(syncOptions);

      if (isDevelopment) {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      }
      console.log("✅ Database synchronized with models.");
    } else {
      console.log("ℹ️ Skipping database sync (DB_SYNC not set to true).");
    }

    // Seed default games on startup - moved here to ensure tables exist first
    const { seedGames } = require('../utils/seedGames');
    await seedGames();
    // Initialize cron jobs for account lifecycle management
    const { initializeCronJobs } = require('../utils/cronJobs');
    initializeCronJobs();

    console.log("✅ Database initialization complete.\n");
    return true;
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    // Don't exit here, let the caller handle it or wait
    throw error;
  }
})();

module.exports = sequelize;
module.exports.dbInitPromise = dbInitPromise;
