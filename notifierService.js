const notifier = require('node-notifier');

/**
 * Sends a desktop notification and prints a terminal banner.
 */
async function sendAcademicNotification({ category, summary, deadline, urgency, groupName }) {
    const title = `🚨 [${category || 'ACADEMIC ALERT'}] - ${groupName || 'College Group'}`;
    const message = `📌 ${summary}\n⏰ Due: ${deadline || 'N/A'}\n⚡ Urgency: ${urgency || 'MEDIUM'}`;
    const sound = (urgency === 'HIGH' || urgency === 'MEDIUM');

    // 1. Print visual terminal banner
    const border = "============================================================";
    console.log(`\n\x1b[36m${border}\x1b[0m`);
    console.log(`\x1b[1m\x1b[33m${title}\x1b[0m`);
    console.log(`\x1b[36m${border}\x1b[0m`);
    console.log(`\x1b[37m${message}\x1b[0m`);
    console.log(`\x1b[36m${border}\x1b[0m\n`);

    // 2. Dispatch desktop notification
    try {
        notifier.notify({
            title: title,
            message: message,
            sound: sound,
            wait: false,
            appID: 'Academic WhatsApp Monitor'
        }, (err, response, metadata) => {
            if (err) {
                console.error("Desktop notification failed to send (soft error):", err.message);
            }
        });
    } catch (error) {
        console.error("Error dispatching desktop notification:", error.message);
        // Fail gracefully to ensure background loop continues
    }
}

module.exports = {
    sendAcademicNotification
};
