/**
 * Shown on dashboards when the signed-in user has not verified their email.
 */
export default function EmailVerificationBanner({ user }) {
  if (!user || user.emailVerified !== false) {
    return null;
  }

  return (
    <div
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
    >
      Please verify your email address to unlock all features. Check your inbox for the verification link.
    </div>
  );
}
