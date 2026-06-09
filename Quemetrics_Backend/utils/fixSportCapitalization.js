/**
 * One-time migration script: Fix sport capitalization in leagues & tournaments tables.
 * Run with: node utils/fixSportCapitalization.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: false,
  }
);

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function fixSportCapitalization() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database.');

    // --- Fix leagues table ---
    const [leagues] = await sequelize.query(
      `SELECT id, sport FROM leagues WHERE sport IS NOT NULL`
    );

    console.log(`\n📋 Found ${leagues.length} leagues to check...`);
    let leagueFixed = 0;

    for (const league of leagues) {
      const fixed = capitalize(league.sport);
      if (fixed !== league.sport) {
        await sequelize.query(
          `UPDATE leagues SET sport = ? WHERE id = ?`,
          { replacements: [fixed, league.id] }
        );
        console.log(`  ✔ League ${league.id}: "${league.sport}" → "${fixed}"`);
        leagueFixed++;
      }
    }

    console.log(`\n✅ Fixed ${leagueFixed} leagues (${leagues.length - leagueFixed} were already correct).`);

    // --- Fix tournaments table ---
    const [tournaments] = await sequelize.query(
      `SELECT id, sport FROM tournaments WHERE sport IS NOT NULL`
    );

    console.log(`\n📋 Found ${tournaments.length} tournaments to check...`);
    let tournamentFixed = 0;

    for (const tournament of tournaments) {
      const fixed = capitalize(tournament.sport);
      if (fixed !== tournament.sport) {
        await sequelize.query(
          `UPDATE tournaments SET sport = ? WHERE id = ?`,
          { replacements: [fixed, tournament.id] }
        );
        console.log(`  ✔ Tournament ${tournament.id}: "${tournament.sport}" → "${fixed}"`);
        tournamentFixed++;
      }
    }

    console.log(`\n✅ Fixed ${tournamentFixed} tournaments (${tournaments.length - tournamentFixed} were already correct).`);
    console.log('\n🎉 Migration complete! All sport values are now in Capital Case.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

fixSportCapitalization();
