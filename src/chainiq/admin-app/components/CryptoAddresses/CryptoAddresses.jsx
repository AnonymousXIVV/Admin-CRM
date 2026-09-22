import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { DataContext, NotificationContext } from '../../App';
import Modal from '../Modal/Modal';
import { useConfirmDialog } from '../ConfirmModal/ConfirmModal';
import { formatAddress, assetLogos } from '../../data/data';
import { QRCodeCanvas } from 'qrcode.react'; // Using qrcode.react for QR code generation
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faUpload, faCopy, faQrcode, faCheck, faTimes, faShieldAlt, faSync } from '@fortawesome/free-solid-svg-icons';
import {
  listCryptoAddresses,
  createCryptoAddress,
  updateCryptoAddress,
  revokeCryptoAddress,
  bulkImportCryptoAddresses,
  searchAdminLeads,
} from '../../adminApi';
import { validateAddress, validateAddressForNetwork } from './addressValidators';

// Colour map for blockchain network badges shown in the address table.
const NETWORK_BADGE_COLORS = {
  'tron':        { bg: 'rgba(232,39,55,0.14)',  color: '#E82737', border: 'rgba(232,39,55,0.35)'  },
  'trc-20':      { bg: 'rgba(232,39,55,0.14)',  color: '#E82737', border: 'rgba(232,39,55,0.35)'  },
  'ethereum':    { bg: 'rgba(98,126,234,0.14)', color: '#8B9FF0', border: 'rgba(98,126,234,0.35)' },
  'erc-20':      { bg: 'rgba(98,126,234,0.14)', color: '#8B9FF0', border: 'rgba(98,126,234,0.35)' },
  'bnb':         { bg: 'rgba(240,185,11,0.14)', color: '#F0B90B', border: 'rgba(240,185,11,0.35)' },
  'bep-20':      { bg: 'rgba(240,185,11,0.14)', color: '#F0B90B', border: 'rgba(240,185,11,0.35)' },
  'solana':      { bg: 'rgba(153,69,255,0.14)', color: '#B07EFF', border: 'rgba(153,69,255,0.35)' },
  'spl':         { bg: 'rgba(153,69,255,0.14)', color: '#B07EFF', border: 'rgba(153,69,255,0.35)' },
  'polygon':     { bg: 'rgba(130,71,229,0.14)', color: '#A973FF', border: 'rgba(130,71,229,0.35)' },
  'matic':       { bg: 'rgba(130,71,229,0.14)', color: '#A973FF', border: 'rgba(130,71,229,0.35)' },
  'bitcoin':     { bg: 'rgba(247,147,26,0.14)', color: '#F7931A', border: 'rgba(247,147,26,0.35)' },
  'btc':         { bg: 'rgba(247,147,26,0.14)', color: '#F7931A', border: 'rgba(247,147,26,0.35)' },
  'lightning':   { bg: 'rgba(255,196,0,0.14)',  color: '#FFC400', border: 'rgba(255,196,0,0.35)'  },
  'avalanche':   { bg: 'rgba(232,65,66,0.14)',  color: '#E84142', border: 'rgba(232,65,66,0.35)'  },
  'ripple':      { bg: 'rgba(0,170,228,0.14)',  color: '#00AAE4', border: 'rgba(0,170,228,0.35)'  },
  'xrp':         { bg: 'rgba(0,170,228,0.14)',  color: '#00AAE4', border: 'rgba(0,170,228,0.35)'  },
  'cardano':     { bg: 'rgba(0,51,173,0.18)',   color: '#6B8CFF', border: 'rgba(0,51,173,0.4)'    },
  'stellar':     { bg: 'rgba(10,134,204,0.14)', color: '#3BBFFF', border: 'rgba(10,134,204,0.35)' },
};

function getNetworkBadgeStyle(networkName) {
  if (!networkName) return null;
  const lower = networkName.toLowerCase();
  for (const [key, style] of Object.entries(NETWORK_BADGE_COLORS)) {
    if (lower.includes(key)) return style;
  }
  return { bg: 'rgba(132,142,156,0.12)', color: '#848E9C', border: 'rgba(132,142,156,0.3)' };
}

function NetworkBadge({ network }) {
  if (!network) return null;
  const s = getNetworkBadgeStyle(network);
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.3,
      padding: '2px 8px',
      borderRadius: 99,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
      marginTop: 3,
      whiteSpace: 'nowrap',
    }}>
      {network}
    </span>
  );
}

// Network options per asset ticker - shown in the "Add Address" modal so
// the admin picks the exact chain, and displayed to clients on deposit.
const NETWORKS_BY_TICKER = {
  BTC:  ['Bitcoin (BTC)', 'Lightning Network'],
  ETH:  ['Ethereum (ERC-20)'],
  USDT: ['Tron (TRC-20)', 'Ethereum (ERC-20)', 'BNB Smart Chain (BEP-20)', 'Solana (SPL)', 'Polygon (MATIC)'],
  BNB:  ['BNB Smart Chain (BEP-20)', 'Ethereum (ERC-20)'],
  USDC: ['Ethereum (ERC-20)', 'Solana (SPL)', 'BNB Smart Chain (BEP-20)', 'Polygon (MATIC)', 'Avalanche C-Chain'],
  SOL:  ['Solana (SOL)'],
  XRP:  ['Ripple (XRP Ledger)'],
  ADA:  ['Cardano (ADA)'],
  DOGE: ['Dogecoin (DOGE)'],
  MATIC:['Polygon (MATIC)', 'Ethereum (ERC-20)'],
  DOT:  ['Polkadot (DOT)'],
  AVAX: ['Avalanche C-Chain', 'Ethereum (ERC-20)'],
  LINK: ['Ethereum (ERC-20)', 'BNB Smart Chain (BEP-20)'],
  UNI:  ['Ethereum (ERC-20)'],
  LTC:  ['Litecoin (LTC)'],
  BCH:  ['Bitcoin Cash (BCH)'],
  XLM:  ['Stellar (XLM)'],
  FIL:  ['Filecoin (FIL)', 'Ethereum (ERC-20)'],
  NEAR: ['NEAR Protocol (NEAR)'],
};

// Inline address-validation indicator. When a `network` is provided the
// check is narrowed to that specific format; otherwise it falls back to the
// asset-level (ticker-only) check.
const AddressFieldIndicator = ({ ticker, network, value }) => {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  if (!ticker) {
    return (
      <small style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#848E9C' }}>
        Select an asset to validate this address.
      </small>
    );
  }
  const result = network
    ? validateAddressForNetwork(ticker, network, trimmed)
    : validateAddress(ticker, trimmed);
  const color  = result.ok ? '#0ECB81' : '#F6465D';
  const label  = result.ok
    ? (result.detected ? `Valid address (${result.detected}).` : `Valid ${ticker.toUpperCase()} address.`)
    : result.reason;
  return (
    <small style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color }}>
      <FontAwesomeIcon icon={result.ok ? faCheck : faTimes} />
      {label}
    </small>
  );
};

// AssignAddressModal Component
// NOTE: Defined at module scope (NOT inside CryptoAddresses) so its function
// identity is stable across parent re-renders.
//
// Design: each of the 3 slots has its OWN network dropdown so the admin can
// enter addresses from up to 3 different networks in a single form submission.
// On save, slots are grouped by network - same-network slots are combined into
// one DB entry (rotation addresses); different-network slots each become their
// own DB entry. Clients will then see a network selector on the deposit screen
// whenever more than one network entry exists for an asset.
const AssignAddressModal = ({ isOpen, onClose, onSaveAddress, users, cryptoData, showNotification }) => {
  const EMPTY_SLOTS = [
    { network: '', address: '' },
    { network: '', address: '' },
    { network: '', address: '' },
  ];

  const [mode, setMode] = useState('universal');
  const [selectedClient, setSelectedClient] = useState('');
  const [asset, setAsset] = useState('');
  const [slots, setSlots] = useState(EMPTY_SLOTS);

  const networkOptions = asset ? (NETWORKS_BY_TICKER[asset] || []) : [];

  useEffect(() => {
    if (isOpen) {
      setMode('universal');
      setSelectedClient('');
      setAsset('');
      setSlots(EMPTY_SLOTS);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleAssetChange = (e) => {
    setAsset(e.target.value);
    setSlots(EMPTY_SLOTS);
  };

  const updateSlot = (idx, field, value) => {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const filledSlots = slots.filter(s => s.address.trim());
    if (filledSlots.length === 0) {
      showNotification('Please enter at least one address.', 'error');
      return;
    }
    // Every filled slot must have a network selected.
    const missingNetwork = filledSlots.find(s => !s.network);
    if (missingNetwork) {
      showNotification('Please select a network for each address you entered.', 'error');
      return;
    }
    // Network-aware format validation per slot.
    for (const slot of filledSlots) {
      const result = validateAddressForNetwork(asset, slot.network, slot.address.trim());
      if (!result.ok) {
        showNotification(`Invalid address for ${slot.network}: ${result.reason}`, 'error');
        return;
      }
    }
    // Group slots by network - same-network slots become rotation alternatives
    // in one DB entry; different-network slots each get their own entry.
    const groups = {};
    filledSlots.forEach(slot => {
      const key = slot.network;
      if (!groups[key]) groups[key] = { network: slot.network, addresses: [] };
      groups[key].addresses.push(slot.address.trim());
    });
    Object.values(groups).forEach(group => {
      onSaveAddress({ mode, selectedClient, asset, network: group.network, addresses: group.addresses });
    });
    onClose();
    setMode('universal');
    setSelectedClient('');
    setAsset('');
    setSlots(EMPTY_SLOTS);
  };

  const slotLabels = ['Address / Network 1', 'Address / Network 2', 'Address / Network 3'];
  const slotRequired = [true, false, false];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Assign New Addresses">
      <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(14,203,129,0.07)', border: '1px solid rgba(14,203,129,0.25)', borderRadius: 8 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0ECB81', margin: '0 0 4px' }}>Each slot = its own network</p>
        <p style={{ fontSize: 12, color: '#B7BDC6', margin: 0, lineHeight: 1.6 }}>
          Each address slot has its <strong style={{ color: '#EAECEF' }}>own network</strong>. Add up to 3 addresses from
          up to 3 different networks in one go - the platform creates a separate entry per network and shows clients a
          network selector on the deposit screen. Addresses on the <strong style={{ color: '#EAECEF' }}>same network</strong> become
          rotation alternatives (one is picked per session).
        </p>
      </div>
      <form onSubmit={handleSubmit}>
        {/* Mode */}
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="assign-mode-select">Assignment Mode</label>
          <select className="aax-form-select" id="assign-mode-select" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="universal">Universal (Global Pool) - available to all clients</option>
            <option value="client">Client-Specific - dedicated to one client only</option>
          </select>
        </div>
        {mode === 'client' && (
          <div className="aax-form-group">
            <label className="aax-form-label" htmlFor="assign-client-select">Select Client</label>
            <select
              className="aax-form-select"
              id="assign-client-select"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              required
            >
              <option value="">Select a client...</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
              ))}
            </select>
          </div>
        )}
        {/* Asset */}
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="assign-asset-select">Select Asset</label>
          <select className="aax-form-select" id="assign-asset-select" value={asset} onChange={handleAssetChange} required>
            <option value="">Select asset...</option>
            {cryptoData.map(c => (
              <option key={c.id} value={c.ticker}>{c.ticker} - {c.asset || c.name || ''}</option>
            ))}
          </select>
        </div>

        {/* Per-slot network + address */}
        {asset && slots.map((slot, idx) => {
          const isRequired = slotRequired[idx];
          const isOptional = !isRequired;
          return (
            <div
              key={idx}
              style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                padding: '12px 14px',
                marginBottom: 12,
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
                {slotLabels[idx]}{isOptional && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (optional)</span>}
              </div>
              {/* Network */}
              <div className="aax-form-group" style={{ marginBottom: 8 }}>
                <label className="aax-form-label" style={{ fontSize: 12 }}>
                  Network{isRequired && <span style={{ color: '#F6465D' }}> *</span>}
                </label>
                <select
                  className="aax-form-select"
                  value={slot.network}
                  onChange={(e) => updateSlot(idx, 'network', e.target.value)}
                >
                  <option value="">Select network...</option>
                  {networkOptions.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="Other">Other / Custom</option>
                </select>
              </div>
              {/* Address */}
              <div className="aax-form-group" style={{ marginBottom: 0 }}>
                <label className="aax-form-label" style={{ fontSize: 12 }}>
                  Address{isRequired && <span style={{ color: '#F6465D' }}> *</span>}
                </label>
                <input
                  type="text"
                  className="aax-form-input"
                  value={slot.address}
                  onChange={(e) => updateSlot(idx, 'address', e.target.value)}
                  placeholder={slot.network ? `Paste a ${asset} ${slot.network} address` : 'Select a network first'}
                />
                <AddressFieldIndicator ticker={asset} network={slot.network || undefined} value={slot.address} />
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.25)', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#F0B90B' }}>
          <FontAwesomeIcon icon={faShieldAlt} />
          <span>Always confirm with a small test deposit before directing clients to an address.</span>
        </div>
        <button type="submit" className="aax-btn-submit-card" disabled={!asset}>Save Addresses</button>
      </form>
    </Modal>
  );
};

// EditAddressModal Component
const EditAddressModal = ({ isOpen, onClose, addressItem, onUpdateAddress }) => {
  const [address1, setAddress1] = useState(addressItem ? addressItem.addresses[0] : '');
  const [address2, setAddress2] = useState(addressItem ? addressItem.addresses[1] : '');
  const [address3, setAddress3] = useState(addressItem ? addressItem.addresses[2] : '');
  const [network, setNetwork]   = useState(addressItem ? (addressItem.network || '') : '');
  const [formError, setFormError] = useState('');

  const networkOptions = addressItem?.asset ? (NETWORKS_BY_TICKER[addressItem.asset] || []) : [];

  useEffect(() => {
    if (addressItem) {
      setAddress1(addressItem.addresses[0] || '');
      setAddress2(addressItem.addresses[1] || '');
      setAddress3(addressItem.addresses[2] || '');
      setNetwork(addressItem.network || '');
      setFormError('');
    }
  }, [addressItem]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const updatedAddresses = [address1, address2, address3].filter(Boolean);
    if (updatedAddresses.length === 0) {
      setFormError('Please enter at least one address.');
      return;
    }
    const ticker = addressItem?.asset || '';
    for (const addr of updatedAddresses) {
      const result = network
        ? validateAddressForNetwork(ticker, network, addr)
        : validateAddress(ticker, addr);
      if (!result.ok) {
        setFormError(result.reason || `One of the addresses does not look like a valid ${ticker || 'crypto'} address. Please double-check the highlighted field.`);
        return;
      }
    }
    setFormError('');
    onUpdateAddress(addressItem.id, addressItem.type, updatedAddresses, network);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Addresses for ${addressItem ? addressItem.asset : ''}`}>
      <form onSubmit={handleSubmit}>
        <p className="page-subtitle -mt-4 aax-mb-4" id="edit-client-name" style={{ display: addressItem && addressItem.type === 'client' ? 'block' : 'none' }}>
          {addressItem && addressItem.type === 'client' ? addressItem.clientEmail : ''}
        </p>
        {formError && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.45)', color: '#FF6B61', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="edit-network-select">Network</label>
          <select
            className="aax-form-select"
            id="edit-network-select"
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="">No network specified</option>
            {networkOptions.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="Other">Other / Custom</option>
          </select>
          <small className="text-text-secondary mt-1 block">The blockchain network clients will see on the deposit screen.</small>
        </div>
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="edit-address-1">
            Address 1 <span style={{ color: '#F6465D' }}>*</span>
          </label>
          <input type="text" className="aax-form-input" id="edit-address-1" value={address1} onChange={(e) => setAddress1(e.target.value)} required />
          <AddressFieldIndicator ticker={addressItem?.asset} network={network || undefined} value={address1} />
        </div>
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="edit-address-2">Address 2 <span style={{ color: '#848E9C', fontWeight: 'normal' }}>(optional)</span></label>
          <input type="text" className="aax-form-input" id="edit-address-2" value={address2} onChange={(e) => setAddress2(e.target.value)} />
          <AddressFieldIndicator ticker={addressItem?.asset} network={network || undefined} value={address2} />
        </div>
        <div className="aax-form-group">
          <label className="aax-form-label" htmlFor="edit-address-3">Address 3 <span style={{ color: '#848E9C', fontWeight: 'normal' }}>(optional)</span></label>
          <input type="text" className="aax-form-input" id="edit-address-3" value={address3} onChange={(e) => setAddress3(e.target.value)} />
          <AddressFieldIndicator ticker={addressItem?.asset} network={network || undefined} value={address3} />
        </div>
        <button type="submit" className="aax-btn-submit-card">Update Addresses</button>
      </form>
    </Modal>
  );
};

// QrCodeModal Component - redesigned to match the platform's dark Binance
// palette: framed yellow QR pad on top of the standard admin modal, asset
// chip header, monospace address pill with inline copy.
const QrCodeModal = ({ isOpen, onClose, address, asset }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (!isOpen) setCopied(false); }, [isOpen]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); },
      () => { /* clipboard unavailable - silently ignore */ }
    );
  };

  const logoSrc = asset ? assetLogos?.[asset] : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Deposit Address QR Code">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {/* Asset chip header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)', borderRadius: 999 }}>
          {logoSrc && (
            <img
              src={logoSrc}
              alt={asset || ''}
              style={{ width: 22, height: 22, borderRadius: '50%' }}
            />
          )}
          <span style={{ color: '#F0B90B', fontWeight: 600, fontSize: 14, letterSpacing: 0.3 }}>
            {asset || 'Crypto'} deposit address
          </span>
        </div>

        {/* Yellow-bordered QR pad */}
        <div
          id="qr-code-container"
          style={{
            background: '#FFFFFF',
            padding: 18,
            borderRadius: 14,
            border: '2px solid #F0B90B',
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {address ? (
            <QRCodeCanvas
              value={address}
              size={236}
              level="H"
              fgColor="#0B0E11"
              bgColor="#FFFFFF"
            />
          ) : (
            <div style={{ width: 236, height: 236, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#848E9C', fontSize: 13 }}>
              No address provided
            </div>
          )}
        </div>

        <p style={{ margin: 0, fontSize: 12, color: '#848E9C', textAlign: 'center', maxWidth: 320 }}>
          Scan with the client's wallet app or copy the address below.
        </p>

        {/* Monospace address pill with copy */}
        {address && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'stretch',
              background: '#1E2026',
              border: '1px solid #2B3139',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                flex: 1,
                padding: '10px 14px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
                color: '#EAECEF',
                wordBreak: 'break-all',
                lineHeight: 1.5,
              }}
            >
              {address}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
              style={{
                background: copied ? '#0ECB81' : '#F0B90B',
                color: copied ? '#FFFFFF' : '#0B0E11',
                border: 'none',
                padding: '0 18px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background 160ms ease',
              }}
            >
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}

        {/* Safety reminder, consistent with other admin modals */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: 'rgba(240,185,11,0.06)',
            border: '1px solid rgba(240,185,11,0.2)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: '#B7BDC6',
            lineHeight: 1.5,
          }}
        >
          <FontAwesomeIcon icon={faShieldAlt} style={{ color: '#F0B90B', marginTop: 2 }} />
          <span>
            Always verify the address with the client before requesting a deposit.
            Sending the wrong asset to this address will result in a permanent loss of funds.
          </span>
        </div>
      </div>
    </Modal>
  );
};

// AuditTrailModal Component - uses real audit log from DataContext
const AuditTrailModal = ({ isOpen, onClose, clientName, cryptoAuditLog }) => {
  const relevantEntries = (cryptoAuditLog || []).filter(entry => {
    const detail = (entry.details || entry.detail || '').toLowerCase();
    const action = (entry.action || '').toLowerCase();
    return detail.includes((clientName || '').toLowerCase()) || action.includes('address');
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Audit Trail for ${clientName}`}>
      <div id="audit-trail-content">
        {relevantEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#a3adc0' }}>
            No address-related audit entries found for {clientName}.
          </div>
        ) : (
          relevantEntries.map((entry, idx) => (
            <div className="aax-audit-entry" key={entry.id || idx}>
              <p><strong>{entry.admin || entry.user || 'Admin'}</strong> - {entry.action}: {entry.details || entry.detail}</p>
              <span>{entry.timestamp || entry.date || ''}</span>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};


// BulkUploadModal Component - CSV bulk upload
const BulkUploadModal = ({ isOpen, onClose, onBulkSave, users, cryptoData }) => {
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState([]);
  const [parseError, setParseError] = useState('');

  const [inputMode, setInputMode] = useState('paste'); // 'paste' | 'file'

  useEffect(() => { if (!isOpen) { setCsvText(''); setParsed([]); setParseError(''); setInputMode('paste'); } }, [isOpen]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setCsvText(ev.target.result || ''); setInputMode('paste'); };
    reader.readAsText(file);
  };

  const handleParse = () => {
    setParseError('');
    setParsed([]);
    const lines = csvText.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) { setParseError('CSV must have a header row and at least one data row.'); return; }
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['type', 'asset', 'address1'];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length) { setParseError(`Missing required columns: ${missing.join(', ')}`); return; }
    const rows = lines.slice(1).map((line, i) => {
      const cols = line.split(',').map(c => c.trim());
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx] || ''; });
      return { ...obj, _line: i + 2 };
    });
    const errors = [];
    rows.forEach(r => {
      if (!['universal', 'client'].includes(r.type)) errors.push(`Line ${r._line}: type must be 'universal' or 'client'`);
      if (!r.asset) errors.push(`Line ${r._line}: asset is required`);
      if (!r.address1) errors.push(`Line ${r._line}: address1 is required`);
      if (r.type === 'client' && !r.email) errors.push(`Line ${r._line}: email is required for client-type rows`);
    });
    if (errors.length) { setParseError(errors.join('\n')); return; }
    setParsed(rows);
  };

  const handleImport = () => {
    if (parsed.length === 0) return;
    onBulkSave(parsed);
    onClose();
  };

  const sampleCSV = 'type,asset,address1,address2,address3,email\nuniversal,BTC,bc1qexample1,,\nuniversal,ETH,0xexample1,,\nclient,BTC,bc1qclientaddr,,,client@example.com';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Upload Crypto Addresses (CSV)">
      <div style={{ marginBottom: '12px', background: '#363B44', borderRadius: '8px', padding: '12px' }}>
        <p style={{ color: '#a3adc0', fontSize: '0.85rem', marginBottom: '6px' }}>Required columns: <code>type</code>, <code>asset</code>, <code>address1</code>. Optional: <code>address2</code>, <code>address3</code>, <code>email</code> (required if type=client).</p>
        <details>
          <summary style={{ color: '#f3ba2f', cursor: 'pointer', fontSize: '0.85rem' }}>View sample CSV</summary>
          <pre style={{ fontSize: '0.75rem', color: '#848E9C', whiteSpace: 'pre-wrap', marginTop: '8px' }}>{sampleCSV}</pre>
        </details>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <button type="button" onClick={() => setInputMode('paste')}
          style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${inputMode === 'paste' ? '#F0B90B' : '#444A55'}`, background: inputMode === 'paste' ? 'rgba(240,185,11,0.1)' : 'transparent', color: inputMode === 'paste' ? '#F0B90B' : '#848E9C', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          [list] Paste CSV
        </button>
        <button type="button" onClick={() => setInputMode('file')}
          style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${inputMode === 'file' ? '#F0B90B' : '#444A55'}`, background: inputMode === 'file' ? 'rgba(240,185,11,0.1)' : 'transparent', color: inputMode === 'file' ? '#F0B90B' : '#848E9C', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          [file] Upload File
        </button>
      </div>
      {inputMode === 'file' ? (
        <div className="aax-form-group">
          <label className="aax-form-label">Upload CSV File</label>
          <input type="file" accept=".csv,text/plain"
            onChange={handleFileUpload}
            style={{ display: 'block', color: '#EAECEF', fontSize: 13, padding: '8px 0' }}
          />
          {csvText && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#0ECB81' }}>OK File loaded - {csvText.split('\n').length - 1} data rows detected. Switch to Paste CSV to review.</div>
          )}
        </div>
      ) : (
        <div className="aax-form-group">
          <label className="aax-form-label">Paste CSV Content</label>
          <textarea
            className="aax-form-input"
            rows={8}
            style={{ fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
            placeholder={sampleCSV}
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button className="aax-btn-submit-card" type="button" onClick={handleParse} style={{ flex: 1 }}>
          [search] Parse &amp; Validate
        </button>
      </div>
      {parseError && (
        <div style={{ background: 'rgba(246,70,93,0.12)', border: '1px solid #F6465D', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
          <pre style={{ color: '#F6465D', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>{parseError}</pre>
        </div>
      )}
      {parsed.length > 0 && (
        <div>
          <div style={{ background: 'rgba(14,203,129,0.12)', border: '1px solid #0ECB81', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
            <p style={{ color: '#0ECB81', margin: 0, fontSize: '0.85rem' }}>OK {parsed.length} row(s) validated successfully.</p>
          </div>
          <div className="aax-admin-table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            <table className="aax-admin-table">
              <thead><tr><th>Type</th><th>Asset</th><th>Address 1</th><th>Email</th></tr></thead>
              <tbody>
                {parsed.map((row, i) => (
                  <tr key={i}>
                    <td>{row.type}</td>
                    <td>{row.asset}</td>
                    <td style={{ fontSize: '0.75rem' }}>{row.address1}</td>
                    <td style={{ fontSize: '0.75rem' }}>{row.email || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="aax-btn-submit-card" type="button" onClick={handleImport} style={{ marginTop: '12px', background: '#0ECB81' }}>
            ⬆ Import {parsed.length} Address{parsed.length !== 1 ? 'es' : ''}
          </button>
        </div>
      )}
    </Modal>
  );
};

const CryptoAddresses = () => {
  const { globalAddressData, setGlobalAddressData, clientAddressData, setClientAddressData, users, cryptoData, logAdminAction, auditLog: cryptoAuditLog } = useContext(DataContext);
  const showNotification = useContext(NotificationContext);
  const [confirmDialog, confirm] = useConfirmDialog();

  const [activeTab, setActiveTab] = useState('global-addresses-view');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);

  // Fetch address book directly when this component mounts so the table is
  // always populated even if the parent panel loaded before the async fetch
  // completed, or if the admin navigates away and back.
  const reloadAddresses = useCallback(async () => {
    setIsLoadingAddresses(true);
    try {
      const { global, client } = await listCryptoAddresses();
      setGlobalAddressData(global);
      setClientAddressData(client);
    } catch (err) {
      showNotification('Failed to load crypto addresses. Please refresh.', 'error');
    } finally {
      setIsLoadingAddresses(false);
    }
  }, [setGlobalAddressData, setClientAddressData]); // showNotification intentionally omitted - it changes reference on every render and would cause an infinite fetch loop

  useEffect(() => { reloadAddresses(); }, [reloadAddresses]);

  // Global Pool State
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalCurrentPage, setGlobalCurrentPage] = useState(1);
  const globalRowsPerPage = 10;

  // Client Assignments State
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [remoteClientSearchResults, setRemoteClientSearchResults] = useState([]);
  const [assetFilter, setAssetFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientCurrentPage, setClientCurrentPage] = useState(1);
  const clientRowsPerPage = 5;

  // Search functionality for client assignments
  const searchUsers = (query) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return [];
    return users.filter(user =>
      [user.name, user.email, user.phone, user.id]
        .some(value => String(value || '').toLowerCase().includes(normalizedQuery))
    );
  };

  useEffect(() => {
    setClientSearchResults(searchUsers(clientSearchQuery));
  }, [clientSearchQuery, users]);

  useEffect(() => {
    const query = clientSearchQuery.trim();
    if (!query) {
      setRemoteClientSearchResults([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchAdminLeads(query, { limit: 20 })
        .then(suggestions => {
          if (active) setRemoteClientSearchResults(suggestions.map(s => s.lead).filter(Boolean));
        })
        .catch(() => { if (active) setRemoteClientSearchResults([]); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [clientSearchQuery]);

  const mergedClientSearchResults = useMemo(() => {
    const merged = [...remoteClientSearchResults, ...clientSearchResults];
    return merged.filter((user, index, rows) =>
      rows.findIndex(item => item.id === user.id) === index
    ).slice(0, 20);
  }, [remoteClientSearchResults, clientSearchResults]);

  const handleClientSearchSelect = (user) => {
    setClientSearchQuery(`${user.name || user.email || user.id} (${user.email || user.id})`);
    setClientSearchResults([]);
    setRemoteClientSearchResults([]);
  };

  // Modals
  const [isAssignAddressModalOpen, setIsAssignAddressModalOpen] = useState(false);
  const [isEditAddressModalOpen, setIsEditAddressModalOpen] = useState(false);
  const [isQrCodeModalOpen, setIsQrCodeModalOpen] = useState(false);
  const [isAuditTrailModalOpen, setIsAuditTrailModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [selectedAddressItem, setSelectedAddressItem] = useState(null);
  const [qrCodeAddress, setQrCodeAddress] = useState('');
  const [qrCodeAsset, setQrCodeAsset] = useState('');
  const [auditClientName, setAuditClientName] = useState('');

  // Only Active entries belong in the management view. Revoked (Deprecated)
  // and Blacklisted entries are kept in the database for the audit trail but
  // hidden here so the table reflects exactly what's in use right now -
  // otherwise revoking an address looks like a no-op and the "max 3 per
  // asset" rule appears to be broken by old/revoked rows.
  const activeGlobalAddresses = globalAddressData.filter(item => item.status === 'Active');
  const activeClientAddresses = clientAddressData.filter(item => item.status === 'Active');

  const filteredGlobalAddresses = activeGlobalAddresses.filter(item =>
    item.name.toLowerCase().includes(globalSearchQuery.toLowerCase()) ||
    item.asset.toLowerCase().includes(globalSearchQuery.toLowerCase())
  );

  const globalStartIndex = (globalCurrentPage - 1) * globalRowsPerPage;
  const globalPaginatedData = filteredGlobalAddresses.slice(globalStartIndex, globalStartIndex + globalRowsPerPage);

  const groupedByClient = activeClientAddresses.reduce((acc, assignment) => {
    if (!acc[assignment.clientEmail]) { acc[assignment.clientEmail] = { client: assignment.client, clientEmail: assignment.clientEmail, assignments: [] }; }
    acc[assignment.clientEmail].assignments.push(assignment);
    return acc;
  }, {});

  const filteredClients = Object.values(groupedByClient).filter(clientData =>
    (clientData.client.toLowerCase().includes(clientSearchQuery.toLowerCase()) || clientData.clientEmail.toLowerCase().includes(clientSearchQuery.toLowerCase())) &&
    clientData.assignments.some(a => (!assetFilter || a.asset === assetFilter) && (!statusFilter || a.status === statusFilter))
  );

  const clientStartIndex = (clientCurrentPage - 1) * clientRowsPerPage;
  const clientPaginatedClients = filteredClients.slice(clientStartIndex, clientStartIndex + clientRowsPerPage);

  // ---------------------------------------------------------------------
  // Mutation handlers - every change is persisted server-side first, then
  // the returned row (server is the source of truth) is patched into the
  // local state arrays so the table re-renders with the canonical data.
  // ---------------------------------------------------------------------

  const handleSaveAddress = async ({ mode, selectedClient, asset, network, addresses }) => {
    if (mode === 'universal') {
      // Each asset is allowed at most ONE active global row (which holds up
      // to 3 addresses). If one already exists, direct the admin to Edit
      // instead of letting them create a parallel row that would silently
      // bust the "max 3 addresses per asset" rule.
      const existing = globalAddressData.find(g => g.asset === asset && g.status === 'Active' && (g.network || null) === (network || null));
      if (existing) {
        showNotification(
          `A global ${asset} address set for the ${network || 'default'} network already exists. Use the Edit button on that row to change its addresses.`,
          'error'
        );
        return;
      }
      const assetInfo = cryptoData.find(a => a.ticker === asset);
      const assetName = assetInfo?.asset || asset;
      try {
        const entry = await createCryptoAddress({
          scope: 'global', asset, addresses, assetName, network,
        });
        if (entry) setGlobalAddressData(prev => [entry, ...prev]);
        logAdminAction('Admin', 'Add Global Address', `Added new global address for ${asset}`);
        showNotification('New global address set has been added.', 'success');
      } catch (err) {
        showNotification(err?.message || 'Failed to save global address.', 'error');
      }
    } else {
      const clientUser = users.find(u => u.id === selectedClient);
      if (!clientUser) {
        showNotification('Please select a valid client before saving.', 'error');
        return;
      }
      const existing = clientAddressData.find(c =>
        c.asset === asset && c.status === 'Active' &&
        (c.user_id === clientUser.id || c.clientEmail === clientUser.email) &&
        (c.network || null) === (network || null)
      );
      if (existing) {
        showNotification(
          `${clientUser.name} already has a ${asset} address set for the ${network || 'default'} network. Use the Edit button on that row to change its addresses.`,
          'error'
        );
        return;
      }
      try {
        const entry = await createCryptoAddress({
          scope: 'client', asset, addresses, userId: clientUser.id, network,
        });
        if (entry) setClientAddressData(prev => [entry, ...prev]);
        logAdminAction('Admin', 'Assign Client Address', `Assigned new address for ${asset} to ${clientUser.name}`);
        showNotification(`New client-specific address set for ${asset} has been added to ${clientUser.name}. Global addresses for other clients remain unchanged.`, 'success');
      } catch (err) {
        showNotification(err?.message || 'Failed to save client address.', 'error');
      }
    }
  };

  const handleBulkSave = async (rows) => {
    // Translate the modal's per-row shape into the API contract.
    const payload = rows.map(row => {
      const addresses = [row.address1, row.address2, row.address3].filter(Boolean);
      const assetName = cryptoData.find(c => c.ticker === row.asset)?.asset || row.asset;
      return row.type === 'universal'
        ? { scope: 'global', asset: row.asset, addresses, asset_name: assetName }
        : { scope: 'client', asset: row.asset, addresses, asset_name: assetName, email: row.email };
    });

    try {
      const { entries, imported } = await bulkImportCryptoAddresses(payload);
      const newGlobals = entries.filter(e => e.scope === 'global');
      const newClients = entries.filter(e => e.scope === 'client');
      if (newGlobals.length) setGlobalAddressData(prev => [...newGlobals, ...prev]);
      if (newClients.length) setClientAddressData(prev => [...newClients, ...prev]);
      logAdminAction('Admin', 'Bulk Upload Crypto Addresses',
        `Bulk-imported ${imported} address${imported !== 1 ? 'es' : ''}` +
        ` (${newGlobals.length} global / ${newClients.length} client)`);
      showNotification(`${imported} address${imported !== 1 ? 'es' : ''} imported successfully.`, 'success');
    } catch (err) {
      showNotification(err?.message || 'Bulk import failed.', 'error');
    }
  };

  const handleUpdateAddress = async (id, type, updatedAddresses, network) => {
    try {
      const entry = await updateCryptoAddress(id, { addresses: updatedAddresses, network });
      if (entry) {
        if (type === 'global') {
          setGlobalAddressData(prev => prev.map(it => (it.id === id ? entry : it)));
        } else {
          setClientAddressData(prev => prev.map(it => (it.id === id ? entry : it)));
        }
      }
      const label = type === 'global' ? 'Edit Global Address' : 'Edit Client Address';
      logAdminAction('Admin', label, `Updated address ${id}`);
      showNotification('Addresses have been updated.', 'success');
    } catch (err) {
      showNotification(err?.message || 'Failed to update addresses.', 'error');
    }
  };

  const handleRevokeAddress = async (id, type) => {
    const ok = await confirm({
      title: 'Revoke address?',
      message: 'Are you sure you want to revoke this address? It will be marked as deprecated and can no longer be used for deposits.',
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      // The server soft-deprecates the row (keeps it for the audit trail),
      // but in the management table we want it GONE - leaving it visible
      // with the same Edit/Revoke buttons made revoke look like a no-op.
      // We still patch the entry into local state with its new status so
      // anything else that filters by status sees the canonical value.
      const entry = await revokeCryptoAddress(id);
      if (type === 'global') {
        setGlobalAddressData(prev =>
          prev.map(it => (it.id === id ? (entry || { ...it, status: 'Deprecated' }) : it))
        );
      } else {
        setClientAddressData(prev =>
          prev.map(it => (it.id === id ? (entry || { ...it, status: 'Deprecated' }) : it))
        );
      }
      const label = type === 'global' ? 'Revoke Global Address' : 'Revoke Client Address';
      logAdminAction('Admin', label, `Revoked address ${id}`);
      showNotification('Address revoked. It is no longer available for deposits.', 'success');
    } catch (err) {
      showNotification(err?.message || 'Failed to revoke address.', 'error');
    }
  };

  const renderPaginationControls = (totalItems, currentPage, rowsPerPage, onPageChange) => {
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalItems);

    let pageButtons = [];
    for (let i = 1; i <= totalPages; i++) {
      pageButtons.push(
        <span
          key={i}
          className={`pagination-page ${i === currentPage ? 'aax-active' : ''}`}
          onClick={() => onPageChange(i)}
        >
          {i}
        </span>
      );
    }

    return (
      <div className="aax-pagination-container">
        <div>Showing {totalItems > 0 ? startIndex + 1 : 0} to {endIndex} of {totalItems} results</div>
        <div className="aax-pagination-controls">
          <button className="prev-page" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>Previous</button>
          {pageButtons}
          <button className="next-page" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}>Next</button>
        </div>
      </div>
    );
  };

  return (
    <div id="crypto-addresses-section" className="aax-admin-section">
      {confirmDialog}
      <div className="flex justify-between items-start aax-mb-6 flex-wrap gap-4">
        <div>
          <h3 className="aax-admin-section-header !p-0 !m-0 !border-0">Crypto Address Management</h3>
          <p className="text-sm text-text-secondary mt-1">Assign and manage deposit addresses for the global pool or specific clients.</p>
        </div>
        <div className="crypto-action-row">
          <button type="button" className="aax-btn-primary btn-lg" onClick={() => setIsAssignAddressModalOpen(true)}>
            <FontAwesomeIcon icon={faPlus} className="mr-2" />Add New Address
          </button>
          <button type="button" className="aax-btn-secondary btn-lg" id="bulk-upload-btn" onClick={() => setIsBulkUploadModalOpen(true)}>
            <FontAwesomeIcon icon={faUpload} className="mr-2" />Bulk Upload
          </button>
          <button type="button" className="aax-btn-secondary btn-lg" onClick={reloadAddresses} disabled={isLoadingAddresses}
            title="Refresh address book from server">
            <FontAwesomeIcon icon={faSync} className="mr-2" style={{ animation: isLoadingAddresses ? 'spin 1s linear infinite' : 'none' }} />
            {isLoadingAddresses ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="border-b border-border">
        <nav className="crypto-tab-group" id="crypto-tabs">
          <button type="button" className={`aax-crypto-tab ${activeTab === 'global-addresses-view' ? 'aax-active' : ''}`} onClick={() => setActiveTab('global-addresses-view')}>Global Pool</button>
          <button type="button" className={`aax-crypto-tab ${activeTab === 'client-assignments-view' ? 'aax-active' : ''}`} onClick={() => setActiveTab('client-assignments-view')}>Client Assignments</button>
        </nav>
      </div>
      <div id="crypto-tab-content" className="mt-6">
        {activeTab === 'global-addresses-view' && (
          <div id="global-addresses-view" className="aax-crypto-tab-pane">
            <div className="flex justify-end items-center aax-mb-4">
              <div className="aax-form-group min-w-[300px] mb-0">
                <input type="text" id="global-search-input" className="aax-form-input" placeholder="Search by asset name or ticker..." value={globalSearchQuery} onChange={(e) => setGlobalSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="aax-admin-table-container">
              <table className="aax-admin-table !min-w-[800px]">
                <thead>
                  <tr>
                    <th>Asset</th><th>Address 1</th><th>Address 2</th><th>Address 3</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="global-addresses-tbody">
                  {globalPaginatedData.length === 0 ? (
                    <tr className="aax-no-results-row"><td colSpan="6">No global addresses found.</td></tr>
                  ) : (
                    globalPaginatedData.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="aax-asset-cell">
                            <img src={assetLogos[item.asset]} alt={item.asset} className="aax-asset-logo" onError={(e) => { e.target.style.display='none'; }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span>{item.asset} - {item.name}</span>
                              <NetworkBadge network={item.network} />
                            </div>
                          </div>
                        </td>
                        {[...Array(3)].map((_, i) => (
                          <td key={i}>
                            <div className="aax-address-cell">
                              <span className="aax-address-text" title={item.addresses[i] || ''}>{formatAddress(item.addresses[i])}</span>
                              {item.addresses[i] && (
                                <div className="address-actions">
                                  <button type="button" className="aax-btn-small aax-btn-secondary btn-copy" onClick={() => navigator.clipboard.writeText(item.addresses[i]).then(() => showNotification('Copied!', 'success'))}>
                                    <FontAwesomeIcon icon={faCopy} className="mr-2" />Copy
                                  </button>
                                  <button type="button" className="aax-btn-small btn-info btn-qr" onClick={() => { setQrCodeAddress(item.addresses[i]); setQrCodeAsset(item.asset || ''); setIsQrCodeModalOpen(true); }}>
                                    <FontAwesomeIcon icon={faQrcode} className="mr-2" />View QR
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        ))}
                        <td><span className={`aax-status-badge status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                        <td>
                          <button className="aax-btn-small btn-edit" onClick={() => { setSelectedAddressItem({ ...item, type: 'global' }); setIsEditAddressModalOpen(true); }}>Edit</button>
                          <button className="aax-btn-small aax-btn-delete" onClick={() => handleRevokeAddress(item.id, 'global')}>Revoke</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {renderPaginationControls(filteredGlobalAddresses.length, globalCurrentPage, globalRowsPerPage, setGlobalCurrentPage)}
          </div>
        )}

        {activeTab === 'client-assignments-view' && (
          <div id="client-assignments-view" className="aax-crypto-tab-pane">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 aax-mb-4">
              <div className="aax-form-group mb-0 md:col-span-1">
                <div className="relative">
                  <input type="text" id="client-search-input" className="aax-form-input" placeholder="Search by client name/email..." value={clientSearchQuery} onChange={(e) => setClientSearchQuery(e.target.value)} />
                  {(mergedClientSearchResults.length > 0 || clientSearchQuery.trim().length > 0) && (
                    <div className="absolute z-[2100] w-full bg-gray-800 border border-gray-700 rounded-md mt-1 max-h-60 overflow-y-auto">
                      {mergedClientSearchResults.length > 0 ? mergedClientSearchResults.map(user => (
                        <div
                          key={user.id}
                          className="user-search-result-item"
                          onClick={() => handleClientSearchSelect(user)}
                        >
                          {user.name} ({user.email})
                        </div>
                      )) : (
                        <div className="user-search-result-item" style={{ color: '#8c9cb5', cursor: 'default' }}>
                          No clients found for "{clientSearchQuery.trim()}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="aax-form-group mb-0">
                <select id="asset-filter-select" className="aax-form-select" value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}>
                  <option value="">All Assets</option>
                  {cryptoData.map(c => (
                    <option key={c.id} value={c.ticker}>{c.asset} ({c.ticker})</option>
                  ))}
                </select>
              </div>
              <div className="aax-form-group mb-0">
                <select id="status-filter-select" className="aax-form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Deprecated">Deprecated</option>
                  <option value="Blacklisted">Blacklisted</option>
                </select>
              </div>
            </div>
            <div className="aax-admin-table-container">
              <table className="aax-admin-table !min-w-[800px]">
                <thead>
                  <tr>
                    <th className="w-8"></th><th>Client</th><th>Assigned Assets</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="client-assignments-tbody">
                  {clientPaginatedClients.length === 0 ? (
                    <tr className="aax-no-results-row"><td colSpan="4">No clients found.</td></tr>
                  ) : (
                    clientPaginatedClients.map(clientData => (
                      <React.Fragment key={clientData.clientEmail}>
                        <tr className="aax-client-row" onClick={(e) => e.currentTarget.classList.toggle('aax-expanded')}> {/* Toggle expanded class on click */}
                          <td><i className="fas fa-chevron-right aax-expand-icon"></i></td>
                          <td>{clientData.client}<br /><small className="text-tertiary">{clientData.clientEmail}</small></td>
                          <td>{clientData.assignments.length} Asset(s)</td>
                          <td><button className="aax-btn-small aax-btn-audit" onClick={(e) => { e.stopPropagation(); setAuditClientName(clientData.client); setIsAuditTrailModalOpen(true); }}>Audit Trail</button></td>
                        </tr>
                        <tr className="aax-sub-table-row">
                          <td colSpan="4">
                            <div className="aax-sub-table-container">
                              <h4 className="text-sm font-semibold mb-2 text-text-secondary">Addresses for {clientData.client}</h4>
                              <table className="aax-admin-table">
                                <thead><tr><th>Asset</th><th>Address 1</th><th>Address 2</th><th>Address 3</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                  {clientData.assignments.map(item => (
                                    <tr key={item.id}>
                                      <td>
                                        <div className="aax-asset-cell">
                                          <img src={assetLogos[item.asset]} alt={item.asset} className="aax-asset-logo" onError={(e) => { e.target.style.display='none'; }} />
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <span>{item.asset}</span>
                                            <NetworkBadge network={item.network} />
                                          </div>
                                        </div>
                                      </td>
                                      {[...Array(3)].map((_, i) => (
                                        <td key={i}>
                                          <div className="aax-address-cell">
                                            <span className="aax-address-text" title={item.addresses[i] || ''}>{formatAddress(item.addresses[i])}</span>
                                            {item.addresses[i] && (
                                              <div className="address-actions">
                                                <button type="button" className="aax-btn-small aax-btn-secondary btn-copy" onClick={() => navigator.clipboard.writeText(item.addresses[i]).then(() => showNotification('Copied!', 'success'))}>
                                                  <FontAwesomeIcon icon={faCopy} className="mr-2" />Copy
                                                </button>
                                                <button type="button" className="aax-btn-small btn-info btn-qr" onClick={() => { setQrCodeAddress(item.addresses[i]); setQrCodeAsset(item.asset || ''); setIsQrCodeModalOpen(true); }}>
                                                  <FontAwesomeIcon icon={faQrcode} className="mr-2" />View QR
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      ))}
                                      <td><span className={`aax-status-badge status-${item.status.toLowerCase()}`}>{item.status}</span></td>
                                      <td>
                                        <button className="aax-btn-small btn-edit" onClick={() => { setSelectedAddressItem({ ...item, type: 'client' }); setIsEditAddressModalOpen(true); }}>Edit</button>
                                        <button className="aax-btn-small aax-btn-delete" onClick={() => handleRevokeAddress(item.id, 'client')}>Revoke</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {renderPaginationControls(filteredClients.length, clientCurrentPage, clientRowsPerPage, setClientCurrentPage)}
          </div>
        )}
      </div>

      <AssignAddressModal
        isOpen={isAssignAddressModalOpen}
        onClose={() => setIsAssignAddressModalOpen(false)}
        onSaveAddress={handleSaveAddress}
        users={users}
        cryptoData={cryptoData}
        showNotification={showNotification}
      />

      {selectedAddressItem && (
        <EditAddressModal
          isOpen={isEditAddressModalOpen}
          onClose={() => setIsEditAddressModalOpen(false)}
          addressItem={selectedAddressItem}
          onUpdateAddress={handleUpdateAddress}
        />
      )}

      <QrCodeModal
        isOpen={isQrCodeModalOpen}
        onClose={() => setIsQrCodeModalOpen(false)}
        address={qrCodeAddress}
        asset={qrCodeAsset}
      />

      <AuditTrailModal
        isOpen={isAuditTrailModalOpen}
        onClose={() => setIsAuditTrailModalOpen(false)}
        clientName={auditClientName}
        cryptoAuditLog={cryptoAuditLog}
      />
      <BulkUploadModal
        isOpen={isBulkUploadModalOpen}
        onClose={() => setIsBulkUploadModalOpen(false)}
        onBulkSave={handleBulkSave}
        users={users}
        cryptoData={cryptoData}
      />
    </div>
  );
};

export default CryptoAddresses;
