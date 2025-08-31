import ballerina/http;

public type BillPreview record {
    decimal estimatedKWh;
    decimal estimatedCostLKR;
    string note?;
};

public type BlockWarning record {
    boolean willCross;
    decimal deltaFixed;
    decimal deltaMarginal;
    int nextThresholdKWh?;
    decimal costBefore?;
    decimal costAfter?;
};

configurable int port_billing = 8091;
service /billing on new http:Listener(port_billing) {
    // Helper to compute tiered cost for a BlockPlan-like structure
    function computeBlockCost(BlockPlan bp, decimal monthlyKWh) returns [decimal, decimal, int] {
        // Clone & sort rates by fromKWh
        BlockRate[] rates = [];
        foreach var r0 in bp.rates { rates.push(r0); }
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
        int nextThreshold = 2147483647; // large sentinel
        foreach var r in rates {
            int upper = r.toKWh ?: 1000000;
            int span = upper - prev; if span < 0 { span = 0; }
            decimal spanD = <decimal>span;
            decimal inBand = energy > spanD ? spanD : energy;
            if inBand < <decimal>0 { inBand = <decimal>0; }
            cost += (inBand * r.rate) / <decimal>1000.0;
            // Determine next threshold only once: first upper > monthlyKWh
            if nextThreshold == 2147483647 && <decimal>upper > monthlyKWh { nextThreshold = upper; }
            energy -= inBand;
            prev = upper;
            lastRate = r;
            if energy <= <decimal>0 { break; }
        }
        decimal fixed = 0.0;
        if lastRate is BlockRate { fixed = lastRate.fixedIfFinalSlab; }
        return [cost, fixed, nextThreshold == 2147483647 ? prev : nextThreshold];
    }
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

    // Warn when a task (kWh) will push a BLOCK user across a threshold
    resource function get blockwarning(string userId, decimal currentKWh, decimal taskKWh) returns BlockWarning|error {
        // Prefer modern TariffPlan.block
        TariffPlan? plan = getPlan(userId);
        if plan is TariffPlan {
            BlockPlan? maybe = plan?.block;
            if maybe is BlockPlan {
                BlockPlan bp = maybe;
                var cur = self.computeBlockCost(bp, currentKWh);
                decimal cCost = cur[0];
                decimal cFix = cur[1];
                int nextTh = cur[2];
                var aft = self.computeBlockCost(bp, currentKWh + taskKWh);
                decimal aCost = aft[0];
                decimal aFix = aft[1];
                boolean cross = (currentKWh < <decimal>nextTh) && ((currentKWh + taskKWh) >= <decimal>nextTh);
                decimal deltaF = aFix - cFix;
                decimal deltaM = (aCost - cCost);
                return { willCross: cross, deltaFixed: deltaF, deltaMarginal: deltaM, nextThresholdKWh: nextTh, costBefore: cCost + cFix, costAfter: aCost + aFix };
            }
        }
        // Fallback to legacy BlockBand config
        TariffConfig? tcfg = getTariff(userId);
        if tcfg is TariffConfig && tcfg.tariffType == "BLOCK" {
            BlockBand[] bs = (tcfg?.blocks ?: []);
            // Convert to a pseudo BlockPlan
            BlockRate[] rs = [];
            int startKWh = 0;
            foreach var b in bs {
                rs.push({ fromKWh: startKWh, toKWh: b.uptoKWh, rate: b.rateLKR, fixedIfFinalSlab: 0.0 });
                startKWh = b.uptoKWh;
            }
            BlockPlan bp = { thresholds: [], rates: rs };
            var cur2 = self.computeBlockCost(bp, currentKWh);
            decimal cCost2 = cur2[0];
            int nextTh2 = cur2[2];
            var aft2 = self.computeBlockCost(bp, currentKWh + taskKWh);
            decimal aCost2 = aft2[0];
            boolean cross2 = (currentKWh < <decimal>nextTh2) && ((currentKWh + taskKWh) >= <decimal>nextTh2);
            return { willCross: cross2, deltaFixed: 0.0, deltaMarginal: (aCost2 - cCost2), nextThresholdKWh: nextTh2, costBefore: cCost2, costAfter: aCost2 };
        }
        // Not a block user -> no crossing relevance
        return { willCross: false, deltaFixed: 0.0, deltaMarginal: 0.0 };
    }
}
