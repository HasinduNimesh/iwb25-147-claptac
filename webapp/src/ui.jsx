import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Plug, Info, CheckCircle2, XCircle, RefreshCcw, Calendar, Layers, Sparkles, Wifi, Activity, Sun, Moon, Loader2, Settings, Scale, Receipt, LogOut, User } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useAuth } from './AuthContext.jsx';
import Login from './Login.jsx';
import Signup from './Signup.jsx';
import CoachWizard from './CoachWizard.jsx';

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
const mockTariffs = { windows: [ { name: "Peak", startTime: "18:30", endTime: "22:30", rateLKR: 70 }, { name: "Day", startTime: "05:30", endTime: "18:30", rateLKR: 45 }, { name: "Off-Peak", startTime: "22:30", endTime: "05:30", rateLKR: 25 } ] };
const mockAppliances = [ 
  { id: "WellPump", label: "Well Pump", flexible: true, icon: Plug }, 
  { id: "WashingMachine", label: "Washing Machine", flexible: true, icon: Activity }, 
  { id: "BedroomAC", label: "Bedroom AC", flexible: true, icon: Sun }, 
  { id: "freezer", label: "Freezer", flexible: false, icon: Moon } 
];
const mockPlan = [ 
  { id: "rec-1", applianceId: "WellPump", suggestedStart: `${todayISOInColombo()}T21:00:00`, durationMinutes: 30, reasons: ["Rule:MinRuntime30", "Window:OffPeak_21_00_05_30"], estSavingLKR: 58 }, 
  { id: "rec-2", applianceId: "WashingMachine", suggestedStart: `${todayISOInColombo()}T21:30:00`, durationMinutes: 60, reasons: ["Constraint:Shiftable", "Avoid:Peak"], estSavingLKR: 112 } 
];
const mockSavingsSeries = Array.from({ length: 14 }).map((_, i) => ({ day: i + 1, saved: Math.round(200 + Math.random() * 120) }));

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
function Section({ title, icon: Icon, right, children }) { return (<div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4">
  <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">{Icon && <Icon className="w-5 h-5" />}<h2 className="text-lg font-semibold">{title}</h2></div><div>{right}</div></div>{children}
</div>); }
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
  const [userId, setUserId] = useState(user?.email || "demo");
  useEffect(() => { if (user?.email) setUserId(user.email); }, [user?.email]);
  useEffect(() => {
    // Open the wizard if first time after login
    const first = localStorage.getItem('coachSetupDone');
    if (!first) setShowCoach(true);
  }, []);
  const [date, setDate] = useState(todayISOInColombo());
  const [alpha, setAlpha] = useState(1);
  const [health, setHealth] = useState(null);
  const [plan, setPlan] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [bill, setBill] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState({});
  const [dismissed, setDismissed] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setDataLoading(true); setError("");
      try {
        // Live API calls through UI gateway with graceful fallbacks
        const data = await gql(`query Q($userId:String!, $date:String!) { health currentPlan(userId:$userId, date:$date){ id applianceId suggestedStart durationMinutes reasons estSavingLKR } }`, { userId, date }).catch(() => null);
        const [tRes, aRes, bRes] = await Promise.all([
          fetch(`/tariff/windows?date=${date}`).catch(() => null),
          fetch(`/ontology/appliances?userId=${userId}`).catch(() => null),
          fetch(`/billing/preview?userId=${userId}&monthlyKWh=150`).catch(() => null)
        ]);
        if (cancelled) return;

        setHealth(data?.health || "ok");
        setPlan(Array.isArray(data?.currentPlan) ? data.currentPlan : mockPlan);

        const tariffJson = tRes && tRes.ok ? await tRes.json().catch(() => null) : null;
        setTariff(tariffJson || mockTariffs);

        const applJson = aRes && aRes.ok ? await aRes.json().catch(() => null) : null;
        const normAppl = normalizeAppliances(applJson);
        setAppliances(normAppl.length ? normAppl : mockAppliances);

        const billJson = bRes && bRes.ok ? await bRes.json().catch(() => null) : null;
        setBill(billJson || { estimatedCostLKR: 4200, note: "mock" });
      } catch (e) {
        if (cancelled) return;
        setError(e.message || String(e)); setPlan(mockPlan); setTariff(mockTariffs); setAppliances(mockAppliances);
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

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-bold">LankaWattWise</h1>
          <Pill className="ml-2 bg-emerald-100 text-emerald-700">Ontology-Driven</Pill>
          <div className="ml-auto flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input type="date" className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50" value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="hidden sm:flex items-center gap-2 ml-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <select className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="demo">Household (demo)</option>
                <option value="bakery">Bakery (demo)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-300 dark:border-slate-700">
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</span>
              <button 
                onClick={onLogout}
                className="flex items-center gap-1 px-2 py-1 text-sm text-slate-600 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1 lg:col-span-1 space-y-4">
          <Section title="HomeEnergy Coach" icon={Settings} right={null}>
            <div className="text-sm text-slate-600">Answer a few questions to tailor tariffs, tasks, CO₂, and solar settings.</div>
            <div className="mt-2"><button className="px-3 py-1.5 rounded bg-emerald-600 text-white" onClick={()=>setShowCoach(true)}>Open Coach</button></div>
          </Section>
          <Section title="Today's Savings" icon={TrendingUp} right={<div className="flex items-center gap-2 text-sm text-slate-500"><Wifi className={`w-4 h-4 ${health ? "text-emerald-500" : "text-slate-400"}`} /><span>{health ? "Connected" : "Offline"}</span></div>}>
            <div className="flex items-end gap-4"><div><div className="text-3xl font-extrabold">{fmtMoneyLKR(totalSaving)}</div><div className="text-sm text-slate-500">Potential saving for {date}</div></div></div>
            <div className="mt-3"><SavingsChart data={mockSavingsSeries} /></div>
          </Section>
          <Section title="Tariff Windows (Asia/Colombo)" icon={Info}>{tariff ? <TariffBar windows={normalizeWindows(tariff)} /> : <div className="text-slate-500">Loading...</div>}</Section>
          <Section title="Bill Preview" icon={Receipt}>
            {bill ? (
              <div className="text-sm text-slate-600">For 200 kWh: <b>{fmtMoneyLKR(Math.round((bill.monthlyEstLKR || bill.estimatedCostLKR || 0)))}</b> <span className="text-slate-500">{bill.note || ""}</span></div>
            ) : (
              <div className="text-slate-500">Loading...</div>
            )}
          </Section>
        </div>
        <div className="col-span-1 lg:col-span-2 space-y-4">
          <Section title="Recommended Plan" icon={Plug} right={<div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600"><Scale className="w-4 h-4" /> <span>Money</span>
              <input aria-label="alpha" type="range" min="0" max="1" step="0.1" value={alpha} onChange={(e)=>setAlpha(parseFloat(e.target.value))} /> <span>CO2</span></div>
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm hover:opacity-90" onClick={async()=>{
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

          <Section title="Appliances" icon={Layers}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {safeAppliances.map((a) => (
                <div key={a.id} className="p-3 rounded-xl border border-slate-200 bg-white/70 flex items-center gap-3">
                  {a.icon ? <a.icon className="w-5 h-5 text-slate-600" /> : <Plug className="w-5 h-5 text-slate-600" />}
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{a.label}</div><div className="text-xs text-slate-500">{a.flexible ? "Shiftable" : "Non-shiftable"}</div></div>
                  <label className="inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" className="sr-only peer" defaultChecked={a.flexible} />
                    <div className="w-10 h-6 bg-slate-200 rounded-full peer-checked:bg-emerald-500 relative transition"><div className="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 peer-checked:left-4 transition"/></div>
                  </label>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Quick Setup" icon={Settings}>
            <div className="flex flex-wrap gap-2 text-sm">
              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                const body = { utility:"CEB", tariffType:"TOU", windows:[
                  {name:"Peak", startTime:"18:30", endTime:"22:30", rateLKR:70},
                  {name:"Day", startTime:"05:30", endTime:"18:30", rateLKR:45},
                  {name:"Off-Peak", startTime:"22:30", endTime:"05:30", rateLKR:25}
                ]};
                await fetch(`/config/tariff?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
                // refetch tariff
                const tRes = await fetch(`/tariff/windows?date=${date}`).catch(()=>null);
                const tJ = tRes && tRes.ok ? await tRes.json().catch(()=>null) : null;
                setTariff(tJ || body);
              }}>Set TOU (CEB)</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                const items = [
                  { id:"pump", name:"Well Pump", ratedPowerW:750, cycleMinutes:30, latestFinish:"06:00", noiseCurfew:false },
                  { id:"washer", name:"Washing Machine", ratedPowerW:500, cycleMinutes:60, latestFinish:"22:00", noiseCurfew:true }
                ];
                await fetch(`/config/appliances?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(items)});
              }}>Save Appliances</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                await fetch(`/config/co2?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ defaultKgPerKWh:0.53 })});
              }}>Set CO2 0.53</button>

              <button className="px-3 py-1.5 rounded-lg border" onClick={async()=>{
                await fetch(`/config/solar?userId=${userId}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ scheme:"NET_ACCOUNTING", exportPriceLKR:37 })});
              }}>Set Solar (Net Accounting)</button>
            </div>
          </Section>
        </div>
      </main>

      {error && (<div className="fixed bottom-4 right-4 bg-rose-50 text-rose-700 border border-rose-200 px-3 py-2 rounded-lg shadow">{error}</div>)}

      <footer className="max-w-6xl mx-auto p-4 text-xs text-slate-500"><div className="flex items-center gap-2"><Info className="w-4 h-4" /><span>Demo UI. GraphQL and services optional; falls back to mock data if offline.</span></div></footer>
  </div>
  {showCoach && (
    <CoachWizard userId={userId} onClose={()=>setShowCoach(false)} onComplete={()=>setShowCoach(false)} />
  )}
  </ErrorBoundary>
  );
}

export default function LankaWattWiseApp() {
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
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Lanka Watt Wise</h1>
            <p className="text-slate-600 dark:text-slate-400">Smart Energy Management System</p>
          </div>

          {showSignup ? (
            <div>
              <Signup 
                onSignup={(u) => login(u)}
                onSwitchToLogin={() => setShowSignup(false)}
              />
              <div className="text-center mt-4">
                <button 
                  onClick={() => setShowSignup(false)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          ) : (
            <div>
              <Login 
                onLogin={(u) => login(u)}
                onSwitchToSignup={() => setShowSignup(true)}
              />
              <div className="text-center mt-4">
                <button 
                  onClick={() => setShowSignup(true)}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Authenticated branch: render child component that owns its hooks
  return <DashboardApp user={user} onLogout={logout} />;
}
