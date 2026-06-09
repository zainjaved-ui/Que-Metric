/**
 * @param {{
 *   tournaments: Array<{ id: string|number, name: string }>,
 *   value: string,
 *   onChange: (id: string) => void,
 *   disabled?: boolean,
 *   label?: string,
 *   allowAllOption?: boolean,
 *   placeholderLabel?: string,
 * }} props
 */
export default function TournamentDropdown({
  tournaments,
  value,
  onChange,
  disabled = false,
  label = 'Tournament',
  allowAllOption = true,
  placeholderLabel,
}) {
  const emptyLabel =
    placeholderLabel ??
    (allowAllOption
      ? tournaments?.length
        ? 'All tournaments'
        : 'No tournaments'
      : tournaments?.length
        ? 'Select a tournament'
        : 'No tournaments');

  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-[#132F45] mb-2">{label}</label>
      <select
        className="w-full md:max-w-md border-2 border-[#D1D5DB] rounded-xl px-4 py-3 bg-white text-[#132F45] font-medium focus:border-[#132F45] focus:outline-none disabled:opacity-50"
        value={value}
        disabled={disabled || !tournaments?.length}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {tournaments.map((t) => (
          <option key={t.id} value={String(t.id)}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
