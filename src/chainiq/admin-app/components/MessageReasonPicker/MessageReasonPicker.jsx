import React, { useState } from 'react';
import '../DepositRequests/deposit-modal.css';

/**
 * Neutral-styled template picker for approve/reject modals.
 * Uses deposit-modal.css so global admin yellow button styles do not apply.
 */
export default function MessageReasonPicker({ catalog, categories, onSelect, selectedCode }) {
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  return (
    <div className="dr-modal-picker">
      <div className="dr-modal-picker__tabs">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`dr-modal-picker__tab${activeCategory === cat ? ' is-active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="dr-modal-picker__list">
        {catalog[activeCategory].map((r) => (
          <button
            key={r.code}
            type="button"
            className={`dr-modal-picker__item${selectedCode === r.code ? ' is-selected' : ''}`}
            onClick={() => onSelect(r)}
          >
            <span className="dr-modal-picker__item-label">{r.label}</span>
            <span className="dr-modal-picker__item-preview">{r.message.slice(0, 90)}...</span>
          </button>
        ))}
      </div>
    </div>
  );
}
