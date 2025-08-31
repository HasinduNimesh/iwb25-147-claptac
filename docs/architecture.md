# EcoMeter Architecture

## Overview

EcoMeter is an ontology-driven energy advice platform for Sri Lanka, integrating Ballerina microservices, a triplestore (Fuseki), MQTT IoT ingest, and a web frontend.

### Key Components
- **Ontology (OWL)**: Models appliances, tariffs, time windows, weather, etc.
- **Ballerina Services**: Modular, typed, and observable. Includes IoT ingest, tariff context, ontology proxy, advice engine, API gateway, notifications.
- **Web App**: GraphQL client, mobile-first UI.
- **Deploy**: Docker Compose for local dev; k8s manifests optional.

## Diagram

```mermaid
graph TD
  MQTT[MQTT Broker] --> IOT[IoT Ingest Service]
  IOT --> DB[(DB)]
  API[API Gateway (GraphQL/REST)] -->|HTTP| ADVICE[Advice Engine]
  API -->|HTTP| TARIFF[Tariff Context]
  API -->|HTTP| ONTPROXY[Ontology Proxy]
  ONTPROXY -->|SPARQL| FUSEKI[Fuseki Triplestore]
  ADVICE -->|HTTP| ONTPROXY
  API -->|WS| NOTIFY[Notifications]
  API -->|GraphQL| WEB[Web App]
```

## Data Flow
1. IoT telemetry → MQTT → Ballerina → DB
2. User requests plan → API Gateway → Advice Engine → Ontology Proxy → Fuseki
3. Advice + explanations → Web app (GraphQL)
4. Notifications via WebSocket

## Extensibility
- Add new tariffs, appliances, or rules in ontology—no code change needed.
- Modular Ballerina services for easy scaling.
