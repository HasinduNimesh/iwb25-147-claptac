import ballerina/http;
import ballerina/log;

configurable int port_ingest = 8085;

service /ingest on new http:Listener(port_ingest) {
    resource function post telemetry(@http:Payload json payload) returns http:Ok|error {
        log:printInfo("Telemetry received", payload = payload.toJsonString());
        return { body: { status: "ok" } };
    }

    resource function get healthz() returns string { return "ok"; }
}
