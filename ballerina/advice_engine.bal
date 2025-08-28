import ballerina/http;
// Uses shared domain types from model.bal in the same module (Recommendation)

configurable int port_advice = 8083;

service /advice on new http:Listener(port_advice) {
    resource function get plan(string userId, string date) returns Recommendation[]|error {
        Recommendation rec = {id: "rec-1", applianceId: "pump-1", suggestedStart: "2025-08-19T21:00:00+05:30", durationMinutes: 30, reasons: ["Off-peak window"], justifications: ["TOU:OffPeak_21_05", "Rule:MinRuntime30"], estSavingLKR: 120.0};
        return [rec];
    }

    resource function get healthz() returns string { return "ok"; }
}
