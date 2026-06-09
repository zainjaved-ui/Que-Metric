import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaBuilding, FaMapMarkerAlt, FaCheckCircle, FaArrowRight, FaLock } from 'react-icons/fa';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import Button from '../../../../components/ui/Button';

// `compact` = render a small locked control instead of the full step panel.
// Used for the header placement (the page-header bar is too tight for the
// full guide); the full panel renders in the roomy empty-state/body area.
export default function TournamentPrerequisiteGuard({ onAllowed, compact = false }) {
  const { clubs, venues, getClubs, getVenues } = useContext(OrganizationContext);
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  // OrganizationContext does NOT auto-fetch clubs/venues — pull them on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await Promise.all([getClubs(), getVenues()]); }
      catch { /* context surfaces its own errors; treat as "no data" */ }
      finally { if (!cancelled) setChecked(true); }
    })();
    return () => { cancelled = true; };
    // getClubs/getVenues are useCallback-stable in OrganizationContext
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasClub  = Array.isArray(clubs)  && clubs.length  > 0;
  const verifiedClub = Array.isArray(clubs) ? clubs.find((c) => c?.isVerified) : null;
  const hasVerifiedClub = Boolean(verifiedClub);
  const hasVenue = Array.isArray(venues) && venues.length > 0;
  const allMet   = hasClub && hasVerifiedClub && hasVenue;

  // Land on the verified club's detail page for the venue step (that's where
  // venue creation lives). Fall back to the first club id for the verify step
  // so the user lands on their pending-verification club page.
  const firstClubId    = hasClub ? clubs[0]?.id : null;
  const verifiedClubId = verifiedClub?.id || null;

  // ── LOADING ─────────────────────────────────────────────────────────────
  // Loader.jsx is a full-screen fixed overlay (z-[9999]) — unsuitable for an
  // inline state, so a small inline spinner+text is used instead.
  if (!checked) {
    // Header (compact) sits on the dark gradient bar -> light text/spinner.
    // Body (panel) sits on white -> grey text/spinner so it stays visible.
    return compact ? (
      <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 border border-white/10 text-white text-sm font-bold">
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        Checking your setup...
      </div>
    ) : (
      <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-500 text-sm font-bold">
        <span className="w-4 h-4 border-2 border-gray-300 border-t-[#132F45] rounded-full animate-spin" />
        Checking your setup...
      </div>
    );
  }

  // ── STATE A — all prerequisites met ─────────────────────────────────────
  if (allMet) {
    return (
      <Button
        variant="primary"
        onClick={onAllowed}
        className="group inline-flex items-center justify-center gap-2 !px-6 !py-4 !rounded-2xl !font-black !uppercase !tracking-wide !bg-gradient-to-r !from-blue-500 !to-blue-600 hover:!shadow-[0_0_25px_rgba(59,130,246,0.5)] !text-white border border-blue-400/30 shrink-0"
      >
        <span className="flex items-center gap-2"><FaPlus className="h-5 w-5" /> Create Tournament</span>
      </Button>
    );
  }

  // ── STATE B — prerequisites not met ─────────────────────────────────────
  // Fixed order: Create Club, Verify Club, Add Venue. The venue step is
  // gated on club verification because venues are created inside the club's
  // detail page and only verified clubs may host venues.
  const steps = [
    {
      n: 1,
      done: hasClub,
      icon: FaBuilding,
      label: 'Create a Club',
      cta: 'Go to Club Setup',
      to: '/organization/clubmanagement',
      disabled: false,
    },
    {
      n: 2,
      done: hasVerifiedClub,
      icon: FaCheckCircle,
      label: 'Verify Your Club',
      cta: hasClub ? 'View Club Status' : 'Verify Club',
      to: firstClubId ? `/organization/clubmanagement/${firstClubId}` : '/organization/clubmanagement',
      disabled: !hasClub,
      disabledReason: 'Create a club first',
    },
    {
      n: 3,
      done: hasVenue,
      icon: FaMapMarkerAlt,
      label: 'Add a Venue',
      cta: 'Go to Venue Setup',
      to: verifiedClubId ? `/organization/clubmanagement/${verifiedClubId}?tab=venues` : '/organization/clubmanagement',
      disabled: !hasVerifiedClub,
      disabledReason: hasClub ? 'Waiting for club verification' : 'Create and verify a club first',
    },
  ];

  // Header placement: compact locked control (the full panel is cramped and
  // visually duplicated when rendered inside the dark page-header bar).
  if (compact) {
    // Label shows the very next missing step (even if disabled, so the user
    // sees what's blocking them). Navigation jumps to the first *actionable*
    // step — skipping disabled ones — so the click always lands on a screen
    // they can act on.
    const firstMissing    = steps.find((s) => !s.done);
    const firstActionable = steps.find((s) => !s.done && !s.disabled);
    const target          = firstActionable?.to || firstMissing?.to || '/organization/clubmanagement';
    return (
      <button
        type="button"
        onClick={() => navigate(target)}
        title="Complete the setup steps below to unlock tournament creation"
        className="group inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-100 font-black text-xs uppercase tracking-wide border border-amber-300/30 transition-all duration-300 active:scale-[0.98] shrink-0"
      >
        <FaLock className="h-4 w-4" />
        <span>Setup required{firstMissing ? `: ${firstMissing.label}` : ''}</span>
        <FaArrowRight className="text-xs group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  return (
    <div className="w-full bg-white rounded-2xl border border-[#D1D5DB] shadow-lg p-6 text-left">
      <h3 className="text-lg font-black text-[#132F45]">
        Complete These Steps Before Creating a Tournament
      </h3>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        You need the following in place before you can create a tournament. Click each step to set it up.
      </p>

      <div className="space-y-3">
        {steps.map(({ n, done, icon: Icon, label, cta, to, disabled, disabledReason }) => (
          <div
            key={n}
            className={`flex items-center gap-4 p-4 rounded-xl border ${
              done ? 'border-green-200 bg-green-50/60' : disabled ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 ${done ? 'bg-green-500' : disabled ? 'bg-amber-500' : 'bg-[#132F45]'}`}>
              <Icon className="text-sm" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Step {n}</p>
              <p className="text-sm font-bold text-[#132F45]">{label}</p>
            </div>
            {done ? (
              <span className="flex items-center gap-1.5 text-green-600 font-black text-sm shrink-0">
                <FaCheckCircle /> Done ✓
              </span>
            ) : disabled ? (
              <span className="flex items-center gap-1.5 text-amber-700 font-bold text-xs shrink-0">
                <FaLock className="text-xs" /> {disabledReason}
              </span>
            ) : (
              <Button
                variant="primary"
                onClick={() => navigate(to)}
                className="!px-4 !py-2 !text-sm shrink-0"
              >
                <span className="flex items-center gap-2">{cta} <FaArrowRight className="text-xs" /></span>
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-5">
        Once all steps are complete, the Create Tournament button will unlock automatically.
      </p>
    </div>
  );
}
