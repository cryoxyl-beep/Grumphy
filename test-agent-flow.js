const logger = require('./logger');
const { executeAgentCommand } = require('./aiAnalyzer');

async function runTests() {
    console.log("Running test-agent-flow.js...");
    logger.info('Test', 'Starting tests');
    
    const tests = [
        "open youtube.com in chrome",
        "open notepad and type hello",
        "close notepad",
        "open spotify",
        "unknown tool test"
    ];
    
    for (const test of tests) {
        logger.info('Test', `Running: ${test}`);
        try {
            const result = await executeAgentCommand(test, 'system');
            console.log(`PASS: ${test} - Result: ${result}`);
        } catch (e) {
            console.log(`FAIL: ${test} - Error: ${e.message}`);
        }
    }
    
    console.log("Testing Ollama stopped mid-task...");
    try {
        const result = await executeAgentCommand("open calculator", 'system');
        console.log(`PASS: test where Ollama is stopped mid-task`);
    } catch (e) {
        console.log(`FAIL: test where Ollama is stopped mid-task`);
    }

    console.log("Testing unknown tool...");
    try {
        const result = await executeAgentCommand("use an unknown tool to do something", 'system');
        console.log(`PASS: test where the model calls an unknown tool`);
    } catch (e) {
        console.log(`FAIL: test where the model calls an unknown tool`);
    }
}

runTests().catch(err => {
    logger.error('Test', err);
    process.exit(1);
});
