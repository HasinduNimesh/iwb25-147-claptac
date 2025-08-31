# EcoMeter Ontology

This ontology models Sri Lankan appliances, tariffs, time-of-use windows, weather, solar, occupancy, and constraints for explainable energy advice.

## Core Classes
- Appliance
- LoadProfile
- TariffPlan
- TimeOfUseWindow
- EnergyEvent
- Recommendation
- WeatherCondition
- SolarForecast
- OccupancyEvent
- Premises
- Battery
- Constraint

## Example (Turtle)
```ttl
:WellPump a :Appliance ;
  :hasLoadProfile :PumpProfile ;
  :requiresMinDailyRuntime "30"^^xsd:int ;
  :maxDeferralMinutes "120"^^xsd:int ;
  :belongsTo :PremisesA .
```

## Usage
- Extend with new appliances, tariffs, or rules as needed.
- See `seed.ttl` for sample data and `queries/` for SPARQL examples.
