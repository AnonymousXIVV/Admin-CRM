import React, { useEffect, useState } from 'react';
import { getAdminToken } from '../adminApi';

export default function AgentAccess({ showNotification }) {
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState('');
  const [catalog, setCatalog] = useState({});
  const [capabilities, setCapabilities] = useState({});
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');

  const loadStaff = async () => {
    const response = await fetch('/api/admin/staff', {
      headers: {
        Accept: 'application/json',
        ...(getAdminToken() ? { Authorization: `Bearer ${getAdminToken()}` } : {}),
      },
    });
    const payload = await response.json();
    setStaff((payload.staff || payload.users || []).filter((user) => ['Agent', 'Team Leader', 'Office Manager'].includes(user.role)));
  };

  const loadCapabilities = async (id) => {
    if (!id) return;
    const response = await fetch(`/api/admin/staff/${encodeURIComponent(id)}/capabilities`, {
      headers: {
        Accept: 'application/json',
        ...(getAdminToken() ? { Authorization: `Bearer ${getAdminToken()}` } : {}),
      },
    });
    const payload = await response.json();
    setCatalog(payload.catalog || {});
    setCapabilities(payload.capabilities || {});
    setDirty(false);
    setStatus('');
  };

  useEffect(() => { loadStaff().catch(() => setStatus('Could not load staff accounts.')); }, []);
  useEffect(() => { loadCapabilities(selected).catch(() => setStatus('Could not load capabilities.')); }, [selected]);

  const save = async () => {
    const token = getAdminToken();
    const response = await fetch(`/api/admin/staff/${encodeURIComponent(selected)}/capabilities`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ capabilities }),
    });
    if (!response.ok) { setStatus('Could not save access.'); return; }
    setDirty(false); setStatus('Access saved.'); showNotification?.('Staff access updated.');
  };

  const currentStaff = staff.find((user) => user.id === selected);
  return (
    <div className="aax-super-admin-card agent-access-panel">
      <div className="agent-capability-heading">
        <div><h2>Agent Access</h2><p>Grant or revoke CRM tools for Agents, Team Leaders, and Office Managers.</p></div>
        <select className="aax-super-admin-select" value={selected} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Select staff account...</option>
          {staff.map((user) => <option key={user.id} value={user.id}>{user.name} - {user.role}</option>)}
        </select>
      </div>
      {currentStaff ? (
        <>
          <div className="agent-access-selected"><strong>{currentStaff.name}</strong><span>{currentStaff.email}</span><span>{currentStaff.role}</span></div>
          <div className="agent-capability-grid">
            {Object.entries(catalog).map(([key, label]) => (
              <label key={key}><input type="checkbox" checked={!!capabilities[key]} onChange={(event) => { setCapabilities((previous) => ({ ...previous, [key]: event.target.checked })); setDirty(true); }} /><span>{label}</span></label>
            ))}
          </div>
          <div className="agent-capability-actions"><span className="agent-cap-status">{status}</span><button type="button" className="aax-super-admin-btn primary" disabled={!dirty} onClick={save}>Save access</button></div>
        </>
      ) : <div className="agent-empty-state">Select a staff account to manage access.</div>}
    </div>
  );
}
