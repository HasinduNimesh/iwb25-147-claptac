// Core domain types (names chosen to avoid reserved identifiers)

public type TOUBand record { string label; string startTime; string endTime; decimal rate; };
public type TOUPlan record { TOUBand[] bands; decimal fixed; };

public type BlockRate record { int fromKWh; int? toKWh; decimal rate; decimal fixedIfFinalSlab; };
public type BlockPlan record { int[] thresholds; BlockRate[] rates; };

public type TariffPlan record {
    string id;
    string planType; // "BLOCK" | "TOU"
    string effectiveDate?;
    TOUPlan? tou?;
    BlockPlan? block?;
};

public type Device record { string id; string name; int watts; int defaultDurationMin; };

public type Task record { string id; string applianceId; int durationMin; string earliest; string latest; int repeatsPerWeek; };

public type CO2ModelType "CONSTANT"|"PROFILE_48";
public type CO2Model record { CO2ModelType modelType; decimal value?; decimal[48]? profile?; };

public type Recommendation record {
    string id;
    string taskId?;
    string applianceId;
    string suggestedStart;
    int durationMinutes;
    string[] reasons;           // short human reasons
    string[] justifications;    // rule ids / query ids
    decimal estSavingLKR;
    decimal costRs?;
    decimal co2Kg?;
};

public type Recommendations Recommendation[];

public type RecommendationVariants record {
    Recommendations cheapest;
    Recommendations greenest;
    Recommendations balanced;
};

public type Savings record { decimal todayLKR; decimal monthLKR; };

public type Explanation record { string ruleId; string detail; };

public type MonthlyProjection record { decimal totalKWh; decimal totalCostRs; decimal totalCO2Kg; decimal treesRequired; };
