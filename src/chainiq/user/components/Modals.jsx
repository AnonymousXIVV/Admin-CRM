import React, { useState, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { requestCard, submitWithdrawal, submitTrade, getKycStatus as fetchKycStatus, getKycStatusForUser, readClientToken, readAdminToken, getClientDepositAddresses, getAdminPreviewDepositAddresses, updateClientProfile, changeClientEmail, saveKycProfile } from '../../api';
import { DataContext } from '../contexts/DataContext';
// NOTE: deposit addresses no longer come from the static `globalAddressData`
// seed file - they are fetched per-asset from /api/client/crypto/addresses,
// which is populated by Super Admins via the Crypto Address Book panel.
import { usePlatformSettings } from '../../platformDefaults';
import { isKycApproved, isKycUnderReview, isKycFailed, getKycStatus } from '../kycUtils';
import CountrySelect from './CountrySelect';
import PhoneField from './PhoneField';
import StateSelect from './StateSelect';
import AddressAutocomplete from './AddressAutocomplete';
import { countryByCode } from '../../shared/countries';
import { isEmailValid } from '../../shared/validation';
import { normalizeDepositNetworks } from '../utils/depositAddresses';

/** Portal modals to document.body - fixes iOS Safari when .main-content has overflow. */
export function ModalRoot({ open, onBackdropClick, children }) {
    useEffect(() => {
        if (!open) return undefined;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    if (!open) return null;

    const handleMouseDown = (e) => {
        if (e.target === e.currentTarget && onBackdropClick) onBackdropClick(e);
    };

    return createPortal(
        <div
            className="modal active dashboard-modal-portal"
            role="presentation"
            onMouseDown={handleMouseDown}
        >
            {children}
        </div>,
        document.body
    );
}

export { isKycApproved as isKycVerified } from '../kycUtils';

export const WizardSteps = ({ steps, current }) => (
    <div className="wiz-steps">
        {steps.map((label, i) => {
            const idx = i + 1;
            const state = idx < current ? 'done' : idx === current ? 'active' : 'pending';
            return (
                <React.Fragment key={label}>
                    <div className={`wiz-step wiz-${state}`}>
                        <div className="wiz-step-bubble">
                            {state === 'done' ? <i className="fas fa-check"></i> : idx}
                        </div>
                        <div className="wiz-step-label">{label}</div>
                    </div>
                    {idx < steps.length && <div className={`wiz-step-line ${idx < current ? 'wiz-done' : ''}`}></div>}
                </React.Fragment>
            );
        })}
    </div>
);

export const KycGateNotice = ({ kycStatus, onStartKyc }) => {
    const s = getKycStatus({ kycStatus });
    const sub = isKycUnderReview(s)
        ? 'Your verification is being reviewed. You will be able to complete this action once it is approved.'
        : isKycFailed(s)
            ? 'Your previous verification was not approved. Please resubmit your documents to continue.'
            : 'You need to verify your identity before performing this action. This protects your account and complies with regulations.';
    return (
        <div className="kyc-gate">
            <div className="kyc-gate-icon"><i className="fas fa-id-card-alt"></i></div>
            <h3 className="kyc-gate-title">Identity Verification Required</h3>
            <p className="kyc-gate-sub">{sub}</p>
            <div className="kyc-gate-status">
                <span className="kyc-gate-status-label">Current status</span>
                <span className={`kyc-gate-badge kyc-${s.replace(/\s+/g, '-').toLowerCase()}`}>{s}</span>
            </div>
            {!isKycUnderReview(s) && (
                <button type="button" className="btn-submit-card kyc-gate-btn" onClick={onStartKyc}>
                    <i className="fas fa-shield-alt" style={{ marginRight: 6 }}></i>
                    {isKycFailed(s) ? 'Resubmit Verification' : 'Start Verification'}
                </button>
            )}
        </div>
    );
};

export const RequestCardModal = ({ activeModal, setActiveModal, userProfile, userKycStatus, presetTier }) => {
    const { currentUser } = useContext(DataContext);
    const [step, setStep] = useState(1);
    const [tier, setTier] = useState(presetTier || 'platinum');
    const [cardType, setCardType] = useState('virtual');
    const [fullName, setFullName] = useState(userProfile?.fullName || userProfile?.name || currentUser?.name || '');
    const [email, setEmail] = useState(userProfile?.email || currentUser?.email || '');
    const [phone, setPhone] = useState('');
    const [phoneCountry, setPhoneCountry] = useState('US');
    const [country, setCountry] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [zip, setZip] = useState('');
    const [agreed, setAgreed] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [success, setSuccess] = useState(false);

    const isOpen = activeModal === 'request-card-modal';
    const verified = isKycApproved(currentUser)
        || userKycStatus?.status === 'verified'
        || userKycStatus?.isVerified === true;
    const kycStatusForDisplay = getKycStatus(currentUser) || (verified ? 'Approved' : 'Not Submitted');

    React.useEffect(() => {
        if (!isOpen) {
            setStep(1); setIsSubmitting(false); setSubmitError(''); setSuccess(false);
        } else if (presetTier) {
            // Apply the pre-selected tier each time the modal is reopened from
            // the dashboard showcase so the wizard lands on the right card.
            setTier(presetTier);
        }
    }, [isOpen, presetTier]);

    const tiers = [
        { id: 'platinum', name: 'Platinum', price: '$500/yr', icon: 'fas fa-crown', iconBg: 'rgba(240,185,11,0.15)', iconColor: '#F0B90B', features: ['$50,000 monthly limit', '5% crypto cashback', 'Priority support', 'Lounge access'] },
        { id: 'gold', name: 'Gold', price: '$200/yr', icon: 'fas fa-medal', iconBg: 'rgba(240,185,11,0.10)', iconColor: '#F0B90B', features: ['$25,000 monthly limit', '3% crypto cashback', '24/7 support', 'Travel insurance'] },
        { id: 'premium', name: 'Premium', price: '$50/yr', icon: 'fas fa-star', iconBg: 'rgba(132,142,156,0.15)', iconColor: '#848E9C', features: ['$10,000 monthly limit', '1% crypto cashback', 'Email support', 'Basic insurance'] },
    ];
    const tierData = tiers.find(t => t.id === tier);

    const stepLabels = ['Tier', 'Details', 'Shipping', 'Verify'];

    const canContinueStep2 = !!(fullName.trim() && isEmailValid(email) && phone.trim() && country);
    const canContinueStep3 = (cardType === 'virtual' || (address.trim() && city.trim() && state.trim() && zip.trim())) && agreed;

    const goNext = () => {
        if (step === 2 && !canContinueStep2) {
            if (email.trim() && !isEmailValid(email)) { setSubmitError('Please enter a valid email address.'); return; }
            setSubmitError('Please fill in all required fields.');
            return;
        }
        if (step === 3 && !canContinueStep3) {
            setSubmitError(cardType === 'physical' && !agreed ? 'Please complete the shipping address and accept the terms.' : 'Please accept the Terms & Conditions to continue.');
            return;
        }
        setSubmitError('');
        setStep(step + 1);
    };

    const handleFinalSubmit = async () => {
        if (!verified) return;
        const userId = userProfile?.id || currentUser?.id;
        if (!userId) { setSubmitError('Please sign in to request a card.'); return; }
        setIsSubmitting(true);
        setSubmitError('');
        try {
            const dial = countryByCode(phoneCountry)?.dial || '';
            const fullPhone = phone.trim() ? `${dial} ${phone.trim()}`.replace(/\s+/g, ' ').trim() : '';
            const cardDetails = { tier, cardType, fullName, email, phone: fullPhone, country, address, city, state, zip, agreed };
            const result = await requestCard(userId, cardDetails);
            if (result?.success === false) {
                setSubmitError(result?.message || 'Could not submit your request. Please try again.');
            } else {
                setSuccess(true);
            }
        } catch (err) {
            setSubmitError(err?.message || 'Could not submit your request. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-lg">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-credit-card" style={{ color: 'var(--ui-accent)' }}></i>
                        Request a New Card
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body">
                    {!success && <WizardSteps steps={stepLabels} current={step} />}

                    {success && (
                        <div className="wiz-success">
                            <div className="wiz-success-icon"><i className="fas fa-check-circle"></i></div>
                            <h3>Request submitted</h3>
                            <p>Your {tierData?.name} {cardType} card request has been received. We'll notify you once it's approved.</p>
                        </div>
                    )}

                    {!success && step === 1 && (
                        <div>
                            <p style={{ textAlign: 'center', fontWeight: 600, fontSize: 14, color: 'var(--ui-text-on-surface)', marginBottom: 16 }}>Choose Your Card Tier</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                                {tiers.map(t => (
                                    <div key={t.id} className={`modal-tier-option ${tier === t.id ? 'selected' : ''}`} onClick={() => setTier(t.id)}>
                                        <div className="modal-tier-header">
                                            <div className="modal-tier-icon" style={{ background: t.iconBg, color: t.iconColor }}>
                                                <i className={t.icon}></i>
                                            </div>
                                            <div className="modal-tier-name">{t.name}</div>
                                            <div className="modal-tier-price">{t.price}</div>
                                        </div>
                                        <ul className="modal-tier-features">
                                            {t.features.map((f, i) => (
                                                <li key={i}><i className="fas fa-check"></i>{f}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!success && step === 2 && (
                        <div>
                            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ui-text-on-surface)', marginBottom: 14 }}>Card Type & Personal Information</p>
                            <div className="form-grid-2col" style={{ gap: 10, marginBottom: 16 }}>
                                <div className={`modal-type-option ${cardType === 'virtual' ? 'selected' : ''}`} onClick={() => setCardType('virtual')}>
                                    <div className="modal-type-icon blue"><i className="fas fa-mobile-alt"></i></div>
                                    <div>
                                        <div className="modal-type-name">Virtual</div>
                                        <div className="modal-type-desc">Instant activation</div>
                                    </div>
                                </div>
                                <div className={`modal-type-option ${cardType === 'physical' ? 'selected' : ''}`} onClick={() => setCardType('physical')}>
                                    <div className="modal-type-icon green"><i className="fas fa-credit-card"></i></div>
                                    <div>
                                        <div className="modal-type-name">Physical</div>
                                        <div className="modal-type-desc">Shipped to your address</div>
                                    </div>
                                </div>
                            </div>
                            <div className="form-grid-2col" style={{ gap: 12 }}>
                                <div className="form-group">
                                    <label className="form-label">Full Name</label>
                                    <input type="text" className="form-input" placeholder="As on your ID" value={fullName} onChange={e => setFullName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email Address</label>
                                    <input type="email" className="form-input" placeholder="For notifications" value={email} onChange={e => setEmail(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone Number</label>
                                    <PhoneField
                                        value={phone}
                                        onChange={setPhone}
                                        countryCode={phoneCountry}
                                        onCountryChange={setPhoneCountry}
                                        placeholder="Mobile number"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Country</label>
                                    <CountrySelect value={country} onChange={(c) => { setCountry(c); setState(''); }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {!success && step === 3 && (
                        <div>
                            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ui-text-on-surface)', marginBottom: 14 }}>Shipping & Agreement</p>
                            {cardType === 'physical' ? (
                                <div className="modal-block">
                                    <div className="modal-block-title">
                                        <i className="fas fa-map-marker-alt"></i>
                                        Shipping Address
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Street Address</label>
                                        <AddressAutocomplete
                                            value={address}
                                            onChange={setAddress}
                                            countryCode={country}
                                            placeholder="Start typing your street address..."
                                            onSelect={({ address: a, city: c, state: s, zip: z, countryCode: cc }) => {
                                                if (a) setAddress(a);
                                                if (c) setCity(c);
                                                if (s) setState(s);
                                                if (z) setZip(z);
                                                if (cc) setCountry(cc);
                                            }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                        <div className="form-group">
                                            <label className="form-label">City</label>
                                            <input type="text" className="form-input" value={city} onChange={e => setCity(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">State / Province</label>
                                            <StateSelect countryCode={country} value={state} onChange={setState} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Postal Code</label>
                                            <input type="text" className="form-input" value={zip} onChange={e => setZip(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="modal-note" style={{ marginBottom: 12 }}>
                                    <i className="fas fa-bolt" style={{ color: 'var(--ui-accent)' }}></i>
                                    <div className="modal-note-body">
                                        <p className="modal-note-title">Virtual card - no shipping required</p>
                                        <p className="modal-note-text">Your virtual card will be available instantly after approval.</p>
                                    </div>
                                </div>
                            )}
                            <label className="modal-agree-block">
                                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                                <div>
                                    <div className="modal-agree-title">Terms & Conditions</div>
                                    <div className="modal-agree-text">I agree to the <a href="#" style={{ color: 'var(--ui-accent)' }}>Terms and Conditions</a> and <a href="#" style={{ color: 'var(--ui-accent)' }}>Privacy Policy</a>. I understand the fees and limits for my selected tier.</div>
                                </div>
                            </label>
                        </div>
                    )}

                    {!success && step === 4 && (
                        <div>
                            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ui-text-on-surface)', marginBottom: 14 }}>Review & Identity Verification</p>
                            <div className="modal-summary" style={{ marginBottom: 14 }}>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Tier</span>
                                    <span className="modal-summary-value">{tierData?.name} <span style={{ color: 'var(--ui-text-muted)', fontWeight: 500, marginLeft: 6 }}>{tierData?.price}</span></span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Card Type</span>
                                    <span className="modal-summary-value">{cardType === 'physical' ? 'Physical' : 'Virtual'}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Cardholder</span>
                                    <span className="modal-summary-value">{fullName || '-'}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Contact</span>
                                    <span className="modal-summary-value" style={{ fontSize: 12 }}>{email}<br /><span style={{ color: 'var(--ui-text-muted)' }}>{phone}</span></span>
                                </div>
                                {cardType === 'physical' && (
                                    <div className="modal-summary-row">
                                        <span className="modal-summary-label">Ship To</span>
                                        <span className="modal-summary-value" style={{ fontSize: 12, textAlign: 'right' }}>{address}<br /><span style={{ color: 'var(--ui-text-muted)' }}>{city}, {state} {zip}  /  {country}</span></span>
                                    </div>
                                )}
                                <div className="modal-summary-row modal-summary-total">
                                    <span className="modal-summary-label">Annual Fee</span>
                                    <span className="modal-summary-value" style={{ color: 'var(--ui-accent)' }}>{tierData?.price}</span>
                                </div>
                            </div>

                            {verified ? (
                                <div className="kyc-gate kyc-gate-ok">
                                    <div className="kyc-gate-icon kyc-gate-icon-ok"><i className="fas fa-check-circle"></i></div>
                                    <h3 className="kyc-gate-title">You're verified</h3>
                                    <p className="kyc-gate-sub">Confirm to submit your card request for approval.</p>
                                </div>
                            ) : (
                                <KycGateNotice kycStatus={kycStatusForDisplay} onStartKyc={() => setActiveModal('kyc-modal')} />
                            )}

                            {submitError && (
                                <div className="modal-error-msg" style={{ marginTop: 10 }}>
                                    <i className="fas fa-exclamation-triangle"></i>{submitError}
                                </div>
                            )}
                        </div>
                    )}

                    {!success && submitError && step !== 4 && (
                        <div className="modal-error-msg" style={{ marginTop: 10 }}>
                            <i className="fas fa-exclamation-triangle"></i>{submitError}
                        </div>
                    )}
                </div>

                {!success && (
                    <div className="modal-footer">
                        {step > 1 && (
                            <button type="button" className="btn-secondary" onClick={() => { setSubmitError(''); setStep(step - 1); }}>
                                <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                            </button>
                        )}
                        {step < 4 ? (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={goNext}>
                                Continue<i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
                            </button>
                        ) : (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleFinalSubmit} disabled={!verified || isSubmitting}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Submitting...</> : <><i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Submit Request</>}
                            </button>
                        )}
                    </div>
                )}
                {success && (
                    <div className="modal-footer">
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Done</button>
                    </div>
                )}
            </div>
        </ModalRoot>
    );
};

export const NotificationModal = ({ activeModal, setActiveModal, title, message, type = 'info' }) => {
    const iconMap = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-triangle',
        warning: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle',
    };
    const colorMap = {
        success: '#0ECB81',
        error: '#F6465D',
        warning: '#F0B90B',
        info: '#848E9C',
    };

    return (
        <ModalRoot open={activeModal === 'notification-modal'}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={iconMap[type]} style={{ color: colorMap[type] }}></i>
                        {title}
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: 13, color: 'var(--ui-text-soft)', lineHeight: 1.6 }}>{message}</p>
                </div>
                <div className="modal-footer">
                    <button className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>
                        OK
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const DepositModal = ({ activeModal, setActiveModal, cryptoData, currentUser }) => {
    const platformSettings = usePlatformSettings();
    const [selectedAssetTicker, setSelectedAssetTicker] = useState('');
    const [availableNetworks, setAvailableNetworks] = useState([]);
    const [selectedNetworkKey, setSelectedNetworkKey] = useState(null);
    const [isNetworksLoading, setIsNetworksLoading] = useState(false);
    const [networksError, setNetworksError] = useState('');
    const [generatedAddress, setGeneratedAddress] = useState('');
    const [generatedNetwork, setGeneratedNetwork] = useState(null);
    const [depositError, setDepositError] = useState('');
    const [copied, setCopied] = useState(false);
    const addressRequestRef = useRef(0);

    const availableTickers = Array.isArray(platformSettings?.availableDepositAssets) && platformSettings.availableDepositAssets.length > 0
        ? platformSettings.availableDepositAssets.map(ticker => String(ticker).toUpperCase())
        : null;
    const filteredCryptoData = availableTickers
        ? (cryptoData || []).filter(a => availableTickers.includes(String(a.ticker || '').toUpperCase()))
        : (cryptoData || []);
    const selectedAssetData = (cryptoData || []).find(
        asset => String(asset.ticker || '').toUpperCase() === selectedAssetTicker
    );

    const resetNetworkState = () => {
        setAvailableNetworks([]);
        setSelectedNetworkKey(null);
        setNetworksError('');
        setGeneratedAddress('');
        setGeneratedNetwork(null);
        setCopied(false);
        setDepositError('');
        setIsNetworksLoading(false);
    };

    useEffect(() => {
        if (activeModal !== 'deposit-modal') {
            addressRequestRef.current += 1;
            setSelectedAssetTicker('');
            resetNetworkState();
        }
    }, [activeModal]);

    const handleAssetChange = (e) => {
        const ticker = String(e.target.value || '').trim().toUpperCase();
        const requestId = ++addressRequestRef.current;
        setSelectedAssetTicker(ticker);
        resetNetworkState();
        if (!ticker) return;
        setIsNetworksLoading(true);
        const addressLookup = currentUser?.impersonated && currentUser?.id
            ? getAdminPreviewDepositAddresses(currentUser.id, ticker)
            : getClientDepositAddresses(ticker);
        addressLookup
            .then(({ provisioned, networks, addresses, network }) => {
                if (requestId !== addressRequestRef.current) return;
                const resolvedNetworks = normalizeDepositNetworks({ networks, addresses, network });
                if (!provisioned || resolvedNetworks.length === 0) {
                    setNetworksError('Deposit address unavailable. This asset may be temporarily suspended for deposits due to a network upgrade or wallet maintenance. Please try again later or contact support.');
                    setAvailableNetworks([]);
                } else {
                    setAvailableNetworks(resolvedNetworks);
                    // Auto-select when only one network is available
                    if (resolvedNetworks.length === 1) {
                        const only = resolvedNetworks[0];
                        const key = only.network ?? '__default__';
                        setSelectedNetworkKey(key);
                        setGeneratedAddress(only.addresses[0]);
                        setGeneratedNetwork(only.network);
                    }
                }
            })
            .catch(() => {
                if (requestId !== addressRequestRef.current) return;
                setNetworksError('Unable to retrieve deposit address. This may be caused by network congestion or a temporary service interruption. Please wait a moment and try again, or contact support if the issue persists.');
                setAvailableNetworks([]);
            })
            .finally(() => {
                if (requestId === addressRequestRef.current) setIsNetworksLoading(false);
            });
    };

    const handleNetworkSelect = (networkEntry) => {
        const key = networkEntry.network ?? '__default__';
        setSelectedNetworkKey(key);
        setGeneratedAddress(networkEntry.addresses[0] || '');
        setGeneratedNetwork(networkEntry.network || null);
        setCopied(false);
        setDepositError('');
    };

    const handleShare = async () => {
        const asset = selectedAssetData;
        const text = `Send ${asset?.ticker || 'crypto'} to my deposit address:\n${generatedAddress}${generatedNetwork ? `\nNetwork: ${generatedNetwork}` : ''}`;
        if (navigator.share) {
            try { await navigator.share({ title: `${asset?.ticker || 'Deposit'} Address`, text }); return; } catch (_) {}
        }
        // Fallback: silently copy without triggering the Copy button animation
        try {
            await navigator.clipboard.writeText(generatedAddress);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = generatedAddress;
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
    };

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
    };
    return (
        <ModalRoot open={activeModal === 'deposit-modal'}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-arrow-down" style={{ color: '#0ECB81' }}></i>
                        Deposit Crypto
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body deposit-modal-body">
                    {/* ── Step 1: Select crypto asset ── */}
                    <div className="form-group deposit-field">
                        <label className="form-label">Select Asset</label>
                        <select className="form-select" value={selectedAssetTicker} onChange={handleAssetChange}>
                            <option value="">Choose an asset</option>
                            {filteredCryptoData.map(asset => (
                                <option key={asset.id} value={String(asset.ticker || '').toUpperCase()}>{asset.ticker}</option>
                            ))}
                        </select>
                    </div>

                    {/* ── Step 2: Network selection - only shown when loading, error, or multiple networks ── */}
                    {selectedAssetTicker && (isNetworksLoading || networksError || availableNetworks.length > 1) && (
                        <div className="form-group deposit-field">
                            {availableNetworks.length > 1 && <label className="form-label">Select Network</label>}

                            {isNetworksLoading && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ui-text-soft)', fontSize: 13, padding: '10px 0' }}>
                                    <i className="fas fa-spinner fa-spin" style={{ fontSize: 13 }}></i>
                                    Loading available networks...
                                </div>
                            )}

                            {!isNetworksLoading && networksError && (
                                <div style={{ fontSize: 13, color: '#F6465D', padding: '8px 12px', background: 'rgba(246,70,93,0.07)', border: '1px solid rgba(246,70,93,0.2)', borderRadius: 8 }}>
                                    <i className="fas fa-exclamation-circle" style={{ marginRight: 7 }}></i>
                                    {networksError}
                                </div>
                            )}

                            {!isNetworksLoading && availableNetworks.length > 1 && (
                                <select
                                    className="form-select"
                                    value={selectedNetworkKey ?? ''}
                                    onChange={e => {
                                        const key = e.target.value;
                                        const netEntry = availableNetworks.find(n => (n.network ?? '__default__') === key);
                                        if (netEntry) handleNetworkSelect(netEntry);
                                    }}
                                >
                                    <option value="">Choose a network</option>
                                    {availableNetworks.map(netEntry => {
                                        const key = netEntry.network ?? '__default__';
                                        return (
                                            <option key={key} value={key}>
                                                {netEntry.network || 'Default Network'}
                                            </option>
                                        );
                                    })}
                                </select>
                            )}
                        </div>
                    )}

                    {/* ── Step 3: Address + QR (after network selected) ── */}
                    {generatedAddress && (
                        <div className="modal-address-section deposit-address-section">
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                {/* QR Card */}
                                <div style={{
                                    background: '#fff',
                                    borderRadius: 20,
                                    padding: '20px 20px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 12,
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                                    width: '100%',
                                    maxWidth: 280,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {selectedAssetData?.icon && (
                                            <img src={selectedAssetData.icon} alt={selectedAssetData.ticker} style={{ width: 22, height: 22, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />
                                        )}
                                        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{selectedAssetData?.ticker}</span>
                                        {generatedNetwork && (
                                            <span style={{ fontSize: 12, color: '#4B5563', fontWeight: 600 }}>({generatedNetwork})</span>
                                        )}
                                    </div>

                                    <div style={{ position: 'relative', lineHeight: 0 }}>
                                        <QRCodeSVG
                                            value={generatedAddress.trim()}
                                            size={200}
                                            level="M"
                                            marginSize={2}
                                            fgColor="#1E2026"
                                            bgColor="#ffffff"
                                            role="img"
                                            aria-label={`${selectedAssetData?.ticker || 'Crypto'} deposit QR code`}
                                        />
                                    </div>

                                    <div style={{ textAlign: 'center', width: '100%' }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#374151', wordBreak: 'break-all', lineHeight: 1.5, padding: '0 4px' }}>
                                            {generatedAddress}
                                        </div>
                                    </div>
                                </div>

                                {/* Action buttons: Copy | Share */}
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginTop: 22, marginBottom: 4 }}>
                                    <button
                                        onClick={() => copyToClipboard(generatedAddress)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                                        title={copied ? 'Copied!' : 'Copy address'}
                                    >
                                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: copied ? '#0ECB81' : 'var(--ui-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 160ms ease' }}>
                                            <i className={copied ? 'fas fa-check' : 'fas fa-copy'} style={{ color: 'var(--ui-text-on-surface)', fontSize: 18 }}></i>
                                        </div>
                                        <span style={{ fontSize: 12, color: copied ? '#0ECB81' : 'var(--ui-text-soft)', transition: 'color 160ms ease' }}>{copied ? 'Copied!' : 'Copy'}</span>
                                    </button>

                                    <button
                                        onClick={handleShare}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                                        title="Share address"
                                    >
                                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--ui-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <i className="fas fa-share-alt" style={{ color: 'var(--ui-text-on-surface)', fontSize: 18 }}></i>
                                        </div>
                                        <span style={{ fontSize: 12, color: 'var(--ui-text-soft)' }}>Share</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {depositError && (
                        <div className="modal-error-msg">
                            <i className="fas fa-exclamation-circle"></i>
                            {depositError}
                        </div>
                    )}

                    <div className="modal-note">
                        <i className="fas fa-info-circle"></i>
                        <div className="modal-note-body">
                            <p className="modal-note-title">Deposit Tips</p>
                            <ul className="modal-note-list">
                                <li>Double-check the address and network before sending</li>
                                <li>Only send {selectedAssetData?.ticker || 'the correct asset'} on the selected network</li>
                                <li>Deposits arrive within 10-30 minutes</li>
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </ModalRoot>
    );
};

const ADDRESS_PATTERNS = {
    erc20:     { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    bep20:     { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    polygon:   { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    arbitrum:  { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    optimism:  { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    avalanche: { re: /^0x[0-9a-fA-F]{40}$/, hint: 'Must start with 0x followed by 40 hex characters' },
    trc20:     { re: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, hint: 'Must start with T followed by 33 alphanumeric characters' },
    solana:    { re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, hint: 'Must be 32-44 base58 characters, no 0/O/I/l' },
    bitcoin:   { re: /^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$|^bc1[a-z0-9]{39,59}$/, hint: 'Must start with 1, 3, or bc1' },
};

const NETWORKS = [
    { value: 'erc20',     label: 'ERC-20 (Ethereum)' },
    { value: 'bep20',     label: 'BEP-20 (BNB Smart Chain)' },
    { value: 'polygon',   label: 'Polygon (MATIC)' },
    { value: 'arbitrum',  label: 'Arbitrum One' },
    { value: 'optimism',  label: 'Optimism' },
    { value: 'avalanche', label: 'Avalanche C-Chain' },
    { value: 'trc20',     label: 'TRC-20 (Tron)' },
    { value: 'solana',    label: 'Solana (SPL)' },
    { value: 'bitcoin',   label: 'Bitcoin (BTC)' },
];

export const WithdrawModal = ({ activeModal, setActiveModal, cryptoData, currentUser }) => {
    const { mergeBalancesFromApi } = useContext(DataContext);
    const [selectedAsset, setSelectedAsset] = useState('');
    const [selectedNetwork, setSelectedNetwork] = useState('');
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [addressError, setAddressError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [withdrawError, setWithdrawError] = useState('');
    const [withdrawSubmitted, setWithdrawSubmitted] = useState(false);
    const [submittedWithdrawal, setSubmittedWithdrawal] = useState(null);

    const selectedAssetData = cryptoData.find(asset => asset.id === selectedAsset);
    const availableBalance = selectedAssetData ? selectedAssetData.balance : 0;
    const networkFee = selectedNetwork ? 0.0001 : 0;
    const usdValue = selectedAssetData && amount ? (parseFloat(amount) * selectedAssetData.price).toFixed(2) : '0.00';
    const totalAmount = amount ? (parseFloat(amount) + networkFee) : networkFee;

    const handleAddressChange = (e) => {
        setAddress(e.target.value);
    };

    const handleNetworkChange = (e) => {
        setSelectedNetwork(e.target.value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!showConfirmation) { setShowConfirmation(true); return; }
        setWithdrawError('');
        if (!currentUser?.id) { setWithdrawError('Please sign in to complete a withdrawal.'); return; }
        setIsSubmitting(true);
        try {
            const res = await submitWithdrawal({
                asset: selectedAssetData?.ticker,
                amountDisplay: parseFloat(amount),
                destination: address,
                network: selectedNetwork,
            });
            setSubmittedWithdrawal({
                asset: selectedAssetData?.ticker || '',
                assetName: selectedAssetData?.asset || '',
                amount: parseFloat(amount),
                address,
                network: selectedNetwork,
                id: res?.withdrawal?.id || '-',
            });
            setWithdrawSubmitted(true);
            setShowConfirmation(false);
        } catch (error) {
            setWithdrawError(error.message || 'Withdrawal failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleWithdrawDone = () => {
        setWithdrawSubmitted(false);
        setSubmittedWithdrawal(null);
        setSelectedAsset(''); setSelectedNetwork(''); setAmount(''); setAddress('');
        setAddressError('');
        setShowConfirmation(false); setWithdrawError('');
        setActiveModal(null);
    };

    if (withdrawSubmitted && submittedWithdrawal) {
        const sw = submittedWithdrawal;
        const shortAddr = sw.address ? `${sw.address.slice(0, 10)}...${sw.address.slice(-8)}` : '-';
        const fmtAmt = +parseFloat(sw.amount || 0).toPrecision(8);
        return (
            <ModalRoot open={activeModal === 'withdraw-modal'}>
                <div className="modal-content modal-md">
                    <div className="modal-header" style={{ borderBottom: '1px solid var(--ui-border)' }}>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-paper-plane" style={{ color: '#0ECB81' }}></i>
                            Withdrawal Processing
                        </h2>
                        <button className="modal-close-btn" onClick={handleWithdrawDone}><i className="fas fa-times"></i></button>
                    </div>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, paddingTop: 28, paddingBottom: 28 }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(14,203,129,0.1)', border: '2px solid rgba(14,203,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <i className="fas fa-check" style={{ fontSize: 30, color: '#0ECB81' }}></i>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ui-text-on-surface)', marginBottom: 6 }}>Processing on Blockchain</div>
                            <div style={{ fontSize: 13, color: 'var(--ui-text-soft)', lineHeight: 1.6 }}>
                                Your transaction has been broadcast to the network.<br/>
                                On-chain settlement typically completes within <strong style={{ color: 'var(--ui-text-on-surface)' }}>10-30 minutes</strong> depending on network congestion.
                            </div>
                        </div>
                        <div style={{ width: '100%', background: 'var(--ui-input-bg)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--ui-text-soft)' }}>Asset</span>
                                <span style={{ color: 'var(--ui-text-on-surface)', fontWeight: 600 }}>{sw.assetName} ({sw.asset})</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--ui-text-soft)' }}>Amount</span>
                                <span style={{ color: 'var(--ui-text-on-surface)', fontWeight: 600 }}>{fmtAmt} {sw.asset}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--ui-text-soft)' }}>Destination</span>
                                <span style={{ color: 'var(--ui-text-on-surface)', fontFamily: 'monospace', fontSize: 12 }}>{shortAddr}</span>
                            </div>
                            {sw.network && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                <span style={{ color: 'var(--ui-text-soft)' }}>Network</span>
                                <span style={{ color: 'var(--ui-text-on-surface)' }}>{sw.network}</span>
                            </div>}
                            <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: 'var(--ui-text-soft)' }}>Reference ID</span>
                                <span style={{ color: 'var(--ui-text-soft)', fontFamily: 'monospace' }}>{sw.id}</span>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(14,203,129,0.05)', border: '1px solid rgba(14,203,129,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--ui-text-soft)', lineHeight: 1.6, width: '100%' }}>
                            <i className="fas fa-shield-alt" style={{ color: '#0ECB81', marginRight: 6 }}></i>
                            Your funds are secured. You will receive a notification once the transaction is confirmed on-chain. Keep your Reference ID for any support inquiries.
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleWithdrawDone}>
                            <i className="fas fa-home" style={{ marginRight: 6 }}></i>Return to Dashboard
                        </button>
                    </div>
                </div>
        </ModalRoot>
        );
    }

    if (showConfirmation) {
        return (
            <ModalRoot open={activeModal === 'withdraw-modal'}>
                <div className="modal-content modal-md">
                    <div className="modal-header">
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-exclamation-triangle" style={{ color: 'var(--ui-accent)' }}></i>
                            Confirm Withdrawal
                        </h2>
                        <button className="modal-close-btn" onClick={() => setShowConfirmation(false)}><i className="fas fa-times"></i></button>
                    </div>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 20px 12px' }}>
                        {withdrawError && <div className="modal-error-msg" style={{ marginBottom: 0, borderRadius: 8, padding: '12px 16px', fontSize: 13, lineHeight: 1.5 }}><i className="fas fa-exclamation-circle" style={{ flexShrink: 0 }}></i>{withdrawError}</div>}
                        <div className="modal-summary" style={{ padding: '14px 16px' }}>
                            <div className="modal-summary-row" style={{ padding: '6px 0' }}>
                                <span className="modal-summary-label">Asset</span>
                                <span className="modal-summary-value">{selectedAssetData?.asset}</span>
                            </div>
                            <div className="modal-summary-row" style={{ padding: '6px 0' }}>
                                <span className="modal-summary-label">Amount</span>
                                <span className="modal-summary-value">{amount} {selectedAssetData?.ticker} ≈ ${usdValue}</span>
                            </div>
                            <div className="modal-summary-row" style={{ padding: '6px 0' }}>
                                <span className="modal-summary-label">Address</span>
                                <span className="modal-summary-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{address.slice(0, 20)}...</span>
                            </div>
                        </div>
                        <div className="modal-note modal-warning" style={{ padding: '14px 16px', gap: 12 }}>
                            <i className="fas fa-exclamation-triangle" style={{ marginTop: 2 }}></i>
                            <div className="modal-note-body">
                                <p className="modal-note-title" style={{ marginBottom: 6 }}>Please verify carefully</p>
                                <ul className="modal-note-list" style={{ lineHeight: 1.8 }}>
                                    <li>Withdrawals cannot be reversed once processed</li>
                                    <li>Ensure the recipient address is correct</li>
                                    <li>Network fees will be deducted</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-secondary flex-1" onClick={() => { setShowConfirmation(false); setWithdrawError(''); }}>
                            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                        </button>
                        <button type="button" className="btn-danger flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</> : <><i className="fas fa-paper-plane" style={{ marginRight: 6 }}></i>Confirm</>}
                        </button>
                    </div>
                </div>
        </ModalRoot>
        );
    }

    return (
        <ModalRoot open={activeModal === 'withdraw-modal'}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-arrow-up" style={{ color: '#F6465D' }}></i>
                        Withdraw Crypto
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body">
                    <form id="withdraw-form" onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Select Asset</label>
                                <select className="form-input" value={selectedAsset} onChange={e => setSelectedAsset(e.target.value)}>
                                    <option value="">Choose a crypto asset...</option>
                                    {cryptoData.map(asset => (
                                        <option key={asset.id} value={asset.id}>
                                            {asset.asset} ({asset.balance.toFixed(6)} | ${(asset.balance * asset.price).toFixed(2)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Select Network</label>
                                <select className="form-input" value={selectedNetwork} onChange={handleNetworkChange} required>
                                    <option value="">Select network</option>
                                    {NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                                </select>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Amount</label>
                                <div style={{ position: 'relative' }}>
                                    <input type="number" step="any" className="form-input" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required min="0" max={availableBalance} style={{ paddingRight: '52px' }} />
                                    <button type="button" onClick={() => setAmount(availableBalance.toString())} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ui-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', padding: '2px 4px' }}>MAX</button>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--ui-text-muted)' }}>
                                    <span>Available: <strong style={{ color: 'var(--ui-text-on-surface)' }}>{availableBalance.toFixed(8)} {selectedAssetData?.ticker}</strong></span>
                                    <span>≈ <strong style={{ color: 'var(--ui-text-on-surface)' }}>${usdValue}</strong></span>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Recipient Address</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder={selectedNetwork ? `Enter ${NETWORKS.find(n => n.value === selectedNetwork)?.label || ''} address` : 'Select a network first'}
                                    value={address}
                                    onChange={handleAddressChange}
                                    required
                                />
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>
                                    <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
                                    Double-check - withdrawals are irreversible
                                </p>
                            </div>

                            <div className="modal-summary">
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Amount</span>
                                    <span className="modal-summary-value">{amount || '0.00'} {selectedAssetData?.ticker}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Network Fee</span>
                                    <span className="modal-summary-value">{networkFee.toFixed(6)} {selectedAssetData?.ticker}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">USD Value</span>
                                    <span className="modal-summary-value">${usdValue}</span>
                                </div>
                                <div className="modal-summary-row modal-summary-total">
                                    <span className="modal-summary-label">Total</span>
                                    <span className="modal-summary-value">{totalAmount.toFixed(8)} {selectedAssetData?.ticker}</span>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="modal-footer">
                    <button type="submit" form="withdraw-form" className="btn-submit-card" style={{ flex: 1 }} disabled={!selectedAsset || !selectedNetwork || !amount || !address || !!addressError || parseFloat(amount) <= 0}>
                        <i className="fas fa-arrow-right" style={{ marginRight: 6 }}></i>Review Withdrawal
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const CryptoToCardModal = ({ activeModal, setActiveModal, cryptoData, selectedCard }) => {
    const { currentUser } = useContext(DataContext);
    const [step, setStep] = useState(1);
    const [selectedCrypto, setSelectedCrypto] = useState('');
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const isOpen = activeModal === 'crypto-to-card-modal';
    const verified = isKycApproved(currentUser?.kycStatus);

    const selectedCryptoData = cryptoData.find(asset => asset.id === selectedCrypto);
    const availableBalance = selectedCryptoData ? selectedCryptoData.balance : 0;
    const usdValue = selectedCryptoData && amount ? (parseFloat(amount) * selectedCryptoData.price).toFixed(2) : '0.00';
    const conversionFee = 0.02;
    const totalFiatAmount = (parseFloat(usdValue) * (1 - conversionFee)).toFixed(2);

    React.useEffect(() => {
        if (!isOpen) {
            setStep(1); setSelectedCrypto(''); setAmount('');
            setIsSubmitting(false); setSuccess(false);
        }
    }, [isOpen]);

    const handleSubmit = () => {
        if (!verified) return;
        setIsSubmitting(true);
        setTimeout(() => { setIsSubmitting(false); setSuccess(true); }, 1500);
    };

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-exchange-alt" style={{ color: '#0ECB81' }}></i>
                        Convert Crypto to Card
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body">
                    {!success && <WizardSteps steps={['Amount', 'Review', 'Verify']} current={step} />}

                    {success ? (
                        <div className="wiz-success">
                            <div className="wiz-success-icon"><i className="fas fa-check-circle"></i></div>
                            <h3>Conversion submitted</h3>
                            <p>${totalFiatAmount} will be credited to your card shortly.</p>
                        </div>
                    ) : selectedCard && (
                        <div className="modal-card-preview">
                            <div className="modal-card-preview-icon"><i className="fas fa-credit-card"></i></div>
                            <div>
                                <div className="modal-card-preview-name">{selectedCard.cardholderName}</div>
                                <div className="modal-card-preview-num">**** **** **** {selectedCard.cardNumber?.slice(-4)}</div>
                            </div>
                        </div>
                    )}

                    {!success && step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Select Crypto Asset</label>
                                <select className="form-input" value={selectedCrypto} onChange={e => setSelectedCrypto(e.target.value)}>
                                    <option value="">Choose a crypto asset...</option>
                                    {cryptoData && cryptoData.map(asset => (
                                        <option key={asset.id} value={asset.id}>
                                            {asset.asset} - {asset.ticker} ({asset.balance.toFixed(6)})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedCrypto && (
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Amount to Convert</label>
                                    <div style={{ position: 'relative' }}>
                                        <input type="number" step="any" className="form-input" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} min="0" max={availableBalance} style={{ paddingRight: '64px' }} />
                                        <button type="button" onClick={() => setAmount(availableBalance.toString())} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#0ECB81', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', minWidth: 'auto', padding: '2px 4px' }}>MAX</button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--ui-text-muted)' }}>
                                        <span>Available: <strong style={{ color: 'var(--ui-text-on-surface)' }}>{availableBalance.toFixed(8)} {selectedCryptoData?.ticker}</strong></span>
                                        <span>≈ <strong style={{ color: 'var(--ui-text-on-surface)' }}>${usdValue}</strong></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!success && step === 2 && (
                        <>
                            <div className="modal-summary">
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Crypto Asset</span>
                                    <span className="modal-summary-value">{selectedCryptoData?.asset}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Amount</span>
                                    <span className="modal-summary-value">{amount} {selectedCryptoData?.ticker}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">USD Value</span>
                                    <span className="modal-summary-value">${usdValue}</span>
                                </div>
                                <div className="modal-summary-row">
                                    <span className="modal-summary-label">Conversion Fee (2%)</span>
                                    <span className="modal-summary-value" style={{ color: '#F6465D' }}>-${(parseFloat(usdValue) * conversionFee).toFixed(2)}</span>
                                </div>
                                <div className="modal-summary-row modal-summary-total">
                                    <span className="modal-summary-label">Fiat to Card</span>
                                    <span className="modal-summary-value" style={{ color: '#0ECB81' }}>${totalFiatAmount}</span>
                                </div>
                            </div>
                            <div className="modal-note modal-warning" style={{ marginTop: 12 }}>
                                <i className="fas fa-exclamation-circle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-title">This conversion is irreversible</p>
                                    <p className="modal-note-text">Fiat will be credited to your selected card immediately after processing.</p>
                                </div>
                            </div>
                        </>
                    )}

                    {!success && step === 3 && (
                        verified ? (
                            <div className="kyc-gate kyc-gate-ok">
                                <div className="kyc-gate-icon kyc-gate-icon-ok"><i className="fas fa-check-circle"></i></div>
                                <h3 className="kyc-gate-title">You're verified</h3>
                                <p className="kyc-gate-sub">Confirm to convert and credit ${totalFiatAmount} to your card.</p>
                            </div>
                        ) : (
                            <KycGateNotice kycStatus={currentUser?.kycStatus} onStartKyc={() => setActiveModal('kyc-modal')} />
                        )
                    )}
                </div>

                {!success && (
                    <div className="modal-footer">
                        {step > 1 && (
                            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
                                <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                            </button>
                        )}
                        {step < 3 ? (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setStep(step + 1)} disabled={step === 1 && (!selectedCrypto || !amount || parseFloat(amount) <= 0)}>
                                Continue<i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
                            </button>
                        ) : (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleSubmit} disabled={!verified || isSubmitting}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</> : <><i className="fas fa-arrow-right" style={{ marginRight: 6 }}></i>Confirm & Convert</>}
                            </button>
                        )}
                    </div>
                )}
                {success && (
                    <div className="modal-footer">
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Done</button>
                    </div>
                )}
            </div>
        </ModalRoot>
    );
};

;

export const SetPinModal = ({ activeModal, setActiveModal, selectedCard }) => {
    const { currentUser, setCardPin } = useContext(DataContext);
    const [step, setStep] = useState(1);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const isOpen = activeModal === 'set-pin-modal';
    const verified = isKycApproved(currentUser?.kycStatus);

    React.useEffect(() => {
        if (!isOpen) {
            setStep(1); setCurrentPin(''); setNewPin(''); setConfirmPin('');
            setError(''); setIsSubmitting(false); setSuccess(false);
        }
    }, [isOpen]);

    const handlePinChange = (value, setter) => {
        setter(value.replace(/\D/g, '').substring(0, 4));
        setError('');
    };

    const getPinStrength = (pin) => {
        if (pin.length < 4) return { level: 0, text: '', color: 'var(--ui-surface-hover)' };
        if (/^(.)\1+$/.test(pin) || /^(0123|1234|2345|3456|4567|5678|6789|9876|8765)$/.test(pin)) return { level: 1, text: 'Weak', color: '#F6465D' };
        if (/^(\d)\1{2,}/.test(pin)) return { level: 2, text: 'Fair', color: 'var(--ui-accent)' };
        return { level: 3, text: 'Good', color: '#0ECB81' };
    };
    const strength = getPinStrength(newPin);

    const validateStep1 = () => {
        if (currentPin.length !== 4) { setError('Enter your current 4-digit PIN'); return false; }
        if (newPin.length !== 4) { setError('New PIN must be exactly 4 digits'); return false; }
        if (newPin !== confirmPin) { setError('PINs do not match'); return false; }
        if (newPin === currentPin) { setError('New PIN must differ from current PIN'); return false; }
        return true;
    };

    const handleNext = () => {
        if (step === 1) { if (!validateStep1()) return; setStep(2); return; }
        if (step === 2) { setStep(3); return; }
    };

    const handleSubmit = async () => {
        if (!verified || !selectedCard?.id) return;
        setIsSubmitting(true);
        setError('');
        try {
            await setCardPin(selectedCard.id, currentPin, newPin);
            setSuccess(true);
        } catch (err) {
            // 401 here means the current PIN is wrong (auth-class error from
            // the route, not a session problem). Send the user back to step 1
            // so they can retype it instead of losing the whole modal flow.
            if (err?.status === 401) {
                setError('Current PIN is incorrect.');
                setStep(1);
            } else if (err?.status === 409) {
                setError('This card is blocked. Unblock it before changing the PIN.');
            } else if (err?.status === 429) {
                setError('Too many attempts. Please try again in a few minutes.');
            } else {
                setError(err?.message || 'Could not update PIN. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-key" style={{ color: 'var(--ui-accent)' }}></i>
                        Set Card PIN
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body">
                    {!success && <WizardSteps steps={['Create PIN', 'Review', 'Verify']} current={step} />}

                    {success ? (
                        <div className="wiz-success">
                            <div className="wiz-success-icon"><i className="fas fa-check-circle"></i></div>
                            <h3>PIN updated successfully</h3>
                            <p>Your new card PIN is now active.</p>
                        </div>
                    ) : selectedCard && (
                        <div className="modal-card-preview" style={{ marginBottom: 16 }}>
                            <div className="modal-card-preview-icon"><i className="fas fa-credit-card"></i></div>
                            <div>
                                <div className="modal-card-preview-name">{selectedCard.cardholderName}</div>
                                <div className="modal-card-preview-num">**** **** **** {selectedCard.cardNumber?.slice(-4)}</div>
                            </div>
                        </div>
                    )}

                    {!success && step === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Current PIN</label>
                                <input type="password" className="form-input" style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }} placeholder="••••" value={currentPin} onChange={e => handlePinChange(e.target.value, setCurrentPin)} maxLength="4" autoComplete="current-password" />
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>{currentPin.length}/4 digits - required to authorize the change</p>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <label className="form-label" style={{ margin: 0 }}>New PIN</label>
                                    {newPin && <span style={{ fontSize: 11, fontWeight: 600, color: strength.color }}>{strength.text}</span>}
                                </div>
                                <input type="password" className="form-input" style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }} placeholder="••••" value={newPin} onChange={e => handlePinChange(e.target.value, setNewPin)} maxLength="4" autoComplete="new-password" />
                                {newPin.length > 0 && (
                                    <div className="pin-strength-bar">
                                        {[1, 2, 3].map(l => (
                                            <div key={l} className="pin-strength-segment" style={{ background: l <= strength.level ? strength.color : '#2B3139' }}></div>
                                        ))}
                                    </div>
                                )}
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>{newPin.length}/4 digits</p>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Confirm PIN</label>
                                <input type="password" className="form-input" style={{ textAlign: 'center', fontSize: 22, letterSpacing: '0.3em' }} placeholder="••••" value={confirmPin} onChange={e => handlePinChange(e.target.value, setConfirmPin)} maxLength="4" autoComplete="new-password" />
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>{confirmPin.length}/4 digits</p>
                            </div>

                            {error && <div className="modal-error-msg"><i className="fas fa-exclamation-triangle"></i>{error}</div>}

                            <div className="modal-note">
                                <i className="fas fa-shield-alt"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-title">PIN Tips</p>
                                    <ul className="modal-note-list">
                                        <li>Avoid simple patterns like 1234 or 0000</li>
                                        <li>Never share your PIN with anyone</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {!success && step === 2 && (
                        <div className="modal-summary">
                            <div className="modal-summary-row">
                                <span className="modal-summary-label">Action</span>
                                <span className="modal-summary-value">Set new card PIN</span>
                            </div>
                            <div className="modal-summary-row">
                                <span className="modal-summary-label">PIN length</span>
                                <span className="modal-summary-value">4 digits</span>
                            </div>
                            <div className="modal-summary-row">
                                <span className="modal-summary-label">Strength</span>
                                <span className="modal-summary-value" style={{ color: strength.color }}>{strength.text || '-'}</span>
                            </div>
                            <div className="modal-summary-row modal-summary-total">
                                <span className="modal-summary-label">Card</span>
                                <span className="modal-summary-value">•••• {selectedCard?.cardNumber?.slice(-4) || '****'}</span>
                            </div>
                        </div>
                    )}

                    {!success && step === 3 && (
                        verified ? (
                            <div className="kyc-gate kyc-gate-ok">
                                <div className="kyc-gate-icon kyc-gate-icon-ok"><i className="fas fa-check-circle"></i></div>
                                <h3 className="kyc-gate-title">You're verified</h3>
                                <p className="kyc-gate-sub">Confirm to apply the new PIN to your card.</p>
                            </div>
                        ) : (
                            <KycGateNotice kycStatus={currentUser?.kycStatus} onStartKyc={() => setActiveModal('kyc-modal')} />
                        )
                    )}
                </div>

                {!success && (
                    <div className="modal-footer">
                        {step > 1 && (
                            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
                                <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                            </button>
                        )}
                        {step < 3 ? (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleNext} disabled={step === 1 && (currentPin.length !== 4 || newPin.length !== 4 || confirmPin.length !== 4)}>
                                Continue<i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
                            </button>
                        ) : (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleSubmit} disabled={!verified || isSubmitting}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Setting PIN...</> : <><i className="fas fa-key" style={{ marginRight: 6 }}></i>Confirm & Set PIN</>}
                            </button>
                        )}
                    </div>
                )}
                {success && (
                    <div className="modal-footer">
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Done</button>
                    </div>
                )}
            </div>
        </ModalRoot>
    );
};

export const BankWithdrawalModal = ({ activeModal, setActiveModal }) => {
    const { mergeBalancesFromApi, currentUser } = useContext(DataContext);
    const profileName = currentUser?.name || '';
    const [accountName] = useState(profileName);
    const [bankName, setBankName] = useState('');
    const [accountType, setAccountType] = useState('checking');
    const [accountNumber, setAccountNumber] = useState('');
    const [routingNumber, setRoutingNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const resetForm = () => {
        setBankName(''); setAccountType('checking');
        setAccountNumber(''); setRoutingNumber(''); setAmount('');
        setError(''); setSuccess(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        const destination = `${accountName} / ${bankName} - ${accountType} (Routing: ${routingNumber}, Acct: ${accountNumber})`;
        try {
            await submitWithdrawal({ asset: 'USD', amountDisplay: parseFloat(amount), destination, network: 'ACH' });
            setSuccess(true);
            setTimeout(() => { resetForm(); setActiveModal(null); }, 2000);
        } catch (err) {
            setError(err.message || 'Withdrawal request failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'bank-withdrawal-modal'}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-university" style={{ color: 'var(--ui-text-muted)' }}></i>
                        Bank Transfer
                    </h2>
                    <button className="modal-close-btn" onClick={() => { resetForm(); setActiveModal(null); }}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                            {success && <div className="modal-success-msg"><i className="fas fa-check-circle"></i>Withdrawal request is being processed.</div>}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Account Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={currentUser?.name || accountName}
                                    readOnly
                                    style={{ opacity: 0.7, cursor: 'not-allowed', background: 'var(--ui-surface-hover)' }}
                                    title="Must match the name on your Chain-IQ profile"
                                />
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>
                                    <i className="fas fa-lock" style={{ marginRight: 4 }}></i>
                                    Must match the name registered on your account
                                </p>
                            </div>
                            <div className="form-grid-2col" style={{ gap: 10 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Bank Name</label>
                                    <input type="text" className="form-input" value={bankName} onChange={e => setBankName(e.target.value)} required />
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Account Type</label>
                                    <select className="form-select" value={accountType} onChange={e => setAccountType(e.target.value)} required>
                                        <option value="checking">Checking</option>
                                        <option value="savings">Savings</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Account Number</label>
                                <input type="text" className="form-input" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Routing Number</label>
                                <input type="text" className="form-input" value={routingNumber} onChange={e => setRoutingNumber(e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Amount (USD)</label>
                                <input type="number" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} min="100" step="0.01" placeholder="Minimum $100.00" required />
                            </div>
                            <div className="modal-note">
                                <i className="fas fa-info-circle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-text">Fee: $5.00 &nbsp; / &nbsp; 1-3 business days</p>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: 16 }}>
                            <button type="submit" className="btn-submit-card" style={{ flex: 1 }} disabled={isSubmitting || success}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</> : 'Withdraw'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </ModalRoot>
    );
};

export const CardWithdrawalModal = ({ activeModal, setActiveModal, cardData }) => {
    const { mergeBalancesFromApi, currentUser } = useContext(DataContext);
    const [cardDesc, setCardDesc] = useState('');
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const resetForm = () => { setCardDesc(''); setAmount(''); setError(''); setSuccess(false); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        const destination = cardDesc.trim() || `Card withdrawal - ${currentUser?.name || ''}`;
        try {
            await submitWithdrawal({ asset: 'CARD', amountDisplay: parseFloat(amount), destination, network: 'CARD' });
            setSuccess(true);
            setTimeout(() => { resetForm(); setActiveModal(null); }, 2000);
        } catch (err) {
            setError(err.message || 'Withdrawal request failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'card-withdrawal-modal'}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-credit-card" style={{ color: 'var(--ui-text-muted)' }}></i>
                        Card Withdrawal
                    </h2>
                    <button className="modal-close-btn" onClick={() => { resetForm(); setActiveModal(null); }}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                            {success && <div className="modal-success-msg"><i className="fas fa-check-circle"></i>Withdrawal request is being processed.</div>}
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Card / Account Description</label>
                                <input type="text" className="form-input" value={cardDesc} onChange={e => setCardDesc(e.target.value)} placeholder="e.g. Visa ending in 4242" required />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Amount (USD)</label>
                                <input type="number" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} min="10" step="0.01" placeholder="Minimum $10.00" required />
                            </div>
                            <div className="modal-note">
                                <i className="fas fa-info-circle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-text">Fee: 2.5% &nbsp; / &nbsp; Instant</p>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: 16 }}>
                            <button type="submit" className="btn-submit-card" style={{ flex: 1 }} disabled={isSubmitting || success}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</> : 'Withdraw'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </ModalRoot>
    );
};

export const CryptoWithdrawalModal = ({ activeModal, setActiveModal, cryptoData }) => {
    const { mergeBalancesFromApi } = useContext(DataContext);
    const [selectedAssetId, setSelectedAssetId] = useState('');
    const [network, setNetwork] = useState('');
    const [address, setAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const selectedAsset = (cryptoData || []).find(a => a.id === selectedAssetId);
    const availableBalance = selectedAsset ? selectedAsset.balance : 0;
    const usdValue = selectedAsset && amount ? (parseFloat(amount) * selectedAsset.price).toFixed(2) : '0.00';

    const resetForm = () => {
        setSelectedAssetId(''); setNetwork(''); setAddress(''); setAmount('');
        setError(''); setSuccess(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!selectedAsset?.ticker) { setError('Please select an asset.'); return; }
        setIsSubmitting(true);
        try {
            await submitWithdrawal({
                asset: selectedAsset.ticker,
                amountDisplay: parseFloat(amount),
                destination: address,
                network,
            });
            setSuccess(true);
            setTimeout(() => { resetForm(); setActiveModal(null); }, 2000);
        } catch (err) {
            setError(err.message || 'Withdrawal request failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'crypto-withdrawal-modal'}>
            <div className="modal-content modal-md">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-arrow-up" style={{ color: '#F6465D' }}></i>
                        Crypto Withdrawal
                    </h2>
                    <button className="modal-close-btn" onClick={() => { resetForm(); setActiveModal(null); }}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                            {success && <div className="modal-success-msg"><i className="fas fa-check-circle"></i>Withdrawal request is being processed.</div>}
                            <div className="form-grid-2col" style={{ gap: 10 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Asset</label>
                                    <select className="form-select" value={selectedAssetId} onChange={e => setSelectedAssetId(e.target.value)} required>
                                        <option value="">Choose asset</option>
                                        {(cryptoData || []).map(a => (
                                            <option key={a.id} value={a.id}>{a.asset} ({a.balance.toFixed(6)})</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">Network</label>
                                    <select className="form-select" value={network} onChange={e => setNetwork(e.target.value)} required>
                                        <option value="">Select network</option>
                                        <option value="ERC20">ERC-20 (Ethereum)</option>
                                        <option value="BEP20">BEP-20 (BSC)</option>
                                        <option value="TRC20">TRC-20 (Tron)</option>
                                        <option value="Polygon">Polygon</option>
                                    </select>
                                </div>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Address</label>
                                <input type="text" className="form-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="Recipient wallet address" required />
                                <p style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>Double-check address before submitting</p>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Amount</label>
                                <div style={{ position: 'relative' }}>
                                    <input type="number" className="form-input" value={amount} onChange={e => setAmount(e.target.value)} step="any" required style={{ paddingRight: '52px' }} />
                                    <button type="button" onClick={() => setAmount(availableBalance.toString())} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ui-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 'auto', minWidth: 'auto' }}>MAX</button>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--ui-text-muted)' }}>
                                    <span>Available: <strong style={{ color: 'var(--ui-text-on-surface)' }}>{availableBalance.toFixed(8)} {selectedAsset?.ticker}</strong></span>
                                    <span>≈ <strong style={{ color: 'var(--ui-text-on-surface)' }}>${usdValue}</strong></span>
                                </div>
                            </div>
                            <div className="modal-note modal-warning">
                                <i className="fas fa-exclamation-triangle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-title">Important</p>
                                    <ul className="modal-note-list">
                                        <li>Ensure address supports the selected network</li>
                                        <li>Withdrawals cannot be reversed</li>
                                        <li>Minimum: $50.00 equivalent</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ marginTop: 16 }}>
                            <button type="submit" className="btn-submit-card" style={{ flex: 1 }} disabled={isSubmitting || success || !selectedAssetId || !network || !address || !amount}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</> : 'Withdraw'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </ModalRoot>
    );
};

// ---------------------------------------------------------------------------
// ConvertAssetsModal - crypto-to-crypto conversion via the trades backend
// ---------------------------------------------------------------------------
const CONVERT_ASSET_SCALE = { BTC: 1e8, ETH: 1e9, USDT: 100, USD: 100 };

export const ConvertAssetsModal = ({ activeModal, setActiveModal, fromAssetData, toAssetData, fromAmount, toAmount, usdValue }) => {
    const { mergeBalancesFromApi } = useContext(DataContext);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const isOpen = activeModal === 'convert-assets-modal';

    useEffect(() => {
        if (!isOpen) { setIsSubmitting(false); setError(''); setSuccess(false); }
    }, [isOpen]);

    const fromScale = CONVERT_ASSET_SCALE[fromAssetData?.ticker] ?? 1e8;
    const fromAmountMinor = Math.round(parseFloat(fromAmount || 0) * fromScale);
    const fmtTo = parseFloat(toAmount || 0);

    const handleConfirm = async () => {
        if (!fromAssetData?.ticker || !toAssetData?.ticker || fromAmountMinor <= 0) {
            setError('Invalid conversion data. Go back and re-enter the amount.');
            return;
        }
        if (fromAssetData.ticker === toAssetData.ticker) {
            setError('From and To assets must be different.');
            return;
        }
        setError('');
        setIsSubmitting(true);
        try {
            const res = await submitTrade({ fromAsset: fromAssetData.ticker, toAsset: toAssetData.ticker, fromAmountMinor });
            if (res?.balances) mergeBalancesFromApi(res.balances);
            setSuccess(true);
        } catch (err) {
            setError(err.message || 'Conversion failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-md">
                <div className="modal-header" style={{ borderBottom: '1px solid var(--ui-border)' }}>
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-exchange-alt" style={{ color: '#F0B90B' }}></i>
                        Convert Assets
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    {success ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '16px 0' }}>
                            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(14,203,129,0.1)', border: '2px solid rgba(14,203,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className="fas fa-check" style={{ fontSize: 30, color: '#0ECB81' }}></i>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ui-text-on-surface)', marginBottom: 6 }}>Conversion Processing</div>
                                <div style={{ fontSize: 13, color: 'var(--ui-text-soft)', lineHeight: 1.6 }}>
                                    Your {fromAssetData?.ticker} is being converted to {toAssetData?.ticker}.<br />
                                    Your balance will update once processed.
                                </div>
                            </div>
                            <div style={{ width: '100%', background: 'var(--ui-input-bg)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>Sent</span>
                                    <span style={{ color: '#F6465D', fontWeight: 600 }}>−{+parseFloat(fromAmount).toPrecision(8)} {fromAssetData?.ticker}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>Received</span>
                                    <span style={{ color: '#0ECB81', fontWeight: 600 }}>+{fmtTo.toFixed(8)} {toAssetData?.ticker}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>USD Value</span>
                                    <span style={{ color: 'var(--ui-text-on-surface)' }}>≈ ${parseFloat(usdValue || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--ui-input-bg)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '16px' }}>
                                <div style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--ui-text-soft)', marginBottom: 4 }}>You Send</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ui-text-on-surface)' }}>{+parseFloat(fromAmount || 0).toPrecision(6)}</div>
                                    <div style={{ fontSize: 14, color: '#F0B90B', fontWeight: 600 }}>{fromAssetData?.ticker}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ui-text-soft)', marginTop: 2 }}>{fromAssetData?.asset}</div>
                                </div>
                                <div style={{ fontSize: 22, color: '#F0B90B' }}>⇆</div>
                                <div style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{ fontSize: 11, color: 'var(--ui-text-soft)', marginBottom: 4 }}>You Receive</div>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: '#0ECB81' }}>{fmtTo.toFixed(6)}</div>
                                    <div style={{ fontSize: 14, color: '#0ECB81', fontWeight: 600 }}>{toAssetData?.ticker}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ui-text-soft)', marginTop: 2 }}>{toAssetData?.asset}</div>
                                </div>
                            </div>
                            <div style={{ background: 'var(--ui-input-bg)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>Exchange Rate</span>
                                    <span style={{ color: 'var(--ui-text-on-surface)' }}>
                                        1 {fromAssetData?.ticker} ≈ {(fromAssetData?.price && toAssetData?.price)
                                            ? (fromAssetData.price / toAssetData.price).toFixed(6)
                                            : '-'} {toAssetData?.ticker}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>USD Value</span>
                                    <span style={{ color: 'var(--ui-text-on-surface)' }}>≈ ${parseFloat(usdValue || 0).toFixed(2)}</span>
                                </div>
                                <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                    <span style={{ color: 'var(--ui-text-soft)' }}>Your {fromAssetData?.ticker} Balance</span>
                                    <span style={{ color: 'var(--ui-text-on-surface)' }}>{fromAssetData?.balance?.toFixed(8) ?? '-'} {fromAssetData?.ticker}</span>
                                </div>
                            </div>
                            <div className="modal-note modal-warning">
                                <i className="fas fa-exclamation-triangle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-text">Conversions execute at live market prices and are subject to admin review. Prices may shift slightly between now and processing.</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    {success ? (
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Done</button>
                    ) : (
                        <>
                            <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                            <button
                                type="button"
                                className="btn-submit-card"
                                style={{ flex: 1 }}
                                onClick={handleConfirm}
                                disabled={isSubmitting || !fromAssetData || !toAssetData || fromAmountMinor <= 0}
                            >
                                {isSubmitting
                                    ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Processing...</>
                                    : <><i className="fas fa-exchange-alt" style={{ marginRight: 6 }}></i>Confirm & Convert</>}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </ModalRoot>
    );
};

export const KycModal = ({ activeModal, setActiveModal }) => {
    const isActive = activeModal === 'kyc-modal';
    const { currentUser, submitKycDocuments } = React.useContext(DataContext);

    // ── Step wizard ──────────────────────────────────────────────────────────
    const [step, setStep] = React.useState(1);

    // ── Step 1: Personal info ────────────────────────────────────────────────
    const [firstName, setFirstName]     = React.useState('');
    const [lastName, setLastName]       = React.useState('');
    const [phone, setPhone]             = React.useState('');
    const [phoneCountry, setPhoneCountry] = React.useState('US');
    const [dob, setDob]                 = React.useState('');
    const [address, setAddress]         = React.useState('');
    const [city, setCity]               = React.useState('');
    const [kycCountry, setKycCountry]   = React.useState('');
    const [step1Busy, setStep1Busy]     = React.useState(false);
    const [step1Error, setStep1Error]   = React.useState('');

    // ── Step 2: Documents ────────────────────────────────────────────────────
    const [pending, setPending]         = React.useState([]);
    const [docType, setDocType]         = React.useState('Passport');
    const [submitting, setSubmitting]   = React.useState(false);
    const [error, setError]             = React.useState('');
    const fileRef  = React.useRef(null);
    const frontRef = React.useRef(null);
    const backRef  = React.useRef(null);

    // ── Step 3: Selfie ───────────────────────────────────────────────────────
    const [selfie, setSelfie]     = React.useState(null);
    const selfieRef = React.useRef(null);

    // ── Shared server state ──────────────────────────────────────────────────
    const [serverDocs, setServerDocs]       = React.useState(null);
    const [serverStatus, setServerStatus]   = React.useState(null);
    const [previewDoc, setPreviewDoc]       = React.useState(null);

    const TWO_SIDED_DOCS = ['National ID', 'Driver License'];
    const isTwoSided = TWO_SIDED_DOCS.includes(docType);

    React.useEffect(() => {
        if (!isActive) { setStep(1); setStep1Error(''); setError(''); }
    }, [isActive]);

    React.useEffect(() => {
        if (!isActive) return;
        const clientToken   = readClientToken();
        const adminToken    = readAdminToken();
        const previewUserId = currentUser?.impersonated && currentUser?.id ? currentUser.id : null;
        if (!clientToken && !(adminToken && previewUserId)) {
            setServerDocs(null); setServerStatus(null); return;
        }
        let cancelled = false;
        (async () => {
            try {
                const data = clientToken
                    ? await fetchKycStatus()
                    : await getKycStatusForUser(previewUserId);
                if (cancelled) return;
                const KIND_LABEL = { ID_FRONT: 'Identity Document (Front)', ID_BACK: 'Identity Document (Back)', SELFIE: 'Selfie with ID', POA: 'Proof of Address' };
                const mapped = (data?.documents || []).map(d => ({
                    id: d.id, name: KIND_LABEL[d.kind] || d.kind, type: 'image/*',
                    docType: KIND_LABEL[d.kind] || d.kind, kind: d.kind,
                    uploadedAt: d.uploaded_at, decision: d.decision,
                }));
                setServerDocs(mapped);
                setServerStatus(data?.kyc_status || null);
                if (data?.kyc_profile) {
                    const p = data.kyc_profile;
                    if (p.first_name)    setFirstName(p.first_name);
                    if (p.last_name)     setLastName(p.last_name);
                    if (p.phone)         setPhone(p.phone);
                    if (p.phone_country) setPhoneCountry(p.phone_country);
                    if (p.dob)           setDob(p.dob);
                    if (p.address)       setAddress(p.address);
                    if (p.city)          setCity(p.city);
                    if (p.country)       setKycCountry(p.country);
                }
            } catch (_) {
                if (!cancelled) { setServerDocs([]); setServerStatus(null); }
            }
        })();
        return () => { cancelled = true; };
    }, [isActive, currentUser?.id, currentUser?.impersonated]);

    React.useEffect(() => {
        if (!isActive || serverStatus) return;
        if (!phone && currentUser?.phone) setPhone(currentUser.phone);
        if (!kycCountry && currentUser?.country) setKycCountry(currentUser.country);
    }, [isActive, serverStatus, currentUser?.phone, currentUser?.country]);

    const existingDocs = React.useMemo(() => {
        if (serverDocs) return serverDocs;
        return Array.isArray(currentUser?.kycDocuments) ? currentUser.kycDocuments : [];
    }, [currentUser?.kycDocuments, serverDocs]);

    const status      = serverStatus || currentUser?.kycStatus || 'Not Submitted';
    const statusColor = isKycApproved(status) ? '#0ECB81' : isKycFailed(status) ? '#f6465d' : isKycUnderReview(status) ? '#F0B90B' : '#848E9C';

    // ── Step 1 submit ────────────────────────────────────────────────────────
    const handleStep1Next = async () => {
        if (!firstName.trim() || !lastName.trim() || !phone.trim() || !address.trim() || !city.trim() || !kycCountry.trim()) {
            setStep1Error('Please fill in all required fields.'); return;
        }
        setStep1Busy(true); setStep1Error('');
        try {
            await saveKycProfile({ first_name: firstName, last_name: lastName, phone, dob, address, city, country: kycCountry });
            setStep(2);
        } catch (e) {
            setStep1Error(e.message || 'Failed to save. Please try again.');
        } finally { setStep1Busy(false); }
    };

    // ── File handling ────────────────────────────────────────────────────────
    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const handleFiles = async (files, side = null) => {
        setError('');
        const accepted = [];
        for (const file of Array.from(files || [])) {
            if (file.size > 8 * 1024 * 1024) { setError(`"${file.name}" exceeds the 8MB limit and was skipped.`); continue; }
            try {
                const dataUrl = await readFileAsDataUrl(file);
                accepted.push({ id: `kyc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, type: file.type || 'application/octet-stream', size: file.size, docType, side, dataUrl, uploadedAt: new Date().toISOString() });
            } catch (e) { setError(`Failed to read "${file.name}".`); }
        }
        if (accepted.length) {
            setPending(prev => {
                if (!side) return [...prev, ...accepted];
                const filtered = prev.filter(p => !(p.docType === docType && p.side === side));
                return [...filtered, ...accepted];
            });
        }
    };

    const handleSelfieFiles = async (files) => {
        setError('');
        const file = Array.from(files || [])[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { setError('"Selfie" exceeds the 8MB limit.'); return; }
        try {
            const dataUrl = await readFileAsDataUrl(file);
            setSelfie({ id: `selfie-${Date.now()}`, name: file.name, type: file.type, size: file.size, docType: 'Selfie with ID', side: null, dataUrl, uploadedAt: new Date().toISOString() });
        } catch (e) { setError(`Could not read selfie: ${e.message}`); }
    };

    const getSidedDoc  = (side) => pending.find(p => p.docType === docType && p.side === side);
    const removePending = (id)   => setPending(prev => prev.filter(p => p.id !== id));

    // ── Final submit (step 3) ────────────────────────────────────────────────
    const handleSubmit = async () => {
        const allDocs = [...pending, ...(selfie ? [selfie] : [])];
        if (!allDocs.length) { setError('Please attach at least one document.'); return; }
        setSubmitting(true); setError('');
        try {
            await submitKycDocuments(allDocs, 'Under Review');
            setPending([]); setSelfie(null); setActiveModal(null);
        } catch (e) {
            if (e && e.code === 'partial_skip') { setPending([]); setError(e.message || 'Some files were skipped.'); }
            else { setError(e.message || 'Failed to submit documents.'); }
        } finally { setSubmitting(false); }
    };

    const STEPS = ['Personal Info', 'Documents', 'Selfie'];

    return (
        <ModalRoot open={isActive} onBackdropClick={() => setActiveModal(null)}>
            <div className="modal-content modal-lg">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-shield-alt" style={{ color: 'var(--ui-accent)' }}></i>
                        Identity Verification
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                {/* ── Step indicator ── */}
                <div style={{ display: 'flex', padding: '12px 20px 16px', gap: 0, borderBottom: '1px solid var(--ui-border)' }}>
                    {STEPS.map((label, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                            {i > 0 && (
                                <div style={{ position: 'absolute', top: 14, right: '50%', left: '-50%', height: 2, background: step > i ? 'var(--ui-accent)' : 'var(--ui-border)', zIndex: 0 }} />
                            )}
                            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step >= i + 1 ? 'var(--ui-accent)' : 'var(--ui-input-bg)', border: step >= i + 1 ? 'none' : '1px solid var(--ui-border)', color: step >= i + 1 ? 'var(--ui-on-accent)' : 'var(--ui-text-muted)', fontWeight: 700, fontSize: 12, position: 'relative', zIndex: 1, transition: 'background 0.2s' }}>
                                {step > i + 1 ? <i className="fas fa-check" style={{ fontSize: 10 }} /> : i + 1}
                            </div>
                            <div style={{ fontSize: 11, marginTop: 4, color: step === i + 1 ? 'var(--ui-accent)' : 'var(--ui-text-muted)', fontWeight: step === i + 1 ? 700 : 400 }}>
                                {label}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="modal-body">
                    {/* ── Step 1: Personal Info ── */}
                    {step === 1 && (
                        <div>
                            {isKycApproved(status) && (
                                <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(14,203,129,0.08)', border: '1px solid rgba(14,203,129,0.3)', borderRadius: 10, fontSize: 13, color: '#0ECB81', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fas fa-check-circle" /> Your identity has been verified.
                                </div>
                            )}
                            {isKycUnderReview(status) && (
                                <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)', borderRadius: 10, fontSize: 13, color: '#F0B90B', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <i className="fas fa-clock" /> Your submission is under review.
                                </div>
                            )}
                            <p style={{ fontSize: 13, color: 'var(--ui-text-soft)', marginBottom: 16 }}>
                                Please provide your personal details exactly as they appear on your government-issued ID.
                            </p>
                            <div className="form-grid-2col" style={{ gap: '12px 14px' }}>
                                <div className="form-group">
                                    <label className="form-label">First Name <span style={{ color: '#f6465d' }}>*</span></label>
                                    <input className="form-input" type="text" placeholder="e.g. John" value={firstName} onChange={e => setFirstName(e.target.value)} disabled={isKycApproved(status)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Last Name <span style={{ color: '#f6465d' }}>*</span></label>
                                    <input className="form-input" type="text" placeholder="e.g. Smith" value={lastName} onChange={e => setLastName(e.target.value)} disabled={isKycApproved(status)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Phone Number <span style={{ color: '#f6465d' }}>*</span></label>
                                    <PhoneField
                                        value={phone}
                                        onChange={setPhone}
                                        countryCode={phoneCountry}
                                        onCountryChange={setPhoneCountry}
                                        disabled={isKycApproved(status)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Date of Birth</label>
                                    <input className="form-input" type="date" value={dob} onChange={e => setDob(e.target.value)} disabled={isKycApproved(status)} />
                                </div>
                                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="form-label">Street Address <span style={{ color: '#f6465d' }}>*</span></label>
                                    <input className="form-input" type="text" placeholder="e.g. 123 Main Street, Apt 4B" value={address} onChange={e => setAddress(e.target.value)} disabled={isKycApproved(status)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">City <span style={{ color: '#f6465d' }}>*</span></label>
                                    <input className="form-input" type="text" placeholder="e.g. London" value={city} onChange={e => setCity(e.target.value)} disabled={isKycApproved(status)} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Country <span style={{ color: '#f6465d' }}>*</span></label>
                                    <CountrySelect value={kycCountry} onChange={setKycCountry} disabled={isKycApproved(status)} className="form-input" />
                                </div>
                            </div>
                            {step1Error && <div style={{ marginTop: 10, color: '#f6465d', fontSize: 13 }}>{step1Error}</div>}
                        </div>
                    )}

                    {/* ── Step 2: Documents ── */}
                    {step === 2 && (
                        <div>
                            {isKycFailed(status) ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', marginBottom: 16, background: 'rgba(246,70,93,0.08)', border: '1px solid rgba(246,70,93,0.3)', borderRadius: 10 }}>
                                    <i className="fas fa-triangle-exclamation" style={{ color: '#F6465D', fontSize: 16, marginTop: 2, flexShrink: 0 }}></i>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#F6465D', marginBottom: 3 }}>Verification not approved</div>
                                        <div style={{ fontSize: 12.5, color: 'var(--ui-text-soft)', lineHeight: 1.5 }}>Please upload corrected copies and resubmit for review.</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="modal-info-panel" style={{ borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>Current KYC Status</div>
                                        <div style={{ fontWeight: 700, color: statusColor, marginTop: 2 }}>{status}</div>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--ui-text-muted)', textAlign: 'right' }}>{existingDocs.length} document{existingDocs.length !== 1 ? 's' : ''} on file</div>
                                </div>
                            )}

                            {existingDocs.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--ui-text-on-surface)', marginBottom: 8 }}>
                                        {isKycFailed(status) ? 'Previously submitted documents' : 'Submitted documents'}
                                    </p>
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        {existingDocs.map(doc => {
                                            const docDecision = doc.decision;
                                            const isFailed    = docDecision === 'Failed';
                                            const isApproved  = docDecision === 'Approved';
                                            return (
                                                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isFailed ? 'rgba(246,70,93,0.05)' : isApproved ? 'rgba(14,203,129,0.04)' : 'var(--ui-surface-deep)', border: isFailed ? '1px solid rgba(246,70,93,0.4)' : isApproved ? '1px solid rgba(14,203,129,0.3)' : '1px solid var(--ui-border)', borderRadius: 8 }}>
                                                    <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, color: 'var(--ui-text-on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>{doc.docType || 'Document'}  /  {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ''}</div>
                                                    </div>
                                                    {docDecision && (
                                                        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: isFailed ? 'rgba(246,70,93,0.18)' : isApproved ? 'rgba(14,203,129,0.18)' : 'rgba(240,185,11,0.18)', color: isFailed ? '#F6465D' : isApproved ? '#0ECB81' : '#F0B90B' }}>
                                                            {isFailed ? '✕ Rejected' : isApproved ? '✓ Approved' : 'Pending'}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--ui-text-on-surface)', marginBottom: 10 }}>
                                    {isKycFailed(status) ? 'Upload corrected documents' : 'Upload identity document'}
                                </p>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label className="form-label">Document type</label>
                                    <select className="form-select" value={docType} onChange={e => setDocType(e.target.value)}>
                                        <option>Passport</option>
                                        <option>National ID</option>
                                        <option>Driver License</option>
                                        <option>Proof of Address</option>
                                        <option>Other</option>
                                    </select>
                                </div>

                                <div style={{ background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <i className="fas fa-info-circle" style={{ color: 'var(--ui-accent)', fontSize: 14, marginTop: 2 }}></i>
                                    <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ui-text-on-surface)', lineHeight: 1.55 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Photo guidelines</div>
                                        <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--ui-text-soft)' }}>
                                            <li><strong style={{ color: 'var(--ui-text-on-surface)' }}>All 4 corners</strong> must be visible</li>
                                            <li>Image must be sharp, well-lit, and free of glare</li>
                                            <li>All text and details must be clearly readable</li>
                                            {isTwoSided && <li>Upload <strong style={{ color: 'var(--ui-text-on-surface)' }}>both front and back</strong> sides separately</li>}
                                        </ul>
                                    </div>
                                </div>

                                {isTwoSided ? (
                                    <div className="form-grid-2col" style={{ gap: 12 }}>
                                        {['front', 'back'].map(side => {
                                            const ref = side === 'front' ? frontRef : backRef;
                                            const doc = getSidedDoc(side);
                                            const label = side === 'front' ? 'Front Side' : 'Back Side';
                                            return (
                                                <div key={side}>
                                                    <input ref={ref} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files, side); e.target.value = ''; }} />
                                                    <div style={{ width: '100%', minHeight: 160, borderRadius: 10, border: doc ? '1px solid #0ECB81' : '1px dashed var(--ui-border)', background: doc ? 'rgba(14,203,129,0.05)' : 'var(--ui-surface-deep)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                                        {doc && doc.type.startsWith('image/') ? (
                                                            <button type="button" onClick={() => setPreviewDoc(doc)} style={{ flex: 1, padding: 0, border: 'none', background: '#000', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 110, overflow: 'hidden' }}>
                                                                <img src={doc.dataUrl} alt={label} style={{ maxWidth: '100%', maxHeight: 140, objectFit: 'contain', display: 'block' }} />
                                                            </button>
                                                        ) : doc ? (
                                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, minHeight: 110 }}>
                                                                <i className="fas fa-file-pdf" style={{ fontSize: 28, color: '#F6465D' }}></i>
                                                                <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', wordBreak: 'break-all', textAlign: 'center' }}>{doc.name}</div>
                                                            </div>
                                                        ) : (
                                                            <button type="button" onClick={() => ref.current && ref.current.click()} style={{ flex: 1, padding: 14, border: 'none', background: 'transparent', color: 'var(--ui-text-on-surface)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center' }}>
                                                                <i className="fas fa-cloud-upload-alt" style={{ fontSize: 22, color: 'var(--ui-accent)' }}></i>
                                                                <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                                                                <div style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>Click to upload</div>
                                                            </button>
                                                        )}
                                                        {doc && (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--ui-border)', background: 'var(--ui-surface-deep)' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                                                    <i className="fas fa-check-circle" style={{ color: '#0ECB81', fontSize: 12 }}></i>
                                                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ui-text-on-surface)' }}>{label}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 4 }}>
                                                                    {doc.type.startsWith('image/') && (
                                                                        <button type="button" onClick={() => setPreviewDoc(doc)} title="Preview" style={{ background: 'transparent', border: 'none', color: 'var(--ui-text-muted)', cursor: 'pointer', padding: 4 }}><i className="fas fa-eye"></i></button>
                                                                    )}
                                                                    <button type="button" onClick={() => ref.current && ref.current.click()} title="Replace" style={{ background: 'transparent', border: 'none', color: 'var(--ui-text-muted)', cursor: 'pointer', padding: 4 }}><i className="fas fa-sync-alt"></i></button>
                                                                    <button type="button" onClick={() => removePending(doc.id)} title="Remove" style={{ background: 'transparent', border: 'none', color: '#f6465d', cursor: 'pointer', padding: 4 }}><i className="fas fa-times"></i></button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <>
                                        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
                                        <button type="button" onClick={() => fileRef.current && fileRef.current.click()} style={{ width: '100%', padding: '14px', borderRadius: 10, border: '1px dashed var(--ui-border)', background: 'var(--ui-surface-deep)', color: 'var(--ui-text-on-surface)', cursor: 'pointer' }}>
                                            <i className="fas fa-cloud-upload-alt" style={{ marginRight: 8, color: 'var(--ui-accent)' }}></i>
                                            Choose files (images or PDF, up to 8MB each)
                                        </button>
                                    </>
                                )}

                                {(() => {
                                    const listed = isTwoSided ? pending.filter(p => !(p.docType === docType && (p.side === 'front' || p.side === 'back'))) : pending;
                                    if (listed.length === 0) return null;
                                    return (
                                        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                                            {listed.map(doc => (
                                                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--ui-input-bg)', border: '1px solid var(--ui-border)', borderRadius: 8 }}>
                                                    {doc.type.startsWith('image/') ? (
                                                        <button type="button" onClick={() => setPreviewDoc(doc)} title="Preview" style={{ padding: 0, border: '1px solid var(--ui-border)', background: '#000', borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in', width: 56, height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <img src={doc.dataUrl} alt={doc.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                                        </button>
                                                    ) : (
                                                        <div style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 6, background: 'var(--ui-surface-deep)', border: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <i className="fas fa-file-pdf" style={{ fontSize: 22, color: '#F6465D' }}></i>
                                                        </div>
                                                    )}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: 13, color: 'var(--ui-text-on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--ui-text-muted)' }}>{doc.docType}{doc.side ? `  /  ${doc.side === 'front' ? 'Front' : 'Back'}` : ''}  /  {(doc.size / 1024).toFixed(0)} KB</div>
                                                    </div>
                                                    {doc.type.startsWith('image/') && (
                                                        <button type="button" onClick={() => setPreviewDoc(doc)} title="Preview" style={{ background: 'transparent', border: 'none', color: 'var(--ui-text-muted)', cursor: 'pointer', padding: 6 }}><i className="fas fa-eye"></i></button>
                                                    )}
                                                    <button type="button" onClick={() => removePending(doc.id)} style={{ background: 'transparent', border: 'none', color: '#f6465d', cursor: 'pointer', padding: 6 }}><i className="fas fa-times"></i></button>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                            {error && <div style={{ marginTop: 10, color: '#f6465d', fontSize: 13 }}>{error}</div>}
                        </div>
                    )}

                    {/* ── Step 3: Selfie ── */}
                    {step === 3 && (
                        <div>
                            <p style={{ fontSize: 13, color: 'var(--ui-text-soft)', marginBottom: 16 }}>
                                Take a clear photo of yourself holding your identity document next to your face.
                                Both your face and the document text must be clearly visible.
                            </p>
                            {existingDocs.filter(d => d.kind === 'SELFIE').length > 0 && (
                                <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--ui-surface-deep)', border: '1px solid var(--ui-border)', borderRadius: 8, fontSize: 13, color: 'var(--ui-text-soft)' }}>
                                    <i className="fas fa-camera" style={{ marginRight: 6, color: '#F0B90B' }}></i>
                                    A selfie is already on file.{existingDocs.filter(d => d.kind === 'SELFIE')[0]?.decision ? ` Status: ${existingDocs.filter(d => d.kind === 'SELFIE')[0].decision}` : ''}
                                </div>
                            )}
                            <input ref={selfieRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={e => { handleSelfieFiles(e.target.files); e.target.value = ''; }} />
                            <div onClick={() => selfieRef.current?.click()} style={{ border: selfie ? '1px solid #0ECB81' : '1px dashed var(--ui-border)', borderRadius: 12, minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: selfie ? 'rgba(14,203,129,0.05)' : 'var(--ui-surface-deep)', padding: 20, transition: 'border-color 0.2s', gap: 12 }}>
                                {selfie ? (
                                    <>
                                        <img src={selfie.dataUrl} alt="Selfie preview" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, objectFit: 'cover' }} />
                                        <div style={{ fontSize: 13, color: 'var(--ui-text-soft)' }}>{selfie.name}  /  {(selfie.size / 1024).toFixed(0)} KB</div>
                                        <button type="button" onClick={e => { e.stopPropagation(); setSelfie(null); }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--ui-border)', borderRadius: 8, color: 'var(--ui-text-on-surface)', cursor: 'pointer', fontSize: 12 }}>
                                            <i className="fas fa-redo" style={{ marginRight: 4 }}></i>Retake Photo
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-camera" style={{ fontSize: 44, color: 'var(--ui-accent)', opacity: 0.6 }}></i>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>Click to upload selfie</div>
                                        <div style={{ fontSize: 12, color: 'var(--ui-text-soft)', textAlign: 'center' }}>Hold your ID next to your face  /  JPG or PNG  /  Max 8MB</div>
                                    </>
                                )}
                            </div>
                            {error && <div style={{ marginTop: 10, color: '#f6465d', fontSize: 13 }}>{error}</div>}
                        </div>
                    )}
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    {step > 1 ? (
                        <button type="button" className="btn-secondary" onClick={() => { setStep(s => s - 1); setError(''); setStep1Error(''); }}>
                            <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                        </button>
                    ) : (
                        <button type="button" className="btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button>
                    )}
                    {step === 1 && (
                        <button type="button" className="btn-submit-card" disabled={step1Busy || isKycApproved(status)} onClick={handleStep1Next}>
                            {step1Busy ? 'Saving...' : 'Continue'}
                            {!step1Busy && <i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>}
                        </button>
                    )}
                    {step === 2 && (
                        <button type="button" className="btn-submit-card" onClick={() => { setStep(3); setError(''); }}>
                            Continue <i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
                        </button>
                    )}
                    {step === 3 && (
                        <button type="button" className="btn-submit-card" disabled={submitting || (!selfie && pending.length === 0)} onClick={handleSubmit}>
                            {submitting ? 'Submitting...' : isKycFailed(status) ? 'Resubmit Documents' : 'Submit for Review'}
                        </button>
                    )}
                </div>
            </div>

            {previewDoc && (
                <div onClick={() => setPreviewDoc(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out' }}>
                    <button type="button" onClick={e => { e.stopPropagation(); setPreviewDoc(null); }} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.6)', border: '1px solid #2B3139', color: 'var(--ui-text-on-surface)', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }} title="Close preview">
                        <i className="fas fa-times"></i>
                    </button>
                    <div onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                        <img src={previewDoc.dataUrl} alt={previewDoc.name} style={{ maxWidth: '95vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }} />
                        <div style={{ background: 'rgba(0,0,0,0.6)', padding: '8px 14px', borderRadius: 8, color: 'var(--ui-text-on-surface)', fontSize: 13, textAlign: 'center', maxWidth: '90vw' }}>
                            <div style={{ fontWeight: 600 }}>{previewDoc.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--ui-text-soft)', marginTop: 2 }}>
                                {previewDoc.docType}{previewDoc.side ? `  /  ${previewDoc.side === 'front' ? 'Front Side' : 'Back Side'}` : ''}{previewDoc.size ? `  /  ${(previewDoc.size / 1024).toFixed(0)} KB` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ModalRoot>
    );
};


export const CardDetailsModal = ({ activeModal, setActiveModal, selectedCard }) => {
    const { currentUser } = React.useContext(DataContext);
    const platformSettingsState = usePlatformSettings();
    const [cvvRevealed, setCvvRevealed] = useState(false);
    const [flipped, setFlipped] = useState(false);

    useEffect(() => {
        if (activeModal !== 'card-details-modal') {
            setFlipped(false);
            setCvvRevealed(false);
        }
    }, [activeModal]);
    const formatUsd = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

    const resolveHolder = () => {
        const raw = (selectedCard?.cardholderName || '').trim();
        if (raw && raw.toLowerCase() !== 'card holder') return raw.toUpperCase();
        const u = (currentUser?.name || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || '').trim();
        return (u || 'CARD HOLDER').toUpperCase();
    };
    const formattedNumber = selectedCard?.cardNumber
        ? `•••• •••• •••• ${selectedCard.cardNumber.slice(-4)}`
        : '•••• •••• •••• ••••';

    const renderCardFront = () => {
        if (!selectedCard) return null;
        const balanceDisplay = selectedCard.balance ? formatUsd(selectedCard.balance) : '$0.00';
        return (
            <div className={`wallet-card card-${selectedCard.type} wc-detail-preview`}>
                <div className="wc-row wc-top">
                    <div className="wc-brand">{platformSettingsState?.cardBrandName || platformSettingsState?.platformName || 'Chain-IQ'}</div>
                    <div className="wc-type">{selectedCard.type ? selectedCard.type.charAt(0).toUpperCase() + selectedCard.type.slice(1) : 'Card'}</div>
                </div>
                <div className="wc-row wc-middle">
                    <div className="wc-chip">
                        <svg xmlns="http://www.w3.org/2000/svg" width="42" height="32" viewBox="0 0 40 30">
                            <defs>
                                <linearGradient id={`chip-detail-${selectedCard.id}`} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#f5d76e"/>
                                    <stop offset="100%" stopColor="#b8860b"/>
                                </linearGradient>
                            </defs>
                            <rect width="40" height="30" fill={`url(#chip-detail-${selectedCard.id})`} rx="4" />
                            <path d="M10 15h20M20 5v20M15 10h10M15 20h10" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />
                        </svg>
                    </div>
                    <div className="wc-number">{formattedNumber}</div>
                </div>
                <div className="wc-row wc-bottom">
                    <div className="wc-info">
                        <div className="wc-label">Card Holder</div>
                        <div className="wc-value wc-name">{resolveHolder()}</div>
                    </div>
                    <div className="wc-info wc-balance">
                        <div className="wc-label">Balance</div>
                        <div className="wc-value wc-balance-value">{balanceDisplay}</div>
                    </div>
                    <div className="wc-network">
                        <i className="fab fa-cc-visa"></i>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <ModalRoot open={activeModal === 'card-details-modal'}>
            <div className="modal-content modal-lg">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-credit-card" style={{ color: 'var(--ui-accent)' }}></i>
                        Card Details
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <div className="card-flip-scene">
                        <div
                            className={`card-flip-inner${flipped ? ' is-flipped' : ''}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setFlipped((f) => !f)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setFlipped((f) => !f);
                                }
                            }}
                        >
                            <div className="card-flip-face card-flip-front">{renderCardFront()}</div>
                            <div className={`card-flip-face card-flip-back card-${selectedCard?.type || 'platinum'}`}>
                                <div className="card-flip-magstripe" />
                                <div className="card-flip-back-meta">
                                    <span>Expires: {selectedCard?.expiryDate || 'MM/YY'}</span>
                                    <span>CVV: {cvvRevealed ? (selectedCard?.cvv || '***') : '•••'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ui-text-muted)', marginBottom: 16 }}>Tap card to flip</p>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <span style={{ fontSize: 13, color: 'var(--ui-text-muted)', fontFamily: 'monospace' }}>
                            {selectedCard?.cardNumber || '**** **** **** ****'}
                        </span>
                        <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12, minHeight: 'auto' }} onClick={() => navigator.clipboard.writeText(selectedCard?.cardNumber || '')}>
                            <i className="fas fa-copy" style={{ marginRight: 4 }}></i>Copy
                        </button>
                    </div>

                    <div className="form-grid-2col" style={{ gap: 12 }}>
                        {[
                            { label: 'Cardholder', value: selectedCard?.cardholderName || 'N/A' },
                            { label: 'Card Type', value: selectedCard?.type ? selectedCard.type.charAt(0).toUpperCase() + selectedCard.type.slice(1) : 'N/A' },
                            { label: 'Status', value: selectedCard?.isBlocked ? 'Blocked' : (selectedCard?.status || 'Active') },
                            { label: 'Balance', value: selectedCard?.balance ? formatUsd(selectedCard.balance) : '$0.00' },
                        ].map(({ label, value }) => (
                            <div key={label}>
                                <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginBottom: 2 }}>{label}</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ui-text-on-surface)' }}>{value}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginBottom: 4 }}>CVV / Security Code</div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ui-text-on-surface)', letterSpacing: cvvRevealed ? 4 : 6, fontFamily: 'monospace' }}>
                                {cvvRevealed ? (selectedCard?.cvv || '•••') : '•••'}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '7px 14px', fontSize: 12, minHeight: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => setCvvRevealed(v => !v)}
                        >
                            <i className={`fas ${cvvRevealed ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            {cvvRevealed ? 'Hide' : 'Reveal'}
                        </button>
                    </div>
                </div>
            </div>
        </ModalRoot>
    );
};

// Generic confirmation modal used for destructive or otherwise irreversible
// actions (e.g. blocking a card). Replaces native window.confirm() so the
// prompt matches the rest of the app's styling and isn't a browser-chrome
// dialog. `tone` controls the icon color and confirm button class
// ('danger' | 'warning' | 'info').
export const ConfirmModal = ({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'info',
    isBusy = false,
    onConfirm,
    onCancel,
}) => {
    const iconMap = {
        danger: 'fas fa-exclamation-triangle',
        warning: 'fas fa-exclamation-circle',
        info: 'fas fa-question-circle',
    };
    const colorMap = {
        danger: '#F6465D',
        warning: '#F0B90B',
        info: '#848E9C',
    };
    const confirmBtnClass = tone === 'danger' ? 'btn-danger' : 'btn-submit-card';

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className={iconMap[tone] || iconMap.info} style={{ color: colorMap[tone] || colorMap.info }}></i>
                        {title}
                    </h2>
                    <button className="modal-close-btn" onClick={onCancel} disabled={isBusy}>
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="modal-body">
                    <p style={{ fontSize: 13, color: 'var(--ui-text-soft)', lineHeight: 1.6 }}>{message}</p>
                </div>
                <div className="modal-footer" style={{ display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        className="btn-secondary"
                        style={{ flex: 1 }}
                        onClick={onCancel}
                        disabled={isBusy}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        className={confirmBtnClass}
                        style={{ flex: 1 }}
                        onClick={onConfirm}
                        disabled={isBusy}
                    >
                        {isBusy ? 'Working...' : confirmLabel}
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const LockReasonModal = ({ activeModal, setActiveModal }) => {
    return (
        <ModalRoot open={activeModal === 'lock-reason-modal'}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-lock" style={{ color: 'var(--ui-text-muted)' }}></i>
                        Card Request Unavailable
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    <p id="lock-reason-message" style={{ fontSize: 13, color: 'var(--ui-text-muted)', textAlign: 'center', lineHeight: 1.6 }}></p>
                </div>
                <div className="modal-footer">
                    <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Close</button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const CardLimitsModal = ({ activeModal, setActiveModal, selectedCard }) => {
    const { currentUser, setCardLimits } = useContext(DataContext);
    const defaults = { dailySpending: 1000, monthlySpending: 5000, singleTransaction: 500, atmWithdrawal: 300, onlinePurchases: 2000, international: 1000 };
    const [step, setStep] = useState(1);
    const [limits, setLimits] = useState({
        dailySpending: selectedCard?.limits?.dailySpending || defaults.dailySpending,
        monthlySpending: selectedCard?.limits?.monthlySpending || defaults.monthlySpending,
        singleTransaction: selectedCard?.limits?.singleTransaction || defaults.singleTransaction,
        atmWithdrawal: selectedCard?.limits?.atmWithdrawal || defaults.atmWithdrawal,
        onlinePurchases: selectedCard?.limits?.onlinePurchases || defaults.onlinePurchases,
        international: selectedCard?.limits?.international || defaults.international,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const isOpen = activeModal === 'card-limits-modal';
    const verified = isKycApproved(currentUser?.kycStatus);

    // Re-seed the slider state from the selected card whenever the modal
    // opens. Without this, switching from card A to card B after the modal
    // has mounted would keep card A's limits visible.
    React.useEffect(() => {
        if (!isOpen) { setStep(1); setIsSubmitting(false); setSuccess(false); setError(''); return; }
        setLimits({
            dailySpending:     selectedCard?.limits?.dailySpending     || defaults.dailySpending,
            monthlySpending:   selectedCard?.limits?.monthlySpending   || defaults.monthlySpending,
            singleTransaction: selectedCard?.limits?.singleTransaction || defaults.singleTransaction,
            atmWithdrawal:     selectedCard?.limits?.atmWithdrawal     || defaults.atmWithdrawal,
            onlinePurchases:   selectedCard?.limits?.onlinePurchases   || defaults.onlinePurchases,
            international:     selectedCard?.limits?.international     || defaults.international,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, selectedCard?.id]);

    const handleLimitChange = (key, value) => setLimits(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    const resetToDefaults = () => setLimits(defaults);
    const handleSubmit = async () => {
        if (!verified || !selectedCard?.id) return;
        setIsSubmitting(true);
        setError('');
        try {
            await setCardLimits(selectedCard.id, limits);
            setSuccess(true);
        } catch (err) {
            if (err?.status === 409) {
                setError('This card is blocked. Unblock it before changing limits.');
            } else {
                setError(err?.message || 'Could not update limits. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const limitOptions = [
        { key: 'dailySpending', label: 'Daily Spending', icon: 'fas fa-calendar-day', max: 2000, desc: 'Max per day' },
        { key: 'monthlySpending', label: 'Monthly Spending', icon: 'fas fa-calendar-alt', max: 10000, desc: 'Max per month' },
        { key: 'singleTransaction', label: 'Single Transaction', icon: 'fas fa-credit-card', max: 1000, desc: 'Max per transaction' },
        { key: 'atmWithdrawal', label: 'ATM Withdrawal', icon: 'fas fa-money-bill-wave', max: 1000, desc: 'Max ATM per day' },
        { key: 'onlinePurchases', label: 'Online Purchases', icon: 'fas fa-shopping-cart', max: 1000, desc: 'Max online per day' },
        { key: 'international', label: 'International', icon: 'fas fa-globe', max: 1000, desc: 'Max international' },
    ];

    return (
        <ModalRoot open={isOpen}>
            <div className="modal-content modal-lg">
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-tachometer-alt" style={{ color: 'var(--ui-accent)' }}></i>
                        Card Limits
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body">
                    {!success && <WizardSteps steps={['Adjust Limits', 'Review', 'Verify']} current={step} />}

                    {success ? (
                        <div className="wiz-success">
                            <div className="wiz-success-icon"><i className="fas fa-check-circle"></i></div>
                            <h3>Limits updated</h3>
                            <p>Your new spending limits are now active on this card.</p>
                        </div>
                    ) : step === 1 ? (
                        <>
                            <div className="modal-note" style={{ marginBottom: 16 }}>
                                <i className="fas fa-info-circle"></i>
                                <div className="modal-note-body">
                                    <p className="modal-note-text">Limits protect your card from unauthorized use and reset automatically each period.</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {limitOptions.map(opt => (
                                    <div key={opt.key} className="modal-limit-row">
                                        <div className="modal-limit-header">
                                            <div className="modal-limit-icon"><i className={opt.icon}></i></div>
                                            <div>
                                                <div className="modal-limit-name">{opt.label}</div>
                                                <div className="modal-limit-desc">{opt.desc}</div>
                                            </div>
                                        </div>
                                        <div className="modal-limit-controls">
                                            <input type="range" className="modal-limit-slider" min="0" max={opt.max} step="10" value={limits[opt.key]} onChange={e => handleLimitChange(opt.key, e.target.value)} />
                                            <div className="modal-limit-value">
                                                <span>$</span>
                                                <input type="number" value={limits[opt.key]} onChange={e => handleLimitChange(opt.key, e.target.value)} min="0" step="10" />
                                            </div>
                                        </div>
                                        <div className="modal-limit-current">Current: <strong>${limits[opt.key].toLocaleString()}</strong></div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : step === 2 ? (
                        <div className="modal-summary">
                            {limitOptions.map(opt => (
                                <div key={opt.key} className="modal-summary-row">
                                    <span className="modal-summary-label"><i className={opt.icon} style={{ marginRight: 6, opacity: 0.7 }}></i>{opt.label}</span>
                                    <span className="modal-summary-value">${limits[opt.key].toLocaleString()}</span>
                                </div>
                            ))}
                            <div className="modal-summary-row modal-summary-total">
                                <span className="modal-summary-label">Card</span>
                                <span className="modal-summary-value">•••• {selectedCard?.cardNumber?.slice(-4) || '****'}</span>
                            </div>
                        </div>
                    ) : (
                        verified ? (
                            <div className="kyc-gate kyc-gate-ok">
                                <div className="kyc-gate-icon kyc-gate-icon-ok"><i className="fas fa-check-circle"></i></div>
                                <h3 className="kyc-gate-title">You're verified</h3>
                                <p className="kyc-gate-sub">Confirm to apply the new limits to your card.</p>
                            </div>
                        ) : (
                            <KycGateNotice kycStatus={currentUser?.kycStatus} onStartKyc={() => setActiveModal('kyc-modal')} />
                        )
                    )}
                    {!success && error && (
                        <div className="modal-error-msg" style={{ marginTop: 12 }}>
                            <i className="fas fa-exclamation-triangle"></i>{error}
                        </div>
                    )}
                </div>

                {!success && (
                    <div className="modal-footer">
                        {step === 1 && (
                            <button type="button" className="btn-secondary" onClick={resetToDefaults}>
                                <i className="fas fa-undo" style={{ marginRight: 6 }}></i>Reset
                            </button>
                        )}
                        {step > 1 && (
                            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
                                <i className="fas fa-arrow-left" style={{ marginRight: 6 }}></i>Back
                            </button>
                        )}
                        {step < 3 ? (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setStep(step + 1)}>
                                Continue<i className="fas fa-arrow-right" style={{ marginLeft: 6 }}></i>
                            </button>
                        ) : (
                            <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={handleSubmit} disabled={!verified || isSubmitting}>
                                {isSubmitting ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Saving...</> : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>Confirm & Save</>}
                            </button>
                        )}
                    </div>
                )}
                {success && (
                    <div className="modal-footer">
                        <button type="button" className="btn-submit-card" style={{ flex: 1 }} onClick={() => setActiveModal(null)}>Done</button>
                    </div>
                )}
            </div>
        </ModalRoot>
    );
};

export const ChangeNameModal = ({ activeModal, setActiveModal }) => {
    const { currentUser, updateCurrentUser } = useContext(DataContext);
    const [newName, setNewName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleClose = () => { setActiveModal(null); setNewName(''); setError(''); setSuccess(''); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!newName.trim()) { setError('Name cannot be empty.'); return; }
        if (newName.trim() === currentUser?.name) { setError('That is already your name.'); return; }
        setLoading(true);
        try {
            const updated = await updateClientProfile({ name: newName.trim() });
            updateCurrentUser({ name: updated?.name || newName.trim() });
            setSuccess('Name updated successfully.');
            setTimeout(handleClose, 1200);
        } catch (err) {
            setError(err?.message || 'Failed to update name. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'change-name-modal'}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title">Change Full Name</h2>
                    <button className="modal-close-btn" onClick={handleClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    {success && <div className="modal-success-msg">{success}</div>}
                    {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                    <form id="change-name-form" onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Current Name</label>
                                <div className="modal-current-value">{currentUser?.name || '-'}</div>
                                <label className="form-label">New Full Name</label>
                                <input type="text" id="new-full-name" className="form-input" value={newName} onChange={e => { setNewName(e.target.value); setError(''); }} placeholder="Enter your new name" required autoFocus />
                            </div>
                        </div>
                    </form>
                </div>
                <div className="modal-footer">
                    <button type="submit" form="change-name-form" className="btn-submit-card" style={{ flex: 1 }} disabled={loading}>
                        {loading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const ChangeEmailModal = ({ activeModal, setActiveModal }) => {
    const { currentUser, updateCurrentUser } = useContext(DataContext);
    const [newEmail, setNewEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleClose = () => { setActiveModal(null); setNewEmail(''); setCurrentPassword(''); setError(''); setSuccess(''); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!newEmail.trim()) { setError('Email cannot be empty.'); return; }
        if (newEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) { setError('That is already your email address.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { setError('Please enter a valid email address.'); return; }
        if (!currentPassword) { setError('Please enter your current password to confirm.'); return; }
        setLoading(true);
        try {
            const updated = await changeClientEmail(currentPassword, newEmail.trim().toLowerCase());
            updateCurrentUser({ email: updated?.email || newEmail.trim().toLowerCase() });
            setSuccess('Email updated successfully.');
            setTimeout(handleClose, 1200);
        } catch (err) {
            setError(err?.message || 'Failed to update email. Check your password and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'change-email-modal'}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title">Change Email Address</h2>
                    <button className="modal-close-btn" onClick={handleClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    {success && <div className="modal-success-msg">{success}</div>}
                    {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                    <form id="change-email-form" onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Current Email</label>
                                <div className="modal-current-value">{currentUser?.email || '-'}</div>
                                <label className="form-label">New Email Address</label>
                                <input type="email" id="new-email" className="form-input" value={newEmail} onChange={e => { setNewEmail(e.target.value); setError(''); }} placeholder="Enter your new email" required autoFocus />
                                <label className="form-label" style={{ marginTop: 10 }}>Current Password <span style={{ color: 'var(--ui-accent)', fontSize: 11 }}>(required to confirm)</span></label>
                                <input type="password" className="form-input" value={currentPassword} onChange={e => { setCurrentPassword(e.target.value); setError(''); }} placeholder="Enter your current password" required />
                            </div>
                        </div>
                    </form>
                </div>
                <div className="modal-footer">
                    <button type="submit" form="change-email-form" className="btn-submit-card" style={{ flex: 1 }} disabled={loading}>
                        {loading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

export const ChangePhoneModal = ({ activeModal, setActiveModal }) => {
    const { currentUser, updateCurrentUser } = useContext(DataContext);
    const [newPhone, setNewPhone] = useState('');
    const [phoneCountry, setPhoneCountry] = useState(currentUser?.countryCode || 'US');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleClose = () => { setActiveModal(null); setNewPhone(''); setError(''); setSuccess(''); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const national = newPhone.trim();
        const dial = countryByCode(phoneCountry)?.dial || '';
        const trimmed = national ? `${dial} ${national}`.replace(/\s+/g, ' ').trim() : '';
        if (trimmed === (currentUser?.phone || '').trim()) { setError('That is already your phone number.'); return; }
        setLoading(true);
        try {
            const updated = await updateClientProfile({ phone: trimmed || null, country: phoneCountry });
            updateCurrentUser({ phone: updated?.phone ?? trimmed });
            setSuccess('Phone number updated successfully.');
            setTimeout(handleClose, 1200);
        } catch (err) {
            setError(err?.message || 'Failed to update phone number. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalRoot open={activeModal === 'change-phone-modal'}>
            <div className="modal-content modal-sm">
                <div className="modal-header">
                    <h2 className="modal-title">Change Phone Number</h2>
                    <button className="modal-close-btn" onClick={handleClose}><i className="fas fa-times"></i></button>
                </div>
                <div className="modal-body">
                    {success && <div className="modal-success-msg">{success}</div>}
                    {error && <div className="modal-error-msg"><i className="fas fa-exclamation-circle"></i>{error}</div>}
                    <form id="change-phone-form" onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Current Phone</label>
                                <div className="modal-current-value">{currentUser?.phone || '-'}</div>
                                <label className="form-label">New Phone Number</label>
                                <PhoneField
                                    id="new-phone"
                                    value={newPhone}
                                    onChange={(v) => { setNewPhone(v); setError(''); }}
                                    countryCode={phoneCountry}
                                    onCountryChange={setPhoneCountry}
                                    placeholder="Mobile number"
                                />
                                <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 4 }}>Leave blank to remove your phone number.</div>
                            </div>
                        </div>
                    </form>
                </div>
                <div className="modal-footer">
                    <button type="submit" form="change-phone-form" className="btn-submit-card" style={{ flex: 1 }} disabled={loading}>
                        {loading ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </ModalRoot>
    );
};

/* ── No Card Modal ─────────────────────────────────────────────────────────── */
export const NoCardModal = ({ activeModal, setActiveModal }) => {
    const platformSettingsState = usePlatformSettings();
    const isOpen = activeModal === 'no-card-modal';

    const benefits = [
        { icon: 'fas fa-globe', color: '#3B82F6', label: 'Global Payments', desc: 'Spend seamlessly in 180+ countries' },
        { icon: 'fas fa-coins', color: 'var(--ui-accent)', label: 'Crypto Cashback', desc: 'Earn up to 5% cashback on every purchase' },
        { icon: 'fas fa-bolt', color: '#10B981', label: 'Instant Transfers', desc: 'Move crypto to your card in seconds' },
    ];

    return (
        <ModalRoot open={isOpen} onBackdropClick={() => setActiveModal(null)}>
            <div className="modal-content" style={{ maxWidth: 460, padding: 0, overflow: 'hidden', background: 'linear-gradient(160deg, #1E2028 0%, #161A1E 100%)', border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Hero band */}
                <div style={{ background: 'linear-gradient(135deg, #1a1200 0%, #2a1f00 50%, #1a1200 100%)', padding: '40px 32px 28px', textAlign: 'center', position: 'relative', borderBottom: '1px solid rgba(240,185,11,0.15)' }}>
                    <button className="modal-close-btn" style={{ position: 'absolute', top: 14, right: 14 }} onClick={() => setActiveModal(null)}>
                        <i className="fas fa-times"></i>
                    </button>

                    {/* Pulsing icon */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, borderRadius: '50%', background: 'rgba(240,185,11,0.1)', border: '1.5px solid rgba(240,185,11,0.3)', marginBottom: 20, position: 'relative' }}>
                        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '1.5px solid rgba(240,185,11,0.12)', animation: 'ncm-pulse 2s ease-in-out infinite' }} />
                        <div style={{ position: 'absolute', inset: -16, borderRadius: '50%', border: '1px solid rgba(240,185,11,0.06)', animation: 'ncm-pulse 2s ease-in-out infinite 0.4s' }} />
                        <i className="fas fa-credit-card" style={{ fontSize: 32, color: 'var(--ui-accent)' }}></i>
                    </div>

                    <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 700, color: 'var(--ui-text-on-surface)', letterSpacing: '-0.01em' }}>No Card Yet</h2>
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--ui-text-muted)', lineHeight: 1.6 }}>
                        You don't have a valid card issued to your account.<br />Apply for one to unlock the full {platformSettingsState?.platformName || 'Chain-IQ'} experience.
                    </p>
                </div>

                {/* Benefits */}
                <div style={{ padding: '24px 32px 20px' }}>
                    <p style={{ margin: '0 0 16px', fontSize: 11, fontWeight: 700, color: 'var(--ui-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>What you unlock</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {benefits.map(b => (
                            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${b.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <i className={b.icon} style={{ color: b.color, fontSize: 15 }}></i>
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ui-text-on-surface)', marginBottom: 2 }}>{b.label}</div>
                                    <div style={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>{b.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ padding: '0 32px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                        className="btn-submit-card"
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '13px 0' }}
                        onClick={() => setActiveModal('request-card-modal')}
                    >
                        <i className="fas fa-plus-circle"></i>
                        Apply for a Card
                    </button>
                    <button
                        onClick={() => setActiveModal(null)}
                        style={{ width: '100%', padding: '11px 0', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--ui-text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'border-color 0.2s, color 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#EAECEF'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#848E9C'; }}
                    >
                        Maybe Later
                    </button>
                </div>

                <style>{`
                    @keyframes ncm-pulse {
                        0%, 100% { opacity: 0.6; transform: scale(1); }
                        50% { opacity: 0.2; transform: scale(1.06); }
                    }
                `}</style>
            </div>
        </ModalRoot>
    );
};

/* ── Promo Card Details Modal (no card issued) ─────────────────────────────── */
const PROMO_TIERS = [
    {
        id: 'platinum', type: 'platinum', name: 'Platinum', icon: 'fas fa-crown', accentColor: '#C8B6A6',
        monthlyLimit: '$50,000', dailyLimit: '$5,000', atmLimit: '$2,500', cashback: '5%', foreignFee: '0%',
        perks: ['Airport lounge access worldwide', 'Dedicated 24/7 concierge', 'Zero foreign transaction fees', 'Premium travel insurance', 'Exclusive Platinum events & offers'],
    },
    {
        id: 'gold', type: 'gold', name: 'Gold', icon: 'fas fa-medal', accentColor: '#F0B90B',
        monthlyLimit: '$25,000', dailyLimit: '$2,500', atmLimit: '$1,000', cashback: '3%', foreignFee: '0.5%',
        perks: ['Priority customer support', 'Zero global ATM fees', 'Travel & purchase insurance', 'Crypto cashback rewards', 'Mobile contactless payments'],
    },
    {
        id: 'premium', type: 'premium', name: 'Premium', icon: 'fas fa-star', accentColor: '#7C3AED',
        monthlyLimit: '$10,000', dailyLimit: '$1,000', atmLimit: '$500', cashback: '1%', foreignFee: '1%',
        perks: ['24/7 customer support', 'Fraud protection guarantee', 'Contactless & mobile payments', 'Real-time transaction alerts', 'Multi-currency wallet support'],
    },
];

const formatCardNumberDemo = () => '•••• •••• •••• ••••';

export const PromoCardDetailsModal = ({ activeModal, setActiveModal }) => {
    const platformSettingsState = usePlatformSettings();
    const isOpen = activeModal === 'promo-details-modal';
    const [activeTier, setActiveTier] = useState('gold');
    const [flipped, setFlipped] = useState(false);

    useEffect(() => { if (!isOpen) { setFlipped(false); } }, [isOpen]);

    const tier = PROMO_TIERS.find(t => t.id === activeTier) || PROMO_TIERS[1];

    const limits = [
        { label: 'Monthly Limit', value: tier.monthlyLimit, icon: 'fas fa-calendar-alt' },
        { label: 'Daily Limit', value: tier.dailyLimit, icon: 'fas fa-clock' },
        { label: 'ATM Withdrawal', value: tier.atmLimit, icon: 'fas fa-money-bill-wave' },
        { label: 'Crypto Cashback', value: tier.cashback, icon: 'fas fa-percentage' },
        { label: 'Foreign Fee', value: tier.foreignFee, icon: 'fas fa-globe' },
    ];

    return (
        <ModalRoot open={isOpen} onBackdropClick={() => setActiveModal(null)}>
            <div className="modal-content modal-lg" style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-credit-card" style={{ color: 'var(--ui-accent)' }}></i>
                        Card Preview
                    </h2>
                    <button className="modal-close-btn" onClick={() => setActiveModal(null)}><i className="fas fa-times"></i></button>
                </div>

                <div className="modal-body" style={{ paddingTop: 8 }}>
                    {/* Tier tabs */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
                        {PROMO_TIERS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => { setActiveTier(t.id); setFlipped(false); }}
                                style={{
                                    flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    background: activeTier === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: activeTier === t.id ? '#EAECEF' : '#848E9C',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                }}
                            >
                                <i className={t.icon} style={{ color: activeTier === t.id ? t.accentColor : '#848E9C', fontSize: 11 }}></i>
                                {t.name}
                            </button>
                        ))}
                    </div>

                    {/* Card flip */}
                    <div className="card-flip-scene" style={{ marginBottom: 20 }} title="Click to flip">
                        <div
                            className={`card-flip-inner${flipped ? ' is-flipped' : ''}`}
                            onClick={() => setFlipped((f) => !f)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setFlipped((f) => !f);
                                }
                            }}
                        >
                            <div className="card-flip-face card-flip-front">
                                <div className={`wallet-card card-${tier.type} wc-detail-preview`}>
                                    <div className="wc-row wc-top">
                                        <div className="wc-brand">{platformSettingsState?.cardBrandName || platformSettingsState?.platformName || 'Chain-IQ'}</div>
                                        <div className="wc-type">
                                            <i className={tier.icon} style={{ marginRight: 5, opacity: 0.85 }}></i>
                                            {tier.name}
                                        </div>
                                    </div>
                                    <div className="wc-row wc-middle">
                                        <div className="wc-chip">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="42" height="32" viewBox="0 0 40 30">
                                                <defs><linearGradient id={`chip-promo-${tier.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f5d76e"/><stop offset="100%" stopColor="#b8860b"/></linearGradient></defs>
                                                <rect width="40" height="30" fill={`url(#chip-promo-${tier.id})`} rx="4"/>
                                                <path d="M10 15h20M20 5v20M15 10h10M15 20h10" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5"/>
                                            </svg>
                                        </div>
                                        <div className="wc-number">{formatCardNumberDemo()}</div>
                                    </div>
                                    <div className="wc-row wc-bottom">
                                        <div className="wc-info">
                                            <div className="wc-label">Card Holder</div>
                                            <div className="wc-value wc-name">YOUR NAME</div>
                                        </div>
                                        <div className="wc-info">
                                            <div className="wc-label">Expires</div>
                                            <div className="wc-value">MM/YY</div>
                                        </div>
                                        <div className="wc-network"><i className="fab fa-cc-visa"></i></div>
                                    </div>
                                </div>
                            </div>
                            <div className={`card-flip-face card-flip-back card-${tier.type}`}>
                                <div className="card-flip-magstripe" />
                                <div className="card-flip-back-meta">
                                    <span>{tier.cashback} Cashback</span>
                                    <span>CVV •••</span>
                                </div>
                            </div>
                        </div>
                        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--ui-text-muted)', margin: '8px 0 0' }}>
                            <i className="fas fa-sync-alt" style={{ marginRight: 5 }}></i>Tap card to flip
                        </p>
                    </div>

                    {/* Limits grid */}
                    <div style={{ marginBottom: 18 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--ui-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card Limits</p>
                        <div className="form-grid-2col" style={{ gap: 8 }}>
                            {limits.map(l => (
                                <div key={l.label} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <i className={l.icon} style={{ color: tier.accentColor, fontSize: 13, width: 16, textAlign: 'center' }}></i>
                                    <div>
                                        <div style={{ fontSize: 10, color: 'var(--ui-text-muted)', marginBottom: 2 }}>{l.label}</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ui-text-on-surface)' }}>{l.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Perks */}
                    <div style={{ marginBottom: 8 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'var(--ui-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Card Benefits</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {tier.perks.map(p => (
                                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ui-text-on-surface)' }}>
                                    <i className="fas fa-check-circle" style={{ color: tier.accentColor, fontSize: 13, flexShrink: 0 }}></i>
                                    {p}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer" style={{ gap: 10 }}>
                    <button className="btn-submit-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => setActiveModal('request-card-modal')}>
                        <i className="fas fa-plus-circle"></i>Apply for {tier.name}
                    </button>
                    <button className="modal-cancel-btn" style={{ flex: 0.5 }} onClick={() => setActiveModal(null)}>Close</button>
                </div>
            </div>
        </ModalRoot>
    );
};
