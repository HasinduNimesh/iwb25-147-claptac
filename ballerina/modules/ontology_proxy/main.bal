import ballerina/http;

public type Appliance record {
    string id;
    string label;
    string flexibility; // shiftable | thermalStorage | nonShiftable
};

configurable string fusekiBaseUrl = "http://localhost:3030/lww";

service /ontology on new http:Listener(8082) {
    resource function get appliances(string userId) returns Appliance[]|error {
        // Minimal stub: return 1-2 sample appliances; later call SPARQL endpoint using fusekiBaseUrl
        return [{ id: "pump-1", label: "Well Pump", flexibility: "shiftable" }, { id: "ac-1", label: "Bedroom AC", flexibility: "thermalStorage" }];
    }
}
