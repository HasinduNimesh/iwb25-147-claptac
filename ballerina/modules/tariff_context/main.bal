import ballerina/http;
import ballerina/io;

public type TariffWindow record {
    string label;
    string startTime; // HH:mm
    string endTime;   // HH:mm
    decimal rateLKRPerKWh;
};

type TariffDoc record {
    TariffWindow[] windows;
};

configurable string tariffFile = "../data/tariffs.lk.json";

service /tariff on new http:Listener(8081) {
    resource function get windows() returns TariffWindow[]|error {
        // Load from JSON file path
        json j = check io:fileReadJson(tariffFile);
        TariffDoc doc = check j.cloneWithType(TariffDoc);
        if doc.windows.length() == 0 {
            return [{ label: "Peak", startTime: "18:30", endTime: "21:30", rateLKRPerKWh: 68.0 }];
        }
        return doc.windows;
    }
}
