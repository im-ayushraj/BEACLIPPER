"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Calendar,
  Clock,
  Download,
  Search,
  Filter,
  Key,
  ShieldAlert,
  Loader2,
  RefreshCw,
  Tag,
  Share2,
} from "lucide-react";

interface Subscriber {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  videos_per_month: string;
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_page: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  today: number;
  week: number;
  month: number;
  byRole: Record<string, number>;
  bySource: Record<string, number>;
  byUtmSource: Record<string, number>;
}

export default function AdminWaitlistPage() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [isKeyEntered, setIsKeyEntered] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState<number>(0);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  useEffect(() => {
    const saved = sessionStorage.getItem("clipper_admin_key");
    if (saved) {
      setAdminKey(saved);
      setIsKeyEntered(true);
      fetchData(saved, 0, search, roleFilter, frequencyFilter);
    }
  }, []);

  const fetchData = async (
    key: string,
    offset = 0,
    searchQuery = "",
    role = "",
    freq = ""
  ) => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (searchQuery) params.set("q", searchQuery);
    if (role) params.set("role", role);
    if (freq) params.set("videos_per_month", freq);

    try {
      const res = await fetch(`/api/admin/waitlist?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          setError("Unauthorized: Invalid Admin Secret Key.");
          setIsKeyEntered(false);
          sessionStorage.removeItem("clipper_admin_key");
        } else {
          setError("Failed to load waitlist data.");
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      setStats(data.stats);
      setSubscribers(data.subscribers || []);
      setTotal(data.total || 0);
      setLoading(false);
    } catch (err) {
      setError("Network error communicating with admin API.");
      setLoading(false);
    }
  };

  const handleKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) return;
    sessionStorage.setItem("clipper_admin_key", adminKey.trim());
    setIsKeyEntered(true);
    setPage(0);
    fetchData(adminKey.trim(), 0, search, roleFilter, frequencyFilter);
  };

  const handleExportCsv = () => {
    const url = `/api/admin/waitlist/export?key=${encodeURIComponent(adminKey)}`;
    window.open(url, "_blank");
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchData(adminKey, 0, search, roleFilter, frequencyFilter);
  };

  // Password / Key Entry Prompt
  if (!isKeyEntered) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#11141d] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4">
            <Key className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Admin Waitlist Access</h1>
          <p className="text-xs text-zinc-400 mt-2">
            Enter your ADMIN_SECRET_KEY to view marketing leads and registration analytics.
          </p>

          {error && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleKeySubmit} className="mt-6 space-y-4">
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter Admin Secret Key"
              className="w-full rounded-xl border border-white/10 bg-[#090a0f] px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-white py-3 text-sm font-bold text-black hover:bg-zinc-200 transition active:scale-[0.99]"
            >
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-white p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Waitlist Leads Dashboard</h1>
              <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold">
                Admin Secure
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Real-time database records and UTM attribution for pre-launch creator registrations.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(adminKey, page * limit, search, roleFilter, frequencyFilter)}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#11141d] px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-black hover:bg-zinc-200 transition active:scale-[0.98] shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem("clipper_admin_key");
                setIsKeyEntered(false);
              }}
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition"
            >
              Lock
            </button>
          </div>
        </div>

        {/* Top Metrics Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Users className="h-4 w-4 text-blue-400" /> Total Registrations
              </div>
              <div className="text-3xl font-extrabold font-mono text-white mt-2">
                {stats.total}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Calendar className="h-4 w-4 text-emerald-400" /> Today&apos;s Signups
              </div>
              <div className="text-3xl font-extrabold font-mono text-emerald-400 mt-2">
                +{stats.today}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Clock className="h-4 w-4 text-purple-400" /> Past 7 Days
              </div>
              <div className="text-3xl font-extrabold font-mono text-white mt-2">
                {stats.week}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                <Clock className="h-4 w-4 text-amber-400" /> This Month
              </div>
              <div className="text-3xl font-extrabold font-mono text-white mt-2">
                {stats.month}
              </div>
            </div>
          </div>
        )}

        {/* Marketing Attribution Breakdowns */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-blue-400" /> Waitlist by Creator Role
              </h4>
              <div className="space-y-2">
                {Object.entries(stats.byRole).map(([roleName, count]) => (
                  <div key={roleName} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{roleName}</span>
                    <span className="font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-emerald-400" /> Waitlist by UTM Source
              </h4>
              <div className="space-y-2">
                {Object.entries(stats.byUtmSource).length === 0 ? (
                  <span className="text-xs text-zinc-500">No UTM sources recorded yet</span>
                ) : (
                  Object.entries(stats.byUtmSource).map(([src, count]) => (
                    <div key={src} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{src}</span>
                      <span className="font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded">
                        {count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#11141d] p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-purple-400" /> Waitlist by Source
              </h4>
              <div className="space-y-2">
                {Object.entries(stats.bySource).map(([src, count]) => (
                  <div key={src} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{src}</span>
                    <span className="font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="rounded-2xl border border-white/10 bg-[#11141d] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-xl border border-white/10 bg-[#090a0f] pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none transition focus:border-blue-500"
            />
          </form>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(0);
                fetchData(adminKey, 0, search, e.target.value, frequencyFilter);
              }}
              className="rounded-xl border border-white/10 bg-[#090a0f] px-3 py-2 text-xs text-white outline-none"
            >
              <option value="">All Roles</option>
              <option value="Creator">Creator</option>
              <option value="YouTuber">YouTuber</option>
              <option value="Podcaster">Podcaster</option>
              <option value="Agency">Agency</option>
              <option value="Marketer">Marketer</option>
              <option value="Business">Business</option>
              <option value="Educator">Educator</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={frequencyFilter}
              onChange={(e) => {
                setFrequencyFilter(e.target.value);
                setPage(0);
                fetchData(adminKey, 0, search, roleFilter, e.target.value);
              }}
              className="rounded-xl border border-white/10 bg-[#090a0f] px-3 py-2 text-xs text-white outline-none"
            >
              <option value="">All Frequencies</option>
              <option value="1-5">1–5 / mo</option>
              <option value="6-20">6–20 / mo</option>
              <option value="21-50">21–50 / mo</option>
              <option value="50+">50+ / mo</option>
            </select>
          </div>
        </div>

        {/* Leads Table */}
        <div className="rounded-2xl border border-white/10 bg-[#11141d] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02] text-zinc-400 font-semibold">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Videos / Mo</th>
                  <th className="py-3 px-4">UTM Source</th>
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading waitlist leads...
                    </td>
                  </tr>
                ) : subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500">
                      No waitlist subscribers found.
                    </td>
                  </tr>
                ) : (
                  subscribers.map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 px-4 font-medium text-white">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-zinc-300">{s.email}</td>
                      <td className="py-3 px-4 text-zinc-400 font-mono">{s.phone || "—"}</td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold">
                          {s.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">{s.videos_per_month}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                        {s.utm_source || "direct"}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                        {s.utm_campaign || "—"}
                      </td>
                      <td className="py-3 px-4 text-zinc-500">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.08] p-4 text-xs text-zinc-400">
            <div>
              Showing {subscribers.length} of {total} leads
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 0}
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  fetchData(adminKey, newPage * limit, search, roleFilter, frequencyFilter);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="font-mono text-white">Page {page + 1}</span>
              <button
                disabled={(page + 1) * limit >= total}
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  fetchData(adminKey, newPage * limit, search, roleFilter, frequencyFilter);
                }}
                className="rounded-lg border border-white/10 px-3 py-1.5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
