import ballerina/http;

public type Recommendation record {
    string id;
    string applianceId;
    string suggestedStart;
    int durationMinutes;
    string[] reasons;
    decimal estSavingLKR;
};

service /notify on new http:Listener(8084) {
    resource function get ping() returns string { return "pong"; }
}
