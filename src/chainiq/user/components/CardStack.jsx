import React, { useContext } from 'react';
import { DataContext } from '../contexts/DataContext';

const formatCardNumber = (num) => {
    const s = (num || '').toString().replace(/\s/g, '');
    if (s.length < 4) return '•••• •••• •••• ••••';
    const last4 = s.slice(-4);
    return `•••• •••• •••• ${last4}`;
};

const resolveHolderName = (card, currentUser) => {
    const raw = (card?.cardholderName || '').trim();
    if (raw && raw.toLowerCase() !== 'card holder') return raw.toUpperCase();
    const userName = (currentUser?.name || [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || '').trim();
    return (userName || 'CARD HOLDER').toUpperCase();
};

const SHOWCASE_TIERS = [
    { id: 'platinum', type: 'platinum', name: 'Platinum', tagline: '5% Crypto Cashback', perk: '$50,000 / mo', cta: 'Choose Platinum', icon: 'fas fa-crown' },
    { id: 'gold', type: 'gold', name: 'Gold', tagline: '3% Crypto Cashback', perk: '$25,000 / mo', cta: 'Choose Gold', icon: 'fas fa-medal' },
    { id: 'premium', type: 'premium', name: 'Premium', tagline: '1% Crypto Cashback', perk: '$10,000 / mo', cta: 'Get Started', icon: 'fas fa-star' },
];

const ShowcaseStack = ({ platformSettingsState, onShowcaseSelect }) => {
    const [topIndex, setTopIndex] = React.useState(0);
    const numCards = SHOWCASE_TIERS.length;
    const brand = platformSettingsState?.cardBrandName || 'Chain-IQ';

    const order = React.useMemo(() => {
        const rest = SHOWCASE_TIERS.filter((_, i) => i !== topIndex);
        return [SHOWCASE_TIERS[topIndex], ...rest];
    }, [topIndex]);

    const handleCardClick = (tier, visualIndex) => {
        const realIndex = SHOWCASE_TIERS.findIndex((t) => t.id === tier.id);
        if (visualIndex !== 0) {
            setTopIndex(realIndex);
            return;
        }
        if (onShowcaseSelect) onShowcaseSelect(tier.id);
    };

    return (
        <div
            className="wallet-card-stack wallet-card-showcase"
            style={{ '--card-count': numCards }}
        >
            <div className="showcase-eyebrow">
                <span className="showcase-eyebrow-dot" />
                Available cards  /  tap to select a tier
            </div>
            {order.map((t, visualIndex) => {
                const isTop = visualIndex === 0;
                return (
                    <div
                        key={t.id}
                        className={`wallet-card card-${t.type} showcase-card${isTop ? ' is-top' : ''}`}
                        style={{ '--stack-index': visualIndex, zIndex: numCards - visualIndex }}
                        onClick={() => handleCardClick(t, visualIndex)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCardClick(t, visualIndex);
                            }
                        }}
                    >
                        <div className="wc-row wc-top">
                            <div className="wc-brand">{brand}</div>
                            <div className="wc-type">
                                <i className={t.icon} style={{ marginRight: 6, opacity: 0.8 }} />
                                {t.name}
                            </div>
                        </div>
                        <div className="wc-row wc-middle showcase-middle">
                            <div className="showcase-tagline">{t.tagline}</div>
                            <div className="showcase-perk">{t.perk}</div>
                        </div>
                        <div className="wc-row wc-bottom">
                            <div className="showcase-cta">
                                <i className="fas fa-plus-circle" />
                                <span>{t.cta}</span>
                            </div>
                            <div className="wc-network">
                                <i className="fab fa-cc-visa" />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const CardStack = ({ cards, topCardId, selectedCardId, onCardClick, userSettingsState, platformSettingsState, onShowcaseSelect }) => {
    const { currentUser, formatBalance } = useContext(DataContext);
    const numCards = cards.length;

    if (numCards === 0) {
        return (
            <ShowcaseStack
                platformSettingsState={platformSettingsState}
                onShowcaseSelect={onShowcaseSelect}
            />
        );
    }

    return (
        <div className="wallet-card-stack" style={{ '--card-count': numCards }}>
            {cards.map((card, index) => {
                const isTop = index === 0;
                const isSelected = selectedCardId === card.id;
                const balanceDisplay = userSettingsState?.showCardBalance
                    ? formatBalance(card.balance)
                    : '****';

                return (
                    <div
                        key={card.id}
                        className={`wallet-card card-${card.type}${card.isBlocked ? ' blocked' : ''}${card.isFrozen ? ' frozen' : ''}${isTop ? ' is-top' : ''}${isSelected ? ' is-active' : ''}`}
                        style={{
                            '--stack-index': index,
                            zIndex: numCards - index,
                            opacity: index > 4 ? 0 : 1 - index * 0.04,
                        }}
                        onClick={() => onCardClick(card.id)}
                    >
                        <div className="wc-row wc-top">
                            <div className="wc-brand">{platformSettingsState?.cardBrandName || 'Chain-IQ'}</div>
                            <div className="wc-type">{platformSettingsState?.cardTypes?.[card.type]?.name || card.type || 'Card'}</div>
                        </div>
                        <div className="wc-row wc-middle">
                            <div className="wc-chip">
                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30" aria-hidden>
                                    <defs>
                                        <linearGradient id={`chip-${card.id}`} x1="0" y1="0" x2="1" y2="1">
                                            <stop offset="0%" stopColor="#f5d76e" />
                                            <stop offset="100%" stopColor="#b8860b" />
                                        </linearGradient>
                                    </defs>
                                    <rect width="40" height="30" fill={`url(#chip-${card.id})`} rx="4" />
                                    <path d="M10 15h20M20 5v20M15 10h10M15 20h10" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />
                                </svg>
                            </div>
                            <div className="wc-number">{formatCardNumber(card.cardNumber)}</div>
                        </div>
                        <div className="wc-row wc-bottom">
                            <div className="wc-info">
                                <div className="wc-label">Card Holder</div>
                                <div className="wc-value wc-name">{resolveHolderName(card, currentUser)}</div>
                            </div>
                            <div className="wc-info wc-balance">
                                <div className="wc-label">Balance</div>
                                <div className="wc-value wc-balance-value">{balanceDisplay}</div>
                            </div>
                            <div className="wc-network">
                                <i className="fab fa-cc-visa" />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default CardStack;
