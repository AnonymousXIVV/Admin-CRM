import React, { useMemo } from 'react';
import { COUNTRIES, countryByCode, flagUrl } from '../../shared/countries';
import { formatPhoneDigits } from '../../shared/phoneFormat';

/**
 * Phone input: flag + dial prefix (compact), full country names only in the picker list.
 * Formats digits in real-time as the user types (e.g. US "555 123 4567").
 * `value` and `onChange` always deal in raw digit strings only.
 */
const PhoneField = ({
  value = '',
  onChange,
  countryCode = 'US',
  onCountryChange,
  id,
  placeholder,
  className = '',
  disabled = false,
}) => {
  const country = useMemo(
    () => countryByCode(countryCode) || COUNTRIES.find((c) => c.code === 'US'),
    [countryCode]
  );

  const rawDigits = (value || '').replace(/\D/g, '');
  const displayValue = formatPhoneDigits(countryCode, rawDigits);

  const handleChange = (e) => {
    const newRaw = e.target.value;
    const newDigits = newRaw.replace(/\D/g, '');

    // Backspace hit a separator (space): digit count unchanged but string shorter
    if (newDigits.length === rawDigits.length && newRaw.length < displayValue.length) {
      onChange?.(rawDigits.slice(0, -1));
      return;
    }
    onChange?.(newDigits);
  };

  return (
    <div className={`phone-field${disabled ? ' phone-field--disabled' : ''}${className ? ' ' + className : ''}`.trim()}>
      <div className="phone-field__prefix" title={country.name}>
        <div className="phone-field__prefix-display" aria-hidden="true">
          <img
            src={flagUrl(country.flag, 40)}
            alt=""
            className="phone-field__flag"
            width={22}
            height={16}
          />
          <span className="phone-field__dial">{country.dial}</span>
          {!disabled && <i className="fas fa-chevron-down phone-field__chevron" />}
        </div>
        <select
          className="phone-field__country-select"
          value={countryCode}
          onChange={(e) => onCountryChange?.(e.target.value)}
          aria-label={`Country (${country.name})`}
          disabled={disabled}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <input
        id={id}
        type="tel"
        className="phone-field__input"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder || 'Phone number'}
        autoComplete="tel-national"
        inputMode="numeric"
        disabled={disabled}
      />
    </div>
  );
};

export default PhoneField;
