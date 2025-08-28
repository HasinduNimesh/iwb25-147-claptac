import ballerina/http;
import ballerina/log;

// Temporary HTTP-based stub to keep the project runnable during setup.
service /ingest on new http:Listener(8085) {
    resource function post telemetry(@http:Payload json payload) returns http:Ok|error {
        log:printInfo("Telemetry received", payload = payload.toJsonString());
        return { body: { status: "ok" } };
    }
}
