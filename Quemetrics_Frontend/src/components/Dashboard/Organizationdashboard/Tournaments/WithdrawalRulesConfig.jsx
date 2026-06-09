import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Rule metadata ────────────────────────────────────────────────────────────

const BEFORE_START_OPTIONS = [
  {
    value: 'remove',
    label: 'Remove & Adjust Bracket',
    tag: 'Recommended',
    tagColor: 'bg-green-100 text-green-700',
    icon: '🔄',
    bullets: [
      'Player is completely removed from the tournament',
      'Bracket is recalculated automatically',
      'A BYE is added if the player count becomes odd',
      'All scheduled matches are updated',
      'Results scored as normal win (not walkover)',
    ],
  },
  {
    value: 'forfeit',
    label: 'Mark as Forfeit',
    tag: 'Strict',
    tagColor: 'bg-orange-100 text-orange-700',
    icon: '🚫',
    bullets: [
      'Player stays on the draw sheet',
      'All scheduled matches are marked as losses for the withdrawing player',
      'Opponents receive automatic wins',
      'Walkover points (from Scoring step) apply to those results',
    ],
  },
];

const GROUP_STAGE_OPTIONS = [
  {
    value: 'remove_all',
    label: 'REMOVE ALL MATCHES',
    tag: 'Lenient',
    tagColor: 'bg-blue-100 text-blue-700',
    icon: '🗑️',
    bullets: [
      'All group matches involving the player are voided',
      "Opponents' match records against the player are also removed",
      'Standings are recalculated without those results',
      'As if the player never participated in the group',
    ],
  },
  {
    value: '50_percent_rule',
    label: 'VOID IF < 50% PLAYED',
    tag: 'Best Practice',
    tagColor: 'bg-green-100 text-green-700',
    icon: '⚖️',
    bullets: [
      'If fewer than 50% of matches are played → all results are voided',
      'If 50% or more matches are played → completed results are kept; remaining matches become walkover losses',
      'Balances fairness between the withdrawing player and their opponents',
      'Recommended for most tournaments',
    ],
  },
  {
    value: 'walkover',
    label: 'WALKOVER',
    tag: 'Strict',
    tagColor: 'bg-orange-100 text-orange-700',
    icon: '➡️',
    bullets: [
      'All remaining (unplayed) matches are forfeited',
      'Opponents automatically win those matches',
      'Previously completed results are preserved',
      'Player is eliminated from the tournament',
    ],
  },
];

const KNOCKOUT_OPTIONS = [
  {
    value: 'walkover',
    label: 'Walkover to Opponent',
    tag: 'Standard',
    tagColor: 'bg-green-100 text-green-700',
    icon: '➡️',
    bullets: [
      'The opponent automatically advances to the next round',
      'The withdrawing player is eliminated',
      'No admin action required',
    ],
  },
  {
    value: 'void',
    label: 'Void the Match',
    tag: 'Manual',
    tagColor: 'bg-purple-100 text-purple-700',
    icon: '⛔',
    bullets: [
      'The match is cancelled and marked as void',
      'No automatic winner is assigned',
      'The organiser decides the outcome manually (re-assign or promote alternate)',
    ],
  },
];

// ─── Single rule selector ─────────────────────────────────────────────────────

function RuleSelector({ label, stepNumber, options, value, onChange }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || options[0];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-[#132F45] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {stepNumber}
          </span>
          <span className="text-sm font-semibold text-gray-900">{label}</span>
        </div>
        {/* <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          className="text-gray-400 hover:text-[#132F45] transition-colors text-xs flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          ℹ️ {infoOpen ? 'Hide' : 'What does this mean?'}
        </button> */}
      </div>

      {/* Dropdown */}
      <div className="px-5 py-4">
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:border-[#132F45] focus:ring-2 focus:ring-[#132F45]/10 appearance-none cursor-pointer"
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.icon}  {opt.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 text-xs">
            ▼
          </div>
        </div>

        {/* Selected badge */}
        {/* <div className="mt-2 flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${selected.tagColor}`}>
            {selected.tag}
          </span>
        </div> */}
      </div>

      {/* Info panel */}
      {/* <AnimatePresence>
        {infoOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                {options.map((opt) => {
                  const isActive = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      className={`rounded-lg p-3 transition-colors ${
                        isActive
                          ? 'bg-[#132F45] text-white'
                          : 'bg-white border border-gray-200 text-gray-700'
                      }`}
                    >
                      <p className={`text-xs font-bold mb-1.5 flex items-center gap-2 ${isActive ? 'text-white' : 'text-gray-800'}`}>
                        <span>{opt.icon}</span>
                        {opt.label}
                        {isActive && (
                          <span className="ml-auto text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                            Selected
                          </span>
                        )}
                      </p>
                      <ul className="space-y-1">
                        {opt.bullets.map((b, i) => (
                          <li key={i} className={`text-[11px] flex gap-2 leading-relaxed ${isActive ? 'text-white/85' : 'text-gray-600'}`}>
                            <span className="shrink-0 mt-0.5">•</span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence> */}

      {/* Live behavior preview for selected option */}
      {/* <AnimatePresence mode="wait">
        <motion.div
          key={value}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="border-t border-gray-100 px-5 py-3 bg-blue-50"
        >
          <p className="text-[11px] text-blue-700 font-semibold mb-1">
            {selected.icon} Currently selected: <span className="font-bold">{selected.label}</span>
          </p>
          <ul className="space-y-0.5">
            {selected.bullets.map((b, i) => (
              <li key={i} className="text-[11px] text-blue-600 flex gap-2 leading-relaxed">
                <span className="shrink-0">→</span>
                {b}
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence> */}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function WithdrawalRulesConfig({ formData, handleNestedChange }) {
  const wr = formData.withdrawalRules || {};
  const beforeStart = wr.beforeStart || 'remove';
  const duringGroup = wr.duringGroup || '50_percent_rule';
  const duringKnockout = wr.duringKnockout || 'walkover';

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-900">Withdrawal Rules</h3>
        {/* <p className="text-sm text-gray-500 mt-1">
          Configure how the system handles a player's withdrawal at each stage. These rules
          are enforced automatically when a player withdraws from their dashboard.
        </p> */}
      </div>

      <div className="space-y-4">
        <RuleSelector
          stepNumber={1}
          label="Before Tournament Start"
          options={BEFORE_START_OPTIONS}
          value={beforeStart}
          onChange={(v) => handleNestedChange('withdrawalRules', 'beforeStart', v)}
        />

        <RuleSelector
          stepNumber={2}
          label="During Group Stage"
          options={GROUP_STAGE_OPTIONS}
          value={duringGroup}
          onChange={(v) => handleNestedChange('withdrawalRules', 'duringGroup', v)}
        />

        <RuleSelector
          stepNumber={3}
          label="During Knockout Stage"
          options={KNOCKOUT_OPTIONS}
          value={duringKnockout}
          onChange={(v) => handleNestedChange('withdrawalRules', 'duringKnockout', v)}
        />
      </div>

      {/* <div className="mt-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-800">
          <strong>Default configuration:</strong> Remove &amp; Adjust before start · 50% Rule during groups · Walkover in knockout.
          These defaults provide the best balance between fairness and competitive integrity.
        </p>
      </div> */}
    </div>
  );
}
