import React, { useEffect } from 'react';
import './theme/landing-phone.css';
import { usePlatformSettings } from '../platformDefaults';

const LandingPage = ({ handleShowDashboard }) => {
  const platformSettings = usePlatformSettings();

  const openLogin = () => handleShowDashboard('login');
  const openSignup = () => handleShowDashboard('signup');
  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target) } })
    }, { threshold: .15 });
    document.querySelectorAll('#landing-page-container .fade-in').forEach(el => io.observe(el));
  }, []);

  return (
    <div id="landing-page-container" className="user-ui-shell" style={{ minHeight: '100vh' }}>
        <header className="py-6 px-4 md:px-8 sticky top-0 z-50 user-ui-shell">
            <nav className="max-w-7xl mx-auto flex flex-wrap items-center justify-between">
                <div className="flex items-center space-x-2">
                    <svg className="w-7 h-7 ui-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L16.5 12 12 18.5 7.5 12 12 5.5z"/></svg>
                    <span className="font-bold text-xl tracking-tight">{platformSettings.platformName || 'Chain-IQ'}</span>
                </div>

                <div className="flex items-center gap-4 md:gap-8">
                    <div className="hidden md:flex items-center space-x-8">
                        <a href="#features" className="landing-nav-link text-sm transition">Features</a>
                        <a href="#showcase" className="landing-nav-link text-sm transition">App</a>
                        <a href="#cta" className="landing-nav-link text-sm transition">About</a>
                    </div>

                    <div className="flex items-center space-x-2 md:space-x-4">
                        <button type="button" onClick={openLogin} className="ui-btn ui-btn--primary text-sm rounded-full px-4 py-1.5">Login</button>
                        <button type="button" onClick={openSignup} className="ui-btn ui-btn--primary text-sm rounded-full px-4 py-1.5">Sign Up</button>
                    </div>
                </div>
            </nav>
        </header>

        <main className="container max-w-7xl mx-auto px-4 sm:px-6 space-y-12 md:space-y-32 py-10 md:py-20">

        <section className="landing-hero fade-in flex flex-col items-center text-center gap-8 md:gap-16 relative">
            <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center pointer-events-none landing-hero-art">
                <svg className="w-full h-auto float opacity-5" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path opacity="0.1" d="M0 150h400M200 0v300" stroke="currentColor" strokeWidth="0.5"/>
                    <g stroke="currentColor" strokeWidth="2">
                        <path d="M190 150l-20-30h40l-20 30z"/>
                        <circle cx="200" cy="150" r="15" fill="none"/>
                    </g>
                    <g opacity="0.6">
                        <circle cx="100" cy="100" r="4" fill="currentColor"/>
                        <line x1="100" y1="100" x2="198" y2="148" stroke="currentColor" strokeWidth="1"/>
                        <circle cx="300" cy="120" r="4" fill="currentColor"/>
                        <line x1="300" y1="120" x2="202" y2="148" stroke="currentColor" strokeWidth="1"/>
                        <circle cx="150" cy="220" r="4" fill="currentColor"/>
                        <line x1="150" y1="220" x2="198" y2="152" stroke="currentColor" strokeWidth="1"/>
                        <circle cx="250" cy="200" r="4" fill="currentColor"/>
                        <line x1="250" y1="200" x2="202" y2="152" stroke="currentColor" strokeWidth="1"/>
                    </g>
                    <path opacity="0.3" d="M50 250c50-100 150-50 200 0" stroke="currentColor" strokeWidth="2"/>
                    <path opacity="0.3" d="M350 250c-50-100-150-50-200 0" stroke="currentColor" strokeWidth="2"/>
                </svg>
            </div>
            <div className="max-w-xl mx-auto z-10 text-center landing-hero">
                <h1 className="hero-title text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tighter leading-tight" style={{ whiteSpace: 'pre-line' }}>
                    {platformSettings.heroHeader || 'The next-gen\ncrypto wallet.\nPowered by insights.'}
                </h1>
                <p className="landing-muted mt-4 md:text-lg landing-callout">{platformSettings.heroStatement || 'Real-time market analytics, DeFi tools, and seamless cross-chain swaps in one non-custodial wallet.'}</p>
                <div className="landing-callout btn-group">
                    <button type="button" onClick={openSignup} className="ui-btn ui-btn--primary font-bold hover:scale-105 mx-auto transition transform">
                        Get Started
                    </button>
                    <button type="button" onClick={scrollToFeatures} className="ui-btn ui-btn--secondary font-semibold mx-auto transition">
                        Learn More
                    </button>
                </div>
            </div>
        </section>

        <section id="showcase" className="fade-in">
            <div className="flex flex-col md:flex-row items-center gap-10 md:gap-20">
                <div className="landing-phone" aria-hidden="true">
                    <div className="landing-phone-frame" />
                    <div className="landing-phone-screen">
                        <div className="landing-phone-top">
                            <div className="landing-phone-dynamic-island" aria-hidden="true">
                                <span className="landing-phone-island-camera" />
                            </div>
                            <div className="landing-phone-status">
                                <span className="landing-phone-status-time">9:41</span>
                                <span className="landing-phone-status-icons">
                                    <i className="fas fa-signal" />
                                    <i className="fas fa-wifi" />
                                    <i className="fas fa-battery-full" />
                                </span>
                            </div>
                        </div>
                        <div className="landing-phone-content">
                          <div className="landing-phone-hero-card">
                            <p className="landing-phone-label">Total Portfolio</p>
                            <p className="landing-phone-value">
                                $12,450.89
                                <span className="landing-phone-change">
                                    <i className="fas fa-arrow-up" aria-hidden="true" />
                                    3.2%
                                </span>
                            </p>
                            <div className="landing-phone-allocation">
                                <span className="landing-phone-chip">
                                    <span className="landing-phone-chip-dot landing-phone-chip-dot--btc" />
                                    BTC 45%
                                </span>
                                <span className="landing-phone-chip">
                                    <span className="landing-phone-chip-dot landing-phone-chip-dot--eth" />
                                    ETH 28%
                                </span>
                                <span className="landing-phone-chip">
                                    <span className="landing-phone-chip-dot landing-phone-chip-dot--sol" />
                                    SOL 15%
                                </span>
                            </div>
                          </div>
                          <p className="landing-phone-section-title">Recent Activity</p>
                          <div className="landing-phone-activity">
                            <div className="landing-phone-row">
                              <span className="landing-phone-up">+0.12 ETH</span>
                              <span className="landing-phone-row-time">2 min ago</span>
                            </div>
                            <div className="landing-phone-row">
                              <span className="landing-phone-down">−120 USDT</span>
                              <span className="landing-phone-row-time">15 min ago</span>
                            </div>
                          </div>
                          <div className="landing-phone-nft">
                            <div className="landing-phone-nft-thumb">
                              <img
                                src="data:image/svg+xml,%3Csvg fill='%23F0B90B' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 2L2 12l10 10 10-10L12 2zm0 14.5L7.5 12 12 7.5 16.5 12 12 16.5z'/%3E%3C/svg%3E"
                                alt=""
                              />
                            </div>
                            <div>
                              <p className="landing-phone-nft-title">Azuki #4181</p>
                              <p className="landing-phone-nft-sub">Floor 14.2 ETH</p>
                            </div>
                          </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 md:pl-10">
                    <h2 className="text-3xl md:text-4xl font-bold">Trade, track & collect<br/>in one tap.</h2>
                    <p className="landing-muted mt-3 max-w-md">Live prices, push alerts, cross-chain swaps and gas-free NFT listings-all from a single, beautiful home screen.</p>
                    <ul className="mt-6 space-y-3 text-sm">
                        <li className="flex items-center gap-3"><span className="text-binance-yellow">✓</span> Real-time multi-chain portfolio</li>
                        <li className="flex items-center gap-3"><span className="text-binance-yellow">✓</span> Instant swaps with best-price routing</li>
                        <li className="flex items-center gap-3"><span className="text-binance-yellow">✓</span> Push-price alerts & limit orders</li>
                    </ul>
                </div>
            </div>
        </section>

        <section id="features" className="fade-in">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">Everything you need.<br/>Nothing you don't.</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { title: 'Bank-grade Security', body: 'Encrypted keys never leave your device. Biometric lock & secure enclave on iOS & Android.', icon: 'M12 15v-1m0 0v-1m0 1H9m3 0h3m-3 4v-1m0 0v-1m0 1H9m3 0h3m-3-8V7m0 0V6m0 1H9m3 0h3' },
                  { title: 'Multi-Chain', body: 'Ethereum, BNB Smart Chain, Polygon, Solana, Arbitrum & more-one seed phrase.', icon: 'M4 6h16M4 12h16m-7 6h7' },
                  { title: 'Gas-Free NFTs', body: `List and bid on OpenSea & LooksRare without paying gas-${platformSettings.platformName || 'Chain-IQ'} covers it.`, icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
                  { title: 'Live Analytics', body: 'Realized & unrealized PnL, cost basis, staking yield- all auto-calculated.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                  { title: 'Cross-Device Sync', body: 'Native apps for iOS, Android, Chrome & Safari. One scan to sync.', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
                  { title: 'DeFi Earn', body: 'Auto-stake, yield farm & lend with one tap. Track rewards in real time.', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
                ].map((feature) => (
                  <div key={feature.title} className="glass rounded-3xl p-6">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 landing-feature-icon">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={feature.icon}/></svg>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-sm landing-muted">{feature.body}</p>
                  </div>
                ))}
            </div>
        </section>

        </main>

        <footer id="cta" className="py-12 px-4 md:px-8 user-ui-shell">
            <div className="max-w-7xl mx-auto flex flex-col items-center text-center space-y-8">
                <div className="flex flex-col items-center space-y-2">
                    <div className="flex items-center space-x-2">
                        <svg className="w-7 h-7 ui-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L16.5 12 12 18.5 7.5 12 12 5.5z"/></svg>
                        <span className="font-bold text-xl tracking-tight">{platformSettings.platformName || 'Chain-IQ'}</span>
                    </div>
                    <p className="text-xs landing-muted max-w-sm">The next-gen crypto wallet powered by real-time market insights.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm landing-muted">
                    <a href="#features" className="landing-nav-link transition">Features</a>
                    <a href="#showcase" className="landing-nav-link transition">App</a>
                    <a href="#" className="landing-nav-link transition">Blog</a>
                    <a href="#" className="landing-nav-link transition">Press</a>
                    <a href="#" className="landing-nav-link transition">Terms of Service</a>
                    <a href="#" className="landing-nav-link transition">Privacy Policy</a>
                </div>
                {(platformSettings.platformPhone || platformSettings.supportEmail || platformSettings.platformAddress) && (
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs landing-muted">
                        {platformSettings.platformPhone && (
                            <a href={`tel:${platformSettings.platformPhone}`} className="landing-nav-link transition flex items-center gap-1.5">
                                <i className="fas fa-phone"></i> {platformSettings.platformPhone}
                            </a>
                        )}
                        {platformSettings.supportEmail && (
                            <a href={`mailto:${platformSettings.supportEmail}`} className="landing-nav-link transition flex items-center gap-1.5">
                                <i className="fas fa-envelope"></i> {platformSettings.supportEmail}
                            </a>
                        )}
                        {platformSettings.platformAddress && (
                            <span className="flex items-center gap-1.5">
                                <i className="fas fa-map-marker-alt"></i> {platformSettings.platformAddress}
                            </span>
                        )}
                    </div>
                )}
                <div className="flex space-x-4">
                    <a href="#" aria-label="Twitter" className="landing-nav-link transition"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.71v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"/></svg></a>
                    <a href="#" aria-label="LinkedIn" className="landing-nav-link transition"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd"/></svg></a>
                    <a href="#" aria-label="GitHub" className="landing-nav-link transition"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.165 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.031-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.03 1.595 1.03 2.688 0 3.848-2.338 4.695-4.566 4.943.359.308.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.001 10.001 0 0022 12c0-5.523-4.477-10-10-10z" clipRule="evenodd"/></svg></a>
                </div>
            </div>
            <div className="mt-8 text-center landing-muted text-xs">
                © {platformSettings.platformYear || '2025'} {platformSettings.platformName || 'Chain-IQ'} Technologies Inc. All Rights Reserved.
            </div>
        </footer>
    </div>
  );
};

export default LandingPage;
