import ballerina/http;

public type NotifyMsg record {
    string id;
    string text;
};

configurable int port_notify = 8084;

service /notify on new http:Listener(port_notify) {
    resource function get ping() returns string { return "pong"; }
    resource function get healthz() returns string { return "ok"; }
}
