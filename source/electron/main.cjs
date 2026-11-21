const { app, BrowserWindow, ipcMain, protocol, net, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { networkInterfaces } = require('node:os');
const { createGroupServer } = require('./groups-server.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'gym',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.setName('FORM Gym');
nativeTheme.themeSource = 'dark';
if (process.env.GYM_DATA_DIR) app.setPath('userData', path.resolve(process.env.GYM_DATA_DIR));
let window;
let writeQueue = Promise.resolve();
let groupHost = null;
let groupHostStarting = null;
const groupEndpoints = (port) => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(
      (entry) =>
        entry &&
        entry.family === 'IPv4' &&
        !entry.internal &&
        !entry.address.startsWith('169.254.'),
    );
  return [...new Set(addresses.map((entry) => `http://${entry.address}:${port}`))];
};
const dataPath = () => path.join(app.getPath('userData'), 'training.json');
const allowed = (event) => event.sender === window?.webContents;

app.whenReady().then(async () => {
  protocol.handle('gym', (request) => {
    const requested = decodeURIComponent(new URL(request.url).pathname);
    const root = path.resolve(__dirname, '../dist');
    const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (file !== root && !file.startsWith(root + path.sep))
      return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  ipcMain.handle('store:read', async (event) => {
    if (!allowed(event)) throw new Error('Invalid sender');
    try {
      return await fs.readFile(dataPath(), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  });
  ipcMain.handle('store:write', async (event, value) => {
    if (!allowed(event) || typeof value !== 'string' || value.length > 8_000_000)
      throw new Error('Invalid backup');
    JSON.parse(value);
    const task = writeQueue
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(dataPath()), { recursive: true });
        const temp = dataPath() + '.tmp';
        await fs.writeFile(temp, value, 'utf8');
        await fs.rename(temp, dataPath());
      });
    writeQueue = task;
    await task;
  });
  ipcMain.handle('theme:appearance', (event, appearance) => {
    if (!allowed(event) || !['dark', 'light'].includes(appearance))
      throw new Error('Invalid appearance');
    nativeTheme.themeSource = appearance;
    window.setBackgroundColor(appearance === 'dark' ? '#101217' : '#f2f2f0');
  });
  ipcMain.handle('groups:host', async (event) => {
    if (!allowed(event)) throw new Error('Invalid sender');
    if (!groupHostStarting)
      groupHostStarting = (async () => {
        const service = createGroupServer({
          dataFile: path.join(app.getPath('userData'), 'groups-server.json'),
          host: '0.0.0.0',
          port: 47831,
          allowedOrigins: ['gym://app', 'https://localhost', 'http://localhost'],
        });
        const result = await service.start();
        groupHost = service;
        const port = result.port ?? 47831;
        const endpoints = groupEndpoints(port);
        return { endpoint: endpoints[0] ?? `http://127.0.0.1:${port}`, endpoints, port };
      })().catch((error) => {
        groupHostStarting = null;
        throw error;
      });
    return groupHostStarting;
  });
  let appearance = 'dark';
  try {
    const saved = JSON.parse(await fs.readFile(dataPath(), 'utf8'));
    if (saved.settings?.appearance === 'light') appearance = 'light';
  } catch {
    // Missing or invalid training data is handled by the app's recovery screen.
  }
  nativeTheme.themeSource = appearance;
  window = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 380,
    minHeight: 620,
    title: 'FORM · GYM app',
    backgroundColor: appearance === 'dark' ? '#101217' : '#f2f2f0',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../dist/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('gym://app/')) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.loadURL('gym://app/');
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (!app.readyToQuit) {
    event.preventDefault();
    Promise.allSettled([writeQueue, groupHost?.close()]).then(() => {
      app.readyToQuit = true;
      app.quit();
    });
  }
});
