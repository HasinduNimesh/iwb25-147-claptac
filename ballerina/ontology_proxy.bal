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
        // Query Fuseki SPARQL endpoint using application/x-www-form-urlencoded and Accept JSON
        string query = "SELECT ?id ?label ?flex WHERE { ?s a <http://example.org/Appliance> ; <http://www.w3.org/2000/01/rdf-schema#label> ?label ; <http://example.org/flexibility> ?flex . BIND(?s AS ?id) } LIMIT 5";
        http:Request req = new;
        req.setHeader("Accept", "application/sparql-results+json");
        req.setHeader("Content-Type", "application/x-www-form-urlencoded");
        string encoded = check url:encode(query, "UTF-8");
        req.setTextPayload(string `query=${encoded}`);
        json j;
        // Use try-catch to avoid bubbling transport errors
        do {
            http:Response httpResp = check fuseki->post("/query", req);
            j = check httpResp.getJsonPayload();
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
                        string id = "pump-1";
                        string label = "Well Pump";
                        string flex = "shiftable";
                        if bm.hasKey("id") {
                            map<json> im = <map<json>>bm["id"];
                            id = <string>(im.get("value") ?: id);
                        }
                        if bm.hasKey("label") {
                            map<json> lm = <map<json>>bm["label"];
                            label = <string>(lm.get("value") ?: label);
                        }
                        if bm.hasKey("flex") {
                            map<json> fm = <map<json>>bm["flex"];
                            flex = <string>(fm.get("value") ?: flex);
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

