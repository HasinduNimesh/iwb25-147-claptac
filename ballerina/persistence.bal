import ballerina/log;
import ballerinax/mysql;
import ballerina/sql;
import ballerina/time;
import ballerina/lang.value as value;

// Persistence layer backed by MySQL so state survives restarts and scales across instances.

configurable string dbHost = "localhost";
configurable int dbPort = 3306;
configurable string dbName = "lankawattwise";
configurable string dbUser = "lww_user";
configurable string dbPassword = "lww_pass";
configurable int dbPoolMaxOpen = 8;

final mysql:Client dbClient = checkpanic new (
    host = dbHost,
    port = dbPort,
    user = dbUser,
    password = dbPassword,
    database = dbName,
    connectionPool = { maxOpenConnections: dbPoolMaxOpen, minIdleConnections: 1 }
);

public function initPersistence() returns error? {
    return initDatabase();
}

function initDatabase() returns error? {
    log:printDebug("Ensuring persistence schema is present");
    sql:ParameterizedQuery[] ddlStatements = [
        `CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(64) PRIMARY KEY,
            email VARCHAR(191) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            mobile VARCHAR(40),
            nic VARCHAR(40),
            ceb_account_no VARCHAR(64),
            role VARCHAR(32) DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS refresh_tokens (
            id VARCHAR(64) PRIMARY KEY,
            user_id VARCHAR(64) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            revoked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_refresh_user (user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS user_states (
            user_id VARCHAR(191) PRIMARY KEY,
            state_json JSON,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS tariff_configs (
            user_id VARCHAR(191) PRIMARY KEY,
            utility VARCHAR(32),
            tariff_type VARCHAR(32),
            config_json JSON NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS appliances (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(191) NOT NULL,
            appliance_id VARCHAR(120) NOT NULL,
            name VARCHAR(255) NOT NULL,
            rated_power_w DECIMAL(10,2),
            cycle_minutes INT,
            latest_finish VARCHAR(8),
            noise_curfew BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_appliance (user_id, appliance_id),
            INDEX idx_appliance_user (user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(191) NOT NULL,
            task_id VARCHAR(120) NOT NULL,
            appliance_id VARCHAR(120) NOT NULL,
            duration_min INT,
            earliest VARCHAR(8),
            latest VARCHAR(8),
            repeats_per_week INT,
            shiftable BOOLEAN DEFAULT TRUE,
            days_of_week JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_task (user_id, task_id),
            INDEX idx_task_user (user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS co2_configs (
            user_id VARCHAR(191) PRIMARY KEY,
            default_kg_per_kwh DECIMAL(10,4),
            profile_json JSON,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS co2_models (
            user_id VARCHAR(191) PRIMARY KEY,
            model_type VARCHAR(32) NOT NULL,
            value DECIMAL(10,4),
            profile_json JSON,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS solar_configs (
            user_id VARCHAR(191) PRIMARY KEY,
            scheme VARCHAR(32),
            export_price_lkr DECIMAL(10,2),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS bill_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(191) NOT NULL,
            month VARCHAR(7) NOT NULL,
            total_kwh DECIMAL(10,2),
            total_cost_lkr DECIMAL(10,2),
            total_co2_kg DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_month (user_id, month),
            INDEX idx_bill_user (user_id)
        )`
    ];

    foreach var stmt in ddlStatements {
        _ = check dbClient->execute(stmt);
    }

    // Defensive migrations for older databases (MySQL versions without IF NOT EXISTS)
    // Add 'shiftable' column if missing
    boolean hasShiftable = check columnExists("tasks", "shiftable");
    if !hasShiftable {
        _ = check dbClient->execute(`ALTER TABLE tasks ADD COLUMN shiftable BOOLEAN DEFAULT TRUE`);
    }
    // Add 'days_of_week' column if missing
    boolean hasDays = check columnExists("tasks", "days_of_week");
    if !hasDays {
        _ = check dbClient->execute(`ALTER TABLE tasks ADD COLUMN days_of_week JSON`);
    }

    return ();
}

function columnExists(string tableName, string columnName) returns boolean|error {
    stream<record {| int? cnt; |}, sql:Error?> rs =
        dbClient->query(`
            SELECT COUNT(*) AS cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ${dbName}
              AND TABLE_NAME = ${tableName}
              AND COLUMN_NAME = ${columnName}
        `);
    var row = rs.next();
    check rs.close();
    if row is record {| record {| int? cnt; |} value; |} {
        int c = row.value.cnt ?: 0;
        return c > 0;
    }
    return false;
}

// region: generic helpers --------------------------------------------------

function toNullableJson(decimal[]? arr) returns json? {
    if arr is () {
        return ();
    }
    json j = arr;
    return j;
}

function jsonToString(json value) returns string {
    return value.toJsonString();
}

function optionalJsonToString(json? value) returns string? {
    if value is () {
        return ();
    }
    return value.toJsonString();
}

function pad2(int value) returns string {
    if value >= 0 && value < 10 {
        return "0" + string `${value}`;
    }
    return string `${value}`;
}

function toIsoUtc(time:Utc instant) returns string {
    time:Civil civil = time:utcToCivil(instant);
    string year = string `${civil.year}`;
    string month = pad2(civil.month);
    string day = pad2(civil.day);
    string hour = pad2(civil.hour);
    string minute = pad2(civil.minute);
    int secondWhole = <int>civil.second;
    string second = pad2(secondWhole);
    return year + "-" + month + "-" + day + "T" + hour + ":" + minute + ":" + second + "Z";
}

function parseJsonString(string value) returns json|error {
    var parsed = check value:fromJsonString(value);
    return <json>parsed;
}

function toDecimalArray(json? val) returns decimal[]? {
    if val is () {
        return ();
    }
    if val is json[] {
        decimal[] out = [];
        foreach json item in val {
            if item is decimal {
                out.push(item);
            } else if item is int {
                out.push(<decimal>item);
            }
        }
        return out;
    }
    return ();
}

function toUtcOrNow(string? dt) returns time:Utc {
    if dt is () || dt.length() == 0 {
        return time:utcNow();
    }
    time:Utc|time:Error parsed = time:utcFromString(dt);
    if parsed is time:Utc {
        return parsed;
    }
    return time:utcNow();
}

// endregion ----------------------------------------------------------------

// region: user state -------------------------------------------------------

public function saveUserState(string userId, map<json> state) returns error? {
    json payloadJson = <json>state;
    string payload = jsonToString(payloadJson);
    _ = check dbClient->execute(`
        INSERT INTO user_states (user_id, state_json)
        VALUES (${userId}, ${payload})
        ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)
    `);
}

public function loadUserState(string userId) returns map<json>|error {
    stream<record {| string? state_json; |}, sql:Error?> rs =
        dbClient->query(`SELECT CAST(state_json AS CHAR) AS state_json FROM user_states WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string? state_json; |} value; |} {
        string? payload = result.value.state_json;
        if payload is string {
            json parsed = check parseJsonString(payload);
            if parsed is map<json> {
                return parsed;
            }
        }
    }
    return {};
}

// endregion ----------------------------------------------------------------

// region: tariff configs ---------------------------------------------------

public function saveTariffConfig(string userId, TariffConfig config) returns error? {
    json cfgJson = <json>config;
    string cfg = jsonToString(cfgJson);
    _ = check dbClient->execute(`
        INSERT INTO tariff_configs (user_id, utility, tariff_type, config_json)
        VALUES (${userId}, ${config.utility}, ${config.tariffType}, ${cfg})
        ON DUPLICATE KEY UPDATE utility = VALUES(utility), tariff_type = VALUES(tariff_type), config_json = VALUES(config_json)
    `);
}

public function loadTariffConfig(string userId) returns TariffConfig|error? {
    stream<record {| string config_json; |}, sql:Error?> rs =
        dbClient->query(`SELECT CAST(config_json AS CHAR) AS config_json FROM tariff_configs WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string config_json; |} value; |} {
        json parsed = check parseJsonString(result.value.config_json);
        TariffConfig cfg = check parsed.cloneWithType(TariffConfig);
        return cfg;
    }
    return ();
}

// endregion ----------------------------------------------------------------

// region: appliances -------------------------------------------------------

public function saveAppliancesConfig(string userId, ApplianceCfg[] appliances) returns error? {
    _ = check dbClient->execute(`DELETE FROM appliances WHERE user_id = ${userId}`);
    foreach var appliance in appliances {
        _ = check dbClient->execute(`
            INSERT INTO appliances (user_id, appliance_id, name, rated_power_w, cycle_minutes, latest_finish, noise_curfew)
            VALUES (${userId}, ${appliance.id}, ${appliance.name}, ${appliance.ratedPowerW}, ${appliance.cycleMinutes}, ${appliance.latestFinish}, ${appliance.noiseCurfew})
        `);
    }
}

public function loadAppliancesConfig(string userId) returns ApplianceCfg[]|error {
    stream<record {|
        string appliance_id;
        string name;
        decimal? rated_power_w;
        int? cycle_minutes;
        string? latest_finish;
        boolean? noise_curfew;
    |}, sql:Error?> rs = dbClient->query(`
        SELECT appliance_id, name, rated_power_w, cycle_minutes, latest_finish, noise_curfew
        FROM appliances WHERE user_id = ${userId} ORDER BY id ASC
    `);

    ApplianceCfg[] out = [];
    check from var rec in rs
        do {
            decimal rated = rec.rated_power_w ?: 0.0;
            int minutes = rec.cycle_minutes ?: 0;
            string latest = rec.latest_finish ?: "22:00";
            boolean curfew = rec.noise_curfew ?: false;
            out.push({
                id: rec.appliance_id,
                name: rec.name,
                ratedPowerW: rated,
                cycleMinutes: minutes,
                latestFinish: latest,
                noiseCurfew: curfew
            });
        };
    return out;
}

// endregion ----------------------------------------------------------------

// region: tasks ------------------------------------------------------------

public function saveTasks(string userId, Task[] tasks) returns error? {
    _ = check dbClient->execute(`DELETE FROM tasks WHERE user_id = ${userId}`);
    foreach var task in tasks {
        boolean shift;
        var sh = task?.shiftable;
        if sh is boolean { shift = sh; } else { shift = true; }
        json? daysJ = ();
        var d = task?.daysOfWeek;
        if d is int[] { daysJ = <json>d; }
        _ = check dbClient->execute(`
            INSERT INTO tasks (user_id, task_id, appliance_id, duration_min, earliest, latest, repeats_per_week, shiftable, days_of_week)
            VALUES (${userId}, ${task.id}, ${task.applianceId}, ${task.durationMin}, ${task.earliest}, ${task.latest}, ${task.repeatsPerWeek}, ${shift}, CAST(${optionalJsonToString(daysJ)} AS JSON))
        `);
    }
}

public function loadTasks(string userId) returns Task[]|error {
    stream<record {|
        string task_id;
        string appliance_id;
        int? duration_min;
        string? earliest;
        string? latest;
        int? repeats_per_week;
        boolean? shiftable;
        string? days_of_week;
    |}, sql:Error?> rs = dbClient->query(`
        SELECT task_id, appliance_id, duration_min, earliest, latest, repeats_per_week, shiftable, CAST(days_of_week AS CHAR) AS days_of_week
        FROM tasks WHERE user_id = ${userId} ORDER BY id ASC
    `);

    Task[] out = [];
    check from var rec in rs
        do {
            int[]? dows = ();
            string? jd = rec.days_of_week;
            if jd is string {
                json parsed = check parseJsonString(jd);
                json arr = parsed;
                // Legacy fix: handle JSON stored as a string inside JSON
                if parsed is string {
                    json parsed2 = check parseJsonString(parsed);
                    arr = parsed2;
                }
                if arr is json[] {
                    int[] tmp = [];
                    foreach json v in arr {
                        if v is int {
                            int d = v;
                            if d < 0 { d = 0; } else if d > 6 { d = 6; }
                            tmp.push(d);
                        } else if v is decimal {
                            int d = <int>v;
                            if d < 0 { d = 0; } else if d > 6 { d = 6; }
                            tmp.push(d);
                        }
                    }
                    dows = tmp;
                }
            }
            out.push({
                id: rec.task_id,
                applianceId: rec.appliance_id,
                durationMin: rec.duration_min ?: 0,
                earliest: rec.earliest ?: "06:00",
                latest: rec.latest ?: "22:00",
                repeatsPerWeek: rec.repeats_per_week ?: 0,
                shiftable: rec.shiftable ?: true,
                daysOfWeek: dows
            });
        };
    return out;
}

// endregion ----------------------------------------------------------------

// region: CO₂ config & model -----------------------------------------------

public function saveCO2Config(string userId, CO2Config config) returns error? {
    json? profileJson = toNullableJson(config?.profile);
    string? profile = optionalJsonToString(profileJson);
    _ = check dbClient->execute(`
        INSERT INTO co2_configs (user_id, default_kg_per_kwh, profile_json)
        VALUES (${userId}, ${config.defaultKgPerKWh}, ${profile})
        ON DUPLICATE KEY UPDATE default_kg_per_kwh = VALUES(default_kg_per_kwh), profile_json = VALUES(profile_json)
    `);
}

public function loadCO2Config(string userId) returns CO2Config|error? {
    stream<record {| decimal? default_kg_per_kwh; string? profile_json; |}, sql:Error?> rs =
        dbClient->query(`SELECT default_kg_per_kwh, CAST(profile_json AS CHAR) AS profile_json FROM co2_configs WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| decimal? default_kg_per_kwh; string? profile_json; |} value; |} {
        record {| decimal? default_kg_per_kwh; string? profile_json; |} row = result.value;
        decimal def = row.default_kg_per_kwh ?: 0.0;
        decimal[]? profile = ();
        string? profileJson = row.profile_json;
        if profileJson is string {
            json parsed = check parseJsonString(profileJson);
            profile = toDecimalArray(parsed);
        }
        CO2Config cfg = { defaultKgPerKWh: def, profile: profile };
        return cfg;
    }
    return ();
}

public function saveCO2Model(string userId, CO2Model model) returns error? {
    decimal[48]? profileData = model?.profile;
    json? profileJson = profileData is () ? () : <json>profileData;
    string? profile = optionalJsonToString(profileJson);
    _ = check dbClient->execute(`
        INSERT INTO co2_models (user_id, model_type, value, profile_json)
        VALUES (${userId}, ${model.modelType}, ${model.value}, ${profile})
        ON DUPLICATE KEY UPDATE model_type = VALUES(model_type), value = VALUES(value), profile_json = VALUES(profile_json)
    `);
}

public function loadCO2Model(string userId) returns CO2Model|error? {
    stream<record {| string model_type; decimal? value; string? profile_json; |}, sql:Error?> rs =
        dbClient->query(`SELECT model_type, value, CAST(profile_json AS CHAR) AS profile_json FROM co2_models WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string model_type; decimal? value; string? profile_json; |} value; |} {
        record {| string model_type; decimal? value; string? profile_json; |} row = result.value;
        decimal[48]? profile = ();
        string? profileJson = row.profile_json;
        if profileJson is string {
            json parsed = check parseJsonString(profileJson);
            decimal[]? profileArray = toDecimalArray(parsed);
            if profileArray is decimal[] && profileArray.length() == 48 {
                profile = <decimal[48]>profileArray;
            }
        }
        CO2Model model = {
            modelType: <CO2ModelType>row.model_type,
            value: row.value,
            profile: profile
        };
        return model;
    }
    return ();
}

// endregion ----------------------------------------------------------------

// region: solar ------------------------------------------------------------

public function saveSolarConfig(string userId, SolarConfig config) returns error? {
    _ = check dbClient->execute(`
        INSERT INTO solar_configs (user_id, scheme, export_price_lkr)
        VALUES (${userId}, ${config.scheme}, ${config.exportPriceLKR})
        ON DUPLICATE KEY UPDATE scheme = VALUES(scheme), export_price_lkr = VALUES(export_price_lkr)
    `);
}

public function loadSolarConfig(string userId) returns SolarConfig|error? {
    stream<record {| string scheme; decimal? export_price_lkr; |}, sql:Error?> rs =
        dbClient->query(`SELECT scheme, export_price_lkr FROM solar_configs WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string scheme; decimal? export_price_lkr; |} value; |} {
        record {| string scheme; decimal? export_price_lkr; |} row = result.value;
        SolarConfig config = { scheme: <SolarScheme>row.scheme, exportPriceLKR: row.export_price_lkr };
        return config;
    }
    return ();
}

// endregion ----------------------------------------------------------------

// region: auth -------------------------------------------------------------

public function saveUserCredentials(string email, UserWithPassword user) returns error? {
    _ = check dbClient->execute(`
        INSERT INTO users (user_id, email, password_hash, mobile, nic, ceb_account_no, role)
        VALUES (${user.id}, ${email}, ${user.passwordHash}, ${user.mobile}, ${user.nic}, ${user.cebAccountNo}, ${user.role})
        ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), mobile = VALUES(mobile), nic = VALUES(nic),
            ceb_account_no = VALUES(ceb_account_no), role = VALUES(role)
    `);
}

public function loadUserCredentials(string email) returns UserWithPassword|error? {
    stream<record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |}, sql:Error?> rs =
        dbClient->query(`SELECT user_id, email, password_hash, mobile, nic, ceb_account_no, role, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at FROM users WHERE email = ${email}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |} value; |} {
        record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |} row = result.value;
        time:Utc created = toUtcOrNow(row.created_at);
        time:Utc updated = toUtcOrNow(row.updated_at);
        UserWithPassword user = {
            id: row.user_id,
            email: row.email,
            mobile: row.mobile,
            nic: row.nic,
            cebAccountNo: row.ceb_account_no,
            role: row.role,
            createdAt: created,
            updatedAt: updated,
            passwordHash: row.password_hash
        };
        return user;
    }
    return ();
}

public function loadUserCredentialsById(string userId) returns UserWithPassword|error? {
    stream<record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |}, sql:Error?> rs =
        dbClient->query(`SELECT user_id, email, password_hash, mobile, nic, ceb_account_no, role, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at, DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updated_at FROM users WHERE user_id = ${userId}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |} value; |} {
        record {| string user_id; string email; string password_hash; string? mobile; string? nic; string? ceb_account_no; string role; string created_at; string updated_at; |} row = result.value;
        time:Utc created = toUtcOrNow(row.created_at);
        time:Utc updated = toUtcOrNow(row.updated_at);
        UserWithPassword user = {
            id: row.user_id,
            email: row.email,
            mobile: row.mobile,
            nic: row.nic,
            cebAccountNo: row.ceb_account_no,
            role: row.role,
            createdAt: created,
            updatedAt: updated,
            passwordHash: row.password_hash
        };
        return user;
    }
    return ();
}

public function storeRefreshTokenRecord(RefreshToken token) returns error? {
    string expiresIso = toIsoUtc(token.expiresAt);
    _ = check dbClient->execute(`
        INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked)
        VALUES (${token.id}, ${token.userId}, ${token.tokenHash}, STR_TO_DATE(${expiresIso}, '%Y-%m-%dT%H:%i:%sZ'), ${token.revoked})
        ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expires_at = VALUES(expires_at), revoked = VALUES(revoked)
    `);
}

public function loadRefreshTokenByHash(string tokenHash) returns RefreshToken|error? {
    stream<record {| string id; string user_id; string token_hash; string expires_at; boolean? revoked; string created_at; |}, sql:Error?> rs =
        dbClient->query(`SELECT id, user_id, token_hash, DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at, revoked, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at FROM refresh_tokens WHERE token_hash = ${tokenHash}`);
    var result = rs.next();
    check rs.close();
    if result is record {| record {| string id; string user_id; string token_hash; string expires_at; boolean? revoked; string created_at; |} value; |} {
        record {| string id; string user_id; string token_hash; string expires_at; boolean? revoked; string created_at; |} row = result.value;
        RefreshToken t = {
            id: row.id,
            userId: row.user_id,
            tokenHash: row.token_hash,
            expiresAt: toUtcOrNow(row.expires_at),
            revoked: row.revoked ?: false,
            createdAt: toUtcOrNow(row.created_at)
        };
        return t;
    }
    return ();
}

public function markRefreshTokenRevoked(string tokenId) returns error? {
    _ = check dbClient->execute(`UPDATE refresh_tokens SET revoked = TRUE WHERE id = ${tokenId}`);
}

public function removeRefreshTokensForUser(string userId) returns error? {
    _ = check dbClient->execute(`DELETE FROM refresh_tokens WHERE user_id = ${userId}`);
}

// endregion ----------------------------------------------------------------

// region: misc admin -------------------------------------------------------

public function listAllUsers() returns string[]|error {
    stream<record {| string email; |}, sql:Error?> rs = dbClient->query(`SELECT email FROM users ORDER BY email`);
    string[] out = [];
    check from var rec in rs
        do {
            out.push(rec.email);
        };
    return out;
}

// endregion ----------------------------------------------------------------
