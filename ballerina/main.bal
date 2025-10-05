import ballerina/io;

public function main() {
	// Initialize persistence layer (create data directories)
	error? initResult = initPersistence();
	if initResult is error {
		io:println("Warning: Failed to initialize persistence: ", initResult.message());
	} else {
		io:println("✓ Persistence layer initialized");
	}
	
	// Services are started via their own listeners; no action needed here.
}
