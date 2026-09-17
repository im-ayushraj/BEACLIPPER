import { Pool } from "pg";

export interface WaitlistSubscriber {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  videos_per_month: string;
  source: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_page?: string | null;
  created_at: string;
  updated_at: string;
}

let pool: Pool | null = null;
const globalRef = globalThis as any;
if (!globalRef.__waitlist_memoryStore) {
  globalRef.__waitlist_memoryStore = new Map<string, WaitlistSubscriber>();
}
const memoryStore: Map<string, WaitlistSubscriber> = globalRef.__waitlist_memoryStore;

function getPool(): Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;
  if (!pool) {
    let sanitizedUrl = dbUrl;
    try {
      const match = dbUrl.match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^@]+)$/);
      if (match) {
        const user = match[1];
        const passAndRest = match[2];
        const lastAtIndex = passAndRest.lastIndexOf("@");
        if (lastAtIndex > -1) {
          const pass = passAndRest.substring(0, lastAtIndex);
          const hostPortDb = passAndRest.substring(lastAtIndex + 1);
          sanitizedUrl = `postgresql://${user}:${encodeURIComponent(pass)}@${hostPortDb}`;
        }
      }
    } catch {
      sanitizedUrl = dbUrl;
    }

    pool = new Pool({
      connectionString: sanitizedUrl,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 3000,
    });
  }
  return pool;
}

// Auto-create table if postgres is connected
let tableInitialized = false;
let lastInitAttempt = 0;
export async function initDb(): Promise<void> {
  const p = getPool();
  if (!p || tableInitialized) return;
  const now = Date.now();
  if (now - lastInitAttempt < 15000) return; // cooldown to avoid repeated blocking timeouts
  lastInitAttempt = now;

  const ddl = `
    CREATE TABLE IF NOT EXISTS waitlist_subscribers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone VARCHAR(64),
      role VARCHAR(64) NOT NULL,
      videos_per_month VARCHAR(32) NOT NULL,
      source VARCHAR(64) DEFAULT 'landing_page',
      utm_source VARCHAR(128),
      utm_medium VARCHAR(128),
      utm_campaign VARCHAR(128),
      utm_content VARCHAR(128),
      utm_term VARCHAR(128),
      referrer TEXT,
      landing_page VARCHAR(255) DEFAULT '/',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist_subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_subscribers(created_at);
  `;

  try {
    await p.query(ddl);
    tableInitialized = true;
  } catch (err) {
    console.error("[DB] Warning initializing waitlist_subscribers table:", err);
  }
}

export async function findSubscriberByEmail(email: string): Promise<WaitlistSubscriber | null> {
  await initDb();
  const normalizedEmail = email.trim().toLowerCase();
  const p = getPool();

  if (!p) {
    return memoryStore.get(normalizedEmail) || null;
  }

  try {
    const res = await p.query(
      "SELECT * FROM waitlist_subscribers WHERE LOWER(email) = $1 LIMIT 1",
      [normalizedEmail]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      videos_per_month: r.videos_per_month,
      source: r.source,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      utm_content: r.utm_content,
      utm_term: r.utm_term,
      referrer: r.referrer,
      landing_page: r.landing_page,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    };
  } catch (err) {
    console.error("[DB] Error searching by email:", err);
    return memoryStore.get(normalizedEmail) || null;
  }
}

export async function insertSubscriber(
  sub: Omit<WaitlistSubscriber, "created_at" | "updated_at">
): Promise<WaitlistSubscriber> {
  await initDb();
  const now = new Date().toISOString();
  const fullSub: WaitlistSubscriber = {
    ...sub,
    email: sub.email.trim().toLowerCase(),
    created_at: now,
    updated_at: now,
  };

  const p = getPool();
  if (!p) {
    memoryStore.set(fullSub.email, fullSub);
    return fullSub;
  }

  const query = `
    INSERT INTO waitlist_subscribers (
      id, name, email, phone, role, videos_per_month, source,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      referrer, landing_page, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *;
  `;

  const values = [
    fullSub.id,
    fullSub.name,
    fullSub.email,
    fullSub.phone || null,
    fullSub.role,
    fullSub.videos_per_month,
    fullSub.source || "landing_page",
    fullSub.utm_source || null,
    fullSub.utm_medium || null,
    fullSub.utm_campaign || null,
    fullSub.utm_content || null,
    fullSub.utm_term || null,
    fullSub.referrer || null,
    fullSub.landing_page || "/",
    fullSub.created_at,
    fullSub.updated_at,
  ];

  try {
    const res = await p.query(query, values);
    const r = res.rows[0];
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      videos_per_month: r.videos_per_month,
      source: r.source,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      utm_content: r.utm_content,
      utm_term: r.utm_term,
      referrer: r.referrer,
      landing_page: r.landing_page,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    };
  } catch (err: any) {
    // If unique constraint violation
    if (err.code === "23505") {
      throw new Error("ALREADY_REGISTERED");
    }
    console.error("[DB] Error inserting subscriber, falling back to memory:", err);
    memoryStore.set(fullSub.email, fullSub);
    return fullSub;
  }
}

export async function querySubscribers(params: {
  search?: string;
  role?: string;
  videos_per_month?: string;
  limit?: number;
  offset?: number;
}): Promise<{ subscribers: WaitlistSubscriber[]; total: number }> {
  await initDb();
  const limit = params.limit || 20;
  const offset = params.offset || 0;
  const p = getPool();

  function queryFromMemory(): { subscribers: WaitlistSubscriber[]; total: number } {
    let list = Array.from(memoryStore.values());
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    if (params.role) {
      list = list.filter((s) => s.role.toLowerCase() === params.role!.toLowerCase());
    }
    if (params.videos_per_month) {
      list = list.filter((s) => s.videos_per_month === params.videos_per_month);
    }
    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      subscribers: list.slice(offset, offset + limit),
      total: list.length,
    };
  }

  if (!p) {
    return queryFromMemory();
  }

  try {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.search) {
      conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(email) LIKE $${idx})`);
      values.push(`%${params.search.toLowerCase()}%`);
      idx++;
    }
    if (params.role) {
      conditions.push(`role = $${idx}`);
      values.push(params.role);
      idx++;
    }
    if (params.videos_per_month) {
      conditions.push(`videos_per_month = $${idx}`);
      values.push(params.videos_per_month);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const countRes = await p.query(`SELECT COUNT(*) FROM waitlist_subscribers ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].count, 10);

    const query = `
      SELECT * FROM waitlist_subscribers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const dataRes = await p.query(query, values);
    const subscribers = dataRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      videos_per_month: r.videos_per_month,
      source: r.source,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      utm_content: r.utm_content,
      utm_term: r.utm_term,
      referrer: r.referrer,
      landing_page: r.landing_page,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    }));

    return { subscribers, total };
  } catch (err) {
    console.error("[DB] Query error, falling back to memory:", err);
    return queryFromMemory();
  }
}

export async function getStats(): Promise<{
  total: number;
  today: number;
  week: number;
  month: number;
  byRole: Record<string, number>;
  bySource: Record<string, number>;
  byUtmSource: Record<string, number>;
}> {
  await initDb();
  const p = getPool();
  let all: WaitlistSubscriber[] = [];

  if (!p) {
    all = Array.from(memoryStore.values());
  } else {
    try {
      const res = await p.query("SELECT * FROM waitlist_subscribers ORDER BY created_at DESC");
      all = res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: r.role,
        videos_per_month: r.videos_per_month,
        source: r.source,
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        utm_content: r.utm_content,
        utm_term: r.utm_term,
        referrer: r.referrer,
        landing_page: r.landing_page,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
      }));
    } catch (err) {
      console.error("[DB] Stats query error:", err);
      all = Array.from(memoryStore.values());
    }
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let today = 0;
  let week = 0;
  let month = 0;
  const byRole: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byUtmSource: Record<string, number> = {};

  for (const s of all) {
    const t = new Date(s.created_at).getTime();
    if (t >= startOfToday) today++;
    if (t >= startOfWeek) week++;
    if (t >= startOfMonth) month++;

    byRole[s.role] = (byRole[s.role] || 0) + 1;
    const src = s.source || "landing_page";
    bySource[src] = (bySource[src] || 0) + 1;

    const utm = s.utm_source || "direct";
    byUtmSource[utm] = (byUtmSource[utm] || 0) + 1;
  }

  return {
    total: all.length,
    today,
    week,
    month,
    byRole,
    bySource,
    byUtmSource,
  };
}

export async function getAllForExport(): Promise<WaitlistSubscriber[]> {
  await initDb();
  const p = getPool();
  if (!p) {
    return Array.from(memoryStore.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  try {
    const res = await p.query("SELECT * FROM waitlist_subscribers ORDER BY created_at DESC");
    return res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      videos_per_month: r.videos_per_month,
      source: r.source,
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      utm_content: r.utm_content,
      utm_term: r.utm_term,
      referrer: r.referrer,
      landing_page: r.landing_page,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    }));
  } catch (err) {
    console.error("[DB] Export error:", err);
    return Array.from(memoryStore.values());
  }
}
