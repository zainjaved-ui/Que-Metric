import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // motion used for modal + dropdown animations
import {
    FaTimes, FaExclamationTriangle, FaUserMinus,
    FaSpinner, FaChevronDown, FaTrophy, FaShieldAlt
} from 'react-icons/fa';
import apiClient from '../../../../contexts/apiClient';

/* ─────────────────────────────────────────────────────────────
   Rule definitions – what each dropout mode means
───────────────────────────────────────────────────────────────*/
const RULES = {
    whitewash: {
        label: 'Whitewash',
        color: 'amber',
        icon: <FaTrophy className="text-amber-500" />,
        headline: 'Whitewash Rule',
        description:
            'Opponents will receive a win, and 2 points will be awarded on the league table. Win / Loss counts are also updated.',
    },
    forfeit: {
        label: 'Forfeit',
        color: 'blue',
        icon: <FaShieldAlt className="text-blue-500" />,
        headline: 'Forfeit Rule',
        description:
            'Opponents will receive wins but no points or frames will be added to their stats. Only win and loss counts are updated.',
    },
};

const COLOR = {
    amber: {
        banner: 'bg-amber-50 border-amber-200 text-amber-800',
        header: 'bg-amber-500',
        select: 'border-amber-400 ring-amber-300',
    },
    blue: {
        banner: 'bg-blue-50 border-blue-200 text-blue-800',
        header: 'bg-blue-600',
        select: 'border-blue-400 ring-blue-300',
    },
};

/* ─────────────────────────────────────────────────────────────
   WithdrawPlayerModal
   Props:
     isOpen      – boolean
     onClose     – () => void
     player      – LeaguePlayer object (with .player.name, .player.nickname, .division?.name)
     leagueId    – string
     onConfirm   – async (player, dropoutRule) => void  (called after confirm)
───────────────────────────────────────────────────────────────*/
const WithdrawPlayerModal = ({ isOpen, onClose, player, leagueId, onConfirm }) => {
    const [rule, setRule] = useState('whitewash');
    const [affectedFixtures, setAffectedFixtures] = useState([]);
    const [loadingFixtures, setLoadingFixtures] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [open, setOpen] = useState(false); // dropdown open state

    /* Fetch upcoming fixtures for this player whenever modal opens */
    const fetchAffected = useCallback(async () => {
        if (!player || !leagueId) return;
        setLoadingFixtures(true);
        try {
            const { data } = await apiClient.get(
                `/leagues/${leagueId}/fixtures`,
                {
                    params: {
                        playerId: player.playerId || player.player?.id,
                        status: 'scheduled,in_progress',
                    },
                }
            );
            const fixtures = (data?.data || data?.fixtures || []).filter(
                (f) =>
                    (f.player1Id === (player.playerId || player.player?.id) ||
                        f.player2Id === (player.playerId || player.player?.id)) &&
                    ['scheduled', 'in_progress'].includes(f.status)
            );
            setAffectedFixtures(fixtures);
        } catch (err) {
            console.error('[WithdrawPlayerModal] fetchAffected error:', err);
            setAffectedFixtures([]);
        } finally {
            setLoadingFixtures(false);
        }
    }, [player, leagueId]);

    useEffect(() => {
        if (isOpen) {
            setRule('whitewash');
            setAffectedFixtures([]);
            setIsSubmitting(false);
            setOpen(false);
            fetchAffected();
        }
    }, [isOpen, fetchAffected]);

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm(player, rule);
            onClose();
        } catch (err) {
            console.error('[WithdrawPlayerModal] confirm error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!player) return null;

    const currentRule = RULES[rule];
    const colorSet = COLOR[currentRule.color];
    const playerName = player.player?.name || 'Unknown Player';
    const nickname = player.player?.nickname;
    const divisionName = player.division?.name;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 24 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
                        style={{ maxHeight: '92vh' }}
                    >
                        {/* ── Header ── */}
                        <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-start justify-between gap-3 shrink-0">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                                    <FaExclamationTriangle className="text-red-500 text-sm" />
                                </div>
                                <div>
                                    <h3 className="font-black text-[#132F45] text-sm tracking-tight">Remove Player from League</h3>
                                    <p className="text-[11px] text-red-500 font-medium mt-0.5">This action cannot be undone</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 shrink-0"
                            >
                                <FaTimes size={14} />
                            </button>
                        </div>

                        {/* ── Scrollable body ── */}
                        <div className="overflow-y-auto flex-1 p-5 space-y-5">

                            {/* Player Card */}
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full bg-[#132F45] flex items-center justify-center text-white font-black text-base shrink-0">
                                    {playerName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-black text-[#132F45] text-sm truncate">{playerName}</p>
                                    {nickname && <p className="text-[11px] text-gray-400 font-medium truncate">{nickname}</p>}
                                    {divisionName && (
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            Division: <span className="font-bold text-[#132F45]">{divisionName}</span>
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Dropdown */}
                            <div>
                                <label className="block text-[11px] font-black text-[#132F45] uppercase tracking-widest mb-2">
                                    Select Dropout Rule
                                </label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setOpen((o) => !o)}
                                        className={`w-full flex items-center justify-between px-4 py-3.5 bg-white border-2 rounded-xl text-sm font-bold text-[#132F45] transition-all focus:outline-none ${open ? `${colorSet.select} ring-2` : 'border-gray-200 hover:border-gray-300'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {currentRule.icon}
                                            {currentRule.label}
                                        </div>
                                        <FaChevronDown
                                            size={11}
                                            className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                                        />
                                    </button>

                                    <AnimatePresence>
                                        {open && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -6 }}
                                                className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden"
                                            >
                                                {Object.entries(RULES).map(([key, r]) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => { setRule(key); setOpen(false); }}
                                                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-left transition-colors ${rule === key ? 'bg-gray-50 text-[#132F45]' : 'text-gray-600 hover:bg-gray-50'}`}
                                                    >
                                                        {r.icon}
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Rule description banner */}
                            <div className={`rounded-xl border p-3.5 ${colorSet.banner}`}>
                                <p className="text-[11px] font-black uppercase tracking-widest mb-1">{currentRule.headline}</p>
                                <p className="text-[11px] font-medium leading-relaxed">{currentRule.description}</p>
                            </div>

                            {/* Affected Matches */}
                            <div>
                                <p className="text-[11px] font-black text-[#132F45] uppercase tracking-widest mb-2">
                                    Affected Matches ({loadingFixtures ? '…' : affectedFixtures.length})
                                </p>
                                {loadingFixtures ? (
                                    <div className="flex items-center justify-center py-4">
                                        <FaSpinner className="animate-spin text-gray-400 text-lg" />
                                    </div>
                                ) : affectedFixtures.length === 0 ? (
                                    <div className="text-center py-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-[11px] text-gray-400 font-medium">No upcoming matches found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {affectedFixtures.map((f) => {
                                            const isPlayer1 = f.player1Id === (player.playerId || player.player?.id);
                                            const opponentName = isPlayer1
                                                ? (f.player2?.name || f.player2Name || 'Opponent')
                                                : (f.player1?.name || f.player1Name || 'Opponent');
                                            return (
                                                <div
                                                    key={f.id}
                                                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-100"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <FaTrophy className="text-amber-400 text-xs" />
                                                        <span className="text-sm font-bold text-[#132F45]">{opponentName}</span>
                                                    </div>
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">
                                                        Round {f.round ?? '—'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Warning */}
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                                    <span className="font-black">Warning:</span> This will permanently remove the player from the league.
                                </p>
                            </div>
                        </div>

                        {/* ── Footer ── */}
                        <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex gap-3">
                            <button
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="flex-1 py-3.5 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 hover:text-[#132F45] transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={isSubmitting}
                                className="flex-[2] py-3.5 rounded-xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <FaSpinner size={12} className="animate-spin" />
                                ) : (
                                    <>
                                        <FaExclamationTriangle size={11} />
                                        Confirm Dropout
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default WithdrawPlayerModal;
