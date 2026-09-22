import React, { useMemo } from 'react';

export function formatClientName(client) {
  if (!client) return '';
  if (client.firstName || client.lastName) {
    return `${client.firstName || ''} ${client.lastName || ''}`.trim();
  }
  return client.name || client.email || client.id || '';
}

export default function ClientPicker({
  clients,
  query,
  selectedId,
  onQueryChange,
  onSelect,
  label = 'Choose a client',
  placeholder = 'Search by name, email…',
  emptyMessage = 'No matching clients.',
}) {
  const matchingClients = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    const list = clients || [];
    if (!q) return list.slice(0, 12);
    return list.filter(client =>
      (client.firstName || '').toLowerCase().includes(q) ||
      (client.lastName || '').toLowerCase().includes(q) ||
      (client.name || '').toLowerCase().includes(q) ||
      (client.email || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [clients, query]);

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: 'block',
        fontSize: 11,
        color: '#a3adc0',
        marginBottom: 4,
        fontWeight: 600,
      }}>
        {label}
      </label>
      <input
        type="search"
        className="aax-search-input"
        placeholder={placeholder}
        value={query || ''}
        onChange={event => onQueryChange(event.target.value)}
        style={{ width: '100%', maxWidth: 460, marginBottom: 8 }}
        autoComplete="off"
      />
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        maxHeight: 110,
        overflowY: 'auto',
        background: '#363B44',
        border: '1px solid #444A55',
        borderRadius: 6,
        padding: 8,
      }}>
        {matchingClients.length === 0 ? (
          <span style={{ color: '#A8AEB8', fontSize: 12 }}>{emptyMessage}</span>
        ) : (
          matchingClients.map(client => (
            <button
              key={client.id}
              type="button"
              onClick={() => onSelect(client)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                cursor: 'pointer',
                border: 'none',
                fontWeight: selectedId === client.id ? 700 : 400,
                background: selectedId === client.id ? '#f3ba2f' : '#444A55',
                color: selectedId === client.id ? '#363B44' : '#848E9C',
              }}
            >
              {formatClientName(client)}{client.email ? ` · ${client.email}` : ''}
            </button>
          ))
        )}
      </div>
    </div>
  );
}