import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaExclamationCircle, FaUserMinus, FaSpinner } from 'react-icons/fa';

const WithdrawPlayerModal = ({ isOpen, onClose, player, onConfirm }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm(player);
            onClose();
        } catch (error) {
            console.error('Failed to withdraw player:', error);
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
                        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between bg-red-600">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Confirm Removal</h3>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-xl transition-all text-white/50 hover:text-white"
                            >
                                <FaTimes size={14} />
                            </button>
                        </div>

                        <div className="p-8 text-center space-y-6">
                            <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto shadow-sm shadow-red-100 border border-red-50">
                                <FaExclamationCircle className="text-red-600 text-3xl animate-pulse" />
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-[14px] font-black uppercase tracking-tight text-[#132F45]">Remove Player?</h4>
                                <p className="text-[11px] text-gray-400 font-medium leading-relaxed px-4">
                                    Are you sure you want to remove <strong className="text-red-600 font-black uppercase">{player.player?.name}</strong> from the league? This action is permanent and will affect standings.
                                </p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-4 py-4 rounded-2xl border border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-50 hover:text-[#132F45] transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={isSubmitting}
                                    className="flex-[2] px-4 py-4 rounded-2xl bg-red-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <FaSpinner size={10} className="animate-spin" />
                                    ) : (
                                        <><FaUserMinus size={10} /> Confirm Removal</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default WithdrawPlayerModal;
