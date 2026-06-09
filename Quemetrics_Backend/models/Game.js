// models/Game.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Game = sequelize.define(
  "Game",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: "Game name: Snooker, Pool, or Poker",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "games",
    timestamps: true,
  }
);

// Normalize name to Capital Case (e.g., snooker -> Snooker) before saving
Game.addHook('beforeValidate', (game) => {
  if (game.name) {
    const trimmed = game.name.trim();
    game.name = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
});

// Add virtual getter for slug - computed from name (lowercase, spaces to underscores)
Game.addHook('afterFind', (instances) => {
  const addSlug = (instance) => {
    if (instance && instance.dataValues) {
      const name = instance.dataValues.name;
      instance.dataValues.slug = name ? name.toLowerCase().replace(/\s/g, '_') : null;
    }
  };

  if (Array.isArray(instances)) {
    instances.forEach(addSlug);
  } else {
    addSlug(instances);
  }
});

module.exports = Game;
