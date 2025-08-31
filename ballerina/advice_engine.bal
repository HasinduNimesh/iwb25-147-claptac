import ballerina/http;
import ballerina/log;
// Uses shared domain types from model.bal and user state helpers from state.bal in the same module

configurable int port_advice = 8083;

// Helper: pick the cheapest available window respecting curfews
function pickWindow(TOUWindow[] windows, boolean noiseCurfew, string latestFinish) returns TOUWindow|() {
    if windows.length() == 0 { return (); }
    // Sort by rate ascending
    TOUWindow[] sorted = [];
    foreach var w0 in windows { sorted.push(w0); }
    // simple selection sort to keep language features minimal
    int len = sorted.length();
    int i = 0;
    while i < len {
        int minIdx = i;
        int j = i + 1;
        while j < len {
            if sorted[j].rateLKR < sorted[minIdx].rateLKR { minIdx = j; }
            j += 1;
        }
        if minIdx != i {
            TOUWindow tmp = sorted[i];
            sorted[i] = sorted[minIdx];
            sorted[minIdx] = tmp;
        }
        i += 1;
    }
    // Very simple curfew handling: if noiseCurfew, avoid windows starting after 21:00, else allow any
    foreach var w in sorted {
        if noiseCurfew {
            if w.startTime < "21:00" { return w; }
        } else { return w; }
    }
    // fallback to first
    return sorted[0];
}

function hhmmToIso(string date, string hhmm) returns string {
    return string `${date}T${hhmm}:00`;
}

service /advice on new http:Listener(port_advice) {
    resource function get plan(string userId, string date) returns Recommendation[]|error {
        // Gather user context
        ApplianceCfg[] userAppl = getAppliances(userId);
        TariffConfig? t = getTariff(userId);
        TOUWindow[] windows = [];
        if t is TariffConfig && t.tariffType == "TOU" {
            windows = <TOUWindow[]>(t?.windows ?: []);
        }
        // If no user-specific tariff configured, create a default Sri Lanka TOU
        if windows.length() == 0 {
            windows = [
                { name: "Off-Peak", startTime: "22:30", endTime: "05:30", rateLKR: 25.0 },
                { name: "Day",      startTime: "05:30", endTime: "18:30", rateLKR: 45.0 },
                { name: "Peak",     startTime: "18:30", endTime: "22:30", rateLKR: 70.0 }
            ];
        }

        Recommendation[] recs = [];
        int idx = 1;
        foreach var a in userAppl {
            // Only make a recommendation for shiftable-like devices: assume not noiseCurfew implies shiftable
            boolean shiftable = !a.noiseCurfew;
            if !shiftable { continue; }
            TOUWindow|() w = pickWindow(windows, a.noiseCurfew, a.latestFinish);
            if w is () { continue; }
            string startIso = hhmmToIso(date, w.startTime);
            string[] reasons = [string `Window:${w.name}`, "Constraint:Shiftable"];
            string[] justifs = ["Rule:MinRuntime", string `TOU:${w.name}`];
            // Naive savings estimate: difference vs average rate multiplied by kWh for one cycle
            decimal avg = 0.0; int n = 0; foreach var ww in windows { avg += ww.rateLKR; n += 1; }
            decimal rate = n > 0 ? avg / n : 45.0;
            decimal kwh = (a.ratedPowerW / <decimal>1000.0) * (<decimal>a.cycleMinutes / <decimal>60.0);
            decimal estSaving = (rate - w.rateLKR) * kwh;
            if estSaving < <decimal>0 { estSaving = <decimal>0; }
            recs.push({ id: string `rec-${idx}`, applianceId: a.id, suggestedStart: startIso, durationMinutes: a.cycleMinutes, reasons: reasons, justifications: justifs, estSavingLKR: estSaving });
            idx += 1;
        }
        log:printDebug("Generated " + recs.length().toString() + " recs for user=" + userId);
        return recs;
    }

    resource function get healthz() returns string { return "ok"; }
}
