# Build and run the Ballerina package (starts all services defined in the package)
FROM ballerina/ballerina:2201.9.0 AS base
WORKDIR /app
COPY . /app

# Build once at image build time for faster container startup
RUN rm -rf /app/target && bal build

# Expose commonly used service ports
EXPOSE 9080 9090 9091 8081 8082 8083 8084 8085 8090 8091 8092

# Run the built executable JAR (bal run on a jar uses java -jar internally)
CMD ["sh", "-lc", "bal run ./target/bin/lww.jar"]