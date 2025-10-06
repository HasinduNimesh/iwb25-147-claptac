import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Plug, Info, CheckCircle2, XCircle, RefreshCcw, Calendar, Layers, Sparkles, Wifi, Activity, Sun, Moon, Loader2, Settings, Scale, Receipt, LogOut, User, Leaf, Plus, Trash2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from './AuthContext';
import Login from './Login.tsx';
import Signup from './Signup.jsx';
import CoachWizard from './CoachWizard.jsx';
import appLogo from '../images/logo.png';

const GQL_URL = "/graphql";
async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors?.[0]?.message || "GraphQL error");
  return json.data;
}
function fmtMoneyLKR(v) { return new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(v || 0); }
// Normalize tariff windows from different service shapes into the UI shape
// Accepts either:
// - { windows: [{ name, startTime, endTime, rateLKR }] }
// - [{ label, startTime, endTime, rateLKRPerKWh }]
function normalizeWindows(input) {
  const arr = Array.isArray(input) ? input : (Array.isArray(input?.windows) ? input.windows : []);
  return arr.map((w) => ({
    name: w.name || w.label || "Window",
    startTime: w.startTime,
    endTime: w.endTime,
    rateLKR: w.rateLKR != null ? w.rateLKR : (w.rateLKRPerKWh != null ? w.rateLKRPerKWh : 0)
  }));
}
function isTOU(t) { return t && (t.tariffType === 'TOU' || (t.tou && !t.block)); }
function isBLOCK(t) { return t && (t.tariffType === 'BLOCK' || (!!t.block)); }
function tariffTypeOf(t) { return isTOU(t) ? 'TOU' : (isBLOCK(t) ? 'BLOCK' : null); }
function slugifyId(s) { try { return (s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ''; } catch { return ''; } }
// Client-side fallback: estimate monthly bill using tariff config
function computeBillPreviewFromTariff(tariff, monthlyKWh = 150) {
  try {
    if (!tariff || typeof tariff !== 'object') return null;
    if (tariff.tariffType === 'TOU') {
      const ws = Array.isArray(tariff.windows) ? tariff.windows : [];
      if (ws.length === 0) return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * 38), note: 'Local estimate (TOU default at 38 LKR/kWh)' };
  const avg = ws.reduce((s, w) => s + Number(w.rateLKR || 0), 0) / ws.length;
  const fixed = Number(tariff.fixedLKR || 0);
  return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * avg) + fixed, note: 'Local estimate (TOU avg + fixed)' };
    }
    if (tariff.tariffType === 'BLOCK') {
      const blocks = Array.isArray(tariff.blocks) ? tariff.blocks : [];
      let cost = 0; let prev = 0; let energy = Number(monthlyKWh);
      // sort by uptoKWh
      const rs = blocks.slice().sort((a, b) => Number(a.uptoKWh||0) - Number(b.uptoKWh||0));
      let lastRate = null;
      for (const b of rs) {
        const upper = Number(b.uptoKWh || 0);
        const span = Math.max(0, upper - prev);
        const inBand = Math.max(0, Math.min(energy, span));
  cost += (inBand * Number(b.rateLKR || 0));
        energy -= inBand; prev = upper; lastRate = b;
        if (energy <= 0) break;
      }
      const fixed = Number(tariff.fixedLKR || 0);
      return { estimatedKWh: monthlyKWh, estimatedCostLKR: cost + fixed, note: 'Local estimate (BLOCK tiers + fixed)' };
    }
  } catch {}
  return null;
}

// Client-side fallback: estimate CO2 projection for the month
function computeProjectionFromConfig(co2Cfg, tariff, eomKWh = 150) {
  try {
    const ef = Number(co2Cfg?.defaultKgPerKWh ?? 0.73); // Sri Lanka grid: ~0.73 kg CO2/kWh
    const totalCO2Kg = eomKWh * ef; // kg
  const bill = computeBillPreviewFromTariff(tariff, eomKWh);
  const totalCostRs = bill ? bill.estimatedCostLKR : (eomKWh * 38); // Fallback to 38 LKR/kWh
    const treesRequired = (totalCO2Kg * 12) / 22; // 22 kg per tree per year
    return { totalKWh: eomKWh, totalCostRs, totalCO2Kg, treesRequired };
  } catch {}
  return null;
}
// Normalize appliances returned by ontology service to UI-friendly shape
// Accepts either:
// - [{ id, label, flexibility }]
// - { appliances: [...] }
function normalizeAppliances(input) {
  const arr = Array.isArray(input) ? input : (Array.isArray(input?.appliances) ? input.appliances : []);
  return arr.map((a) => ({
    id: a.id,
    label: a.label || a.name || a.id,
    flexible: (a.flexible != null) ? !!a.flexible : ((a.flexibility || "").toLowerCase() === "shiftable"),
  }));
}
function todayISOInColombo() {
  const d = new Date(); const y = d.getFullYear(); const m = `${d.getMonth() + 1}`.padStart(2, "0"); const dd = `${d.getDate()}`.padStart(2, "0"); return `${y}-${m}-${dd}`;
}
// Build a savings series from recent usage and today's plan savings
function buildSavingsSeries(usage, plan) {
  try {
    const days = (Array.isArray(usage) ? usage : []).slice(-14);
    const series = days.map((_, idx) => ({ day: idx + 1, saved: 0 }));
    const totalPlanSave = Array.isArray(plan)
      ? plan.reduce((s, r) => s + (Number(r.estSavingLKR) || 0), 0)
      : 0;
    if (series.length > 0) {
      series[series.length - 1].saved = Math.round(totalPlanSave);
    }
    return series.length > 0
      ? series
      : Array.from({ length: 14 }).map((_, i) => ({ day: i + 1, saved: 0 }));
  } catch (_) {
    return Array.from({ length: 14 }).map((_, i) => ({ day: i + 1, saved: 0 }));
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('UI error:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-xl border p-6 text-slate-700">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm mb-4">An error occurred while rendering the UI. Please check the browser console for details.</p>
            <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto max-h-40">{String(this.state.error || '')}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Pill = ({ children, className = "" }) => (<span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${className}`}>{children}</span>);
function Section({ title, icon: Icon, right, children }) {
  return (
    <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 min-w-0">
          {Icon && <Icon className="w-5 h-5 shrink-0" />}
          <h2 className="text-lg font-semibold truncate">{title}</h2>
        </div>
        {right && (
          <div className="w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0">
            {right}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

const Toasts = ({ toasts, onDismiss }) => (
  <div className="fixed bottom-4 right-4 space-y-2 z-50">
    {toasts.map(t => (
      <div key={t.id} className={`px-3 py-2 rounded-lg shadow border text-sm ${t.type==='error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
        <div className="flex items-center gap-2">
          {t.type==='error' ? <XCircle className="w-4 h-4"/> : <CheckCircle2 className="w-4 h-4"/>}
          <span className="truncate">{t.message}</span>
          <button onClick={()=>onDismiss(t.id)} className="ml-2 text-slate-500 hover:text-slate-700">✕</button>
        </div>
      </div>
    ))}
  </div>
);
function SavingsChart({ data }) { return (
  <div className="h-40 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} /><stop offset="95%" stopColor="#22c55e" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Area type="monotone" dataKey="saved" stroke="#16a34a" fillOpacity={1} fill="url(#grad)" />
  </AreaChart></ResponsiveContainer></div>
); }
function TariffBar({ windows = [] }) {
  const segments = React.useMemo(() => {
    if (!Array.isArray(windows) || windows.length === 0) return [];
    const toMin = (s) => {
      if (!s || typeof s !== 'string' || !s.includes(':')) return NaN;
      const [hh, mm] = s.split(":").map((v) => Number(v));
      if (Number.isNaN(hh) || Number.isNaN(mm)) return NaN;
      return hh * 60 + mm;
    };
    const parts = windows
      .map((w) => ({ ...w, start: toMin(w.startTime), end: toMin(w.endTime) }))
      .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end));
    const split = []; parts.forEach((p) => { if (p.end > p.start) { split.push({ ...p, start: p.start, end: p.end }); } else { split.push({ ...p, start: p.start, end: 24 * 60 }); split.push({ ...p, start: 0, end: p.end }); } });
    return split.sort((a, b) => a.start - b.start);
  }, [windows]);
  const total = 24 * 60; const colorMap = { Peak: "bg-rose-500", Day: "bg-amber-500", "Off-Peak": "bg-emerald-500" };

  return (
    <div>
      {(!Array.isArray(windows) || windows.length === 0) && (
        <div className="text-sm text-slate-500">No tariff windows available.</div>
      )}
      <div className="flex w-full h-4 overflow-hidden rounded-lg">{segments.map((s, i) => { const width = ((s.end - s.start) / total) * 100; return <div key={i} className={`${colorMap[s.name] || "bg-slate-400"}`} style={{ width: `${width}%` }} title={`${s.name} ${s.startTime}–${s.endTime} @ LKR ${s.rateLKR}`} />; })}</div>
      <div className="flex justify-between text-xs text-slate-500 mt-1"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <div className="flex gap-2 mt-2 flex-wrap">{windows.map((w, i) => (<Pill key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{w.name}: {w.startTime}–{w.endTime} · {fmtMoneyLKR(w.rateLKR)} /kWh</Pill>))}</div>
    </div>
  );
}

function formatTimeMaybe(dateStr) {
  try {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return null; }
}

function DashboardApp({ user, onLogout }) {
  const [showCoach, setShowCoach] = useState(false);
  const [userId, setUserId] = useState(user?.email || "");
  useEffect(() => { if (user?.email) setUserId(user.email); }, [user?.email]);
  useEffect(() => {
    // Open the wizard the first time for this user only
    if (!userId) return;
    const key = `coachSetupDone:${userId}`;
    const done = localStorage.getItem(key);
    if (!done) setShowCoach(true);
  }, [userId]);
  const [date, setDate] = useState(todayISOInColombo());
  const [alpha, setAlpha] = useState(1);
  const [health, setHealth] = useState(false);
  const [plan, setPlan] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [bill, setBill] = useState(null);
  const [projection, setProjection] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState({});
  const [dismissed, setDismissed] = useState({});
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, type, message }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 2000);
  };

  // Reload user-configured appliances and tasks after Coach changes
  const reloadUserConfig = React.useCallback(async () => {
    try {
      const [cfgRes, tasksRes] = await Promise.all([
        fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(() => null),
        fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`).catch(() => null),
      ]);
      const cfgJson = cfgRes && cfgRes.ok ? await cfgRes.json().catch(() => []) : [];
      const tasksJson = tasksRes && tasksRes.ok ? await tasksRes.json().catch(() => []) : [];
      const list = Array.isArray(cfgJson)
        ? cfgJson.map((x) => ({ id: x.id || x.name, label: x.name || x.id, flexible: !(x.noiseCurfew === true) }))
        : [];
      setAppliances(list);
      const byId = new Map((cfgJson || []).map((a) => [a.id || a.name, a]));
      const mapped = Array.isArray(tasksJson)
        ? tasksJson.map((t) => ({
            id: t.id,
            applianceId: t.applianceId,
            watts: Number(byId.get(t.applianceId || '')?.ratedPowerW ?? 600),
            durationMin: Number(t.durationMin || t.cycleMinutes || 0),
            earliest: t.earliest || '06:00',
            latest: t.latest || t.latestFinish || '22:00',
            repeatsPerWeek: Number(t.repeatsPerWeek || t.runsPerWeek || 1),
          }))
        : [];
      setTasksLocal(mapped);
    } catch (_) {
      // ignore transient reload errors
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDataLoading(true); setError("");
      try {
        // Live API calls through UI gateway; prefer user config
        const data = await gql(`query Q($userId:String!, $date:String!) { health currentPlan(userId:$userId, date:$date){ id applianceId suggestedStart durationMinutes reasons estSavingLKR } }`, { userId, date }).catch(() => null);
        const [tRes, aRes, bRes, pRes, tasksRes, cfgRes, co2Res] = await Promise.all([
          fetch(`/config/tariff?userId=${encodeURIComponent(userId)}`).catch(() => null),
          fetch(`/ontology/appliances?userId=${encodeURIComponent(userId)}`).catch(() => null),
          fetch(`/billing/preview?userId=${encodeURIComponent(userId)}&monthlyKWh=150`).catch(() => null),
          fetch(`/billing/projection?userId=${encodeURIComponent(userId)}&eomKWh=150`).catch(() => null),
          fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`).catch(() => null),
          fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(() => null),
          fetch(`/config/co2?userId=${encodeURIComponent(userId)}`).catch(() => null)
        ]);
    if (cancelled) return;

    // Parse tariff first, then decide plan/health based on tariff type
    const tariffJson = tRes && tRes.ok ? await tRes.json().catch(() => null) : null;
    const tou = isTOU(tariffJson);
    // Only consider plan for TOU users; BLOCK users will intentionally get no time-based plan
    setHealth(tou ? !!data?.currentPlan : true);
    setPlan(tou && Array.isArray(data?.currentPlan) ? data.currentPlan : []);

        setTariff(tariffJson || null);

        const applJson = aRes && aRes.ok ? await aRes.json().catch(() => null) : null;
        const cfgJson = cfgRes && cfgRes.ok ? await cfgRes.json().catch(() => null) : null;
        const haveCfg = Array.isArray(cfgJson) && cfgJson.length > 0;
        if (haveCfg) {
          const list = cfgJson.map(x => ({ id: x.id || x.name, label: x.name || x.id, flexible: !(x.noiseCurfew === true) }));
          setAppliances(list);
        } else {
          // When no user-configured appliances, do not show ontology defaults
          setAppliances([]);
        }

  const billJson = bRes && bRes.ok ? await bRes.json().catch(() => null) : null;
  if (billJson) {
    setBill(billJson);
  } else {
    const localBill = computeBillPreviewFromTariff(tariffJson, 150);
    if (localBill) setBill(localBill);
  }

  const projJson = pRes && pRes.ok ? await pRes.json().catch(() => null) : null;
  if (projJson) {
    setProjection(projJson);
  } else {
    const co2Json = co2Res && co2Res.ok ? await co2Res.json().catch(() => null) : null;
    const localProj = computeProjectionFromConfig(co2Json, tariffJson, 150);
    if (localProj) setProjection(localProj);
  }

        // Load tasks if available and map to local shape
        const tasksJson = tasksRes && tasksRes.ok ? await tasksRes.json().catch(() => null) : null;
        if (Array.isArray(tasksJson)) {
          const byId = new Map(((cfgJson||[]) || []).map(a=>[a.id||a.name, a]));
          const mapped = tasksJson.map(t=>({
            id: t.id,
            applianceId: t.applianceId,
            watts: Number(byId.get(t.applianceId||'')?.ratedPowerW ?? 600),
            durationMin: Number(t.durationMin||t.cycleMinutes||0),
            earliest: t.earliest || '06:00',
            latest: t.latest || t.latestFinish || '22:00',
            repeatsPerWeek: Number(t.repeatsPerWeek||t.runsPerWeek||1),
          }));
          setTasksLocal(mapped);
        } else {
          setTasksLocal([]);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message || String(e)); setPlan([]); setTariff(null); setAppliances([]);
  } finally { if (!cancelled) setDataLoading(false); }
    }
    load(); return () => { cancelled = true; };
  }, [userId, date]);

  async function actOnRecommendation(recId, action) {
    try {
      // Use REST acks via UI gateway to avoid GraphQL mutation requirement
      const path = action === "accept" ? "/advice/accept" : "/advice/dismiss";
      await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recId }) }).catch(() => null);
    } catch (_) {}
    if (action === "accept") setAccepted((m) => ({ ...m, [recId]: true }));
    if (action === "dismiss") setDismissed((m) => ({ ...m, [recId]: true }));
  }
  const totalSaving = React.useMemo(() => plan.reduce((s, r) => s + (r.estSavingLKR || 0), 0), [plan]);
  const safePlan = Array.isArray(plan) ? plan : [];
  const safeAppliances = Array.isArray(appliances) ? appliances : [];
  const planWithAppliance = safePlan.map((r) => ({ ...r, appliance: safeAppliances.find((a) => a.id === r.applianceId) }));

  // Simple Tasks editor state (local-only list + post to backend)
  const [tasksLocal, setTasksLocal] = React.useState([]);
  const [deletingTask, setDeletingTask] = React.useState(null);
  const [mtdKWh, setMtdKWh] = React.useState(58);
  const [usage, setUsage] = React.useState([]);
  const [lastUpdated, setLastUpdated] = React.useState({ usageAt: null, billAt: null, projAt: null, planAt: null });
  const [bw, setBw] = React.useState(null);
  const [showAddAppl, setShowAddAppl] = useState(false);
  const [addAppl, setAddAppl] = useState({ name: '', ratedPowerW: 600, cycleMinutes: 60, latestFinish: '22:00', flexible: true });
  const [savingAdd, setSavingAdd] = useState(false);
  const [savingRemove, setSavingRemove] = useState({});

  // Compute kWh for current task input
  function kwhOf(watts, minutes) {
    const w = Number(watts||0); const m = Number(minutes||0);
    return (w/1000) * (m/60);
  }

  async function saveTasks() {
    try {
      const body = tasksLocal.map((t, i)=>({ id: t.id || `t${i+1}`, applianceId: t.applianceId || (safeAppliances[0]?.id||'unknown'), durationMin: Number(t.durationMin||0), earliest: t.earliest||'06:00', latest: t.latest||'22:00', repeatsPerWeek: Number(t.repeatsPerWeek||1) }));
      await fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
      // Re-optimize after saving
      const res = await fetch('/scheduler/optimize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, date, alpha }) }).catch(()=>null);
      const j = res && res.ok ? await res.json().catch(()=>null) : null;
      if (j?.plan) setPlan(j.plan);
    } catch {}
  }

  async function deleteTaskAt(index) {
    try {
      const ok = typeof window !== 'undefined' ? window.confirm('Delete this task?') : true;
      if (!ok) return;
      setDeletingTask(index);
      const next = tasksLocal.filter((_, i) => i !== index);
      setTasksLocal(next); // optimistic
      const body = next.map((t, i)=>({ id: t.id || `t${i+1}`, applianceId: t.applianceId || (safeAppliances[0]?.id||'unknown'), durationMin: Number(t.durationMin||0), earliest: t.earliest||'06:00', latest: t.latest||'22:00', repeatsPerWeek: Number(t.repeatsPerWeek||1) }));
      const res = await fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}).catch(()=>null);
      if (!(res && res.ok)) throw new Error('Delete failed');
      showToast('Task deleted');
    } catch (_) {
      showToast('Delete failed','error');
    } finally {
      setDeletingTask(null);
    }
  }

  async function checkBlockWarning(task) {
    const kw = kwhOf(task.watts, task.durationMin);
    const res = await fetch(`/billing/blockwarning?userId=${encodeURIComponent(userId)}&currentKWh=${mtdKWh}&taskKWh=${kw}`).catch(()=>null);
    const j = res && res.ok ? await res.json().catch(()=>null) : null;
    setBw(j||null);
  }

  // Add or remove appliances (persisted via /config/appliances)
  async function saveNewAppliance() {
    if (!addAppl.name || String(addAppl.name).trim().length === 0) { showToast('Enter a name','error'); return; }
    setSavingAdd(true);
    try {
      const id = slugifyId(addAppl.name) || `appliance-${Date.now()}`;
      const cfgRes = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(()=>null);
      const existing = cfgRes && cfgRes.ok ? await cfgRes.json().catch(()=>[]) : [];
      // Avoid duplicates by id
      const filtered = Array.isArray(existing) ? existing.filter(x => (x.id||x.name) !== id) : [];
      const nextItem = {
        id,
        name: addAppl.name.trim(),
        ratedPowerW: Number(addAppl.ratedPowerW||0),
        cycleMinutes: Number(addAppl.cycleMinutes||0),
        latestFinish: addAppl.latestFinish || '22:00',
        noiseCurfew: !addAppl.flexible,
      };
      const next = [...filtered, nextItem];
      const res = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) }).catch(()=>null);
      if (!(res && res.ok)) throw new Error('Save failed');
      await reloadUserConfig();
      setShowAddAppl(false);
      setAddAppl({ name: '', ratedPowerW: 600, cycleMinutes: 60, latestFinish: '22:00', flexible: true });
      showToast('Appliance added');
    } catch (_) {
      showToast('Add failed','error');
    } finally {
      setSavingAdd(false);
    }
  }

  async function removeAppliance(id) {
    try {
      const ok = typeof window !== 'undefined' ? window.confirm('Remove this appliance?') : true;
      if (!ok) return;
      setSavingRemove(m=>({ ...m, [id]: true }));
      const cfgRes = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(()=>null);
      const existing = cfgRes && cfgRes.ok ? await cfgRes.json().catch(()=>[]) : [];
      const next = (Array.isArray(existing)?existing:[]).filter(x => (x.id||x.name) !== id);
      const res = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(next) }).catch(()=>null);
      if (!(res && res.ok)) throw new Error('Delete failed');
      // Remove tasks that reference this appliance, server-side and locally
      const tasksRes = await fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`).catch(()=>null);
      const tasksJson = tasksRes && tasksRes.ok ? await tasksRes.json().catch(()=>[]) : [];
      const remainingTasks = (Array.isArray(tasksJson)?tasksJson:[]).filter(t => t.applianceId !== id);
      const removedCount = (Array.isArray(tasksJson)?tasksJson:[]).length - remainingTasks.length;
      // Persist filtered tasks using the expected shape
      const toPost = remainingTasks.map(t => ({ id: t.id, applianceId: t.applianceId, durationMin: Number(t.durationMin||t.cycleMinutes||0), earliest: t.earliest || '06:00', latest: t.latest || t.latestFinish || '22:00', repeatsPerWeek: Number(t.repeatsPerWeek||t.runsPerWeek||1) }));
      const resTasks = await fetch(`/config/tasks?userId=${encodeURIComponent(userId)}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(toPost) }).catch(()=>null);
      if (!(resTasks && resTasks.ok)) throw new Error('Task cleanup failed');
      // Update local UI state
      setTasksLocal(prev => prev.filter(t => t.applianceId !== id));
      await reloadUserConfig();
      showToast(removedCount > 0 ? `Removed (and ${removedCount} task${removedCount>1?'s':''})` : 'Removed');
    } catch (_) {
      showToast('Remove failed','error');
    } finally {
      setSavingRemove(m=>{ const n={...m}; delete n[id]; return n; });
    }
  }

  // Load recent usage for charts and MTD
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/reports/usage?userId=${encodeURIComponent(userId)}&days=31`).catch(() => null);
        const data = res && res.ok ? await res.json().catch(() => []) : [];
        if (cancelled) return;
        const arr = Array.isArray(data) ? data : [];
        setUsage(arr);
        const ym = new Date().toISOString().slice(0, 7);
        const mtd = arr
          .filter(e => typeof e.date === 'string' && e.date.startsWith(ym))
          .reduce((s, e) => s + (Number(e.kWh) || 0), 0);
  setMtdKWh(Math.round(mtd));
  setLastUpdated((lu)=>({ ...lu, usageAt: new Date() }));
      } catch (_) { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Persist a shiftable toggle by updating config overrides (noiseCurfew = !flexible)
  let _toggleInFlight = false;
  let _toggleQueued = null;
  const [savingToggles, setSavingToggles] = useState({});
  async function persistApplianceFlexible(id, flexible) {
    if (_toggleInFlight) { _toggleQueued = { id, flexible }; return; }
    _toggleInFlight = true;
    try {
      // Optimistic UI update
      setAppliances((arr) => arr.map((a) => (a.id === id ? { ...a, flexible } : a)));
      setSavingToggles((m)=>({ ...m, [id]: true }));

      // Get existing overrides
      const cfgRes = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(() => null);
      const existing = cfgRes && cfgRes.ok ? await cfgRes.json().catch(() => []) : [];

      // Build next overrides array
      const byId = new Map();
      if (Array.isArray(existing)) {
        for (const it of existing) { if (it && typeof it === 'object') byId.set(it.id || it.name, it); }
      }
      const wantId = id;
      const cur = byId.get(wantId) || {};
      const label = (safeAppliances.find((a) => a.id === wantId)?.label) || cur.name || wantId;
      const nextItem = {
        id: wantId,
        name: label,
        ratedPowerW: cur.ratedPowerW ?? 0,
        cycleMinutes: cur.cycleMinutes ?? 0,
        latestFinish: cur.latestFinish ?? '22:00',
        noiseCurfew: !flexible,
      };
      byId.set(wantId, nextItem);
      const next = Array.from(byId.values());

      const res = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      }).catch(() => null);
      const ok = !!(res && res.ok);
      if (!ok) throw new Error('Save failed');
      // Re-sync from server to avoid any local drift or stale fields
      await reloadUserConfig();
      showToast('Saved');
    } catch (_) {
      // Revert optimistic change on failure
      setAppliances((arr) => arr.map((a) => (a.id === id ? { ...a, flexible: !flexible } : a)));
      showToast('Save failed', 'error');
    } finally {
      _toggleInFlight = false;
      setSavingToggles((m)=>{ const n={...m}; delete n[id]; return n; });
      if (_toggleQueued) {
        const nextReq = _toggleQueued; _toggleQueued = null;
        // Fire and forget the last queued state
        persistApplianceFlexible(nextReq.id, nextReq.flexible);
      }
    }
  }

  return (
    <ErrorBoundary>
  <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-emerald-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 gap-y-2">
          <img src={appLogo} alt="LankaWatteWise logo" className="w-7 h-7 rounded-md object-cover" />
          <h1 className="text-xl font-bold">LankaWatteWise</h1>
          <Pill className="ml-2 bg-emerald-100 text-emerald-700">Ontology-Driven</Pill>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input type="date" className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 text-base" value={date} onChange={(e) => setDate(e.target.value)} />
            {/* user selection removed; using authenticated user */}
            <div className="hidden md:flex items-center gap-2 md:ml-4 md:pl-4 md:border-l md:border-slate-300 md:dark:border-slate-700">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600 dark:text-slate-400 truncate max-w-[40ch]">{user?.email}</span>
              <button 
                onClick={onLogout}
                className="flex items-center gap-1 px-2 py-1 text-sm text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
            {/* Mobile quick actions */}
            <button
              onClick={onLogout}
              className="md:hidden ml-auto inline-flex items-center gap-1 px-2 py-1 text-sm text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

  <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1 lg:col-span-1 space-y-4">
          <Section title="HomeEnergy Coach" icon={Settings} right={null}>
            <div className="text-sm text-slate-600">Answer a few questions to tailor tariffs, tasks, CO₂, and solar settings.</div>
            <div className="mt-2"><button className="px-3 py-1.5 rounded bg-emerald-600 text-white" onClick={()=>setShowCoach(true)}>Open Coach</button></div>
          </Section>
          <Section title="Today's Savings" icon={TrendingUp} right={<div className="flex items-center gap-2 text-sm text-slate-500">
            {tariffTypeOf(tariff) && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-700">
                {tariffTypeOf(tariff)} tariff
              </span>
            )}
            <Wifi className={`w-4 h-4 ${health ? "text-emerald-500" : "text-slate-400"}`} /><span>{health ? "Connected" : "Offline"}</span>
          </div>}>
            <div className="flex items-end gap-4"><div><div className="text-3xl font-extrabold">{fmtMoneyLKR(totalSaving)}</div><div className="text-sm text-slate-500">Estimated saving for {date} from your plan</div></div></div>
            <div className="mt-3 flex items-start justify-between gap-2">
              <div className="flex-1"><SavingsChart data={buildSavingsSeries(usage, plan)} /></div>
              <Info className="w-4 h-4 text-slate-400 mt-1" title="Savings uses today's recommended plan and your recent usage from Reports service." />
            </div>
            {lastUpdated.usageAt && (
              <div className="mt-2 text-xs text-slate-500">{(() => { const secs=Math.max(1,Math.floor((Date.now()-new Date(lastUpdated.usageAt).getTime())/1000)); const when=secs<60?`${secs}s ago`:`${Math.floor(secs/60)}m ago`; return `Reports service • ${when}`; })()}</div>
            )}
          </Section>
          {isTOU(tariff) ? (
            <Section title="Tariff Windows (Asia/Colombo)" icon={Info}>
              {tariff ? <TariffBar windows={normalizeWindows(tariff)} /> : <div className="text-slate-500">Configure your tariff in the Coach.</div>}
            </Section>
          ) : isBLOCK(tariff) ? (
            <Section title="Tariff (Block Rates)" icon={Info}>
              {Array.isArray(tariff?.blocks) && tariff.blocks.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-sm">
                  {tariff.blocks.map((b,i)=> (
                    <Pill key={i} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                      Up to {b.uptoKWh} kWh: {fmtMoneyLKR(b.rateLKR)} /kWh
                    </Pill>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500">Configure your block tariff in the Coach.</div>
              )}
            </Section>
          ) : (
            <Section title="Tariff" icon={Info}><div className="text-slate-500">Configure your tariff in the Coach.</div></Section>
          )}
          <Section title="Bill Preview" icon={Receipt}>
            {bill ? (
              <div className="text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${bill?.note?.toLowerCase?.().includes('local') ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>
                    {bill?.note?.toLowerCase?.().includes('local') ? 'Local estimate' : 'Live'}
                  </span>
                  <span>For 150 kWh: <b>{fmtMoneyLKR(Math.round((bill.monthlyEstLKR || bill.estimatedCostLKR || 0)))}</b></span>
                </div>
                <div className="text-slate-500">{bill.note || ''}</div>
              </div>
            ) : (
              <div className="text-slate-500">No bill estimate yet. Complete the Coach to set your plan.</div>
            )}
          </Section>

          <Section title="Carbon Offset" icon={Leaf}>
            {projection ? (()=>{
              const monthly = Number(projection.totalCO2Kg ?? 0);
              const annual = monthly * 12;
              const trees = Math.max(0, Math.ceil(Number(projection.treesRequired ?? (annual/22))));
              const treeCount = Math.min(trees, 24);
              return (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-4">
                  <div className="mb-1">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700">{bill?.note?.toLowerCase?.().includes('local') ? 'Local estimate' : 'Live'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Leaf className="w-6 h-6 text-emerald-600 dark:text-emerald-300" />
                    <div>
                      <div className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Estimated trees to offset yearly</div>
                      <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">{trees}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                    {monthly.toFixed(1)} kg/mo → {Math.round(annual)} kg/yr → {trees} trees (22 kg/tree/yr)
                  </div>
                  <div className="mt-3 grid grid-cols-12 gap-1 select-none" aria-hidden>
                    {Array.from({length: treeCount}).map((_,i)=> (<div key={i} className="text-base">🌳</div>))}
                  </div>
                </div>
              );
            })() : (
              <div className="text-slate-500">No CO₂ projection yet. Set your CO₂ model in the Coach or use Quick Setup → Set CO₂ 0.53.</div>
            )}
          </Section>
        </div>
        <div className="col-span-1 lg:col-span-2 space-y-4">
          {isTOU(tariff) && (
          <Section title="Recommended Plan" icon={Plug} right={<div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-slate-600 w-full sm:w-auto"><Scale className="w-4 h-4" /> <span>Money</span>
              <input className="w-full sm:w-40" aria-label="alpha" type="range" min="0" max="1" step="0.1" value={alpha} onChange={(e)=>setAlpha(parseFloat(e.target.value))} /> <span>CO2</span></div>
            <button className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm hover:opacity-90 w-full sm:w-auto" onClick={async()=>{
              const res = await fetch('/scheduler/optimize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, date, alpha }) }).catch(()=>null);
              const j = res && res.ok ? await res.json().catch(()=>null) : null;
              if (j?.plan) setPlan(j.plan);
            }}><RefreshCcw className="w-4 h-4" /> Optimize</button>
          </div>}>
            {dataLoading && (<div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-4 h-4 animate-spin"/> Loading plan...</div>)}
            {!dataLoading && (
              <div className="space-y-3">
                <AnimatePresence>
                  {planWithAppliance.map((rec) => (
                    <motion.div key={rec.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`p-4 rounded-xl border ${accepted[rec.id] ? "border-emerald-300 bg-emerald-50" : dismissed[rec.id] ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white/80"}`}>
                      <div className="flex items-start gap-3">
                        {rec.appliance?.icon ? (<rec.appliance.icon className="w-5 h-5 mt-0.5 text-slate-600" />) : (<Plug className="w-5 h-5 mt-0.5 text-slate-600" />)}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold">{rec.appliance?.label || rec.applianceId}</div>
                            <Pill className="bg-emerald-100 text-emerald-700">{formatTimeMaybe(rec.suggestedStart) || 'TBD'}</Pill>
                            <Pill className="bg-slate-100 text-slate-700">{rec.durationMinutes} min</Pill>
                            <Pill className="bg-amber-100 text-amber-700">{fmtMoneyLKR(rec.estSavingLKR)} est.</Pill>
                          </div>
                          <details className="mt-2"><summary className="cursor-pointer text-sm text-slate-600">Why this?</summary><ul className="mt-2 text-sm text-slate-600 list-disc pl-5">{rec.reasons?.map((r, i) => (<li key={i}>{r}</li>))}</ul></details>
                        </div>
                        <div className="flex gap-2">
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => actOnRecommendation(rec.id, "accept")}><CheckCircle2 className="w-4 h-4" /> Accept</button>
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700" onClick={() => actOnRecommendation(rec.id, "dismiss")}><XCircle className="w-4 h-4" /> Dismiss</button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Section>
          )}

          <Section title="Tasks" icon={Layers}>
            <div className="text-sm text-slate-600 mb-2">Month-to-date usage: <b>{mtdKWh}</b> kWh</div>
            {bw && (
              <div className={`mb-2 p-2 rounded border ${bw.willCross ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                {bw.willCross ? (
                  <div>You are near the next block (≤ {bw.nextThresholdKWh} kWh). This task would push you over. Δfixed {fmtMoneyLKR(Math.round(bw.deltaFixed||0))}, Δmarginal {fmtMoneyLKR(Math.round(bw.deltaMarginal||0))}.</div>
                ) : (
                  <div>No block crossing risk for this task.</div>
                )}
              </div>
            )}
            <div className="grid gap-2">
              {tasksLocal.map((t,i)=> (
                <div key={i} className="flex flex-wrap items-end gap-2 p-3 rounded border">
                  <div className="flex flex-col">
                    <label className="text-xs">Appliance</label>
                    <select className="border rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" value={t.applianceId||''} onChange={e=>{ const v=[...tasksLocal]; v[i]={...t, applianceId:e.target.value}; setTasksLocal(v); }}>
                      {safeAppliances.map(a=> (<option key={a.id} value={a.id}>{a.label}</option>))}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs">Watts</label>
                    <input className="border rounded px-2 py-1 w-24 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" type="number" value={t.watts||''} onChange={e=>{ const v=[...tasksLocal]; v[i]={...t, watts:e.target.value}; setTasksLocal(v); checkBlockWarning({...t, watts:e.target.value}); }} />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs">Duration (min)</label>
                    <input className="border rounded px-2 py-1 w-24 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" type="number" value={t.durationMin||''} onChange={e=>{ const v=[...tasksLocal]; v[i]={...t, durationMin:e.target.value}; setTasksLocal(v); checkBlockWarning({...t, durationMin:e.target.value}); }} />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs">Earliest</label>
                    <input className="border rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" type="time" value={t.earliest||'06:00'} onChange={e=>{ const v=[...tasksLocal]; v[i]={...t, earliest:e.target.value}; setTasksLocal(v); }} />
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs">Latest</label>
                    <input className="border rounded px-2 py-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" type="time" value={t.latest||'22:00'} onChange={e=>{ const v=[...tasksLocal]; v[i]={...t, latest:e.target.value}; setTasksLocal(v); }} />
                  </div>
                  <div className="flex-1" />
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm" onClick={saveTasks}>Save</button>
                    <button title="Delete task" disabled={deletingTask===i} className="px-2 py-1.5 rounded border text-sm hover:bg-rose-50 text-rose-600 disabled:opacity-60" onClick={()=>deleteTaskAt(i)}>
                      <Trash2 className="w-4 h-4 inline-block mr-1"/> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2"><button className="text-sm text-blue-600" onClick={()=>{ setTasksLocal([...tasksLocal, { id:'', applianceId:safeAppliances[0]?.id, watts:600, durationMin:120, earliest:'01:30', latest:'04:00', repeatsPerWeek:1 }]); bw && setBw(null); }}>+ Add task</button></div>
          </Section>

          <Section title="Appliances" icon={Layers}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-slate-600">Manage your devices and their shiftability.</div>
              <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-sm" onClick={()=>setShowAddAppl(v=>!v)}>
                <Plus className="w-4 h-4"/> {showAddAppl ? 'Close' : 'Add appliance'}
              </button>
            </div>
            {showAddAppl && (
              <div className="mb-3 p-3 rounded-xl border border-slate-200 bg-white/80 dark:bg-slate-900/40">
                <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
                  <div className="flex flex-col"><label className="text-xs">Name</label><input className="border rounded px-2 py-1 bg-white dark:bg-slate-900" value={addAppl.name} onChange={e=>setAddAppl(a=>({ ...a, name:e.target.value }))} placeholder="e.g., Dryer"/></div>
                  <div className="flex flex-col"><label className="text-xs">Watts</label><input className="border rounded px-2 py-1 bg-white dark:bg-slate-900" type="number" value={addAppl.ratedPowerW} onChange={e=>setAddAppl(a=>({ ...a, ratedPowerW:e.target.value }))}/></div>
                  <div className="flex flex-col"><label className="text-xs">Cycle (min)</label><input className="border rounded px-2 py-1 bg-white dark:bg-slate-900" type="number" value={addAppl.cycleMinutes} onChange={e=>setAddAppl(a=>({ ...a, cycleMinutes:e.target.value }))}/></div>
                  <div className="flex flex-col"><label className="text-xs">Latest</label><input className="border rounded px-2 py-1 bg-white dark:bg-slate-900" type="time" value={addAppl.latestFinish} onChange={e=>setAddAppl(a=>({ ...a, latestFinish:e.target.value }))}/></div>
                  <div className="flex items-center gap-2"><label className="text-xs">Shiftable</label><input type="checkbox" checked={addAppl.flexible} onChange={e=>setAddAppl(a=>({ ...a, flexible:e.target.checked }))}/></div>
                  <div className="flex items-center gap-2">
                    <button disabled={savingAdd} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60" onClick={saveNewAppliance}>{savingAdd ? 'Saving…' : 'Save'}</button>
                    <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={()=>{ setShowAddAppl(false); }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {safeAppliances.length === 0 ? (
              <div className="text-sm text-slate-600">
                No appliances yet. <button className="text-blue-600 underline" onClick={()=>setShowCoach(true)}>Add from Coach</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {safeAppliances.map((a) => (
                  <div key={a.id} className="p-3 rounded-xl border border-slate-200 bg-white/70 flex items-center gap-3">
                    {a.icon ? <a.icon className="w-5 h-5 text-slate-600" /> : <Plug className="w-5 h-5 text-slate-600" />}
                    <div className="flex-1 min-w-0"><div className="font-medium truncate">{a.label}</div><div className="text-xs text-slate-500">{a.flexible ? "Shiftable" : "Non-shiftable"}</div></div>
                    <label className="inline-flex items-center cursor-pointer select-none">
                      <input type="checkbox" className="sr-only peer" checked={!!a.flexible} disabled={!!savingToggles[a.id]} onChange={(e)=>persistApplianceFlexible(a.id, e.target.checked)} />
                      <div className={`w-10 h-6 ${savingToggles[a.id] ? 'bg-slate-300' : 'bg-slate-200'} rounded-full peer-checked:bg-emerald-500 relative transition`}>
                        {savingToggles[a.id] ? (
                          <Loader2 className="w-4 h-4 absolute top-1 left-3 text-slate-600 animate-spin" />
                        ) : (
                          <div className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 peer-checked:left-4 transition"/>
                        )}
                      </div>
                    </label>
                    <button title="Remove" disabled={!!savingRemove[a.id]} onClick={()=>removeAppliance(a.id)} className="ml-1 p-1 rounded hover:bg-rose-50 text-rose-600 disabled:opacity-60">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Quick Setup" icon={Settings}>
            <div className="flex flex-wrap gap-2 text-sm">
              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                const body = { utility:"CEB", tariffType:"TOU", windows:[
                  {name:"Peak", startTime:"18:30", endTime:"22:30", rateLKR:68.0},
                  {name:"Day", startTime:"05:30", endTime:"18:30", rateLKR:38.0},
                  {name:"Off-Peak", startTime:"22:30", endTime:"05:30", rateLKR:16.5}
                ]};
                await fetch(`/config/tariff?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
                // refetch tariff
                const tRes = await fetch(`/tariff/windows?date=${date}`).catch(()=>null);
                const tJ = tRes && tRes.ok ? await tRes.json().catch(()=>null) : null;
                setTariff(tJ || body);
              }}>Set TOU (CEB)</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                const items = [
                  { id:"fridge", name:"Refrigerator", ratedPowerW:150, cycleMinutes:1440, latestFinish:"23:59", noiseCurfew:false },
                  { id:"pump", name:"Water Pump", ratedPowerW:750, cycleMinutes:30, latestFinish:"06:00", noiseCurfew:false },
                  { id:"washer", name:"Washing Machine", ratedPowerW:500, cycleMinutes:60, latestFinish:"22:00", noiseCurfew:true },
                  { id:"ac", name:"Air Conditioner", ratedPowerW:1200, cycleMinutes:180, latestFinish:"23:00", noiseCurfew:false }
                ];
                await fetch(`/config/appliances?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(items)});
                await reloadUserConfig(); // Reload to show new appliances
              }}>Save Appliances</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                await fetch(`/config/co2?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ defaultKgPerKWh:0.73 })});
                // Re-fetch projection with new CO2 factor
                const pRes = await fetch(`/billing/projection?userId=${encodeURIComponent(userId)}&eomKWh=150`).catch(()=>null);
                const pJ = pRes && pRes.ok ? await pRes.json().catch(()=>null) : null;
                if (pJ) setProjection(pJ);
              }}>Set CO₂ 0.73 (LK Grid)</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                await fetch(`/config/solar?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scheme:"NET_ACCOUNTING", exportPriceLKR:22.0 })});
              }}>Set Solar (22 LKR/kWh)</button>
            </div>
          </Section>
        </div>
      </main>

      {error && (<div className="fixed bottom-4 right-4 bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg shadow">{error}</div>)}

  <footer className="max-w-6xl mx-auto p-4 text-xs text-slate-500"><div className="flex items-center gap-2"><Info className="w-4 h-4" /><span>Uses your configured tariff, appliances, CO₂ and solar. If services are offline, some sections may be empty.</span></div></footer>
  <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white/90 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 backdrop-blur p-2 flex items-center justify-around z-40">
    <button className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm flex items-center gap-2" onClick={()=>{
      fetch('/scheduler/optimize', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId, date, alpha }) }).then(r=>r.json()).then(j=>{ if (j?.plan) { setPlan(j.plan); showToast('Plan updated'); } });
    }}><RefreshCcw className="w-4 h-4"/> Optimize</button>
    <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={()=>{ setTasksLocal([...tasksLocal, { id:'', applianceId:safeAppliances[0]?.id, watts:600, durationMin:120, earliest:'01:30', latest:'04:00', repeatsPerWeek:1 }]); }}>+ Task</button>
    <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={()=>setShowCoach(true)}>Coach</button>
  </div>
  <Toasts toasts={toasts} onDismiss={(id)=>setToasts(ts=>ts.filter(x=>x.id!==id))} />
  </div>
  {showCoach && (
    <CoachWizard
      userId={userId}
      onClose={() => setShowCoach(false)}
      onComplete={() => setShowCoach(false)}
      onChange={() => reloadUserConfig()}
    />
  )}
  </ErrorBoundary>
  );
}

export default function LankaWatteWiseApp() {
  const { user, isAuthenticated, login, signup, logout, loading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  // Initial auth check loading state (no hooks after this return in this component)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  // If not authenticated, show login/signup screen (still no extra hooks below)
  if (!isAuthenticated()) {
    // Render full-screen auth pages directly (they already include their own layout)
    return showSignup ? (
      <Signup onSignup={(u) => login(u)} onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onLogin={(u) => login(u)} onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  // Authenticated branch: render child component that owns its hooks
  return <DashboardApp user={user} onLogout={logout} />;
}
