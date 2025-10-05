# Database Integration Guide

## Quick Start: Integrate MySQL Persistence

### Step 1: Add MySQL Dependency

Add to `ballerina/Ballerina.toml`:

```toml
[[dependency]]
org = "ballerinax"
name = "mysql"
version = "1.11.0"
```

### Step 2: Configure Database Connection

Add to `ballerina/Config.toml`:

```toml
# MySQL Database Configuration
dbHost = "mysql"  # Use "localhost" for local dev, "mysql" for docker-compose
dbPort = 3306
dbUser = "lww_user"
dbPassword = "lww_pass"
dbName = "lankawattwise"
```

### Step 3: Initialize Database on Startup

Add to `ballerina/main.bal` (or create init function):

```ballerina
import lankawattwise.lww.database;
import ballerina/log;

public function main() returns error? {
    // Initialize database schema
    error? dbInit = database:initDatabase();
    if dbInit is error {
        log:printError("Failed to initialize database", dbInit);
        return dbInit;
    }
    log:printInfo("Database initialized successfully");
    
    // Start services...
}
```

### Step 4: Update state.bal Functions (Example)

Replace in-memory storage with database calls:

```ballerina
import lankawattwise.lww.database;

// Before (in-memory):
public function setTariff(string userId, TariffConfig cfg) { 
    _tariffs[userId] = cfg; 
}

public function getTariff(string userId) returns TariffConfig? { 
    return _tariffs[userId]; 
}

// After (database-backed with cache):
public function setTariff(string userId, TariffConfig cfg) { 
    _tariffs[userId] = cfg; // Cache
    error? result = database:saveTariffConfig(userId, cfg); // Persist
    if result is error {
        log:printError("Failed to save tariff to database", result);
    }
}

public function getTariff(string userId) returns TariffConfig? { 
    // Try cache first
    TariffConfig? cached = _tariffs[userId];
    if cached is TariffConfig {
        return cached;
    }
    // Fallback to database
    TariffConfig|error? dbResult = database:getTariffConfig(userId);
    if dbResult is TariffConfig {
        _tariffs[userId] = dbResult; // Update cache
        return dbResult;
    }
    return ();
}
```

### Step 5: Build and Run

```powershell
# Start infrastructure (MySQL, Fuseki, etc.)
cd deploy
docker-compose up -d mysql

# Build Ballerina project
cd ../ballerina
bal build

# Run with observability
bal run --observability-config-file=observability.toml target/bin/lww.jar
```

---

## Alternative: Use Database Functions Directly in Services

Instead of modifying state.bal, you can call database functions directly in services:

### Example: config_service.bal

```ballerina
import lankawattwise.lww.database;

service /config on new http:Listener(port_config) {
    resource function get tariff(string userId) returns TariffConfig|error {
        // Load from database
        TariffConfig|error? cfg = database:getTariffConfig(userId);
        if cfg is TariffConfig {
            return cfg;
        }
        // Return default if not found
        return { 
            utility: "CEB", 
            tariffType: "TOU", 
            windows: [
                { name: "Off-Peak", startTime: "22:30", endTime: "05:30", rateLKR: 25.0 },
                { name: "Day", startTime: "05:30", endTime: "18:30", rateLKR: 45.0 },
                { name: "Peak", startTime: "18:30", endTime: "22:30", rateLKR: 70.0 }
            ] 
        };
    }
    
    resource function post tariff(string userId, @http:Payload TariffConfig body) returns UpsertResponse|error {
        // Save to database
        error? result = database:saveTariffConfig(userId, body);
        if result is error {
            return { ok: false };
        }
        return { ok: true };
    }
}
```

---

## Database Schema Reference

### Tables Created by initDatabase()

```sql
-- Users table
CREATE TABLE users (
    user_id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tariff configurations
CREATE TABLE tariff_configs (
    user_id VARCHAR(255) PRIMARY KEY,
    utility VARCHAR(50),
    tariff_type VARCHAR(50),
    config_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Appliances
CREATE TABLE appliances (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    name VARCHAR(255),
    rated_power_w DECIMAL(10,2),
    cycle_minutes INT,
    latest_finish VARCHAR(10),
    noise_curfew BOOLEAN,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Tasks (scheduled jobs)
CREATE TABLE tasks (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255),
    appliance_id VARCHAR(255),
    duration_min INT,
    earliest VARCHAR(10),
    latest VARCHAR(10),
    repeats_per_week INT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- CO2 configurations
CREATE TABLE co2_configs (
    user_id VARCHAR(255) PRIMARY KEY,
    default_kg_per_kwh DECIMAL(10,4),
    profile_json TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Solar configurations
CREATE TABLE solar_configs (
    user_id VARCHAR(255) PRIMARY KEY,
    scheme VARCHAR(50),
    export_price_lkr DECIMAL(10,2),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Bill history (for reports)
CREATE TABLE bill_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255),
    month_year VARCHAR(20),
    amount_lkr DECIMAL(10,2),
    kwh_consumed DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_user_month (user_id, month_year)
);
```

---

## Testing Database Integration

### Test 1: Verify Database Connection

```ballerina
import ballerinax/mysql;
import ballerina/sql;

public function testConnection() returns error? {
    mysql:Client dbClient = check new (
        host = "localhost",
        port = 3306,
        user = "lww_user",
        password = "lww_pass",
        database = "lankawattwise"
    );
    
    sql:ParameterizedQuery query = `SELECT 1`;
    _ = check dbClient->execute(query);
    
    check dbClient.close();
    println("Database connection successful!");
}
```

### Test 2: Save and Retrieve Tariff

```bash
# Save tariff
curl -X POST http://localhost:8090/config/tariff?userId=test_user \
  -H "Content-Type: application/json" \
  -d '{
    "utility": "CEB",
    "tariffType": "TOU",
    "windows": [
      {"name": "Off-Peak", "startTime": "22:30", "endTime": "05:30", "rateLKR": 25.0},
      {"name": "Day", "startTime": "05:30", "endTime": "18:30", "rateLKR": 45.0},
      {"name": "Peak", "startTime": "18:30", "endTime": "22:30", "rateLKR": 70.0}
    ]
  }'

# Retrieve tariff
curl http://localhost:8090/config/tariff?userId=test_user

# Restart service and retrieve again (should persist)
docker-compose restart lww_api_gateway
curl http://localhost:8090/config/tariff?userId=test_user
```

### Test 3: Verify Data in MySQL

```bash
# Connect to MySQL
docker exec -it deploy_mysql_1 mysql -u lww_user -plww_pass lankawattwise

# Query data
SELECT * FROM tariff_configs;
SELECT * FROM appliances;
SELECT * FROM bill_history;
```

---

## Troubleshooting

### Error: "undefined module 'database'"

**Solution**: Ensure database.bal is in the same package (ballerina/) and imported correctly:

```ballerina
// If database.bal is in ballerina/database.bal:
import lankawattwise.lww.database;

// If database.bal is a sibling file:
// No import needed, functions are in same package
```

### Error: "Connection refused"

**Solution**: Ensure MySQL is running:

```powershell
docker-compose ps
docker-compose up -d mysql
docker-compose logs mysql
```

### Error: "Access denied for user"

**Solution**: Check credentials in Config.toml match docker-compose.yml:

```yaml
# docker-compose.yml
mysql:
  environment:
    MYSQL_USER: lww_user
    MYSQL_PASSWORD: lww_pass
    MYSQL_DATABASE: lankawattwise
```

### Performance: Slow Queries

**Solution**: Add indexes (already in initDatabase()):

```sql
CREATE INDEX idx_user_id ON appliances(user_id);
CREATE INDEX idx_user_month ON bill_history(user_id, month_year);
```

---

## Migration Strategy

### Phase 1: Dual Write (Current + Database)
- Keep in-memory storage active
- Write to both in-memory AND database
- Read from in-memory (fast)
- **No downtime, safe rollback**

### Phase 2: Dual Read (Database + Fallback)
- Read from database first
- Fallback to in-memory if not found
- Still write to both
- **Validates database reliability**

### Phase 3: Database Only
- Remove in-memory storage
- All reads/writes use database
- Add caching layer if needed
- **Full persistence**

---

## Production Considerations

### 1. Connection Pooling

```ballerina
final mysql:Client dbClient = check new (
    host = dbHost,
    port = dbPort,
    user = dbUser,
    password = dbPassword,
    database = dbName,
    connectionPool = {
        maxOpenConnections: 10,
        maxConnectionLifeTime: 1800, // 30 minutes
        minIdleConnections: 5
    }
);
```

### 2. Transaction Management

```ballerina
public function saveUserConfig(string userId, TariffConfig tariff, ApplianceCfg[] appliances) returns error? {
    transaction {
        check saveTariffConfig(userId, tariff);
        check saveAppliances(userId, appliances);
        check commit;
    }
}
```

### 3. Error Handling

```ballerina
import ballerina/log;

public function getTariffConfig(string userId) returns TariffConfig|error? {
    sql:ParameterizedQuery query = `SELECT * FROM tariff_configs WHERE user_id = ${userId}`;
    stream<record {}, sql:Error?> resultStream = dbClient->query(query);
    
    record {|record {} value;|}? result = check resultStream.next();
    check resultStream.close();
    
    if result is () {
        log:printDebug("No tariff config found for user", userId = userId);
        return ();
    }
    
    // Parse and return config
    // ...
}
```

### 4. Monitoring Queries

Add metrics for:
- Query execution time
- Connection pool usage
- Failed queries
- Cache hit rate

---

## Next Steps

1. ✅ Add MySQL dependency to Ballerina.toml
2. ✅ Configure database connection in Config.toml
3. ✅ Initialize database schema on startup
4. ✅ Test database connection
5. ⏳ Update state.bal functions to use database
6. ⏳ Test data persistence across restarts
7. ⏳ Monitor query performance
8. ⏳ Implement transaction management for complex operations

For more details, see [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md).
