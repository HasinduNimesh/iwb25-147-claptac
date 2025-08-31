import ballerina/http;

// Helper to safely parse an appliance JSON map into ApplianceCfg with defaults
function parseApplianceCfg(map<json> m) returns ApplianceCfg {
    string id = "dev";
    json? jid = m["id"];
    if jid is string { id = jid; }

    string name = "Device";
    json? jname = m["name"];
    if jname is string { name = jname; }

    decimal rated = 0.0;
    json? jr = m["ratedPowerW"];
    if jr is decimal { rated = jr; } else if jr is int { rated = <decimal>jr; }

    int minutes = 0;
    json? jm = m["cycleMinutes"];
    if jm is int { minutes = jm; } else if jm is decimal { minutes = <int>jm; }

    string latest = "22:00";
    json? jl = m["latestFinish"];
    if jl is string { latest = jl; }

    boolean curfew = false;
    json? jc = m["noiseCurfew"];
    if jc is boolean { curfew = jc; } else if jc is string { curfew = jc.toLowerAscii() == "true"; }

    return { id: id, name: name, ratedPowerW: rated, cycleMinutes: minutes, latestFinish: latest, noiseCurfew: curfew };
}

public type UpsertResponse record { boolean ok; };

configurable int port_config = 8090;
service /config on new http:Listener(port_config) {
    // Read endpoints
    resource function get tariff(string userId) returns TariffConfig|error {
        TariffConfig? t = getTariff(userId);
        if t is TariffConfig { return t; }
        // Return a default TOU for Sri Lanka if not configured
        return { utility: "CEB", tariffType: "TOU", windows: [
            { name: "Off-Peak", startTime: "22:30", endTime: "05:30", rateLKR: 25.0 },
            { name: "Day",      startTime: "05:30", endTime: "18:30", rateLKR: 45.0 },
            { name: "Peak",     startTime: "18:30", endTime: "22:30", rateLKR: 70.0 }
        ] };
    }
    resource function get appliances(string userId) returns ApplianceCfg[]|error {
        return getAppliances(userId);
    }
    resource function get co2(string userId) returns CO2Config|error {
        CO2Config? c = getCO2(userId);
        if c is CO2Config { return c; }
        return { defaultKgPerKWh: 0.53 };
    }
    resource function get solar(string userId) returns SolarConfig|error {
        SolarConfig? s = getSolar(userId);
        if s is SolarConfig { return s; }
        return { scheme: "NET_ACCOUNTING", exportPriceLKR: 37.0 };
    }
    resource function post tariff(string userId, @http:Payload json body) returns UpsertResponse|error {
        // Be permissive with payloads; coerce json -> TariffConfig when possible
        TariffConfig cfg;
        if body is map<json> {
            // Minimal coercion for TOU
            string utility = <string>(body["utility"] ?: "CEB");
            string tariffType = <string>(body["tariffType"] ?: "TOU");
            if tariffType == "TOU" {
                json ws = body["windows"] ?: [];
                TOUWindow[] windows = [];
                if ws is json[] {
                    foreach json w in ws { map<json> m = <map<json>>w; windows.push({
                        name: <string>(m.get("name") ?: "Window"),
                        startTime: <string>(m.get("startTime") ?: "00:00"),
                        endTime: <string>(m.get("endTime") ?: "23:59"),
                        rateLKR: <decimal>(m.get("rateLKR") ?: 0.0)
                    }); }
                }
                cfg = { utility: <Utility>utility, tariffType: <TariffType>tariffType, windows: windows };
            } else {
                json bs = body["blocks"] ?: [];
                BlockBand[] blocks = [];
                if bs is json[] {
                    foreach json b in bs { map<json> m = <map<json>>b; blocks.push({
                        uptoKWh: <int>(m.get("uptoKWh") ?: 0),
                        rateLKR: <decimal>(m.get("rateLKR") ?: 0.0)
                    }); }
                }
                cfg = { utility: <Utility>utility, tariffType: <TariffType>tariffType, blocks: blocks };
            }
        } else {
            return { ok: false };
        }
        setTariff(userId, cfg);
        return { ok: true };
    }
    resource function post appliances(string userId, @http:Payload json body) returns UpsertResponse|error {
        ApplianceCfg[] cfg = [];
        if body is json[] {
            foreach json j in body {
                if j is map<json> { cfg.push(parseApplianceCfg(j)); }
            }
        } else if body is map<json> {
            json items = body["items"] ?: [];
            if items is json[] {
                foreach json j in items { if j is map<json> { cfg.push(parseApplianceCfg(j)); } }
            } else {
                // Single object case
                cfg.push(parseApplianceCfg(body));
            }
        } else {
            // Unsupported payload; do not change state
            return { ok: false };
        }
        setAppliances(userId, cfg);
        return { ok: true };
    }
    resource function post co2(string userId, @http:Payload json body) returns UpsertResponse|error {
        CO2Config cfg;
        if body is map<json> {
            decimal[]? prof = ();
            json p = body["profile"] ?: ();
            if p is json[] {
                decimal[] arr = [];
                foreach json v in p { if v is decimal|int { arr.push(<decimal>v); } }
                prof = arr;
            }
            cfg = { defaultKgPerKWh: <decimal>(body["defaultKgPerKWh"] ?: 0.5), profile: prof };
        } else { return { ok: false }; }
        setCO2(userId, cfg);
        return { ok: true };
    }
    resource function post solar(string userId, @http:Payload json body) returns UpsertResponse|error {
        SolarConfig cfg;
        if body is map<json> {
            cfg = { scheme: <SolarScheme>(body["scheme"] ?: "NET_METERING"), exportPriceLKR: <decimal?>(body["exportPriceLKR"] ?: ()) };
        } else { return { ok: false }; }
        setSolar(userId, cfg);
        return { ok: true };
    }

    // GraphQL-aligned configuration endpoints
    resource function post plan(string userId, @http:Payload TariffPlan plan) returns UpsertResponse|error {
        setPlan(userId, plan);
        return { ok: true };
    }
    resource function post devices(string userId, @http:Payload Device[] devs) returns UpsertResponse|error {
        setDevices(userId, devs);
        return { ok: true };
    }
    resource function post tasks(string userId, @http:Payload Task[] tasks) returns UpsertResponse|error {
        setTasks(userId, tasks);
        return { ok: true };
    }
    resource function post co2model(string userId, @http:Payload CO2Model m) returns UpsertResponse|error {
        setCO2Model(userId, m);
        return { ok: true };
    }
}
