const {app, BrowserWindow, Menu} = require('electron');
app.whenReady().then(() => {
  let win = new BrowserWindow({width:300, height:300, frame: false, webPreferences: {nodeIntegration: true, contextIsolation: false}});
  win.loadURL('data:text/html,<div style="-webkit-app-region:drag; width:100%; height:100%; background:red;">Drag me</div>');
  win.hookWindowMessage(0x00A5, (w, l) => {
    console.log('WM_NCRBUTTONUP');
    Menu.buildFromTemplate([{label: 'Test'}]).popup();
  });
  win.hookWindowMessage(0x007B, (w, l) => {
    console.log('WM_CONTEXTMENU');
    return true; // prevent system menu
  });
  setTimeout(() => app.quit(), 3000);
});
