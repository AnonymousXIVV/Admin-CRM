/**
 * In-memory Chain-IQ API compatible with the Wallet715 admin + client frontends.
 * Used by Vite (dev) and Nitro (preview/build).
 */

const CAPS = {
  lead_upload: true,
  create_agent: true,
  trading: true,
  balances: true,
  transactions: true,
  card_management: true,
  crypto_addresses: true,
  registrations: true,
  notifications: true,
  security: true,
  deposits: true,
  withdrawals: true,
  kyc_review: true,
};

const nowIso = () => new Date().toISOString();

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function seed() {
  const created = nowIso();
  const office = {
    id: "of_london",
    name: "London",
    manager_id: "adm_om",
    manager_name: "Olivia Manager",
    team_count: 1,
    agent_count: 1,
    lead_count: 3,
    created_at: created,
    deleted_at: null,
  };
  const team = {
    id: "tm_alpha",
    name: "Alpha",
    office_id: office.id,
    leader_id: "adm_tl",
    leader_name: "Theo Leader",
    max_size: 10,
    agent_count: 1,
    lead_count: 3,
    created_at: created,
    deleted_at: null,
  };
  const staff = [
    {
      id: "adm_sa",
      name: "Sam Super",
      email: "sarah.b@example.net",
      password: "admin123",
      role: "Super Admin",
      office_id: null,
      office_name: null,
      team_id: null,
      team_name: null,
      status: "Active",
      last_login_at: created,
      created_at: created,
      lead_count: 0,
      plain_password: "admin123",
      capabilities: { ...CAPS },
    },
    {
      id: "adm_om",
      name: "Olivia Manager",
      email: "kevin.m@example.com",
      password: "manager123",
      role: "Office Manager",
      office_id: office.id,
      office_name: office.name,
      team_id: null,
      team_name: null,
      status: "Active",
      last_login_at: created,
      created_at: created,
      lead_count: 3,
      plain_password: "manager123",
      capabilities: { ...CAPS },
    },
    {
      id: "adm_tl",
      name: "Theo Leader",
      email: "xena.w@example.org",
      password: "leader123",
      role: "Team Leader",
      office_id: office.id,
      office_name: office.name,
      team_id: team.id,
      team_name: team.name,
      status: "Active",
      last_login_at: created,
      created_at: created,
      lead_count: 3,
      plain_password: "leader123",
      capabilities: { ...CAPS },
    },
    {
      id: "adm_ag",
      name: "Ava Agent",
      email: "hannah.h@example.com",
      password: "agent123",
      role: "Agent",
      office_id: office.id,
      office_name: office.name,
      team_id: team.id,
      team_name: team.name,
      status: "Active",
      last_login_at: created,
      created_at: created,
      lead_count: 2,
      plain_password: "agent123",
      capabilities: { ...CAPS },
    },
  ];

  const mkLead = (id, first, last, email, stage, agentId) => ({
    id,
    first_name: first,
    last_name: last,
    name: `${first} ${last}`,
    email,
    phone: "+44 20 7946 0958",
    country: "United Kingdom",
    country_code: "GB",
    stage,
    funnel: "Retail",
    affiliate: "",
    client_password: "client123",
    kyc_status: id === "usr_maya" ? "Approved" : "Not Submitted",
    status: "Active",
    trades_enabled: true,
    cards_enabled: true,
    assigned_office_id: office.id,
    assigned_team_id: team.id,
    assigned_agent_id: agentId,
    assigned_agent_name: agentId ? "Ava Agent" : null,
    assigned_by: "adm_om",
    last_comment_date: created.slice(0, 10),
    registered_date: created.slice(0, 10),
    deleted_at: null,
    created_at: created,
    updated_at: created,
    balance: {
      fiat_minor: id === "usr_maya" ? 1250000 : 0,
      fiat_currency: "USD",
      btc_sat: id === "usr_maya" ? 15000000 : 0,
      eth_wei_e9: 0,
      usdt_minor: id === "usr_maya" ? 420000 : 0,
      card_minor: id === "usr_maya" ? 80000 : 0,
    },
    comment_history: [
      { id: uid("c"), lead_id: id, text: "Intro call completed.", by_name: "Ava Agent", created_at: created },
    ],
    status_history: [
      { id: uid("s"), lead_id: id, from_stage: "New", to_stage: stage, by_name: "Ava Agent", created_at: created },
    ],
    appointments: [],
  });

  const leads = [
    mkLead("usr_maya", "Maya", "Chen", "client@chain-iq.com", "Deposit", "adm_ag"),
    mkLead("usr_leo", "Leo", "Anders", "leo@example.com", "In Line", "adm_ag"),
    mkLead("usr_nina", "Nina", "Patel", "nina@example.com", "New", null),
  ];

  return {
    offices: [office],
    teams: [team],
    staff,
    leads,
    deletedLeads: [],
    deletedOffices: [],
    deletedTeams: [],
    sessions: [],
    notifications: [],
    messages: [],
    transactions: [
      {
        id: "tx_1",
        user_id: "usr_maya",
        type: "deposit",
        asset: "USD",
        amount: 12500,
        status: "completed",
        created_at: created,
        visible: true,
      },
    ],
    cards: [
      {
        id: "card_1",
        user_id: "usr_maya",
        last4: "4242",
        brand: "Chain-IQ",
        tier: "gold",
        status: "active",
        frozen: false,
        created_at: created,
      },
    ],
    withdrawals: [],
    deposits: [],
    signupRequests: [],
    kyc: [],
    cryptoAddresses: [
      { id: "ca_1", asset: "BTC", network: "Bitcoin", address: "bc1qpreviewaddress000000000000000000", status: "active" },
    ],
    audit: [],
    settings: {
      platformName: "Chain-IQ",
      platformAbbreviation: "CIQ",
      cardBrandName: "Chain-IQ",
      platformYear: "2026",
      supportEmail: "support@chain-iq.com",
      primaryColor: "#F0B90B",
      secondaryColor: "#1E2026",
      accentColor: "#F0B90B",
      buttonColor: "#F0B90B",
      backgroundColor: "#0a0a0f",
      textColor: "#F9FAFB",
      registrationEnabled: true,
    },
    tokens: new Map(),
  };
}

const store = seed();

function json(status, body) {
  return { status, body };
}

function error(status, code, message) {
  return json(status, { error: code, message });
}

function parseBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function publicAdmin(admin) {
  const { password, ...rest } = admin;
  return {
    id: rest.id,
    name: rest.name,
    email: rest.email,
    role: rest.role,
    office_id: rest.office_id,
    team_id: rest.team_id,
    status: rest.status,
    last_login_at: rest.last_login_at,
    capabilities: rest.capabilities || CAPS,
  };
}

function issueToken(kind, profile) {
  const token = `${kind}.${uid("tok")}`;
  store.tokens.set(token, { kind, id: profile.id, at: Date.now() });
  return token;
}

function authAdmin(headers) {
  const header = headers.authorization || headers.Authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const rec = store.tokens.get(token);
  if (!rec || rec.kind !== "admin") return null;
  return store.staff.find((s) => s.id === rec.id && s.status === "Active") || null;
}

function authClient(headers) {
  const header = headers.authorization || headers.Authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const rec = store.tokens.get(token);
  if (!rec || rec.kind !== "client") return null;
  return store.leads.find((l) => l.id === rec.id && !l.deleted_at) || null;
}

function refreshCounts() {
  for (const o of store.offices) {
    o.team_count = store.teams.filter((t) => t.office_id === o.id && !t.deleted_at).length;
    o.agent_count = store.staff.filter((s) => s.office_id === o.id && s.role === "Agent").length;
    o.lead_count = store.leads.filter((l) => l.assigned_office_id === o.id && !l.deleted_at).length;
    const mgr = store.staff.find((s) => s.office_id === o.id && s.role === "Office Manager");
    o.manager_id = mgr?.id || o.manager_id;
    o.manager_name = mgr?.name || o.manager_name;
  }
  for (const t of store.teams) {
    t.agent_count = store.staff.filter((s) => s.team_id === t.id && s.role === "Agent").length;
    t.lead_count = store.leads.filter((l) => l.assigned_team_id === t.id && !l.deleted_at).length;
  }
  for (const s of store.staff) {
    s.lead_count = store.leads.filter((l) => l.assigned_agent_id === s.id && !l.deleted_at).length;
    const office = store.offices.find((o) => o.id === s.office_id);
    const team = store.teams.find((t) => t.id === s.team_id);
    s.office_name = office?.name || null;
    s.team_name = team?.name || null;
  }
}

function clientUser(lead) {
  return {
    id: lead.id,
    name: lead.name,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    country: lead.country,
    status: lead.status,
    kyc_status: lead.kyc_status,
    trades_enabled: lead.trades_enabled,
    cards_enabled: lead.cards_enabled,
    created_at: lead.created_at,
    avatar_url: null,
    password_changed_at: null,
  };
}

function emptyPage(key) {
  return { [key]: [], total: 0, limit: 50, offset: 0, has_more: false, hasMore: false };
}

export async function handleChainiqApi({ method, path, search, headers, rawBody }) {
  const url = new URL(path + (search || ""), "http://local");
  const p = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const body = parseBody(rawBody);
  method = (method || "GET").toUpperCase();

  if (p === "/api/health") return json(200, { ok: true });
  if (p === "/api/heartbeat") return json(200, { ok: true });
  if (p === "/api/visitor") return json(200, { ok: true });

  if (p === "/api/platform/settings" && method === "GET") {
    return json(200, { settings: store.settings });
  }
  if (p === "/api/market/tradfi" && method === "GET") {
    return json(200, { assets: [] });
  }
  if (p === "/api/market/crypto-sparklines" && method === "GET") {
    return json(200, { sparklines: {} });
  }

  // ---- admin auth ----
  if (p === "/api/admin/login" && method === "POST") {
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const admin = store.staff.find((s) => s.email.toLowerCase() === email && s.password === password);
    if (!admin) return error(401, "invalid_credentials", "email or password is incorrect");
    if (admin.status !== "Active") return error(403, "account_disabled", "this account is not active");
    admin.last_login_at = nowIso();
    const token = issueToken("admin", admin);
    return json(200, {
      token,
      token_type: "Bearer",
      expires_in: 8 * 3600,
      csrf: "preview-csrf",
      admin: publicAdmin(admin),
    });
  }
  if (p === "/api/admin/logout" && method === "POST") return json(200, { ok: true });

  if (p === "/api/client/login" && method === "POST") {
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const user = store.leads.find(
      (l) => l.email.toLowerCase() === email && (l.client_password === password || password === "client123"),
    );
    if (!user) return error(401, "invalid_credentials", "email or password is incorrect");
    const token = issueToken("client", user);
    return json(200, {
      token,
      token_type: "Bearer",
      expires_in: 8 * 3600,
      csrf: "preview-csrf",
      user: clientUser(user),
      balances: user.balance,
    });
  }

  if (p === "/api/client/signup-request" && method === "POST") {
    const row = {
      id: uid("sr"),
      name: body.name,
      email: body.email,
      password: body.password,
      status: "pending",
      created_at: nowIso(),
    };
    store.signupRequests.push(row);
    return json(200, { ok: true, request: row });
  }
  if (p === "/api/client/signup-request/status") {
    return json(200, { status: "pending" });
  }

  if (p.startsWith("/api/client/")) {
    const user = authClient(headers);
    if (p === "/api/client/me") {
      if (!user) return error(401, "unauthorized", "Not signed in.");
      return json(200, { user: clientUser(user), balances: user.balance });
    }
    if (!user && method !== "GET") {
      // some client GETs still need auth
    }
    if (p === "/api/client/logout" || p === "/api/client/logout-everywhere") return json(200, { ok: true });
    if (p === "/api/client/transactions") return json(200, { transactions: store.transactions.filter((t) => t.user_id === user?.id) });
    if (p === "/api/client/cards") return json(200, { cards: store.cards.filter((c) => c.user_id === user?.id) });
    if (p === "/api/client/notifications") return json(200, { notifications: [] });
    if (p === "/api/client/messages") return json(200, { messages: [] });
    if (p === "/api/client/withdrawals") return json(200, { withdrawals: [] });
    if (p === "/api/client/deposit-requests") return json(200, { requests: [] });
    if (p === "/api/client/kyc") return json(200, { kyc: { status: user?.kyc_status || "Not Submitted" } });
    if (p === "/api/client/kyc/profile") return json(200, { profile: {} });
    if (p === "/api/client/preferences") return json(200, { preferences: {} });
    if (p === "/api/client/appointments") return json(200, { appointments: [] });
    if (p === "/api/client/trades") return json(200, { trades: [], orders: [] });
    if (p === "/api/client/presence") return json(200, { ok: true });
    if (method === "GET") return json(200, { ok: true });
    return json(200, { ok: true });
  }

  if (p.startsWith("/api/admin/")) {
    const admin = authAdmin(headers);
    if (p === "/api/admin/me") {
      if (!admin) return error(401, "unauthorized", "Not signed in.");
      return json(200, { admin: publicAdmin(admin), capabilities: admin.capabilities || CAPS });
    }
    if (!admin) return error(401, "unauthorized", "Not signed in.");
    refreshCounts();

    if (p === "/api/admin/settings" && method === "GET") return json(200, { settings: store.settings });
    if (p === "/api/admin/settings" && (method === "PUT" || method === "POST")) {
      store.settings = { ...store.settings, ...body, ...body.settings };
      return json(200, { settings: store.settings });
    }
    if (p === "/api/admin/settings/history") return json(200, { history: [] });

    if (p === "/api/admin/offices" && method === "GET") {
      const only = q.get("include_deleted") === "only";
      return json(200, { offices: only ? store.deletedOffices : store.offices.filter((o) => !o.deleted_at) });
    }
    if (p === "/api/admin/offices" && method === "POST") {
      const office = {
        id: uid("of"),
        name: body.name || "New office",
        manager_id: null,
        manager_name: body.manager_name || null,
        team_count: 0,
        agent_count: 0,
        lead_count: 0,
        created_at: nowIso(),
        deleted_at: null,
      };
      let manager = null;
      if (body.manager_name) {
        manager = {
          id: uid("adm"),
          name: body.manager_name,
          email: body.manager_email || `${uid("m")}@chain-iq.com`,
          password: body.manager_password || "manager123",
          role: "Office Manager",
          office_id: office.id,
          office_name: office.name,
          team_id: null,
          team_name: null,
          status: "Active",
          last_login_at: null,
          created_at: nowIso(),
          lead_count: 0,
          plain_password: body.manager_password || "manager123",
          capabilities: { ...CAPS },
        };
        office.manager_id = manager.id;
        office.manager_name = manager.name;
        store.staff.push(manager);
      }
      store.offices.push(office);
      return json(201, { office, manager });
    }

    if (p === "/api/admin/teams" && method === "GET") {
      const only = q.get("include_deleted") === "only";
      let teams = only ? store.deletedTeams : store.teams.filter((t) => !t.deleted_at);
      if (q.get("office_id")) teams = teams.filter((t) => t.office_id === q.get("office_id"));
      return json(200, { teams });
    }
    if (p === "/api/admin/teams" && method === "POST") {
      const team = {
        id: uid("tm"),
        name: body.name || "New team",
        office_id: body.office_id,
        leader_id: null,
        leader_name: body.leader_name || null,
        max_size: body.max_size || 10,
        agent_count: 0,
        lead_count: 0,
        created_at: nowIso(),
        deleted_at: null,
      };
      let leader = null;
      if (body.leader_name) {
        leader = {
          id: uid("adm"),
          name: body.leader_name,
          email: body.leader_email || `${uid("l")}@chain-iq.com`,
          password: body.leader_password || "leader123",
          role: "Team Leader",
          office_id: team.office_id,
          office_name: store.offices.find((o) => o.id === team.office_id)?.name,
          team_id: team.id,
          team_name: team.name,
          status: "Active",
          last_login_at: null,
          created_at: nowIso(),
          lead_count: 0,
          plain_password: body.leader_password || "leader123",
          capabilities: { ...CAPS },
        };
        team.leader_id = leader.id;
        team.leader_name = leader.name;
        store.staff.push(leader);
      }
      store.teams.push(team);
      return json(201, { team, leader });
    }

    if (p === "/api/admin/staff" && method === "GET") {
      return json(200, {
        staff: store.staff.map((s) => ({
          ...s,
          password: undefined,
        })),
      });
    }
    if (p === "/api/admin/staff" && method === "POST") {
      const team = store.teams.find((t) => t.id === body.team_id);
      const row = {
        id: uid("adm"),
        name: body.name || "Agent",
        email: body.email || `${uid("a")}@chain-iq.com`,
        password: body.password || "agent123",
        role: body.role || "Agent",
        office_id: team?.office_id || body.office_id || null,
        office_name: null,
        team_id: body.team_id || null,
        team_name: team?.name || null,
        status: "Active",
        last_login_at: null,
        created_at: nowIso(),
        lead_count: 0,
        plain_password: body.password || "agent123",
        capabilities: { ...CAPS },
      };
      store.staff.push(row);
      return json(201, { staff: publicAdmin(row) });
    }

    if (p === "/api/admin/leads" && method === "GET") {
      const includeDeleted = q.get("include_deleted");
      let leads = includeDeleted === "only" ? store.deletedLeads : store.leads.filter((l) => !l.deleted_at);
      if (q.get("stage")) leads = leads.filter((l) => l.stage === q.get("stage"));
      if (q.get("office_id")) leads = leads.filter((l) => l.assigned_office_id === q.get("office_id"));
      if (q.get("team_id")) leads = leads.filter((l) => l.assigned_team_id === q.get("team_id"));
      if (q.get("agent_id")) leads = leads.filter((l) => l.assigned_agent_id === q.get("agent_id"));
      if (q.get("search")) {
        const s = q.get("search").toLowerCase();
        leads = leads.filter((l) => `${l.name} ${l.email}`.toLowerCase().includes(s));
      }
      const limit = Number(q.get("limit") || 500);
      const offset = Number(q.get("offset") || 0);
      const slice = leads.slice(offset, offset + limit);
      const hasMore = offset + slice.length < leads.length;
      return json(200, { leads: slice, total: leads.length, limit, offset, has_more: hasMore, hasMore });
    }
    if (p === "/api/admin/leads" && method === "POST") {
      const first = body.first_name || body.firstName || "New";
      const last = body.last_name || body.lastName || "Lead";
      const lead = {
        id: uid("usr"),
        first_name: first,
        last_name: last,
        name: `${first} ${last}`.trim(),
        email: body.email || `${uid("u")}@example.com`,
        phone: body.phone || "",
        country: body.country || "",
        country_code: body.country_code || "",
        stage: body.stage || "New",
        funnel: body.funnel || "",
        affiliate: body.affiliate || "",
        client_password: body.client_password || "client123",
        kyc_status: "Not Submitted",
        status: "Active",
        trades_enabled: true,
        cards_enabled: true,
        assigned_office_id: body.assigned_office_id || admin.office_id || store.offices[0]?.id || null,
        assigned_team_id: body.assigned_team_id || admin.team_id || null,
        assigned_agent_id: body.assigned_agent_id || null,
        assigned_agent_name: null,
        assigned_by: admin.id,
        last_comment_date: "",
        registered_date: nowIso().slice(0, 10),
        deleted_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        balance: { fiat_minor: 0, fiat_currency: "USD", btc_sat: 0, eth_wei_e9: 0, usdt_minor: 0, card_minor: 0 },
        comment_history: [],
        status_history: [],
        appointments: [],
      };
      store.leads.unshift(lead);
      return json(201, { lead });
    }

    const leadMatch = p.match(/^\/api\/admin\/leads\/([^/]+)(?:\/(.*))?$/);
    if (leadMatch) {
      const id = leadMatch[1];
      const rest = leadMatch[2] || "";
      const lead = store.leads.find((l) => l.id === id) || store.deletedLeads.find((l) => l.id === id);
      if (!lead && rest !== "search") return error(404, "not_found", "lead not found");
      if (!rest && method === "GET") return json(200, { lead });
      if (!rest && (method === "PATCH" || method === "PUT" || method === "POST")) {
        Object.assign(lead, body);
        if (body.first_name || body.last_name) lead.name = `${lead.first_name} ${lead.last_name}`.trim();
        if (body.comment) {
          lead.comment_history = lead.comment_history || [];
          lead.comment_history.unshift({ id: uid("c"), lead_id: id, text: body.comment, by_name: admin.name, created_at: nowIso() });
        }
        if (body.stage && body.stage !== lead.stage) {
          lead.status_history = lead.status_history || [];
          lead.status_history.push({ id: uid("s"), lead_id: id, from_stage: lead.stage, to_stage: body.stage, by_name: admin.name, created_at: nowIso() });
          lead.stage = body.stage;
        }
        lead.updated_at = nowIso();
        return json(200, { lead });
      }
      if (rest === "assign") {
        lead.assigned_office_id = body.assigned_office_id ?? lead.assigned_office_id;
        lead.assigned_team_id = body.assigned_team_id ?? lead.assigned_team_id;
        lead.assigned_agent_id = body.assigned_agent_id ?? lead.assigned_agent_id;
        const ag = store.staff.find((s) => s.id === lead.assigned_agent_id);
        lead.assigned_agent_name = ag?.name || null;
        return json(200, { lead });
      }
      return json(200, { lead, ok: true });
    }

    if (p === "/api/admin/pending-counts") {
      return json(200, { withdrawals: 0, deposits: 1, card_requests: 0, password_resets: 0 });
    }
    if (p === "/api/admin/status") {
      return json(200, { db_ms: 1, online_total: 2, online_staff: 1, online_clients: 1, visitor_today: 12 });
    }
    if (p === "/api/admin/sessions") return json(200, { sessions: store.sessions });
    if (p === "/api/admin/sessions/tracked") return json(200, { sessions: [] });
    if (p === "/api/admin/notifications") return json(200, { notifications: [], unread: 0 });
    if (p === "/api/admin/notifications/sent-log") return json(200, { items: [], total: 0 });
    if (p === "/api/admin/messages") return json(200, { messages: [] });
    if (p === "/api/admin/messages/unread_counts") return json(200, { counts: {} });
    if (p === "/api/admin/transactions") return json(200, { transactions: store.transactions, total: store.transactions.length });
    if (p === "/api/admin/cards") return json(200, { cards: store.cards });
    if (p === "/api/admin/cards/audit" || p === "/api/admin/cards/audit/all") return json(200, { audit: [] });
    if (p === "/api/admin/crypto/addresses") return json(200, { addresses: store.cryptoAddresses });
    if (p === "/api/admin/withdrawals") return json(200, { withdrawals: [] });
    if (p === "/api/admin/deposit-requests") return json(200, { requests: [{ id: "dep_1", user_id: "usr_maya", amount: 2500, asset: "USDT", status: "pending", created_at: nowIso() }] });
    if (p === "/api/admin/signup-requests") return json(200, { requests: store.signupRequests });
    if (p === "/api/admin/card-requests") return json(200, { requests: [] });
    if (p === "/api/admin/password-reset-requests") return json(200, { requests: [] });
    if (p === "/api/admin/audit") return json(200, { entries: store.audit, total: 0 });
    if (p === "/api/admin/kyc") return json(200, { items: [] });

    if (method === "GET") return json(200, { ok: true, items: [], ...emptyPage("items") });
    return json(200, { ok: true });
  }

  return error(404, "not_found", `No API route for ${method} ${p}`);
}

export function headersToObject(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function") {
    headers.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return { ...headers };
}
