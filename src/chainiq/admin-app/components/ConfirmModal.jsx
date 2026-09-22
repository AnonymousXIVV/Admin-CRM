import React from 'react';

export default function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  confirmColor = '#F6465D',
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: '#2B3139',
        border: '1px solid #444A55',
        borderRadius: 12,
        padding: '28px 32px',
        maxWidth: 420,
        width: '90%',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ color: '#EAECEF', fontSize: 14, lineHeight: 1.65, marginBottom: 24 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 22px',
              background: '#363B44',
              border: '1px solid #444A55',
              borderRadius: 7,
              color: '#848E9C',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '8px 22px',
              background: confirmColor,
              border: 'none',
              borderRadius: 7,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
