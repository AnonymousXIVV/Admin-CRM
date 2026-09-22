import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { articles } from '../knowledgeBase';
import { DataContext } from '../contexts/DataContext';
import { getClientMessages, sendClientMessage, markClientMessagesRead, getClientPresence, getClientMessageAttachmentUrl } from '../../api';
import { usePlatformSettings } from '../../platformDefaults';
import './Support.css';

const POLL_INTERVAL_MS     = 8000;
const PRESENCE_INTERVAL_MS = 3000;
const BOT_WELCOME_ID = 'bot-welcome';
const BOT_WAIT_ID    = 'bot-wait-agent';

const formatTime = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const Support = () => {
  const { currentUser } = useContext(DataContext);
  const platformSettingsState = usePlatformSettings();

  const chatAvailable = Boolean(currentUser?.id) && !currentUser?.impersonated;
  const platformName  = platformSettingsState?.platformName || 'Chain-IQ';

  // chatStarted persists per-user in localStorage so navigating away doesn't reset it
  const chatKey = `chainiq_chat_started_${currentUser?.id || 'guest'}`;
  const [chatStarted, setChatStarted] = useState(() => {
    try { return Boolean(localStorage.getItem(chatKey)); } catch { return false; }
  });

  const [messages, setMessages]     = useState([]);
  const [agent, setAgent]           = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [attachmentErrors, setAttachmentErrors] = useState({});
  const [sending, setSending]       = useState(false);
  const [loadError, setLoadError]   = useState('');
  const [faqSearch, setFaqSearch]   = useState('');
  const [isFaqOpen, setIsFaqOpen]   = useState(false);
  const [showBotWait, setShowBotWait] = useState(false);
  const [presence, setPresence]         = useState({ online: false, isTyping: false });
  const [systemEvents, setSystemEvents] = useState([]);

  const messagesEndRef      = useRef(null);
  const inFlightRef         = useRef(false);
  const seenAgentMsgIdsRef  = useRef(null);
  const inputRef            = useRef(null);
  const prevOnlineRef       = useRef(null);

  const hasAgentReplied   = messages.some(m => m.sender === 'agent');
  const hasUserSentMsg    = messages.some(m => m.sender === 'client');
  const supportLabel      = agent?.name ? agent.name : `${platformName} Support`;
  const agentOnline = presence.online;

  // Build the display list: real messages + synthetic bot entries
  const displayMessages = useMemo(() => {
    const out = [];
    if (chatStarted && chatAvailable) {
      out.push({
        id: BOT_WELCOME_ID, sender: 'bot', isBot: true,
        text: `Hi there! 👋 Welcome to ${platformName} Support. How can we help you today?`,
        timestamp: null,
      });
    }
    // Merge real messages with system events (joined/left notices) by timestamp
    const merged = [...messages, ...systemEvents].sort((a, b) => {
      const ta = a.timestamp || a.created_at || '';
      const tb = b.timestamp || b.created_at || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    out.push(...merged);
    if (showBotWait && !hasAgentReplied && hasUserSentMsg) {
      out.push({
        id: BOT_WAIT_ID, sender: 'bot', isBot: true,
        text: 'OK Your message has been received. An agent will be with you shortly.',
        timestamp: null,
      });
    }
    if (presence.isTyping) {
      out.push({ id: 'typing-indicator', type: 'typing' });
    }
    return out;
  }, [messages, systemEvents, chatStarted, chatAvailable, showBotWait, hasAgentReplied, hasUserSentMsg, platformName, presence.isTyping]);

  const playNotificationSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx  = new AudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046, ctx.currentTime);
      osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
    } catch (_) {}
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!chatAvailable || !chatStarted || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getClientMessages({ limit: 200 });
      setMessages(result.messages);
      setAgent(result.agent);
      setLoadError('');
      if (result.messages.some(m => m.sender === 'agent')) setShowBotWait(false);
    } catch (err) {
      setLoadError(err?.message || 'Could not load messages.');
    } finally {
      inFlightRef.current = false;
    }
  }, [chatAvailable, chatStarted]);

  const fetchPresence = useCallback(async () => {
    if (!chatAvailable || !chatStarted) return;
    try {
      const data  = await getClientPresence();
      const online = Boolean(data?.online);
      setPresence({ online, isTyping: Boolean(data?.is_typing) });
      if (prevOnlineRef.current !== null && prevOnlineRef.current !== online) {
        setSystemEvents(prev => [...prev, {
          id:        `sys-${Date.now()}`,
          type:      'system',
          text:      online ? 'Agent joined the chat.' : 'Agent left the chat.',
          timestamp: new Date().toISOString(),
        }]);
      }
      prevOnlineRef.current = online;
    } catch (_) {}
  }, [chatAvailable, chatStarted]);

  useEffect(() => {
    if (!chatAvailable || !chatStarted) return undefined;
    fetchMessages();
    const id = setInterval(() => { if (!document.hidden) fetchMessages(); }, POLL_INTERVAL_MS);
    const onFocus      = () => fetchMessages();
    const onVisibility = () => { if (!document.hidden) fetchMessages(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); window.removeEventListener('visibilitychange', onVisibility); };
  }, [chatAvailable, chatStarted, fetchMessages]);

  useEffect(() => {
    if (!chatAvailable || !chatStarted) return undefined;
    let cancelled = false;
    const rows = messages.filter(m => m.attachment && !attachmentUrls[m.id]);
    if (rows.length === 0) return undefined;
    Promise.all(rows.map(async message => {
      try {
        return { id: message.id, url: await getClientMessageAttachmentUrl(message.id) };
      } catch (err) {
        return { id: message.id, error: err?.message || 'Could not load photo.' };
      }
    })).then(results => {
      if (cancelled) return;
      setAttachmentUrls(prev => {
        const next = { ...prev };
        results.forEach(result => { if (result.url) next[result.id] = result.url; });
        return next;
      });
      setAttachmentErrors(prev => {
        const next = { ...prev };
        results.forEach(result => { if (result.error) next[result.id] = result.error; });
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [chatAvailable, chatStarted, messages, attachmentUrls]);

  useEffect(() => {
    if (!chatAvailable || !chatStarted) return undefined;
    fetchPresence();
    const id = setInterval(() => { if (!document.hidden) fetchPresence(); }, PRESENCE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [chatAvailable, chatStarted, fetchPresence]);

  useEffect(() => {
    if (!chatAvailable || !chatStarted) return;
    if (messages.some(m => m.sender === 'agent' && !m.readAt)) {
      markClientMessagesRead().then(res => { if (res?.marked > 0) fetchMessages(); });
    }
  }, [chatAvailable, chatStarted, messages, fetchMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [displayMessages.length]);

  useEffect(() => {
    if (!messages.length) return;
    const agentMsgs = messages.filter(m => m.sender === 'agent');
    if (seenAgentMsgIdsRef.current === null) {
      seenAgentMsgIdsRef.current = new Set(agentMsgs.map(m => m.id));
      return;
    }
    const newOnes = agentMsgs.filter(m => !seenAgentMsgIdsRef.current.has(m.id));
    if (newOnes.length > 0) {
      playNotificationSound();
      newOnes.forEach(m => seenAgentMsgIdsRef.current.add(m.id));
    }
  }, [messages, playNotificationSound]);

  const handleStartChat = () => {
    try { localStorage.setItem(chatKey, '1'); } catch {}
    setChatStarted(true);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleAttachmentChange = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setLoadError('Please choose a JPEG, PNG, or WebP photo.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setLoadError('Photo must be 8 MB or smaller.');
      return;
    }
    setAttachment(file);
    setLoadError('');
  };

  const sendMessage = async () => {
    const text = newMessage.trim();
    if ((!text && !attachment) || sending || !chatAvailable) return;
    setSending(true);
    const isFirst = !messages.some(m => m.sender === 'client');
    if (isFirst) setShowBotWait(true);

    const tempId    = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId, sender: 'client', text, body: text,
      timestamp: new Date().toISOString(), createdAt: new Date().toISOString(),
      readAt: null, pending: true,
      attachment: attachment ? { name: attachment.name, mime: attachment.type } : null,
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMessage('');
    setAttachment(null);

    try {
      const saved = await sendClientMessage(text, attachment);
      setMessages(prev => prev.map(m => (m.id === tempId && saved ? saved : m)));
      fetchMessages();
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setNewMessage(text);
      setLoadError(err?.message || 'Failed to send. Please try again.');
      if (isFirst) setShowBotWait(false);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const insertFaq = (faq) => {
    setNewMessage(`Regarding "${faq.title}": `);
    setIsFaqOpen(false);
    inputRef.current?.focus();
  };

  const visibleFaqs = articles.filter(f =>
    !faqSearch.trim() ||
    f.title.toLowerCase().includes(faqSearch.toLowerCase()) ||
    (f.content || '').toLowerCase().includes(faqSearch.toLowerCase())
  );

  const FaqPanel = () => (
    <div className={`faq-section${isFaqOpen ? ' is-open' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Knowledge Base</h2>
        <button type="button" className="faq-close-btn" onClick={() => setIsFaqOpen(false)}>✕</button>
      </div>
      <input
        type="text"
        placeholder="Search articles..."
        value={faqSearch}
        onChange={e => setFaqSearch(e.target.value)}
        autoComplete="off"
      />
      <div className="faq-list">
        {visibleFaqs.slice(0, 8).map(faq => (
          <div key={faq.id} className="faq-item">
            <h3>{faq.title}</h3>
            <p>{(faq.content || '').substring(0, 120)}...</p>
            {chatStarted && <button onClick={() => insertFaq(faq)}>Use in Chat</button>}
          </div>
        ))}
        {visibleFaqs.length === 0 && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: 20 }}>
            No articles found for "{faqSearch}"
          </p>
        )}
      </div>
    </div>
  );

  // ── PRE-CHAT INITIATION SCREEN ──────────────────────────────────────────────
  if (!chatStarted || !chatAvailable) {
    return (
      <div className="support-container">
        <div className="support-content">
          <div className="chat-section chat-pre-start">
            <div className="pre-chat-header">
              <div className="pre-chat-brand-row">
                <div className="pre-chat-avatar">
                  {(platformName || 'CS').slice(0, 2).toUpperCase()}
                </div>
                <div className="pre-chat-brand-name">{platformName} Support</div>
              </div>
              <div className="pre-chat-greeting">
                <h2>Hi there! 👋</h2>
                <p>
                  Welcome to <strong>{platformName}</strong> Support. We're here to help
                  with any questions about your account, transactions, or portfolio.
                </p>
              </div>
              <div className="pre-chat-status-row">
                <span className={`pre-chat-dot${chatAvailable ? ' active' : ''}`} />
                <span className="pre-chat-status-text">
                  {chatAvailable
                    ? 'Support team is online  /  typically replies in minutes'
                    : 'Sign in to your account to start chatting'}
                </span>
              </div>
            </div>

            <div className="pre-chat-body">
              {chatAvailable ? (
                <>
                  <button className="pre-chat-start-btn" onClick={handleStartChat}>
                    <i className="fas fa-comments" style={{ marginRight: 8 }} />
                    Start Conversation
                  </button>
                  <div className="pre-chat-hint">
                    <i className="fas fa-lock" style={{ fontSize: '0.7rem', opacity: 0.6 }} />
                    {' '}Encrypted  /  Available 24/7
                  </div>
                </>
              ) : (
                <div className="pre-chat-signin-note">
                  Please <strong>sign in</strong> to your account to chat with our support team.
                </div>
              )}
            </div>
          </div>

          <div
            className={`support-faq-backdrop${isFaqOpen ? ' is-open' : ''}`}
            onClick={() => setIsFaqOpen(false)}
          />
          <FaqPanel />
        </div>
      </div>
    );
  }

  // ── ACTIVE CHAT ─────────────────────────────────────────────────────────────
  return (
    <div className="support-container">
      <div className="support-content">
        <div className="chat-section">
          <div className="chat-header">
            <div className="chat-header-avatar">
              AG
            </div>
            <div className="chat-header-info">
              <span className="chat-header-name">Agent</span>
              <span className={`chat-header-status${agentOnline ? '' : ' offline'}`}>
                 {agentOnline ? 'Online' : 'Away  /  will reply soon'}
              </span>
            </div>
            <div className="chat-header-actions">
              <button
                type="button"
                className="chat-faq-toggle"
                aria-label="Toggle Knowledge Base"
                aria-expanded={isFaqOpen}
                onClick={() => setIsFaqOpen(v => !v)}
              >
                <i className={`fas fa-${isFaqOpen ? 'times' : 'bars'}`} />
              </button>
            </div>
          </div>

          <div className="chat-messages">
            {displayMessages.map(msg => {
              if (msg.type === 'system') {
                return <div key={msg.id} className="message-system">{msg.text}</div>;
              }
              if (msg.type === 'typing') {
                return (
                  <div key={msg.id} className="message other">
                    <div className="message-tag">{agent?.name || 'Agent'}</div>
                    <div className="message-bubble typing-bubble">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                );
              }
              const mine  = msg.sender === 'client';
              const isBot = msg.sender === 'bot';
              const tag   = mine
                ? (currentUser?.name || 'You')
                : isBot
                  ? `${platformName} Support`
                  : (agent?.name || 'Support Agent');
              return (
                <div key={msg.id} className={`message ${mine ? 'mine' : 'other'}${msg.pending ? ' pending' : ''}`}>
                  {!mine && <div className="message-tag">{tag}</div>}
                  <div className="message-bubble">
                    {msg.text}
                    {msg.attachment && (
                      <div className="message-attachment">
                        {attachmentUrls[msg.id] ? (
                          <>
                            <img src={attachmentUrls[msg.id]} alt={msg.attachment.name || 'Attached photo'} />
                            <a href={attachmentUrls[msg.id]} download={msg.attachment.name || 'chat-photo'}>
                              <i className="fas fa-download" /> Download photo
                            </a>
                          </>
                        ) : attachmentErrors[msg.id] ? (
                          <span>{attachmentErrors[msg.id]}</span>
                        ) : (
                          <span><i className="fas fa-spinner fa-spin" /> Loading photo...</span>
                        )}
                      </div>
                    )}
                    {msg.pending && <span className="message-pending">  /  sending...</span>}
                  </div>
                  {msg.timestamp && (
                    <div className="message-time">{formatTime(msg.timestamp)}</div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {loadError && <div className="chat-error" role="alert">{loadError}</div>}

          <div className="chat-composer">
            {attachment && (
              <div className="chat-selected-attachment">
                <span><i className="fas fa-image" /> {attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} disabled={sending} aria-label="Remove selected photo">
                  <i className="fas fa-times" />
                </button>
              </div>
            )}
            <div className="chat-input">
              <label className="chat-attach-button" title="Attach a photo">
                <i className="fas fa-paperclip" />
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAttachmentChange} disabled={sending} hidden />
              </label>
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a message... (Enter to send)"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                disabled={sending}
              />
              <button
                onClick={sendMessage}
                disabled={sending || (!newMessage.trim() && !attachment)}
                title="Send message"
              >
                {sending
                  ? <i className="fas fa-spinner fa-spin" />
                  : <i className="fas fa-paper-plane" />}
              </button>
            </div>
          </div>
        </div>

        <div
          className={`support-faq-backdrop${isFaqOpen ? ' is-open' : ''}`}
          onClick={() => setIsFaqOpen(false)}
        />
        <FaqPanel />
      </div>
    </div>
  );
};

export default Support;
