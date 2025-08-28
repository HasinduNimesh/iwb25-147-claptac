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

configurable string tariff_file = "../data/tariffs.lk.json";
configurable int port_tariff = 8081;
configurable string timezone = "Asia/Colombo"; // use Asia/Colombo in time ops

service /tariff on new http:Listener(port_tariff) {
    resource function get windows() returns TariffWindow[]|error {
    json j = check io:fileReadJson(tariff_file);
        TariffDoc doc = check j.cloneWithType(TariffDoc);
        if doc.windows.length() == 0 {
            return [{ label: "Peak", startTime: "18:30", endTime: "21:30", rateLKRPerKWh: 68.0 }];
        }
        return doc.windows;
    }

    resource function get healthz() returns string { return "ok"; }
}
