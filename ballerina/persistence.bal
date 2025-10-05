import ballerina/io;
import ballerina/file;

// Persistence layer for storing data to disk (JSON files)
// This prevents data loss on server restart

const string DATA_DIR = "./data/persistence";

// Initialize data directory
public function initPersistence() returns error? {
    boolean exists = check file:test(DATA_DIR, file:EXISTS);
    if !exists {
        check file:createDir(DATA_DIR, file:RECURSIVE);
    }
}

// Save user state to disk
public function saveUserState(string userId, map<json> state) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_state.json";
    json content = state.toJson();
    check io:fileWriteJson(filePath, content);
}

// Load user state from disk
public function loadUserState(string userId) returns map<json>|error {
    string filePath = DATA_DIR + "/" + userId + "_state.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return {};
    }
    
    json content = check io:fileReadJson(filePath);
    if content is map<json> {
        return content;
    }
    
    return {};
}

// Save tariff config to disk
public function saveTariffConfig(string userId, TariffConfig config) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_tariff.json";
    check io:fileWriteJson(filePath, config.toJson());
}

// Load tariff config from disk
public function loadTariffConfig(string userId) returns TariffConfig|error? {
    string filePath = DATA_DIR + "/" + userId + "_tariff.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return ();
    }
    
    json content = check io:fileReadJson(filePath);
    // Deserialize to TariffConfig
    return check content.cloneWithType(TariffConfig);
}

// Save appliances config to disk
public function saveAppliancesConfig(string userId, ApplianceCfg[] appliances) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_appliances.json";
    check io:fileWriteJson(filePath, appliances.toJson());
}

// Load appliances config from disk
public function loadAppliancesConfig(string userId) returns ApplianceCfg[]|error {
    string filePath = DATA_DIR + "/" + userId + "_appliances.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return [];
    }
    
    json content = check io:fileReadJson(filePath);
    if content is json[] {
        ApplianceCfg[] appliances = [];
        foreach json item in content {
            ApplianceCfg appliance = check item.cloneWithType(ApplianceCfg);
            appliances.push(appliance);
        }
        return appliances;
    }
    
    return [];
}

// Save tasks to disk
public function saveTasks(string userId, Task[] tasks) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_tasks.json";
    check io:fileWriteJson(filePath, tasks.toJson());
}

// Load tasks from disk
public function loadTasks(string userId) returns Task[]|error {
    string filePath = DATA_DIR + "/" + userId + "_tasks.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return [];
    }
    
    json content = check io:fileReadJson(filePath);
    if content is json[] {
        Task[] tasks = [];
        foreach json item in content {
            Task task = check item.cloneWithType(Task);
            tasks.push(task);
        }
        return tasks;
    }
    
    return [];
}

// Save CO2 config to disk
public function saveCO2Config(string userId, CO2Config config) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_co2.json";
    check io:fileWriteJson(filePath, config.toJson());
}

// Load CO2 config from disk
public function loadCO2Config(string userId) returns CO2Config|error? {
    string filePath = DATA_DIR + "/" + userId + "_co2.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return ();
    }
    
    json content = check io:fileReadJson(filePath);
    return check content.cloneWithType(CO2Config);
}

// Save solar config to disk
public function saveSolarConfig(string userId, SolarConfig config) returns error? {
    string filePath = DATA_DIR + "/" + userId + "_solar.json";
    check io:fileWriteJson(filePath, config.toJson());
}

// Load solar config from disk
public function loadSolarConfig(string userId) returns SolarConfig|error? {
    string filePath = DATA_DIR + "/" + userId + "_solar.json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return ();
    }
    
    json content = check io:fileReadJson(filePath);
    return check content.cloneWithType(SolarConfig);
}

// Save user credentials (for auth service)
public function saveUserCredentials(string email, UserWithPassword user) returns error? {
    string filePath = DATA_DIR + "/auth_" + email + ".json";
    check io:fileWriteJson(filePath, user.toJson());
}

// Load user credentials
public function loadUserCredentials(string email) returns UserWithPassword|error? {
    string filePath = DATA_DIR + "/auth_" + email + ".json";
    boolean exists = check file:test(filePath, file:EXISTS);
    
    if !exists {
        return ();
    }
    
    json content = check io:fileReadJson(filePath);
    return check content.cloneWithType(UserWithPassword);
}

// List all users (for admin purposes)
public function listAllUsers() returns string[]|error {
    file:MetaData[] files = check file:readDir(DATA_DIR);
    string[] users = [];
    
    foreach var fileInfo in files {
        string fileName = fileInfo.absPath;
        if fileName.endsWith("_state.json") {
            string userId = fileName.substring(DATA_DIR.length() + 1, fileName.length() - 11);
            users.push(userId);
        }
    }
    
    return users;
}
