import React, { useEffect, useRef, useState } from 'react';

const AUTO_DISMISS_MS = 3500;

const TONE_STYLES = {
    success: { accent: '#0ECB81', icon: 'fas fa-check-circle' },
    error:   { accent: '#F6465D', icon: 'fas fa-exclamation-triangle' },
    warning: { accent: '#F0B90B', icon: 'fas fa-exclamation-circle' },
    info:    { accent: '#848E9C', icon: 'fas fa-info-circle' },
};

// Lightweight, self-dismissing toast styled to match SessionExpiredToast.
// Pass a `toast` prop shaped like { id, type, message } and a stable
// `onDismiss` callback. Each new `id` resets the auto-dismiss timer so
// rapidly-fired toasts don't disappear instantly.
const Toast = ({ toast, onDismiss }) => {
    const [visible, setVisible] = useState(false);
    const timerRef = useRef(null);
    const lastIdRef = useRef(null);

    useEffect(() => {
        if (!toast || toast.id === lastIdRef.current) return;
        lastIdRef.current = toast.id;
        setVisible(true);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setVisible(false);
            onDismiss?.();
        }, AUTO_DISMISS_MS);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast, onDismiss]);

    if (!visible || !toast) return null;

    const tone = TONE_STYLES[toast.type] || TONE_STYLES.info;

    const handleDismiss = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setVisible(false);
        onDismiss?.();
    };

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                top: 24,
                right: 24,
                zIndex: 10000,
                maxWidth: 380,
                background: '#161A1E',
                border: `1px solid ${tone.accent}`,
                borderLeft: `4px solid ${tone.accent}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: '#EAECEF',
                boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                animation: 'ciq-toast-in 220ms ease-out',
            }}
        >
            <style>{`
                @keyframes ciq-toast-in {
                    from { transform: translateY(-12px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <i
                    className={tone.icon}
                    aria-hidden="true"
                    style={{ color: tone.accent, fontSize: 18, lineHeight: '20px', flex: '0 0 auto' }}
                />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5 }}>
                    {toast.message}
                </div>
                <button
                    type="button"
                    onClick={handleDismiss}
                    aria-label="Dismiss notification"
                    style={{
                        background: 'transparent',
                        color: '#848E9C',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: 4,
                        fontSize: 14,
                        lineHeight: 1,
                    }}
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>
        </div>
    );
};

export default Toast;
