import ballerina/http;
import ballerina/lang.value as value;

// Internal candidate type for evaluating options per TOU band
type Cand record {|
    string band;
    decimal rate;
    string beginTime;
    decimal cost;
    decimal co2;
    string why;
|};

// Helper: compute energy for a task in kWh
function taskKWh(int watts, int durationMin) returns decimal {
    return (<decimal>watts / 1000.0) * (<decimal>durationMin / 60.0);
}

// Default Sri Lanka TOU plan used as fallback
function defaultTOUPlan() returns TOUPlan {
    return {
        bands: [
            { label: "Off-peak", startTime: "22:30", endTime: "05:30", rate: 25.0 },
            { label: "Day",      startTime: "05:30", endTime: "18:30", rate: 45.0 },
            { label: "Peak",     startTime: "18:30", endTime: "22:30", rate: 70.0 }
        ],
        fixed: 0.0
    };
}

// Choose a representative start time per band on the given date (local +05:30)
function startForBand(string dateISO, string label) returns string {
    if label == "Off-peak" { return dateISO + "T23:00:00+05:30"; }
    if label == "Day" { return dateISO + "T10:00:00+05:30"; }
    return dateISO + "T19:00:00+05:30";
}

// Normalize v in [vmin, vmax] -> [0,1]
function norm(decimal v, decimal vmin, decimal vmax) returns decimal {
    return vmax == vmin ? <decimal>0 : (v - vmin) / (vmax - vmin);
}

// Pick the effective TOU plan (user plan if present, otherwise default)
function getTOU(TariffPlan? p) returns TOUPlan {
    TOUPlan? maybeTou = p?.tou;
    if maybeTou is TOUPlan { return maybeTou; }
    return defaultTOUPlan();
}

public type OptimizeRequest record {
    string userId;
    string date; // YYYY-MM-DD
    decimal alpha = 1.0; // 1.0 money-only, 0.0 CO2-only
};

public type OptimizeResult record {
    Recommendations plan;
    Recommendations cheapest;
    Recommendations greenest;
    Recommendations balanced;
};

configurable int port_scheduler = 8092;
service /scheduler on new http:Listener(port_scheduler) {
    resource function post optimize(@http:Payload OptimizeRequest req) returns OptimizeResult|error {
        // Get plan, tasks, devices, tariff, and co2 model
    TariffPlan? plan = getPlan(req.userId);
        Task[] tasks = getTasks(req.userId);
        Device[] devices = getDevices(req.userId);
        CO2Model cm = getCO2Model(req.userId);
        decimal ef = cm.modelType == "CONSTANT" ? (cm.value ?: 0.53) : 0.53;

        // If no tasks configured, fallback to advice service's single plan
        if tasks.length() == 0 {
            http:Client advice = checkpanic new ("http://localhost:8083");
            http:Response r = check advice->get(string `/advice/plan?userId=${req.userId}&date=${req.date}`);
            json j = check r.getJsonPayload();
            Recommendations recs = [];
            var conv = value:fromJsonWithType(j, Recommendations);
            if conv is Recommendations { recs = conv; }
            return { plan: recs, balanced: recs, cheapest: recs, greenest: recs };
        }

    // Build band map (use user's plan if available, else default)
    TOUPlan tou = getTOU(plan);

        Recommendations cheapestPlan = [];
        Recommendations greenestPlan = [];
        Recommendations balancedPlan = [];
        foreach var t in tasks {
            Device? dev = (); foreach var d in devices { if d.id == t.applianceId { dev = d; break; } }
            if dev is () { continue; }
            int watts = (<Device>dev).watts;
            decimal kwh = taskKWh(watts, t.durationMin);

            // Build candidates per band
            Cand[] cands = [];
            foreach var b in tou.bands {
                decimal cost = kwh * b.rate;
                decimal co2 = kwh * ef;
                string s = startForBand(req.date, b.label);
                string why = string `Band ${b.label}: rate Rs ${b.rate}/kWh, cost ~ Rs ${cost}, CO₂ ${co2} kg`;
                cands.push({ band: b.label, rate: b.rate, beginTime: s, cost: cost, co2: co2, why: why });
            }
            // Normalize for balanced score
            decimal maxRate = cands[0].rate; decimal minRate = cands[0].rate;
            foreach var c in cands { if c.rate > maxRate { maxRate = c.rate; } if c.rate < minRate { minRate = c.rate; } }
            decimal maxCO2 = cands[0].co2; decimal minCO2 = cands[0].co2;
            foreach var c in cands { if c.co2 > maxCO2 { maxCO2 = c.co2; } if c.co2 < minCO2 { minCO2 = c.co2; } }

            // Pick variants
            Cand cheapest = cands[0]; foreach var c in cands { if c.rate < cheapest.rate { cheapest = c; } }
            Cand greenest = cands[0]; foreach var c in cands { if c.co2 < greenest.co2 { greenest = c; } }
            Cand balanced = cands[0]; decimal bestScore = <decimal>1000000.0;
            foreach var c in cands {
                decimal s1 = norm(c.rate, minRate, maxRate);
                decimal s2 = norm(c.co2, minCO2, maxCO2);
                decimal sc = req.alpha * s1 + (1.0 - req.alpha) * s2;
                if sc < bestScore { bestScore = sc; balanced = c; }
            }

            Recommendation cheapestRec = {
                id: "rec-" + t.id + "-cheapest",
                taskId: t.id,
                applianceId: t.applianceId,
                suggestedStart: cheapest.beginTime,
                durationMinutes: t.durationMin,
                reasons: [cheapest.why],
                justifications: ["TOU", "CHEAPEST"],
                estSavingLKR: 0.0,
                costRs: cheapest.cost,
                co2Kg: cheapest.co2
            };
            Recommendation greenestRec = {
                id: "rec-" + t.id + "-greenest",
                taskId: t.id,
                applianceId: t.applianceId,
                suggestedStart: greenest.beginTime,
                durationMinutes: t.durationMin,
                reasons: [greenest.why],
                justifications: ["TOU", "GREENEST"],
                estSavingLKR: 0.0,
                costRs: greenest.cost,
                co2Kg: greenest.co2
            };
            Recommendation balancedRec = {
                id: "rec-" + t.id + "-balanced",
                taskId: t.id,
                applianceId: t.applianceId,
                suggestedStart: balanced.beginTime,
                durationMinutes: t.durationMin,
                reasons: [balanced.why],
                justifications: ["TOU", "BALANCED"],
                estSavingLKR: 0.0,
                costRs: balanced.cost,
                co2Kg: balanced.co2
            };

            cheapestPlan.push(cheapestRec);
            greenestPlan.push(greenestRec);
            balancedPlan.push(balancedRec);
        }

        return { plan: balancedPlan, balanced: balancedPlan, cheapest: cheapestPlan, greenest: greenestPlan };
    }
}
