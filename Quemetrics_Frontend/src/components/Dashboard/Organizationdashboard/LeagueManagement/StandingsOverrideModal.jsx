import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaSave, FaExclamationTriangle } from 'react-icons/fa';

const StandingsOverrideModal = ({ isOpen, onClose, player, onOverride }) => {
    const [adjustment, setAdjustment] = useState(player?.manualPointsAdjustment || 0);
    const [notes, setNotes] = useState(player?.adjustmentNotes || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onOverride(player.id, {
                manualPointsAdjustment: parseInt(adjustment, 10),
                adjustmentNotes: notes
            });
            onClose();
        } catch (error) {
            console.error('Failed to override standings:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!player) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden outline outline-1 outline-[#FDF2D1]"
                    >
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between bg-[#132F45]">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#BA995D]">Adjust Points</h3>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"
                            >
                                <FaTimes size={14} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-white">
                            <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-2xl border border-orange-100 shadow-sm shadow-orange-100/50">
                                <FaExclamationTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-orange-900">Point Adjustment</p>
                                    <p className="text-[10px] text-orange-800 leading-relaxed font-medium">
                                        You are applying a manual point adjustment for <strong className="font-black text-orange-950 uppercase">{player.player?.name}</strong>.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest px-1">
                                    Points Adjustment
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={adjustment}
                                        onChange={(e) => setAdjustment(e.target.value)}
                                        className="w-full bg-[#FAFAFA] px-4 py-3 rounded-2xl border border-gray-100 font-black text-[#132F45] text-sm tracking-tighter outline-none focus:ring-2 focus:ring-[#132F45]/5 focus:border-[#FDF2D1] transition-all"
                                        placeholder="0"
                                        required
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300 pointer-events-none uppercase tracking-widest">PTS</span>
                                </div>
                                <span className="text-[7.5px] font-black text-gray-300 uppercase tracking-widest px-1">
                                    Positive for bonus, negative for penalties.
                                </span>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest px-1">
                                    Reason
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full bg-[#FAFAFA] px-4 py-3 rounded-2xl border border-gray-100 font-medium text-[#132F45] text-[11px] leading-relaxed outline-none focus:ring-2 focus:ring-[#132F45]/5 focus:border-[#FDF2D1] transition-all min-h-[80px] resize-none"
                                    placeholder="Enter the reason for this manual adjustment..."
                                />
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-3 rounded-2xl border border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 hover:text-[#132F45] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex-[2] px-4 py-3 rounded-2xl bg-[#132F45] text-[#BA995D] text-[9px] font-black uppercase tracking-widest hover:bg-[#1e4669] hover:text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#132F45]/10 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <div className="w-3 h-3 border-2 border-[#BA995D] border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <><FaSave size={10} /> Apply Change</>
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StandingsOverrideModal;
