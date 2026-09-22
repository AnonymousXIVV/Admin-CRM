import React, { useState, useContext, useMemo } from 'react';
import { DataContext } from '../../App';
import { deleteAuditEntryApi, clearAuditLogApi } from '../../adminApi';

const AuditLog = () => {
  const { auditLog, leads, setAuditLog } = useContext(DataContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [tradesOnly, setTradesOnly] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [clearing, setClearing] = useState(false);

  const tradesFlipEntries = useMemo(() => {
    const all = [];
    (leads || []).forEach((lead) => {
      const history = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
      history.forEach((entry, idx) => {
        const isTradesFlip =
          (entry.from === 'Trades ON' || entry.from === 'Trades OFF') &&
          (entry.to === 'Trades ON' || entry.to === 'Trades OFF');
        if (!isTradesFlip) return;
        const clientName =
          lead.name ||
          `${lead.firstName || ''} ${lead.lastName || ''}`.trim() ||
          lead.email ||
          lead.id;
        const nowOn = entry.to === 'Trades ON';
        all.push({
          id: `${lead.id}:${idx}:${entry.at || ''}`,
          timestamp: entry.at ? new Date(entry.at) : new Date(0),
          admin: entry.byName || 'Unknown',
          action: nowOn ? 'Trades Feature ON' : 'Trades Feature OFF',
          details: `${nowOn ? 'Enabled' : 'Disabled'} Trades Feature for ${clientName}`,
          isTradesFlip: true,
          tradesNowOn: nowOn,
          clientId: lead.id,
          clientName,
        });
      });
    });
    return all;
  }, [leads]);

  const clientsWithFlips = useMemo(() => {
    const map = new Map();
    tradesFlipEntries.forEach((e) => {
      if (!map.has(e.clientId)) map.set(e.clientId, e.clientName);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [tradesFlipEntries]);

  const merged = useMemo(() => {
    const base = (auditLog || []).map((log) => ({
      ...log,
      timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
      isTradesFlip: false,
    }));
    const combined = [...base, ...tradesFlipEntries];
    combined.sort((a, b) => (b.timestamp?.getTime?.() || 0) - (a.timestamp?.getTime?.() || 0));
    return combined;
  }, [auditLog, tradesFlipEntries]);

  const filteredLogs = useMemo(() => {
    return merged.filter((log) => {
      if (tradesOnly && !log.isTradesFlip) return false;
      if (clientFilter && log.clientId !== clientFilter) return false;
      if (searchQuery) {
        const haystack = `${log.admin || ''} ${log.action || ''} ${log.details || ''} ${log.clientName || ''}`.toLowerCase();
        if (!haystack.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [merged, tradesOnly, clientFilter, searchQuery]);

  const handleDeleteEntry = async (log) => {
    if (log.isTradesFlip) return;
    if (!window.confirm('Delete this audit log entry?')) return;
    try {
      await deleteAuditEntryApi(log.id);
      if (setAuditLog) setAuditLog(prev => prev.filter(e => e.id !== log.id));
    } catch (err) {
      alert('Could not delete entry: ' + (err.message || 'Unknown error'));
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear the ENTIRE audit log? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearAuditLogApi();
      if (setAuditLog) setAuditLog([]);
    } catch (err) {
      alert('Could not clear audit log: ' + (err.message || 'Unknown error'));
    } finally {
      setClearing(false);
    }
  };

  const tradesFlipCount = tradesFlipEntries.length;
  const filteredTradesFlipCount = filteredLogs.filter((l) => l.isTradesFlip).length;

  return (
    <div id="audit-log-section" className="aax-admin-section">
      <h2>[list] Audit & Activity Logs</h2>

      <div
        className="search-container"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}
      >
        <input
          type="search"
          id="audit-log-search"
          className="aax-search-input"
          placeholder="[search]  Search by admin, action, client..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: '1 1 240px', minWidth: 220 }}
        />

        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: tradesOnly ? 'rgba(14, 203, 129, 0.15)' : '#363B44',
            border: `1px solid ${tradesOnly ? 'rgba(14, 203, 129, 0.45)' : '#444A55'}`,
            borderRadius: 6,
            color: tradesOnly ? '#0ECB81' : '#f5f6fb',
            fontSize: 13,
            cursor: 'pointer',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Show only Trades Feature ON/OFF flips"
        >
          <input
            type="checkbox"
            checked={tradesOnly}
            onChange={(e) => setTradesOnly(e.target.checked)}
            style={{ margin: 0 }}
          />
          Trades Feature flips only
          <span style={{ fontSize: 11, opacity: 0.75 }}>({tradesFlipCount})</span>
        </label>

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          style={{
            minWidth: 200,
            padding: '8px 10px',
            background: '#363B44',
            border: '1px solid #444A55',
            borderRadius: 6,
            color: '#f5f6fb',
            fontSize: 13,
          }}
          title="Filter by client"
          disabled={clientsWithFlips.length === 0}
        >
          <option value="">
            {clientsWithFlips.length === 0
              ? 'No clients with flips yet'
              : 'All clients'}
          </option>
          {clientsWithFlips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {(searchQuery || tradesOnly || clientFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setTradesOnly(false);
              setClientFilter('');
            }}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              border: '1px solid #ff646440',
              color: '#ff6464',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ✕ Clear filters
          </button>
        )}

        {(auditLog || []).length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            style={{
              padding: '8px 14px',
              background: 'rgba(246,70,93,0.12)',
              border: '1px solid #F6465D55',
              color: '#F6465D',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: clearing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {clearing ? 'Clearing...' : '🗑 Clear All'}
          </button>
        )}
      </div>

      {tradesOnly && (
        <div style={{ marginBottom: 8, fontSize: 12, color: '#a3adc0' }}>
          Showing {filteredTradesFlipCount} Trades Feature flip
          {filteredTradesFlipCount === 1 ? '' : 's'}
          {clientFilter
            ? ` for ${clientsWithFlips.find((c) => c.id === clientFilter)?.name || 'this client'}`
            : ' across all clients'}
          .
        </div>
      )}

      <div className="aax-admin-table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
        <table className="aax-admin-table">
          <thead>
            <tr>
              <th>📅 Timestamp</th>
              <th>[user] Admin</th>
              <th>⚙ Action</th>
              <th> Details</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody id="audit-log-tbody">
            {filteredLogs.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{ textAlign: 'center', padding: '32px', color: '#a3adc0' }}
                >
                  No audit logs found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const tradesPillColor = log.isTradesFlip
                  ? log.tradesNowOn
                    ? '#0ECB81'
                    : '#F0B90B'
                  : null;
                return (
                  <tr key={log.id || `${log.timestamp?.getTime?.()}-${log.action}`}>
                    <td style={{ fontSize: '0.85rem' }}>
                      {log.timestamp instanceof Date && !isNaN(log.timestamp)
                        ? log.timestamp.toLocaleString()
                        : '-'}
                    </td>
                    <td>
                      <strong>{log.admin}</strong>
                    </td>
                    <td>
                      {log.isTradesFlip ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 8px',
                            borderRadius: 999,
                            color: tradesPillColor,
                            border: `1px solid ${tradesPillColor}`,
                            background: log.tradesNowOn
                              ? 'rgba(14, 203, 129, 0.10)'
                              : 'rgba(240, 185, 11, 0.10)',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: tradesPillColor,
                            }}
                          />
                          {log.action}
                        </span>
                      ) : (
                        <code
                          style={{
                            fontSize: '0.85rem',
                            background: '#444A55',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {log.action}
                        </code>
                      )}
                    </td>
                    <td style={{ fontSize: '0.9rem', color: '#b5bac1' }}>{log.details}</td>
                    <td style={{ textAlign: 'center' }}>
                      {!log.isTradesFlip && (
                        <button
                          title="Delete this entry"
                          onClick={() => handleDeleteEntry(log)}
                          style={{
                            background: 'none',
                            border: '1px solid #F6465D55',
                            color: '#F6465D',
                            borderRadius: 4,
                            padding: '2px 7px',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AuditLog;
