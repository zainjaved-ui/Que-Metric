const express = require("express");
const router = express.Router();
const clubController = require("../controllers/clubController");
const clubMemberController = require("../controllers/clubMemberController");
const clubVenueController = require("../controllers/clubVenueController");
const { authenticate, requireRole } = require("../middleware/auth");

// ========================================
// Club CRUD Operations
// ========================================

// Create new club (any authenticated user with player role)
router.post(
  "/",
  authenticate,
  clubController.createClub
);

// Get all clubs (public and user's clubs)
router.get(
  "/",
  authenticate,
  clubController.getClubs
);

// Get my clubs (where user is a member)
router.get(
  "/my-clubs",
  authenticate,
  clubController.getMyClubs
);

// Get all membership requests (pending, active, rejected)
router.get(
  "/membership-requests",
  authenticate,
  clubController.getMembershipRequests
);

// Get pending clubs for verification (super admin and org owners only)
router.get(
  "/pending-verification/list",
  authenticate,
  clubController.getPendingClubs
);

// Verify/approve a club (set to active)
router.post(
  "/:clubId/verify",
  authenticate,
  clubController.verifyClub
);

// Reject a club verification
router.post(
  "/:clubId/reject",
  authenticate,
  clubController.rejectClub
);

// Verify club email (token-based verification) - PUBLIC endpoint, no auth required
router.post(
  "/:clubId/verify-email",
  clubController.verifyClubEmail
);

// Resend club email verification - Creates new token (PUBLIC endpoint, no auth required)
router.post(
  "/:clubId/resend-verification",
  clubController.resendClubVerificationEmail
);

// Validate invitation token (PUBLIC) - Get club info without joining
router.get(
  "/validate-invitation/:token",
  clubController.validateInvitationToken
);

// Join club via invitation token (requires authentication)
router.post(
  "/join-via-invitation/:token",
  authenticate,
  clubController.joinViaInvitation
);

// Validate join code (PUBLIC) - Get club info by code without joining
router.post(
  "/validate-code",
  clubController.validateJoinCode
);

// Join club by join code (requires authentication)
router.post(
  "/join-by-code",
  authenticate,
  clubController.joinByCode
);

// Join public club (requires authentication)
router.post(
  "/join/:clubId",
  authenticate,
  clubController.joinPublicClub
);

// Get single club by ID or slug
router.get(
  "/:identifier",
  authenticate,
  clubController.getClubById
);

// Update club details (admin only)
router.put(
  "/:clubId",
  authenticate,
  clubController.updateClub
);

// Archive club (soft delete, preserves history)
router.post(
  "/:clubId/archive",
  authenticate,
  clubController.archiveClub
);

// Suspend club
router.post(
  "/:clubId/suspend",
  authenticate,
  clubController.suspendClub
);

// Reactivate club
router.post(
  "/:clubId/reactivate",
  authenticate,
  clubController.reactivateClub
);

// Update join settings
router.put(
  "/:clubId/join-settings",
  authenticate,
  clubController.updateJoinSettings
);

// Check if club can be deleted (admin or super admin)
router.get(
  "/:clubId/can-delete",
  authenticate,
  clubController.canDeleteClub
);

// Delete club permanently (Super Admin only, test clubs with zero data)
router.delete(
  "/:clubId",
  authenticate,
  clubController.deleteClub
);

// Generate invitation link for club
router.post(
  "/:clubId/generate-invitation",
  authenticate,
  clubController.generateInvitationLink
);

// Verify club (Super Admin only)
router.post(
  "/:clubId/verify",
  authenticate,
  clubController.verifyClub
);

// ========================================
// Member Management
// ========================================

// Get club members
router.get(
  "/:clubId/members",
  authenticate,
  clubMemberController.getClubMembers
);

// Invite member to club
router.post(
  "/:clubId/members/invite",
  authenticate,
  clubMemberController.inviteMember
);

// Remove member from club
router.delete(
  "/:clubId/members/:memberId",
  authenticate,
  clubMemberController.removeMember
);

// Update member role
router.put(
  "/:clubId/members/:memberId/role",
  authenticate,
  clubMemberController.updateMemberRole
);

// Update member status
router.put(
  "/:clubId/members/:memberId/status",
  authenticate,
  clubMemberController.updateMemberStatus
);

// Approve a pending join request
router.post(
  "/:clubId/members/:memberId/approve",
  authenticate,
  clubMemberController.approveMemberRequest
);

// Reject a pending join request
router.post(
  "/:clubId/members/:memberId/reject",
  authenticate,
  clubMemberController.rejectMemberRequest
);

// Transfer club ownership
router.post(
  "/:clubId/transfer-ownership",
  authenticate,
  clubMemberController.transferOwnership
);

// Leave club (voluntary)
router.post(
  "/:clubId/leave",
  authenticate,
  clubMemberController.leaveClub
);

// ========================================
// Venue Management
// ========================================

// Get all venues for a club
router.get(
  "/:clubId/venues",
  authenticate,
  clubVenueController.getClubVenues
);

// Create a new venue for a club
router.post(
  "/:clubId/venues",
  authenticate,
  requireRole("organization", "club_admin", "assistant_admin"),
  clubVenueController.createClubVenue
);

// Update a venue
router.put(
  "/:clubId/venues/:venueId",
  authenticate,
  requireRole("organization", "club_admin", "assistant_admin"),
  clubVenueController.updateClubVenue
);

// Delete a venue
router.delete(
  "/:clubId/venues/:venueId",
  authenticate,
  requireRole("organization", "club_admin", "assistant_admin"),
  clubVenueController.deleteClubVenue
);

module.exports = router;
