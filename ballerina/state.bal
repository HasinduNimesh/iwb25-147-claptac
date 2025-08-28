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

final map<TariffConfig> _tariffs = {};
final map<ApplianceCfg[]> _appliances = {};
final map<CO2Config> _co2 = {};
final map<SolarConfig> _solar = {};

// Extended app state for richer model
final map<TariffPlan> _plans = {};
final map<Device[]> _devices = {};
final map<Task[]> _tasks = {};
final map<CO2Model> _co2Model = {};

public function setTariff(string userId, TariffConfig cfg) { _tariffs[userId] = cfg; }
public function getTariff(string userId) returns TariffConfig? { return _tariffs[userId]; }

public function setAppliances(string userId, ApplianceCfg[] cfg) { _appliances[userId] = cfg; }
public function getAppliances(string userId) returns ApplianceCfg[] { return _appliances[userId] ?: []; }

public function setCO2(string userId, CO2Config cfg) { _co2[userId] = cfg; }
public function getCO2(string userId) returns CO2Config? { return _co2[userId]; }

public function setSolar(string userId, SolarConfig cfg) { _solar[userId] = cfg; }
public function getSolar(string userId) returns SolarConfig? { return _solar[userId]; }

// Extended setters/getters
public function setPlan(string userId, TariffPlan p) { _plans[userId] = p; }
public function getPlan(string userId) returns TariffPlan? { return _plans[userId]; }

public function setDevices(string userId, Device[] d) { _devices[userId] = d; }
public function getDevices(string userId) returns Device[] { return _devices[userId] ?: []; }

public function setTasks(string userId, Task[] t) { _tasks[userId] = t; }
public function getTasks(string userId) returns Task[] { return _tasks[userId] ?: []; }

public function setCO2Model(string userId, CO2Model m) { _co2Model[userId] = m; }
public function getCO2Model(string userId) returns CO2Model { return _co2Model[userId] ?: { modelType: "CONSTANT", value: 0.53 }; }
