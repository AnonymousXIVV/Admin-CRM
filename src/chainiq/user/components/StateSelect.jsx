import React from 'react';
import { getStates, hasStates } from '../../shared/states';

/**
 * Smart state / province / region selector.
 *
 * - When the selected country has a known state list → renders a <select>
 *   dropdown with all states/provinces for that country.
 * - When the country has no defined list (or no country is chosen) → renders
 *   a plain text <input> so the user can type any region freely.
 *
 * Props:
 *   countryCode  ISO 3166-1 alpha-2 code of the selected country (e.g. "US")
 *   value        Currently selected/entered state value (always a string)
 *   onChange     Called with the new value string on every change
 *   className    CSS class override (defaults appropriate for each element type)
 *   inputClass   Class for the text <input> variant
 *   selectClass  Class for the <select> variant
 */
const StateSelect = ({
  countryCode,
  value,
  onChange,
  className,
  inputClass,
  selectClass,
}) => {
  const states = getStates(countryCode);
  const showDropdown = hasStates(countryCode);

  if (showDropdown) {
    return (
      <select
        className={className || selectClass || 'form-select'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select state / province...</option>
        {states.map((s) => (
          <option key={s.code} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      className={className || inputClass || 'form-input'}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="State / Province / Region"
    />
  );
};

export default StateSelect;
