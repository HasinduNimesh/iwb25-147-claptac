import ballerina/http;
import ballerina/log;
import ballerina/url;

public type Appliance record {
    string id;
    string label;
    string flexibility; // shiftable | thermalStorage | nonShiftable
};

// Configurables
configurable string fuseki_baseUrl = "http://localhost:3030/lww";
configurable int port_ontology = 8082;
final http:Client fuseki = checkpanic new (fuseki_baseUrl, { timeout: 5, httpVersion: http:HTTP_1_1 });

service /ontology on new http:Listener(port_ontology) {
    resource function get appliances(string userId) returns Appliance[]|error {
        // Query Fuseki SPARQL endpoint using the correct ontology namespace
        string query = "PREFIX : <http://lankawattwise.org/ontology#> SELECT ?appliance ?flexibility WHERE { ?appliance a :Appliance ; :hasLoadProfile ?profile . ?profile :hasFlexibility ?flexibility . } LIMIT 10";
        log:printInfo("Executing SPARQL query: " + query);
        http:Request req = new;
        req.setHeader("Accept", "application/sparql-results+json");
        req.setHeader("Content-Type", "application/x-www-form-urlencoded");
        string encoded = check url:encode(query, "UTF-8");
        req.setTextPayload(string `query=${encoded}`);
        json j;
        // Use try-catch to avoid bubbling transport errors
        do {
            log:printInfo("Sending request to Fuseki...");
            http:Response httpResp = check fuseki->post("/query", req);
            log:printInfo("Received response from Fuseki, status: " + httpResp.statusCode.toString());
            if httpResp.statusCode != 200 {
                log:printWarn("Fuseki returned non-200 (" + httpResp.statusCode.toString() + ") for /query. Returning stub appliances. Ensure dataset 'lww' exists at " + fuseki_baseUrl + ".");
                return [{ id: "pump-1", label: "Well Pump", flexibility: "shiftable" }, { id: "ac-1", label: "Bedroom AC", flexibility: "thermalStorage" }];
            }
            j = check httpResp.getJsonPayload();
            log:printInfo("Response JSON: " + j.toString());
        } on fail var e {
            log:printWarn("Fuseki request failed: " + e.message());
            return [{ id: "pump-1", label: "Well Pump", flexibility: "shiftable" }, { id: "ac-1", label: "Bedroom AC", flexibility: "thermalStorage" }];
        }
        
        if j is map<json> {
            json results = j["results"] ?: {};
            if results is map<json> {
                json bindingsJ = results["bindings"] ?: [];
                if bindingsJ is json[] {
                    Appliance[] out = [];
                    foreach json b in bindingsJ {
                        map<json> bm = <map<json>>b;
                        string id = "unknown-appliance";
                        string label = "Unknown Appliance";
                        string flex = "nonShiftable";
                        
                        // Extract appliance URI as ID
                        if bm.hasKey("appliance") {
                            map<json> applMap = <map<json>>bm["appliance"];
                            string applianceUri = <string>(applMap.get("value") ?: id);
                            // Extract the local name from the URI for a cleaner ID
                            int? hashIndex = applianceUri.lastIndexOf("#");
                            int? slashIndex = applianceUri.lastIndexOf("/");
                            int maxIndex = -1;
                            if hashIndex is int && slashIndex is int {
                                maxIndex = hashIndex > slashIndex ? hashIndex : slashIndex;
                            } else if hashIndex is int {
                                maxIndex = hashIndex;
                            } else if slashIndex is int {
                                maxIndex = slashIndex;
                            }
                            
                            if maxIndex >= 0 && maxIndex < applianceUri.length() - 1 {
                                id = applianceUri.substring(maxIndex + 1);
                                label = id.length() > 0 ? id : label;
                            } else {
                                id = applianceUri;
                                label = id;
                            }
                        }
                        
                        // Extract flexibility from profile
                        if bm.hasKey("flexibility") {
                            map<json> flexMap = <map<json>>bm["flexibility"];
                            flex = <string>(flexMap.get("value") ?: flex);
                        }
                        
                        out.push({ id, label, flexibility: flex });
                    }
                    if out.length() > 0 { return out; }
                }
            }
        }
        log:printWarn("Fuseki not reachable or empty; returning stub");
        return [{ id: "pump-1", label: "Well Pump", flexibility: "shiftable" }, { id: "ac-1", label: "Bedroom AC", flexibility: "thermalStorage" }];
    }

    resource function get healthz() returns string { return "ok"; }
}

