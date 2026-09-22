import React, { useEffect, useRef } from 'react';

const Modal = ({ isOpen, onClose, title, children, size }) => {
  const cardRef = useRef();

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleOverlayClick = (event) => {
    if (cardRef.current && !cardRef.current.contains(event.target)) {
      onClose();
    }
  };

  const sizeClass = size === 'large' ? 'aax-large-modal'
    : size === 'xl' ? 'aax-extra-large-modal'
    : '';

  return (
    <div
      className="aax-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aax-modal-title"
    >
      <div
        className={`aax-modal-content ${sizeClass}`.trim()}
        ref={cardRef}
      >
        <div className="aax-modal-header">
          <h3 id="aax-modal-title" className="aax-modal-title">{title}</h3>
          <button
            type="button"
            className="aax-modal-close-btn"
            onClick={onClose}
            title="Close (ESC)"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="aax-modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
