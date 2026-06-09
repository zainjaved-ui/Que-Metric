import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBuilding, FaMapMarkerAlt, FaCalendarAlt, FaArrowRight, FaArrowLeft } from 'react-icons/fa';
import { AuthContext } from '../../../../contexts/AuthContext';
import Button from '../../../../components/ui/Button';
import Card from '../../../../components/ui/Card';

const ONBOARDING_KEY = 'cuemetrics_onboarding_complete';

const STEP_CARDS = [
  { icon: FaBuilding,     title: 'Step 1 — Create your Club',  desc: 'Your club is the parent of every tournament and league.',        border: 'border-[#132F45]', tint: 'bg-[#132F45]' },
  { icon: FaMapMarkerAlt, title: 'Step 2 — Add a Venue',       desc: 'A venue is required so matches can be scheduled and booked.',     border: 'border-[#BA995D]', tint: 'bg-[#BA995D]' },
  { icon: FaCalendarAlt,  title: 'Step 3 — Create a Season',   desc: 'Required for Leagues only (tournaments do not need a season).',   border: 'border-gray-300', tint: 'bg-gray-400' },
];

export default function WelcomeTourModal() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  // First-time detection: show ONLY if the localStorage flag is absent.
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY); }
    catch { return false; }
  });
  const [slide, setSlide] = useState(0);

  // Lock background scroll while the tour is visible.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const organiserName = user?.organizationName || user?.email || 'there';

  const markComplete = () => {
    try { localStorage.setItem(ONBOARDING_KEY, 'true'); } catch { /* ignore */ }
  };
  const handleSkip = () => { markComplete(); setOpen(false); };
  const handleFinish = () => { markComplete(); setOpen(false); navigate('/organization/clubmanagement'); };

  const TITLES = ['Welcome to CueMetrics!', 'Before You Create Anything', 'You Are All Set!'];

  return (
    // Custom overlay: NO onClick on backdrop + NO Escape listener => cannot be
    // dismissed by outside click or Escape (only Skip / finish closes it).
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-tour-title"
        className="relative w-full max-w-[520px] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[#132F45] px-6 py-5 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-[#BA995D]/10 rounded-full pointer-events-none" />
          <p className="text-[9px] font-black text-[#BA995D] uppercase tracking-[0.25em] mb-1">Getting Started</p>
          <h2 id="welcome-tour-title" className="text-xl font-black text-white tracking-tight relative z-10">
            {TITLES[slide]}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 min-h-[238px]">
          {slide === 0 && (
            <div className="space-y-4">
              <p className="text-sm font-bold text-[#132F45]">
                Hi <span className="text-[#BA995D]">{organiserName}</span> 👋
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                You are now set up as an Organisation Manager. From here you can create
                leagues, tournaments, manage your club, venues and track player stats all
                in one place.
              </p>
            </div>
          )}

          {slide === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                To create a Tournament or League, you must complete a few setup steps
                first. Here is what you need:
              </p>
              <div className="space-y-3">
                {STEP_CARDS.map(({ icon: Icon, title, desc, border, tint }) => (
                  <Card key={title} className={`!p-4 !shadow-sm border-l-4 ${border}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl ${tint} flex items-center justify-center text-white shrink-0`}>
                        <Icon className="text-sm" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-[#132F45]">{title}</p>
                        <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">{desc}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {slide === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Start by creating your Club first. Once your club and venue are ready,
                your tournament and league creation will unlock automatically.
              </p>
              <div className="rounded-2xl bg-[#FDF2D1]/70 border border-[#F4E5BB] px-4 py-3">
                <p className="text-[11px] font-black text-[#BA995D] uppercase tracking-widest">Next step</p>
                <p className="text-[13px] font-bold text-[#132F45] mt-0.5">Create your Club</p>
              </div>
            </div>
          )}
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === slide ? 'w-6 bg-[#BA995D]' : 'w-1.5 bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#D1D5DB] bg-[#FFFBF4]">
          <button
            type="button"
            onClick={handleSkip}
            className="text-[11px] font-bold text-gray-500 hover:text-[#132F45] uppercase tracking-widest transition-colors"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {slide > 0 && (
              <Button variant="secondary" onClick={() => setSlide((s) => s - 1)} className="!px-4 !py-2 !text-sm">
                <span className="flex items-center gap-2"><FaArrowLeft className="text-xs" /> Back</span>
              </Button>
            )}
            {slide < 2 && (
              <Button variant="primary" onClick={() => setSlide((s) => s + 1)} className="!px-4 !py-2 !text-sm">
                <span className="flex items-center gap-2">Next <FaArrowRight className="text-xs" /></span>
              </Button>
            )}
            {slide === 2 && (
              <Button variant="primary" onClick={handleFinish} className="!px-5 !py-2 !text-sm">
                <span className="flex items-center gap-2">Go to Club Setup <FaArrowRight className="text-xs" /></span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
