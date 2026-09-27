const fs = require('fs');
const path = require('path');

const cacheFile = path.join(__dirname, 'alerts-cache.json');

function getRecentAlerts() {
    try {
        if (!fs.existsSync(cacheFile)) {
            return [];
        }
        const data = fs.readFileSync(cacheFile, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading alerts cache:', e);
        return [];
    }
}

function saveAlert(alertData) {
    try {
        let alerts = getRecentAlerts();
        
        const newAlert = {
            timestamp: new Date().toISOString(),
            category: alertData.category,
            summary: alertData.summary,
            deadline: alertData.deadline,
            groupName: alertData.groupName
        };

        alerts.push(newAlert);
        
        if (alerts.length > 25) {
            alerts = alerts.slice(-25);
        }

        fs.writeFileSync(cacheFile, JSON.stringify(alerts, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving alert to cache:', e);
    }
}

module.exports = {
    saveAlert,
    getRecentAlerts
};
