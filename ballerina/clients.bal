import ballerina/http;

configurable string advice_baseUrl = "http://localhost:8083";
configurable string tariff_baseUrl = "http://localhost:8081";
configurable string ontology_baseUrl = "http://localhost:8082";

public final http:Client adviceClient = checkpanic new (advice_baseUrl);
public final http:Client tariffClient = checkpanic new (tariff_baseUrl);
public final http:Client ontologyClient = checkpanic new (ontology_baseUrl);
