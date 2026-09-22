import React, { useState, useContext, useEffect, useMemo, useRef } from 'react';
import { DataContext, NotificationContext } from '../../App';
import {
  DEFAULT_PLATFORM_SETTINGS,
  mergePlatformSettings,
  usePlatformSettings,
  saveSettingsToApi,
  fetchAdminSettings,
  fetchSettingsHistory,
} from '../../../platformDefaults';
import { getAdminToken } from '../../adminApi';
import { cryptoData as ALL_CRYPTO } from '../../data/data';

const staffRoles = ['Super Admin', 'Office Manager', 'Team Leader', 'Agent'];

const SettingCard = ({ title, description, children, accent }) => (
  <section className="aax-settings-card" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
    <div className="aax-settings-card-header">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
    {children}
  </section>
);

const Field = ({ label, hint, children, wide = false, disabled = false }) => (
  <div className={`aax-settings-field ${wide ? 'aax-settings-field-wide' : ''}`} style={disabled ? { opacity: 0.55 } : undefined}>
    <label>{label}</label>
    {children}
    {hint && <small>{hint}</small>}
  </div>
);

const ToggleField = ({ label, hint, id, name, checked, onChange }) => (
  <div className="aax-settings-toggle-row">
    <div>
      <label htmlFor={id}>{label}</label>
      {hint && <small>{hint}</small>}
    </div>
    <input type="checkbox" id={id} name={name} checked={checked} onChange={onChange} />
  </div>
);

// Curated brand palettes - applied as a single click to all six color fields.
const COLOR_PRESETS = [
  {
    id: 'binance-gold',
    name: 'Binance Gold',
    primaryColor: '#F0B90B',
    secondaryColor: '#1E2026',
    accentColor: '#F0B90B',
    buttonColor: '#FCD535',
    backgroundColor: '#0B0E11',
    textColor: '#EAECEF',
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    primaryColor: '#4A8DFF',
    secondaryColor: '#1A2238',
    accentColor: '#5B9BFF',
    buttonColor: '#3B7BEE',
    backgroundColor: '#0A1128',
    textColor: '#EAF1FF',
  },
  {
    id: 'forest-green',
    name: 'Forest Green',
    primaryColor: '#0ECB81',
    secondaryColor: '#13261C',
    accentColor: '#22D195',
    buttonColor: '#0ECB81',
    backgroundColor: '#0A1A12',
    textColor: '#E6F7EE',
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    primaryColor: '#9B5CFF',
    secondaryColor: '#1F1530',
    accentColor: '#B985FF',
    buttonColor: '#8B3FFF',
    backgroundColor: '#0E0A1F',
    textColor: '#F1EAFF',
  },
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    primaryColor: '#E8B4B8',
    secondaryColor: '#2A1F22',
    accentColor: '#F4C2C2',
    buttonColor: '#D4A5A5',
    backgroundColor: '#1A0F12',
    textColor: '#FBEAEC',
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    primaryColor: '#00F0FF',
    secondaryColor: '#1A0033',
    accentColor: '#FF00E5',
    buttonColor: '#00F0FF',
    backgroundColor: '#08001A',
    textColor: '#E0F7FF',
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    primaryColor: '#FF6B6B',
    secondaryColor: '#2A1418',
    accentColor: '#FFA94D',
    buttonColor: '#FF6B6B',
    backgroundColor: '#1A0A0E',
    textColor: '#FFF1ED',
  },
  {
    id: 'arctic-aurora',
    name: 'Arctic Aurora',
    primaryColor: '#7DF9FF',
    secondaryColor: '#0F1F33',
    accentColor: '#A0E7E5',
    buttonColor: '#5DC9D9',
    backgroundColor: '#06121F',
    textColor: '#E8FAFD',
  },
  {
    id: 'crimson-onyx',
    name: 'Crimson Onyx',
    primaryColor: '#DC143C',
    secondaryColor: '#1A0508',
    accentColor: '#FF4B5C',
    buttonColor: '#C9082A',
    backgroundColor: '#0A0205',
    textColor: '#FFEAEE',
  },
  {
    id: 'champagne-noir',
    name: 'Champagne Noir',
    primaryColor: '#D4AF37',
    secondaryColor: '#1A1A1A',
    accentColor: '#E5C158',
    buttonColor: '#BF9D2A',
    backgroundColor: '#080808',
    textColor: '#F5EFD9',
  },
  {
    id: 'sage-mint',
    name: 'Sage Mint',
    primaryColor: '#88D8B0',
    secondaryColor: '#1A2620',
    accentColor: '#A8E6CF',
    buttonColor: '#5FBF8A',
    backgroundColor: '#0A1612',
    textColor: '#EAF7F0',
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    primaryColor: '#6C5CE7',
    secondaryColor: '#181229',
    accentColor: '#A29BFE',
    buttonColor: '#6C5CE7',
    backgroundColor: '#070414',
    textColor: '#EFEBFF',
  },
  {
    id: 'electric-lime',
    name: 'Electric Lime',
    primaryColor: '#C6FF00',
    secondaryColor: '#1A2300',
    accentColor: '#AEEA00',
    buttonColor: '#C6FF00',
    backgroundColor: '#0B1100',
    textColor: '#F4FFD6',
  },
  {
    id: 'tangerine-dream',
    name: 'Tangerine Dream',
    primaryColor: '#FF8C42',
    secondaryColor: '#2A1810',
    accentColor: '#FFB570',
    buttonColor: '#FF7029',
    backgroundColor: '#1A0E07',
    textColor: '#FFF0E2',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    primaryColor: '#26C6DA',
    secondaryColor: '#0E2A30',
    accentColor: '#4DD0E1',
    buttonColor: '#00ACC1',
    backgroundColor: '#06181C',
    textColor: '#E2F7FA',
  },
  {
    id: 'pearl-light',
    name: 'Pearl (Light)',
    primaryColor: '#1F2937',
    secondaryColor: '#E5E7EB',
    accentColor: '#3B82F6',
    buttonColor: '#1F2937',
    backgroundColor: '#F9FAFB',
    textColor: '#0F172A',
  },
  {
    id: 'tidio-light',
    name: 'Tidio (Light)',
    primaryColor: '#0066FF',
    secondaryColor: '#F1F4F8',
    accentColor: '#00A3FF',
    buttonColor: '#0066FF',
    backgroundColor: '#FFFFFF',
    textColor: '#0B1F3A',
  },
  {
    id: 'discord-light',
    name: 'Discord (Light)',
    primaryColor: '#5865F2',
    secondaryColor: '#EBEDEF',
    accentColor: '#404EED',
    buttonColor: '#5865F2',
    backgroundColor: '#FFFFFF',
    textColor: '#060607',
  },
  {
    id: 'stripe-light',
    name: 'Stripe (Light)',
    primaryColor: '#635BFF',
    secondaryColor: '#F6F9FC',
    accentColor: '#00D4FF',
    buttonColor: '#635BFF',
    backgroundColor: '#FFFFFF',
    textColor: '#0A2540',
  },
  {
    id: 'cleo-light',
    name: 'Cleo (Light)',
    primaryColor: '#FF2E63',
    secondaryColor: '#FFFFFF',
    accentColor: '#B946FF',
    buttonColor: '#FF2E63',
    backgroundColor: '#FFF5F8',
    textColor: '#1A0F1F',
  },
  {
    id: 'replit-light',
    name: 'Replit (Light)',
    primaryColor: '#F26207',
    secondaryColor: '#F0EBE3',
    accentColor: '#FF6B35',
    buttonColor: '#F26207',
    backgroundColor: '#FCFAF6',
    textColor: '#1A1A1A',
  },
  {
    id: 'violet-mist-light',
    name: 'Violet Mist (Light)',
    primaryColor: '#7C3AED',
    secondaryColor: '#F3F0FF',
    accentColor: '#A78BFA',
    buttonColor: '#7C3AED',
    backgroundColor: '#FAF8FF',
    textColor: '#1E1B3A',
  },
  {
    id: 'lavender-bloom-light',
    name: 'Lavender Bloom (Light)',
    primaryColor: '#8B5CF6',
    secondaryColor: '#EDE9FE',
    accentColor: '#C4B5FD',
    buttonColor: '#7C3AED',
    backgroundColor: '#FFFFFF',
    textColor: '#2E1065',
  },
  {
    id: 'sky-blue-light',
    name: 'Sky Blue (Light)',
    primaryColor: '#2563EB',
    secondaryColor: '#EFF6FF',
    accentColor: '#3B82F6',
    buttonColor: '#2563EB',
    backgroundColor: '#F8FAFC',
    textColor: '#0F172A',
  },
  {
    id: 'azure-light',
    name: 'Azure (Light)',
    primaryColor: '#0EA5E9',
    secondaryColor: '#E0F2FE',
    accentColor: '#38BDF8',
    buttonColor: '#0284C7',
    backgroundColor: '#FFFFFF',
    textColor: '#0C4A6E',
  },
  {
    id: 'mint-garden-light',
    name: 'Mint Garden (Light)',
    primaryColor: '#10B981',
    secondaryColor: '#ECFDF5',
    accentColor: '#34D399',
    buttonColor: '#059669',
    backgroundColor: '#F0FDF4',
    textColor: '#064E3B',
  },
  {
    id: 'sage-light',
    name: 'Sage (Light)',
    primaryColor: '#16A34A',
    secondaryColor: '#F0FDF4',
    accentColor: '#4ADE80',
    buttonColor: '#16A34A',
    backgroundColor: '#FFFFFF',
    textColor: '#14532D',
  },

  // ── Banking App Themes (Light) ──────────────────────────────────────────
  {
    id: 'swiss-banking-light',
    name: 'Swiss Banking (Light)',
    primaryColor: '#1A2C52',
    secondaryColor: '#EEF0F5',
    accentColor: '#C9A84C',
    buttonColor: '#1A2C52',
    backgroundColor: '#F7F8FA',
    textColor: '#0D1A35',
  },
  {
    id: 'morgan-elite-light',
    name: 'Morgan Elite (Light)',
    primaryColor: '#2C2C3A',
    secondaryColor: '#F5F3EE',
    accentColor: '#B8975A',
    buttonColor: '#2C2C3A',
    backgroundColor: '#FDFBF7',
    textColor: '#18181F',
  },
  {
    id: 'private-wealth-light',
    name: 'Private Wealth (Light)',
    primaryColor: '#6B1A2C',
    secondaryColor: '#F5EEF0',
    accentColor: '#A0304A',
    buttonColor: '#6B1A2C',
    backgroundColor: '#FDF8F9',
    textColor: '#280A12',
  },
  {
    id: 'barclays-blue-light',
    name: 'Barclays Blue (Light)',
    primaryColor: '#00395D',
    secondaryColor: '#E8F0F7',
    accentColor: '#0070B8',
    buttonColor: '#00395D',
    backgroundColor: '#F4F8FB',
    textColor: '#001E35',
  },
  {
    id: 'deutsche-silver-light',
    name: 'Deutsche Silver (Light)',
    primaryColor: '#3A3D42',
    secondaryColor: '#EDEEEF',
    accentColor: '#7A8290',
    buttonColor: '#3A3D42',
    backgroundColor: '#F8F9FA',
    textColor: '#1A1C1F',
  },
  {
    id: 'prestige-ivory-light',
    name: 'Prestige Ivory (Light)',
    primaryColor: '#3D2B1F',
    secondaryColor: '#F5EFE8',
    accentColor: '#C4913A',
    buttonColor: '#3D2B1F',
    backgroundColor: '#FFFDF8',
    textColor: '#1C1208',
  },
  {
    id: 'nordic-trust-light',
    name: 'Nordic Trust (Light)',
    primaryColor: '#1B4F72',
    secondaryColor: '#E3EEF7',
    accentColor: '#2E86C1',
    buttonColor: '#1B4F72',
    backgroundColor: '#F0F6FB',
    textColor: '#0A2340',
  },
  {
    id: 'commonwealth-light',
    name: 'Commonwealth (Light)',
    primaryColor: '#004225',
    secondaryColor: '#E6F3EC',
    accentColor: '#00843D',
    buttonColor: '#004225',
    backgroundColor: '#F2FAF5',
    textColor: '#001A0F',
  },
  {
    id: 'equity-rose-light',
    name: 'Equity Rose (Light)',
    primaryColor: '#8B1A4A',
    secondaryColor: '#F7EBF1',
    accentColor: '#C7436F',
    buttonColor: '#8B1A4A',
    backgroundColor: '#FDF5F8',
    textColor: '#3D0620',
  },
  {
    id: 'silver-lining-light',
    name: 'Silver Lining (Light)',
    primaryColor: '#4A5568',
    secondaryColor: '#EDF2F7',
    accentColor: '#718096',
    buttonColor: '#4A5568',
    backgroundColor: '#F7FAFC',
    textColor: '#1A202C',
  },

  // ── Banking App Themes (Dark) ───────────────────────────────────────────
  {
    id: 'vault-black',
    name: 'Vault Black',
    primaryColor: '#C9A84C',
    secondaryColor: '#1A1A1A',
    accentColor: '#E8C96B',
    buttonColor: '#B8973B',
    backgroundColor: '#050505',
    textColor: '#F5EDD5',
  },
  {
    id: 'iron-reserve',
    name: 'Iron Reserve',
    primaryColor: '#A0AEC0',
    secondaryColor: '#1C2030',
    accentColor: '#CBD5E0',
    buttonColor: '#718096',
    backgroundColor: '#0D1117',
    textColor: '#EDF2F7',
  },
  {
    id: 'sapphire-vault',
    name: 'Sapphire Vault',
    primaryColor: '#1E4D8C',
    secondaryColor: '#0F1E35',
    accentColor: '#C9A84C',
    buttonColor: '#2563A8',
    backgroundColor: '#070F1E',
    textColor: '#E8F0FA',
  },
  {
    id: 'onyx-platinum',
    name: 'Onyx Platinum',
    primaryColor: '#E2E8F0',
    secondaryColor: '#1A1A2E',
    accentColor: '#A0AEC0',
    buttonColor: '#CBD5E0',
    backgroundColor: '#0A0A15',
    textColor: '#F7FAFC',
  },
  {
    id: 'bronze-ledger',
    name: 'Bronze Ledger',
    primaryColor: '#CD7F32',
    secondaryColor: '#1C130A',
    accentColor: '#E8A05A',
    buttonColor: '#B8671F',
    backgroundColor: '#0D0805',
    textColor: '#F9EED8',
  },
  {
    id: 'premier-noir',
    name: 'Premier Noir',
    primaryColor: '#D4C5A9',
    secondaryColor: '#181818',
    accentColor: '#EAD9B8',
    buttonColor: '#C0AE90',
    backgroundColor: '#080808',
    textColor: '#F5F0E8',
  },
  {
    id: 'cobalt-trust',
    name: 'Cobalt Trust',
    primaryColor: '#1E6FBF',
    secondaryColor: '#0A1929',
    accentColor: '#3A9EE8',
    buttonColor: '#155FA0',
    backgroundColor: '#04101C',
    textColor: '#E8F4FF',
  },
  {
    id: 'smoke-steel',
    name: 'Smoke & Steel',
    primaryColor: '#7C8DA6',
    secondaryColor: '#151C25',
    accentColor: '#A0B4CC',
    buttonColor: '#5A7090',
    backgroundColor: '#0A0F18',
    textColor: '#DCE8F5',
  },
  {
    id: 'bullion-dark',
    name: 'Bullion Dark',
    primaryColor: '#D4AF37',
    secondaryColor: '#1A1500',
    accentColor: '#F0CC55',
    buttonColor: '#B8960A',
    backgroundColor: '#0C0A00',
    textColor: '#FFF8D0',
  },
  {
    id: 'obsidian-banker',
    name: 'Obsidian Banker',
    primaryColor: '#B0BEC5',
    secondaryColor: '#111518',
    accentColor: '#CFD8DC',
    buttonColor: '#78909C',
    backgroundColor: '#070A0C',
    textColor: '#ECEFF1',
  },

  // ── Crypto Wallet Themes (Dark) ─────────────────────────────────────────
  {
    id: 'bitcoin-orange',
    name: 'Bitcoin Orange',
    primaryColor: '#F7931A',
    secondaryColor: '#1A0F00',
    accentColor: '#FFAB40',
    buttonColor: '#E07B10',
    backgroundColor: '#0C0700',
    textColor: '#FFF4E0',
  },
  {
    id: 'ethereum-violet',
    name: 'Ethereum Violet',
    primaryColor: '#627EEA',
    secondaryColor: '#110E28',
    accentColor: '#8FA4F5',
    buttonColor: '#4D6BE0',
    backgroundColor: '#09081A',
    textColor: '#E8EEFF',
  },
  {
    id: 'solana-wave',
    name: 'Solana Wave',
    primaryColor: '#14F195',
    secondaryColor: '#130D2A',
    accentColor: '#9945FF',
    buttonColor: '#00D68F',
    backgroundColor: '#0A0618',
    textColor: '#E0FFF5',
  },
  {
    id: 'avalanche-peak',
    name: 'Avalanche Peak',
    primaryColor: '#E84142',
    secondaryColor: '#1F0A0A',
    accentColor: '#FF6B6B',
    buttonColor: '#C83030',
    backgroundColor: '#120505',
    textColor: '#FFE8E8',
  },
  {
    id: 'polkadot-magenta',
    name: 'Polkadot Magenta',
    primaryColor: '#E6007A',
    secondaryColor: '#200016',
    accentColor: '#FF4DB3',
    buttonColor: '#C4006A',
    backgroundColor: '#12000D',
    textColor: '#FFE0F2',
  },
  {
    id: 'cosmos-indigo',
    name: 'Cosmos Indigo',
    primaryColor: '#2E4DA7',
    secondaryColor: '#0C1029',
    accentColor: '#6D83D9',
    buttonColor: '#243D8F',
    backgroundColor: '#060817',
    textColor: '#E0E8FF',
  },
  {
    id: 'chainlink-azure',
    name: 'Chainlink Azure',
    primaryColor: '#375BD2',
    secondaryColor: '#080F28',
    accentColor: '#6B8FFF',
    buttonColor: '#2A4ABF',
    backgroundColor: '#040A18',
    textColor: '#E5EDFF',
  },
  {
    id: 'uniswap-orchid',
    name: 'Uniswap Orchid',
    primaryColor: '#FF007A',
    secondaryColor: '#1F0015',
    accentColor: '#FF6BB3',
    buttonColor: '#D4006A',
    backgroundColor: '#12000D',
    textColor: '#FFE0F0',
  },
  {
    id: 'phantom-dusk',
    name: 'Phantom Dusk',
    primaryColor: '#AB9FF2',
    secondaryColor: '#130F22',
    accentColor: '#C8C0FF',
    buttonColor: '#8B7FE0',
    backgroundColor: '#0A0818',
    textColor: '#EDE8FF',
  },
  {
    id: 'kraken-storm',
    name: 'Kraken Storm',
    primaryColor: '#5741D9',
    secondaryColor: '#0E0C20',
    accentColor: '#8B78FF',
    buttonColor: '#4530C0',
    backgroundColor: '#070614',
    textColor: '#E8E4FF',
  },

  // ── Crypto Wallet Themes (Light) ────────────────────────────────────────
  {
    id: 'bitcoin-light',
    name: 'Bitcoin (Light)',
    primaryColor: '#F7931A',
    secondaryColor: '#FDF0E0',
    accentColor: '#E07B10',
    buttonColor: '#F7931A',
    backgroundColor: '#FFFAF4',
    textColor: '#2C1A00',
  },
  {
    id: 'defi-spring-light',
    name: 'DeFi Spring (Light)',
    primaryColor: '#0D9488',
    secondaryColor: '#E6FAF8',
    accentColor: '#14B8A6',
    buttonColor: '#0F766E',
    backgroundColor: '#F0FDFB',
    textColor: '#0D3330',
  },
  {
    id: 'web3-clean-light',
    name: 'Web3 Clean (Light)',
    primaryColor: '#4338CA',
    secondaryColor: '#EEF2FF',
    accentColor: '#6366F1',
    buttonColor: '#3730A3',
    backgroundColor: '#F8F8FF',
    textColor: '#1E1B4B',
  },
  {
    id: 'nft-gallery-light',
    name: 'NFT Gallery (Light)',
    primaryColor: '#DB2777',
    secondaryColor: '#FCE7F3',
    accentColor: '#EC4899',
    buttonColor: '#BE185D',
    backgroundColor: '#FFF5FA',
    textColor: '#500724',
  },
  {
    id: 'trust-white-light',
    name: 'Trust White (Light)',
    primaryColor: '#1A73E8',
    secondaryColor: '#E8F0FE',
    accentColor: '#4A90E2',
    buttonColor: '#1557B0',
    backgroundColor: '#FFFFFF',
    textColor: '#1A237E',
  },

  // ── Trading App Themes (Dark) ───────────────────────────────────────────
  {
    id: 'bull-market',
    name: 'Bull Market',
    primaryColor: '#00C853',
    secondaryColor: '#071A0F',
    accentColor: '#69F0AE',
    buttonColor: '#00A846',
    backgroundColor: '#030D07',
    textColor: '#E0FFF0',
  },
  {
    id: 'bear-trap',
    name: 'Bear Trap',
    primaryColor: '#FF1744',
    secondaryColor: '#1A0508',
    accentColor: '#FF5252',
    buttonColor: '#D50032',
    backgroundColor: '#0D0205',
    textColor: '#FFE6EA',
  },
  {
    id: 'options-desk',
    name: 'Options Desk',
    primaryColor: '#FFB300',
    secondaryColor: '#1A1200',
    accentColor: '#FFD54F',
    buttonColor: '#E5A200',
    backgroundColor: '#0C0900',
    textColor: '#FFF8E1',
  },
  {
    id: 'quant-terminal',
    name: 'Quant Terminal',
    primaryColor: '#00FF41',
    secondaryColor: '#001A00',
    accentColor: '#39FF14',
    buttonColor: '#00CC35',
    backgroundColor: '#000A00',
    textColor: '#CCFFCC',
  },
  {
    id: 'algo-trader',
    name: 'Algo Trader',
    primaryColor: '#00E5FF',
    secondaryColor: '#001520',
    accentColor: '#40C4FF',
    buttonColor: '#00B0D4',
    backgroundColor: '#000D18',
    textColor: '#E0F8FF',
  },
  {
    id: 'forex-pro',
    name: 'Forex Pro',
    primaryColor: '#FFD600',
    secondaryColor: '#0F1525',
    accentColor: '#FFEA00',
    buttonColor: '#ECC200',
    backgroundColor: '#060D18',
    textColor: '#FFFDE7',
  },
  {
    id: 'futures-slate',
    name: 'Futures Slate',
    primaryColor: '#F9A825',
    secondaryColor: '#121212',
    accentColor: '#FDD835',
    buttonColor: '#E09000',
    backgroundColor: '#080808',
    textColor: '#FFFDE7',
  },
  {
    id: 'bloomberg-night',
    name: 'Bloomberg Night',
    primaryColor: '#FF6D00',
    secondaryColor: '#131313',
    accentColor: '#FF9E40',
    buttonColor: '#E56200',
    backgroundColor: '#080808',
    textColor: '#FFF3E0',
  },
  {
    id: 'derivatives-dark',
    name: 'Derivatives Dark',
    primaryColor: '#2979FF',
    secondaryColor: '#0A0E1F',
    accentColor: '#82B1FF',
    buttonColor: '#2962FF',
    backgroundColor: '#04081A',
    textColor: '#E8EEFF',
  },
  {
    id: 'short-squeeze',
    name: 'Short Squeeze',
    primaryColor: '#FF4081',
    secondaryColor: '#1A0515',
    accentColor: '#FF80AB',
    buttonColor: '#F50057',
    backgroundColor: '#0D0210',
    textColor: '#FFE6F2',
  },

  // ── Trading App Themes (Light) ──────────────────────────────────────────
  {
    id: 'market-open-light',
    name: 'Market Open (Light)',
    primaryColor: '#1565C0',
    secondaryColor: '#E3F2FD',
    accentColor: '#F9A825',
    buttonColor: '#1565C0',
    backgroundColor: '#F8FAFF',
    textColor: '#0D1B3E',
  },
  {
    id: 'bull-run-light',
    name: 'Bull Run (Light)',
    primaryColor: '#2E7D32',
    secondaryColor: '#E8F5E9',
    accentColor: '#43A047',
    buttonColor: '#1B5E20',
    backgroundColor: '#F1FDF2',
    textColor: '#0A2E0A',
  },
  {
    id: 'analyst-white-light',
    name: 'Analyst White (Light)',
    primaryColor: '#0D47A1',
    secondaryColor: '#EFF3FB',
    accentColor: '#F57C00',
    buttonColor: '#0D47A1',
    backgroundColor: '#FAFCFF',
    textColor: '#041A4A',
  },
  {
    id: 'robinhood-green-light',
    name: 'Robinhood Green (Light)',
    primaryColor: '#00C805',
    secondaryColor: '#E6FFE7',
    accentColor: '#00A804',
    buttonColor: '#009C03',
    backgroundColor: '#FFFFFF',
    textColor: '#001A00',
  },
  {
    id: 'charting-pro-light',
    name: 'Charting Pro (Light)',
    primaryColor: '#00897B',
    secondaryColor: '#E0F2F1',
    accentColor: '#26A69A',
    buttonColor: '#00796B',
    backgroundColor: '#F5FDFC',
    textColor: '#00332E',
  },

  // ── Gradient-Accent Themes (Dark) ──────────────────────────────────────
  {
    id: 'nebula-drift',
    name: 'Nebula Drift',
    primaryColor: '#8B5CF6',
    secondaryColor: '#0F0B25',
    accentColor: '#06B6D4',
    buttonColor: '#7C3AED',
    backgroundColor: '#060318',
    textColor: '#EDE9FE',
  },
  {
    id: 'plasma-surge',
    name: 'Plasma Surge',
    primaryColor: '#FF0090',
    secondaryColor: '#150025',
    accentColor: '#00F0FF',
    buttonColor: '#CC0078',
    backgroundColor: '#0A0018',
    textColor: '#FFE0F8',
  },
  {
    id: 'galactic-storm',
    name: 'Galactic Storm',
    primaryColor: '#3A86FF',
    secondaryColor: '#06091E',
    accentColor: '#8338EC',
    buttonColor: '#2E6AE0',
    backgroundColor: '#030613',
    textColor: '#E0EAFF',
  },
  {
    id: 'lava-flow',
    name: 'Lava Flow',
    primaryColor: '#FF4500',
    secondaryColor: '#180A00',
    accentColor: '#FF8C00',
    buttonColor: '#E03D00',
    backgroundColor: '#0C0400',
    textColor: '#FFF0E0',
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    primaryColor: '#00FFA3',
    secondaryColor: '#07101E',
    accentColor: '#7B2FFF',
    buttonColor: '#00CC85',
    backgroundColor: '#030C16',
    textColor: '#E0FFF5',
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    primaryColor: '#FF9500',
    secondaryColor: '#1A0D00',
    accentColor: '#FF2D00',
    buttonColor: '#E08000',
    backgroundColor: '#0C0700',
    textColor: '#FFF5E0',
  },
  {
    id: 'prism-dark',
    name: 'Prism Dark',
    primaryColor: '#FF6EC7',
    secondaryColor: '#12001E',
    accentColor: '#5CE1E6',
    buttonColor: '#E060B0',
    backgroundColor: '#08001A',
    textColor: '#FFF0FF',
  },
  {
    id: 'vortex-dark',
    name: 'Vortex Dark',
    primaryColor: '#00D2FF',
    secondaryColor: '#00121A',
    accentColor: '#00FF87',
    buttonColor: '#00B0D8',
    backgroundColor: '#000C14',
    textColor: '#E0FAFF',
  },
  {
    id: 'cosmic-dust',
    name: 'Cosmic Dust',
    primaryColor: '#9D4EDD',
    secondaryColor: '#100820',
    accentColor: '#C77DFF',
    buttonColor: '#7B2FBE',
    backgroundColor: '#080016',
    textColor: '#EEE0FF',
  },
  {
    id: 'thunderbolt',
    name: 'Thunderbolt',
    primaryColor: '#FFEA00',
    secondaryColor: '#0A0A00',
    accentColor: '#00BFFF',
    buttonColor: '#E0D000',
    backgroundColor: '#050500',
    textColor: '#FFFDE0',
  },

  // ── Gradient-Accent Themes (Light) ─────────────────────────────────────
  {
    id: 'sunrise-peach-light',
    name: 'Sunrise Peach (Light)',
    primaryColor: '#F97316',
    secondaryColor: '#FEF3E8',
    accentColor: '#EC4899',
    buttonColor: '#EA6B10',
    backgroundColor: '#FFFAF5',
    textColor: '#3A1500',
  },
  {
    id: 'cotton-candy-light',
    name: 'Cotton Candy (Light)',
    primaryColor: '#EC4899',
    secondaryColor: '#FDF2F8',
    accentColor: '#A855F7',
    buttonColor: '#DB2777',
    backgroundColor: '#FFF7FD',
    textColor: '#4A0E30',
  },
  {
    id: 'sea-glass-light',
    name: 'Sea Glass (Light)',
    primaryColor: '#0D9488',
    secondaryColor: '#ECFDF5',
    accentColor: '#6366F1',
    buttonColor: '#0F766E',
    backgroundColor: '#F0FFFE',
    textColor: '#0A2E2A',
  },
  {
    id: 'bluebell-light',
    name: 'Bluebell (Light)',
    primaryColor: '#6366F1',
    secondaryColor: '#EEF2FF',
    accentColor: '#818CF8',
    buttonColor: '#4F46E5',
    backgroundColor: '#F5F7FF',
    textColor: '#1E1B4B',
  },
  {
    id: 'sherbet-light',
    name: 'Sherbet (Light)',
    primaryColor: '#F59E0B',
    secondaryColor: '#FFFBEB',
    accentColor: '#EC4899',
    buttonColor: '#D97706',
    backgroundColor: '#FFFCF5',
    textColor: '#451A03',
  },

  // ── Neon / Bold Accent Themes (Dark) ───────────────────────────────────
  {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    primaryColor: '#39FF14',
    secondaryColor: '#050F00',
    accentColor: '#00FFFF',
    buttonColor: '#30E010',
    backgroundColor: '#020800',
    textColor: '#E0FFE0',
  },
  {
    id: 'hot-magenta',
    name: 'Hot Magenta',
    primaryColor: '#FF00C8',
    secondaryColor: '#180020',
    accentColor: '#FF80E0',
    buttonColor: '#CC00A0',
    backgroundColor: '#0F0016',
    textColor: '#FFE0FF',
  },
  {
    id: 'volt-rush',
    name: 'Volt Rush',
    primaryColor: '#CCFF00',
    secondaryColor: '#131A00',
    accentColor: '#EEFF00',
    buttonColor: '#A8D500',
    backgroundColor: '#0A1000',
    textColor: '#F8FFD0',
  },
  {
    id: 'cobalt-strike',
    name: 'Cobalt Strike',
    primaryColor: '#0047AB',
    secondaryColor: '#00061F',
    accentColor: '#4D9DE0',
    buttonColor: '#003A8C',
    backgroundColor: '#000414',
    textColor: '#DDEEFF',
  },
  {
    id: 'acid-rain',
    name: 'Acid Rain',
    primaryColor: '#ADFF2F',
    secondaryColor: '#0A1400',
    accentColor: '#FFEE00',
    buttonColor: '#8FD400',
    backgroundColor: '#050A00',
    textColor: '#F0FFD0',
  },
  {
    id: 'vermillion-dark',
    name: 'Vermillion Dark',
    primaryColor: '#FF4136',
    secondaryColor: '#1A0800',
    accentColor: '#FF7366',
    buttonColor: '#E03020',
    backgroundColor: '#0C0400',
    textColor: '#FFE8E6',
  },
  {
    id: 'malachite-dark',
    name: 'Malachite Dark',
    primaryColor: '#00A86B',
    secondaryColor: '#001A0E',
    accentColor: '#00FF9D',
    buttonColor: '#008A58',
    backgroundColor: '#000D07',
    textColor: '#E0FFF5',
  },
  {
    id: 'cerulean-edge',
    name: 'Cerulean Edge',
    primaryColor: '#007BA7',
    secondaryColor: '#001520',
    accentColor: '#00CED1',
    buttonColor: '#006590',
    backgroundColor: '#000D18',
    textColor: '#E0F8FF',
  },
  {
    id: 'saffron-dark',
    name: 'Saffron Dark',
    primaryColor: '#FF9200',
    secondaryColor: '#1A0E00',
    accentColor: '#FFB833',
    buttonColor: '#D97800',
    backgroundColor: '#0D0700',
    textColor: '#FFF5D6',
  },
  {
    id: 'jade-emperor',
    name: 'Jade Emperor',
    primaryColor: '#00A550',
    secondaryColor: '#001811',
    accentColor: '#00D066',
    buttonColor: '#008840',
    backgroundColor: '#00100A',
    textColor: '#DDFFF0',
  },

  // ── Bold Accent Themes (Light) ──────────────────────────────────────────
  {
    id: 'citrus-punch-light',
    name: 'Citrus Punch (Light)',
    primaryColor: '#EA580C',
    secondaryColor: '#FFF1E6',
    accentColor: '#FACC15',
    buttonColor: '#C2410C',
    backgroundColor: '#FFFCF5',
    textColor: '#431407',
  },
  {
    id: 'coral-reef-light',
    name: 'Coral Reef (Light)',
    primaryColor: '#EF4444',
    secondaryColor: '#FEF2F2',
    accentColor: '#F97316',
    buttonColor: '#DC2626',
    backgroundColor: '#FFF8F8',
    textColor: '#450A0A',
  },
  {
    id: 'turquoise-pop-light',
    name: 'Turquoise Pop (Light)',
    primaryColor: '#0891B2',
    secondaryColor: '#ECFEFF',
    accentColor: '#06B6D4',
    buttonColor: '#0E7490',
    backgroundColor: '#F0FFFF',
    textColor: '#083344',
  },
  {
    id: 'fuchsia-flash-light',
    name: 'Fuchsia Flash (Light)',
    primaryColor: '#C026D3',
    secondaryColor: '#FDF4FF',
    accentColor: '#E879F9',
    buttonColor: '#A21CAF',
    backgroundColor: '#FFF5FF',
    textColor: '#4A044E',
  },
  {
    id: 'amber-glow-light',
    name: 'Amber Glow (Light)',
    primaryColor: '#D97706',
    secondaryColor: '#FFFBEB',
    accentColor: '#F59E0B',
    buttonColor: '#B45309',
    backgroundColor: '#FFFDF5',
    textColor: '#451A03',
  },
  {
    id: 'emerald-cut-light',
    name: 'Emerald Cut (Light)',
    primaryColor: '#059669',
    secondaryColor: '#ECFDF5',
    accentColor: '#10B981',
    buttonColor: '#047857',
    backgroundColor: '#F0FDF8',
    textColor: '#064E3B',
  },
  {
    id: 'ruby-rush-light',
    name: 'Ruby Rush (Light)',
    primaryColor: '#BE123C',
    secondaryColor: '#FFF1F2',
    accentColor: '#F43F5E',
    buttonColor: '#9F1239',
    backgroundColor: '#FFF8F9',
    textColor: '#4C0519',
  },
  {
    id: 'indigo-ink-light',
    name: 'Indigo Ink (Light)',
    primaryColor: '#3730A3',
    secondaryColor: '#EEF2FF',
    accentColor: '#6366F1',
    buttonColor: '#312E81',
    backgroundColor: '#F8F8FF',
    textColor: '#1E1B4B',
  },
  {
    id: 'topaz-light',
    name: 'Topaz (Light)',
    primaryColor: '#B45309',
    secondaryColor: '#FFF7ED',
    accentColor: '#0EA5E9',
    buttonColor: '#92400E',
    backgroundColor: '#FFFCF5',
    textColor: '#3D1A00',
  },
  {
    id: 'plum-bold-light',
    name: 'Plum Bold (Light)',
    primaryColor: '#7E22CE',
    secondaryColor: '#F5F0FF',
    accentColor: '#A855F7',
    buttonColor: '#6B21A8',
    backgroundColor: '#FAF5FF',
    textColor: '#3B0764',
  },

  // ── Mono / Minimal Themes ──────────────────────────────────────────────
  {
    id: 'pitch-black',
    name: 'Pitch Black',
    primaryColor: '#FFFFFF',
    secondaryColor: '#111111',
    accentColor: '#BBBBBB',
    buttonColor: '#EEEEEE',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
  },
  {
    id: 'pure-white-light',
    name: 'Pure White (Light)',
    primaryColor: '#111111',
    secondaryColor: '#F4F4F4',
    accentColor: '#555555',
    buttonColor: '#222222',
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
  },
  {
    id: 'graphite-mono',
    name: 'Graphite Mono',
    primaryColor: '#8E8E93',
    secondaryColor: '#1C1C1E',
    accentColor: '#AEAEB2',
    buttonColor: '#636366',
    backgroundColor: '#000000',
    textColor: '#EBEBF5',
  },
  {
    id: 'newsprint-light',
    name: 'Newsprint (Light)',
    primaryColor: '#1C1C1E',
    secondaryColor: '#E5E5EA',
    accentColor: '#3A3A3C',
    buttonColor: '#000000',
    backgroundColor: '#F2F2F7',
    textColor: '#1C1C1E',
  },
  {
    id: 'sepia-classic-light',
    name: 'Sepia Classic (Light)',
    primaryColor: '#5B3A1A',
    secondaryColor: '#EDE0CC',
    accentColor: '#8B5E3C',
    buttonColor: '#4A2E12',
    backgroundColor: '#FAF3E0',
    textColor: '#2C1A0A',
  },

  // ── Seasonal / Nature Themes ───────────────────────────────────────────
  {
    id: 'winter-frost-light',
    name: 'Winter Frost (Light)',
    primaryColor: '#4B83A8',
    secondaryColor: '#E8F4F8',
    accentColor: '#89CFF0',
    buttonColor: '#3A6E90',
    backgroundColor: '#F5FAFB',
    textColor: '#0D2A3A',
  },
  {
    id: 'autumn-ember',
    name: 'Autumn Ember',
    primaryColor: '#D2691E',
    secondaryColor: '#1F0E00',
    accentColor: '#FF8C00',
    buttonColor: '#B55A15',
    backgroundColor: '#110700',
    textColor: '#FFE8CC',
  },
  {
    id: 'cherry-blossom-light',
    name: 'Cherry Blossom (Light)',
    primaryColor: '#C2185B',
    secondaryColor: '#FCE4EC',
    accentColor: '#F48FB1',
    buttonColor: '#AD1457',
    backgroundColor: '#FFF0F5',
    textColor: '#560027',
  },
  {
    id: 'pine-forest',
    name: 'Pine Forest',
    primaryColor: '#2D6A4F',
    secondaryColor: '#0D1F16',
    accentColor: '#52B788',
    buttonColor: '#1B4332',
    backgroundColor: '#081209',
    textColor: '#D8F3DC',
  },
  {
    id: 'desert-sand-light',
    name: 'Desert Sand (Light)',
    primaryColor: '#C27C3B',
    secondaryColor: '#F5ECD6',
    accentColor: '#E09050',
    buttonColor: '#A66528',
    backgroundColor: '#FBF5E8',
    textColor: '#3D2200',
  },

  // ── Fintech Brand-Style Themes ─────────────────────────────────────────
  {
    id: 'revolut-dark',
    name: 'Revolut Dark',
    primaryColor: '#0075EB',
    secondaryColor: '#131418',
    accentColor: '#00D4FF',
    buttonColor: '#005EC0',
    backgroundColor: '#080A0D',
    textColor: '#F2F5FF',
  },
  {
    id: 'n26-slate-light',
    name: 'N26 Slate (Light)',
    primaryColor: '#1A1A2E',
    secondaryColor: '#F0F0F5',
    accentColor: '#3D5A80',
    buttonColor: '#1A1A2E',
    backgroundColor: '#F8F8FC',
    textColor: '#0D0D1A',
  },
  {
    id: 'monzo-hot-coral-light',
    name: 'Monzo Hot Coral (Light)',
    primaryColor: '#FF4E6A',
    secondaryColor: '#FFF0F2',
    accentColor: '#FF8FA3',
    buttonColor: '#E03050',
    backgroundColor: '#FFFAFA',
    textColor: '#2A0010',
  },
  {
    id: 'wise-green-light',
    name: 'Wise Green (Light)',
    primaryColor: '#00B67A',
    secondaryColor: '#E6FAF4',
    accentColor: '#00D891',
    buttonColor: '#009960',
    backgroundColor: '#F0FDF9',
    textColor: '#003D28',
  },
  {
    id: 'cash-app-dark',
    name: 'Cash App Dark',
    primaryColor: '#00D632',
    secondaryColor: '#0A1A0C',
    accentColor: '#00FF3C',
    buttonColor: '#00B52A',
    backgroundColor: '#050E06',
    textColor: '#E0FFE8',
  },
  {
    id: 'venmo-blue-light',
    name: 'Venmo Blue (Light)',
    primaryColor: '#008CFF',
    secondaryColor: '#E5F4FF',
    accentColor: '#40A8FF',
    buttonColor: '#0070D8',
    backgroundColor: '#F0F8FF',
    textColor: '#002A5C',
  },
  {
    id: 'paypal-midnight',
    name: 'PayPal Midnight',
    primaryColor: '#009CDE',
    secondaryColor: '#0A1520',
    accentColor: '#00C8FF',
    buttonColor: '#0080BE',
    backgroundColor: '#060E18',
    textColor: '#E0F5FF',
  },
  {
    id: 'klarna-pink-light',
    name: 'Klarna Pink (Light)',
    primaryColor: '#FFB3C7',
    secondaryColor: '#FFF0F4',
    accentColor: '#FF8FAF',
    buttonColor: '#FF6B94',
    backgroundColor: '#FFFBFC',
    textColor: '#3D0015',
  },
  {
    id: 'chime-green-light',
    name: 'Chime Green (Light)',
    primaryColor: '#1EC677',
    secondaryColor: '#E7FAF2',
    accentColor: '#3DDC97',
    buttonColor: '#18A862',
    backgroundColor: '#F4FDF8',
    textColor: '#063A22',
  },
  {
    id: 'sofi-purple-light',
    name: 'SoFi Purple (Light)',
    primaryColor: '#7B1FA2',
    secondaryColor: '#F3E5F5',
    accentColor: '#AB47BC',
    buttonColor: '#6A1B9A',
    backgroundColor: '#FAF5FC',
    textColor: '#2D004A',
  },

  // ── NEW: Gradient Themes (Dark) - dual-hue, wide color distance ──────────
  {
    id: 'dusk-to-dawn',
    name: 'Dusk to Dawn',
    primaryColor: '#FF7B5A',
    secondaryColor: '#180D28',
    accentColor: '#9B59B6',
    buttonColor: '#E06A4A',
    backgroundColor: '#0D0818',
    textColor: '#FFE8E0',
  },
  {
    id: 'deep-ocean-gradient',
    name: 'Deep Ocean',
    primaryColor: '#00C8FF',
    secondaryColor: '#051830',
    accentColor: '#1A5CB8',
    buttonColor: '#00A8E0',
    backgroundColor: '#020D1A',
    textColor: '#E0F8FF',
  },
  {
    id: 'ember-void',
    name: 'Ember Void',
    primaryColor: '#FF8C00',
    secondaryColor: '#180C00',
    accentColor: '#C41E3A',
    buttonColor: '#E07800',
    backgroundColor: '#0A0500',
    textColor: '#FFF5E0',
  },
  {
    id: 'twilight-rose',
    name: 'Twilight Rose',
    primaryColor: '#8B5CF6',
    secondaryColor: '#180E28',
    accentColor: '#FF4B8B',
    buttonColor: '#7C3AED',
    backgroundColor: '#0F0818',
    textColor: '#F5E8FF',
  },
  {
    id: 'neptune-drift',
    name: 'Neptune Drift',
    primaryColor: '#00FFCC',
    secondaryColor: '#071525',
    accentColor: '#4488CC',
    buttonColor: '#00D4AA',
    backgroundColor: '#030B18',
    textColor: '#E0FFF8',
  },
  {
    id: 'obsidian-ember',
    name: 'Obsidian Ember',
    primaryColor: '#FF6D1B',
    secondaryColor: '#120800',
    accentColor: '#FFD000',
    buttonColor: '#E05A10',
    backgroundColor: '#050300',
    textColor: '#FFF0D6',
  },
  {
    id: 'galaxy-core',
    name: 'Galaxy Core',
    primaryColor: '#0070FF',
    secondaryColor: '#0E0530',
    accentColor: '#FF00CC',
    buttonColor: '#0055E0',
    backgroundColor: '#07021A',
    textColor: '#E0EEFF',
  },
  {
    id: 'forest-mist',
    name: 'Forest Mist',
    primaryColor: '#00CCA0',
    secondaryColor: '#061A10',
    accentColor: '#A8FF40',
    buttonColor: '#00AA88',
    backgroundColor: '#020D08',
    textColor: '#E0FFF5',
  },
  {
    id: 'midnight-amethyst',
    name: 'Midnight Amethyst',
    primaryColor: '#7B2FFF',
    secondaryColor: '#100A20',
    accentColor: '#00D4CC',
    buttonColor: '#6020E0',
    backgroundColor: '#080510',
    textColor: '#EDE0FF',
  },
  {
    id: 'crimson-tide',
    name: 'Crimson Tide',
    primaryColor: '#CC0033',
    secondaryColor: '#180510',
    accentColor: '#FF7055',
    buttonColor: '#AA0028',
    backgroundColor: '#0D0208',
    textColor: '#FFE0E8',
  },
  {
    id: 'arctic-fire',
    name: 'Arctic Fire',
    primaryColor: '#00CCFF',
    secondaryColor: '#0A1825',
    accentColor: '#FF5500',
    buttonColor: '#00AADD',
    backgroundColor: '#050C14',
    textColor: '#E8F8FF',
  },
  {
    id: 'toxic-wave',
    name: 'Toxic Wave',
    primaryColor: '#00FF88',
    secondaryColor: '#051208',
    accentColor: '#0088FF',
    buttonColor: '#00D070',
    backgroundColor: '#020A05',
    textColor: '#E0FFE8',
  },
  {
    id: 'blood-moon-rise',
    name: 'Blood Moon Rise',
    primaryColor: '#8B0000',
    secondaryColor: '#150500',
    accentColor: '#FFB800',
    buttonColor: '#700000',
    backgroundColor: '#0A0200',
    textColor: '#FFE0CC',
  },
  {
    id: 'indigo-flame',
    name: 'Indigo Flame',
    primaryColor: '#FFD700',
    secondaryColor: '#0D0A28',
    accentColor: '#4444FF',
    buttonColor: '#E0BB00',
    backgroundColor: '#06051A',
    textColor: '#FFFAE0',
  },
  {
    id: 'void-emerald',
    name: 'Void Emerald',
    primaryColor: '#00CC66',
    secondaryColor: '#071208',
    accentColor: '#8844FF',
    buttonColor: '#00AA55',
    backgroundColor: '#030A05',
    textColor: '#E0FFE8',
  },

  // ── NEW: Gradient Themes (Light) - dual-hue wide distance ────────────────
  {
    id: 'peach-horizon-light',
    name: 'Peach Horizon (Light)',
    primaryColor: '#FF6B47',
    secondaryColor: '#FDE8DF',
    accentColor: '#C2185B',
    buttonColor: '#E85A38',
    backgroundColor: '#FFF5F0',
    textColor: '#3A0F05',
  },
  {
    id: 'sky-dream-light',
    name: 'Sky Dream (Light)',
    primaryColor: '#2196F3',
    secondaryColor: '#E8F1FD',
    accentColor: '#9C27B0',
    buttonColor: '#1976D2',
    backgroundColor: '#F5F8FF',
    textColor: '#0A1A40',
  },
  {
    id: 'tropical-burst-light',
    name: 'Tropical Burst (Light)',
    primaryColor: '#00B4A0',
    secondaryColor: '#E0FAF5',
    accentColor: '#76C442',
    buttonColor: '#009688',
    backgroundColor: '#F0FDF8',
    textColor: '#003330',
  },
  {
    id: 'golden-hour-light',
    name: 'Golden Hour (Light)',
    primaryColor: '#F59E0B',
    secondaryColor: '#FEF3D0',
    accentColor: '#EC4899',
    buttonColor: '#D97706',
    backgroundColor: '#FFFCF0',
    textColor: '#3D1A00',
  },
  {
    id: 'ice-crystal-light',
    name: 'Ice Crystal (Light)',
    primaryColor: '#0891B2',
    secondaryColor: '#E0F8FF',
    accentColor: '#A78BFA',
    buttonColor: '#0E7490',
    backgroundColor: '#F8FDFF',
    textColor: '#0C3050',
  },
  {
    id: 'spring-meadow-light',
    name: 'Spring Meadow (Light)',
    primaryColor: '#22C55E',
    secondaryColor: '#E0FAE8',
    accentColor: '#38BDF8',
    buttonColor: '#16A34A',
    backgroundColor: '#F2FDF5',
    textColor: '#0A2E12',
  },
  {
    id: 'watercolor-light',
    name: 'Watercolor (Light)',
    primaryColor: '#4B8EF0',
    secondaryColor: '#E8F0FD',
    accentColor: '#F97066',
    buttonColor: '#3578E0',
    backgroundColor: '#F5F8FF',
    textColor: '#0A1840',
  },
  {
    id: 'blossom-drift-light',
    name: 'Blossom Drift (Light)',
    primaryColor: '#F472B6',
    secondaryColor: '#FCE8F5',
    accentColor: '#FBBF24',
    buttonColor: '#EC4899',
    backgroundColor: '#FFF8FC',
    textColor: '#4A0A28',
  },

  // ── NEW: Accent Themes (Dark) - vivid single-pop accent ─────────────────
  {
    id: 'uranium-green',
    name: 'Uranium Green',
    primaryColor: '#B0FF00',
    secondaryColor: '#081500',
    accentColor: '#6EFF00',
    buttonColor: '#90D400',
    backgroundColor: '#030A00',
    textColor: '#EDFFD0',
  },
  {
    id: 'blood-moon-accent',
    name: 'Blood Moon',
    primaryColor: '#CC0000',
    secondaryColor: '#1A0000',
    accentColor: '#FF2200',
    buttonColor: '#AA0000',
    backgroundColor: '#0A0000',
    textColor: '#FFD0D0',
  },
  {
    id: 'laser-blue',
    name: 'Laser Blue',
    primaryColor: '#0066FF',
    secondaryColor: '#000E28',
    accentColor: '#33AAFF',
    buttonColor: '#0044CC',
    backgroundColor: '#000511',
    textColor: '#D0E8FF',
  },
  {
    id: 'neon-orange',
    name: 'Neon Orange',
    primaryColor: '#FF6600',
    secondaryColor: '#1A1000',
    accentColor: '#FF9900',
    buttonColor: '#E05500',
    backgroundColor: '#0D0800',
    textColor: '#FFF0D0',
  },
  {
    id: 'vivid-violet-accent',
    name: 'Vivid Violet',
    primaryColor: '#9400FF',
    secondaryColor: '#0D0520',
    accentColor: '#CC44FF',
    buttonColor: '#7700DD',
    backgroundColor: '#06020F',
    textColor: '#F0D8FF',
  },
  {
    id: 'signal-red',
    name: 'Signal Red',
    primaryColor: '#FF0000',
    secondaryColor: '#150000',
    accentColor: '#FF4444',
    buttonColor: '#CC0000',
    backgroundColor: '#080000',
    textColor: '#FFE0E0',
  },
  {
    id: 'toxic-yellow',
    name: 'Toxic Yellow',
    primaryColor: '#FFFF00',
    secondaryColor: '#121200',
    accentColor: '#E0E000',
    buttonColor: '#CCCC00',
    backgroundColor: '#080800',
    textColor: '#FFFFE0',
  },
  {
    id: 'electric-teal',
    name: 'Electric Teal',
    primaryColor: '#00FFEE',
    secondaryColor: '#001E1C',
    accentColor: '#00D4C8',
    buttonColor: '#00C8BC',
    backgroundColor: '#001010',
    textColor: '#D0FFFC',
  },
  {
    id: 'fire-engine',
    name: 'Fire Engine',
    primaryColor: '#FF1500',
    secondaryColor: '#140300',
    accentColor: '#FF5733',
    buttonColor: '#D41200',
    backgroundColor: '#080100',
    textColor: '#FFE8E0',
  },
  {
    id: 'ultraviolet-dark',
    name: 'Ultraviolet',
    primaryColor: '#6600CC',
    secondaryColor: '#0D0025',
    accentColor: '#AA00FF',
    buttonColor: '#5500AA',
    backgroundColor: '#050012',
    textColor: '#EDD8FF',
  },

  // ── NEW: Accent Themes (Light) - vivid pop on clean base ────────────────
  {
    id: 'vivid-coral-light',
    name: 'Vivid Coral (Light)',
    primaryColor: '#FF4500',
    secondaryColor: '#FFEAE0',
    accentColor: '#FF7043',
    buttonColor: '#E03A00',
    backgroundColor: '#FFF8F5',
    textColor: '#3A0C00',
  },
  {
    id: 'electric-blue-light',
    name: 'Electric Blue (Light)',
    primaryColor: '#0050FF',
    secondaryColor: '#E0EAFF',
    accentColor: '#3380FF',
    buttonColor: '#0040DD',
    backgroundColor: '#F5F8FF',
    textColor: '#001A60',
  },
  {
    id: 'neon-green-light',
    name: 'Neon Green (Light)',
    primaryColor: '#00CC44',
    secondaryColor: '#E0FFE8',
    accentColor: '#00FF66',
    buttonColor: '#009930',
    backgroundColor: '#F5FFF5',
    textColor: '#003015',
  },
  {
    id: 'shocking-pink-light',
    name: 'Shocking Pink (Light)',
    primaryColor: '#FF0099',
    secondaryColor: '#FFE0F5',
    accentColor: '#FF44BB',
    buttonColor: '#DD0088',
    backgroundColor: '#FFF5FC',
    textColor: '#500030',
  },
  {
    id: 'bold-amber-light',
    name: 'Bold Amber (Light)',
    primaryColor: '#FF8C00',
    secondaryColor: '#FFF0D0',
    accentColor: '#FFB800',
    buttonColor: '#E07800',
    backgroundColor: '#FFFBF0',
    textColor: '#3D1A00',
  },

  // ── NEW: Gradient & Accent Themes - dual vivid hues + electric pop ───────
  {
    id: 'fire-and-ice',
    name: 'Fire & Ice',
    primaryColor: '#FF3300',
    secondaryColor: '#0A0814',
    accentColor: '#00CCFF',
    buttonColor: '#CC2800',
    backgroundColor: '#050A14',
    textColor: '#FFF0E0',
  },
  {
    id: 'neon-sunset-ga',
    name: 'Neon Sunset',
    primaryColor: '#FF5500',
    secondaryColor: '#180A18',
    accentColor: '#FF00AA',
    buttonColor: '#DD4500',
    backgroundColor: '#0D0510',
    textColor: '#FFF0F8',
  },
  {
    id: 'digital-storm',
    name: 'Digital Storm',
    primaryColor: '#0066FF',
    secondaryColor: '#080F24',
    accentColor: '#AA00FF',
    buttonColor: '#0055DD',
    backgroundColor: '#040814',
    textColor: '#E0E8FF',
  },
  {
    id: 'matrix-rain',
    name: 'Matrix Rain',
    primaryColor: '#00FF41',
    secondaryColor: '#001400',
    accentColor: '#00CCFF',
    buttonColor: '#00CC35',
    backgroundColor: '#000800',
    textColor: '#CCFFCC',
  },
  {
    id: 'aurora-punk',
    name: 'Aurora Punk',
    primaryColor: '#00FFC8',
    secondaryColor: '#0A1818',
    accentColor: '#FF00AA',
    buttonColor: '#00DDB0',
    backgroundColor: '#050E0E',
    textColor: '#E0FFF8',
  },
  {
    id: 'electric-dreams-ga',
    name: 'Electric Dreams',
    primaryColor: '#CC00FF',
    secondaryColor: '#0E0820',
    accentColor: '#FFEE00',
    buttonColor: '#AA00DD',
    backgroundColor: '#080414',
    textColor: '#F0E0FF',
  },
  {
    id: 'hyperspace',
    name: 'Hyperspace',
    primaryColor: '#00CCFF',
    secondaryColor: '#080E24',
    accentColor: '#BB00FF',
    buttonColor: '#00AADD',
    backgroundColor: '#040614',
    textColor: '#E0F8FF',
  },
  {
    id: 'cyber-jungle',
    name: 'Cyber Jungle',
    primaryColor: '#00FF66',
    secondaryColor: '#051408',
    accentColor: '#0088FF',
    buttonColor: '#00DD55',
    backgroundColor: '#020A05',
    textColor: '#E0FFE8',
  },
  {
    id: 'astral-gold',
    name: 'Astral Gold',
    primaryColor: '#4488FF',
    secondaryColor: '#0A1025',
    accentColor: '#FFD700',
    buttonColor: '#3366DD',
    backgroundColor: '#050815',
    textColor: '#E0EAFF',
  },
  {
    id: 'prism-burst',
    name: 'Prism Burst',
    primaryColor: '#FF0080',
    secondaryColor: '#120818',
    accentColor: '#00FFCC',
    buttonColor: '#DD0070',
    backgroundColor: '#080410',
    textColor: '#FFE0F5',
  },
  {
    id: 'void-storm',
    name: 'Void Storm',
    primaryColor: '#7700FF',
    secondaryColor: '#08091A',
    accentColor: '#FF6600',
    buttonColor: '#6600DD',
    backgroundColor: '#030508',
    textColor: '#F0E0FF',
  },
  {
    id: 'blazing-ice',
    name: 'Blazing Ice',
    primaryColor: '#FF4400',
    secondaryColor: '#061220',
    accentColor: '#00DDFF',
    buttonColor: '#DD3800',
    backgroundColor: '#020B18',
    textColor: '#FFF0E8',
  },
  {
    id: 'neon-orchid',
    name: 'Neon Orchid',
    primaryColor: '#FF00FF',
    secondaryColor: '#100020',
    accentColor: '#00FF88',
    buttonColor: '#DD00DD',
    backgroundColor: '#080012',
    textColor: '#FFD8FF',
  },
  {
    id: 'sugar-rush-light',
    name: 'Sugar Rush (Light)',
    primaryColor: '#FF00CC',
    secondaryColor: '#FFE8FC',
    accentColor: '#00CCFF',
    buttonColor: '#DD00AA',
    backgroundColor: '#FFF8FF',
    textColor: '#3A003A',
  },
  {
    id: 'cyber-dawn-light',
    name: 'Cyber Dawn (Light)',
    primaryColor: '#00BB88',
    secondaryColor: '#E0FFF8',
    accentColor: '#FF4400',
    buttonColor: '#009970',
    backgroundColor: '#F8FFFF',
    textColor: '#002820',
  },
];

// ── Theme category tabs ────────────────────────────────────────────────────
const THEME_CATEGORIES = [
  { id: 'all',              label: 'All',               icon: 'fa-border-all' },
  { id: 'dark',             label: 'Dark',              icon: 'fa-moon' },
  { id: 'light',            label: 'Light',             icon: 'fa-sun' },
  { id: 'gradient',         label: 'Gradient',          icon: 'fa-droplet' },
  { id: 'accent',           label: 'Accent',            icon: 'fa-bolt' },
  { id: 'gradient-accent',  label: 'Gradient & Accent', icon: 'fa-wand-magic-sparkles' },
  { id: 'banking',          label: 'Banking',           icon: 'fa-building-columns' },
  { id: 'crypto',           label: 'Crypto',            icon: 'fa-coins' },
  { id: 'trading',          label: 'Trading',           icon: 'fa-chart-line' },
  { id: 'fintech',          label: 'Fintech',           icon: 'fa-mobile-screen' },
  { id: 'neon',             label: 'Neon',              icon: 'fa-star-of-david' },
  { id: 'minimal',          label: 'Minimal',           icon: 'fa-circle-half-stroke' },
  { id: 'luxury',           label: 'Luxury',            icon: 'fa-gem' },
  { id: 'nature',           label: 'Nature',            icon: 'fa-leaf' },
  { id: 'warm',             label: 'Warm',              icon: 'fa-fire' },
  { id: 'cool',             label: 'Cool',              icon: 'fa-snowflake' },
];

const DARK_IDS = new Set([
  'binance-gold','midnight-blue','forest-green','royal-purple','rose-gold',
  'sunset-coral','arctic-aurora','crimson-onyx','champagne-noir','sage-mint',
  'deep-space','electric-lime','tangerine-dream','ocean-breeze',
  'vault-black','iron-reserve','sapphire-vault','onyx-platinum','bronze-ledger',
  'premier-noir','cobalt-trust','smoke-steel','bullion-dark','obsidian-banker',
  'bitcoin-orange','ethereum-violet','avalanche-peak','polkadot-magenta',
  'cosmos-indigo','chainlink-azure','uniswap-orchid','phantom-dusk','kraken-storm',
  'bull-market','bear-trap','options-desk','quant-terminal','algo-trader',
  'forex-pro','futures-slate','bloomberg-night','derivatives-dark','short-squeeze',
  'pitch-black','graphite-mono','autumn-ember','pine-forest',
  'revolut-dark','cash-app-dark','paypal-midnight',
  // gradient dark
  'dusk-to-dawn','deep-ocean-gradient','ember-void','twilight-rose','neptune-drift',
  'obsidian-ember','galaxy-core','forest-mist','midnight-amethyst','crimson-tide',
  'arctic-fire','toxic-wave','blood-moon-rise','indigo-flame','void-emerald',
  // accent dark
  'uranium-green','blood-moon-accent','laser-blue','neon-orange','vivid-violet-accent',
  'signal-red','toxic-yellow','electric-teal','fire-engine','ultraviolet-dark',
  // gradient & accent dark
  'fire-and-ice','neon-sunset-ga','digital-storm','matrix-rain','aurora-punk',
  'electric-dreams-ga','hyperspace','cyber-jungle','astral-gold','prism-burst',
  'void-storm','blazing-ice','neon-orchid',
]);

const LIGHT_IDS = new Set([
  'pearl-light','tidio-light','discord-light','stripe-light','cleo-light',
  'replit-light','violet-mist-light','lavender-bloom-light','sky-blue-light',
  'azure-light','mint-garden-light','sage-light',
  'swiss-banking-light','morgan-elite-light','private-wealth-light',
  'barclays-blue-light','deutsche-silver-light','prestige-ivory-light',
  'nordic-trust-light','commonwealth-light','equity-rose-light','silver-lining-light',
  'bitcoin-light','defi-spring-light','web3-clean-light','nft-gallery-light','trust-white-light',
  'market-open-light','bull-run-light','analyst-white-light','robinhood-green-light','charting-pro-light',
  'pure-white-light','newsprint-light','sepia-classic-light','winter-frost-light',
  'cherry-blossom-light','desert-sand-light',
  'n26-slate-light','monzo-hot-coral-light','wise-green-light','venmo-blue-light',
  'klarna-pink-light','chime-green-light','sofi-purple-light',
  // gradient light
  'peach-horizon-light','sky-dream-light','tropical-burst-light','golden-hour-light',
  'ice-crystal-light','spring-meadow-light','watercolor-light','blossom-drift-light',
  // accent light
  'vivid-coral-light','electric-blue-light','neon-green-light','shocking-pink-light','bold-amber-light',
  // gradient & accent light
  'sugar-rush-light','cyber-dawn-light',
]);

const GRADIENT_IDS = new Set([
  // original
  'nebula-drift','galactic-storm','lava-flow','solar-flare','cosmic-dust',
  'sunrise-peach-light','cotton-candy-light','sea-glass-light','bluebell-light','sherbet-light',
  // new dark gradients
  'dusk-to-dawn','deep-ocean-gradient','ember-void','twilight-rose','neptune-drift',
  'obsidian-ember','galaxy-core','forest-mist','midnight-amethyst','crimson-tide',
  'arctic-fire','toxic-wave','blood-moon-rise','indigo-flame','void-emerald',
  // new light gradients
  'peach-horizon-light','sky-dream-light','tropical-burst-light','golden-hour-light',
  'ice-crystal-light','spring-meadow-light','watercolor-light','blossom-drift-light',
]);

const ACCENT_IDS = new Set([
  // original
  'neon-pulse','hot-magenta','volt-rush','cobalt-strike','acid-rain',
  'vermillion-dark','malachite-dark','cerulean-edge','saffron-dark','jade-emperor',
  'citrus-punch-light','coral-reef-light','turquoise-pop-light','fuchsia-flash-light',
  'amber-glow-light','emerald-cut-light','ruby-rush-light','indigo-ink-light',
  'topaz-light','plum-bold-light',
  // new dark accents
  'uranium-green','blood-moon-accent','laser-blue','neon-orange','vivid-violet-accent',
  'signal-red','toxic-yellow','electric-teal','fire-engine','ultraviolet-dark',
  // new light accents
  'vivid-coral-light','electric-blue-light','neon-green-light','shocking-pink-light','bold-amber-light',
]);

const GRADIENT_ACCENT_IDS = new Set([
  // original
  'cyber-neon','plasma-surge','aurora-borealis','prism-dark','vortex-dark',
  'thunderbolt','solana-wave',
  // new
  'fire-and-ice','neon-sunset-ga','digital-storm','matrix-rain','aurora-punk',
  'electric-dreams-ga','hyperspace','cyber-jungle','astral-gold','prism-burst',
  'void-storm','blazing-ice','neon-orchid','sugar-rush-light','cyber-dawn-light',
]);

const BANKING_IDS = new Set([
  'swiss-banking-light','morgan-elite-light','private-wealth-light','barclays-blue-light',
  'deutsche-silver-light','prestige-ivory-light','nordic-trust-light','commonwealth-light',
  'equity-rose-light','silver-lining-light',
  'vault-black','iron-reserve','sapphire-vault','onyx-platinum','bronze-ledger',
  'premier-noir','cobalt-trust','smoke-steel','bullion-dark','obsidian-banker',
]);

const CRYPTO_IDS = new Set([
  'binance-gold','bitcoin-orange','ethereum-violet','solana-wave','avalanche-peak',
  'polkadot-magenta','cosmos-indigo','chainlink-azure','uniswap-orchid','phantom-dusk',
  'kraken-storm','bitcoin-light','defi-spring-light','web3-clean-light',
  'nft-gallery-light','trust-white-light',
]);

const TRADING_IDS = new Set([
  'bull-market','bear-trap','options-desk','quant-terminal','algo-trader',
  'forex-pro','futures-slate','bloomberg-night','derivatives-dark','short-squeeze',
  'market-open-light','bull-run-light','analyst-white-light','robinhood-green-light',
  'charting-pro-light',
]);

const FINTECH_IDS = new Set([
  'revolut-dark','cash-app-dark','paypal-midnight',
  'n26-slate-light','monzo-hot-coral-light','wise-green-light','venmo-blue-light',
  'klarna-pink-light','chime-green-light','sofi-purple-light',
  'tidio-light','stripe-light','discord-light','replit-light',
]);

const NEON_IDS = new Set([
  'cyber-neon','neon-pulse','plasma-surge','volt-rush','acid-rain',
  'quant-terminal','thunderbolt','hot-magenta','electric-lime','vortex-dark',
  'prism-dark','aurora-borealis',
]);

const MINIMAL_IDS = new Set([
  'pitch-black','pure-white-light','graphite-mono','newsprint-light','sepia-classic-light',
  'pearl-light','tidio-light','stripe-light','n26-slate-light','silver-lining-light',
  'deutsche-silver-light',
]);

const LUXURY_IDS = new Set([
  'champagne-noir','vault-black','bullion-dark','premier-noir','rose-gold',
  'prestige-ivory-light','morgan-elite-light','bronze-ledger','onyx-platinum',
  'obsidian-banker','binance-gold',
]);

const NATURE_IDS = new Set([
  'pine-forest','autumn-ember','winter-frost-light','cherry-blossom-light',
  'desert-sand-light','forest-green','sage-mint','ocean-breeze','sage-light',
  'mint-garden-light','commonwealth-light','sepia-classic-light',
]);

const WARM_IDS = new Set([
  'binance-gold','rose-gold','sunset-coral','tangerine-dream','crimson-onyx',
  'champagne-noir','bitcoin-orange','lava-flow','solar-flare','autumn-ember',
  'citrus-punch-light','coral-reef-light','amber-glow-light','desert-sand-light',
  'monzo-hot-coral-light','cherry-blossom-light','sherbet-light','sunrise-peach-light',
  'bloomberg-night','bronze-ledger',
]);

const COOL_IDS = new Set([
  'midnight-blue','arctic-aurora','ocean-breeze','deep-space','galactic-storm',
  'nebula-drift','cosmos-indigo','chainlink-azure','algo-trader','derivatives-dark',
  'sky-blue-light','azure-light','nordic-trust-light','barclays-blue-light',
  'trust-white-light','bluebell-light','sea-glass-light','winter-frost-light',
  'cobalt-strike','cerulean-edge',
]);

const THEME_CATEGORY_MAP = {
  dark:              DARK_IDS,
  light:             LIGHT_IDS,
  gradient:          GRADIENT_IDS,
  accent:            ACCENT_IDS,
  'gradient-accent': GRADIENT_ACCENT_IDS,
  banking:           BANKING_IDS,
  crypto:            CRYPTO_IDS,
  trading:           TRADING_IDS,
  fintech:           FINTECH_IDS,
  neon:              NEON_IDS,
  minimal:           MINIMAL_IDS,
  luxury:            LUXURY_IDS,
  nature:            NATURE_IDS,
  warm:              WARM_IDS,
  cool:              COOL_IDS,
};

const ThemeCategoryTab = ({ category, isActive, onClick }) => (
  <button
    type="button"
    onClick={() => onClick(category.id)}
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
      border: `1px solid ${isActive ? 'rgba(240,185,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
      background: isActive ? 'rgba(240,185,11,0.12)' : 'rgba(255,255,255,0.03)',
      color: isActive ? '#F0B90B' : '#848E9C',
      transition: 'all 0.15s ease',
    }}
    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.color = '#EAECEF'; } }}
    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#848E9C'; } }}
  >
    <i className={`fas ${category.icon}`} style={{ fontSize: 10 }} />
    {category.label}
  </button>
);

const PresetThemeButton = ({ preset, isActive, onApply }) => (
  <button
    type="button"
    onClick={() => onApply(preset)}
    aria-label={`Apply ${preset.name} theme`}
    aria-pressed={isActive}
    title={`Apply the ${preset.name} palette to all six colors`}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 10,
      background: isActive ? 'rgba(14,203,129,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isActive ? 'rgba(14,203,129,0.45)' : 'rgba(255,255,255,0.08)'}`,
      color: '#EAECEF',
      cursor: 'pointer',
      fontSize: 12,
      fontWeight: 600,
      transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.15s ease',
      minWidth: 0,
    }}
    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
  >
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 14, height: 22, background: preset.backgroundColor }} />
      <span style={{ width: 14, height: 22, background: preset.primaryColor }} />
      <span style={{ width: 14, height: 22, background: preset.accentColor }} />
      <span style={{ width: 14, height: 22, background: preset.buttonColor }} />
    </span>
    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.name}</span>
    {isActive && <i className="fas fa-check" style={{ color: '#0ECB81', fontSize: 11, marginLeft: 'auto' }} />}
  </button>
);

const ColorField = ({ id, label, value, onChange, hint }) => (
  <Field label={label} hint={hint}>
    <div className="aax-settings-color-row">
      <input type="color" id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} />
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#F0B90B" />
      <span className="aax-settings-color-swatch" style={{ backgroundColor: value }} title={value} />
    </div>
  </Field>
);

// ---------------------------------------------------------------------------
// Live Preview Modal - a state-of-the-art before/after preview that mounts
// when the admin clicks "Preview & Save" on the color scheme. Renders both
// the saved theme and the pending theme side-by-side with mini reproductions
// of the landing-page hero, the credit card, and the brand mark.
// ---------------------------------------------------------------------------
const PreviewPane = ({ title, settings, badge, badgeColor }) => {
  const platformName = settings.platformName || 'Chain-IQ';
  const abbreviation = settings.platformAbbreviation || 'CIQ';
  const heroHeader = settings.heroHeader || 'The next-gen\ncrypto wallet.';
  const heroStatement = settings.heroStatement || 'Real-time market analytics in one wallet.';
  const year = settings.platformYear || new Date().getFullYear();
  const primary = settings.primaryColor || '#F0B90B';
  const accent = settings.accentColor || primary;
  const button = settings.buttonColor || accent;
  const bg = settings.backgroundColor || '#0a0a0f';
  const text = settings.textColor || '#F9FAFB';

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0E1116' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161A1E', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#EAECEF', letterSpacing: '0.02em' }}>{title}</div>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: `${badgeColor}1A`, color: badgeColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{badge}</span>
      </div>

      {/* Mini landing page - sized generously so the preview reads well */}
      <div style={{ background: bg, color: text, padding: '20px 22px 16px', display: 'flex', flexDirection: 'column', gap: 18, minHeight: 540 }}>
        {/* Top nav - logo + nav links + Login + Sign Up */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#000', flexShrink: 0 }}>{abbreviation}</div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{platformName}</div>
          </div>
          <div style={{ display: 'none', alignItems: 'center', gap: 14, fontSize: 11, opacity: 0.75 }} className="aax-preview-navlinks">
            <span>Features</span><span>Pricing</span><span>About</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button style={{ padding: '5px 12px', borderRadius: 999, border: `1px solid ${accent}`, background: 'transparent', color: text, fontSize: 11, fontWeight: 700, cursor: 'default' }}>Login</button>
            <button style={{ padding: '5px 12px', borderRadius: 999, border: 'none', background: accent, color: '#000', fontSize: 11, fontWeight: 700, cursor: 'default' }}>Sign Up</button>
          </div>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', padding: '20px 4px 8px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 999, marginBottom: 14,
            background: `${accent}1F`, color: accent,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
            New  /  Live trading
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15, whiteSpace: 'pre-line', letterSpacing: '-0.02em' }}>{heroHeader}</div>
          <div style={{ fontSize: 12, color: text, opacity: 0.72, marginTop: 10, lineHeight: 1.55, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>{heroStatement}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18 }}>
            <button style={{ padding: '8px 16px', borderRadius: 999, border: 'none', background: button, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'default' }}>Get Started</button>
            <button style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${accent}`, background: 'transparent', color: accent, fontSize: 12, fontWeight: 700, cursor: 'default' }}>Learn More</button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          padding: '12px 8px', borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          {[
            { v: '$2.4B+', l: 'Volume' },
            { v: '180+', l: 'Countries' },
            { v: '4.9★', l: 'Rating' },
          ].map((s) => (
            <div key={s.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: primary }}>{s.v}</div>
              <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {['Instant Swaps', 'Cold Storage', '24/7 Support'].map((f) => (
            <span key={f} style={{
              fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
              background: `${primary}14`, color: text, opacity: 0.85,
              border: `1px solid ${primary}33`,
            }}>{f}</span>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: 10, color: text, opacity: 0.5 }}>
          © {year} {platformName} Technologies Inc. All Rights Reserved.
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Card Preview - a dedicated mini credit-card mock that lives next to the
// "Card Brand Name" controls so admins can see exactly how the brand name and
// current color palette look on issued credit cards.
// ---------------------------------------------------------------------------
const CardPreview = ({ settings }) => {
  const cardBrand = (settings.cardBrandName || '').trim() || 'Brand Name';
  const primary = settings.primaryColor || '#F0B90B';
  const accent = settings.accentColor || primary;

  // Mirror the real wallet-card "gold" gradient direction (135deg, 3 stops)
  // so this preview looks identical to the issued card on the user platform.
  const gradient = `linear-gradient(135deg, ${primary} 0%, ${accent} 50%, ${primary} 100%)`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Card Preview
      </div>

      {/* Real-card aspect ratio (1.586:1, ISO/IEC 7810 ID-1) - caps width so
          it doesn't stretch awkwardly across the column. */}
      <div
        aria-label={`${cardBrand} credit card preview`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          aspectRatio: '1.586 / 1',
          borderRadius: 16,
          padding: '20px 22px 18px',
          background: gradient,
          color: '#0B0E11',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          boxShadow: [
            '0 1px 0 rgba(255,255,255,0.10) inset',
            '0 -1px 0 rgba(0,0,0,0.25) inset',
            '0 12px 30px rgba(0,0,0,0.45)',
          ].join(', '),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* Pattern + shine overlays - same as .wc-pattern / .wc-shine on platform */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.10) 0%, transparent 60%),' +
            'radial-gradient(ellipse at 20% 80%, rgba(255,255,255,0.05) 0%, transparent 50%)',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none',
          background:
            'linear-gradient(120deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 35%, transparent 60%),' +
            'radial-gradient(circle at 100% 0%, rgba(255,255,255,0.14) 0%, transparent 40%)',
        }} />

        {/* Top row: brand + tier */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
            textShadow: '0 1px 2px rgba(0,0,0,0.20)',
            maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{cardBrand}</div>
          <div style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.78,
          }}>GOLD</div>
        </div>

        {/* Middle: chip + card number - matches .wc-middle layout exactly */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="38" height="28" viewBox="0 0 40 30" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
            <defs>
              <linearGradient id="card-preview-chip" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#f5d76e" />
                <stop offset="100%" stopColor="#b8860b" />
              </linearGradient>
            </defs>
            <rect width="40" height="30" fill="url(#card-preview-chip)" rx="4" />
            <path d="M10 15h20M20 5v20M15 10h10M15 20h10" stroke="rgba(0,0,0,0.45)" strokeWidth="1.5" />
          </svg>
          <div style={{
            fontFamily: "'Roboto Mono', 'Menlo', 'Courier New', monospace",
            fontSize: 17, fontWeight: 600, letterSpacing: '0.14em',
            textShadow: '0 1px 2px rgba(0,0,0,0.30)',
          }}>•••• •••• •••• 4242</div>
        </div>

        {/* Bottom row: holder + balance + visa logo - matches .wc-bottom */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 3 }}>Card Holder</div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>JANE DOE</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.65, marginBottom: 3 }}>Balance</div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>$12,450</div>
          </div>
          <i className="fab fa-cc-visa" style={{ fontSize: 26, opacity: 0.95, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))', marginLeft: 4 }} />
        </div>
      </div>

      <p style={{ margin: '2px 2px 0', color: '#848E9C', fontSize: 11, lineHeight: 1.5 }}>
        <i className="fas fa-bolt" style={{ marginRight: 5, color: '#F0B90B' }} />
        Live preview - matches exactly how cards appear on the user platform.
      </p>
    </div>
  );
};

const LivePreviewModal = ({ isOpen, savedSettings, pendingSettings, onClose, onConfirm, onRevert }) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live design preview"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8, 10, 14, 0.78)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'aax-preview-fade 0.18s ease',
      }}
    >
      <style>{`
        @keyframes aax-preview-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aax-preview-slide { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div
        style={{
          background: '#161A1E', borderRadius: 16, width: '100%', maxWidth: 1100,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          animation: 'aax-preview-slide 0.22s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#EAECEF', letterSpacing: '-0.01em' }}>Live Design Preview</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#848E9C' }}>
              See exactly how your platform will look before saving. Compare side-by-side, then confirm or cancel.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#EAECEF', cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>

        {/* Body - two preview panes */}
        <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18, flex: 1, background: '#0E1116' }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <PreviewPane title="Currently Live" settings={savedSettings} badge="Before" badgeColor="#848E9C" />
            <PreviewPane title="Pending Changes" settings={pendingSettings} badge="After" badgeColor="#0ECB81" />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12, background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.18)', borderRadius: 10 }}>
            <i className="fas fa-info-circle" style={{ color: '#F0B90B', marginTop: 2 }} />
            <div style={{ fontSize: 12, color: '#EAECEF', lineHeight: 1.55 }}>
              The preview reflects every branding, hero, color, and card change you've made in this session.
              Click <strong>Save Changes</strong> to publish them across the entire platform, or <strong>Revert to Default Design</strong> to restore the original Chain-IQ identity.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#161A1E', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <button
            type="button"
            onClick={onRevert}
            style={{ padding: '10px 16px', borderRadius: 10, background: 'transparent', color: '#F6465D', border: '1px solid rgba(246,70,93,0.35)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            title="Restore the original Chain-IQ defaults for every field"
          >
            <i className="fas fa-undo" style={{ marginRight: 6 }}></i>
            Revert to Default Design
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: '#EAECEF', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{ padding: '10px 22px', borderRadius: 10, background: '#0ECB81', color: '#0a0a0f', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(14,203,129,0.35)' }}
            >
              <i className="fas fa-check" style={{ marginRight: 6 }}></i>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Settings = () => {
  const {
    userFees,
    setUserFees,
    clientSpecificFees,
    setClientSpecificFees,
    leads,
    logAdminAction,
  } = useContext(DataContext);
  const showNotification = useContext(NotificationContext);
  // Live snapshot of the persisted platform settings - used for the
  // "current vs. preview" diff in the Live Preview modal. The form's own
  // working copy is `tempSettings` (initialized lazily below).
  const platformSettings = usePlatformSettings();

  // Form working copy - initialized to defaults, then overwritten on mount
  // with the authoritative values fetched from the backend database.
  const [tempSettings, setTempSettings] = useState(mergePlatformSettings({}));
  const [settingsLoading, setSettingsLoading] = useState(true);
  // Tracks whether the user has unsaved edits. While dirty, we do NOT let
  // incoming backend refreshes clobber the in-progress form values.
  const [isDirty, setIsDirty] = useState(false);

  const [tempUserFees, setTempUserFees] = useState(userFees);
  const [tempClientSpecificFees, setTempClientSpecificFees] = useState(clientSpecificFees);

  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false);

  // Custom color palettes - stored in the database as part of platform_settings.
  const [customThemes, setCustomThemes] = useState([]);
  const [savingCustomTheme, setSavingCustomTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');

  // Theme category tab
  const [activeThemeCategory, setActiveThemeCategory] = useState('all');

  // History tab
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const leadAccounts = leads.filter((lead) => !staffRoles.includes(lead.role));

  // Load ALL settings from the backend on mount - the only source of truth.
  useEffect(() => {
    (async () => {
      const s = await fetchAdminSettings(getAdminToken());
      if (s) {
        const merged = mergePlatformSettings(s);
        setTempSettings(merged);
        if (s.userFees && typeof s.userFees === 'object') {
          setTempUserFees((prev) => ({ ...prev, ...s.userFees }));
        }
        if (s.clientFees && typeof s.clientFees === 'object') {
          setTempClientSpecificFees(s.clientFees);
        }
        if (Array.isArray(s.customThemes)) {
          setCustomThemes(s.customThemes);
        }
      }
      setSettingsLoading(false);
    })();
  }, []);

  // (Card brand name is now fully manual - admin types whatever should appear
  // on issued cards, independent of the platform name.)

  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setTempSettings((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setIsDirty(true);
  };

  const handleColorChange = (colorName, value) => {
    setTempSettings((prev) => ({ ...prev, [colorName]: value }));
    setIsDirty(true);
  };

  const handleApplyPreset = (preset) => {
    setTempSettings((prev) => ({
      ...prev,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
      buttonColor: preset.buttonColor,
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
    }));
    setIsDirty(true);
    showNotification(`Applied "${preset.name}" theme - review the live preview, then click Save Settings to publish.`, 'info');
  };

  const activePresetId = useMemo(() => {
    const all = [...COLOR_PRESETS, ...customThemes];
    const match = all.find(
      (p) =>
        (tempSettings.primaryColor || '').toLowerCase() === (p.primaryColor || '').toLowerCase() &&
        (tempSettings.secondaryColor || '').toLowerCase() === (p.secondaryColor || '').toLowerCase() &&
        (tempSettings.accentColor || '').toLowerCase() === (p.accentColor || '').toLowerCase() &&
        (tempSettings.buttonColor || '').toLowerCase() === (p.buttonColor || '').toLowerCase() &&
        (tempSettings.backgroundColor || '').toLowerCase() === (p.backgroundColor || '').toLowerCase() &&
        (tempSettings.textColor || '').toLowerCase() === (p.textColor || '').toLowerCase()
    );
    return match ? match.id : null;
  }, [
    tempSettings.primaryColor,
    tempSettings.secondaryColor,
    tempSettings.accentColor,
    tempSettings.buttonColor,
    tempSettings.backgroundColor,
    tempSettings.textColor,
    customThemes,
  ]);

  const persistCustomThemes = (next) => {
    saveSettingsToApi({ customThemes: next }, getAdminToken()).catch(() => {});
  };

  const handleStartSavingCustomTheme = () => {
    // Suggest a unique default name
    const base = 'My Custom Theme';
    let suggested = base;
    let counter = 2;
    const taken = new Set([
      ...COLOR_PRESETS.map((p) => p.name.toLowerCase()),
      ...customThemes.map((p) => (p.name || '').toLowerCase()),
    ]);
    while (taken.has(suggested.toLowerCase())) {
      suggested = `${base} ${counter++}`;
    }
    setNewThemeName(suggested);
    setSavingCustomTheme(true);
  };

  const handleConfirmSaveCustomTheme = () => {
    const name = (newThemeName || '').trim();
    if (!name) {
      showNotification('Please enter a name for your custom theme.', 'error');
      return;
    }
    const taken = [
      ...COLOR_PRESETS.map((p) => p.name.toLowerCase()),
      ...customThemes.map((p) => (p.name || '').toLowerCase()),
    ];
    if (taken.includes(name.toLowerCase())) {
      showNotification(`A theme named "${name}" already exists. Pick a different name.`, 'error');
      return;
    }
    const newTheme = {
      id: `custom-${Date.now()}`,
      name,
      isCustom: true,
      primaryColor: tempSettings.primaryColor,
      secondaryColor: tempSettings.secondaryColor,
      accentColor: tempSettings.accentColor,
      buttonColor: tempSettings.buttonColor,
      backgroundColor: tempSettings.backgroundColor,
      textColor: tempSettings.textColor,
    };
    const next = [...customThemes, newTheme];
    setCustomThemes(next);
    persistCustomThemes(next);
    setSavingCustomTheme(false);
    setNewThemeName('');
    showNotification(`Saved "${name}" to your custom theme library.`, 'success');
  };

  const handleCancelSaveCustomTheme = () => {
    setSavingCustomTheme(false);
    setNewThemeName('');
  };

  const handleDeleteCustomTheme = (themeId, themeName) => {
    const next = customThemes.filter((t) => t.id !== themeId);
    setCustomThemes(next);
    persistCustomThemes(next);
    showNotification(`Removed "${themeName}" from your theme library.`, 'info');
  };

  // -------------------------------------------------------------------------
  // Export / Import - share custom-theme libraries across browsers + teammates
  // as a portable JSON file.
  // -------------------------------------------------------------------------
  const importFileInputRef = useRef(null);

  const handleExportCustomThemes = () => {
    if (customThemes.length === 0) {
      showNotification('No custom themes to export yet. Save one first using "Save as Custom Theme".', 'info');
      return;
    }
    const payload = {
      type: 'chainiq-custom-color-themes',
      version: 1,
      exportedAt: new Date().toISOString(),
      themes: customThemes,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `chainiq-custom-themes-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification(`Exported ${customThemes.length} custom theme${customThemes.length === 1 ? '' : 's'} as JSON.`, 'success');
    } catch (err) {
      console.error('Failed to export custom themes:', err);
      showNotification('Could not export themes - try again.', 'error');
    }
  };

  const handleImportButtonClick = () => {
    if (importFileInputRef.current) {
      importFileInputRef.current.value = '';
      importFileInputRef.current.click();
    }
  };

  const handleImportCustomThemes = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target.result || '{}'));
        const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.themes) ? parsed.themes : null);
        if (!incoming) {
          showNotification('That file does not look like a Chain-IQ theme export.', 'error');
          return;
        }

        const REQUIRED = ['primaryColor', 'secondaryColor', 'accentColor', 'buttonColor', 'backgroundColor', 'textColor'];
        const valid = incoming.filter(
          (t) => t && typeof t === 'object' && typeof t.name === 'string' && REQUIRED.every((k) => typeof t[k] === 'string')
        );
        if (valid.length === 0) {
          showNotification('No valid themes found in that file.', 'error');
          return;
        }

        // Merge: skip themes whose name collides with built-ins or existing
        // custom themes (case-insensitive). Re-issue IDs to avoid collisions.
        const builtInNames = new Set(COLOR_PRESETS.map((p) => p.name.toLowerCase()));
        const existingNames = new Set(customThemes.map((p) => (p.name || '').toLowerCase()));
        const accepted = [];
        const skipped = [];
        valid.forEach((t, idx) => {
          const lname = t.name.toLowerCase();
          if (builtInNames.has(lname) || existingNames.has(lname)) {
            skipped.push(t.name);
            return;
          }
          existingNames.add(lname);
          accepted.push({
            id: `custom-${Date.now()}-${idx}`,
            name: t.name.slice(0, 48),
            isCustom: true,
            primaryColor: t.primaryColor,
            secondaryColor: t.secondaryColor,
            accentColor: t.accentColor,
            buttonColor: t.buttonColor,
            backgroundColor: t.backgroundColor,
            textColor: t.textColor,
          });
        });

        if (accepted.length === 0) {
          showNotification(`No new themes imported - all ${skipped.length} were duplicates.`, 'info');
          return;
        }
        const next = [...customThemes, ...accepted];
        setCustomThemes(next);
        persistCustomThemes(next);

        const skippedMsg = skipped.length > 0 ? ` Skipped ${skipped.length} duplicate${skipped.length === 1 ? '' : 's'}.` : '';
        showNotification(`Imported ${accepted.length} theme${accepted.length === 1 ? '' : 's'}.${skippedMsg}`, 'success');
      } catch (err) {
        console.error('Failed to import custom themes:', err);
        showNotification('Could not read that file - make sure it is a valid Chain-IQ theme JSON.', 'error');
      }
    };
    reader.onerror = () => {
      showNotification('Failed to read the selected file.', 'error');
    };
    reader.readAsText(file);
  };

  const handleFeeChange = (e) => {
    const { name, value } = e.target;
    setTempUserFees((prev) => ({ ...prev, [name]: value === '' ? '' : parseFloat(value) }));
  };

  const handleClientFeeChange = (e) => {
    const { name, value } = e.target;
    setTempClientSpecificFees((prev) => ({
      ...prev,
      [selectedLeadId]: {
        ...prev[selectedLeadId],
        [name]: value === '' ? '' : parseFloat(value),
      },
    }));
  };

  const handleClientSelection = (leadId) => {
    setSelectedLeadId(leadId);
    if (leadId && !tempClientSpecificFees[leadId]) {
      setTempClientSpecificFees((prev) => ({ ...prev, [leadId]: {} }));
    }
  };

  const getEffectiveFee = (feeType, clientId = null) => {
    if (clientId && tempClientSpecificFees[clientId] && tempClientSpecificFees[clientId][feeType] !== undefined && tempClientSpecificFees[clientId][feeType] !== '') {
      return tempClientSpecificFees[clientId][feeType];
    }
    return tempUserFees[feeType];
  };

  // -------------------------------------------------------------------------
  // Persisting changes - backend is the ONLY store.
  //
  // saveSettingsToApi() PUT to /api/admin/settings, writes to the database,
  // and calls updateLocalSettingsState() internally so every usePlatformSettings()
  // subscriber (DataContext CSS-variable effect, admin panel, landing page)
  // re-renders with the new values - no localStorage involved.
  // -------------------------------------------------------------------------
  const [isSaving, setIsSaving] = useState(false);

  const persistSettings = async (settingsToSave, action = 'Update Platform Settings', detail = 'Updated platform configuration, branding, and color scheme.') => {
    const merged = mergePlatformSettings({
      ...settingsToSave,
      cardBrandFollowsPlatformName: false,
      cardBrandName: (settingsToSave.cardBrandName || '').trim() || 'Chain-IQ',
    });
    const result = await saveSettingsToApi(merged, getAdminToken());
    if (result.ok && result.settings) {
      setTempSettings(mergePlatformSettings(result.settings));
    } else {
      setTempSettings(merged);
    }
    setIsDirty(false);
    logAdminAction('Admin', action, detail);
    return merged;
  };

  const handleSaveSettings = async (e) => {
    e?.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const fullSettings = {
        ...tempSettings,
        userFees: tempUserFees,
        clientFees: tempClientSpecificFees,
        customThemes,
      };
      await persistSettings(fullSettings);
      setUserFees(tempUserFees);
      setClientSpecificFees(tempClientSpecificFees);
      showNotification('Platform settings, branding, and fees saved to database successfully.', 'success');
    } catch {
      showNotification('Failed to save settings. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreviewAndSave = () => setPreviewOpen(true);

  const handleConfirmFromPreview = async () => {
    setPreviewOpen(false);
    const fullSettings = {
      ...tempSettings,
      userFees: tempUserFees,
      clientFees: tempClientSpecificFees,
      customThemes,
    };
    await persistSettings(fullSettings, 'Update Platform Settings (via preview)', 'Confirmed branding & color changes from live preview.');
    showNotification('Platform settings saved to database successfully.', 'success');
  };

  const handleRevertToDefaults = async () => {
    const fresh = mergePlatformSettings({});
    setConfirmRevertOpen(false);
    setPreviewOpen(false);
    await persistSettings(
      { ...fresh, userFees: tempUserFees, clientFees: tempClientSpecificFees, customThemes },
      'Revert to Default Design',
      'Restored original Chain-IQ branding, hero copy, and color scheme.'
    );
    setTempSettings(fresh);
    showNotification('Platform restored to the default Chain-IQ design.', 'success');
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const result = await fetchSettingsHistory(getAdminToken());
    setHistoryRecords(result.history || []);
    setHistoryLoading(false);
  };

  // The "saved" snapshot used by the Live Preview modal - taken from the
  // currently live platformSettings (NOT tempSettings) so the user genuinely
  // sees a before/after.
  const savedSnapshot = useMemo(
    () => mergePlatformSettings(platformSettings),
    [platformSettings]
  );

  if (settingsLoading) {
    return (
      <div id="settings-section" className="aax-admin-section aax-settings-page-redesign" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <div style={{ textAlign: 'center', color: '#848E9C' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 14 }}></i>
          <p style={{ fontSize: 14 }}>Loading settings from database...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="settings-section" className="aax-admin-section aax-settings-page-redesign">
      <div className="aax-settings-page-header">
        <div>
          <h2>Platform Settings</h2>
          <p>Configure platform identity, branding, security, and fee rules. Changes are saved to the database and propagate to every browser immediately.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="aax-btn-binance-secondary"
            onClick={() => { setHistoryOpen(true); loadHistory(); }}
            title="View settings change history"
          >
            <i className="fas fa-history" style={{ marginRight: 6 }}></i>
            History
          </button>
          <button type="button" className="aax-btn-binance-secondary" onClick={handlePreviewAndSave}>
            <i className="fas fa-eye" style={{ marginRight: 6 }}></i>
            Preview & Save
          </button>
        </div>
      </div>

      <form className="aax-settings-form" onSubmit={handleSaveSettings}>
        {/* ---------------------------------------------------------------- */}
        {/* General                                                          */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard title="General Settings" description="Basic platform configuration and account controls.">
          <div className="aax-settings-grid aax-settings-grid-two">
            <Field label="Platform Name" hint="Displayed throughout the user app, landing page, and footer.">
              <input type="text" id="platform-name" name="platformName" value={tempSettings.platformName || ''} onChange={handleSettingChange} />
            </Field>
            <Field label="Base Currency" hint="Primary currency for transactions and displays.">
              <input type="text" id="base-currency" name="baseCurrency" value={tempSettings.baseCurrency || ''} onChange={handleSettingChange} />
            </Field>
            <Field label="Support Email" hint="Email address for user support inquiries.">
              <input type="email" id="support-email" name="supportEmail" value={tempSettings.supportEmail || ''} onChange={handleSettingChange} />
            </Field>
            <ToggleField label="Registration Enabled" hint="Allow new leads to create accounts." id="registration-enabled" name="registrationEnabled" checked={!!tempSettings.registrationEnabled} onChange={handleSettingChange} />
            <ToggleField label="KYC Required for Withdrawals" hint="Require verification before allowing fund withdrawals." id="kyc-required" name="kycRequiredForWithdrawals" checked={!!tempSettings.kycRequiredForWithdrawals} onChange={handleSettingChange} />
          </div>
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Available Deposit Assets                                         */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard
          title="Available Deposit Assets"
          description="Choose which cryptocurrencies clients can select when making a deposit. Only ticked assets appear in the client deposit dropdown."
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', marginBottom: 8 }}>
            {ALL_CRYPTO.map((c) => {
              const enabled = Array.isArray(tempSettings.availableDepositAssets)
                ? tempSettings.availableDepositAssets.includes(c.ticker)
                : true;
              return (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: enabled ? '#EAECEF' : '#5A6270',
                    userSelect: 'none',
                    minWidth: 140,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => {
                      setTempSettings((prev) => {
                        const current = Array.isArray(prev.availableDepositAssets)
                          ? prev.availableDepositAssets
                          : ALL_CRYPTO.map((x) => x.ticker);
                        const next = enabled
                          ? current.filter((t) => t !== c.ticker)
                          : [...current, c.ticker];
                        return { ...prev, availableDepositAssets: next };
                      });
                    }}
                  />
                  <span style={{ fontWeight: 600 }}>{c.ticker}</span>
                  <span style={{ color: '#848E9C', fontSize: 12 }}>{c.asset}</span>
                </label>
              );
            })}
          </div>
          <small style={{ color: '#848E9C', fontSize: 12, display: 'block', marginTop: 4 }}>
            Unticking an asset hides it from the deposit dropdown immediately after saving. Existing balances and transactions are not affected.
          </small>
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Branding & Appearance                                            */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard title="Branding & Appearance" description="Platform identity, contact info, hero content, and color scheme.">
          <div className="aax-settings-subsection">
            <h4>Platform Identity</h4>
            <div className="aax-settings-grid aax-settings-grid-three">
              <Field label="Platform Name" hint="Shows on landing page header, footer, and credit cards (when auto-follow is on).">
                <input type="text" id="platform-name-branding" name="platformName" value={tempSettings.platformName || ''} onChange={handleSettingChange} />
              </Field>
              <Field label="Platform Abbreviation" hint="The letters in the logo (e.g. 'CIQ'). Updates everywhere instantly.">
                <input type="text" id="platform-abbreviation" name="platformAbbreviation" value={tempSettings.platformAbbreviation || ''} onChange={handleSettingChange} maxLength="5" />
              </Field>
              <Field label="Platform Year" hint="Footer copyright year.">
                <input type="text" id="platform-year" name="platformYear" value={tempSettings.platformYear || ''} onChange={handleSettingChange} />
              </Field>
            </div>
          </div>

          {/* Card brand identity with auto-follow toggle */}
          <div className="aax-settings-subsection">
            <h4>Card Brand Name</h4>
            <p className="aax-settings-section-description" style={{ marginTop: -4, marginBottom: 12 }}>
              This is the brand name printed on every credit card issued to clients.
              It is independent of the platform name - type whatever you want
              cardholders to see, then watch the live preview on the right.
            </p>
            <div className="aax-settings-color-scheme-layout">
              <div className="aax-settings-color-scheme-pickers">
                <div className="aax-settings-grid aax-settings-grid-one">
                  <Field
                    label="Brand name on card"
                    hint="Up to 24 characters. Tip: short names look best on the card face."
                  >
                    <input
                      type="text"
                      id="card-brand-name"
                      name="cardBrandName"
                      value={tempSettings.cardBrandName || ''}
                      onChange={handleSettingChange}
                      placeholder="e.g. Chain-IQ, Acme Pay, Nexus Black"
                      maxLength={24}
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => setTempSettings((prev) => ({ ...prev, cardBrandName: prev.platformName || '' }))}
                  style={{
                    marginTop: 8, padding: '6px 12px', borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                    color: '#EAECEF', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                  title={`Copy "${tempSettings.platformName || 'platform name'}" into the card brand field`}
                >
                  <i className="fas fa-copy" />
                  Copy from platform name
                </button>
              </div>
              <div className="aax-settings-color-scheme-preview">
                <div className="aax-settings-color-scheme-preview-sticky">
                  <CardPreview settings={tempSettings} />
                </div>
              </div>
            </div>
          </div>

          <div className="aax-settings-subsection">
            <h4>Contact Information</h4>
            <div className="aax-settings-grid aax-settings-grid-two">
              <Field label="Phone Number" hint="Shown in the landing-page footer.">
                <input type="tel" id="platform-phone" name="platformPhone" value={tempSettings.platformPhone || ''} onChange={handleSettingChange} />
              </Field>
              <Field label="Support Email" hint="Shown in the landing-page footer and support pages.">
                <input type="email" id="support-email-branding" name="supportEmail" value={tempSettings.supportEmail || ''} onChange={handleSettingChange} />
              </Field>
              <Field label="Business Address" wide>
                <textarea id="platform-address" name="platformAddress" rows="3" value={tempSettings.platformAddress || ''} onChange={handleSettingChange} />
              </Field>
            </div>
          </div>

          <div className="aax-settings-subsection">
            <h4>Hero Content (Landing Page)</h4>
            <div className="aax-settings-grid aax-settings-grid-one">
              <Field label="Hero Header" hint="Main headline on the landing page. Use \n for line breaks.">
                <input type="text" id="hero-header" name="heroHeader" value={tempSettings.heroHeader || ''} onChange={handleSettingChange} />
              </Field>
              <Field label="Hero Statement" hint="Subheadline shown directly under the hero header.">
                <textarea id="hero-statement" name="heroStatement" rows="4" value={tempSettings.heroStatement || ''} onChange={handleSettingChange} />
              </Field>
            </div>
          </div>

          <div className="aax-settings-subsection">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <h4 style={{ margin: 0 }}>Color Scheme</h4>
              <button type="button" className="aax-btn-binance-secondary" onClick={() => setPreviewOpen(true)}>
                <i className="fas fa-eye" style={{ marginRight: 6 }}></i>
                Open Full Preview
              </button>
            </div>
            <p style={{ margin: '6px 0 14px', color: '#848E9C', fontSize: 12 }}>
              Adjust colors below - the live preview on the right updates as you type. Nothing is saved until you click <strong>Save Settings</strong> at the bottom or <strong>Open Full Preview</strong> for a side-by-side before/after.
            </p>
            <div className="aax-settings-color-scheme-layout">
              <div className="aax-settings-color-scheme-pickers">
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Quick Themes
                    </div>
                    {!savingCustomTheme && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleStartSavingCustomTheme}
                          title="Save the current six colors as a reusable theme"
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px dashed rgba(240,185,11,0.45)',
                            background: 'rgba(240,185,11,0.06)', color: '#F0B90B', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <i className="fas fa-bookmark" />
                          Save as Custom Theme
                        </button>
                        <button
                          type="button"
                          onClick={handleExportCustomThemes}
                          title="Download your custom theme library as a JSON file"
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.03)', color: '#EAECEF', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <i className="fas fa-file-export" />
                          Export ({customThemes.length})
                        </button>
                        <button
                          type="button"
                          onClick={handleImportButtonClick}
                          title="Load custom themes from a JSON file"
                          style={{
                            padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
                            background: 'rgba(255,255,255,0.03)', color: '#EAECEF', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <i className="fas fa-file-import" />
                          Import
                        </button>
                        <input
                          ref={importFileInputRef}
                          type="file"
                          accept="application/json,.json"
                          onChange={handleImportCustomThemes}
                          style={{ display: 'none' }}
                          aria-hidden="true"
                          tabIndex={-1}
                        />
                      </div>
                    )}
                  </div>

                  {savingCustomTheme && (
                    <div
                      style={{
                        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
                        padding: 10, marginBottom: 10, borderRadius: 10,
                        background: 'rgba(240,185,11,0.06)', border: '1px solid rgba(240,185,11,0.25)',
                      }}
                    >
                      <input
                        type="text"
                        autoFocus
                        value={newThemeName}
                        onChange={(e) => setNewThemeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleConfirmSaveCustomTheme(); }
                          if (e.key === 'Escape') { e.preventDefault(); handleCancelSaveCustomTheme(); }
                        }}
                        placeholder="Theme name (e.g. Acme Corp Brand)"
                        maxLength={48}
                        style={{
                          flex: '1 1 220px', minWidth: 0, padding: '8px 10px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.12)', background: '#0E1116',
                          color: '#EAECEF', fontSize: 12,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleConfirmSaveCustomTheme}
                        style={{
                          padding: '8px 14px', borderRadius: 8, border: 'none',
                          background: '#0ECB81', color: '#0a0a0f', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        <i className="fas fa-check" style={{ marginRight: 4 }} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSaveCustomTheme}
                        style={{
                          padding: '8px 12px', borderRadius: 8,
                          border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
                          color: '#EAECEF', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Category tab bar */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {THEME_CATEGORIES.map((cat) => {
                      const count = cat.id === 'all'
                        ? COLOR_PRESETS.length
                        : COLOR_PRESETS.filter((p) => THEME_CATEGORY_MAP[cat.id]?.has(p.id)).length;
                      return (
                        <ThemeCategoryTab
                          key={cat.id}
                          category={{ ...cat, label: `${cat.label} (${count})` }}
                          isActive={activeThemeCategory === cat.id}
                          onClick={setActiveThemeCategory}
                        />
                      );
                    })}
                  </div>

                  {/* Filtered preset grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                      gap: 8,
                      maxHeight: 220,
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      paddingRight: 6,
                      alignContent: 'start',
                    }}
                  >
                    {COLOR_PRESETS
                      .filter((p) =>
                        activeThemeCategory === 'all' ||
                        THEME_CATEGORY_MAP[activeThemeCategory]?.has(p.id)
                      )
                      .map((preset) => (
                        <PresetThemeButton
                          key={preset.id}
                          preset={preset}
                          isActive={activePresetId === preset.id}
                          onApply={handleApplyPreset}
                        />
                      ))}
                    {activeThemeCategory === 'all' && customThemes.map((preset) => (
                      <div key={preset.id} style={{ position: 'relative' }}>
                        <PresetThemeButton
                          preset={preset}
                          isActive={activePresetId === preset.id}
                          onApply={handleApplyPreset}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustomTheme(preset.id, preset.name);
                          }}
                          aria-label={`Delete ${preset.name} theme`}
                          title="Delete this custom theme"
                          style={{
                            position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                            borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)',
                            background: '#1E2026', color: '#F6465D', fontSize: 11, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                  {customThemes.length > 0 && (
                    <p style={{ margin: '8px 2px 0', color: '#848E9C', fontSize: 11 }}>
                      <i className="fas fa-bookmark" style={{ marginRight: 5, color: '#F0B90B' }} />
                      Your custom themes are saved in this browser. Click × to remove one.
                    </p>
                  )}
                </div>
                <div className="aax-settings-grid aax-settings-grid-two">
                  <ColorField id="primary-color" label="Primary Color" value={tempSettings.primaryColor || '#000000'} onChange={(v) => handleColorChange('primaryColor', v)} hint="Main brand color for headers and primary buttons." />
                  <ColorField id="secondary-color" label="Secondary Color" value={tempSettings.secondaryColor || '#000000'} onChange={(v) => handleColorChange('secondaryColor', v)} hint="Secondary color for cards and surfaces." />
                  <ColorField id="accent-color" label="Accent Color" value={tempSettings.accentColor || '#000000'} onChange={(v) => handleColorChange('accentColor', v)} hint="Accent color for highlights and calls to action." />
                  <ColorField id="button-color" label="Button Color" value={tempSettings.buttonColor || tempSettings.accentColor || '#000000'} onChange={(v) => handleColorChange('buttonColor', v)} hint="Primary button color for calls to action." />
                  <ColorField id="background-color" label="Background Color" value={tempSettings.backgroundColor || '#000000'} onChange={(v) => handleColorChange('backgroundColor', v)} hint="Main background color for the landing page." />
                  <ColorField id="text-color" label="Text Color" value={tempSettings.textColor || '#ffffff'} onChange={(v) => handleColorChange('textColor', v)} hint="Primary text color for readability." />
                </div>
              </div>
              <div className="aax-settings-color-scheme-preview">
                <div className="aax-settings-color-scheme-preview-sticky">
                  <PreviewPane
                    title="Live Preview"
                    settings={tempSettings}
                    badge="Pending"
                    badgeColor="#0ECB81"
                  />
                  <p style={{ margin: '10px 2px 0', color: '#848E9C', fontSize: 11, lineHeight: 1.5 }}>
                    <i className="fas fa-bolt" style={{ marginRight: 5, color: '#F0B90B' }} />
                    Updates instantly as you change any branding, hero, or color field above.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Security                                                         */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard title="Security Settings" description="Authentication and account protection rules.">
          <div className="aax-settings-grid aax-settings-grid-two">
            <ToggleField label="2FA Enforcement" hint="Require two-factor authentication for all user logins." id="2fa-enabled" name="twoFactorAuthEnabled" checked={!!tempSettings.twoFactorAuthEnabled} onChange={handleSettingChange} />
            <Field label="Session Timeout" hint="Maximum inactive time before automatic logout.">
              <input type="number" id="session-timeout" name="sessionTimeoutMinutes" value={tempSettings.sessionTimeoutMinutes || ''} onChange={handleSettingChange} />
            </Field>
            <Field label="Max Failed Login Attempts" hint="Incorrect login attempts before account lockout." wide>
              <input type="number" id="failed-login-attempts" name="maxFailedLoginAttempts" value={tempSettings.maxFailedLoginAttempts || ''} onChange={handleSettingChange} />
            </Field>
          </div>
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Lead Fees                                                        */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard title="Lead Fees" description="Global percentage and fixed fee rules.">
          <div className="aax-settings-grid aax-settings-grid-four">
            <Field label="Deposit Fee (%)">
              <input type="number" step="0.01" id="deposit-fee" name="depositFee" value={tempUserFees.depositFee ?? ''} onChange={handleFeeChange} />
            </Field>
            <Field label="Withdrawal Fee (%)">
              <input type="number" step="0.01" id="withdrawal-fee" name="withdrawalFee" value={tempUserFees.withdrawalFee ?? ''} onChange={handleFeeChange} />
            </Field>
            <Field label="Trading Fee (%)">
              <input type="number" step="0.01" id="trading-fee" name="tradingFee" value={tempUserFees.tradingFee ?? ''} onChange={handleFeeChange} />
            </Field>
            <Field label="Card Issuance Fee (USD)">
              <input type="number" step="0.01" id="card-issuance-fee" name="cardIssuanceFee" value={tempUserFees.cardIssuanceFee ?? ''} onChange={handleFeeChange} />
            </Field>
            <Field label="Card Maintenance Fee (USD/month)" wide>
              <input type="number" step="0.01" id="card-maintenance-fee" name="cardMaintenanceFee" value={tempUserFees.cardMaintenanceFee ?? ''} onChange={handleFeeChange} />
            </Field>
          </div>
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Lead-Specific Fees                                               */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard title="Lead-Specific Fees" description="Override global fees for individual leads.">
          <Field label="Select Lead" hint="Select a lead to view or modify their specific fees." wide>
            <select id="lead-select" value={selectedLeadId} onChange={(e) => handleClientSelection(e.target.value)}>
              <option value="">Choose a lead...</option>
              {leadAccounts.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.name} ({lead.email}){tempClientSpecificFees[lead.id] ? ' - Custom Fees' : ''}</option>
              ))}
            </select>
          </Field>

          {selectedLeadId && (
            <div className="aax-settings-subsection aax-settings-client-fees">
              <h4>Custom Fees for {leadAccounts.find((lead) => lead.id === selectedLeadId)?.name}</h4>
              <p>Leave fields empty to use global fees. Only set values that should override defaults.</p>
              <div className="aax-settings-grid aax-settings-grid-four">
                <Field label="Deposit Fee (%)" hint={`Effective: ${getEffectiveFee('depositFee', selectedLeadId)}%`}>
                  <input type="number" step="0.01" id="lead-deposit-fee" name="depositFee" value={tempClientSpecificFees[selectedLeadId]?.depositFee ?? ''} onChange={handleClientFeeChange} placeholder={`Global: ${tempUserFees.depositFee}%`} />
                </Field>
                <Field label="Withdrawal Fee (%)" hint={`Effective: ${getEffectiveFee('withdrawalFee', selectedLeadId)}%`}>
                  <input type="number" step="0.01" id="lead-withdrawal-fee" name="withdrawalFee" value={tempClientSpecificFees[selectedLeadId]?.withdrawalFee ?? ''} onChange={handleClientFeeChange} placeholder={`Global: ${tempUserFees.withdrawalFee}%`} />
                </Field>
                <Field label="Trading Fee (%)" hint={`Effective: ${getEffectiveFee('tradingFee', selectedLeadId)}%`}>
                  <input type="number" step="0.01" id="lead-trading-fee" name="tradingFee" value={tempClientSpecificFees[selectedLeadId]?.tradingFee ?? ''} onChange={handleClientFeeChange} placeholder={`Global: ${tempUserFees.tradingFee}%`} />
                </Field>
                <Field label="Card Issuance Fee (USD)" hint={`Effective: $${getEffectiveFee('cardIssuanceFee', selectedLeadId)}`}>
                  <input type="number" step="0.01" id="lead-card-issuance-fee" name="cardIssuanceFee" value={tempClientSpecificFees[selectedLeadId]?.cardIssuanceFee ?? ''} onChange={handleClientFeeChange} placeholder={`Global: $${tempUserFees.cardIssuanceFee}`} />
                </Field>
                <Field label="Card Maintenance Fee (USD/month)" hint={`Effective: $${getEffectiveFee('cardMaintenanceFee', selectedLeadId)}`} wide>
                  <input type="number" step="0.01" id="lead-card-maintenance-fee" name="cardMaintenanceFee" value={tempClientSpecificFees[selectedLeadId]?.cardMaintenanceFee ?? ''} onChange={handleClientFeeChange} placeholder={`Global: $${tempUserFees.cardMaintenanceFee}`} />
                </Field>
              </div>
            </div>
          )}

          {Object.keys(tempClientSpecificFees).length > 0 && (
            <div className="aax-settings-custom-fee-list">
              <h5>Leads with Custom Fees</h5>
              {Object.keys(tempClientSpecificFees).map((clientId) => {
                const lead = leadAccounts.find((item) => item.id === clientId);
                if (!lead) return null;
                const customFees = Object.keys(tempClientSpecificFees[clientId]).filter((key) => tempClientSpecificFees[clientId][key] !== undefined && tempClientSpecificFees[clientId][key] !== '');
                return <div key={clientId}>{lead.name}: {customFees.length ? customFees.join(', ') : 'No active overrides'}</div>;
              })}
            </div>
          )}
        </SettingCard>

        {/* ---------------------------------------------------------------- */}
        {/* Revert to Default Design                                         */}
        {/* ---------------------------------------------------------------- */}
        <SettingCard
          title="Revert to Default Design"
          description="Restore the original Chain-IQ visual identity - every name, color, hero copy, and contact field - back to the saved factory defaults."
          accent="#F6465D"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 6 }}>
            <div style={{ display: 'flex', gap: 12, padding: 14, background: 'rgba(246,70,93,0.06)', border: '1px solid rgba(246,70,93,0.18)', borderRadius: 10 }}>
              <i className="fas fa-exclamation-triangle" style={{ color: '#F6465D', fontSize: 18, marginTop: 2 }}></i>
              <div style={{ fontSize: 13, color: '#EAECEF', lineHeight: 1.55 }}>
                Clicking <strong>Revert to Default Design</strong> immediately restores the original platform name, abbreviation, hero text, year, contact info, and the full color scheme. This is the safety net that brings the platform back to its launch-day look.
              </div>
            </div>

            {/* Default snapshot preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <DefaultPill label="Platform Name" value={DEFAULT_PLATFORM_SETTINGS.platformName} />
              <DefaultPill label="Abbreviation" value={DEFAULT_PLATFORM_SETTINGS.platformAbbreviation} />
              <DefaultPill label="Year" value={DEFAULT_PLATFORM_SETTINGS.platformYear} />
              <DefaultPill label="Currency" value={DEFAULT_PLATFORM_SETTINGS.baseCurrency} />
              <DefaultPill label="Primary" value={DEFAULT_PLATFORM_SETTINGS.primaryColor} swatch />
              <DefaultPill label="Accent" value={DEFAULT_PLATFORM_SETTINGS.accentColor} swatch />
              <DefaultPill label="Background" value={DEFAULT_PLATFORM_SETTINGS.backgroundColor} swatch />
              <DefaultPill label="Text" value={DEFAULT_PLATFORM_SETTINGS.textColor} swatch />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setConfirmRevertOpen(true)}
                style={{ padding: '11px 22px', borderRadius: 10, background: '#F6465D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(246,70,93,0.35)' }}
              >
                <i className="fas fa-undo" style={{ marginRight: 8 }}></i>
                Revert to Default Design
              </button>
            </div>
          </div>
        </SettingCard>

        <div className="aax-settings-actions">
          <button type="button" className="aax-btn-binance-secondary" onClick={handlePreviewAndSave} style={{ marginRight: 8 }}>
            <i className="fas fa-eye" style={{ marginRight: 6 }}></i>
            Preview Changes
          </button>
          <button type="submit" className="aax-btn-binance-primary" disabled={isSaving}>
            {isSaving
              ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Saving...</>
              : <><i className="fas fa-save" style={{ marginRight: 6 }}></i>Save All Settings</>}
          </button>
        </div>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Settings History Modal                                              */}
      {/* ------------------------------------------------------------------ */}
      {historyOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setHistoryOpen(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,14,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: '#161A1E', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#EAECEF' }}>
                  <i className="fas fa-history" style={{ marginRight: 10, color: '#F0B90B' }}></i>
                  Settings Change History
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#848E9C' }}>
                  Every time a Super Admin saves platform settings, the full snapshot is recorded here.
                </p>
              </div>
              <button onClick={() => setHistoryOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#EAECEF', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 18 }}>
              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#848E9C' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
                  <p style={{ marginTop: 10, fontSize: 13 }}>Loading history...</p>
                </div>
              ) : historyRecords.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#848E9C' }}>
                  <i className="fas fa-clock" style={{ fontSize: 28, marginBottom: 10, display: 'block' }}></i>
                  <p style={{ fontSize: 13 }}>No settings changes recorded yet. Save settings to create the first entry.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyRecords.map((rec) => {
                    const changedAt = rec.changed_at ? new Date(rec.changed_at + (rec.changed_at.endsWith('Z') ? '' : 'Z')) : null;
                    const dateStr = changedAt ? changedAt.toLocaleString() : rec.changed_at;
                    const changedKeys = Array.isArray(rec.keys_changed) ? rec.keys_changed : [];
                    return (
                      <div key={rec.id} style={{ background: '#0E1116', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#EAECEF' }}>{rec.admin_name || rec.admin_id}</span>
                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: 'rgba(240,185,11,0.12)', color: '#F0B90B', fontWeight: 600 }}>{rec.admin_role}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#848E9C' }}>{dateStr}</div>
                          </div>
                          {changedKeys.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 380 }}>
                              {changedKeys.map((k) => (
                                <span key={k} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: 'rgba(14,203,129,0.1)', color: '#0ECB81', fontWeight: 600, fontFamily: 'monospace' }}>{k}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {rec.snapshot && (
                          <details style={{ marginTop: 8 }}>
                            <summary style={{ fontSize: 11, color: '#848E9C', cursor: 'pointer', userSelect: 'none' }}>View full snapshot</summary>
                            <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                              {Object.entries(rec.snapshot)
                                .filter(([k]) => !['userFees','clientFees','customThemes','cardTypes'].includes(k))
                                .map(([k, v]) => (
                                  <div key={k} style={{ display: 'flex', gap: 10, fontSize: 11, marginBottom: 3 }}>
                                    <span style={{ color: '#F0B90B', minWidth: 140, fontFamily: 'monospace' }}>{k}</span>
                                    <span style={{ color: '#EAECEF', wordBreak: 'break-word' }}>{String(v)}</span>
                                  </div>
                                ))}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <LivePreviewModal
        isOpen={previewOpen}
        savedSettings={savedSnapshot}
        pendingSettings={tempSettings}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleConfirmFromPreview}
        onRevert={() => setConfirmRevertOpen(true)}
      />

      <ConfirmRevertDialog
        isOpen={confirmRevertOpen}
        onCancel={() => setConfirmRevertOpen(false)}
        onConfirm={handleRevertToDefaults}
      />
    </div>
  );
};

const DefaultPill = ({ label, value, swatch }) => (
  <div style={{ padding: '10px 12px', background: '#161A1E', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 10, fontWeight: 700, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {swatch && <span style={{ width: 14, height: 14, borderRadius: 4, background: value, border: '1px solid rgba(255,255,255,0.12)' }} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: '#EAECEF', wordBreak: 'break-word' }}>{value}</span>
    </div>
  </div>
);

const ConfirmRevertDialog = ({ isOpen, onCancel, onConfirm }) => {
  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,14,0.78)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div style={{ background: '#161A1E', borderRadius: 14, width: '100%', maxWidth: 440, padding: 24, border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(246,70,93,0.12)', color: '#F6465D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            <i className="fas fa-undo"></i>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#EAECEF' }}>Revert to Default Design?</h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#848E9C', lineHeight: 1.55 }}>
              This restores every branding, hero, and color setting to the original Chain-IQ defaults. Fee configurations are not affected.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '9px 16px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', color: '#EAECEF', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{ padding: '9px 18px', borderRadius: 9, background: '#F6465D', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(246,70,93,0.35)' }}
          >
            Yes, Revert
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
