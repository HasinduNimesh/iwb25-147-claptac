import ballerina/http;
import ballerina/io;

configurable string gqlUrlBase = "http://localhost:9090";
configurable int port_ui = 9080;
final http:Client gqlClient = checkpanic new (gqlUrlBase);
// clients.bal provides: adviceClient, tariffClient, ontologyClient

// Local service clients
final http:Client configC = checkpanic new ("http://localhost:8090");
final http:Client billingC = checkpanic new ("http://localhost:8091");
final http:Client schedC = checkpanic new ("http://localhost:8092");
final http:Client authC = checkpanic new ("http://localhost:8087");

function renderIndex() returns http:Response|error {
  // Try dist build first; fallback to public during dev
  string|error htmlOrErr = io:fileReadString("../webapp/dist/index.html");
  string html = htmlOrErr is string ? htmlOrErr : check io:fileReadString("../webapp/public/index.html");
  http:Response res = new;
  res.setTextPayload(html, "text/html; charset=utf-8");
  return res;
}

service / on new http:Listener(port_ui) {
  // Serve root path '/'
  resource function get .() returns http:Response|error {
    return renderIndex();
  }

  // Catch-all for unknown GETs: handle /favicon.ico and SPA fallback
  resource function get [string...p]() returns http:Response|error {
    if p.length() == 1 && p[0] == "favicon.ico" {
      http:Response res = new;
      res.statusCode = 204;
      return res;
    }
    // For any other unknown path, return index.html (SPA)
    return renderIndex();
  }

  // Also serve '/index' for convenience
  resource function get index() returns http:Response|error {
    return renderIndex();
  }

  // Auth passthrough for production (so /auth/* works when UI is served by this gateway)
  resource function post auth/login(@http:Payload json body) returns json|error {
    http:Response r = check authC->post("/auth/login", body);
    return check r.getJsonPayload();
  }
  resource function post auth/signup(@http:Payload json body) returns json|error {
    http:Response r = check authC->post("/auth/signup", body);
    return check r.getJsonPayload();
  }
  resource function get auth/health() returns json|error {
    http:Response r = check authC->get("/auth/health");
    return check r.getJsonPayload();
  }

  resource function post gql(@http:Payload json body) returns json|error {
    http:Response r = check gqlClient->post("/graphql", body);
    json j = check r.getJsonPayload();
    return j;
  }

  // Support POST /graphql too (the React UI uses this path)
  resource function post graphql(@http:Payload json body) returns json|error {
    http:Response r = check gqlClient->post("/graphql", body);
    json j = check r.getJsonPayload();
    return j;
  }

  // Proxy REST endpoints used by the UI
  resource function get tariff/windows(string date) returns json|error {
    http:Response r = check tariffClient->get("/tariff/windows?date=" + date);
    return check r.getJsonPayload();
  }

  resource function get ontology/appliances(string userId) returns json|error {
    http:Response r = check ontologyClient->get("/ontology/appliances?userId=" + userId);
    return check r.getJsonPayload();
  }

  resource function get advice/plan(string userId, string date) returns json|error {
    http:Response r = check adviceClient->get("/advice/plan?userId=" + userId + "&date=" + date);
    return check r.getJsonPayload();
  }

  // Simple acks for UI actions (accept/dismiss recommendation)
  resource function post advice/accept(@http:Payload json body) returns json|error {
    // no-op; return ok=true to acknowledge
    return { ok: true };
  }
  resource function post advice/dismiss(@http:Payload json body) returns json|error {
    return { ok: true };
  }

  resource function post config/tariff(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/tariff?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/appliances(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/appliances?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/co2(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/co2?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/solar(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/solar?userId=${userId}`, body);
    return check r.getJsonPayload();
  }

  resource function get billing/preview(string userId, decimal monthlyKWh = 150) returns json|error {
    http:Response r = check billingC->get(string `/billing/preview?userId=${userId}&monthlyKWh=${monthlyKWh}`);
    return check r.getJsonPayload();
  }

  resource function get billing/projection(string userId, decimal eomKWh = 150) returns json|error {
    http:Response r = check billingC->get(string `/billing/projection?userId=${userId}&eomKWh=${eomKWh}`);
    return check r.getJsonPayload();
  }

  resource function post scheduler/optimize(@http:Payload json body) returns json|error {
    http:Response r = check schedC->post("/scheduler/optimize", body);
    return check r.getJsonPayload();
  }

  // New config model proxies
  resource function post config/plan(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/plan?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/devices(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/devices?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/tasks(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/tasks?userId=${userId}`, body);
    return check r.getJsonPayload();
  }
  resource function post config/co2model(string userId, @http:Payload json body) returns json|error {
    http:Response r = check configC->post(string `/config/co2model?userId=${userId}`, body);
    return check r.getJsonPayload();
  }

  // Serve static assets from Vite build output: /assets/*
  resource function get assets/[string... path]() returns http:Response|error {
    // join segments with '/'
    string joined = "";
    int i = 0;
    foreach string seg in path {
      joined = i == 0 ? seg : string `${joined}/${seg}`;
      i += 1;
    }
    string rel = string `../webapp/dist/assets/${joined}`;
    byte[] bytes = check io:fileReadBytes(rel);
    http:Response res = new;
    // naive content-type based on extension
    if rel.endsWith(".js") { res.setHeader("Content-Type", "application/javascript"); }
    else if rel.endsWith(".css") { res.setHeader("Content-Type", "text/css"); }
    else if rel.endsWith(".svg") { res.setHeader("Content-Type", "image/svg+xml"); }
    else if rel.endsWith(".png") { res.setHeader("Content-Type", "image/png"); }
    else if rel.endsWith(".jpg") || rel.endsWith(".jpeg") { res.setHeader("Content-Type", "image/jpeg"); }
    res.setBinaryPayload(bytes);
    return res;
  }

  
}
