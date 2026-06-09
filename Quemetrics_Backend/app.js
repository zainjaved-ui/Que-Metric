// TOP of app.js — Global error handlers to prevent silent crashes
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  // Do NOT exit — keep server alive for other requests
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  process.exit(1); // Let PM2 or the service manager restart it
});

var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
require('dotenv').config();
var cors = require("cors");
var compression = require("compression");

// Optionally suppress console output (useful when running in tests or CI)
if (process.env.SILENCE_CONSOLE === "true") {
  console.log = () => { };
  console.info = () => { };
  console.warn = () => { };
  console.error = () => { };
}


// Routes
var indexRouter = require("./routes/index");
var authRouter = require("./routes/auth");
var organizationRouter = require("./routes/organization");
var venueOwnerRouter = require("./routes/venueOwner");
var playerRouter = require("./routes/player");
var leagueRouter = require("./routes/league");
var tournamentRouter = require("./routes/tournament");
var uploadsRouter = require("./routes/uploads");
var adminRouter = require("./routes/admin");
var publicRouter = require("./routes/public");
var healthRouter = require("./routes/health");
var userRouter = require("./routes/UserRoutes");
var bookingRouter = require("./routes/booking");
var venueRouter = require("./routes/venue");
var tablesRouter = require("./routes/tables");
var slotsRouter = require("./routes/slots");
var matchResultRouter = require("./routes/matchResult");
var matchAliasRouter = require("./routes/matchAlias");
var clubRouter = require("./routes/club");
var notificationRouter = require("./routes/notification");

var app = express();

// Prevent conditional GET with ETag/304 returning stale booking/slot data
// (this is especially important when bookings are cancelled/deleted and the UI
// must immediately reflect the new availability).
app.set("etag", false);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

// Middleware
app.use(compression()); // enable gzip compression

// CORS configuration: allow all origins and ports
app.use(
  cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'Cache-Control', 'Pragma', 'Expires'],
  })
);

app.use(logger("dev"));
// Increase payload limits to 500mb for large wizard data
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Hard-disable caching for API responses and set request timeout.
// Timeout prevents hanging requests from consuming server resources indefinitely.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.removeHeader?.("ETag");

  // Set 45s request timeout — FIXES infinite backend hangs
  res.setTimeout(45000, () => {
    if (!res.headersSent) {
      console.warn(`[TIMEOUT] Request to ${req.originalUrl} timed out after 45s`);
      res.status(504).json({
        success: false,
        error: 'Request timeout — server took too long to respond.'
      });
    }
  });

  next();
});

// API Routes
app.use("/", indexRouter);
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/organization", organizationRouter);
// Plural alias — frontend and some clients call /api/organizations/...
app.use("/api/organizations", organizationRouter);
app.use("/api/venue-owner", venueOwnerRouter);
app.use("/api/player", playerRouter);
app.use("/api/leagues", leagueRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/public", publicRouter);
app.use("/api/user", userRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/venues", venueRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/slots", slotsRouter);
app.use("/api/match-results", matchResultRouter);
app.use("/api/matches", matchAliasRouter);
app.use("/api/clubs", clubRouter);
app.use("/api/notifications", notificationRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler – includes CORS headers and JSON responses
app.use(function (err, req, res, next) {
  // Set CORS headers for all error responses
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  // Build base error response
  const response = { success: false, error: err.message };
  const status = err.status || err.statusCode || 500;

  // Include error code if available (useful for client-side error handling)
  if (err.code) {
    response.code = err.code;
  }

  // Add any custom properties (e.g., requiresVerification from auth middleware)
  if (err.requiresVerification) {
    response.requiresVerification = true;
  }

  // Handle 413 Payload Too Large specifically
  if (status === 413) {
    return res.status(413).json({
      success: false,
      error: 'Payload too large. Please reduce the amount of data or contact support.'
    });
  }

  // Default: send status and JSON response
  res.status(status).json(response);
});

// ============================================================================
// DATABASE MIGRATIONS: Bootstrap
// ============================================================================
// Run pending migrations on startup to ensure schema is current
// const { bootstrapMigrations } = require("./config/migrationBootstrap");
// bootstrapMigrations().catch(err => {
//   console.error('⚠️  Migration bootstrap error (non-blocking):', err.message);
// });

// ============================================================================
// SCHEDULED TASKS: Registration Deadline Service
// ============================================================================
// Initialize registration deadline checker - runs every minute to auto-close registrations
const RegistrationDeadlineService = require("./services/RegistrationDeadlineService");
const TournamentSchedulingService = require("./services/TournamentSchedulingService");

// Start the scheduled job to check registration deadlines every 60 seconds (at 0s, 60s...)
const runRegistrationCheck = async () => {
  try {
    await RegistrationDeadlineService.processRegistrationDeadlines();
  } catch (error) {
    console.error("Error in registration deadline scheduler:", error);
  }
};
runRegistrationCheck();
setInterval(runRegistrationCheck, 60000);

console.log("✅ Registration Deadline Service initialized - checks every 60 seconds");

// Auto-forfeit overdue tournament matches every minute, but offset by 30s
// to avoid competing with registration checks for DB connections.
setTimeout(() => {
  const runAutoForfeitCheck = async () => {
    try {
      await TournamentSchedulingService.processAutoForfeitForAllTournaments();
    } catch (error) {
      console.error("Error in tournament auto-forfeit scheduler:", error);
    }
  };
  runAutoForfeitCheck();
  setInterval(runAutoForfeitCheck, 60000);
  console.log("✅ Tournament Auto-Forfeit Service initialized - checks every 60 seconds (offset by 30s)");
}, 30000); // 30 second delay for the first run

// ============================================================================
// SCHEDULED TASKS: Ranking Decay Service
// Ranking Points Decay disabled temporarily
// ============================================================================
// const RankingDecayService = require("./services/RankingDecayService");
// RankingDecayService.start(24 * 60 * 60 * 1000); // Run daily
// console.log("✅ Ranking Decay Service initialized - runs daily");

module.exports = app;