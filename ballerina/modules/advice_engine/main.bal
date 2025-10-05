// Library-only module. The runnable advice service is defined in the root package
// (see ../../advice_engine.bal). Keeping this module free of listeners avoids port
// conflicts when running the root package.

public type Recommendation record {
    string id;
    string applianceId;
    string suggestedStart;
    int durationMinutes;
    string[] reasons;
    decimal estSavingLKR;
};

public function mockRecommendation(string userId, string date) returns Recommendation[] {
    Recommendation rec = {id: "rec-1", applianceId: "pump-1", suggestedStart: "2025-08-19T21:00:00+05:30", durationMinutes: 30, reasons: ["Off-peak window"], estSavingLKR: 120.0};
    return [rec];
}

// No services are started from this submodule.
