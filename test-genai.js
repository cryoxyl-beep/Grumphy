require('dotenv').config();
const { askPetQuestion } = require('./aiAnalyzer');
const { saveAlert, getRecentAlerts } = require('./alertsCache');

saveAlert({
    category: "ASSIGNMENT",
    summary: "Math HW 3",
    deadline: "Tomorrow 5 PM",
    groupName: "Class Group"
});

console.log("Recent alerts:", getRecentAlerts());

async function run() {
    console.log("Testing GenAI...");
    const ans = await askPetQuestion("Do I have any math assignments?");
    console.log("Pet Answer:", ans);
}

run();
