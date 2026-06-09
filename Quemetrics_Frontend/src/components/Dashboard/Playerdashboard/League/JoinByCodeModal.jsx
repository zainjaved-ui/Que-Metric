import React, { useState } from 'react';
import { FaTimes, FaLock, FaKey, FaChevronRight } from 'react-icons/fa';

/**
 * Modal for joining an invite-only league using a join code or token
 */
export default function JoinByCodeModal({ isOpen, onClose, onJoin, joining, inviteToken = null }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!code.trim() && !inviteToken) {
      setError('A valid enrolment code is required.');
      return;
    }

    await onJoin(code.trim().toUpperCase(), inviteToken);
    if (!joining) setCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#132F45]/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-6 border border-gray-100 outline outline-1 outline-[#FDF2D1] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAFAFA] rounded-bl-full -mr-8 -mt-8"></div>
        
        {/* Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-0.5">
            <h2 className="text-base font-black text-[#132F45] uppercase tracking-tight flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-[#BA995D] flex items-center justify-center text-white shadow-lg shadow-[#BA995D]/20">
                <FaLock size={12} />
              </div>
              Enrolment
            </h2>
            <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest pl-9">Enter unique invite code</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-[#132F45] transition-colors p-1.5 hover:bg-gray-50 rounded-full"
          >
            <FaTimes size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
          <div className="space-y-2">
            <label className="block text-[8px] font-black text-[#132F45] uppercase tracking-widest ml-1">Voucher Code</label>
            <div className="relative group">
              <FaKey className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#BA995D] group-focus-within:scale-110 transition-transform" size={12} />
              <input
                type="text"
                placeholder="E.G. CHAMP-2024"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={joining}
                className="w-full pl-10 pr-4 py-3 bg-[#FAFAFA] border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#BA995D]/20 focus:border-[#BA995D] font-black text-center tracking-widest text-[#132F45] uppercase placeholder:text-gray-200 disabled:opacity-50 transition-all text-xs outline outline-1 outline-transparent focus:outline-[#FDF2D1]"
                autoComplete="off"
                maxLength="20"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 animate-shake">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <p className="text-[8px] font-black text-red-600 uppercase tracking-tight">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={joining}
              className="px-5 py-3 rounded-xl font-black text-[8px] uppercase tracking-widest border border-gray-100 text-gray-400 hover:text-[#132F45] hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={joining || !code.trim()}
              className="flex-1 px-6 py-3 bg-[#132F45] text-white rounded-xl font-black text-[8px] uppercase tracking-widest hover:bg-[#1c4566] transition-all disabled:opacity-50 shadow-xl shadow-[#132F45]/20 flex items-center justify-center gap-2 active:scale-95"
            >
              {joining ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-[#BA995D]/30 border-t-[#BA995D] animate-spin" />
                  Wait...
                </>
              ) : (
                <>Join League <FaChevronRight size={8} className="text-[#BA995D]" /></>
              )}
            </button>
          </div>
        </form>

        {/* Info box */}
        <div className="p-4 bg-[#FDF2D1]/30 border border-[#FDF2D1] rounded-xl relative">
          <p className="text-[8px] text-[#132F45] font-black uppercase tracking-widest leading-relaxed flex items-start gap-2">
            <span className="text-[#BA995D]">TIP:</span> 
            Codes are typically provided by organizers or site officials.
          </p>
        </div>
      </div>
    </div>
  );
}
