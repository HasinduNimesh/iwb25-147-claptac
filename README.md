# LankaWatteWise

Ontology‑driven energy advice for Sri Lanka, powered by Ballerina microservices with a React web app.

## What’s included
- Sri Lanka‑specific tariffs, appliances, and solar context
- Explainable advice (each recommendation can cite ontology rules)
- MQTT ingest (smart plugs) or manual usage
- Modular Ballerina services: IoT ingest, tariff context, ontology proxy, advice engine, API gateway, notifications, config, billing, scheduler, auth, UI gateway
- GraphQL + REST APIs, plus a modern React UI (Vite)

## Services and ports
- UI gateway: http://localhost:9080
- GraphQL API: http://localhost:9090 (health: http://localhost:9091/healthz)
- Auth service: http://localhost:8087 (health: http://localhost:8087/auth/health)
- Config service: http://localhost:8090
- Tariff: 8081, Ontology: 8082, Advice: 8083, Billing: 8091, Scheduler: 8092
- Dependencies: Fuseki (SPARQL) on 3030, MQTT on 1883 (via Docker Compose)

## Prerequisites
- Windows PowerShell or your shell of choice
- Docker Desktop
- Node.js 18+ and npm
- Ballerina (Swan Lake)

## Quick start (developer workflow)
1) Start dependencies (Fuseki, MQTT)
```powershell
Set-Location -Path .\deploy
docker compose up -d fuseki mqtt
docker compose up -d
```

2) Start backend (all Ballerina services in one process)
```powershell
Set-Location -Path .\ballerina
bal run
# keep this terminal open (foreground)
```
Verify health in another terminal (optional):
```powershell
(Invoke-WebRequest -UseBasicParsing http://localhost:8087/auth/health).Content
(Invoke-WebRequest -UseBasicParsing http://localhost:9091/healthz).Content
(Invoke-WebRequest -UseBasicParsing http://localhost:9080/).StatusCode
```

3) Start the web app (Vite dev server with proxy)
```powershell
Set-Location -Path .\webapp
npm install
npm run dev
# open http://localhost:5173
```
- Dev proxy (from `vite.config.js`) routes API calls to backend:
	- /graphql, /gql, /tariff, /ontology, /advice, /config, /billing, /scheduler -> http://localhost:9080
	- /auth -> http://localhost:8087

4) First‑run flow
- Sign up, then log in.
- After login, the HomeEnergy Coach wizard will collect tariff, appliances, CO₂ model, and solar.

## Alternative: serve built UI from the UI gateway
If you prefer not to run Vite:
```powershell
Set-Location -Path .\webapp
npm install
npm run build   # outputs to webapp/dist

Set-Location -Path ..\ballerina
bal run         # keep running
# then visit http://localhost:9080
```

## Troubleshooting
- Login/network errors (ECONNREFUSED):
	- Ensure the Ballerina process is running in the foreground and stays open (`bal run`).
	- Check health: http://localhost:8087/auth/health, http://localhost:9091/healthz, and UI gateway at http://localhost:9080/.
	- Confirm no other app is using these ports; restart if needed.
	- Firewall/VPN can block localhost ports; temporarily disable or allow.
- White screen after login: refresh. The UI includes an error boundary and verified hook order. If it persists, stop Vite and re‑start `npm run dev`.
- Fuseki/MQTT missing: re‑run `docker compose up -d fuseki mqtt` in `deploy/`.

## Repo structure
```
lankawattwise/
├─ ballerina/           # Ballerina services & modules (run with `bal run`)
├─ ontology/            # OWL, seed data, SPARQL queries
├─ data/                # Tariffs, sample telemetry
├─ deploy/              # Docker Compose, k8s, env
├─ docs/                # Architecture, API, ontology docs
├─ webapp/              # React app (Vite); dev at :5173, build to dist/
└─ README.md
```

## Notes
- GraphQL is available via the UI gateway at `/graphql` (or `/gql`).
- The UI gateway also proxies REST endpoints under `/tariff`, `/ontology`, `/advice`, `/config`, `/billing`, `/scheduler`.
- Auth endpoints are under `/auth` and are proxied in dev directly to the auth service.

