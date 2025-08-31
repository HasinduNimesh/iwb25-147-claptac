import React, { useEffect, useMemo, useState } from 'react';
import defaultTariff from './defaultTariff.json';

function StepHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="text-slate-600 text-sm">{subtitle}</p>}
    </div>
  );
}

function Nav({ step, setStep, maxStep, onClose }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button
        className="px-3 py-1.5 rounded border text-sm"
        onClick={() => (step > 1 ? setStep(step - 1) : onClose?.())}
      >
        {step > 1 ? 'Back' : 'Close'}
      </button>
      <div className="text-xs text-slate-500">Step {step} / {maxStep}</div>
    </div>
  );
}

export default function CoachWizard({ userId, onComplete, onClose }) {
  const MAX = 4;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  // State for steps
  const [tariffType, setTariffType] = useState('TOU');
  // Prefill defaults from bundled national tariff sheet
  const domestic = defaultTariff?.Domestic || {};
  const blockT = domestic.BlockTariff || {};
  const touT = domestic.TimeOfUse || {};
  const defaultBlockRates = {
    r0_30: String(blockT['0-30']?.energyCharge_LKR_per_kWh ?? ''),
    r31_60: String(blockT['31-60']?.energyCharge_LKR_per_kWh ?? ''),
    r61_90: String(blockT['61-90']?.energyCharge_LKR_per_kWh ?? ''),
    r91_120: String(blockT['91-120']?.energyCharge_LKR_per_kWh ?? ''),
    r121_180: String(blockT['121-180']?.energyCharge_LKR_per_kWh ?? ''),
    r180p: String(blockT['Above180']?.energyCharge_LKR_per_kWh ?? ''),
    fixed: '', // will derive from usedUnits when user enters consumption
    startDate: '',
    usedUnits: ''
  };
  const defaultTouRates = {
    offpeak: String(touT.OffPeak?.energyCharge_LKR_per_kWh ?? ''),
    day: String(touT.Day?.energyCharge_LKR_per_kWh ?? ''),
    peak: String(touT.Peak?.energyCharge_LKR_per_kWh ?? ''),
    fixed: String(touT.fixedCharge_LKR_per_month ?? '')
  };
  const [blockRates, setBlockRates] = useState(defaultBlockRates);
  const [touRates, setTouRates] = useState(defaultTouRates);
  const [appliances, setAppliances] = useState([{ name: 'Washing Machine', watts: 500, minutes: 60, earliest: '06:00', latest: '22:00', perWeek: 3 }]);
  const [co2Mode, setCo2Mode] = useState('default'); // default | constant | profile
  const [co2Constant, setCo2Constant] = useState('0.53');
  const [co2Profile, setCo2Profile] = useState(''); // 48 comma-separated values
  const [solar, setSolar] = useState({ has: false, scheme: 'NET_ACCOUNTING', exportRate: '', profile: '' });

  function saveLocalConfig() {
    const cfg = { tariffType, blockRates, touRates, appliances, co2Mode, co2Constant, co2Profile, solar };
    localStorage.setItem('coachConfig', JSON.stringify(cfg));
  }

  // Prefill from server (or localStorage fallback) on open
  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      try {
        setError('');
        // Tariff
        const tRes = await fetch(`/config/tariff?userId=${encodeURIComponent(userId)}`).catch(() => null);
        if (tRes?.ok) {
          const t = await tRes.json().catch(() => null);
          if (t?.tariffType === 'TOU' && Array.isArray(t?.windows)) {
            setTariffType('TOU');
            const off = t.windows.find(w => (w.name||'').toLowerCase().includes('off'));
            const day = t.windows.find(w => (w.name||'').toLowerCase().includes('day'));
            const peak = t.windows.find(w => (w.name||'').toLowerCase().includes('peak'));
            setTouRates({
              offpeak: String(off?.rateLKR ?? touRates.offpeak),
              day: String(day?.rateLKR ?? touRates.day),
              peak: String(peak?.rateLKR ?? touRates.peak),
              fixed: String((t?.fixedLKR ?? touRates.fixed) || '0')
            });
          } else if (t?.tariffType === 'BLOCK' && Array.isArray(t?.blocks)) {
            setTariffType('BLOCK');
            const getRate = (upto) => String((t.blocks.find(b => b.uptoKWh === upto)?.rateLKR) ?? '');
            setBlockRates({
              ...blockRates,
              r0_30: getRate(30), r31_60: getRate(60), r61_90: getRate(90), r91_120: getRate(120), r121_180: getRate(180), r180p: getRate(999999),
              fixed: String((t?.fixedLKR ?? blockRates.fixed) || ''),
            });
          }
        }
        // Appliances
        const aRes = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`).catch(() => null);
        if (aRes?.ok) {
          const arr = await aRes.json().catch(() => []);
          if (Array.isArray(arr) && arr.length) {
            setAppliances(arr.map(x => ({
              name: x.name || x.id,
              watts: Number(x.ratedPowerW ?? 0),
              minutes: Number(x.cycleMinutes ?? 60),
              earliest: '06:00',
              latest: x.latestFinish || '22:00',
              perWeek: 1,
            })));
          }
        }
        // CO2
        const cRes = await fetch(`/config/co2?userId=${encodeURIComponent(userId)}`).catch(() => null);
        if (cRes?.ok) {
          const c = await cRes.json().catch(() => null);
          if (c?.profile && Array.isArray(c.profile) && c.profile.length) {
            setCo2Mode('profile');
            setCo2Profile(c.profile.join(', '));
          } else if (typeof c?.defaultKgPerKWh === 'number') {
            setCo2Mode('constant');
            setCo2Constant(String(c.defaultKgPerKWh));
          }
        }
        // Solar
        const sRes = await fetch(`/config/solar?userId=${encodeURIComponent(userId)}`).catch(() => null);
        if (sRes?.ok) {
          const s = await sRes.json().catch(() => null);
          if (s && (s.scheme || s.exportPriceLKR)) {
            setSolar({ has: true, scheme: s.scheme || 'NET_ACCOUNTING', exportRate: String(s.exportPriceLKR ?? ''), profile: '' });
          }
        }
        // Fallback from localStorage if nothing came back
        if (!tRes?.ok && !aRes?.ok && !cRes?.ok && !sRes?.ok) {
          const raw = localStorage.getItem('coachConfig');
          if (raw) {
            try {
              const cfg = JSON.parse(raw);
              if (cfg?.tariffType) setTariffType(cfg.tariffType);
              if (cfg?.touRates) setTouRates(cfg.touRates);
              if (cfg?.blockRates) setBlockRates(cfg.blockRates);
              if (Array.isArray(cfg?.appliances)) setAppliances(cfg.appliances);
              if (cfg?.co2Mode) setCo2Mode(cfg.co2Mode);
              if (cfg?.co2Constant) setCo2Constant(cfg.co2Constant);
              if (cfg?.co2Profile) setCo2Profile(cfg.co2Profile);
              if (cfg?.solar) setSolar(cfg.solar);
            } catch {}
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      } finally { if (!cancelled) setLoaded(true); }
    }
    loadExisting();
    return () => { cancelled = true; };
  }, [userId]);

  async function postTariff() {
    setSaving(true); setError('');
    try {
      if (tariffType === 'TOU') {
        const body = {
          utility: 'CEB', tariffType: 'TOU', windows: [
            { name: 'Off-Peak', startTime: '22:30', endTime: '05:30', rateLKR: Number(touRates.offpeak || 0) },
            { name: 'Day',      startTime: '05:30', endTime: '18:30', rateLKR: Number(touRates.day || 0) },
            { name: 'Peak',     startTime: '18:30', endTime: '22:30', rateLKR: Number(touRates.peak || 0) }
          ], fixedLKR: Number(touRates.fixed || 0) };
  const res = await fetch(`/config/tariff?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save tariff');
      } else {
        const body = {
          utility: 'CEB', tariffType: 'BLOCK', fixedLKR: Number(blockRates.fixed || 0), billingCycleStart: blockRates.startDate || null, usedUnits: Number(blockRates.usedUnits || 0),
          // Backend expects blocks: [{ uptoKWh, rateLKR }]; it will infer spans.
          blocks: [
            { uptoKWh: 30,  rateLKR: Number(blockRates.r0_30   || 0) },
            { uptoKWh: 60,  rateLKR: Number(blockRates.r31_60  || 0) },
            { uptoKWh: 90,  rateLKR: Number(blockRates.r61_90  || 0) },
            { uptoKWh: 120, rateLKR: Number(blockRates.r91_120 || 0) },
            { uptoKWh: 180, rateLKR: Number(blockRates.r121_180|| 0) },
            { uptoKWh: 999999, rateLKR: Number(blockRates.r180p || 0) }
          ]
        };
  const res = await fetch(`/config/tariff?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save tariff');
      }
      saveLocalConfig();
      setStep(2);
    } catch (e) {
      setError(e.message || String(e));
    } finally { setSaving(false); }
  }

  async function postAppliances() {
    setSaving(true); setError('');
    try {
      const items = appliances.map(a => ({ id: a.name.toLowerCase().replace(/\s+/g, ''), name: a.name, ratedPowerW: Number(a.watts||0), cycleMinutes: Number(a.minutes||0), earliestStart: a.earliest, latestFinish: a.latest, runsPerWeek: Number(a.perWeek||0) }));
  const res = await fetch(`/config/appliances?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save appliances');
      saveLocalConfig();
      setStep(3);
    } catch (e) { setError(e.message || String(e)); } finally { setSaving(false); }
  }

  async function postCo2() {
    setSaving(true); setError('');
    try {
      if (co2Mode === 'default') {
  const res = await fetch(`/config/co2?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultKgPerKWh: 0.53 }) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save CO2');
      } else if (co2Mode === 'constant') {
  const res = await fetch(`/config/co2?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultKgPerKWh: Number(co2Constant || 0.53) }) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save CO2');
      } else {
    const values = (co2Profile || '').split(/[\s,]+/).map(Number).filter(v => Number.isFinite(v));
    const res = await fetch(`/config/co2model?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelType: 'PROFILE_48', profile: values }) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save CO2 model');
      }
      saveLocalConfig();
      setStep(4);
    } catch (e) { setError(e.message || String(e)); } finally { setSaving(false); }
  }

  async function postSolar() {
    setSaving(true); setError('');
    try {
      if (solar.has) {
  const res = await fetch(`/config/solar?userId=${encodeURIComponent(userId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheme: solar.scheme, exportPriceLKR: Number(solar.exportRate||0), dailyProfile: (solar.profile||'').split(/[\s,]+/).map(Number).filter(Number.isFinite) }) });
  const j = res && await res.json().catch(()=>({ ok:false }));
  if (!res.ok || !j?.ok) throw new Error('Failed to save solar');
      }
      saveLocalConfig();
      localStorage.setItem('coachSetupDone', 'true');
      onComplete?.();
    } catch (e) { setError(e.message || String(e)); } finally { setSaving(false); }
  }

  // UI
  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
        {!loaded && (<div className="mb-3 text-sm text-slate-500">Loading your saved settings…</div>)}
        {step === 1 && (
          <div>
            <StepHeader title="Tariff Setup" subtitle="Tell us how your electricity is billed" />
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Tariff Type</label>
              <select className="border rounded px-2 py-1" value={tariffType} onChange={(e)=>setTariffType(e.target.value)}>
                <option value="BLOCK">Block (Domestic Type 1)</option>
                <option value="TOU">Time-of-Use (Domestic Type 2)</option>
              </select>
            </div>
            {tariffType === 'BLOCK' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm">Billing cycle start date</label><input type="date" className="w-full border rounded px-2 py-1" value={blockRates.startDate} onChange={e=>setBlockRates({...blockRates, startDate:e.target.value})}/></div>
                <div><label className="text-sm">Used units this month</label><input type="number" className="w-full border rounded px-2 py-1" value={blockRates.usedUnits} onChange={e=>{
                  const used = e.target.value;
                  // derive fixed charge from national tariff table
                  const u = Number(used);
                  let fixed = '';
                  if (Number.isFinite(u)) {
                    if (u <= 30) fixed = String(blockT['0-30']?.fixedCharge_LKR_per_month ?? '');
                    else if (u <= 60) fixed = String(blockT['31-60']?.fixedCharge_LKR_per_month ?? '');
                    else if (u <= 90) fixed = String(blockT['61-90']?.fixedCharge_LKR_per_month ?? '');
                    else if (u <= 120) fixed = String(blockT['91-120']?.fixedCharge_LKR_per_month ?? '');
                    else if (u <= 180) fixed = String(blockT['121-180']?.fixedCharge_LKR_per_month ?? '');
                    else fixed = String(blockT['Above180']?.fixedCharge_LKR_per_month ?? '');
                  }
                  setBlockRates({...blockRates, usedUnits: used, fixed});
                }}/></div>
                <div><label className="text-sm">0–30 Rs/kWh</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r0_30} /></div>
                <div><label className="text-sm">31–60</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r31_60} /></div>
                <div><label className="text-sm">61–90</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r61_90} /></div>
                <div><label className="text-sm">91–120</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r91_120} /></div>
                <div><label className="text-sm">121–180</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r121_180} /></div>
                <div><label className="text-sm">180+</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.r180p} /></div>
                <div className="sm:col-span-2"><label className="text-sm">Fixed charge (auto) Rs</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={blockRates.fixed} /></div>
                <div className="sm:col-span-2 text-xs text-slate-500">Current national rates are pre-filled and locked. Enter only your billing start date and units used so far.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm">Off-peak (22:30–05:30) Rs/kWh</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={touRates.offpeak} /></div>
                <div><label className="text-sm">Day (05:30–18:30)</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={touRates.day} /></div>
                <div><label className="text-sm">Peak (18:30–22:30)</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={touRates.peak} /></div>
                <div className="sm:col-span-2"><label className="text-sm">Fixed charge (Rs)</label><input disabled type="number" className="w-full border rounded px-2 py-1 bg-slate-50" value={touRates.fixed} /></div>
                <div className="sm:col-span-2 text-xs text-slate-500">Time-of-use rates are loaded from the current national tariff and cannot be edited.</div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button disabled={saving} onClick={postTariff} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Save & Continue</button>
            </div>
            <Nav step={step} setStep={setStep} maxStep={MAX} onClose={onClose} />
          </div>
        )}

        {step === 2 && (
          <div>
            <StepHeader title="Appliances & Tasks" subtitle="Tell us what you want to track" />
            <div className="space-y-3 max-h-72 overflow-auto pr-1">
              {appliances.map((a, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-6 gap-2 border rounded p-2">
                  <input className="border rounded px-2 py-1 sm:col-span-2" placeholder="Name" value={a.name} onChange={e=>{ const v=[...appliances]; v[i]={...a,name:e.target.value}; setAppliances(v); }} />
                  <input className="border rounded px-2 py-1" type="number" placeholder="Watts" value={a.watts} onChange={e=>{ const v=[...appliances]; v[i]={...a,watts:e.target.value}; setAppliances(v); }} />
                  <input className="border rounded px-2 py-1" type="number" placeholder="Minutes" value={a.minutes} onChange={e=>{ const v=[...appliances]; v[i]={...a,minutes:e.target.value}; setAppliances(v); }} />
                  <input className="border rounded px-2 py-1" type="time" value={a.earliest} onChange={e=>{ const v=[...appliances]; v[i]={...a,earliest:e.target.value}; setAppliances(v); }} />
                  <input className="border rounded px-2 py-1" type="time" value={a.latest} onChange={e=>{ const v=[...appliances]; v[i]={...a,latest:e.target.value}; setAppliances(v); }} />
                  <input className="border rounded px-2 py-1" type="number" placeholder="Runs/week" value={a.perWeek} onChange={e=>{ const v=[...appliances]; v[i]={...a,perWeek:e.target.value}; setAppliances(v); }} />
                  <div className="sm:col-span-6 flex justify-end"><button className="text-rose-600 text-sm" onClick={()=>{ const v=[...appliances]; v.splice(i,1); setAppliances(v); }}>Remove</button></div>
                </div>
              ))}
            </div>
            <div className="mt-2"><button className="text-sm text-blue-600" onClick={()=>setAppliances([...appliances,{ name:'New Appliance', watts: 1000, minutes: 30, earliest:'06:00', latest:'22:00', perWeek:1 }])}>+ Add appliance</button></div>
            <div className="mt-4 flex justify-end">
              <button disabled={saving} onClick={postAppliances} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Save & Continue</button>
            </div>
            <Nav step={step} setStep={setStep} maxStep={MAX} onClose={onClose} />
          </div>
        )}

        {step === 3 && (
          <div>
            <StepHeader title="CO₂ Model" subtitle="Pick a model for greener scheduling" />
            <div className="space-y-2">
              <label className="flex items-center gap-2"><input type="radio" checked={co2Mode==='default'} onChange={()=>setCo2Mode('default')} /> <span>Use default 0.53 kg/kWh</span></label>
              <label className="flex items-center gap-2"><input type="radio" checked={co2Mode==='constant'} onChange={()=>setCo2Mode('constant')} /> <span>Use my constant factor</span></label>
              {co2Mode==='constant' && (
                <input className="border rounded px-2 py-1" type="number" step="0.01" value={co2Constant} onChange={e=>setCo2Constant(e.target.value)} />
              )}
              <label className="flex items-center gap-2"><input type="radio" checked={co2Mode==='profile'} onChange={()=>setCo2Mode('profile')} /> <span>Upload a 48-slot daily profile</span></label>
              {co2Mode==='profile' && (
                <textarea className="w-full border rounded p-2" rows={4} placeholder="48 numbers separated by commas or spaces" value={co2Profile} onChange={e=>setCo2Profile(e.target.value)} />
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={saving} onClick={postCo2} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Save & Continue</button>
            </div>
            <Nav step={step} setStep={setStep} maxStep={MAX} onClose={onClose} />
          </div>
        )}

        {step === 4 && (
          <div>
            <StepHeader title="Rooftop Solar (optional)" subtitle="Tell us about your solar setup" />
            <label className="flex items-center gap-2 mb-2"><input type="checkbox" checked={solar.has} onChange={e=>setSolar({...solar, has:e.target.checked})}/> <span>I have rooftop solar</span></label>
            {solar.has && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">Scheme</label>
                  <select className="w-full border rounded px-2 py-1" value={solar.scheme} onChange={e=>setSolar({...solar, scheme:e.target.value})}>
                    <option value="NET_METERING">Net Metering</option>
                    <option value="NET_ACCOUNTING">Net Accounting</option>
                    <option value="NET_PLUS">Net Plus</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm">Export rate (Rs/kWh)</label>
                  <input className="w-full border rounded px-2 py-1" type="number" value={solar.exportRate} onChange={e=>setSolar({...solar, exportRate:e.target.value})} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm">Daily generation profile (optional, comma/space separated)</label>
                  <textarea className="w-full border rounded p-2" rows={3} value={solar.profile} onChange={e=>setSolar({...solar, profile:e.target.value})} />
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button disabled={saving} onClick={postSolar} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-60">Finish</button>
            </div>
            <Nav step={step} setStep={setStep} maxStep={MAX} onClose={onClose} />
          </div>
        )}

        {error && <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</div>}
      </div>
    </div>
  );
}
