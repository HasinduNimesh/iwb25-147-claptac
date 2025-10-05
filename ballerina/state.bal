import ballerina/io;

public type TariffType "TOU"|"BLOCK";
public type Utility "CEB"|"LECO";

public type TOUWindow record {
    string name;
    string startTime; // HH:mm
    string endTime;   // HH:mm
    decimal rateLKR;
};

public type BlockBand record {
    int uptoKWh;
    decimal rateLKR;
};

public type TariffConfig record {
    Utility utility;
    TariffType tariffType;
    TOUWindow[]? windows?;
    BlockBand[]? blocks?;
};

public type ApplianceCfg record {
    string id;
    string name;
    decimal ratedPowerW;
    int cycleMinutes;
    string latestFinish; // HH:mm
    boolean noiseCurfew;
};

public type CO2Config record {
    decimal defaultKgPerKWh; // e.g., 0.53
    decimal[]? profile?;      // optional time-series
};

public type SolarScheme "NET_METERING"|"NET_ACCOUNTING"|"NET_PLUS";
public type SolarConfig record {
    SolarScheme scheme;
    decimal exportPriceLKR?;
};

// Persistent state backed by JSON files (persistence.bal)
// Import persistence functions

// Extended app state for richer model (in-memory caching)
final map<TariffPlan> _plans = {};
final map<Device[]> _devices = {};
final map<CO2Model> _co2Model = {};

// Tariff config with persistence
public function setTariff(string userId, TariffConfig cfg) { 
    error? result = saveTariffConfig(userId, cfg);
    if result is error {
        io:println("Error saving tariff config: ", result.message());
    }
}
public function getTariff(string userId) returns TariffConfig? { 
    TariffConfig|error? result = loadTariffConfig(userId);
    return result is TariffConfig ? result : ();
}

// Appliances with persistence
public function setAppliances(string userId, ApplianceCfg[] cfg) { 
    error? result = saveAppliancesConfig(userId, cfg);
    if result is error {
        io:println("Error saving appliances config: ", result.message());
    }
}
public function getUserAppliances(string userId) returns ApplianceCfg[] { 
    ApplianceCfg[]|error result = loadAppliancesConfig(userId);
    return result is ApplianceCfg[] ? result : [];
}

// CO2 config with persistence
public function setCO2(string userId, CO2Config cfg) { 
    error? result = saveCO2Config(userId, cfg);
    if result is error {
        io:println("Error saving CO2 config: ", result.message());
    }
}
public function getCO2(string userId) returns CO2Config? { 
    CO2Config|error? result = loadCO2Config(userId);
    return result is CO2Config ? result : ();
}

// Solar config with persistence
public function setSolar(string userId, SolarConfig cfg) { 
    error? result = saveSolarConfig(userId, cfg);
    if result is error {
        io:println("Error saving solar config: ", result.message());
    }
}
public function getSolar(string userId) returns SolarConfig? { 
    SolarConfig|error? result = loadSolarConfig(userId);
    return result is SolarConfig ? result : ();
}

// Tasks with persistence
public function setTasks(string userId, Task[] t) { 
    error? result = saveTasks(userId, t);
    if result is error {
        io:println("Error saving tasks: ", result.message());
    }
}
public function getTasks(string userId) returns Task[] { 
    Task[]|error result = loadTasks(userId);
    return result is Task[] ? result : [];
}

// Extended setters/getters (in-memory for now)
public function setPlan(string userId, TariffPlan p) { _plans[userId] = p; }
public function getPlan(string userId) returns TariffPlan? { return _plans[userId]; }

public function setDevices(string userId, Device[] d) { _devices[userId] = d; }
public function getDevices(string userId) returns Device[] { return _devices[userId] ?: []; }

public function setCO2Model(string userId, CO2Model m) { _co2Model[userId] = m; }
public function getCO2Model(string userId) returns CO2Model { return _co2Model[userId] ?: { modelType: "CONSTANT", value: 0.73 }; }
