import ballerina/http;
import ballerina/log;

public type Appliance record {
    string id;
    string label;
    string flexibility; // shiftable | thermalStorage | nonShiftable
};

public type RecommendationExplanation record {
    string recId;
    string appliance;
    string[] reasons;
    string[] ontologyRules;
};

configurable string fusekiBaseUrl = "http://localhost:3030/lww";
final http:Client fusekiClient = check new (fusekiBaseUrl);

// Execute SPARQL query against Fuseki
function querySPARQL(string sparqlQuery) returns json|error {
    http:Request req = new;
    req.setPayload(sparqlQuery);
    req.setHeader("Content-Type", "application/sparql-query");
    req.setHeader("Accept", "application/sparql-results+json");
    
    http:Response response = check fusekiClient->post("/query", req);
    return check response.getJsonPayload();
}

service /ontology on new http:Listener(8082) {
    
    // Get appliances from ontology with SPARQL
    resource function get appliances(string userId) returns Appliance[]|error {
        string query = string `
            PREFIX : <http://lankawattwise.org/ontology#>
            SELECT ?appliance ?label ?flexibility WHERE {
                ?appliance a :Appliance ;
                          :hasLabel ?label ;
                          :hasLoadProfile ?profile .
                ?profile :hasFlexibility ?flexibility .
            }
        `;
        
        do {
            json result = check querySPARQL(query);
            // Parse SPARQL JSON results
            json bindings = check result.results.bindings;
            if bindings is json[] {
                Appliance[] appliances = [];
                foreach json binding in bindings {
                    string id = check binding.appliance.value;
                    string label = check binding.label.value;
                    string flexibility = check binding.flexibility.value;
                    // Extract ID from URI (e.g., http://example.org#pump-1 -> pump-1)
                    string[] parts = re `#`.split(id);
                    string shortId = parts.length() > 1 ? parts[1] : id;
                    appliances.push({ id: shortId, label: label, flexibility: flexibility });
                }
                if appliances.length() > 0 {
                    return appliances;
                }
            }
        } on fail var e {
            log:printWarn(string `SPARQL query failed, using fallback: ${e.message()}`);
        }
        
        // Fallback to static data if SPARQL fails
        return [
            { id: "pump-1", label: "Well Pump", flexibility: "shiftable" },
            { id: "ac-1", label: "Bedroom AC", flexibility: "thermalStorage" },
            { id: "washer", label: "Washing Machine", flexibility: "shiftable" }
        ];
    }
    
    // Get recommendation explanations from ontology
    resource function get explanation(string recId) returns RecommendationExplanation|error {
        string query = string `
            PREFIX : <http://lankawattwise.org/ontology#>
            SELECT ?rec ?appliance ?reason ?rule WHERE {
                ?rec a :Recommendation ;
                     :recId "${recId}" ;
                     :forAppliance ?appliance ;
                     :justifiedBy ?reason .
                OPTIONAL { ?reason :ruleId ?rule }
            }
        `;
        
        do {
            json result = check querySPARQL(query);
            json bindings = check result.results.bindings;
            if bindings is json[] && bindings.length() > 0 {
                string[] reasons = [];
                string[] rules = [];
                string appliance = "";
                
                foreach json binding in bindings {
                    appliance = check binding.appliance.value;
                    string reason = check binding.reason.value;
                    reasons.push(reason);
                    
                    json|error ruleJson = binding.rule;
                    if ruleJson is json {
                        json|error ruleValue = ruleJson.value;
                        if ruleValue is json {
                            string rule = ruleValue.toString();
                            rules.push(rule);
                        }
                    }
                }
                
                return { recId: recId, appliance: appliance, reasons: reasons, ontologyRules: rules };
            }
        } on fail var e {
            log:printWarn(string `SPARQL explanation query failed: ${e.message()}`);
        }
        
        // Return fallback explanation
        return {
            recId: recId,
            appliance: "Unknown",
            reasons: ["Optimized for cost savings", "Off-peak time slot"],
            ontologyRules: ["Rule:MinRuntime", "Rule:OffPeakPreference"]
        };
    }
    
    // Load SPARQL query from file
    resource function post query(@http:Payload string sparqlQuery) returns json|error {
        return check querySPARQL(sparqlQuery);
    }
}
