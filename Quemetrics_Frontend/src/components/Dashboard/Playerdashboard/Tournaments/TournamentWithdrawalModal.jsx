import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaExclamationTriangle, FaSignOutAlt, FaSpinner } from 'react-icons/fa';

// ─── Human-readable labels ────────────────────────────────────────────────────

const STAGE_LABELS = {
  before_start: 'Before Tournament Start',
  during_group: 'Group Stage',
  during_knockout: 'Knockout Stage',
};

const RULE_LABELS = {
  remove: 'Remove & Adjust Bracket',
  forfeit: 'Mark as Forfeit',
  remove_all: 'REMOVE ALL MATCHES',
  '50_percent_rule': 'VOID IF < 50% PLAYED',
  walkover: 'WALKOVER',
  void: 'Void the Match',
};

const STAGE_ICONS = {
  before_start: '🏁',
  during_group: '👥',
  during_knockout: '🥊',
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * TournamentWithdrawalModal
 *
 * Props:
 *   isOpen          – boolean
 *   onClose         – () => void
 *   withdrawalInfo  – object from GET /tournaments/:id/withdrawal-info
 *   onConfirm       – (reason: string) => Promise<void>
 *   loading         – boolean  (shows spinner on confirm button)
 */
export default function TournamentWithdrawalModal({
  isOpen,
  onClose,
  withdrawalInfo,
  onConfirm,
  loading = false,
}) {
  const [reason, setReason] = useState('');

  const handleConfirm = async () => {
    await onConfirm(reason);
    setReason('');
  };

  const handleClose = () => {
    if (!loading) {
      setReason('');
      onClose();
    }
  };

  if (!isOpen) return null;

  const stage = withdrawalInfo?.stage || 'before_start';
  const ruleDetail = withdrawalInfo?.ruleDetail || { label: 'Unknown', bullets: [] };
  const applicableRule = withdrawalInfo?.applicableRule;
  const stageLabel = STAGE_LABELS[stage] || stage;
  const stageIcon = STAGE_ICONS[stage] || '⚠️';

  const isHighRisk = stage !== 'before_start';
  const headerBg = isHighRisk ? 'bg-red-600' : 'bg-orange-500';
  const accentBg = isHighRisk ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
  const accentText = isHighRisk ? 'text-red-700' : 'text-orange-700';
  const bulletAccent = isHighRisk ? 'text-red-600' : 'text-orange-600';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-4xl shadow-2xl w-full max-w-md overflow-hidden outline-1 outline-gray-100"
          >
            {/* Header */}
            <div className={`px-6 py-5 flex items-center justify-between ${headerBg}`}>
              <div className="flex items-center gap-3">
                <FaExclamationTriangle className="text-white text-lg" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                  Confirm Withdrawal
                </h3>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-white/60 hover:text-white disabled:opacity-50"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Stage + Rule badges */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold">
                  {stageIcon} {stageLabel}
                </span>
                {applicableRule && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#132F45]/10 text-[#132F45] text-[11px] font-semibold">
                    Rule: {RULE_LABELS[applicableRule] || applicableRule}
                  </span>
                )}
              </div>

              {/* Warning */}
              {/* <div className={`rounded-xl border p-4 ${accentBg}`}>
                <p className={`text-xs font-bold mb-2 uppercase tracking-wide ${accentText}`}>
                  What will happen:
                </p>
                <ul className="space-y-1.5">
                  {ruleDetail.bullets.map((bullet, i) => (
                    <li key={i} className={`text-[12px] flex gap-2 leading-relaxed ${bulletAccent}`}>
                      <span className="shrink-0 mt-0.5 font-bold">→</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div> */}

              {/* Irrevocable warning */}
              <p className="text-[11px] text-gray-500 text-center">
                <strong className="text-gray-700">This action cannot be undone.</strong>{' '}
                Your participation will be permanently ended.
              </p>

              {/* Optional reason */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">
                  Reason for withdrawal <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  rows={2}
                  placeholder="e.g. personal reasons, injury..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#132F45] focus:ring-2 focus:ring-[#132F45]/10 resize-none placeholder-gray-300 disabled:bg-gray-50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="flex-1 px-4 py-3.5 rounded-2xl border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={loading}
                  className={`flex-2 px-4 py-3.5 rounded-2xl text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-60 ${
                    isHighRisk
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                      : 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'
                  }`}
                >
                  {loading ? (
                    <FaSpinner size={12} className="animate-spin" />
                  ) : (
                    <>
                      <FaSignOutAlt size={11} />
                      Confirm Withdrawal
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
