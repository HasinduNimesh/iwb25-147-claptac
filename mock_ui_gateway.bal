import ballerina/http;

configurable int port_ui = 9080;

// Simple mock responses for now
service / on new http:Listener(port_ui) {
    resource function get ontology/appliances(string userId) returns json|error {
        // Return the real appliance data structure that matches our ontology
        return [
            { "id": "WellPump", "label": "Well Pump", "flexibility": "shiftable" },
            { "id": "WashingMachine", "label": "Washing Machine", "flexibility": "shiftable" },
            { "id": "BedroomAC", "label": "Bedroom AC", "flexibility": "thermalStorage" }
        ];
    }

    resource function get tariff/windows(string date) returns json|error {
        return {
            "windows": [
                { "name": "Peak", "startTime": "18:30", "endTime": "22:30", "rateLKR": 70 },
                { "name": "Day", "startTime": "05:30", "endTime": "18:30", "rateLKR": 45 },
                { "name": "Off-Peak", "startTime": "22:30", "endTime": "05:30", "rateLKR": 25 }
            ]
        };
    }

    resource function post graphql(@http:Payload json body) returns json|error {
        // Simple GraphQL mock
        return {
            "data": {
                "currentPlan": [
                    {
                        "id": "rec-1",
                        "applianceId": "WellPump",
                        "suggestedStart": "2025-08-31T21:00:00",
                        "durationMinutes": 30,
                        "reasons": ["Rule:MinRuntime30", "Window:OffPeak_21_00_05_30"],
                        "estSavingLKR": 58
                    },
                    {
                        "id": "rec-2",
                        "applianceId": "WashingMachine",
                        "suggestedStart": "2025-08-31T21:30:00",
                        "durationMinutes": 60,
                        "reasons": ["Constraint:Shiftable", "Avoid:Peak"],
                        "estSavingLKR": 112
                    }
                ]
            }
        };
    }

    resource function post advice/accept(@http:Payload json body) returns json|error {
        return { "ok": true };
    }

    resource function post advice/dismiss(@http:Payload json body) returns json|error {
        return { "ok": true };
    }

    resource function get healthz() returns string { 
        return "UI Gateway Mock Running"; 
    }
}

public function main() {
    // Service started via listener
}
