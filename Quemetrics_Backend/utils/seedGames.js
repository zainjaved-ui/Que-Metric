// utils/seedGames.js
const { Game } = require("../models");

/**
 * Seed default games (Snooker, Pool, Pooker) on server startup
 * Checks if games exist and adds missing ones
 *
 * NOTE: slug is auto-generated from game name via model hook
 * Snooker -> snooker
 * Pool -> pool
 * Pooker -> poker (handled specially)
 */
const seedGames = async () => {
  try {
    const defaultGames = [
      { name: "Snooker", description: "Classic cue sport played with 15 red balls and colored balls" },
      { name: "Pool", description: "Cue sport played with 9 or 15 balls in various formats" },
      { name: "Pooker", description: "Hybrid cue sport combining elements of pool and snooker" },
    ];

    for (const gameData of defaultGames) {
      const existingGame = await Game.findOne({
        where: Game.sequelize.where(
          Game.sequelize.fn('LOWER', Game.sequelize.col('name')),
          gameData.name.toLowerCase()
        ),
      });

      if (!existingGame) {
        await Game.create(gameData);
        console.log(`✓ Game created: ${gameData.name}`);
      } else {
        // If game exists but with different casing (e.g. 'snooker'), update it to 'Snooker'
        if (existingGame.name !== gameData.name) {
          await existingGame.update({ name: gameData.name });
          console.log(`✓ Game casing updated: ${existingGame.name} -> ${gameData.name}`);
        } else {
          console.log(`✓ Game already exists: ${gameData.name}`);
        }
      }
    }

    console.log("✓ Game seeding completed successfully");
  } catch (error) {
    console.error("Error seeding games:", error.message);
    throw error;
  }
};

module.exports = { seedGames };
