import React, { useContext, useState, useEffect } from 'react';
import { DataContext } from '../contexts/DataContext';
import { KycModal } from '../components/Modals';
import {
  AccountPage,
  AccountSection,
  AccountRow,
  AccountActionButton,
} from '../components/AccountPage';
import { getKycStatus, getKycBadgeClass, isKycApproved, isKycFailed } from '../kycUtils';
import { selectPresetAvatar } from '../../api';
import { AVATAR_PRESETS, AvatarSvg, AvatarDisplay } from '../avatarPresets';
import ReactDOM from 'react-dom';

function KycVerifiedModal({ open, onClose, name, email, phone }) {
    if (!open) return null;
    const el = document.getElementById('modal-root') || document.body;
    return ReactDOM.createPortal(
        <div
            className="modal active dashboard-modal-portal"
            onClick={onClose}
            style={{ zIndex: 9999 }}
        >
            <div
                className="modal-content"
                style={{ maxWidth: 420, borderRadius: 18, overflow: 'hidden', padding: 0 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Green gradient header */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(14,203,129,0.18) 0%, rgba(14,203,129,0.06) 100%)',
                    borderBottom: '1px solid rgba(14,203,129,0.2)',
                    padding: '32px 28px 24px',
                    textAlign: 'center',
                    position: 'relative',
                }}>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            position: 'absolute', top: 14, right: 14,
                            background: 'rgba(255,255,255,0.06)', border: 'none',
                            borderRadius: '50%', width: 32, height: 32,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--ui-text-muted)', fontSize: 16,
                        }}
                    >
                        <i className="fas fa-times" />
                    </button>

                    {/* Shield badge with pulse ring */}
                    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
                        <div style={{
                            position: 'absolute', inset: -8,
                            borderRadius: '50%',
                            border: '2px solid rgba(14,203,129,0.2)',
                            animation: 'kyc-pulse 2.4s ease-in-out infinite',
                        }} />
                        <div style={{
                            width: 72, height: 72, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(14,203,129,0.22), rgba(14,203,129,0.08))',
                            border: '2px solid rgba(14,203,129,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 28px rgba(14,203,129,0.18)',
                        }}>
                            <i className="fas fa-shield-alt" style={{ fontSize: 30, color: '#0ECB81' }} />
                        </div>
                        {/* Check badge */}
                        <div style={{
                            position: 'absolute', bottom: 0, right: -4,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#0ECB81',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                            border: '2px solid var(--ui-surface, #1E2026)',
                        }}>
                            <i className="fas fa-check" style={{ fontSize: 9, color: '#fff' }} />
                        </div>
                    </div>

                    <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ui-text-on-surface)', margin: '0 0 6px' }}>
                        Identity Verified
                    </h2>
                    <p style={{ fontSize: 13, color: 'var(--ui-text-muted)', margin: 0 }}>
                        Your account has been fully approved and verified.
                    </p>
                </div>

                {/* Info rows */}
                <div style={{ padding: '20px 24px 24px' }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--ui-border, rgba(255,255,255,0.07))',
                        borderRadius: 12,
                        overflow: 'hidden',
                        marginBottom: 20,
                    }}>
                        {[
                            { label: 'Full Name', value: name || '-', icon: 'fa-user' },
                            { label: 'Email Address', value: email || '-', icon: 'fa-envelope' },
                            { label: 'Phone Number', value: phone || '-', icon: 'fa-phone' },
                        ].map((row, i, arr) => (
                            <div key={row.label} style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '11px 16px',
                                borderBottom: i < arr.length - 1 ? '1px solid var(--ui-border, rgba(255,255,255,0.07))' : 'none',
                            }}>
                                <div style={{
                                    width: 28, height: 28, borderRadius: 8,
                                    background: 'rgba(14,203,129,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <i className={`fas ${row.icon}`} style={{ fontSize: 11, color: '#0ECB81' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginBottom: 1 }}>{row.label}</div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ui-text-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</div>
                                </div>
                            </div>
                        ))}

                        {/* KYC status row */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '11px 16px',
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: 8,
                                background: 'rgba(14,203,129,0.1)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                <i className="fas fa-id-card" style={{ fontSize: 11, color: '#0ECB81' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginBottom: 1 }}>KYC Status</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        background: 'rgba(14,203,129,0.12)',
                                        color: '#0ECB81',
                                        border: '1px solid rgba(14,203,129,0.3)',
                                        borderRadius: 20,
                                        padding: '2px 10px',
                                        fontSize: 12,
                                        fontWeight: 700,
                                    }}>
                                        <i className="fas fa-check-circle" style={{ fontSize: 10 }} />
                                        Verified
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '14px 24px',
                            background: 'linear-gradient(135deg, #0ECB81 0%, #0ba866 100%)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 12,
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: 'pointer',
                            letterSpacing: '0.02em',
                            boxShadow: '0 4px 20px rgba(14,203,129,0.3)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(14,203,129,0.4)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,203,129,0.3)'; }}
                    >
                        <i className="fas fa-check" style={{ fontSize: 13 }} />
                        Done
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes kyc-pulse {
                    0%, 100% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.12); opacity: 0.2; }
                }
            `}</style>
        </div>,
        el
    );
}

const Profile = () => {
    const { userSettingsState, currentUser, updateCurrentUser, refreshSession } = useContext(DataContext);
    useEffect(() => {
        if (refreshSession && !currentUser?.impersonated) refreshSession();
    }, [refreshSession, currentUser?.impersonated]);

    const [activeModal, setActiveModal] = useState(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [saving, setSaving] = useState(null);
    const [avatarError, setAvatarError] = useState('');

    const { name, email } = userSettingsState;
    const phone = currentUser?.phone || '';
    const avatarUrl = currentUser?.avatarUrl || null;

    const kycStatus = getKycStatus(currentUser);
    const kycBadgeClass = getKycBadgeClass(kycStatus);

    const getInitials = (n) => {
        if (!n) return '?';
        return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    };

    const handleSelectPreset = async (presetId) => {
        if (saving) return;
        setAvatarError('');
        setSaving(presetId === '' ? '__initials__' : presetId);
        try {
            await selectPresetAvatar(presetId);
            updateCurrentUser({ avatarUrl: presetId || null });
            setPickerOpen(false);
        } catch (err) {
            setAvatarError(err?.message || 'Failed to save avatar. Please try again.');
        } finally {
            setSaving(null);
        }
    };

    const handleKycButtonClick = () => {
        if (isKycApproved(kycStatus)) {
            setActiveModal('kyc-verified');
        } else {
            setActiveModal('kyc-modal');
        }
    };

    return (
        <AccountPage id="profile-page">
            <AccountSection>
                    <div className="profile-hero">
                        <div className="profile-avatar-wrap">
                            <div className="profile-avatar-inner">
                                <AvatarDisplay avatarUrl={avatarUrl} name={name} size={112}/>
                            </div>
                            {!pickerOpen && (
                                <button
                                    type="button"
                                    className="profile-avatar-edit"
                                    onClick={() => { setAvatarError(''); setPickerOpen(true); }}
                                    aria-label="Change avatar"
                                    title="Change avatar"
                                >
                                    <i className="fas fa-pen" />
                                </button>
                            )}
                        </div>
                        <h2 className="profile-hero-name" id="profile-full-name">{name || '-'}</h2>

                        {pickerOpen && (
                            <div className="profile-avatar-picker">
                                <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', marginBottom: 10 }}>
                                    Pick an avatar
                                </p>

                                {/* Use Initials option */}
                                <button
                                    onClick={() => handleSelectPreset('')}
                                    disabled={!!saving}
                                    title="Use initials"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        width: '100%',
                                        maxWidth: 280,
                                        margin: '0 auto 10px',
                                        background: 'none',
                                        border: '2px solid',
                                        borderColor: !avatarUrl ? '#F0B90B' : '#374151',
                                        borderRadius: 10,
                                        padding: '8px 12px',
                                        cursor: saving ? 'wait' : 'pointer',
                                        transition: 'border-color 0.15s',
                                    }}
                                >
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: '#374151',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 14, fontWeight: 700, color: '#fff',
                                        flexShrink: 0,
                                        border: '2px solid #4B5563',
                                    }}>
                                        {getInitials(name)}
                                    </div>
                                    <div style={{ textAlign: 'left', flex: 1 }}>
                                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#E5E7EB' }}>
                                            Use Initials
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                                            Show your name initials
                                        </div>
                                    </div>
                                    {saving === '__initials__' ? (
                                        <i className="fas fa-spinner fa-spin" style={{ color: '#F0B90B', fontSize: 15 }}/>
                                    ) : !avatarUrl ? (
                                        <i className="fas fa-check-circle" style={{ color: '#F0B90B', fontSize: 15 }}/>
                                    ) : null}
                                </button>

                                <div style={{ borderTop: '1px solid #374151', maxWidth: 280, margin: '0 auto 10px' }}/>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: 10,
                                    maxWidth: 280,
                                    margin: '0 auto 12px',
                                }}>
                                    {AVATAR_PRESETS.map(preset => {
                                        const isSelected = avatarUrl === preset.id;
                                        const isSaving = saving === preset.id;
                                        return (
                                            <button
                                                key={preset.id}
                                                onClick={() => handleSelectPreset(preset.id)}
                                                disabled={!!saving}
                                                title={preset.label}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    padding: 3,
                                                    cursor: saving ? 'wait' : 'pointer',
                                                    borderRadius: '50%',
                                                    outline: isSelected ? '3px solid #F0B90B' : '3px solid transparent',
                                                    outlineOffset: 2,
                                                    position: 'relative',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'outline-color 0.15s',
                                                }}
                                            >
                                                <AvatarSvg presetId={preset.id} size={52}/>
                                                {isSaving && (
                                                    <div style={{
                                                        position: 'absolute', inset: 3,
                                                        borderRadius: '50%',
                                                        background: 'rgba(0,0,0,0.6)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <i className="fas fa-spinner fa-spin" style={{ color: '#F0B90B', fontSize: 14 }}/>
                                                    </div>
                                                )}
                                                {isSelected && !isSaving && (
                                                    <div style={{
                                                        position: 'absolute', bottom: 2, right: 2,
                                                        width: 16, height: 16, borderRadius: '50%',
                                                        background: '#F0B90B',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                                                    }}>
                                                        <i className="fas fa-check" style={{ fontSize: 8, color: '#1E2026' }}/>
                                                    </div>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                {avatarError && (
                                    <div style={{ color: '#F6465D', fontSize: 12, marginBottom: 8 }}>
                                        <i className="fas fa-exclamation-circle" style={{ marginRight: 4 }}></i>{avatarError}
                                    </div>
                                )}
                                <button
                                    onClick={() => { setPickerOpen(false); setAvatarError(''); }}
                                    style={{
                                        fontSize: '0.8125rem', color: '#9CA3AF',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>

                    <AccountRow
                        label="Full Name"
                        value={<span id="profile-display-name">{name || '-'}</span>}
                    />
                    <AccountRow
                        label="Email Address"
                        value={<span id="profile-display-email">{email || '-'}</span>}
                    />
                    <AccountRow
                        label="Phone Number"
                        value={<span id="profile-display-phone">{phone || '-'}</span>}
                    />
                    <AccountRow
                        label="KYC Status"
                        value={<span className={`status-badge ${kycBadgeClass}`}>{kycStatus}</span>}
                        action={
                            <AccountActionButton id="start-kyc-btn" variant="primary" onClick={handleKycButtonClick}>
                                {isKycApproved(kycStatus) ? 'View' : isKycFailed(kycStatus) ? 'Resubmit Documents' : 'Submit KYC'}
                            </AccountActionButton>
                        }
                    />
            </AccountSection>

            <KycModal activeModal={activeModal} setActiveModal={setActiveModal} />

            <KycVerifiedModal
                open={activeModal === 'kyc-verified'}
                onClose={() => setActiveModal(null)}
                name={name}
                email={email}
                phone={phone}
            />
        </AccountPage>
    );
};

export default Profile;
