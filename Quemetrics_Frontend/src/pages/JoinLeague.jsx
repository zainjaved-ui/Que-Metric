import React, { useState, useEffect, useContext } from 'react';
import { useSearchParams, useNavigate, Link, useParams } from 'react-router-dom';
import { LeagueContext } from '../contexts/LeagueContext';
import { AuthContext } from '../contexts/AuthContext';
import { FaTrophy, FaCheckCircle, FaTimesCircle, FaSpinner, FaLock, FaSignInAlt } from 'react-icons/fa';

/**
 * /join?token=xxx&leagueId=xxx
 * Handles shareable invite link joining for league invite flow.
 */
export default function JoinLeaguePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { token: pathToken } = useParams();
  const token = pathToken || searchParams.get('token');
  const leagueId = searchParams.get('leagueId');

  const { joinByToken } = useContext(LeagueContext);
  const { user, loading: authLoading } = useContext(AuthContext);

  const [status, setStatus] = useState('idle'); // idle | joining | success | error | auth_required
  const [message, setMessage] = useState('');
  const [leagueName, setLeagueName] = useState('');

  // Once auth is resolved, attempt to join
  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setStatus('error');
      setMessage('Invalid invite link — no token provided.');
      return;
    }

    if (!user) {
      // Save params so we can resume after login
      sessionStorage.setItem('pendingInvite', JSON.stringify({ token, leagueId }));
      setStatus('auth_required');
      return;
    }

    // User is authenticated — attempt join
    handleJoin();
  }, [authLoading, user]);

  const handleJoin = async () => {
    setStatus('joining');
    try {
      const result = await joinByToken(leagueId, token);
      if (result.success) {
        setStatus('success');
        setMessage(result.message || 'You have successfully joined the league!');
        // Extract league name from response if available
        if (result.data?.leaguePlayer?.league?.name) {
          setLeagueName(result.data.leaguePlayer.league.name);
        }
      } else {
        setStatus('error');
        const errorMap = {
          PRIVATE_LEAGUE_NO_SELF_JOIN: 'This league is private. Please contact the organizer.',
          INVALID_INVITE: 'This invite link is invalid or has expired.',
          LEAGUE_NOT_FOUND: 'The league for this invite link could not be found.',
          JOIN_NOT_ALLOWED: 'Joining is currently disabled for this league.',
          LATE_JOIN_NOT_ALLOWED: 'This league has already started and late joining is not allowed.',
          LEAGUE_CLOSED: 'This league has ended.',
        };
        setMessage(errorMap[result.code] || result.error || 'Failed to join the league.');
      }
} catch (e) {
  setStatus('error');
  setMessage('An unexpected error occurred. Please try again.');
}
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || status === 'idle') {
    return <PageShell><LoadingState label="Loading invite..." /></PageShell>;
  }

  if (status === 'auth_required') {
    return (
      <PageShell>
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
            <FaLock className="text-amber-500 text-3xl" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Sign In Required</h2>
            <p className="text-gray-500 mt-2 font-medium">
              You need to be logged in to join this league via invite link.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-100"
            >
              <FaSignInAlt /> Sign In to Join
            </Link>
            <Link
              to="/register/player"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition"
            >
              Create Account
            </Link>
          </div>
          <p className="text-xs text-gray-400">Your invite link will be remembered after sign in.</p>
        </div>
      </PageShell>
    );
  }

  if (status === 'joining') {
    return <PageShell><LoadingState label="Joining league…" /></PageShell>;
  }

  if (status === 'success') {
    return (
      <PageShell>
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <FaCheckCircle className="text-green-500 text-4xl" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">You're In! 🎉</h2>
            {leagueName && <p className="text-blue-600 font-bold text-lg mt-1">{leagueName}</p>}
            <p className="text-gray-500 mt-2 font-medium">{message}</p>
          </div>
          <button
            onClick={() => navigate('/player/leagues')}
            className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-100"
          >
            <FaTrophy className="text-yellow-300" /> View My Leagues
          </button>
        </div>
      </PageShell>
    );
  }

  // error state
  return (
    <PageShell>
      <div className="text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <FaTimesCircle className="text-red-500 text-4xl" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Invite Failed</h2>
          <p className="text-gray-500 mt-2 font-medium">{message}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleJoin}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-blue-700 transition"
          >
            Try Again
          </button>
          <Link
            to="/player/leagues"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-200 transition"
          >
            Browse Leagues
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PageShell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-6">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 bg-white rounded-3xl shadow-2xl p-10 max-w-lg w-full border border-white/20">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <FaTrophy className="text-yellow-500 text-2xl" />
            <span className="text-xs font-black uppercase tracking-widest text-gray-400">CueMetrics League</span>
          </div>
          <h1 className="text-xl font-black text-gray-900 uppercase tracking-tight">League Invite</h1>
        </div>

        {children}
      </div>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <FaSpinner className="text-blue-500 text-4xl animate-spin" />
      <p className="text-sm font-black text-gray-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}
