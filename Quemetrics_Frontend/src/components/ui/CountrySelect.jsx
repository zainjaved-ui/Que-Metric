import { useState, useRef, useEffect, useMemo } from 'react';
import { COUNTRY_CODES } from '../../utils/countryCodes';

/**
 * Searchable country dial-code selector.
 *
 * Drop-in replacement for the plain <select> used by the registration forms.
 * Calls `onChange({ target: { name, value } })` so existing form handlers
 * (which already handle name === 'countryDial') work unchanged.
 */
export default function CountrySelect({ name, value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  const selected =
    COUNTRY_CODES.find((c) => c.dial === String(value)) || COUNTRY_CODES[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRY_CODES;
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dial.includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const choose = (c) => {
    onChange({ target: { name, value: c.dial } });
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Country code"
        className="w-full h-full px-2 py-3 border border-[#D1D5DB] rounded-lg bg-white text-[#132F45] flex items-center justify-between gap-1 focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
      >
        <span className="truncate">
          {selected.flag} {selected.iso} +{selected.dial}
        </span>
        <span className="text-xs opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 bg-white border border-[#D1D5DB] rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or code..."
              className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#132F45] bg-white text-[#132F45]"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            ) : (
              filtered.map((c) => (
                <li key={`${c.iso}-${c.dial}`}>
                  <button
                    type="button"
                    onClick={() => choose(c)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                      c.dial === String(value) ? 'bg-gray-50 font-medium' : ''
                    }`}
                  >
                    <span>{c.flag}</span>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-gray-500">+{c.dial}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
