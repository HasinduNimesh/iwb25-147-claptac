# Build and run the Ballerina package (starts all services defined in the package)
FROM ballerina/ballerina:2201.12.9 AS base
WORKDIR /app
# Ensure correct ownership so the ballerina user can write Dependencies.toml during build
USER root
COPY --chown=ballerina:ballerina . /app
USER ballerina

# Ensure Ballerina CLI is available on PATH at runtime
ENV PATH="/usr/lib/ballerina/bin:${PATH}"

# Build once at image build time for faster container startup
RUN rm -rf /app/target && bal build

# Expose commonly used service ports
EXPOSE 9080 9090 9091 8081 8082 8083 8084 8085 8090 8091 8092 8093 8094

# Run the built executable using Ballerina CLI (absolute path for this base image)
CMD ["/ballerina/runtime/bin/bal", "run", "target/bin/lww.jar"]