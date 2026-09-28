const fs = require('fs');
['petManager.js', 'spatialTracker.js', 'systemTools.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/catch\s*\([_\w]*\)\s*\{\}/g, `catch (err) { require('./logger').error('${file}', err.message); }`);
    fs.writeFileSync(file, code);
});
console.log('Fixed catches');
