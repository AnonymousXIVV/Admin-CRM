import React from 'react';

/** Shared layout for Profile, Settings, Notifications, and similar account pages. */
export const AccountPage = ({ id, children, className = '' }) => (
  <div id={id} className={`page-content active account-page ${className}`.trim()}>
    {children}
  </div>
);

export const AccountPageGrid = ({ children, columns = 2 }) => (
  <div className={`account-page-grid account-page-grid--cols-${columns}`}>{children}</div>
);

export const AccountSection = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`account-section ui-card ${className}`.trim()}>
    {(title || action) && (
      <header className="account-section__head">
        <div className="account-section__titles">
          {title && <h3 className="account-section__title">{title}</h3>}
          {subtitle && <p className="account-section__subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
    )}
    <div className="account-section__body">{children}</div>
  </section>
);

export const AccountRow = ({ label, description, value, action, children }) => (
  <div className="account-row">
    <div className="account-row__main">
      {label && <div className="account-row__label">{label}</div>}
      {description && <div className="account-row__desc">{description}</div>}
      {value != null && value !== '' && <div className="account-row__value">{value}</div>}
      {children}
    </div>
    {action && <div className="account-row__action">{action}</div>}
  </div>
);

export const AccountToggleRow = ({ label, description, checked, disabled, onChange }) => (
  <AccountRow
    label={label}
    description={description}
    action={
      <label className="toggle-switch account-row__toggle">
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="toggle-slider" />
      </label>
    }
  />
);

export const AccountActionButton = ({ children, className = '', variant = 'secondary', ...props }) => (
  <button
    type="button"
    className={`ui-btn ui-btn--${variant} ui-btn--sm account-action-btn ${className}`.trim()}
    {...props}
  >
    {children}
  </button>
);
