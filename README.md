# LankaWattWise

Ontology-driven energy advice for Sri Lanka, powered by Ballerina microservices.

## Features
- Sri Lanka-specific tariffs, appliances, and solar context
- Explainable AI: every recommendation cites ontology rules
- Works with smart plugs (MQTT) or manual entry
- Modular Ballerina services: IoT ingest, tariff context, ontology proxy, advice engine, API gateway, notifications
- GraphQL and REST APIs for web/mobile

## Quick Start
1. `cd deploy && docker-compose up` (starts Fuseki, MQTT, and API Gateway)
2. Run Ballerina modules from `ballerina/` for local dev
3. Web app: see `webapp/`

## Run UI + Services locally
1) Build the React UI
- Open a terminal in `webapp/` and run:
	- `npm install`
	- `npm run build`
- This produces `webapp/dist` which the UI gateway will serve.

2) Start Ballerina app
- From `ballerina/`, run `bal run`.
- The UI gateway listens on http://localhost:9080 and proxies:
	- POST /graphql and /gql → API Gateway (GraphQL)
	- GET  /tariff/windows → Tariff Context
	- GET  /ontology/appliances → Ontology Proxy
	- GET  /advice/plan → Advice Engine

3) Open the UI at http://localhost:9080
If backend services are offline, the UI falls back to mock data.

## Repo Structure
```
lankawattwise/
├─ ballerina/           # Ballerina services & modules
├─ ontology/            # OWL, seed data, SPARQL queries
├─ data/                # Tariffs, sample telemetry
├─ deploy/              # Docker Compose, k8s, env
├─ docs/                # Architecture, API, ontology docs
├─ webapp/              # Frontend (GraphQL client)
└─ README.md
```

## MVP Scope
- Ontology v0, Ballerina API skeletons, sample data, Docker Compose
- Extend with rules, optimizer, and UI as you go!
