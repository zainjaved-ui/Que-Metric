const { User, Player } = require("../models");

// Get all users with role="player"
exports.getAllPlayers = async (req, res) => {
  try {
    const players = await User.findAll({
      where: { role: "player" },
      attributes: ["id", "email", "isActive"],
      include: [
        {
          association: "playerProfile",
          attributes: ["id", "name", "nickname", "sports", "organizationId"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: players.map(user => ({
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        ...user.playerProfile?.toJSON(),
      })),
      message: `Retrieved ${players.length} players`,
    });
  } catch (error) {
    console.error("getAllPlayers error:", error.message || error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};
