import React from 'react';
import { COUNTRIES } from '../../shared/countries';

const CountrySelect = ({
  value,
  onChange,
  id,
  className = 'form-select',
  placeholder = 'Select country',
  showFlag = false,
  disabled = false,
}) => (
  <select
    id={id}
    className={className}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
  >
    <option value="">{placeholder}</option>
    {COUNTRIES.map((c) => (
      <option key={c.code} value={c.code}>
        {showFlag ? `${c.name} (${c.code})` : c.name}
      </option>
    ))}
  </select>
);

export default CountrySelect;
