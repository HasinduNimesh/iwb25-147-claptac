import ballerina/http;

public type BillPreview record {
    decimal estimatedKWh;
    decimal estimatedCostLKR;
    string note?;
};

configurable int port_billing = 8091;
service /billing on new http:Listener(port_billing) {
    function computePreview(string userId, decimal monthlyKWh) returns BillPreview|error {
        // Prefer TariffPlan if available
        TariffPlan? plan = getPlan(userId);
        if plan is TariffPlan {
            TOUPlan? maybeTou = plan?.tou;
            if maybeTou is TOUPlan {
                TOUPlan tp = maybeTou;
                decimal avg = 0.0; int n = 0;
                foreach var b in tp.bands { avg += b.rate; n += 1; }
                decimal rate = n > 0 ? avg / n : 45.0;
                return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * rate) / <decimal>1000.0 + tp.fixed, note: "TOU avg(rate)+fixed" };
            } else {
                BlockPlan bp = plan?.block ?: { thresholds: [30,60,90,120,180], rates: [] };
                // Copy and sort rates by fromKWh
                BlockRate[] rates = [];
                foreach var r0 in bp.rates { rates.push(r0); }
                // Simple selection sort
                int len = rates.length();
                int i = 0;
                while i < len {
                    int minIdx = i;
                    int j = i + 1;
                    while j < len {
                        if rates[j].fromKWh < rates[minIdx].fromKWh { minIdx = j; }
                        j += 1;
                    }
                    if minIdx != i {
                        BlockRate tmp = rates[i];
                        rates[i] = rates[minIdx];
                        rates[minIdx] = tmp;
                    }
                    i += 1;
                }
                decimal energy = monthlyKWh;
                decimal cost = 0.0;
                int prev = 0;
                BlockRate? lastRate = ();
                foreach var r in rates {
                    int upper = r.toKWh ?: 1000000;
                    int span = upper - prev;
                    if span < 0 { span = 0; }
                    decimal spanD = <decimal>span;
                    decimal inBand = energy > spanD ? spanD : energy;
                    if inBand < <decimal>0 { inBand = <decimal>0; }
                    cost += (inBand * r.rate) / <decimal>1000.0;
                    energy -= inBand;
                    prev = upper;
                    lastRate = r;
                    if energy <= <decimal>0 { break; }
                }
                decimal fixed = 0.0;
                if lastRate is BlockRate { fixed = lastRate.fixedIfFinalSlab; }
                return { estimatedKWh: monthlyKWh, estimatedCostLKR: cost + fixed, note: "BLOCK tiered+final fixed" };
            }
        }
        // Fallback to legacy tariff config
        TariffConfig? t = getTariff(userId);
        if t is TariffConfig {
            if t.tariffType == "TOU" {
                decimal avg = 0.0; int n = 0;
                TOUWindow[] ws = (t?.windows ?: []);
                foreach var w in ws { avg += w.rateLKR; n += 1; }
        decimal rate = n > 0 ? avg / n : 50.0;
        return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * rate) / <decimal>1000.0, note: "TOU average rate used" };
            } else {
                decimal rate = 50.0;
                BlockBand[] bs = (t?.blocks ?: []);
                foreach var b in bs { rate = b.rateLKR; }
        return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * rate) / <decimal>1000.0, note: "Block highest band rate used" };
            }
        }
    return { estimatedKWh: monthlyKWh, estimatedCostLKR: (monthlyKWh * 45.0) / <decimal>1000.0, note: "No tariff set; default rate" };
    }

    resource function get preview(string userId, decimal monthlyKWh = 150) returns BillPreview|error {
    return check self.computePreview(userId, monthlyKWh);
    }

    resource function get projection(string userId, decimal eomKWh = 150) returns MonthlyProjection|error {
        CO2Model cm = getCO2Model(userId);
        decimal ef = cm.modelType == "CONSTANT" ? (cm.value ?: 0.53) : 0.53;
        decimal totalCO2 = eomKWh * ef / 1.0; // kg for month
    BillPreview bp = check self.computePreview(userId, eomKWh);
        decimal trees = (totalCO2 * 12.0) / 22.0;
        return { totalKWh: eomKWh, totalCostRs: bp.estimatedCostLKR, totalCO2Kg: totalCO2, treesRequired: trees };
    }
}
