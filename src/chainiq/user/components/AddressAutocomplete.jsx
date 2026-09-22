import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * AddressAutocomplete
 *
 * Real-time address suggestions powered by Nominatim / OpenStreetMap (free,
 * no API key required).  When the user picks a suggestion the `onSelect`
 * callback fires with structured parts so callers can auto-fill city, state,
 * postcode and country without extra work.
 *
 * Props
 * ─────
 *  value        string   Current street-address text (controlled)
 *  onChange     fn(str)  Called on every keystroke so the parent can track the raw text
 *  onSelect     fn({address,city,state,zip,country,countryCode})
 *                        Called when user picks a suggestion
 *  countryCode  string   ISO-2 code to bias results (e.g. "US").  Optional.
 *  placeholder  string
 *  className    string   Applied to the root wrapper
 */
const AddressAutocomplete = ({
  value = '',
  onChange,
  onSelect,
  countryCode = '',
  placeholder = 'Start typing your address...',
  className = '',
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);

  const wrapRef    = useRef(null);
  const inputRef   = useRef(null);
  const timerRef   = useRef(null);
  const abortRef   = useRef(null);

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch suggestions (debounced 500ms) ─────────────────────────────────
  const fetchSuggestions = useCallback(
    (query) => {
      clearTimeout(timerRef.current);
      if (!query || query.length < 4) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      timerRef.current = setTimeout(async () => {
        // Cancel any in-flight request
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        setLoading(true);
        try {
          const cc  = (countryCode || '').toLowerCase();
          const qs  = new URLSearchParams({
            format:         'json',
            addressdetails: '1',
            limit:          '7',
            q:              query,
            ...(cc ? { countrycodes: cc } : {}),
          });
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?${qs}`,
            {
              signal: abortRef.current.signal,
              headers: { Accept: 'application/json' },
            }
          );
          if (!res.ok) throw new Error(`Nominatim ${res.status}`);
          const data = await res.json();
          setSuggestions(data);
          setOpen(data.length > 0);
          setActiveIdx(-1);
        } catch (err) {
          if (err.name !== 'AbortError') {
            setSuggestions([]);
            setOpen(false);
          }
        } finally {
          setLoading(false);
        }
      }, 500);
    },
    [countryCode]
  );

  // ── Re-fetch when the country filter changes but query is already long ───
  useEffect(() => {
    if (value.length >= 4) fetchSuggestions(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // ── Extract structured address from a Nominatim result ──────────────────
  const parseResult = (result) => {
    const a = result.address || {};

    // Street line: house number + road (most common pattern)
    const road    = a.road || a.pedestrian || a.footway || a.path || '';
    const houseNo = a.house_number || '';
    const streetLine = houseNo ? `${houseNo} ${road}`.trim() : road;

    // City: Nominatim uses different keys depending on settlement type
    const city = a.city || a.town || a.village || a.hamlet || a.municipality || '';

    // State
    const state = a.state || a.region || a.province || '';

    // Postcode
    const zip = a.postcode || '';

    // Country
    const country     = a.country || '';
    const countryCode = (a.country_code || '').toUpperCase();

    // Fallback for street when road is missing: first chunk of display_name
    const address = streetLine || result.display_name.split(',')[0].trim();

    return { address, city, state, zip, country, countryCode };
  };

  // ── User selects a suggestion ────────────────────────────────────────────
  const handleSelect = (result) => {
    const parsed = parseResult(result);
    onChange?.(parsed.address);
    onSelect?.(parsed);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  };

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        handleSelect(suggestions[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  // ── Shorten display name to avoid overwhelming the UI ───────────────────
  const shortLabel = (result) => {
    const parts = result.display_name.split(', ');
    // Keep first 4-5 comma-separated segments
    return parts.slice(0, Math.min(5, parts.length)).join(', ');
  };

  return (
    <div
      ref={wrapRef}
      className={`addr-ac-wrap${className ? ' ' + className : ''}`}
    >
      <div className="addr-ac-input-wrap">
        <input
          ref={inputRef}
          type="text"
          className="form-input addr-ac-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange?.(e.target.value);
            fetchSuggestions(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        {loading && (
          <span className="addr-ac-spinner" aria-label="Searching..." />
        )}
        {!loading && value && (
          <button
            type="button"
            className="addr-ac-clear"
            tabIndex={-1}
            onClick={() => {
              onChange?.('');
              setSuggestions([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="addr-ac-dropdown" role="listbox">
          {suggestions.map((r, i) => (
            <li
              key={r.place_id || i}
              role="option"
              aria-selected={i === activeIdx}
              className={`addr-ac-item${i === activeIdx ? ' addr-ac-item--active' : ''}`}
              onMouseDown={(e) => {
                // Use mousedown so the input doesn't blur before click fires
                e.preventDefault();
                handleSelect(r);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <i className="fas fa-map-marker-alt addr-ac-pin" />
              <span className="addr-ac-label">{shortLabel(r)}</span>
            </li>
          ))}
          <li className="addr-ac-attribution" aria-hidden="true">
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              © OpenStreetMap contributors
            </a>
          </li>
        </ul>
      )}
    </div>
  );
};

export default AddressAutocomplete;
