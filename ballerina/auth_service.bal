import ballerina/http;
import ballerina/jwt;
import ballerina/crypto;
import ballerina/time;
import ballerina/uuid;
import ballerina/log;

// Configuration
const string SECRET_KEY = "lankawattwise-secret-key-2024";
const int port_auth = 8087;

// In-memory storage for demo
map<UserWithPassword> userStore = {};
map<RefreshToken> refreshTokenStore = {};

// Data types
public type User record {
    string id;
    string email;
    string? mobile;
    string? nic;
    string? cebAccountNo;
    string role;
    time:Utc createdAt;
    time:Utc updatedAt;
};

public type UserWithPassword record {
    *User;
    string passwordHash;
};

public type RefreshToken record {
    string id;
    string userId;
    string tokenHash;
    time:Utc expiresAt;
    boolean revoked;
    time:Utc createdAt;
};

public type SignupRequest record {
    string email;
    string password;
    string? mobile;
    string? nic;
    string? cebAccountNo;
};

public type LoginRequest record {
    string email;
    string password;
};

public type AuthResponse record {
    User user;
    string accessToken;
    string refreshToken;
};

// Validation functions
function isValidEmail(string email) returns boolean {
    return email.includes("@") && email.length() > 5;
}

function isValidPassword(string password) returns boolean {
    return password.length() >= 8;
}

// Password hashing (simplified for demo)
function hashPassword(string password) returns string {
    // Simple hash for demo - in production use proper bcrypt
    return crypto:hashSha256(password.toBytes()).toBase64();
}

function verifyPassword(string password, string hash) returns boolean {
    string computedHash = crypto:hashSha256(password.toBytes()).toBase64();
    return computedHash == hash;
}

// JWT generation (simplified)
function generateJWT(User user) returns string|error {
    jwt:IssuerConfig issuerConfig = {
        issuer: "lankawattwise-auth",
        audience: ["lankawattwise-api"],
        expTime: 900 // 15 minutes
    };
    
    return jwt:issue(issuerConfig);
}

function generateRefreshToken() returns string {
    return uuid:createType1AsString();
}

// Database operations (in-memory for demo)
function createUser(SignupRequest req) returns User|error {
    string userId = uuid:createType1AsString();
    string passwordHash = hashPassword(req.password);
    time:Utc now = time:utcNow();
    
    // Check if user already exists
    foreach UserWithPassword user in userStore {
        if user.email == req.email {
            return error("User already exists");
        }
    }
    
    UserWithPassword newUser = {
        id: userId,
        email: req.email,
        mobile: req.mobile,
        nic: req.nic,
        passwordHash: passwordHash,
        cebAccountNo: req.cebAccountNo,
        role: "user",
        createdAt: now,
        updatedAt: now
    };
    
    userStore[userId] = newUser;
    
    return {
        id: userId,
        email: req.email,
        mobile: req.mobile,
        nic: req.nic,
        cebAccountNo: req.cebAccountNo,
        role: "user",
        createdAt: now,
        updatedAt: now
    };
}

function getUserByEmail(string email) returns UserWithPassword? {
    foreach UserWithPassword user in userStore {
        if user.email == email {
            return user;
        }
    }
    return ();
}

function storeRefreshToken(string userId, string token) returns error? {
    string tokenId = uuid:createType1AsString();
    string tokenHash = crypto:hashSha256(token.toBytes()).toBase64();
    time:Utc expiresAt = time:utcAddSeconds(time:utcNow(), 7 * 24 * 3600); // 7 days
    
    RefreshToken refreshToken = {
        id: tokenId,
        userId: userId,
        tokenHash: tokenHash,
        expiresAt: expiresAt,
        revoked: false,
        createdAt: time:utcNow()
    };
    
    refreshTokenStore[tokenId] = refreshToken;
}

// HTTP endpoints
service /auth on new http:Listener(port_auth) {
    
    resource function post signup(http:Caller caller, http:Request req) returns error? {
        json|error payload = req.getJsonPayload();
        if payload is error {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Invalid JSON payload"});
            check caller->respond(response);
            return;
        }
        
        SignupRequest|error signupReq = payload.cloneWithType(SignupRequest);
        if signupReq is error {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Invalid signup request"});
            check caller->respond(response);
            return;
        }
        
        // Validation
        if !isValidEmail(signupReq.email) {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Invalid email format"});
            check caller->respond(response);
            return;
        }
        
        if !isValidPassword(signupReq.password) {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Password must be at least 8 characters"});
            check caller->respond(response);
            return;
        }
        
        // Create user
        User|error user = createUser(signupReq);
        if user is error {
            http:Response response = new;
            response.statusCode = 409;
            response.setJsonPayload({"error": user.message()});
            check caller->respond(response);
            return;
        }
        
        // Generate tokens
        string|error accessToken = generateJWT(user);
        if accessToken is error {
            http:Response response = new;
            response.statusCode = 500;
            response.setJsonPayload({"error": "Failed to generate access token"});
            check caller->respond(response);
            return;
        }
        
        string refreshToken = generateRefreshToken();
        error? storeResult = storeRefreshToken(user.id, refreshToken);
        if storeResult is error {
            log:printError("Failed to store refresh token", storeResult);
        }
        
        json authResponse = {
            "user": {
                "id": user.id,
                "email": user.email,
                "mobile": user.mobile,
                "nic": user.nic,
                "cebAccountNo": user.cebAccountNo,
                "role": user.role,
                "createdAt": user.createdAt,
                "updatedAt": user.updatedAt
            },
            "accessToken": accessToken,
            "refreshToken": refreshToken
        };
        
        http:Response response = new;
        response.statusCode = 201;
        response.setJsonPayload(authResponse);
        check caller->respond(response);
    }
    
    resource function post login(http:Caller caller, http:Request req) returns error? {
        json|error payload = req.getJsonPayload();
        if payload is error {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Invalid JSON payload"});
            check caller->respond(response);
            return;
        }
        
        LoginRequest|error loginReq = payload.cloneWithType(LoginRequest);
        if loginReq is error {
            http:Response response = new;
            response.statusCode = 400;
            response.setJsonPayload({"error": "Invalid login request"});
            check caller->respond(response);
            return;
        }
        
        // Find user
        UserWithPassword? userWithPassword = getUserByEmail(loginReq.email);
        if userWithPassword is () {
            http:Response response = new;
            response.statusCode = 401;
            response.setJsonPayload({"error": "Invalid credentials"});
            check caller->respond(response);
            return;
        }
        
        // Verify password
        boolean passwordValid = verifyPassword(loginReq.password, userWithPassword.passwordHash);
        if !passwordValid {
            http:Response response = new;
            response.statusCode = 401;
            response.setJsonPayload({"error": "Invalid credentials"});
            check caller->respond(response);
            return;
        }
        
        User user = {
            id: userWithPassword.id,
            email: userWithPassword.email,
            mobile: userWithPassword.mobile,
            nic: userWithPassword.nic,
            cebAccountNo: userWithPassword.cebAccountNo,
            role: userWithPassword.role,
            createdAt: userWithPassword.createdAt,
            updatedAt: userWithPassword.updatedAt
        };
        
        // Generate tokens
        string|error accessToken = generateJWT(user);
        if accessToken is error {
            http:Response response = new;
            response.statusCode = 500;
            response.setJsonPayload({"error": "Failed to generate access token"});
            check caller->respond(response);
            return;
        }
        
        string refreshToken = generateRefreshToken();
        error? storeResult = storeRefreshToken(user.id, refreshToken);
        if storeResult is error {
            log:printError("Failed to store refresh token", storeResult);
        }
        
        json authResponse = {
            "user": {
                "id": user.id,
                "email": user.email,
                "mobile": user.mobile,
                "nic": user.nic,
                "cebAccountNo": user.cebAccountNo,
                "role": user.role,
                "createdAt": user.createdAt,
                "updatedAt": user.updatedAt
            },
            "accessToken": accessToken,
            "refreshToken": refreshToken
        };
        
        http:Response response = new;
        response.statusCode = 200;
        response.setJsonPayload(authResponse);
        check caller->respond(response);
    }
    
    resource function get health(http:Caller caller, http:Request req) returns error? {
        http:Response response = new;
        response.statusCode = 200;
        response.setJsonPayload({"status": "healthy", "service": "auth"});
        check caller->respond(response);
    }
}

// Main service starter (commented out to avoid conflicts)
// public function main() returns error? {
//     log:printInfo("Starting EcoMeter Auth Service on port " + port_auth.toString());
// }
