const { Organization } = require("../models");

exports.getVerifiedOrganizations = async (req, res) => {
  try {
    const organizations = await Organization.findAll({
      where: { isVerified: true },
      attributes: ["id", "organizationName", "organizationType", "logoUrl"],
      order: [["organizationName", "ASC"]],
    });

    res.json({
      success: true,
      data: organizations,
      message: "Organizations retrieved",
    });
  } catch (error) {
    console.error("getVerifiedOrganizations error:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
};
