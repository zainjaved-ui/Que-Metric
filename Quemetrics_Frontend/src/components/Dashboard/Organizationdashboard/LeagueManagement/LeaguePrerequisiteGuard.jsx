import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaBuilding, FaMapMarkerAlt, FaCalendarAlt, FaCheckCircle, FaArrowRight, FaLock } from 'react-icons/fa';
import { OrganizationContext } from '../../../../contexts/OrganizationContext';
import Button from '../../../../components/ui/Button';

// Leagues require Club + Venue + Season (Season is league-only).
// `compact` -> small locked control for the page-header row (light bg);
// otherwise the full "Complete These Steps..." panel.
export default function LeaguePrerequisiteGuard({ onAllowed, compact = false }) {
  const { clubs, venues, seasons, getClubs, getVenues, getSeasons } = useContext(OrganizationContext);
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  // OrganizationContext does NOT auto-fetch — pull clubs + venues + seasons on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { await Promise.all([getClubs(), getVenues(), getSeasons()]); }
      catch { /* context surfaces its own errors; treat as "no data" */ }
      finally { if (!cancelled) setChecked(true); }
    })();
    return () => { cancelled = true; };
    // get* are useCallback-stable in OrganizationContext
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasClub   = Array.isArray(clubs)   && clubs.length   > 0;
  const verifiedClub = Array.isArray(clubs) ? clubs.find((c) => c?.isVerified) : null;
  const hasVerifiedClub = Boolean(verifiedClub);
  const hasVenue  = Array.isArray(venues)  && venues.length  > 0;
  const hasSeason = Array.isArray(seasons) && seasons.length > 0;
  const allMet    = hasClub && hasVerifiedClub && hasVenue && hasSeason;

  // Land on the verified club's detail page for the venue step (that's where
  // venue creation lives). Fall back to the first club id for the verify step
  // so the user lands on their pending-verification club page.
  const firstClubId    = hasClub ? clubs[0]?.id : null;
  const verifiedClubId = verifiedClub?.id || null;

  // ── LOADING (light-bg friendly: league header/empty area is white) ──────
  if (!checked) {
    return (
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
        className="!bg-blue-600 hover:!bg-blue-700 !text-white !rounded-lg !px-4 !py-2 !font-semibold"
      >
        <span className="flex items-center gap-2"><FaPlus className="h-4 w-4" /> Create League</span>
      </Button>
    );
  }

  // ── STATE B — prerequisites not met ─────────────────────────────────────
  // Fixed order: Create Club, Verify Club, Add Venue, Create Season. The
  // venue step is gated on club verification because venues are created
  // inside the club's detail page and only verified clubs may host venues.
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
    {
      n: 4,
      done: hasSeason,
      icon: FaCalendarAlt,
      label: 'Create a Season',
      cta: 'Go to Season Setup',
      to: '/organization/seasons',
      disabled: false,
    },
  ];

  // Header placement: compact locked control (light background).
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
        title="Complete the setup steps below to unlock league creation"
        className="group inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-sm border border-amber-300 transition-all duration-200 active:scale-[0.98] shrink-0"
      >
        <FaLock className="h-3.5 w-3.5" />
        <span>Setup required{firstMissing ? `: ${firstMissing.label}` : ''}</span>
        <FaArrowRight className="text-xs group-hover:translate-x-0.5 transition-transform" />
      </button>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto bg-white rounded-2xl border border-[#D1D5DB] shadow-lg p-6 text-left">
      <h3 className="text-lg font-black text-[#132F45]">
        Complete These Steps Before Creating a League
      </h3>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        You need the following in place before you can create a league. Click each step to set it up.
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
        Once all steps are complete, the Create League button will unlock automatically.
      </p>
    </div>
  );
}
