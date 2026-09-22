/**
 * adminApi.js - Admin JWT session helpers + API client
 *
 * All admin auth state is stored in localStorage under two keys:
 *   chainiq_admin_token   - raw Bearer token
 *   chainiq_admin_profile - JSON-encoded admin object (for synchronous restore on mount)
 *
 * mapAdminToUser() converts the backend shape { office_id, team_id } to the
 * camelCase shape { officeId, teamId } that the CRM panels expect.
 */

const TOKEN_KEY   = 'chainiq_admin_token';
const PROFILE_KEY = 'chainiq_admin_profile';
const REQUEST_TIMEOUT_MS = 15000;

function withTimeout(fetchPromise, timeoutMs = REQUEST_TIMEOUT_MS) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timed out. Please try again.')), timeoutMs);
  });

  return Promise.race([
    fetchPromise,
    timeoutPromise,
  ]).finally(() => clearTimeout(timeoutId));
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function getAdminToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

function setAdminToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearAdminToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function getStoredAdminProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setStoredAdminProfile(admin) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(admin)); } catch {}
}

export function clearAdminSession() {
  clearAdminToken();
  try { localStorage.removeItem(PROFILE_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// Shape conversion
// ---------------------------------------------------------------------------

/**
 * Maps the backend admin object (snake_case) to the frontend user shape
 * (camelCase) that RolePage / panels expect inside data.users.
 */
export function mapAdminToUser(admin) {
  return {
    id:          admin.id,
    name:        admin.name,
    email:       admin.email,
    role:        admin.role,
    officeId:    admin.office_id  ?? null,
    teamId:      admin.team_id    ?? null,
    status:      admin.status     ?? 'Active',
    isLoggedIn:  true,
    lastLoginAt: admin.last_login_at ?? null,
    capabilities: admin.capabilities || {},
    // password is never stored on the client for real admins - the JWT is the credential
    password:    null,
  };
}

// ---------------------------------------------------------------------------
// Network calls
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/login
 * Stores the token + profile in localStorage on success.
 * Throws an Error with a human-readable message on failure.
 */
export async function adminLogin(email, password) {
  let res;
  try {
    res = await withTimeout(fetch('/api/admin/login', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      credentials: 'same-origin',
    }));
  } catch (error) {
    if (error instanceof Error && /timed out|network|Failed to fetch/i.test(error.message)) {
      throw new Error('The server did not respond in time. Please try again.');
    }
    throw new Error('Cannot reach the server. Please try again in a moment.');
  }

  let body = {};
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch (_) {
      throw new Error('Unexpected server response. Please check your connection and try again.');
    }
  }

  if (!res.ok) {
    throw new Error(body.message || 'Login failed. Please try again.');
  }
  setAdminToken(body.token);
  setStoredAdminProfile(body.admin);
  return body.admin;    // raw backend shape { id, name, email, role, office_id, team_id, ... }
}

/**
 * POST /api/admin/logout
 * Best-effort: tells the backend to clear its admin cookie pair, then wipes
 * the locally-cached token + profile no matter what (so the UI is logged
 * out even if the network call fails).
 */
export async function adminLogout() {
  const token = getAdminToken();
  try {
    await fetch('/api/admin/logout', {
      method:  'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (_) {
    /* offline / network blip - local clear below is what actually matters */
  }
  clearAdminSession();
}

/**
 * GET /api/admin/me
 * Validates the stored token and returns a fresh admin profile.
 * Throws if the token is missing, expired, or the account is disabled.
 */
export async function fetchAdminMe() {
  const token = getAdminToken();
  if (!token) throw new Error('no_token');
  let res;
  try {
    res = await withTimeout(fetch('/api/admin/me', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      credentials: 'same-origin',
    }));
  } catch (error) {
    if (error instanceof Error && /timed out|network|Failed to fetch/i.test(error.message)) {
      throw new Error('The server did not respond in time. Please try again.');
    }
    throw new Error('Cannot reach the server. Please try again in a moment.');
  }
  let body = {};
  const text = await res.text();
  if (text) {
    try { body = JSON.parse(text); } catch (_) {
      throw new Error('Unexpected server response. Please check your connection and try again.');
    }
  }
  if (!res.ok) {
    clearAdminSession();
    throw new Error(body.message || 'Session expired. Please log in again.');
  }
  const admin = {
    ...body.admin,
    capabilities: body.capabilities || body.admin?.capabilities || {},
  };
  setStoredAdminProfile(admin);
  return admin;
}

// ---------------------------------------------------------------------------
// Generic authenticated fetch
// ---------------------------------------------------------------------------

/**
 * Internal helper: every admin API call funnels through here so we get
 * uniform Bearer-token handling and uniform error messaging. JSON-only.
 *
 * Throws Error with .status (HTTP code) and .code (server `error` slug) so
 * callers can distinguish 401 vs 409 vs network failure.
 */
async function adminFetch(path, { method = 'GET', body } = {}) {
  const token = getAdminToken();
  if (!token) {
    const err = new Error('Not signed in.');
    err.status = 401;
    err.code   = 'unauthorized';
    throw err;
  }
  const init = {
    method,
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await withTimeout(fetch(path, init));
  } catch (error) {
    const err = new Error(error instanceof Error && /timed out|network|Failed to fetch/i.test(error.message)
      ? 'The server did not respond in time. Please try again.'
      : 'Cannot reach the server. Please try again in a moment.');
    err.status = 504;
    err.code = 'timeout';
    throw err;
  }

  let payload = {};
  try { payload = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(payload.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code   = payload.error || 'request_failed';
    throw err;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Admin ↔ Client support chat
// ---------------------------------------------------------------------------

function mapAdminMessage(m) {
  return {
    id:        m.id,
    sender:    m.sender,           // 'client' | 'agent'
    text:      m.body || '',
    body:      m.body || '',
    timestamp: m.created_at || null,
    createdAt: m.created_at || null,
    readAt:    m.read_at || null,
    agentId:   m.agent_id || null,
    attachment: m.attachment_path ? {
      name: m.attachment_name || 'ID card photo',
      mime: m.attachment_mime || 'image/*',
      kind: m.attachment_kind || 'ID_CARD',
      url: `/api/admin/messages/${encodeURIComponent(m.id)}/attachment`,
    } : null,
  };
}

export async function getAdminMessageAttachmentUrl(messageId) {
  const token = getAdminToken();
  const res = await fetch(`/api/admin/messages/${encodeURIComponent(messageId)}/attachment`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Could not load attachment.');
  return URL.createObjectURL(await res.blob());
}

export async function getAdminMessages(userId, { before, limit = 100 } = {}) {
  const empty = { user: null, messages: [], unreadCount: 0, hasMore: false };
  if (!userId) return empty;
  const qs = new URLSearchParams({ user_id: userId, limit: String(limit) });
  if (before) qs.set('before', before);
  try {
    const data = await adminFetch(`/api/admin/messages?${qs.toString()}`);
    return {
      user:        data?.user || null,
      messages:    Array.isArray(data?.messages) ? data.messages.map(mapAdminMessage) : [],
      unreadCount: Number(data?.unread_count || 0),
      hasMore:     Boolean(data?.has_more),
    };
  } catch (err) {
    if (err.status === 401 || err.status === 403 || err.status === 404) return empty;
    throw err;
  }
}

export async function sendAdminMessage(userId, text) {
  if (!userId) throw new Error('user_id required');
  const data = await adminFetch('/api/admin/messages', {
    method: 'POST',
    body:   { user_id: userId, body: String(text || '').trim() },
  });
  return data?.message ? mapAdminMessage(data.message) : null;
}

export async function markAdminMessagesRead(userId) {
  if (!userId) return { ok: false, marked: 0 };
  try {
    return await adminFetch('/api/admin/messages/read', {
      method: 'POST',
      body:   { user_id: userId },
    });
  } catch (_) {
    return { ok: false, marked: 0 };
  }
}

export async function getAdminUnreadMessageCounts() {
  try {
    const data = await adminFetch('/api/admin/messages/unread_counts');
    const counts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
    return { counts, total: Number(data?.total || 0) };
  } catch (_) {
    return { counts: {}, total: 0 };
  }
}

export async function getAdminNotificationsUnread() {
  try {
    const data = await adminFetch('/api/admin/notifications?limit=1&only_unread=1');
    return { unreadCount: Number(data?.unread_count || 0) };
  } catch (_) {
    return { unreadCount: 0 };
  }
}

export async function markAllAdminNotificationsRead() {
  try {
    return await adminFetch('/api/admin/notifications/read-all', { method: 'POST', body: {} });
  } catch (_) {
    return { ok: false };
  }
}

export async function listAdminNotificationsPage({ limit = 50, onlyUnread = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (onlyUnread) params.set('only_unread', '1');
  const data = await adminFetch(`/api/admin/notifications?${params.toString()}`);
  return {
    notifications: (data.notifications || []).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title || '',
      body: n.body || '',
      read: !!n.read_at,
      createdAt: n.created_at,
    })),
    unreadCount: Number(data.unread_count) || 0,
    hasMore: !!data.has_more,
  };
}

export async function markAdminNotificationRead(id) {
  return adminFetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} });
}

/** Load all leads by paging through the API (no 500-row cap). */
export async function fetchAllLeads(options = {}) {
  // The backend allows up to 10,000 rows. Fetching the current silo in one
  // request keeps local selectors and tables complete after new uploads.
  const pageSize = 10000;
  let offset = 0;
  const all = [];
  let total = 0;
  for (let page = 0; page < 200; page += 1) {
    const result = await listLeads({ ...options, limit: pageSize, offset });
    const batch = result.leads || [];
    all.push(...batch);
    total = result.total ?? all.length;
    if (!result.hasMore || batch.length === 0) break;
    offset += pageSize;
  }
  return { leads: all, total };
}

/**
 * POST /api/admin/notifications/send
 *
 * Sends a notification to one specific client (userId) or to ALL clients
 * when userId is null/undefined.
 *
 * Returns { ok: true, sent: <int> } on success, throws on error.
 */
export async function sendClientNotificationApi({ userId, message, kind = 'info' }) {
  const body = { message, kind };
  if (userId) body.user_id = userId;
  return adminFetch('/api/admin/notifications/send', { method: 'POST', body });
}

/**
 * GET /api/admin/users  (small page, for recipient dropdown)
 * Returns the first 200 active client users matching an optional search term.
 */
export async function searchClientUsersForNotify(search = '') {
  const params = new URLSearchParams({ limit: '200' });
  if (search) params.set('search', search);
  try {
    const res = await adminFetch(`/api/admin/users?${params.toString()}`);
    return (res.users || []).map(mapClientUserRow);
  } catch (_) {
    return [];
  }
}

/**
 * DELETE /api/admin/notifications/sent-log/{id}
 *
 * Recalls (un-sends) all UNREAD client notifications belonging to this log
 * entry. Returns { ok, recalled, already_read }.
 */
export async function recallNotificationApi(logId) {
  return adminFetch(`/api/admin/notifications/sent-log/${encodeURIComponent(logId)}`, {
    method: 'DELETE',
  });
}

/**
 * GET /api/admin/notifications/sent-log
 * Paginated history of notifications sent from the admin panel to clients.
 * Returns { log, total, limit, offset, hasMore }.
 */
export async function getNotificationSentLog({ limit = 50, offset = 0 } = {}) {
  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const data = await adminFetch(`/api/admin/notifications/sent-log?${params.toString()}`);
    return {
      log:     data.log     || [],
      total:   data.total   ?? 0,
      limit:   data.limit   ?? limit,
      offset:  data.offset  ?? offset,
      hasMore: data.has_more ?? false,
    };
  } catch (_) {
    return { log: [], total: 0, limit, offset, hasMore: false };
  }
}

/**
 * GET /api/admin/users/{id}/notifications
 *
 * Fetches the real notification inbox for a specific client user using the
 * admin JWT. Used before impersonation so the admin can verify that sent
 * notifications appear in the client's view.
 *
 * Returns an array of mapped notification objects (same shape as the client
 * getNotifications() helper) so the impersonated DataContext can seed them
 * directly into notificationsDataState.
 */
export async function getLeadNotificationsAsAdmin(userId) {
  try {
    const data = await adminFetch(
      `/api/admin/users/${encodeURIComponent(userId)}/notifications`
    );
    return (data.notifications || []).map((row) => ({
      id:        row.id,
      kind:      row.kind || 'info',
      message:   row.message,
      read:      row.read_at !== null && row.read_at !== undefined,
      readAt:    row.read_at || null,
      timestamp: row.created_at,
    }));
  } catch (_) {
    return [];
  }
}

export async function markAllAdminMessagesRead(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  await Promise.allSettled(userIds.map((uid) => markAdminMessagesRead(uid)));
}

export async function deleteAdminMessage(messageId) {
  if (!messageId) throw new Error('message_id required');
  return adminFetch(`/api/admin/messages/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  });
}

export async function clearAdminChat(userId) {
  if (!userId) throw new Error('user_id required');
  return adminFetch(`/api/admin/messages?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function postAdminPresence(userId, { isTyping = false } = {}) {
  if (!userId) return;
  return adminFetch('/api/admin/messages/presence', {
    method: 'POST',
    body: { user_id: userId, is_typing: isTyping },
  });
}

// ---------------------------------------------------------------------------
// Shape mappers - backend (snake_case) → frontend (camelCase)
// ---------------------------------------------------------------------------

function mapOfficeRow(o) {
  return {
    id:          o.id,
    name:        o.name,
    managerId:   o.manager_id ?? null,
    managerName: o.manager_name ?? null,
    teamCount:   o.team_count ?? 0,
    agentCount:  o.agent_count ?? 0,
    leadCount:   o.lead_count ?? 0,
    createdAt:   o.created_at ?? null,
    deletedAt:   o.deleted_at ?? null,
  };
}

function mapTeamRow(t) {
  return {
    id:         t.id,
    name:       t.name,
    officeId:   t.office_id,
    leaderId:   t.leader_id ?? null,
    leaderName: t.leader_name ?? null,
    maxSize:    t.max_size ?? 10,
    agentCount: t.agent_count ?? 0,
    leadCount:  t.lead_count ?? 0,
    createdAt:  t.created_at ?? null,
    deletedAt:  t.deleted_at ?? null,
  };
}

function mapStaffRow(s) {
  return {
    id:          s.id,
    name:        s.name,
    email:       s.email,
    role:        s.role,
    officeId:    s.office_id ?? null,
    officeName:  s.office_name ?? null,
    teamId:      s.team_id ?? null,
    teamName:    s.team_name ?? null,
    status:      s.status,
    lastLoginAt: s.last_login_at ?? null,
    createdAt:   s.created_at ?? null,
    leadCount:   s.lead_count ?? 0,
    // Frontend convenience: panels render `isLoggedIn` as a coloured dot.
    // Real admins are "logged in" only inside their own browser session, so
    // this is always false from a remote-list perspective.
    isLoggedIn:  false,
    // plain_password is stored alongside the bcrypt hash so Super Admin
    // can view credentials in the CRM panel (mirrors client_password on leads).
    password:    s.plain_password ?? '',
  };
}

// ---------------------------------------------------------------------------
// Offices
// ---------------------------------------------------------------------------

export async function listOffices({ includeDeleted } = {}) {
  const params = new URLSearchParams();
  if (includeDeleted === 'only') params.set('include_deleted', 'only');
  else if (includeDeleted) params.set('include_deleted', '1');
  const qs = params.toString();
  const { offices } = await adminFetch(`/api/admin/offices${qs ? `?${qs}` : ''}`);
  return (offices || []).map(mapOfficeRow);
}

export async function createOffice({ name, managerName, managerPassword, managerEmail }) {
  const body = { name };
  if (managerName)     body.manager_name     = managerName;
  if (managerPassword) body.manager_password = managerPassword;
  if (managerEmail)    body.manager_email    = managerEmail;
  const res = await adminFetch('/api/admin/offices', { method: 'POST', body });
  return {
    office:  mapOfficeRow(res.office),
    manager: res.manager ? mapStaffRow(res.manager) : null,
  };
}

export async function updateOffice(id, { name }) {
  const res = await adminFetch(`/api/admin/offices/${id}`, {
    method: 'PATCH',
    body: { name },
  });
  return mapOfficeRow(res.office);
}

export async function deleteOffice(id) {
  return adminFetch(`/api/admin/offices/${id}`, { method: 'DELETE' });
}

export async function restoreOfficeApi(id) {
  return adminFetch(`/api/admin/offices/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });
}

export async function deleteOfficePermanent(id) {
  return adminFetch(`/api/admin/offices/${encodeURIComponent(id)}?permanent=1`, { method: 'DELETE' });
}

export async function assignOfficeManagerApi(officeId, managerId) {
  const res = await adminFetch(`/api/admin/offices/${officeId}/manager`, {
    method: 'POST',
    body: { manager_id: managerId },
  });
  return {
    office:  mapOfficeRow(res.office),
    manager: res.manager ? mapStaffRow(res.manager) : null,
  };
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function listTeams({ includeDeleted, officeId } = {}) {
  const params = new URLSearchParams();
  if (includeDeleted === 'only') params.set('include_deleted', 'only');
  else if (includeDeleted) params.set('include_deleted', '1');
  if (officeId) params.set('office_id', officeId);
  const qs = params.toString();
  const { teams } = await adminFetch(`/api/admin/teams${qs ? `?${qs}` : ''}`);
  return (teams || []).map(mapTeamRow);
}

export async function createTeam({ officeId, name, maxSize, leaderName, leaderPassword, leaderEmail }) {
  const body = { office_id: officeId, name };
  if (maxSize        != null) body.max_size        = Number(maxSize);
  if (leaderName)             body.leader_name     = leaderName;
  if (leaderPassword)         body.leader_password = leaderPassword;
  if (leaderEmail)            body.leader_email    = leaderEmail;
  const res = await adminFetch('/api/admin/teams', { method: 'POST', body });
  return {
    team:   mapTeamRow(res.team),
    leader: res.leader ? mapStaffRow(res.leader) : null,
  };
}

export async function updateTeam(id, { name, maxSize }) {
  const body = {};
  if (name    != null) body.name     = name;
  if (maxSize != null) body.max_size = Number(maxSize);
  const res = await adminFetch(`/api/admin/teams/${id}`, { method: 'PATCH', body });
  return mapTeamRow(res.team);
}

export async function deleteTeam(id) {
  return adminFetch(`/api/admin/teams/${id}`, { method: 'DELETE' });
}

export async function restoreTeamApi(id) {
  return adminFetch(`/api/admin/teams/${encodeURIComponent(id)}/restore`, { method: 'POST', body: {} });
}

export async function deleteTeamPermanent(id) {
  return adminFetch(`/api/admin/teams/${encodeURIComponent(id)}?permanent=1`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Staff (admin accounts)
// ---------------------------------------------------------------------------

export async function listStaff() {
  const { staff } = await adminFetch('/api/admin/staff');
  return (staff || []).map(mapStaffRow);
}

export async function getStaffCapabilities(staffId) {
  return adminFetch(`/api/admin/staff/${encodeURIComponent(staffId)}/capabilities`);
}

export async function createAgentApi({ teamId, name, password, email }) {
  const body = { role: 'Agent', team_id: teamId, name, password };
  if (email) body.email = email;
  const res = await adminFetch('/api/admin/staff', { method: 'POST', body });
  return mapStaffRow(res.staff);
}

export async function updateStaffApi(id, { name, email, password, teamId }) {
  const body = {};
  if (name     != null) body.name     = name;
  if (email    != null) body.email    = email;
  if (password != null) body.password = password;
  if (teamId   != null) body.team_id  = teamId;
  const res = await adminFetch(`/api/admin/staff/${id}`, { method: 'PATCH', body });
  return mapStaffRow(res.staff);
}

export async function blockStaffApi(id, reason) {
  const body = reason ? { reason } : undefined;
  const res = await adminFetch(`/api/admin/staff/${id}/block`, { method: 'POST', body });
  return res.staff;
}

export async function unblockStaffApi(id) {
  const res = await adminFetch(`/api/admin/staff/${id}/unblock`, { method: 'POST' });
  return res.staff;
}

export async function deleteStaffApi(id) {
  const res = await adminFetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
  return res.staff;
}

// ---------------------------------------------------------------------------
// Leads (CRM) - snake_case backend ↔ camelCase frontend
//
// The frontend lead shape pre-dates the backend by a long way; it carries
// extra display-only fields (name, assignedToOffice/Team/Agent, etc.). We
// translate both directions below so panels do not have to change.
// ---------------------------------------------------------------------------

// Converts a backend `balance` row (integers in minor / satoshi units) into
// the simple display-unit dict the React UI renders (keyed by lowercase
// ticker). Mirrors the same helper in src/api.js so admin-side lead objects
// expose `balances.{usd,btc,eth,usdt,cardUsd}` for the Balances panel.
export function mapBackendBalances(row) {
  if (!row || typeof row !== 'object') return {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    usd:          num(row.fiat_minor) / 100,
    btc:          num(row.btc_sat)    / 1e8,
    eth:          num(row.eth_wei_e9) / 1e9,
    usdt:         num(row.usdt_minor) / 100,
    cardUsd:      num(row.card_minor) / 100,
    fiatCurrency: row.fiat_currency || 'USD',
    updatedAt:    row.updated_at || null,
  };
}

function mapLeadRow(l) {
  if (!l) return null;
  const first = l.first_name || '';
  const last  = l.last_name  || '';
  // Preserve the raw minor-unit balance row so the Balances panel can compute
  // deltas against the authoritative on-disk numbers, AND the display-unit
  // dict the UI renders directly.
  const rawBalance = l.balance && typeof l.balance === 'object' ? {
    fiat_minor:    Number(l.balance.fiat_minor    ?? 0),
    fiat_currency: l.balance.fiat_currency        ?? 'USD',
    btc_sat:       Number(l.balance.btc_sat       ?? 0),
    eth_wei_e9:    Number(l.balance.eth_wei_e9    ?? 0),
    usdt_minor:    Number(l.balance.usdt_minor    ?? 0),
    card_minor:    Number(l.balance.card_minor    ?? 0),
  } : null;
  return {
    id:                 l.id,
    firstName:          first,
    lastName:           last,
    name:               `${first} ${last}`.trim(),
    email:              l.email,
    phone:              l.phone || '',
    country:            l.country || '',
    countryCode:        l.country_code || '',
    stage:              l.stage,
    funnel:             l.funnel || '',
    affiliate:          l.affiliate || '',
    clientPassword:     l.client_password || '',
    tradesEnabled:      l.trades_enabled !== false,
    cardsEnabled:       l.cards_enabled  !== false,
    assignedToOffice:   l.assigned_office_id || null,
    assignedToTeam:     l.assigned_team_id   || null,
    assignedToAgent:    l.assigned_agent_id  || null,
    assignedAgentName:  l.assigned_agent_name || null,
    assignedBy:         l.assigned_by || null,
    lastCommentDate:    l.last_comment_date || '',
    registeredDate:     l.registered_date || '',
    deletedAt:          l.deleted_at || null,
    createdAt:          l.created_at,
    updatedAt:          l.updated_at,
    balance:            rawBalance,
    balances:           mapBackendBalances(l.balance),
    // Status + comment timelines, newest first.
    commentHistory:     (l.comment_history || []).map((c) => ({
      id:   c.id,
      text: c.text,
      by:   c.by_name,
      byId: c.by_admin_id,
      date: (c.created_at || '').slice(0, 10),
      createdAt: c.created_at,
    })),
    statusHistory:      (l.status_history || []).map((s) => ({
      id:     s.id,
      from:   s.from_stage,
      to:     s.to_stage,
      by:     s.by_admin_id,
      byName: s.by_name,
      at:     s.created_at,
    })),
    appointments:       Array.isArray(l.appointments) ? l.appointments : [],
  };
}

/**
 * Build the snake_case payload for a CREATE/UPDATE call. Only includes
 * keys the caller actually supplied - undefined fields are skipped so a
 * partial PATCH doesn't accidentally null out columns.
 */
function leadWritePayload(updates) {
  const map = {
    firstName:        'first_name',
    lastName:         'last_name',
    email:            'email',
    phone:            'phone',
    country:          'country',
    countryCode:      'country_code',
    stage:            'stage',
    funnel:           'funnel',
    affiliate:        'affiliate',
    clientPassword:   'client_password',
    tradesEnabled:    'trades_enabled',
    cardsEnabled:     'cards_enabled',
    comment:          'comment',
    appointments:     'appointments',
  };
  const out = {};
  for (const [camel, snake] of Object.entries(map)) {
    if (updates[camel] !== undefined) out[snake] = updates[camel];
  }
  return out;
}

export async function listLeads({
  search, stage, officeId, teamId, agentId,
  unassignedLevel, includeDeleted,
  limit = 500, offset = 0,
} = {}) {
  const params = new URLSearchParams();
  params.set('limit',  String(limit));
  params.set('offset', String(offset));
  if (search)          params.set('search', search);
  if (stage)           params.set('stage', stage);
  if (officeId)        params.set('office_id', officeId);
  if (teamId)          params.set('team_id', teamId);
  if (agentId !== undefined && agentId !== null) params.set('agent_id', String(agentId));
  if (unassignedLevel) params.set('unassigned_level', unassignedLevel);
  if (includeDeleted)  params.set('include_deleted', includeDeleted === 'only' ? 'only' : '1');
  const res = await adminFetch(`/api/admin/leads?${params.toString()}`);
  return {
    leads:   (res.leads || []).map(mapLeadRow),
    total:   res.total ?? 0,
    limit:   res.limit ?? limit,
    offset:  res.offset ?? offset,
    hasMore: !!res.has_more,
  };
}

/**
 * GET /api/admin/leads/search?q=...
 *
 * This is intentionally separate from the bulk leads list. Autocomplete
 * fields must query the current database contents, not the leads snapshot
 * loaded when the admin session started. The API applies the caller's
 * LeadSilo scope (Super Admin / Office Manager / Team Leader / Agent).
 */
export async function searchAdminLeads(query, { limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];

  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(Number(limit) || 8, 1), 100)),
  });
  const res = await adminFetch(`/api/admin/leads/search?${params.toString()}`);
  return (Array.isArray(res?.leads) ? res.leads : []).map((lead) => {
    const label = lead.name || lead.email || lead.phone || lead.id || 'Unnamed lead';
    return {
      key: lead.id,
      value: label,
      label,
      meta: [lead.email, lead.phone, lead.id && lead.id !== label ? lead.id : '']
        .filter(Boolean)
        .join('  /  '),
      lead,
    };
  });
}

export async function createLeadApi(updates) {
  const body = leadWritePayload(updates);
  // Assignment fields go in too on create.
  if (updates.assignedToOffice !== undefined) body.assigned_office_id = updates.assignedToOffice;
  if (updates.assignedToTeam   !== undefined) body.assigned_team_id   = updates.assignedToTeam;
  if (updates.assignedToAgent  !== undefined) body.assigned_agent_id  = updates.assignedToAgent;
  const res = await adminFetch('/api/admin/leads', { method: 'POST', body });
  return mapLeadRow(res.lead);
}

export async function fetchLeadById(leadId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}`);
  return mapLeadRow(res.lead);
}

export async function updateLeadApi(leadId, updates) {
  const body = leadWritePayload(updates);
  if (Object.keys(body).length === 0) {
    // Nothing to send - short-circuit so we don't 400 on the server.
    return null;
  }
  const res = await adminFetch(`/api/admin/leads/${leadId}`, { method: 'PATCH', body });
  return mapLeadRow(res.lead);
}

export async function assignLeadApi(leadId, { officeId, teamId, agentId } = {}) {
  const body = {};
  // Pass-through nulls to clear; only omit if undefined (= keep current).
  if (officeId !== undefined) body.assigned_office_id = officeId;
  if (teamId   !== undefined) body.assigned_team_id   = teamId;
  if (agentId  !== undefined) body.assigned_agent_id  = agentId;
  const res = await adminFetch(`/api/admin/leads/${leadId}/assign`, { method: 'POST', body });
  return mapLeadRow(res.lead);
}

export async function deleteLeadApi(leadId, { permanent = false, force = false } = {}) {
  let path = `/api/admin/leads/${leadId}`;
  const params = new URLSearchParams();
  if (permanent) params.set('permanent', '1');
  if (force)     params.set('force', '1');
  const qs = params.toString();
  if (qs) path += `?${qs}`;
  return adminFetch(path, { method: 'DELETE' });
}

/**
 * POST /api/admin/leads/bin/purge-all
 * Bulk-purge all (or a selected list of) soft-deleted leads in one call.
 * ids - optional string[]; if omitted, ALL soft-deleted leads are purged.
 */
export async function purgeBinLeads(ids) {
  const body = ids && ids.length > 0 ? { ids } : {};
  const data = await adminFetch('/api/admin/leads/bin/purge-all', { method: 'POST', body });
  return { deleted: Number(data?.deleted ?? 0), ids: Array.isArray(data?.ids) ? data.ids : [] };
}

export async function restoreLeadApi(leadId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}/restore`, { method: 'POST' });
  return mapLeadRow(res.lead);
}

export async function resetLeadStatusApi(leadId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}/reset-status`, { method: 'POST' });
  return mapLeadRow(res.lead);
}

export async function clearLeadCommentsApi(leadId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}/comments`, { method: 'DELETE' });
  return mapLeadRow(res.lead);
}

export async function deleteLeadCommentApi(leadId, commentId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}/comments/${commentId}`, { method: 'DELETE' });
  return mapLeadRow(res.lead);
}

export async function deleteLeadStatusEntryApi(leadId, entryId) {
  const res = await adminFetch(`/api/admin/leads/${leadId}/status-history/${entryId}`, { method: 'DELETE' });
  return mapLeadRow(res.lead);
}

export async function importLeadsApi(leads) {
  // Accept the frontend's camelCase shape and map fields the backend expects.
  const payload = leads.map((l) => ({
    first_name:         l.firstName || l.first_name || '',
    last_name:          l.lastName  || l.last_name  || '',
    email:              l.email,
    phone:              l.phone,
    country:            l.country,
    country_code:       l.countryCode || l.country_code,
    stage:              l.stage,
    funnel:             l.funnel,
    affiliate:          l.affiliate,
    client_password:    l.clientPassword || l.client_password,
    assigned_office_id: l.assignedToOffice ?? l.assigned_office_id ?? null,
    assigned_team_id:   l.assignedToTeam   ?? l.assigned_team_id   ?? null,
    assigned_agent_id:  l.assignedToAgent  ?? l.assigned_agent_id  ?? null,
  }));
  return adminFetch('/api/admin/leads/import', { method: 'POST', body: { leads: payload } });
}

export async function bulkAssignLeadsApi(leadIds, { officeId, teamId, agentId } = {}) {
  const body = { lead_ids: leadIds };
  if (officeId !== undefined) body.assigned_office_id = officeId;
  if (teamId   !== undefined) body.assigned_team_id   = teamId;
  if (agentId  !== undefined) body.assigned_agent_id  = agentId;
  return adminFetch('/api/admin/leads/assign-bulk', { method: 'POST', body });
}

// ---------------------------------------------------------------------------
// Real client users (the `users` table - distinct from CRM `leads`)
// ---------------------------------------------------------------------------

function mapClientUserRow(u) {
  if (!u) return null;
  return {
    id:             u.id,
    name:           u.name,
    email:          u.email,
    phone:          u.phone || '',
    country:        u.country || '',
    kycStatus:      u.kyc_status,
    status:         u.status,
    clientPassword: u.client_password || '',
    agentId:        u.agent_id ?? null,
    agentName:      u.agent_name ?? null,
    createdAt:      u.created_at,
    updatedAt:      u.updated_at,
    balances:       u.balances || null,
  };
}

/**
 * GET /api/admin/users - paginated, silo-scoped list of real client users.
 * Mainly used by the KYC review queue (filter by kyc_status='Under Review').
 */
export async function listClientUsers({
  search, kycStatus, status, agentId,
  limit = 50, offset = 0,
} = {}) {
  const params = new URLSearchParams();
  params.set('limit',  String(limit));
  params.set('offset', String(offset));
  if (search)    params.set('search',     search);
  if (kycStatus) params.set('kyc_status', kycStatus);
  if (status)    params.set('status',     status);
  if (agentId)   params.set('agent_id',   agentId);
  const res = await adminFetch(`/api/admin/users?${params.toString()}`);
  return {
    users:   (res.users || []).map(mapClientUserRow),
    total:   res.total ?? 0,
    limit:   res.limit ?? limit,
    offset:  res.offset ?? offset,
    hasMore: !!res.has_more,
  };
}

/**
 * POST /api/admin/users/{id}/set-password
 *
 * Directly sets a client's password to the given value so it works for login
 * immediately. Stores both the hash (for auth) and the plain-text copy (for
 * admin CRM visibility). Invalidates all existing sessions for that client.
 *
 * Authorized for Super Admin and Office Manager.
 */
export async function adminSetClientPassword(userId, newPassword) {
  return adminFetch(`/api/admin/users/${userId}/set-password`, {
    method: 'POST',
    body:   { new_password: newPassword },
  });
}

// ---------------------------------------------------------------------------
// KYC review (Super Admin + Office Manager)
// ---------------------------------------------------------------------------

const KYC_KIND_LABEL = {
  ID_FRONT: 'Identity Document (Front)',
  ID_BACK:  'Identity Document (Back)',
  SELFIE:   'Selfie with ID',
  POA:      'Proof of Address',
};

function mapKycDocRow(d) {
  const label = KYC_KIND_LABEL[d.kind] || d.kind;
  return {
    id:         d.id,
    kind:       d.kind,
    name:       label,
    label,
    docType:    label,
    type:       'application/octet-stream',
    uploadedAt: d.uploaded_at,
    reviewedBy: d.reviewed_by ?? null,
    reviewedAt: d.reviewed_at ?? null,
    decision:   d.decision ?? null,
  };
}

/** Download a KYC file to the user's disk (admin JWT). */
export async function downloadKycFile(userId, docId, filename = 'kyc-document') {
  const { url, revoke } = await fetchKycFileObjectUrl(userId, docId);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    revoke();
  }
}

/** GET /api/admin/users/{id}/kyc → user summary + every uploaded doc. */
export async function getUserKyc(userId) {
  const res = await adminFetch(`/api/admin/users/${userId}/kyc`);
  return {
    user:      res.user || null,                       // { id, name, email, kyc_status }
    documents: (res.documents || []).map(mapKycDocRow),
  };
}

/** POST /api/admin/users/{id}/kyc/approve - flips status to Approved. */
export async function approveUserKyc(userId, { note } = {}) {
  const body = note ? { note } : {};
  const res = await adminFetch(`/api/admin/users/${userId}/kyc/approve`, { method: 'POST', body });
  return res.user || null;
}

/** POST /api/admin/users/{id}/kyc/reject - flips status to Failed. */
export async function rejectUserKyc(userId, { reason } = {}) {
  const body = reason ? { reason } : {};
  const res = await adminFetch(`/api/admin/users/${userId}/kyc/reject`, { method: 'POST', body });
  return res.user || null;
}

/** DELETE /api/admin/users/{id}/kyc - removes all KYC docs and resets status. */
export async function deleteUserKyc(userId) {
  return adminFetch(`/api/admin/users/${userId}/kyc`, { method: 'DELETE' });
}

/** POST /api/admin/users/{id}/kyc/revoke - resets KYC to Not Submitted (keeps docs for audit). */
export async function revokeUserKyc(userId, { reason } = {}) {
  const body = reason ? { reason } : {};
  const res = await adminFetch(`/api/admin/users/${userId}/kyc/revoke`, { method: 'POST', body });
  return res.user || null;
}

/**
 * GET /api/admin/users/{id}/kyc/{docId}/file
 *
 * The endpoint streams binary, which a plain <img src> can't request with the
 * Bearer header. We fetch the file ourselves, wrap it in a Blob, and return an
 * object-URL the caller can drop straight into <img>/<a download>.
 *
 * The caller is responsible for revoking the URL when it's no longer needed
 * (URL.revokeObjectURL) - we surface it via the returned `revoke()` helper.
 */
/**
 * POST /api/admin/users/{userId}/balances
 *
 * Injects (or deducts) a balance delta for one asset on a user account.
 * amount_minor is a signed integer - positive credits, negative debits.
 * The backend writes the balances row, a ledger transaction, and an audit
 * entry atomically.
 *
 * asset        - 'USD' | 'BTC' | 'ETH' | 'USDT' | 'CARD'
 * amount_minor - signed integer in the asset's minor unit:
 *                 USD/USDT/CARD → cents (×100)
 *                 BTC           → satoshis (×1e8)
 *                 ETH           → gwei (×1e9)
 * type         - optional: 'Deposit'|'Withdraw'|'Adjustment'|...
 * description  - optional free-form note shown in the client ledger
 *
 * Returns { balances, transaction } on success.
 */
/**
 * POST /api/admin/users/{userId}/cards
 *
 * Issues a card to a user. Super Admin only.
 * type - 'Premium' | 'Gold' | 'Platinum'
 * pin  - 4-6 digit string stored hashed server-side
 * Returns { card: { id, type, status, issued_at, issued_by } }
 */
export async function issueCard(userId, { type, pin } = {}) {
  return adminFetch(`/api/admin/users/${userId}/cards`, {
    method: 'POST',
    body: { type, pin },
  });
}

/**
 * Admin card management - all operations are scoped to a user because
 * `cards.user_id` is unique (one card per user). The userId argument
 * therefore comes from the local card record's `userId` field.
 */

// GET /api/admin/cards - all cards visible to the acting admin, each
// augmented with user_name and user_email from the users table.
export async function adminGetAllCards() {
  return adminFetch('/api/admin/cards');
}

// GET /api/admin/users/{userId}/cards - full card detail (incl. parsed limits).
export async function adminGetUserCard(userId) {
  return adminFetch(`/api/admin/users/${userId}/cards`);
}

// POST /api/admin/users/{userId}/cards/freeze - toggles Active <-> Frozen.
// Returns { card_id, status } where status is the new value.
export async function adminFreezeCard(userId) {
  return adminFetch(`/api/admin/users/${userId}/cards/freeze`, { method: 'POST' });
}

// POST /api/admin/users/{userId}/cards/block - moves to Blocked. `reason`
// is recorded in the audit log. Server requires a non-empty reason.
export async function adminBlockCard(userId, reason) {
  return adminFetch(`/api/admin/users/${userId}/cards/block`, {
    method: 'POST',
    body: { reason },
  });
}

// POST /api/admin/users/{userId}/cards/unblock - Blocked -> Active.
export async function adminUnblockCard(userId) {
  return adminFetch(`/api/admin/users/${userId}/cards/unblock`, { method: 'POST' });
}

// POST /api/admin/users/{userId}/cards/revoke - DELETEs the card row entirely.
// Used by both "revoke" and "delete" UI actions; reason is required.
export async function adminRevokeCard(userId, reason) {
  return adminFetch(`/api/admin/users/${userId}/cards/revoke`, {
    method: 'POST',
    body: { reason },
  });
}

// POST /api/admin/users/{userId}/cards/pin - admin reset (no current_pin
// required, since admins are recovering for clients who forgot theirs).
// Server stores a bcrypt hash, so plaintext can never be retrieved later.
export async function adminSetCardPin(userId, newPin) {
  return adminFetch(`/api/admin/users/${userId}/cards/pin`, {
    method: 'POST',
    body: { new_pin: newPin },
  });
}

// GET /api/admin/users/{userId}/cards/pin-info - returns
// { has_pin, can_reveal: false }. We only show whether one is set; the
// hash is irreversible, so plaintext display is intentionally impossible.
export async function adminGetCardPinInfo(userId) {
  return adminFetch(`/api/admin/users/${userId}/cards/pin-info`);
}

// POST /api/admin/users/{userId}/cards/limits - server merges the partial
// body and returns the merged limits object.
export async function adminSetCardLimits(userId, limits) {
  return adminFetch(`/api/admin/users/${userId}/cards/limits`, {
    method: 'POST',
    body: limits,
  });
}

// POST /api/admin/users/{userId}/cards/details - set/edit PAN, CVV, expiry,
// or PIN on the user's card. All fields optional; server validates each
// supplied field independently. Returns the updated card row.
export async function adminUpdateCardDetails(userId, details) {
  return adminFetch(`/api/admin/users/${userId}/cards/details`, {
    method: 'POST',
    body: details,
  });
}

// DELETE /api/admin/cards/audit - delete specific audit entries by id array.
export async function adminDeleteCardAuditEntries(ids) {
  return adminFetch('/api/admin/cards/audit', {
    method: 'DELETE',
    body: { ids },
  });
}

// DELETE /api/admin/cards/audit/all - wipe the entire card audit log.
export async function adminClearCardAudit() {
  return adminFetch('/api/admin/cards/audit/all', { method: 'DELETE' });
}

// GET /api/admin/cards/audit - returns the audit trail for card-related
// actions (admin freeze/block/revoke/limits/details + client apply/limits/pin).
// Optional user_id filter scopes to a single cardholder. Each admin only
// sees entries for cardholders within their visibility scope.
export async function adminListCardAudit({ userId = '', limit = 100, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (userId) qs.set('user_id', userId);
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  return adminFetch(`/api/admin/cards/audit?${qs.toString()}`);
}

export async function injectBalance(userId, { asset, amount_minor, type, description, created_at, fee_minor } = {}) {
  const body = { asset, amount_minor };
  if (type)                    body.type        = type;
  if (description)             body.description = description;
  if (created_at)              body.created_at  = created_at;
  if (fee_minor != null && fee_minor > 0) body.fee_minor = fee_minor;
  return adminFetch(`/api/admin/users/${userId}/balances`, { method: 'POST', body });
}

/**
 * GET /api/admin/users/{id}/balance-history
 *
 * Returns the user's authoritative current balance row plus the audit-log
 * timeline of every admin balance injection. Used by the Balances panel so
 * the operator sees real numbers (not whatever was cached in the leads
 * list at panel mount) and can audit who changed what.
 *
 * Returned shape (already display-unit-friendly):
 *   {
 *     user:    { id, name, email },
 *     balance: { fiat_minor, btc_sat, eth_wei_e9, usdt_minor, card_minor, fiat_currency, updated_at },
 *     balances:{ usd, btc, eth, usdt, cardUsd, fiatCurrency, updatedAt },   // display
 *     history: [
 *       { id, asset, ticker, balanceKey, beforeMinor, afterMinor, deltaMinor,
 *         previousBalance, newBalance, delta, txId, txType, actorAdminId,
 *         actorRole, actorName, assetName, date }
 *     ]
 *   }
 */
const BALANCE_KEY_TO_TICKER = {
  fiat_minor: 'USD',
  btc_sat:    'BTC',
  eth_wei_e9: 'ETH',
  usdt_minor: 'USDT',
  card_minor: 'CARD',
};
const TICKER_TO_DIVISOR = {
  USD:  100,
  BTC:  1e8,
  ETH:  1e9,
  USDT: 100,
  CARD: 100,
};
const TICKER_TO_NAME = {
  USD:  'US Dollar',
  BTC:  'Bitcoin',
  ETH:  'Ethereum',
  USDT: 'USDT',
  CARD: 'Card',
};

function mapBalanceHistoryRow(h) {
  const ticker  = h.asset || BALANCE_KEY_TO_TICKER[h.balance_key] || h.balance_key || '';
  const divisor = TICKER_TO_DIVISOR[ticker] || 1;
  const before  = Number(h.before_minor || 0) / divisor;
  const after   = Number(h.after_minor  || 0) / divisor;
  return {
    id:               h.id,
    asset:            ticker,
    ticker,
    assetName:        TICKER_TO_NAME[ticker] || ticker,
    balanceKey:       h.balance_key,
    beforeMinor:      Number(h.before_minor || 0),
    afterMinor:       Number(h.after_minor  || 0),
    deltaMinor:       Number(h.delta_minor  || 0),
    previousBalance:  before,
    newBalance:       after,
    delta:            after - before,
    txId:             h.tx_id    || null,
    txType:           h.tx_type  || null,
    actorAdminId:     h.actor_admin_id || null,
    actorRole:        h.actor_role     || null,
    actorName:        h.actor_name     || null,
    date:             h.created_at,
  };
}

export async function getLeadBalanceHistory(userId) {
  const res = await adminFetch(`/api/admin/users/${userId}/balance-history`);
  const balance = res.balance || {};
  return {
    user:     res.user || null,
    balance: {
      fiat_minor:    Number(balance.fiat_minor    ?? 0),
      fiat_currency: balance.fiat_currency        ?? 'USD',
      btc_sat:       Number(balance.btc_sat       ?? 0),
      eth_wei_e9:    Number(balance.eth_wei_e9    ?? 0),
      usdt_minor:    Number(balance.usdt_minor    ?? 0),
      card_minor:    Number(balance.card_minor    ?? 0),
      updated_at:    balance.updated_at ?? null,
    },
    balances: mapBackendBalances(balance),
    history:  (res.history || []).map(mapBalanceHistoryRow),
  };
}

export async function fetchKycFileObjectUrl(userId, docId) {
  const token = getAdminToken();
  if (!token) {
    const err = new Error('Not signed in.');
    err.status = 401; err.code = 'unauthorized';
    throw err;
  }
  const res = await fetch(`/api/admin/users/${userId}/kyc/${docId}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch {}
    const err = new Error(payload.message || `Request failed (${res.status})`);
    err.status = res.status; err.code = payload.error || 'request_failed';
    throw err;
  }
  const mime = res.headers.get('Content-Type') || 'application/octet-stream';
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  return {
    url,
    mime,
    isImage: mime.startsWith('image/'),
    revoke: () => { try { URL.revokeObjectURL(url); } catch {} },
  };
}

// ---------------------------------------------------------------------------
// Crypto deposit address book
// ---------------------------------------------------------------------------
//
// Server-side replacement for the old localStorage `globalAddressData` /
// `clientAddressData` arrays. The server stores everything in the
// `crypto_addresses` table; the user-facing /api/client/crypto/addresses
// endpoint reads the same source so admin edits flow through immediately.

/**
 * GET /api/admin/crypto/addresses
 * Returns the full address book split by scope: { global: [...], client: [...] }.
 */
export async function listCryptoAddresses() {
  const data = await adminFetch('/api/admin/crypto/addresses');
  return {
    global: Array.isArray(data?.global) ? data.global : [],
    client: Array.isArray(data?.client) ? data.client : [],
  };
}

/**
 * POST /api/admin/crypto/addresses
 * scope='global'  → { scope, asset, addresses, asset_name? }
 * scope='client'  → { scope, asset, addresses, user_id, asset_name? }
 */
export async function createCryptoAddress({ scope, asset, addresses, userId, assetName, network }) {
  const body = { scope, asset, addresses };
  if (assetName) body.asset_name = assetName;
  if (network)   body.network    = network;
  if (scope === 'client') body.user_id = userId;
  const data = await adminFetch('/api/admin/crypto/addresses', { method: 'POST', body });
  return data?.entry || null;
}

/** PATCH /api/admin/crypto/addresses/{id} - replaces the addresses list. */
export async function updateCryptoAddress(id, { addresses, status, network }) {
  const body = { addresses };
  if (status)             body.status  = status;
  if (network !== undefined) body.network = network;
  const data = await adminFetch(
    `/api/admin/crypto/addresses/${encodeURIComponent(id)}`,
    { method: 'PATCH', body }
  );
  return data?.entry || null;
}

/** POST /api/admin/crypto/addresses/{id}/revoke - soft-deprecate. */
export async function revokeCryptoAddress(id) {
  const data = await adminFetch(
    `/api/admin/crypto/addresses/${encodeURIComponent(id)}/revoke`,
    { method: 'POST', body: {} }
  );
  return data?.entry || null;
}

/**
 * POST /api/admin/crypto/addresses/bulk
 * rows = [{ scope, asset, addresses, email?, asset_name? }, ...]
 */
export async function bulkImportCryptoAddresses(rows) {
  const data = await adminFetch(
    '/api/admin/crypto/addresses/bulk',
    { method: 'POST', body: { rows } }
  );
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    imported: Number(data?.imported || 0),
  };
}

// ---------------------------------------------------------------------------
// Admin transactions (silo-scoped global ledger)
// ---------------------------------------------------------------------------
//
// Replaces the legacy localStorage cache `chainiq_transactions_global` that
// previously powered the SuperAdminPanel "Transactions" tab. The backend now
// owns the canonical list - these helpers are the only path admins should use
// to read or mutate the ledger.
//
// Backend → admin shape mapping is centralised in `mapBackendAdminTx` so
// all callers see the same field names.

// Per-asset minor-unit decimals. Mirrors ASSET_INFO in src/api.js but kept
// local so this file has no dependency on the client API module. Anything not
// listed here defaults to 2 decimals (cents-style).
const ADMIN_TX_DECIMALS = {
  USD: 2, USDT: 2, USDC: 2, CARD: 2,
  BTC: 8, ETH: 9, BNB: 8, SOL: 9, XRP: 6, ADA: 6,
  DOGE: 8, AVAX: 9, DOT: 10, LINK: 18, MATIC: 18, LTC: 8,
  TRX: 6, BCH: 8, UNI: 18,
};

function decimalsFor(asset) {
  const code = String(asset || '').toUpperCase();
  return ADMIN_TX_DECIMALS[code] ?? 2;
}

/** Convert a display amount + asset code into a signed minor-unit integer. */
export function adminAmountToMinor(amount, asset) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * Math.pow(10, decimalsFor(asset)));
}

/** Convert a signed minor-unit integer back into a JS number for display. */
export function adminAmountFromMinor(amountMinor, asset) {
  const n = Number(amountMinor) || 0;
  return n / Math.pow(10, decimalsFor(asset));
}

/**
 * Backend row → admin UI shape. Admin components expect lowercase type/status,
 * a numeric `amount`, and a `currency` field (vs. backend's `asset`).
 */
export function mapBackendAdminTx(row) {
  if (!row) return null;
  const asset = String(row.asset || '').toUpperCase();
  return {
    id:           row.id,
    userId:       row.user_id,
    userName:     row.user_name  || null,
    userEmail:    row.user_email || null,
    type:         String(row.type   || '').toLowerCase(),
    status:       String(row.status || '').toLowerCase(),
    amount:       adminAmountFromMinor(row.amount_minor, asset),
    feeAmount:    adminAmountFromMinor(row.fee_minor ?? 0, asset),
    currency:     asset,
    note:         row.description || '',
    description:  row.description || '',
    date:         row.created_at,
    createdAt:    row.created_at,
    createdBy:    row.created_by || null,
    hidden:       row.hidden ? true : false,
    displayOrder: row.display_order ?? null,
  };
}

/** Title-case a free-form string ("deposit" → "Deposit"). */
function titleCase(s) {
  const v = String(s || '').trim();
  if (!v) return v;
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

/**
 * GET /api/admin/transactions - silo-scoped list across every visible client.
 * Returns { transactions, total, limit, offset, hasMore } where
 * `transactions` are already mapped to the admin UI shape.
 */
/**
 * GET /api/admin/users/{id}/transactions
 * Fetches the transaction ledger for a single client. Silo-enforced.
 * Optional filters: type, asset, status, from (ISO ts), to (ISO ts).
 */
export async function listUserTransactions(userId, {
  limit = 200, offset = 0, type = '', asset = '', status = '', from = '', to = '',
} = {}) {
  if (!userId) {
    const err = new Error('userId is required'); err.code = 'bad_request'; throw err;
  }
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type)   qs.set('type',   type);
  if (asset)  qs.set('asset',  asset);
  if (status) qs.set('status', status);
  if (from)   qs.set('from',   from);
  if (to)     qs.set('to',     to);
  const data = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/transactions?${qs.toString()}`
  );
  const DIVISORS = { BTC: 1e8, ETH: 1e9, USDT: 100, USD: 100, CARD: 100 };
  const rows = (data?.transactions || []).map((r) => {
    const divisor = DIVISORS[r.asset] || 100;
    return {
      id:          r.id,
      type:        r.type,
      asset:       r.asset,
      amountMinor: Number(r.amount_minor),
      amount:      Number(r.amount_minor) / divisor,
      description: r.description || '',
      status:      r.status,
      createdBy:   r.created_by || null,
      createdAt:   r.created_at,
    };
  });
  return {
    transactions: rows,
    total:        Number(data?.total  || 0),
    limit:        Number(data?.limit  || limit),
    offset:       Number(data?.offset || offset),
    hasMore:      Boolean(data?.has_more),
  };
}

export async function listAllTransactions({
  limit = 200, offset = 0, type = '', asset = '', status = '', search = '',
} = {}) {
  const qs = new URLSearchParams();
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  if (type)   qs.set('type',   titleCase(type));
  if (asset)  qs.set('asset',  String(asset).toUpperCase());
  if (status) qs.set('status', titleCase(status));
  if (search) qs.set('search', search);

  const data = await adminFetch(`/api/admin/transactions?${qs.toString()}`);
  const rows = Array.isArray(data?.transactions) ? data.transactions : [];
  return {
    transactions: rows.map(mapBackendAdminTx),
    total:        Number(data?.total  || 0),
    limit:        Number(data?.limit  || limit),
    offset:       Number(data?.offset || offset),
    hasMore:      Boolean(data?.has_more),
  };
}

/**
 * POST /api/admin/transactions - write a new ledger row.
 * `tx` is in admin UI shape (`userId`, `type`, `amount`, `currency`, ...).
 * Returns the canonical row, mapped back to admin UI shape.
 */
export async function createTransactionApi(tx) {
  if (!tx || !tx.userId) {
    const err = new Error('userId is required'); err.code = 'bad_request'; throw err;
  }
  const currency = String(tx.currency || 'USD').toUpperCase();
  const body = {
    user_id:        tx.userId,
    type:           tx.type || 'Deposit',
    asset:          currency,
    amount_minor:   adminAmountToMinor(tx.amount, currency),
    description:    tx.note || tx.description || null,
    status:         titleCase(tx.status || 'Completed'),
    affect_balance: tx.affectBalance === true,
  };
  if (tx.date)                            body.created_at = tx.date;
  if (tx.feeAmount != null && tx.feeAmount > 0) {
    body.fee_minor = adminAmountToMinor(tx.feeAmount, currency);
  }

  const data = await adminFetch('/api/admin/transactions', { method: 'POST', body });
  // Return both transaction and optional fresh balances.
  return {
    transaction: mapBackendAdminTx(data?.transaction),
    balances:    data?.balances || null,
  };
}

/**
 * DELETE /api/admin/transactions/{id}
 * Removes a single transaction. Pass reverseBalance=true to also undo the
 * balance impact on the client's account.
 */
export async function deleteTransactionApi(transactionId, reverseBalance = false) {
  if (!transactionId) {
    const err = new Error('transactionId is required'); err.code = 'bad_request'; throw err;
  }
  await adminFetch(
    `/api/admin/transactions/${encodeURIComponent(transactionId)}`,
    { method: 'DELETE', body: { reverse_balance: reverseBalance } }
  );
}

/**
 * DELETE /api/admin/users/{id}/transactions
 * Wipes the entire transaction ledger for one client (Super Admin only).
 */
export async function clearUserTransactionsApi(userId) {
  if (!userId) {
    const err = new Error('userId is required'); err.code = 'bad_request'; throw err;
  }
  const data = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/transactions`,
    { method: 'DELETE' }
  );
  return data;
}

/**
 * PATCH /api/admin/transactions/{id} - status-only change (approve/reject).
 * Returns the canonical row.
 */
export async function updateTransactionStatusApi(transactionId, status) {
  if (!transactionId) {
    const err = new Error('transactionId is required'); err.code = 'bad_request'; throw err;
  }
  const data = await adminFetch(
    `/api/admin/transactions/${encodeURIComponent(transactionId)}`,
    { method: 'PATCH', body: { status: titleCase(status) } }
  );
  return mapBackendAdminTx(data?.transaction);
}

/**
 * PATCH /api/admin/transactions/{id} - full field edit.
 *
 * Any combination of: type, currency/asset, amount (signed display),
 * fee (display), description, status, date.
 *
 * When `affectBalanceDelta` (signed display number) is provided together with
 * `affectBalanceCurrency`, the backend also adjusts the client's balance
 * column by that amount (converted to minor units).
 *
 * Returns { transaction, balances? }
 */
export async function updateTransactionFullApi(transactionId, fields) {
  if (!transactionId) {
    const err = new Error('transactionId is required'); err.code = 'bad_request'; throw err;
  }
  const currency = String(fields.currency || fields.asset || 'USD').toUpperCase();
  const body = {};

  if (fields.type        !== undefined) body.type         = fields.type;
  if (fields.currency    !== undefined) body.asset         = currency;
  if (fields.amount      !== undefined) body.amount_minor  = adminAmountToMinor(fields.amount, currency);
  if (fields.fee         !== undefined) body.fee_minor     = adminAmountToMinor(Math.max(0, Number(fields.fee) || 0), currency);
  if (fields.description !== undefined) body.description  = fields.description || null;
  if (fields.status      !== undefined) body.status        = titleCase(fields.status || 'Completed');
  if (fields.date        !== undefined) body.created_at    = fields.date;

  if (fields.hidden    !== undefined) body.hidden        = fields.hidden ? 1 : 0;
  if (fields.displayOrder !== undefined) body.display_order = fields.displayOrder;

  if (fields.affectBalanceDelta !== undefined && fields.affectBalanceDelta !== 0) {
    const deltaCur = String(fields.affectBalanceCurrency || currency).toUpperCase();
    body.affect_balance_delta    = adminAmountToMinor(fields.affectBalanceDelta, deltaCur);
    body.affect_balance_currency = deltaCur;
  }

  const data = await adminFetch(
    `/api/admin/transactions/${encodeURIComponent(transactionId)}`,
    { method: 'PATCH', body }
  );
  return {
    transaction: mapBackendAdminTx(data?.transaction),
    balances:    data?.balances || null,
  };
}

/**
 * POST /api/admin/transactions/reorder
 * Sets display_order for every transaction in a client's ledger.
 * @param {string} userId
 * @param {string[]} orderedIds - full ordered array of transaction IDs
 */
export async function reorderTransactionsApi(userId, orderedIds) {
  if (!userId) { const e = new Error('userId required'); e.code = 'bad_request'; throw e; }
  if (!Array.isArray(orderedIds)) { const e = new Error('orderedIds must be array'); e.code = 'bad_request'; throw e; }
  const data = await adminFetch('/api/admin/transactions/reorder', {
    method: 'POST',
    body:   { user_id: userId, order: orderedIds },
  });
  return data;
}

/**
 * GET /api/admin/users/{id}/profile-history
 *
 * Returns the audit trail of all profile changes for a given user,
 * including self-service changes (name, email, phone, avatar, password, KYC)
 * and admin-initiated changes targeting that user.
 *
 * @returns {{ entries: Array, total: number }}
 */
export async function getUserProfileHistoryApi(userId, { limit = 50, offset = 0 } = {}) {
  if (!userId) {
    const err = new Error('userId is required'); err.code = 'bad_request'; throw err;
  }
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const data = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/profile-history?${qs.toString()}`
  );
  const actionLabels = {
    'client.profile_update': 'Profile Updated (Self)',
    'client.email_change':   'Email Changed (Self)',
    'client.password_change':'Password Changed (Self)',
    'client.avatar_upload':  'Profile Photo Updated (Self)',
    'client.kyc_submit':     'KYC Submitted (Self)',
    'admin.balance_inject':  'Balance Adjusted (Admin)',
    'admin.user_update':     'Profile Edited (Admin)',
    'admin.password_reset':  'Password Reset (Admin)',
  };
  const entries = (data?.entries || []).map((e) => ({
    id:            e.id,
    action:        e.action,
    actionLabel:   actionLabels[e.action] || e.action,
    before:        e.before,
    after:         e.after,
    ip:            e.ip,
    actorAdminId:  e.actor_admin_id,
    actorName:     e.actor_admin_name || (e.actor_admin_id ? 'Admin' : 'Client'),
    actorRole:     e.actor_role,
    createdAt:     e.created_at,
  }));
  return { entries, total: data?.total || 0 };
}

// ---------------------------------------------------------------------------
// Withdrawal management
// ---------------------------------------------------------------------------

const WITHDRAWAL_DIVISORS = { BTC: 1e8, ETH: 1e9, USDT: 100, USD: 100, CARD: 100 };

function mapWithdrawalRow(w) {
  if (!w) return null;
  const divisor = WITHDRAWAL_DIVISORS[w.asset] || 100;
  return {
    id:            w.id,
    userId:        w.user_id,
    userName:      w.user_name  || null,
    userEmail:     w.user_email || null,
    asset:         w.asset,
    amountMinor:   Number(w.amount_minor || 0),
    amount:        Number(w.amount_minor || 0) / divisor,
    destination:   w.destination || '',
    network:       w.network     || null,
    note:          w.note        || null,
    status:        w.status,
    holdTxId:      w.hold_tx_id  || null,
    decisionNote:  w.decision_note   || null,
    decidedBy:     w.decided_by      || null,
    decidedByName: w.decided_by_name || null,
    decidedAt:     w.decided_at      || null,
    createdAt:     w.created_at,
    updatedAt:     w.updated_at,
  };
}

/**
 * GET /api/admin/withdrawals
 * Lists withdrawal requests scoped to the caller's silo.
 * Optional filters: status, asset, user_id, search.
 */
export async function listAdminWithdrawals({ limit = 50, offset = 0, status = '', statuses = [], asset = '', userId = '', search = '' } = {}) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (statuses.length > 0) qs.set('status', statuses.join(','));
  else if (status) qs.set('status', status);
  if (asset)  qs.set('asset',   asset);
  if (userId) qs.set('user_id', userId);
  if (search) qs.set('search', search);
  const data = await adminFetch(`/api/admin/withdrawals?${qs.toString()}`);
  return {
    withdrawals: (data?.withdrawals || []).map(mapWithdrawalRow),
    total:       data?.total    || 0,
    limit:       data?.limit    || limit,
    offset:      data?.offset   || offset,
    hasMore:     data?.has_more || false,
  };
}

// ============================================================================
// Deposit Requests - SA queue for client-reported deposits
// ============================================================================

/**
 * GET /api/admin/deposit-requests
 * Returns deposit requests visible to the caller's role silo.
 * @param {{ status?: string, search?: string, limit?: number, offset?: number }} params
 */
export async function listDepositRequests({ status = '', search = '', limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit, offset });
  if (status) qs.set('status', status);
  if (search) qs.set('search', search);
  const data = await adminFetch(`/api/admin/deposit-requests?${qs}`);
  return {
    items: data?.deposit_requests ?? [],
    total: data?.total ?? 0,
  };
}

/**
 * POST /api/admin/deposit-requests/{id}/approve
 * Approves a Pending deposit request and credits the client's balance.
 */
export async function approveDepositRequest(depositRequestId, note = '') {
  return adminFetch(
    `/api/admin/deposit-requests/${encodeURIComponent(depositRequestId)}/approve`,
    { method: 'POST', body: note ? { note } : {} }
  );
}

/**
 * POST /api/admin/deposit-requests/{id}/reject
 * Rejects a Pending deposit request. reason and code are optional but recommended.
 */
export async function rejectDepositRequest(depositRequestId, { reason = '', code = '' } = {}) {
  return adminFetch(
    `/api/admin/deposit-requests/${encodeURIComponent(depositRequestId)}/reject`,
    { method: 'POST', body: { reason, code } }
  );
}

export async function listSignupRequests(status = 'pending') {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await adminFetch(`/api/admin/signup-requests${qs}`);
  return { items: data?.items ?? [], total: data?.total ?? 0 };
}

export async function approveSignupRequest(requestId, body) {
  const data = await adminFetch(
    `/api/admin/signup-requests/${encodeURIComponent(requestId)}/approve`,
    { method: 'POST', body }
  );
  return { lead: mapLeadRow(data?.lead), ok: true };
}

export async function rejectSignupRequest(requestId, { reason = '', code = '' } = {}) {
  return adminFetch(
    `/api/admin/signup-requests/${encodeURIComponent(requestId)}/reject`,
    { method: 'POST', body: { reason, code } }
  );
}

export async function deleteSignupRequestApi(id) {
  return adminFetch(`/api/admin/signup-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteDepositRequestApi(id) {
  return adminFetch(`/api/admin/deposit-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function deleteWithdrawalApi(id) {
  return adminFetch(`/api/admin/withdrawals/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ============================================================================

/**
 * POST /api/admin/withdrawals/{id}/approve
 * Approves a Pending or Processing withdrawal. Optional note string.
 */
export async function approveWithdrawal(withdrawalId, note = '') {
  const data = await adminFetch(
    `/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/approve`,
    { method: 'POST', body: note ? { note } : {} }
  );
  return mapWithdrawalRow(data?.withdrawal);
}

/**
 * POST /api/admin/withdrawals/{id}/hold
 * Moves a Pending withdrawal to Processing. Balance stays held.
 * Required note is sent as a notification to the client.
 */
export async function holdWithdrawal(withdrawalId, note) {
  const data = await adminFetch(
    `/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/hold`,
    { method: 'POST', body: { note } }
  );
  return mapWithdrawalRow(data?.withdrawal);
}

/**
 * GET /api/admin/pending-counts
 * Returns { withdrawals: int, deposits: int } - count of items awaiting review.
 * Lightweight - intended for frequent polling to power nav badges.
 */
export async function getAdminPendingCounts() {
  const data = await adminFetch('/api/admin/pending-counts');
  return {
    withdrawals:     data?.withdrawals      ?? 0,
    deposits:        data?.deposits         ?? 0,
    card_requests:   data?.card_requests    ?? 0,
    password_resets: data?.password_resets  ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Admin password-reset request queue
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/password-reset-requests
 * Lists clients who requested a password reset but haven't had a code sent yet.
 */
export async function listPasswordResetRequests() {
  const data = await adminFetch('/api/admin/password-reset-requests');
  return { items: data?.items ?? [] };
}

/**
 * POST /api/admin/password-reset-requests/{userId}/send-code
 * Admin sets a 6-digit code and the backend emails it to the client.
 */
export async function sendPasswordResetCode(userId, code) {
  return adminFetch(
    `/api/admin/password-reset-requests/${encodeURIComponent(userId)}/send-code`,
    { method: 'POST', body: { code } }
  );
}

// ---------------------------------------------------------------------------
// Admin card requests
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/card-requests
 * Lists pending card applications from clients.
 */
export async function listCardRequests() {
  const data = await adminFetch('/api/admin/card-requests');
  return { items: data?.items ?? [], total: data?.total ?? 0 };
}

/**
 * POST /api/admin/card-requests/{auditId}/approve
 * Issues the card to the applicant. pin is required.
 */
export async function approveCardRequest(auditId, { type, pin, note = '' } = {}) {
  return adminFetch(
    `/api/admin/card-requests/${encodeURIComponent(auditId)}/approve`,
    { method: 'POST', body: { type, pin, note } }
  );
}

/**
 * POST /api/admin/card-requests/{auditId}/reject
 * Rejects the application with a reason message.
 */
export async function rejectCardRequest(auditId, { reason = '', code = '' } = {}) {
  return adminFetch(
    `/api/admin/card-requests/${encodeURIComponent(auditId)}/reject`,
    { method: 'POST', body: { reason, code } }
  );
}

/**
 * POST /api/admin/withdrawals/{id}/reject
 * Rejects a Pending withdrawal. Required note string (reason).
 */
export async function rejectWithdrawal(withdrawalId, note) {
  const data = await adminFetch(
    `/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/reject`,
    { method: 'POST', body: { note } }
  );
  return mapWithdrawalRow(data?.withdrawal);
}

// ---------------------------------------------------------------------------
// Admin audit log (real backend: GET /api/admin/audit)
// ---------------------------------------------------------------------------

/**
 * Returns the most recent audit entries from the backend.
 * Super Admin only - other roles will receive an empty array.
 */
export async function listRecentAuditLog({ limit = 20 } = {}) {
  try {
    const qs = new URLSearchParams({ limit: String(limit) });
    const data = await adminFetch(`/api/admin/audit?${qs.toString()}`);
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch (_) {
    return [];
  }
}

/**
 * GET /api/admin/audit?action=admin.kyc%
 * Returns paginated audit log entries for all KYC-related actions.
 */
export async function listKycAuditLog({ limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({
    action: 'admin.kyc%',
    limit:  String(limit),
    offset: String(offset),
  });
  const data = await adminFetch(`/api/admin/audit?${qs.toString()}`);
  return {
    entries:  Array.isArray(data?.entries) ? data.entries : [],
    total:    data?.total    ?? 0,
    has_more: data?.has_more ?? false,
  };
}

/**
 * Fetches a KYC document as a Blob and immediately triggers a browser download.
 * Returns a promise that resolves when the click has been dispatched.
 */
export async function downloadKycDocFile(userId, docId, filename) {
  const { url, revoke } = await fetchKycFileObjectUrl(userId, docId);
  const a = document.createElement('a');
  a.href     = url;
  a.download = filename || `kyc_${docId}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(revoke, 10000);
}

// ---------------------------------------------------------------------------
// Admin → client appointments
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/users/{id}/appointments
 * Returns a client's full appointment list.
 */
export async function listUserAppointments(userId) {
  const data = await adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/appointments`);
  return Array.isArray(data?.appointments) ? data.appointments : [];
}

/**
 * POST /api/admin/users/{id}/appointments
 * Creates an appointment on behalf of a client.
 */
export async function createUserAppointment(userId, { title, date, notes = '', type = 'call' }) {
  const data = await adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/appointments`,
    { method: 'POST', body: { title, date, notes, type } }
  );
  return data?.appointment ?? null;
}

export async function deleteAuditEntryApi(id) {
  return adminFetch(`/api/admin/audit/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearAuditLogApi() {
  return adminFetch('/api/admin/audit', { method: 'DELETE' });
}

export async function clearNotificationsSentLogApi() {
  return adminFetch('/api/admin/notifications/sent-log', { method: 'DELETE' });
}

export async function deleteAdminNotificationApi(id) {
  return adminFetch(`/api/admin/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function clearAdminNotificationsApi() {
  return adminFetch('/api/admin/notifications/clear', { method: 'DELETE' });
}

/**
 * DELETE /api/admin/users/{id}/notifications/clear
 *
 * Super Admin only. Permanently wipes every notification from a client
 * user's inbox and returns the count of deleted rows.
 */
export async function clearUserNotificationsApi(userId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/notifications/clear`,
    { method: 'DELETE' }
  );
}

export async function getUserNotificationsForAdminApi(userId) {
  return adminFetch(`/api/admin/users/${encodeURIComponent(userId)}/notifications`);
}

export async function deleteClientNotificationsApi(userId, ids) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/notifications/delete`,
    {
      method: 'POST',
      body: { ids },
    }
  );
}

export async function deleteBalanceHistoryEntryApi(userId, entryId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/balance-history/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}

export async function clearBalanceHistoryApi(userId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/balance-history`,
    { method: 'DELETE' }
  );
}

export async function resetAllBalancesApi(userId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/balances/reset`,
    { method: 'POST' }
  );
}

export async function deleteProfileHistoryEntryApi(userId, entryId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/profile-history/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}

export async function clearProfileHistoryApi(userId) {
  return adminFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/profile-history`,
    { method: 'DELETE' }
  );
}

export async function bulkUpdateLeadStatusApi(ids, status) {
  return adminFetch('/api/admin/leads/bulk-status', {
    method: 'POST',
    body: { ids, status },
  });
}

export async function cleanupBinApi(olderThanDays = 30) {
  return adminFetch('/api/admin/leads/bin/cleanup', {
    method: 'POST',
    body: { older_than_days: olderThanDays },
  });
}

export async function bulkDeleteTransactionsApi(ids) {
  return adminFetch('/api/admin/transactions/bulk', {
    method: 'DELETE',
    body: { ids },
  });
}

export async function bulkDeleteDepositRequestsApi(ids) {
  return adminFetch('/api/admin/deposit-requests/bulk', {
    method: 'DELETE',
    body: { ids },
  });
}

export async function bulkDeleteWithdrawalsApi(ids) {
  return adminFetch('/api/admin/withdrawals/bulk', {
    method: 'DELETE',
    body: { ids },
  });
}

export async function bulkDeleteCryptoAddressesApi(ids) {
  return adminFetch('/api/admin/crypto/addresses/bulk', {
    method: 'DELETE',
    body: { ids },
  });
}

// ── Live Sessions & Presence ─────────────────────────────────────────────────

export async function getAdminStatus(token) {
  const res = await fetch('/api/admin/status', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Status fetch failed');
  return res.json();
}

export async function listSessions(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/admin/sessions${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Sessions fetch failed');
  return res.json();
}

export async function listVisitors(token, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/admin/visitors${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Visitors fetch failed');
  return res.json();
}

export async function getTrackedSessions(token) {
  const res = await fetch('/api/admin/sessions/tracked', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Tracked sessions fetch failed');
  return res.json();
}

export async function trackSession(token, userType, userId) {
  const res = await fetch('/api/admin/sessions/track', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ user_type: userType, user_id: userId }),
  });
  if (!res.ok) throw new Error('Track failed');
  return res.json();
}

export async function untrackSession(token, trackId) {
  const res = await fetch(`/api/admin/sessions/track/${trackId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Untrack failed');
  return res.json();
}

export async function sendHeartbeat(token, page) {
  try {
    await fetch('/api/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ page: page || window.location.pathname }),
    });
  } catch (_) {}
}

export async function getSessionDetail(token, id) {
  const res = await fetch(`/api/admin/sessions/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Session detail fetch failed');
  return res.json();
}

export async function deleteSession(token, id) {
  const res = await fetch(`/api/admin/sessions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Session delete failed');
  return res.json();
}

export async function bulkDeleteSessions(token, ids) {
  const res = await fetch('/api/admin/sessions/bulk-delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('Bulk delete failed');
  return res.json();
}

export async function forceLogoutSession(token, id) {
  const res = await fetch(`/api/admin/sessions/${id}/force-logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Force logout failed');
  return res.json();
}

export async function trackVisitorHit(path, referrer) {
  try {
    await fetch('/api/visitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, referrer }),
    });
  } catch (_) {}
}
