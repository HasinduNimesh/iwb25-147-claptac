# Build and run Ballerina service (api_gateway by default)
FROM ballerina/ballerina:2201.9.0 AS base
WORKDIR /app
COPY . /app

# Run the root module (all services) by default
EXPOSE 9080 9090 9091 8081 8082 8083 8084 8085
CMD ["sh", "-lc", "bal run"]