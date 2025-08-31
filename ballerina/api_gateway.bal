import ballerina/graphql;
import ballerina/log;
import ballerina/http;
// clients.bal and model.bal are in same package; symbols available directly

// Import shared types from model.bal
// Recommendation, Savings, Explanation

configurable int port_graphql = 9090;
configurable int port_health = 9091;

service /graphql on new graphql:Listener(port_graphql) {
    resource function get health() returns string {
        return "ok";
    }

    resource function get currentPlan(string userId, string date) returns Recommendation[]|error {
        log:printDebug("currentPlan called: userId=" + userId + ", date=" + date);
    http:Response resp = check adviceClient->get("/advice/plan?userId=" + userId + "&date=" + date);
    json j = check resp.getJsonPayload();
    Recommendations recs = check j.cloneWithType(Recommendations);
    return recs;
    }

    resource function get tariffPlan(string userId) returns TariffPlan|error {
        TariffPlan? p = getPlan(userId);
        if p is TariffPlan { return p; }
        // Default Sri Lanka TOU bands
        TOUPlan tou = { bands: [
            { label: "Off-peak", startTime: "22:30", endTime: "05:30", rate: 25.0 },
            { label: "Day", startTime: "05:30", endTime: "18:30", rate: 45.0 },
            { label: "Peak", startTime: "18:30", endTime: "22:30", rate: 70.0 }
        ], fixed: 0.0 };
        TariffPlan def = { id: "default", planType: "TOU", effectiveDate: "2025-06-01", tou: tou };
        return def;
    }

    resource function get appliances(string userId) returns Device[]|error {
        return getDevices(userId);
    }

    resource function get tasks(string userId, string dayISO) returns Task[]|error {
        return getTasks(userId);
    }

    resource function get suggestions(string userId, string dayISO, decimal alpha = 0.5) returns Recommendation[]|error {
        // Call scheduler HTTP endpoint for now
        http:Client sched = checkpanic new ("http://localhost:8092");
        http:Response r = check sched->post("/scheduler/optimize", { userId: userId, date: dayISO, alpha: alpha });
        json j = check r.getJsonPayload();
        if j is map<json> { json p = j["plan"] ?: []; return check p.cloneWithType(Recommendations); }
        return [];
    }

    resource function get monthlyProjection(string userId, decimal eomKWh = 150) returns MonthlyProjection|error {
        http:Client bill = checkpanic new ("http://localhost:8091");
        http:Response r = check bill->get(string `/billing/projection?userId=${userId}&eomKWh=${eomKWh}`);
        json j = check r.getJsonPayload();
        return check j.cloneWithType(MonthlyProjection);
    }

    resource function subscribe adviceUpdated(string userId) returns stream<Recommendation,error?> {
        stream<Recommendation,error?> s = new;
        return s;
    }

    resource function get savingsEstimate(string userId, string date) returns Savings|error {
        // basic proxy to billing for monthly projection and estimate a daily value (roughly month/30)
        http:Client bill = checkpanic new ("http://localhost:8091");
        http:Response r = check bill->get(string `/billing/projection?userId=${userId}&eomKWh=150`);
        json j = check r.getJsonPayload();
        MonthlyProjection mp = check j.cloneWithType(MonthlyProjection);
        decimal monthLKR = mp.totalCostRs;
        decimal todayLKR = monthLKR / <decimal>30.0;
        return { todayLKR, monthLKR };
    }

    resource function get explain(string recId) returns Explanation[]|error {
        return [ { ruleId: "Rule:MinRuntime30", detail: "Daily minimum runtime 30 minutes" }, { ruleId: "TOU:OffPeak_21_05", detail: "Shifted to off-peak window 21:00-05:00" } ];
    }

}

// Separate health endpoint for tooling
service / on new http:Listener(port_health) {
    resource function get healthz() returns string { return "ok"; }
}
