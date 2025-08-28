import ballerina/http;

public type Recommendation record {
    string id;
    string applianceId;
    string suggestedStart;
    int durationMinutes;
    string[] reasons;
    decimal estSavingLKR;
};

service /advice on new http:Listener(8083) {
    resource function get plan(string userId, string date) returns Recommendation[]|error {
        // Simple deterministic mock returning a pump schedule after 9pm
        Recommendation rec = {id: "rec-1", applianceId: "pump-1", suggestedStart: "2025-08-19T21:00:00+05:30", durationMinutes: 30, reasons: ["Off-peak window"], estSavingLKR: 120.0};
        return [rec];
    }
}

// This module is intentionally left empty. The root module defines the runnable services.
