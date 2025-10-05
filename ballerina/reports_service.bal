import ballerina/http;
import ballerina/time;

configurable int port_reports = 8094;

// Report types
public type MonthlyReport record {
    string userId;
    string month; // YYYY-MM
    decimal totalKWh;
    decimal totalCostLKR;
    decimal totalCO2Kg;
    decimal savingsLKR;
    int optimizationsAccepted;
    record {string window; decimal kwh; decimal cost;}[] breakdownByWindow;
    string generatedAt;
};

public type UsageHistory record {
    string date; // YYYY-MM-DD
    decimal kWh;
    decimal costLKR;
    decimal co2Kg;
};

// In-memory storage for demo (replace with database in production)
map<MonthlyReport[]> userReports = {};
map<UsageHistory[]> userHistory = {};

service /reports on new http:Listener(port_reports) {
    
    // Generate monthly report
    resource function post generate(string userId, string month) returns MonthlyReport|error {
        // Get user's tariff config
        http:Client configClient = check new("http://localhost:8090");
        json tariffResp = check configClient->get(string `/config/tariff?userId=${userId}`);
        
    // Get user's usage history for the month
    UsageHistory[]? _maybeHist = userHistory[userId];
    UsageHistory[] history = _maybeHist is UsageHistory[] ? _maybeHist : [];
        UsageHistory[] monthHistory = history.filter(h => h.date.startsWith(month));
        
        decimal totalKWh = 0.0;
        decimal totalCostLKR = 0.0;
        decimal totalCO2Kg = 0.0;
        
        foreach var entry in monthHistory {
            totalKWh += entry.kWh;
            totalCostLKR += entry.costLKR;
            totalCO2Kg += entry.co2Kg;
        }
        
        // Calculate breakdown by time window (TOU)
        record {string window; decimal kwh; decimal cost;}[] breakdown = [];
        if tariffResp is map<json> {
            json? windowsJson = tariffResp["windows"];
            if windowsJson is json[] {
                // Estimate distribution: 30% off-peak, 50% day, 20% peak
                decimal offPeakKWh = totalKWh * 0.30;
                decimal dayKWh = totalKWh * 0.50;
                decimal peakKWh = totalKWh * 0.20;
                
                breakdown = [
                    {window: "Off-Peak", kwh: offPeakKWh, cost: offPeakKWh * 16.5},
                    {window: "Day", kwh: dayKWh, cost: dayKWh * 38.0},
                    {window: "Peak", kwh: peakKWh, cost: peakKWh * 68.0}
                ];
            }
        }
        
        // Calculate estimated savings (10-15% from optimization)
        decimal savingsLKR = totalCostLKR * 0.12; // 12% average savings
        
        MonthlyReport report = {
            userId: userId,
            month: month,
            totalKWh: totalKWh,
            totalCostLKR: totalCostLKR,
            totalCO2Kg: totalCO2Kg,
            savingsLKR: savingsLKR,
            optimizationsAccepted: monthHistory.length(), // Approximate
            breakdownByWindow: breakdown,
            generatedAt: time:utcToString(time:utcNow())
        };
        
    // Store report
    MonthlyReport[]? _maybeReports = userReports[userId];
    MonthlyReport[] reports = _maybeReports is MonthlyReport[] ? _maybeReports : [];
        reports.push(report);
        userReports[userId] = reports;
        
        return report;
    }
    
    // Get report history (optional query param: ?limit=10)
    resource function get history(string userId, http:Request req) returns MonthlyReport[]|error {
    MonthlyReport[]? _maybe = userReports[userId];
    MonthlyReport[] reports = _maybe is MonthlyReport[] ? _maybe : [];
        int maxReports = reports.length();

        string? limitStr = req.getQueryParamValue("limit");
        if limitStr is string {
            int|error parsed = int:fromString(limitStr);
            if parsed is int {
                maxReports = parsed;
            }
        }

        // Return most recent reports
        if reports.length() > maxReports {
            return reports.slice(reports.length() - maxReports, reports.length());
        }
        return reports;
    }
    
    // Export report as CSV
    resource function get csv(string userId, string month) returns http:Response|error {
    MonthlyReport[]? _maybeCsv = userReports[userId];
    MonthlyReport[] reports = _maybeCsv is MonthlyReport[] ? _maybeCsv : [];
        MonthlyReport[] filtered = reports.filter(r => r.month == month);
        
        if filtered.length() == 0 {
            return error("Report not found for month: " + month);
        }
        
        MonthlyReport report = filtered[0];
        
        // Generate CSV content
        string csv = "LankaWattWise Monthly Report - " + month + "\n\n";
        csv += "User ID," + userId + "\n";
        csv += "Month," + report.month + "\n";
        csv += "Total Energy (kWh)," + report.totalKWh.toString() + "\n";
        csv += "Total Cost (LKR)," + report.totalCostLKR.toString() + "\n";
        csv += "Total CO2 (kg)," + report.totalCO2Kg.toString() + "\n";
        csv += "Estimated Savings (LKR)," + report.savingsLKR.toString() + "\n";
        csv += "Optimizations Accepted," + report.optimizationsAccepted.toString() + "\n\n";
        
        csv += "Breakdown by Time Window\n";
        csv += "Window,Energy (kWh),Cost (LKR)\n";
        foreach var item in report.breakdownByWindow {
            csv += item.window + "," + item.kwh.toString() + "," + item.cost.toString() + "\n";
        }
        
        csv += "\nGenerated At," + report.generatedAt + "\n";
        
        http:Response response = new;
        response.setTextPayload(csv);
        response.setHeader("Content-Type", "text/csv");
        response.setHeader("Content-Disposition", string `attachment; filename="lankawattwise_report_${month}.csv"`);
        
        return response;
    }
    
    // Export report as PDF (simplified HTML version for demo)
    resource function get pdf(string userId, string month) returns http:Response|error {
    MonthlyReport[]? _maybePdf = userReports[userId];
    MonthlyReport[] reports = _maybePdf is MonthlyReport[] ? _maybePdf : [];
        MonthlyReport[] filtered = reports.filter(r => r.month == month);
        
        if filtered.length() == 0 {
            return error("Report not found for month: " + month);
        }
        
        MonthlyReport report = filtered[0];
        
        // Generate HTML content (can be converted to PDF with external tool)
        string html = "<!DOCTYPE html><html><head><meta charset='UTF-8'>";
        html += "<title>LankaWattWise Report - " + month + "</title>";
        html += "<style>body{font-family:Arial,sans-serif;margin:40px;} ";
        html += "h1{color:#059669;} table{border-collapse:collapse;width:100%;margin:20px 0;} ";
        html += "th,td{border:1px solid #ddd;padding:12px;text-align:left;} ";
        html += "th{background:#059669;color:white;} .summary{background:#f0fdf4;padding:20px;border-radius:8px;margin:20px 0;}</style>";
        html += "</head><body>";
        
        html += "<h1>🌿 LankaWattWise Monthly Report</h1>";
        html += "<p><strong>User:</strong> " + userId + " | <strong>Month:</strong> " + report.month + "</p>";
        
        html += "<div class='summary'>";
        html += "<h2>Summary</h2>";
        html += "<p><strong>Total Energy Consumed:</strong> " + report.totalKWh.toString() + " kWh</p>";
        html += "<p><strong>Total Cost:</strong> LKR " + report.totalCostLKR.toString() + "</p>";
        html += "<p><strong>CO₂ Emissions:</strong> " + report.totalCO2Kg.toString() + " kg</p>";
        html += "<p><strong>Estimated Savings:</strong> LKR " + report.savingsLKR.toString() + "</p>";
        html += "<p><strong>Optimizations Accepted:</strong> " + report.optimizationsAccepted.toString() + "</p>";
        html += "</div>";
        
        html += "<h2>Breakdown by Time Window</h2>";
        html += "<table><thead><tr><th>Time Window</th><th>Energy (kWh)</th><th>Cost (LKR)</th></tr></thead><tbody>";
        foreach var item in report.breakdownByWindow {
            html += "<tr><td>" + item.window + "</td><td>" + item.kwh.toString() + "</td><td>" + item.cost.toString() + "</td></tr>";
        }
        html += "</tbody></table>";
        
        html += "<p style='margin-top:40px;color:#666;'><small>Generated at: " + report.generatedAt + "</small></p>";
        html += "<p style='color:#666;'><small>Ceylon Electricity Board (CEB) rates applied. Savings estimated based on load shifting optimization.</small></p>";
        html += "</body></html>";
        
        http:Response response = new;
        response.setTextPayload(html);
        response.setHeader("Content-Type", "text/html");
        response.setHeader("Content-Disposition", string `inline; filename="lankawattwise_report_${month}.html"`);
        
        return response;
    }
    
    // Log daily usage (called by telemetry)
    resource function post logUsage(string userId, string date, decimal kWh, decimal costLKR, decimal co2Kg) returns json|error {
        UsageHistory entry = {
            date: date,
            kWh: kWh,
            costLKR: costLKR,
            co2Kg: co2Kg
        };
        
    UsageHistory[]? _maybeUH = userHistory[userId];
    UsageHistory[] history = _maybeUH is UsageHistory[] ? _maybeUH : [];
        history.push(entry);
        userHistory[userId] = history;
        
        return {ok: true, message: "Usage logged successfully"};
    }
    
    // Get usage history (for charts)
    resource function get usage(string userId, string? startDate, string? endDate, int? days) returns UsageHistory[]|error {
    UsageHistory[]? _maybeH = userHistory[userId];
    UsageHistory[] history = _maybeH is UsageHistory[] ? _maybeH : [];
        
        if startDate is string && endDate is string {
            return history.filter(h => h.date >= startDate && h.date <= endDate);
        }
        
        if days is int {
            // Return last N days
            if history.length() > days {
                return history.slice(history.length() - days, history.length());
            }
        }
        
        return history;
    }
}