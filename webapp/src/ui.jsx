import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Plug, Info, CheckCircle2, XCircle, RefreshCcw, Calendar, Layers, Sparkles, Wifi, Activity, Sun, Moon, Loader2, Settings, Scale, Receipt } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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
const mockAppliances = [ { id: "pump", label: "Well Pump", flexible: true, icon: Plug }, { id: "washer", label: "Washing Machine", flexible: true, icon: Activity }, { id: "ac", label: "Inverter AC", flexible: true, icon: Sun }, { id: "freezer", label: "Freezer", flexible: false, icon: Moon } ];
const mockPlan = [ { id: "rec-1", applianceId: "pump", suggestedStart: `${todayISOInColombo()}T21:00:00`, durationMinutes: 30, reasons: ["Rule:MinRuntime30", "Window:OffPeak_21_00_05_30"], estSavingLKR: 58 }, { id: "rec-2", applianceId: "washer", suggestedStart: `${todayISOInColombo()}T21:30:00`, durationMinutes: 60, reasons: ["Constraint:Shiftable", "Avoid:Peak"], estSavingLKR: 112 } ];
const mockSavingsSeries = Array.from({ length: 14 }).map((_, i) => ({ day: i + 1, saved: Math.round(200 + Math.random() * 120) }));

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
    const toMin = (s) => { const [hh, mm] = s.split(":").map(Number); return hh * 60 + mm; };
    const parts = windows.map((w) => ({ ...w, start: toMin(w.startTime), end: toMin(w.endTime) }));
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

export default function LankaWattWiseApp() {
  const [userId, setUserId] = useState("demo");
  const [date, setDate] = useState(todayISOInColombo());
  const [alpha, setAlpha] = useState(1);
  const [health, setHealth] = useState(null);
  const [plan, setPlan] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [tariff, setTariff] = useState(null);
  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState({});
  const [dismissed, setDismissed] = useState({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const data = await gql(`query Q($userId:String!, $date:String!) { health currentPlan(userId:$userId, date:$date){ id applianceId suggestedStart durationMinutes reasons estSavingLKR } }`, { userId, date }).catch(() => null);
  const tRes = await fetch(`/tariff/windows?date=${date}`).catch(() => null);
  const aRes = await fetch(`/ontology/appliances?userId=${userId}`).catch(() => null);
        if (cancelled) return;
  setHealth(data?.health || "ok (mock)");
  setPlan(data?.currentPlan || mockPlan);
  const tariffJson = tRes && tRes.ok ? await tRes.json().catch(() => null) : null;
  const applJson = aRes && aRes.ok ? await aRes.json().catch(() => null) : null;
  setTariff(tariffJson || mockTariffs);
  const normAppl = normalizeAppliances(applJson);
  setAppliances(normAppl.length ? normAppl : mockAppliances);
  const bRes = await fetch(`/billing/preview?userId=${userId}&monthlyKWh=200`).catch(() => null);
  const bJson = bRes && bRes.ok ? await bRes.json().catch(() => null) : null;
  setBill(bJson);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || String(e)); setPlan(mockPlan); setTariff(mockTariffs); setAppliances(mockAppliances);
      } finally { if (!cancelled) setLoading(false); }
    }
    load(); return () => { cancelled = true; };
  }, [userId, date]);

  async function actOnRecommendation(recId, action) {
    try {
      await gql(action === "accept" ? `mutation M($recId:String!){ accept(recId:$recId) { ok } }` : `mutation M($recId:String!){ dismiss(recId:$recId) { ok } }`, { recId }).catch(() => null);
    } catch (_) {}
    if (action === "accept") setAccepted((m) => ({ ...m, [recId]: true }));
    if (action === "dismiss") setDismissed((m) => ({ ...m, [recId]: true }));
  }
  const totalSaving = React.useMemo(() => plan.reduce((s, r) => s + (r.estSavingLKR || 0), 0), [plan]);
  const safePlan = Array.isArray(plan) ? plan : [];
  const safeAppliances = Array.isArray(appliances) ? appliances : [];
  const planWithAppliance = safePlan.map((r) => ({ ...r, appliance: safeAppliances.find((a) => a.id === r.applianceId) }));

  return (
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
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="col-span-1 lg:col-span-1 space-y-4">
          <Section title="Today's Savings" icon={TrendingUp} right={<div className="flex items-center gap-2 text-sm text-slate-500"><Wifi className={`w-4 h-4 ${health ? "text-emerald-500" : "text-slate-400"}`} /><span>{health ? "Connected" : "Offline"}</span></div>}>
            <div className="flex items-end gap-4"><div><div className="text-3xl font-extrabold">{fmtMoneyLKR(totalSaving)}</div><div className="text-sm text-slate-500">Potential saving for {date}</div></div></div>
            <div className="mt-3"><SavingsChart data={mockSavingsSeries} /></div>
          </Section>
          <Section title="Tariff Windows (Asia/Colombo)" icon={Info}>{tariff ? <TariffBar windows={normalizeWindows(tariff)} /> : <div className="text-slate-500">Loading...</div>}</Section>
          <Section title="Bill Preview" icon={Receipt}>
            {bill ? (
              <div className="text-sm text-slate-600">For 200 kWh: <b>{fmtMoneyLKR(Math.round((bill.estimatedCostLKR || 0)))}</b> <span className="text-slate-500">{bill.note || ""}</span></div>
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
            {loading && (<div className="flex items-center gap-3 text-slate-500"><Loader2 className="w-4 h-4 animate-spin"/> Loading plan...</div>)}
            {!loading && (
              <div className="space-y-3">
                <AnimatePresence>
                  {planWithAppliance.map((rec) => (
                    <motion.div key={rec.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`p-4 rounded-xl border ${accepted[rec.id] ? "border-emerald-300 bg-emerald-50" : dismissed[rec.id] ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white/80"}`}>
                      <div className="flex items-start gap-3">
                        {rec.appliance?.icon ? (<rec.appliance.icon className="w-5 h-5 mt-0.5 text-slate-600" />) : (<Plug className="w-5 h-5 mt-0.5 text-slate-600" />)}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold">{rec.appliance?.label || rec.applianceId}</div>
                            <Pill className="bg-emerald-100 text-emerald-700">{new Date(rec.suggestedStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Pill>
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
  );
}
