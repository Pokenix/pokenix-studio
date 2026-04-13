"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = require("node:fs");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_module_1 = require("node:module");
const node_child_process_1 = require("node:child_process");
const node_https_1 = __importDefault(require("node:https"));
const electron_updater_1 = require("electron-updater");
const runtime_config_1 = require("./runtime-config");
electron_1.app.setName("Pokenix Studio");
let mainWindow = null;
let tray = null;
let isQuitting = false;
let updateProgressWindow = null;
let manualUpdateCheckRequested = false;
let promptedDownloadedUpdateVersion = null;
const moduleWindows = new Map();
const utilityWatchers = new Map();
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const forceCloseWindowIds = new Set();
const notepadDirtyState = new Map();
const LOG_FILE_NAME = "pxs_logs.log";
const LOG_FILE_MAX_SIZE = 15 * 1024 * 1024;
const PLUGIN_PERMISSION_RULES = {
    ui: {
        safe: true,
        description: "Show interface elements inside the plugin window."
    },
    storage: {
        safe: true,
        description: "Read and save the plugin's own local data."
    },
    clipboard: {
        safe: true,
        description: "Copy data to and read data from the clipboard."
    },
    notifications: {
        safe: true,
        description: "Show in-app notifications."
    },
    filesystem: {
        safe: false,
        description: "Read, write, create, move, or delete files and folders on this computer."
    },
    network: {
        safe: false,
        description: "Send or receive data over the internet or a local network."
    },
    process: {
        safe: false,
        description: "Start or control system processes."
    },
    native_modules: {
        safe: false,
        description: "Load advanced or native modules with deeper system access."
    },
    external_links: {
        safe: false,
        description: "Open links or other content outside Pokenix Studio."
    }
};
const defaultSettings = {
    startWithSystem: false,
    startMinimized: false,
    closeToTray: true,
    darkTheme: true,
    openNewTabs: true,
    developerMode: false
};
let settingsStore;
let notesStore;
let todosStore;
let counterStore;
let timerAlarmStore;
let windowStateStore;
let pluginStore;
async function movePathIfNeeded(oldPath, newPath) {
    try {
        await promises_1.default.access(newPath);
        return;
    }
    catch { }
    try {
        await promises_1.default.access(oldPath);
    }
    catch {
        return;
    }
    await promises_1.default.mkdir(node_path_1.default.dirname(newPath), { recursive: true });
    await promises_1.default.rename(oldPath, newPath);
}
async function migrateAppDataLayout() {
    const rootDirectory = getConfigDirectory();
    const settingsDirectory = getSettingsDirectory();
    const dataDirectory = getDataDirectory();
    const logsDirectory = getLogsDirectory();
    const runtimeDirectory = getPluginRuntimeRootDirectory();
    await promises_1.default.mkdir(settingsDirectory, { recursive: true });
    await promises_1.default.mkdir(dataDirectory, { recursive: true });
    await promises_1.default.mkdir(logsDirectory, { recursive: true });
    const migrations = [
        {
            oldPath: node_path_1.default.join(rootDirectory, "config.json"),
            newPath: node_path_1.default.join(settingsDirectory, "config.json")
        },
        {
            oldPath: node_path_1.default.join(rootDirectory, "window-state.json"),
            newPath: node_path_1.default.join(settingsDirectory, "window-state.json")
        },
        {
            oldPath: node_path_1.default.join(rootDirectory, "plugins.json"),
            newPath: node_path_1.default.join(settingsDirectory, "plugins.json")
        },
        {
            oldPath: node_path_1.default.join(rootDirectory, "notes.json"),
            newPath: node_path_1.default.join(dataDirectory, "notes.json")
        },
        {
            oldPath: node_path_1.default.join(rootDirectory, "todos.json"),
            newPath: node_path_1.default.join(dataDirectory, "todos.json")
        },
        {
            oldPath: node_path_1.default.join(rootDirectory, "plugin-runtime"),
            newPath: runtimeDirectory
        }
    ];
    for (const migration of migrations) {
        await movePathIfNeeded(migration.oldPath, migration.newPath);
    }
}
async function initStores() {
    const { default: Store } = await import("electron-store");
    await migrateAppDataLayout();
    settingsStore = new Store({
        cwd: getSettingsDirectory(),
        name: "config",
        defaults: defaultSettings
    });
    notesStore = new Store({
        cwd: getDataDirectory(),
        name: "notes",
        defaults: {
            notepadContent: "",
            notepadFilePath: ""
        }
    });
    todosStore = new Store({
        cwd: getDataDirectory(),
        name: "todos",
        defaults: {
            items: [],
            moveCompletedToBottom: true
        }
    });
    counterStore = new Store({
        cwd: getDataDirectory(),
        name: "counter",
        defaults: {
            currentValue: 0,
            history: []
        }
    });
    timerAlarmStore = new Store({
        cwd: getDataDirectory(),
        name: "timer-alarm",
        defaults: {
            elapsed: 0,
            laps: [],
            countdownRemaining: 0,
            alarms: []
        }
    });
    pluginStore = new Store({
        cwd: getSettingsDirectory(),
        name: "plugins",
        defaults: {
            pluginsEnabled: false,
            disabledPluginIds: [],
            approvedUnsafePermissions: {}
        }
    });
    windowStateStore = new Store({
        cwd: getSettingsDirectory(),
        name: "window-state",
        defaults: {
            main: {
                width: 1200,
                height: 800
            },
            notepad: {
                width: 1000,
                height: 700
            },
            plugin: {
                width: 1000,
                height: 700
            }
        }
    });
}
function getSettings() {
    return {
        startWithSystem: settingsStore.get("startWithSystem"),
        startMinimized: settingsStore.get("startMinimized"),
        closeToTray: settingsStore.get("closeToTray"),
        darkTheme: settingsStore.get("darkTheme"),
        openNewTabs: settingsStore.get("openNewTabs"),
        developerMode: settingsStore.get("developerMode")
    };
}
function updateLoginItemSettings() {
    if (isDev)
        return;
    try {
        const openAtLogin = settingsStore.get("startWithSystem");
        const openAsHidden = openAtLogin && settingsStore.get("startMinimized");
        if (process.platform === "win32") {
            electron_1.app.setLoginItemSettings({
                openAtLogin,
                openAsHidden,
                path: process.execPath,
                args: openAsHidden ? ["--pxs-start-minimized"] : []
            });
            return;
        }
        electron_1.app.setLoginItemSettings({
            openAtLogin,
            openAsHidden
        });
    }
    catch { }
}
function shouldStartMinimizedOnLaunch() {
    if (isDev)
        return false;
    if (!settingsStore.get("startWithSystem"))
        return false;
    if (!settingsStore.get("startMinimized"))
        return false;
    if (process.platform === "win32") {
        return process.argv.includes("--pxs-start-minimized");
    }
    try {
        return Boolean(electron_1.app.getLoginItemSettings().wasOpenedAtLogin);
    }
    catch {
        return false;
    }
}
function getConfigDirectory() {
    return electron_1.app.getPath("userData");
}
function getSettingsDirectory() {
    return node_path_1.default.join(getConfigDirectory(), "settings");
}
function getDataDirectory() {
    return node_path_1.default.join(getConfigDirectory(), "data");
}
function getLogsDirectory() {
    return node_path_1.default.join(getConfigDirectory(), "logs");
}
function getLogFilePath() {
    return node_path_1.default.join(getLogsDirectory(), LOG_FILE_NAME);
}
function trimLogContentToLimit(content, maxBytes) {
    let current = content;
    while (Buffer.byteLength(current, "utf8") > maxBytes) {
        const newlineIndex = current.indexOf("\n");
        if (newlineIndex === -1) {
            return current.slice(-maxBytes);
        }
        current = current.slice(newlineIndex + 1);
    }
    return current;
}
function formatLogTimestamp() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear());
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}
async function writeLog(level, message) {
    try {
        const logDirectory = getLogsDirectory();
        const logFilePath = getLogFilePath();
        const entry = `[${formatLogTimestamp()}] [${level}] ${message}\n`;
        await promises_1.default.mkdir(logDirectory, { recursive: true });
        let currentContent = "";
        try {
            currentContent = await promises_1.default.readFile(logFilePath, "utf8");
        }
        catch { }
        const nextContent = trimLogContentToLimit(currentContent + entry, LOG_FILE_MAX_SIZE);
        await promises_1.default.writeFile(logFilePath, nextContent, "utf8");
    }
    catch { }
}
function logInfo(message) {
    void writeLog("INFO", message);
}
function logWarn(message) {
    void writeLog("WARN", message);
}
function logError(message) {
    void writeLog("ERROR", message);
}
const updaterLogger = {
    info(message) {
        logInfo(message);
    },
    warn(message) {
        logWarn(message);
    },
    error(message) {
        logError(message);
    }
};
function getFocusedAppWindow() {
    return electron_1.BrowserWindow.getFocusedWindow() ?? (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
}
function createOrShowUpdateProgressWindow(version) {
    if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
        updateProgressWindow.show();
        updateProgressWindow.focus();
        return updateProgressWindow;
    }
    const parentWindow = getFocusedAppWindow();
    updateProgressWindow = new electron_1.BrowserWindow({
        width: 420,
        height: 220,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        title: "Downloading Update",
        autoHideMenuBar: true,
        modal: Boolean(parentWindow),
        parent: parentWindow ?? undefined,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Downloading Update</title>
        <style>
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #0f1319;
            color: #f5f7fb;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }
          .wrap {
            width: 100%;
            max-width: 340px;
            padding: 24px;
          }
          .eyebrow {
            margin: 0 0 10px;
            font-size: 12px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #8ea0b7;
          }
          .title {
            margin: 0 0 14px;
            font-size: 28px;
            line-height: 1.1;
            font-weight: 700;
          }
          .text {
            margin: 0 0 16px;
            color: #c7d0dc;
            font-size: 15px;
          }
          .bar {
            width: 100%;
            height: 10px;
            border-radius: 999px;
            background: #222934;
            overflow: hidden;
          }
          .fill {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #7aa2ff, #4fd1c5);
            transition: width 120ms linear;
          }
          .percent {
            margin-top: 12px;
            text-align: right;
            color: #8ea0b7;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <p class="eyebrow">Update</p>
          <h1 class="title">Downloading...</h1>
          <p class="text">Pokenix Studio ${version} is being downloaded.</p>
          <div class="bar"><div class="fill" id="fill"></div></div>
          <div class="percent" id="percent">0%</div>
        </div>
        <script>
          window.setProgress = function (value) {
            const percent = Math.max(0, Math.min(100, Number(value) || 0));
            document.getElementById("fill").style.width = percent + "%";
            document.getElementById("percent").textContent = percent + "%";
          };
        </script>
      </body>
    </html>
  `;
    void updateProgressWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    updateProgressWindow.once("ready-to-show", () => {
        updateProgressWindow?.show();
    });
    updateProgressWindow.on("closed", () => {
        updateProgressWindow = null;
    });
    return updateProgressWindow;
}
function updateDownloadProgressWindow(percent) {
    if (!updateProgressWindow || updateProgressWindow.isDestroyed())
        return;
    void updateProgressWindow.webContents.executeJavaScript(`window.setProgress(${Math.round(percent)})`);
}
function closeUpdateProgressWindow() {
    if (!updateProgressWindow || updateProgressWindow.isDestroyed()) {
        updateProgressWindow = null;
        return;
    }
    updateProgressWindow.close();
    updateProgressWindow = null;
}
async function promptToInstallDownloadedUpdate(version) {
    if (promptedDownloadedUpdateVersion === version) {
        return;
    }
    promptedDownloadedUpdateVersion = version;
    logInfo(`Update downloaded: ${version}.`);
    closeUpdateProgressWindow();
    const focusedWindow = getFocusedAppWindow();
    const messageBoxOptions = {
        type: "info",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update Ready",
        message: `Pokenix Studio ${version} is ready to install.`,
        detail: "Restart the app now to finish updating."
    };
    const result = focusedWindow
        ? await electron_1.dialog.showMessageBox(focusedWindow, messageBoxOptions)
        : await electron_1.dialog.showMessageBox(messageBoxOptions);
    if (result.response === 0) {
        logInfo(`Installing downloaded update ${version}.`);
        electron_updater_1.autoUpdater.quitAndInstall();
    }
}
function configureAutoUpdater() {
    electron_updater_1.autoUpdater.logger = updaterLogger;
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on("checking-for-update", () => {
        logInfo("Checking for app updates.");
    });
    electron_updater_1.autoUpdater.on("update-available", async (info) => {
        logInfo(`Update available: ${info.version}.`);
        manualUpdateCheckRequested = false;
        const focusedWindow = getFocusedAppWindow();
        const messageBoxOptions = {
            type: "info",
            buttons: ["Download Now", "Later"],
            defaultId: 0,
            cancelId: 1,
            title: "Update Available",
            message: `Pokenix Studio ${info.version} is available.`,
            detail: "Do you want to download the update now?"
        };
        const result = focusedWindow
            ? await electron_1.dialog.showMessageBox(focusedWindow, messageBoxOptions)
            : await electron_1.dialog.showMessageBox(messageBoxOptions);
        if (result.response === 0) {
            promptedDownloadedUpdateVersion = null;
            logInfo(`Starting update download for version ${info.version}.`);
            createOrShowUpdateProgressWindow(info.version);
            void electron_updater_1.autoUpdater
                .downloadUpdate()
                .then(() => promptToInstallDownloadedUpdate(info.version))
                .catch((error) => {
                closeUpdateProgressWindow();
                logError(`Failed to download update ${info.version}: ${error instanceof Error ? error.message : "Unknown error."}`);
            });
        }
        else {
            logInfo(`Update download postponed for version ${info.version}.`);
        }
    });
    electron_updater_1.autoUpdater.on("update-not-available", (info) => {
        logInfo(`No update available. Current latest version: ${info.version}.`);
        if (manualUpdateCheckRequested) {
            manualUpdateCheckRequested = false;
            const focusedWindow = getFocusedAppWindow();
            const options = {
                type: "info",
                buttons: ["OK"],
                defaultId: 0,
                title: "No Updates Found",
                message: `Pokenix Studio ${electron_1.app.getVersion()} is up to date.`,
                detail: `Latest available version: ${info.version}`
            };
            void (focusedWindow
                ? electron_1.dialog.showMessageBox(focusedWindow, options)
                : electron_1.dialog.showMessageBox(options));
        }
    });
    electron_updater_1.autoUpdater.on("error", (error) => {
        closeUpdateProgressWindow();
        if (manualUpdateCheckRequested) {
            manualUpdateCheckRequested = false;
            const focusedWindow = getFocusedAppWindow();
            const options = {
                type: "error",
                buttons: ["OK"],
                defaultId: 0,
                title: "Update Check Failed",
                message: "Pokenix Studio could not check for updates.",
                detail: error == null ? "Unknown error." : String(error)
            };
            void (focusedWindow
                ? electron_1.dialog.showMessageBox(focusedWindow, options)
                : electron_1.dialog.showMessageBox(options));
        }
        logError(`Auto update error: ${error == null ? "Unknown error." : String(error)}`);
    });
    electron_updater_1.autoUpdater.on("download-progress", (progress) => {
        logInfo(`Update download progress: ${Math.round(progress.percent)}%.`);
        updateDownloadProgressWindow(progress.percent);
    });
    electron_updater_1.autoUpdater.on("update-downloaded", async (info) => {
        await promptToInstallDownloadedUpdate(info.version);
    });
}
function getPluginsDirectory() {
    return node_path_1.default.join(getConfigDirectory(), "plugins");
}
async function ensurePluginsDirectory() {
    await promises_1.default.mkdir(getPluginsDirectory(), { recursive: true });
}
function getPluginRuntimeRootDirectory() {
    return node_path_1.default.join(getConfigDirectory(), "runtime");
}
function getPluginRuntimeVersionFilePath() {
    return node_path_1.default.join(getPluginRuntimeRootDirectory(), "runtime-version.json");
}
function getPluginRuntimeDirectory(pluginId) {
    return node_path_1.default.join(getPluginRuntimeRootDirectory(), pluginId);
}
async function ensurePluginRuntimeRootDirectory() {
    await promises_1.default.mkdir(getPluginRuntimeRootDirectory(), { recursive: true });
}
function getNodeDistributionTarget() {
    const archMap = {
        arm64: "arm64",
        x64: "x64"
    };
    const nodeArch = archMap[process.arch];
    if (!nodeArch) {
        throw new Error(`Unsupported architecture: ${process.arch}`);
    }
    if (process.platform === "darwin") {
        return {
            archiveName: `node-v${runtime_config_1.PLUGIN_NODE_VERSION}-darwin-${nodeArch}.tar.gz`,
            directoryName: `node-v${runtime_config_1.PLUGIN_NODE_VERSION}-darwin-${nodeArch}`,
            extension: "tar.gz"
        };
    }
    if (process.platform === "win32") {
        return {
            archiveName: `node-v${runtime_config_1.PLUGIN_NODE_VERSION}-win-${nodeArch}.zip`,
            directoryName: `node-v${runtime_config_1.PLUGIN_NODE_VERSION}-win-${nodeArch}`,
            extension: "zip"
        };
    }
    throw new Error(`Unsupported platform: ${process.platform}`);
}
function getNodeRuntimeDirectory() {
    return node_path_1.default.join(getPluginRuntimeRootDirectory(), getNodeDistributionTarget().directoryName);
}
function getNodeExecutablePath() {
    const runtimeDirectory = getNodeRuntimeDirectory();
    return process.platform === "win32"
        ? node_path_1.default.join(runtimeDirectory, "node.exe")
        : node_path_1.default.join(runtimeDirectory, "bin", "node");
}
function getNpmExecutablePath() {
    const runtimeDirectory = getNodeRuntimeDirectory();
    return process.platform === "win32"
        ? node_path_1.default.join(runtimeDirectory, "npm.cmd")
        : node_path_1.default.join(runtimeDirectory, "bin", "npm");
}
function getNpmCliPath() {
    const runtimeDirectory = getNodeRuntimeDirectory();
    return process.platform === "win32"
        ? node_path_1.default.join(runtimeDirectory, "node_modules", "npm", "bin", "npm-cli.js")
        : node_path_1.default.join(runtimeDirectory, "lib", "node_modules", "npm", "bin", "npm-cli.js");
}
async function isPluginNodeRuntimeInstalled() {
    try {
        await promises_1.default.access(getNodeExecutablePath());
        return true;
    }
    catch {
        return false;
    }
}
async function getInstalledPluginRuntimeVersion() {
    try {
        const raw = await promises_1.default.readFile(getPluginRuntimeVersionFilePath(), "utf8");
        const parsed = JSON.parse(raw);
        return parsed.version || null;
    }
    catch {
        return null;
    }
}
async function writeInstalledPluginRuntimeVersion() {
    await promises_1.default.writeFile(getPluginRuntimeVersionFilePath(), JSON.stringify({ version: runtime_config_1.PLUGIN_NODE_VERSION }, null, 2), "utf8");
}
async function clearPluginRuntimeInstallation() {
    await promises_1.default.rm(getPluginRuntimeRootDirectory(), { recursive: true, force: true });
    await ensurePluginRuntimeRootDirectory();
}
function sendPluginSetupProgress(webContents, progress) {
    if (!webContents || webContents.isDestroyed())
        return;
    webContents.send("plugins:setup-progress", progress);
}
async function downloadFile(url, destinationPath, onProgress) {
    await new Promise((resolve, reject) => {
        const request = node_https_1.default.get(url, (response) => {
            if (response.statusCode &&
                response.statusCode >= 300 &&
                response.statusCode < 400 &&
                response.headers.location) {
                response.resume();
                void downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed with status ${response.statusCode ?? "unknown"}`));
                return;
            }
            const chunks = [];
            const totalBytes = Number(response.headers["content-length"] || 0);
            let downloadedBytes = 0;
            response.on("data", (chunk) => {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                chunks.push(buffer);
                downloadedBytes += buffer.length;
                if (totalBytes > 0 && onProgress) {
                    onProgress(Math.round((downloadedBytes / totalBytes) * 100));
                }
            });
            response.on("end", async () => {
                try {
                    await promises_1.default.writeFile(destinationPath, Buffer.concat(chunks));
                    resolve();
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        request.on("error", reject);
    });
}
async function extractArchive(archivePath, destinationDirectory) {
    await new Promise((resolve, reject) => {
        const command = process.platform === "win32"
            ? "powershell.exe"
            : "/usr/bin/tar";
        const args = process.platform === "win32"
            ? [
                "-NoProfile",
                "-Command",
                `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDirectory.replace(/'/g, "''")}' -Force`
            ]
            : ["-xzf", archivePath, "-C", destinationDirectory];
        const child = (0, node_child_process_1.spawn)(command, args, {
            stdio: "ignore"
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`Archive extraction failed with code ${code ?? "unknown"}`));
        });
    });
}
async function ensurePluginNodeRuntimeInstalled(webContents, forceReinstall = false) {
    await ensurePluginRuntimeRootDirectory();
    const runtimeInstalled = await isPluginNodeRuntimeInstalled();
    const installedVersion = await getInstalledPluginRuntimeVersion();
    if (forceReinstall && runtimeInstalled) {
        sendPluginSetupProgress(webContents, {
            phase: "preparing",
            message: `Reinstalling plugin runtime ${runtime_config_1.PLUGIN_NODE_VERSION}...`
        });
        await clearPluginRuntimeInstallation();
    }
    else if (runtimeInstalled && installedVersion !== runtime_config_1.PLUGIN_NODE_VERSION) {
        sendPluginSetupProgress(webContents, {
            phase: "preparing",
            message: `Updating plugin runtime to ${runtime_config_1.PLUGIN_NODE_VERSION}...`
        });
        await clearPluginRuntimeInstallation();
    }
    if (await isPluginNodeRuntimeInstalled()) {
        sendPluginSetupProgress(webContents, {
            phase: "ready",
            message: "Plugin runtime is already installed.",
            percent: 100
        });
        return;
    }
    const target = getNodeDistributionTarget();
    const archiveUrl = `https://nodejs.org/dist/v${runtime_config_1.PLUGIN_NODE_VERSION}/${target.archiveName}`;
    const archivePath = node_path_1.default.join(getPluginRuntimeRootDirectory(), target.archiveName);
    sendPluginSetupProgress(webContents, {
        phase: "preparing",
        message: "Preparing plugin runtime setup..."
    });
    await downloadFile(archiveUrl, archivePath, (percent) => {
        sendPluginSetupProgress(webContents, {
            phase: "downloading",
            message: `Downloading Node.js runtime ${percent ? `(${percent}%)` : ""}`.trim(),
            percent
        });
    });
    try {
        sendPluginSetupProgress(webContents, {
            phase: "extracting",
            message: "Extracting Node.js runtime..."
        });
        await extractArchive(archivePath, getPluginRuntimeRootDirectory());
    }
    finally {
        await promises_1.default.rm(archivePath, { force: true });
    }
    if (!(await isPluginNodeRuntimeInstalled())) {
        throw new Error("Node runtime was downloaded but could not be initialized.");
    }
    sendPluginSetupProgress(webContents, {
        phase: "finalizing",
        message: "Finalizing plugin runtime setup..."
    });
    await writeInstalledPluginRuntimeVersion();
    sendPluginSetupProgress(webContents, {
        phase: "ready",
        message: "Plugin runtime installed successfully.",
        percent: 100
    });
}
async function ensurePluginRuntimeDirectory(pluginId) {
    const runtimeDirectory = getPluginRuntimeDirectory(pluginId);
    await promises_1.default.mkdir(runtimeDirectory, { recursive: true });
    const runtimePackagePath = node_path_1.default.join(runtimeDirectory, "package.json");
    try {
        await promises_1.default.access(runtimePackagePath);
    }
    catch {
        await promises_1.default.writeFile(runtimePackagePath, JSON.stringify({
            name: `pokenix-plugin-${pluginId}`,
            private: true
        }, null, 2), "utf8");
    }
    return runtimeDirectory;
}
function getDisabledPluginIds() {
    return pluginStore.get("disabledPluginIds");
}
function arePluginsEnabled() {
    return pluginStore.get("pluginsEnabled");
}
function isPluginDisabled(pluginId) {
    return getDisabledPluginIds().includes(pluginId);
}
function setPluginDisabled(pluginId, disabled) {
    const current = new Set(getDisabledPluginIds());
    if (disabled) {
        current.add(pluginId);
    }
    else {
        current.delete(pluginId);
    }
    pluginStore.set("disabledPluginIds", Array.from(current));
    notifyPluginStateChanged();
}
function getPluginWindowKey(pluginId) {
    return `plugin:${pluginId}`;
}
function isPluginWindowOpen(pluginId) {
    const win = moduleWindows.get(getPluginWindowKey(pluginId));
    return !!win && !win.isDestroyed();
}
function closePluginWindow(pluginId) {
    const windowKey = getPluginWindowKey(pluginId);
    const win = moduleWindows.get(windowKey);
    if (win && !win.isDestroyed()) {
        win.close();
    }
    moduleWindows.delete(windowKey);
    notifyPluginStateChanged();
    return { success: true };
}
function normalizePluginPermissions(permissions) {
    if (!Array.isArray(permissions))
        return [];
    return permissions
        .filter((permission) => typeof permission === "string")
        .map((permission) => permission.trim())
        .filter(Boolean);
}
function getUnsafePluginPermissions(plugin) {
    return normalizePluginPermissions(plugin.permissions).filter((permission) => !PLUGIN_PERMISSION_RULES[permission]?.safe);
}
function getGrantedPluginPermissions(plugin) {
    const declaredPermissions = new Set(normalizePluginPermissions(plugin.permissions));
    const approvedUnsafePermissions = new Set(getApprovedUnsafePermissions(plugin.id));
    return Array.from(declaredPermissions).filter((permission) => {
        const rule = PLUGIN_PERMISSION_RULES[permission];
        if (!rule) {
            return approvedUnsafePermissions.has(permission);
        }
        if (rule.safe) {
            return true;
        }
        return approvedUnsafePermissions.has(permission);
    });
}
function pluginHasPermission(plugin, permission) {
    return getGrantedPluginPermissions(plugin).includes(permission);
}
function formatUnsafePermissionDetails(permissions) {
    return permissions
        .map((permission) => {
        const rule = PLUGIN_PERMISSION_RULES[permission];
        if (!rule) {
            return `- ${permission}: Unknown permission. Treated as unsafe by default.`;
        }
        return `- ${permission}: ${rule.description}`;
    })
        .join("\n");
}
function getApprovedUnsafePermissions(pluginId) {
    const approvals = pluginStore.get("approvedUnsafePermissions") || {};
    return Array.isArray(approvals[pluginId]) ? approvals[pluginId] : [];
}
function setApprovedUnsafePermissions(pluginId, permissions) {
    const approvals = pluginStore.get("approvedUnsafePermissions") || {};
    pluginStore.set("approvedUnsafePermissions", {
        ...approvals,
        [pluginId]: permissions
    });
}
function clearApprovedUnsafePermissions(pluginId) {
    const approvals = { ...(pluginStore.get("approvedUnsafePermissions") || {}) };
    delete approvals[pluginId];
    pluginStore.set("approvedUnsafePermissions", approvals);
}
function getPluginDataDirectory(pluginDirectory) {
    return node_path_1.default.join(pluginDirectory, "data");
}
function resolvePluginStoragePath(pluginDirectory, relativePath) {
    const normalizedPath = String(relativePath || "").trim();
    if (!normalizedPath) {
        throw new Error("Storage path is required.");
    }
    const dataDirectory = getPluginDataDirectory(pluginDirectory);
    const targetPath = node_path_1.default.resolve(dataDirectory, normalizedPath);
    if (!targetPath.startsWith(dataDirectory)) {
        throw new Error("Storage path must stay inside the plugin data directory.");
    }
    return targetPath;
}
function isSameOriginLike(requestUrl, allowedUrl) {
    try {
        const request = new URL(requestUrl);
        const allowed = new URL(allowedUrl);
        return request.hostname === allowed.hostname && request.port === allowed.port;
    }
    catch {
        return false;
    }
}
function isPluginNetworkRequestAllowed(requestUrl, plugin) {
    const normalizedUrl = requestUrl.toLowerCase();
    if (normalizedUrl.startsWith("file:") ||
        normalizedUrl.startsWith("data:") ||
        normalizedUrl.startsWith("blob:") ||
        normalizedUrl.startsWith("devtools:")) {
        return true;
    }
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        if (isSameOriginLike(requestUrl, process.env.VITE_DEV_SERVER_URL)) {
            return true;
        }
    }
    return pluginHasPermission(plugin, "network");
}
function disablePluginsGlobally() {
    pluginStore.set("pluginsEnabled", false);
    pluginStore.set("disabledPluginIds", []);
    pluginStore.set("approvedUnsafePermissions", {});
    for (const [windowKey, win] of moduleWindows.entries()) {
        if (!windowKey.startsWith("plugin:"))
            continue;
        if (!win.isDestroyed()) {
            win.close();
        }
        moduleWindows.delete(windowKey);
    }
    logInfo("Plugins disabled globally.");
    notifyPluginStateChanged();
    return {
        enabled: false,
        path: getPluginsDirectory(),
        runtimeInstalled: false
    };
}
async function resetPlugins() {
    disablePluginsGlobally();
    await promises_1.default.rm(getPluginsDirectory(), { recursive: true, force: true });
    await promises_1.default.rm(getPluginRuntimeRootDirectory(), { recursive: true, force: true });
    logInfo("Plugins were reset and plugin directories were removed.");
    return {
        enabled: false,
        path: getPluginsDirectory(),
        runtimeInstalled: false
    };
}
function closeAllPluginWindows() {
    let closedCount = 0;
    for (const [windowKey, win] of moduleWindows.entries()) {
        if (!windowKey.startsWith("plugin:"))
            continue;
        if (!win.isDestroyed()) {
            win.close();
            closedCount += 1;
        }
        moduleWindows.delete(windowKey);
    }
    logInfo(`Closed ${closedCount} plugin window${closedCount === 1 ? "" : "s"}.`);
    notifyPluginStateChanged();
    return { success: true };
}
async function disableAllPlugins() {
    const installedPlugins = await getInstalledPlugins();
    for (const plugin of installedPlugins.plugins) {
        setPluginDisabled(plugin.id, true);
    }
    logInfo(`Disabled ${installedPlugins.plugins.length} plugin${installedPlugins.plugins.length === 1 ? "" : "s"}.`);
    closeAllPluginWindows();
    return { success: true };
}
async function enableAllPlugins() {
    const installedPlugins = await getInstalledPlugins();
    for (const plugin of installedPlugins.plugins) {
        setPluginDisabled(plugin.id, false);
    }
    logInfo(`Enabled ${installedPlugins.plugins.length} plugin${installedPlugins.plugins.length === 1 ? "" : "s"}.`);
    notifyPluginStateChanged();
    return { success: true };
}
function notifyPluginStateChanged() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("plugins:state-changed");
    }
}
async function readPluginRecord(pluginDirectory) {
    const manifestPath = node_path_1.default.join(pluginDirectory, "manifest.json");
    try {
        const rawManifest = await promises_1.default.readFile(manifestPath, "utf8");
        const manifest = JSON.parse(rawManifest);
        if (typeof manifest.id !== "string" ||
            typeof manifest.name !== "string" ||
            typeof manifest.version !== "string" ||
            typeof manifest.entry !== "string") {
            return null;
        }
        return {
            directory: pluginDirectory,
            manifest: {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                author: manifest.author,
                description: manifest.description,
                entry: manifest.entry,
                style: manifest.style,
                dependencies: manifest.dependencies,
                permissions: normalizePluginPermissions(manifest.permissions)
            }
        };
    }
    catch {
        return null;
    }
}
async function getInstalledPlugins() {
    if (!arePluginsEnabled()) {
        return {
            enabled: false,
            path: getPluginsDirectory(),
            runtimeInstalled: false,
            plugins: []
        };
    }
    await ensurePluginsDirectory();
    await ensurePluginRuntimeRootDirectory();
    const pluginsDirectory = getPluginsDirectory();
    const entries = await promises_1.default.readdir(pluginsDirectory, { withFileTypes: true });
    const plugins = [];
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const pluginRecord = await readPluginRecord(node_path_1.default.join(pluginsDirectory, entry.name));
        if (!pluginRecord)
            continue;
        plugins.push(pluginRecord.manifest);
    }
    return {
        enabled: true,
        path: pluginsDirectory,
        runtimeInstalled: await isPluginNodeRuntimeInstalled(),
        plugins: plugins.map((plugin) => ({
            ...plugin,
            disabled: isPluginDisabled(plugin.id),
            open: isPluginWindowOpen(plugin.id)
        }))
    };
}
async function findPluginRecordById(pluginId) {
    if (!arePluginsEnabled())
        return null;
    await ensurePluginsDirectory();
    const pluginsDirectory = getPluginsDirectory();
    const entries = await promises_1.default.readdir(pluginsDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const pluginRecord = await readPluginRecord(node_path_1.default.join(pluginsDirectory, entry.name));
        if (pluginRecord?.manifest.id === pluginId) {
            return pluginRecord;
        }
    }
    return null;
}
async function getPluginById(pluginId) {
    const pluginRecord = await findPluginRecordById(pluginId);
    if (!pluginRecord)
        return null;
    await ensurePluginRuntimeRootDirectory();
    const entryPath = node_path_1.default.resolve(pluginRecord.directory, pluginRecord.manifest.entry);
    if (!entryPath.startsWith(pluginRecord.directory))
        return null;
    const script = await promises_1.default.readFile(entryPath, "utf8");
    let style;
    const runtimeDirectory = await ensurePluginRuntimeDirectory(pluginRecord.manifest.id);
    if (typeof pluginRecord.manifest.style === "string") {
        const stylePath = node_path_1.default.resolve(pluginRecord.directory, pluginRecord.manifest.style);
        if (stylePath.startsWith(pluginRecord.directory)) {
            style = await promises_1.default.readFile(stylePath, "utf8");
        }
    }
    return {
        plugin: pluginRecord.manifest,
        script,
        style,
        runtimeDirectory,
        pluginDirectory: pluginRecord.directory
    };
}
async function requirePluginPermission(pluginId, permission) {
    const pluginData = await getPluginById(pluginId);
    if (!pluginData) {
        throw new Error("Plugin could not be loaded.");
    }
    if (!pluginHasPermission(pluginData.plugin, permission)) {
        throw new Error(`Plugin permission not granted: ${permission}`);
    }
    return pluginData;
}
async function deletePlugin(pluginId) {
    const pluginData = await getPluginById(pluginId);
    if (!pluginData)
        return { success: false };
    const pluginsDirectory = getPluginsDirectory();
    const entries = await promises_1.default.readdir(pluginsDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const pluginRecord = await readPluginRecord(node_path_1.default.join(pluginsDirectory, entry.name));
        if (!pluginRecord || pluginRecord.manifest.id !== pluginId)
            continue;
        await promises_1.default.rm(pluginRecord.directory, { recursive: true, force: true });
        await promises_1.default.rm(getPluginRuntimeDirectory(pluginId), { recursive: true, force: true });
        setPluginDisabled(pluginId, false);
        clearApprovedUnsafePermissions(pluginId);
        const windowKey = `plugin:${pluginId}`;
        const win = moduleWindows.get(windowKey);
        if (win && !win.isDestroyed()) {
            win.close();
        }
        moduleWindows.delete(windowKey);
        notifyPluginStateChanged();
        return { success: true };
    }
    return { success: false };
}
function normalizeRequestedVersion(version) {
    return version.trim().replace(/^[~^]/, "");
}
function parseSemver(version) {
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3])
    };
}
function compareSemver(a, b) {
    const parsedA = parseSemver(a);
    const parsedB = parseSemver(b);
    if (!parsedA || !parsedB) {
        return a.localeCompare(b);
    }
    if (parsedA.major !== parsedB.major)
        return parsedA.major - parsedB.major;
    if (parsedA.minor !== parsedB.minor)
        return parsedA.minor - parsedB.minor;
    return parsedA.patch - parsedB.patch;
}
function versionSatisfiesRange(requestedVersion, installedVersion) {
    const trimmedRequested = requestedVersion.trim();
    const normalizedRequested = normalizeRequestedVersion(trimmedRequested);
    if (trimmedRequested.startsWith("^")) {
        const requested = parseSemver(normalizedRequested);
        const installed = parseSemver(installedVersion);
        if (!requested || !installed)
            return normalizedRequested === installedVersion;
        return (installed.major === requested.major &&
            compareSemver(installedVersion, normalizedRequested) >= 0);
    }
    if (trimmedRequested.startsWith("~")) {
        const requested = parseSemver(normalizedRequested);
        const installed = parseSemver(installedVersion);
        if (!requested || !installed)
            return normalizedRequested === installedVersion;
        return (installed.major === requested.major &&
            installed.minor === requested.minor &&
            compareSemver(installedVersion, normalizedRequested) >= 0);
    }
    return normalizedRequested === installedVersion;
}
async function getPluginDependencyChanges(plugin) {
    const dependencies = plugin.dependencies || {};
    const entries = Object.entries(dependencies);
    if (entries.length === 0) {
        return {
            missing: [],
            updates: []
        };
    }
    const runtimeDirectory = await ensurePluginRuntimeDirectory(plugin.id);
    const runtimeRequire = (0, node_module_1.createRequire)(node_path_1.default.join(runtimeDirectory, "package.json"));
    const missing = [];
    const updates = [];
    for (const [name, version] of entries) {
        try {
            runtimeRequire.resolve(name);
            const packageJsonPath = node_path_1.default.join(runtimeDirectory, "node_modules", name, "package.json");
            const installedPackage = JSON.parse(await promises_1.default.readFile(packageJsonPath, "utf8"));
            const installedVersion = installedPackage.version || "";
            if (!versionSatisfiesRange(version, installedVersion)) {
                updates.push({ name, version });
            }
        }
        catch {
            missing.push({ name, version });
        }
    }
    return { missing, updates };
}
async function installPluginDependencies(plugin) {
    const dependencies = plugin.dependencies || {};
    const entries = Object.entries(dependencies);
    if (entries.length === 0)
        return;
    const runtimeDirectory = await ensurePluginRuntimeDirectory(plugin.id);
    const packages = entries.map(([name, version]) => `${name}@${version}`);
    const nodeCommand = getNodeExecutablePath();
    const npmCliPath = getNpmCliPath();
    await promises_1.default.access(npmCliPath);
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(nodeCommand, [npmCliPath, "install", "--no-save", ...packages], {
            cwd: runtimeDirectory,
            stdio: "ignore"
        });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`npm install failed with code ${code ?? "unknown"}`));
        });
    });
}
async function ensurePluginDependencies(plugin) {
    if (isPluginDisabled(plugin.id)) {
        return { success: false, reason: "disabled" };
    }
    const dependencyChanges = await getPluginDependencyChanges(plugin);
    const missingDependencies = dependencyChanges.missing;
    const updateDependencies = dependencyChanges.updates;
    if (missingDependencies.length === 0 && updateDependencies.length === 0) {
        return { success: true };
    }
    const dependencyList = [...missingDependencies, ...updateDependencies]
        .map(({ name, version }) => `- ${name}@${version}`)
        .join("\n");
    const message = missingDependencies.length > 0 && updateDependencies.length > 0
        ? `${plugin.name} wants to install and update dependencies.`
        : updateDependencies.length > 0
            ? `${plugin.name} wants to update dependencies.`
            : `${plugin.name} wants to install dependencies.`;
    const result = await electron_1.dialog.showMessageBox({
        type: "question",
        buttons: ["Allow", "Disable Plugin", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        title: "Plugin dependencies",
        message,
        detail: dependencyList
    });
    if (result.response === 1) {
        setPluginDisabled(plugin.id, true);
        return { success: false, reason: "disabled" };
    }
    if (result.response === 2) {
        return { success: false, reason: "cancelled" };
    }
    await installPluginDependencies(plugin);
    setPluginDisabled(plugin.id, false);
    return { success: true };
}
function getWindowBounds(key, fallback) {
    const saved = windowStateStore.get(key);
    return {
        width: saved.width || fallback.width,
        height: saved.height || fallback.height,
        x: saved.x,
        y: saved.y
    };
}
function saveWindowState(key, win) {
    if (win.isDestroyed() || win.isMinimized() || win.isMaximized())
        return;
    const bounds = win.getBounds();
    windowStateStore.set(key, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
    });
}
function attachWindowStateSave(key, win) {
    let timeout = null;
    const queueSave = () => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (!win.isDestroyed()) {
                saveWindowState(key, win);
            }
        }, 150);
    };
    win.on("resize", queueSave);
    win.on("move", queueSave);
    win.on("close", () => {
        if (timeout)
            clearTimeout(timeout);
        if (!win.isDestroyed()) {
            saveWindowState(key, win);
        }
    });
}
function isUsableWindow(win) {
    return !!win && !win.isDestroyed();
}
function createMainWindow(startHidden = false) {
    const state = getWindowBounds("main", {
        width: 1200,
        height: 800
    });
    mainWindow = new electron_1.BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 900,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    attachWindowStateSave("main", mainWindow);
    if (isDev) {
        void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    }
    else {
        void mainWindow.loadFile(node_path_1.default.join(__dirname, "../dist/index.html"));
    }
    mainWindow.once("ready-to-show", () => {
        if (startHidden) {
            mainWindow?.hide();
            logInfo("Main window started minimized in tray.");
            if (process.platform === "darwin" && electron_1.app.dock) {
                electron_1.app.dock.hide();
            }
            return;
        }
        mainWindow?.show();
        logInfo("Main window is ready.");
    });
    mainWindow.on("close", (event) => {
        const closeToTray = settingsStore.get("closeToTray");
        saveWindowState("main", mainWindow);
        if (!isQuitting) {
            if (closeToTray) {
                event.preventDefault();
                mainWindow?.hide();
                logInfo("Main window hidden to tray.");
                if (process.platform === "darwin" && electron_1.app.dock) {
                    electron_1.app.dock.hide();
                }
            }
            else {
                isQuitting = true;
                logInfo("Main window requested app quit.");
                electron_1.app.quit();
            }
        }
    });
    mainWindow.on("closed", () => {
        logInfo("Main window closed.");
        mainWindow = null;
    });
}
function ensureMainWindow() {
    if (isUsableWindow(mainWindow))
        return mainWindow;
    createMainWindow();
    return mainWindow;
}
function showMainWindow() {
    const win = ensureMainWindow();
    if (!win)
        return;
    if (!win.isVisible()) {
        win.show();
    }
    if (win.isMinimized()) {
        win.restore();
    }
    win.focus();
    logInfo("Main window focused.");
    if (process.platform === "darwin" && electron_1.app.dock) {
        electron_1.app.dock.show();
    }
}
function hideMainWindow() {
    if (!isUsableWindow(mainWindow))
        return;
    mainWindow.hide();
}
function navigateMainWindow(page) {
    const win = ensureMainWindow();
    if (!win)
        return;
    if (!win.isVisible()) {
        win.show();
    }
    if (win.isMinimized()) {
        win.restore();
    }
    win.focus();
    win.webContents.send("app:navigate", page);
    logInfo(`Navigated main window to: ${page}`);
    if (process.platform === "darwin" && electron_1.app.dock) {
        electron_1.app.dock.show();
    }
}
function validateDirectoryName(name) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        return "Directory name cannot be empty.";
    }
    if (trimmedName === "." || trimmedName === "..") {
        return "Directory name cannot be . or ..";
    }
    if (trimmedName.includes("/")) {
        return "Directory name cannot contain /";
    }
    if (process.platform === "darwin") {
        if (trimmedName.includes(":")) {
            return "Directory name cannot contain : on macOS.";
        }
        return "";
    }
    if (process.platform === "win32") {
        if (/[<>:"\\|?*]/.test(trimmedName)) {
            return "Directory name contains invalid characters for Windows.";
        }
        if (/[. ]$/.test(trimmedName)) {
            return "Directory name cannot end with a space or period on Windows.";
        }
        const upperName = trimmedName.toUpperCase();
        const reservedNames = [
            "CON",
            "PRN",
            "AUX",
            "NUL",
            "COM1",
            "COM2",
            "COM3",
            "COM4",
            "COM5",
            "COM6",
            "COM7",
            "COM8",
            "COM9",
            "LPT1",
            "LPT2",
            "LPT3",
            "LPT4",
            "LPT5",
            "LPT6",
            "LPT7",
            "LPT8",
            "LPT9"
        ];
        if (reservedNames.includes(upperName)) {
            return "Directory name is reserved on Windows.";
        }
    }
    return "";
}
async function validateTransferPaths(sourcePath, destinationPath) {
    const normalizedSourcePath = String(sourcePath || "").trim();
    const normalizedDestinationPath = String(destinationPath || "").trim();
    const resolvedSourcePath = node_path_1.default.resolve(normalizedSourcePath);
    const resolvedDestinationPath = node_path_1.default.resolve(normalizedDestinationPath);
    if (!normalizedSourcePath) {
        return { success: false, error: "Choose an old path first." };
    }
    if (!normalizedDestinationPath) {
        return { success: false, error: "Choose a new path first." };
    }
    if (resolvedSourcePath === resolvedDestinationPath) {
        return { success: false, error: "Old path and new path cannot be the same." };
    }
    const sourceWithSeparator = `${resolvedSourcePath}${node_path_1.default.sep}`;
    const destinationWithSeparator = `${resolvedDestinationPath}${node_path_1.default.sep}`;
    if (resolvedDestinationPath.startsWith(sourceWithSeparator)) {
        return { success: false, error: "The new path cannot be inside the old path." };
    }
    if (resolvedSourcePath.startsWith(destinationWithSeparator)) {
        return { success: false, error: "The old path cannot be inside the new path." };
    }
    let sourceStat;
    let destinationStat;
    try {
        sourceStat = await promises_1.default.stat(resolvedSourcePath);
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return { success: false, error: "The old path does not exist anymore." };
        }
        return { success: false, error: "Could not access the old path." };
    }
    try {
        destinationStat = await promises_1.default.stat(resolvedDestinationPath);
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            return { success: false, error: "The new path does not exist anymore." };
        }
        return { success: false, error: "Could not access the new path." };
    }
    if (!sourceStat.isDirectory()) {
        return { success: false, error: "The old path is not a directory." };
    }
    if (!destinationStat.isDirectory()) {
        return { success: false, error: "The new path is not a directory." };
    }
    try {
        await promises_1.default.access(resolvedSourcePath, node_fs_1.constants.R_OK);
    }
    catch (error) {
        const code = String(error?.code || "");
        if (code === "EACCES" || code === "EPERM") {
            return { success: false, error: "Pokenix Studio does not have permission to read the old path." };
        }
        return { success: false, error: "Could not read the old path." };
    }
    try {
        await promises_1.default.access(resolvedDestinationPath, node_fs_1.constants.W_OK);
    }
    catch (error) {
        const code = String(error?.code || "");
        if (code === "EACCES" || code === "EPERM") {
            return { success: false, error: "Pokenix Studio does not have permission to write to the new path." };
        }
        return { success: false, error: "Could not write to the new path." };
    }
    const sourceEntries = await promises_1.default.readdir(resolvedSourcePath, { withFileTypes: true });
    if (sourceEntries.length === 0) {
        return { success: false, error: "The old path is empty." };
    }
    const entryNames = sourceEntries.map((entry) => entry.name);
    const conflicts = [];
    for (const entryName of entryNames) {
        try {
            const existingStat = await promises_1.default.stat(node_path_1.default.join(resolvedDestinationPath, entryName));
            conflicts.push({
                name: entryName,
                kind: existingStat.isDirectory() ? "directory" : "file"
            });
        }
        catch { }
    }
    return {
        success: true,
        sourcePath: resolvedSourcePath,
        destinationPath: resolvedDestinationPath,
        entryNames,
        conflicts
    };
}
async function collectTransferredItems(rootPath, relativePath = "") {
    const currentPath = relativePath ? node_path_1.default.join(rootPath, relativePath) : rootPath;
    const currentStat = await promises_1.default.stat(currentPath);
    if (!currentStat.isDirectory()) {
        return relativePath ? [relativePath.replace(/\\/g, "/")] : [];
    }
    const entries = await promises_1.default.readdir(currentPath, { withFileTypes: true });
    if (entries.length === 0) {
        return relativePath ? [`${relativePath.replace(/\\/g, "/")}/`] : [];
    }
    const collected = [];
    for (const entry of entries) {
        const nextRelativePath = relativePath ? node_path_1.default.join(relativePath, entry.name) : entry.name;
        if (entry.isDirectory()) {
            collected.push(...(await collectTransferredItems(rootPath, nextRelativePath)));
            continue;
        }
        collected.push(nextRelativePath.replace(/\\/g, "/"));
    }
    return collected;
}
async function buildDirectoryTreeLines(directoryPath, options, prefix = "") {
    const entries = await promises_1.default.readdir(directoryPath, { withFileTypes: true });
    const filteredEntries = entries.filter((entry) => {
        if (!options.hideHiddenFiles)
            return true;
        return !entry.name.startsWith(".");
    });
    const sortedEntries = filteredEntries
        .slice()
        .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory())
            return -1;
        if (!a.isDirectory() && b.isDirectory())
            return 1;
        return a.name.localeCompare(b.name);
    });
    const lines = [];
    for (const [index, entry] of sortedEntries.entries()) {
        const isLast = index === sortedEntries.length - 1;
        const connector = isLast ? "└── " : "├── ";
        if (entry.isDirectory()) {
            const childPath = node_path_1.default.join(directoryPath, entry.name);
            const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
            const childLines = await buildDirectoryTreeLines(childPath, options, childPrefix);
            if (options.hideEmptyFolders && childLines.length === 0) {
                continue;
            }
            lines.push(`${prefix}${connector}${entry.name}/`);
            lines.push(...childLines);
            continue;
        }
        lines.push(`${prefix}${connector}${entry.name}`);
    }
    return lines;
}
async function movePath(sourcePath, destinationPath) {
    try {
        await promises_1.default.rename(sourcePath, destinationPath);
    }
    catch (error) {
        if (error?.code !== "EXDEV") {
            throw error;
        }
        await promises_1.default.cp(sourcePath, destinationPath, {
            recursive: true,
            force: true
        });
        await promises_1.default.rm(sourcePath, {
            recursive: true,
            force: true
        });
    }
}
function createApplicationMenu() {
    electron_1.app.setAboutPanelOptions({
        applicationName: "Pokenix Studio",
        applicationVersion: electron_1.app.getVersion(),
        copyright: "Pokenix"
    });
    const template = [
        {
            label: "Pokenix",
            submenu: [
                { role: "about", label: "About Pokenix Studio" },
                {
                    label: "Settings",
                    accelerator: "CmdOrCtrl+,",
                    click: () => navigateMainWindow("settings")
                },
                { type: "separator" },
                { role: "quit", label: "Quit" }
            ]
        },
        {
            label: "Edit",
            submenu: [
                { role: "undo", label: "Undo" },
                { role: "redo", label: "Redo" },
                { type: "separator" },
                { role: "cut", label: "Cut" },
                { role: "copy", label: "Copy" },
                { role: "paste", label: "Paste" },
                { type: "separator" },
                { role: "selectAll", label: "Select All" }
            ]
        },
        {
            label: "View",
            submenu: [{ role: "reload", label: "Reload" }]
        },
        {
            label: "Window",
            submenu: [
                { role: "minimize", label: "Minimize" },
                { role: "zoom", label: "Zoom" },
                { role: "front", label: "Bring All to Front" }
            ]
        },
        {
            label: "Help",
            submenu: [
                {
                    label: "Website",
                    click: () => {
                        void electron_1.shell.openExternal("https://pokenix.com/studio");
                    }
                },
                {
                    label: "Open Config Folder",
                    click: () => {
                        void electron_1.shell.openPath(getConfigDirectory());
                    }
                }
            ]
        }
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
async function handleNotepadWindowClose(win, event) {
    if (forceCloseWindowIds.has(win.id))
        return;
    const isDirty = notepadDirtyState.get(win.id) === true;
    if (!isDirty)
        return;
    event.preventDefault();
    const result = await electron_1.dialog.showMessageBox(win, {
        type: "warning",
        buttons: ["Save", "Discard", "Cancel"],
        defaultId: 0,
        cancelId: 2,
        title: "Unsaved changes",
        message: "You have unsaved changes.",
        detail: "Do you want to save your changes before closing?"
    });
    if (result.response === 2)
        return;
    if (result.response === 1) {
        forceCloseWindowIds.add(win.id);
        win.close();
        forceCloseWindowIds.delete(win.id);
        return;
    }
    const saveOk = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 60000);
        electron_1.ipcMain.once("notepad:save-all-result", (_evt, success) => {
            clearTimeout(timer);
            resolve(Boolean(success));
        });
        win.webContents.send("notepad:save-all-request");
    });
    if (saveOk) {
        forceCloseWindowIds.add(win.id);
        win.close();
        forceCloseWindowIds.delete(win.id);
    }
}
function createModuleWindow(moduleId, title) {
    const existingWindow = moduleWindows.get(moduleId);
    if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.show();
        existingWindow.focus();
        logInfo(`Focused existing module window: ${moduleId}`);
        return;
    }
    const state = getWindowBounds("plugin", {
        width: 1000,
        height: 700
    });
    const moduleWindow = new electron_1.BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 700,
        minHeight: 500,
        show: true,
        autoHideMenuBar: true,
        title,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    attachWindowStateSave("notepad", moduleWindow);
    const moduleUrl = isDev
        ? `${process.env.VITE_DEV_SERVER_URL}?module=${moduleId}`
        : `file://${node_path_1.default.join(__dirname, "../dist/index.html")}?module=${moduleId}`;
    void moduleWindow.loadURL(moduleUrl);
    logInfo(`Opened module window: ${moduleId}`);
    if (moduleId === "notepad") {
        moduleWindow.on("close", (event) => {
            void handleNotepadWindowClose(moduleWindow, event);
        });
    }
    moduleWindow.on("closed", () => {
        moduleWindows.delete(moduleId);
        notepadDirtyState.delete(moduleWindow.id);
        logInfo(`Closed module window: ${moduleId}`);
    });
    moduleWindows.set(moduleId, moduleWindow);
}
async function createPluginWindow(pluginId) {
    const pluginData = await getPluginById(pluginId);
    if (!pluginData)
        return false;
    const unsafePermissions = getUnsafePluginPermissions(pluginData.plugin);
    if (unsafePermissions.length > 0) {
        const approvedPermissions = getApprovedUnsafePermissions(pluginData.plugin.id);
        const missingApprovals = unsafePermissions.filter((permission) => !approvedPermissions.includes(permission));
        if (missingApprovals.length > 0) {
            const result = await electron_1.dialog.showMessageBox({
                type: "warning",
                buttons: ["Allow", "Disable Plugin", "Cancel"],
                defaultId: 2,
                cancelId: 2,
                title: "Unsafe plugin permissions",
                message: `${pluginData.plugin.name} requests unsafe permissions.`,
                detail: `This plugin wants access to:\n${formatUnsafePermissionDetails(missingApprovals)}\n\nOnly allow this if you trust the plugin author.`
            });
            if (result.response === 1) {
                setPluginDisabled(pluginData.plugin.id, true);
                logWarn(`Plugin disabled after unsafe permission prompt: ${pluginData.plugin.id}`);
                return false;
            }
            if (result.response !== 0) {
                logWarn(`Plugin launch cancelled from unsafe permission prompt: ${pluginData.plugin.id}`);
                return false;
            }
            setApprovedUnsafePermissions(pluginData.plugin.id, [
                ...new Set([...approvedPermissions, ...missingApprovals])
            ]);
        }
    }
    try {
        const dependencyState = await ensurePluginDependencies(pluginData.plugin);
        if (!dependencyState.success) {
            return false;
        }
    }
    catch (error) {
        console.error("Failed to install plugin dependencies:", error);
        logError(`Could not install dependencies for ${pluginData.plugin.id}: ${error instanceof Error ? error.message : "Unknown install error."}`);
        await electron_1.dialog.showMessageBox({
            type: "error",
            buttons: ["OK"],
            title: "Plugin install failed",
            message: `Could not install dependencies for ${pluginData.plugin.name}.`,
            detail: error instanceof Error ? error.message : "Unknown install error."
        });
        return false;
    }
    const windowKey = getPluginWindowKey(pluginId);
    const existingWindow = moduleWindows.get(windowKey);
    if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.show();
        existingWindow.focus();
        logInfo(`Focused existing plugin window: ${pluginId}`);
        notifyPluginStateChanged();
        return true;
    }
    const state = getWindowBounds("notepad", {
        width: 1000,
        height: 700
    });
    const pluginWindow = new electron_1.BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 700,
        minHeight: 500,
        show: true,
        autoHideMenuBar: true,
        title: pluginData.plugin.name,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, "plugin-preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            partition: `pxs-plugin-${pluginId}-${Date.now()}`,
            additionalArguments: [`--pxs-plugin-id=${pluginId}`]
        }
    });
    pluginWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !isPluginNetworkRequestAllowed(details.url, pluginData.plugin) });
    });
    pluginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (pluginHasPermission(pluginData.plugin, "external_links")) {
            void electron_1.shell.openExternal(url);
        }
        return { action: "deny" };
    });
    pluginWindow.webContents.on("will-navigate", (event, url) => {
        if (isPluginNetworkRequestAllowed(url, pluginData.plugin)) {
            return;
        }
        event.preventDefault();
        if (pluginHasPermission(pluginData.plugin, "external_links")) {
            void electron_1.shell.openExternal(url);
        }
    });
    attachWindowStateSave("plugin", pluginWindow);
    const pluginUrl = isDev
        ? `${process.env.VITE_DEV_SERVER_URL}?plugin=${encodeURIComponent(pluginId)}`
        : `file://${node_path_1.default.join(__dirname, "../dist/index.html")}?plugin=${encodeURIComponent(pluginId)}`;
    void pluginWindow.loadURL(pluginUrl);
    logInfo(`Opened plugin window: ${pluginId}`);
    pluginWindow.on("closed", () => {
        moduleWindows.delete(windowKey);
        logInfo(`Closed plugin window: ${pluginId}`);
        notifyPluginStateChanged();
    });
    moduleWindows.set(windowKey, pluginWindow);
    notifyPluginStateChanged();
    return true;
}
function getNotepadWindow() {
    const win = moduleWindows.get("notepad");
    return win && !win.isDestroyed() ? win : null;
}
function updateNotepadWindowTitle(filePath) {
    const win = getNotepadWindow();
    if (!win)
        return;
    const fileName = filePath ? node_path_1.default.basename(filePath) : "Untitled";
    win.setTitle(`Notepad - ${fileName}`);
}
function createTray() {
    const iconPath = node_path_1.default.join(__dirname, "../assets/tray-icon.png");
    const image = electron_1.nativeImage
        .createFromPath(iconPath)
        .resize({ width: 18, height: 18 });
    image.setTemplateImage(true);
    tray = new electron_1.Tray(image);
    tray.setToolTip("Pokenix Studio");
    const showTrayMenu = () => {
        const mainVisible = isUsableWindow(mainWindow) ? mainWindow.isVisible() : false;
        const contextMenu = electron_1.Menu.buildFromTemplate([
            mainVisible
                ? {
                    label: "Hide Main Window",
                    click: () => hideMainWindow()
                }
                : {
                    label: "Open Main Window",
                    click: () => showMainWindow()
                },
            { type: "separator" },
            {
                label: "Quit",
                click: () => {
                    isQuitting = true;
                    electron_1.app.quit();
                }
            }
        ]);
        tray?.popUpContextMenu(contextMenu);
    };
    tray.on("click", showTrayMenu);
    tray.on("right-click", showTrayMenu);
}
function stopUtilityWatcher(webContentsId) {
    const current = utilityWatchers.get(webContentsId);
    if (!current) {
        return { success: true };
    }
    current.watcher.close();
    utilityWatchers.delete(webContentsId);
    return { success: true };
}
async function collectDirectoryEntries(rootPath, currentPath, knownEntries) {
    const entries = await promises_1.default.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = node_path_1.default.join(currentPath, entry.name);
        const relativePath = node_path_1.default.relative(rootPath, absolutePath);
        if (!relativePath) {
            continue;
        }
        if (entry.isDirectory()) {
            knownEntries.set(relativePath, "directory");
            await collectDirectoryEntries(rootPath, absolutePath, knownEntries);
            continue;
        }
        knownEntries.set(relativePath, "file");
    }
}
function applyTodoOrdering(items, moveCompletedToBottom) {
    if (!moveCompletedToBottom) {
        return items;
    }
    const activeItems = items.filter((item) => !item.completed);
    const completedItems = items.filter((item) => item.completed);
    return [...activeItems, ...completedItems];
}
function registerIpcHandlers() {
    electron_1.ipcMain.handle("app:version", () => {
        return electron_1.app.getVersion();
    });
    electron_1.ipcMain.handle("app:open-website", async () => {
        await electron_1.shell.openExternal("https://www.pokenix.com/studio");
        return { success: true };
    });
    electron_1.ipcMain.handle("app:open-external-url", async (_event, url) => {
        const normalizedUrl = String(url || "").trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            return { success: false };
        }
        await electron_1.shell.openExternal(normalizedUrl);
        return { success: true };
    });
    electron_1.ipcMain.handle("app:check-for-updates", async () => {
        if (!electron_1.app.isPackaged) {
            return { success: false, reason: "not-packaged" };
        }
        manualUpdateCheckRequested = true;
        try {
            await electron_updater_1.autoUpdater.checkForUpdates();
            return { success: true };
        }
        catch (error) {
            manualUpdateCheckRequested = false;
            throw error;
        }
    });
    electron_1.ipcMain.handle("app:open-logs-directory", async () => {
        await promises_1.default.mkdir(getLogsDirectory(), { recursive: true });
        await electron_1.shell.openPath(getLogsDirectory());
        return { success: true };
    });
    electron_1.ipcMain.handle("plugins:status", async () => {
        return {
            enabled: arePluginsEnabled(),
            path: getPluginsDirectory(),
            runtimeInstalled: await isPluginNodeRuntimeInstalled()
        };
    });
    electron_1.ipcMain.handle("plugins:enable", async (event) => {
        await ensurePluginNodeRuntimeInstalled(event.sender);
        pluginStore.set("pluginsEnabled", true);
        await ensurePluginsDirectory();
        await ensurePluginRuntimeRootDirectory();
        return {
            enabled: true,
            path: getPluginsDirectory(),
            runtimeInstalled: true
        };
    });
    electron_1.ipcMain.handle("plugins:list", async () => {
        return getInstalledPlugins();
    });
    electron_1.ipcMain.handle("plugins:path", async () => {
        return getPluginsDirectory();
    });
    electron_1.ipcMain.handle("plugins:open-directory", async () => {
        await ensurePluginsDirectory();
        await electron_1.shell.openPath(getPluginsDirectory());
        return { success: true };
    });
    electron_1.ipcMain.handle("plugins:get", async (_event, pluginId) => {
        return getPluginById(pluginId);
    });
    electron_1.ipcMain.handle("plugins:require", async (_event, runtimeDirectory, specifier) => {
        const runtimePackagePath = node_path_1.default.join(runtimeDirectory, "package.json");
        const runtimeRequire = (0, node_module_1.createRequire)(runtimePackagePath);
        return runtimeRequire(specifier);
    });
    electron_1.ipcMain.handle("plugin-host:get-plugin", async (_event, pluginId) => {
        return getPluginById(pluginId);
    });
    electron_1.ipcMain.handle("plugin-host:storage-read-text", async (_event, pluginId, relativePath) => {
        const pluginData = await requirePluginPermission(pluginId, "storage");
        const targetPath = resolvePluginStoragePath(pluginData.pluginDirectory, relativePath);
        return promises_1.default.readFile(targetPath, "utf8");
    });
    electron_1.ipcMain.handle("plugin-host:storage-write-text", async (_event, pluginId, relativePath, content) => {
        const pluginData = await requirePluginPermission(pluginId, "storage");
        const targetPath = resolvePluginStoragePath(pluginData.pluginDirectory, relativePath);
        await promises_1.default.mkdir(node_path_1.default.dirname(targetPath), { recursive: true });
        await promises_1.default.writeFile(targetPath, String(content ?? ""), "utf8");
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:storage-delete", async (_event, pluginId, relativePath) => {
        const pluginData = await requirePluginPermission(pluginId, "storage");
        const targetPath = resolvePluginStoragePath(pluginData.pluginDirectory, relativePath);
        await promises_1.default.rm(targetPath, { recursive: true, force: true });
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:storage-list", async (_event, pluginId) => {
        const pluginData = await requirePluginPermission(pluginId, "storage");
        const dataDirectory = getPluginDataDirectory(pluginData.pluginDirectory);
        await promises_1.default.mkdir(dataDirectory, { recursive: true });
        return promises_1.default.readdir(dataDirectory);
    });
    electron_1.ipcMain.handle("plugin-host:clipboard-read-text", async (_event, pluginId) => {
        await requirePluginPermission(pluginId, "clipboard");
        return electron_1.clipboard.readText();
    });
    electron_1.ipcMain.handle("plugin-host:clipboard-write-text", async (_event, pluginId, text) => {
        await requirePluginPermission(pluginId, "clipboard");
        electron_1.clipboard.writeText(String(text ?? ""));
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:notifications-show", async (_event, pluginId, payload) => {
        await requirePluginPermission(pluginId, "notifications");
        new electron_1.Notification({
            title: String(payload?.title || "Pokenix Studio"),
            body: String(payload?.body || "")
        }).show();
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:choose-directory", async (_event, pluginId) => {
        await requirePluginPermission(pluginId, "filesystem");
        const result = await electron_1.dialog.showOpenDialog({
            properties: ["openDirectory"]
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }
        return { success: true, path: result.filePaths[0] };
    });
    electron_1.ipcMain.handle("plugin-host:list-directory", async (_event, pluginId, directoryPath) => {
        await requirePluginPermission(pluginId, "filesystem");
        const entries = await promises_1.default.readdir(String(directoryPath || ""), { withFileTypes: true });
        return entries.map((entry) => ({
            name: entry.name,
            kind: entry.isDirectory() ? "directory" : "file"
        }));
    });
    electron_1.ipcMain.handle("plugin-host:read-text-file", async (_event, pluginId, targetPath) => {
        await requirePluginPermission(pluginId, "filesystem");
        return promises_1.default.readFile(String(targetPath || ""), "utf8");
    });
    electron_1.ipcMain.handle("plugin-host:write-text-file", async (_event, pluginId, targetPath, content) => {
        await requirePluginPermission(pluginId, "filesystem");
        await promises_1.default.writeFile(String(targetPath || ""), String(content ?? ""), "utf8");
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:delete-path", async (_event, pluginId, targetPath) => {
        await requirePluginPermission(pluginId, "filesystem");
        await promises_1.default.rm(String(targetPath || ""), { recursive: true, force: true });
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:open-path", async (_event, pluginId, targetPath) => {
        await requirePluginPermission(pluginId, "filesystem");
        await electron_1.shell.openPath(String(targetPath || ""));
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:network-request", async (_event, pluginId, url, init) => {
        await requirePluginPermission(pluginId, "network");
        const response = await fetch(String(url || ""), {
            method: init?.method,
            headers: init?.headers,
            body: init?.body
        });
        const body = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body
        };
    });
    electron_1.ipcMain.handle("plugin-host:open-external", async (_event, pluginId, url) => {
        await requirePluginPermission(pluginId, "external_links");
        await electron_1.shell.openExternal(String(url || ""));
        return { success: true };
    });
    electron_1.ipcMain.handle("plugin-host:process-run", async (_event, pluginId, command, args) => {
        await requirePluginPermission(pluginId, "process");
        return new Promise((resolve, reject) => {
            const child = (0, node_child_process_1.spawn)(String(command || ""), Array.isArray(args) ? args : [], {
                shell: false
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (chunk) => {
                stdout += chunk.toString();
            });
            child.stderr.on("data", (chunk) => {
                stderr += chunk.toString();
            });
            child.on("error", (error) => {
                reject(error);
            });
            child.on("close", (code) => {
                resolve({
                    success: code === 0,
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim()
                });
            });
        });
    });
    electron_1.ipcMain.handle("plugin-host:require", async (_event, pluginId, specifier) => {
        const pluginData = await requirePluginPermission(pluginId, "native_modules");
        const runtimePackagePath = node_path_1.default.join(pluginData.runtimeDirectory, "package.json");
        const runtimeRequire = (0, node_module_1.createRequire)(runtimePackagePath);
        return runtimeRequire(specifier);
    });
    electron_1.ipcMain.handle("plugins:open", async (_event, pluginId) => {
        const success = await createPluginWindow(pluginId);
        return { success };
    });
    electron_1.ipcMain.handle("plugins:close", async (_event, pluginId) => {
        return closePluginWindow(pluginId);
    });
    electron_1.ipcMain.handle("plugins:close-all", async () => {
        return closeAllPluginWindows();
    });
    electron_1.ipcMain.handle("plugins:disable", async (_event, pluginId) => {
        setPluginDisabled(pluginId, true);
        return { success: true };
    });
    electron_1.ipcMain.handle("plugins:disable-all", async () => {
        return disableAllPlugins();
    });
    electron_1.ipcMain.handle("plugins:enable-all", async () => {
        return enableAllPlugins();
    });
    electron_1.ipcMain.handle("plugins:enable-one", async (_event, pluginId) => {
        setPluginDisabled(pluginId, false);
        return { success: true };
    });
    electron_1.ipcMain.handle("plugins:delete", async (_event, pluginId) => {
        return deletePlugin(pluginId);
    });
    electron_1.ipcMain.handle("plugins:disable-globally", async () => {
        return disablePluginsGlobally();
    });
    electron_1.ipcMain.handle("plugins:reset", async () => {
        return resetPlugins();
    });
    electron_1.ipcMain.handle("plugins:update-runtime", async (event) => {
        if (!arePluginsEnabled()) {
            return {
                success: false,
                reason: "plugins-disabled"
            };
        }
        await ensurePluginNodeRuntimeInstalled(event.sender, true);
        return {
            success: true,
            version: runtime_config_1.PLUGIN_NODE_VERSION
        };
    });
    electron_1.ipcMain.handle("settings:get", () => {
        return getSettings();
    });
    electron_1.ipcMain.handle("settings:set", (_event, key, value) => {
        try {
            if (key === "startWithSystem" && !value) {
                settingsStore.set("startWithSystem", false);
                settingsStore.set("startMinimized", false);
            }
            else {
                settingsStore.set(key, value);
            }
            logInfo(`Setting updated: ${key}=${String(value)}`);
            if (key === "startWithSystem" || key === "startMinimized") {
                updateLoginItemSettings();
            }
            return {
                success: true,
                settings: getSettings(),
                path: settingsStore.path
            };
        }
        catch (error) {
            console.error("Failed to save setting:", key, error);
            logError(`Failed to save setting ${String(key)}: ${error instanceof Error ? error.message : "Unknown error."}`);
            return {
                success: false,
                settings: getSettings(),
                path: settingsStore.path
            };
        }
    });
    electron_1.ipcMain.handle("settings:path", () => {
        return getConfigDirectory();
    });
    electron_1.ipcMain.handle("settings:reset", () => {
        try {
            settingsStore.set("startWithSystem", defaultSettings.startWithSystem);
            settingsStore.set("startMinimized", defaultSettings.startMinimized);
            settingsStore.set("closeToTray", defaultSettings.closeToTray);
            settingsStore.set("darkTheme", defaultSettings.darkTheme);
            settingsStore.set("openNewTabs", defaultSettings.openNewTabs);
            settingsStore.set("developerMode", defaultSettings.developerMode);
            updateLoginItemSettings();
            return {
                success: true,
                settings: getSettings(),
                path: settingsStore.path
            };
        }
        catch (error) {
            console.error("Failed to reset settings:", error);
            logError(`Failed to reset settings: ${error instanceof Error ? error.message : "Unknown error."}`);
            return {
                success: false,
                settings: getSettings(),
                path: settingsStore.path
            };
        }
    });
    electron_1.ipcMain.handle("module:open", (_event, moduleId) => {
        const moduleMap = {
            notepad: "Notepad",
            "todo-list": "To-Do List",
            counter: "Counter",
            clock: "Clock",
            "timer-alarm": "Timer & Alarm",
            calculator: "Calculator",
            "utility-tools": "Utility Tools",
            "pokenix-actions": "Pokenix Actions"
        };
        const title = moduleMap[moduleId];
        if (!title) {
            return { success: false };
        }
        createModuleWindow(moduleId, title);
        return { success: true };
    });
    electron_1.ipcMain.handle("window-state:reset", () => {
        const mainState = {
            width: 1200,
            height: 800
        };
        const notepadState = {
            width: 1000,
            height: 700
        };
        const pluginState = {
            width: 1000,
            height: 700
        };
        windowStateStore.set("main", mainState);
        windowStateStore.set("notepad", notepadState);
        windowStateStore.set("plugin", pluginState);
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            }
            mainWindow.setBounds(mainState);
            mainWindow.center();
        }
        for (const [windowKey, win] of moduleWindows.entries()) {
            if (!win.isDestroyed()) {
                if (win.isMaximized()) {
                    win.unmaximize();
                }
                const targetState = windowKey === "notepad" ? notepadState : pluginState;
                win.setBounds(targetState);
                win.center();
            }
        }
        return { success: true };
    });
    electron_1.ipcMain.handle("utility:choose-directory", async () => {
        const result = await electron_1.dialog.showOpenDialog({
            title: "Choose Directory",
            properties: ["openDirectory"]
        });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }
        return {
            success: true,
            path: result.filePaths[0]
        };
    });
    electron_1.ipcMain.handle("utility:open-directory", async (_event, directoryPath) => {
        const normalizedDirectoryPath = String(directoryPath || "").trim();
        if (!normalizedDirectoryPath) {
            return { success: false };
        }
        await electron_1.shell.openPath(normalizedDirectoryPath);
        return { success: true };
    });
    electron_1.ipcMain.handle("utility:start-file-watcher", async (event, directoryPath) => {
        const normalizedDirectoryPath = String(directoryPath || "").trim();
        if (!normalizedDirectoryPath) {
            return {
                success: false,
                error: "Choose a path first."
            };
        }
        try {
            const stat = await promises_1.default.stat(normalizedDirectoryPath);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: "The selected path is not a directory."
                };
            }
            await promises_1.default.access(normalizedDirectoryPath, node_fs_1.constants.R_OK);
        }
        catch (error) {
            const code = String(error?.code || "");
            if (code === "ENOENT") {
                return {
                    success: false,
                    error: "The selected path does not exist anymore."
                };
            }
            if (code === "EACCES" || code === "EPERM") {
                return {
                    success: false,
                    error: "Pokenix Studio does not have permission to read that path."
                };
            }
            return {
                success: false,
                error: "Could not watch the selected path."
            };
        }
        stopUtilityWatcher(event.sender.id);
        const sendWatcherEvent = (message) => {
            if (event.sender.isDestroyed())
                return;
            event.sender.send("utility:file-watcher-event", {
                message
            });
        };
        const knownEntries = new Map();
        try {
            await collectDirectoryEntries(normalizedDirectoryPath, normalizedDirectoryPath, knownEntries);
        }
        catch {
            return {
                success: false,
                error: "Could not read the selected path."
            };
        }
        const watcher = (0, node_fs_1.watch)(normalizedDirectoryPath, { recursive: true }, async (eventType, fileName) => {
            const displayName = typeof fileName === "string" && fileName.trim() ? fileName : "(unknown item)";
            const relativePath = typeof fileName === "string" && fileName.trim() ? node_path_1.default.normalize(fileName) : null;
            const targetPath = typeof fileName === "string" && fileName.trim()
                ? node_path_1.default.join(normalizedDirectoryPath, fileName)
                : null;
            const formatEventMessage = (action, itemType) => {
                const formattedName = itemType === "directory" ? `${displayName}/` : displayName;
                if (!itemType) {
                    return `${action}: ${formattedName}`;
                }
                return `${action} ${itemType}: ${formattedName}`;
            };
            try {
                await promises_1.default.access(normalizedDirectoryPath, node_fs_1.constants.F_OK);
            }
            catch (error) {
                const code = String(error?.code || "");
                if (code === "ENOENT") {
                    sendWatcherEvent("Selected path was deleted.");
                    stopUtilityWatcher(event.sender.id);
                    return;
                }
            }
            if (eventType === "rename") {
                if (!targetPath) {
                    sendWatcherEvent(`Changed: ${displayName}`);
                    return;
                }
                try {
                    const targetStat = await promises_1.default.stat(targetPath);
                    const itemType = targetStat.isDirectory() ? "directory" : "file";
                    if (relativePath) {
                        knownEntries.set(relativePath, itemType);
                    }
                    sendWatcherEvent(formatEventMessage("Created", itemType));
                }
                catch (error) {
                    const code = String(error?.code || "");
                    if (code === "ENOENT") {
                        const previousType = relativePath ? knownEntries.get(relativePath) : undefined;
                        if (relativePath) {
                            knownEntries.delete(relativePath);
                        }
                        sendWatcherEvent(formatEventMessage("Deleted", previousType));
                        return;
                    }
                    sendWatcherEvent(formatEventMessage("Changed"));
                }
                return;
            }
            let itemType = relativePath ? knownEntries.get(relativePath) : undefined;
            if (!itemType && targetPath) {
                try {
                    const targetStat = await promises_1.default.stat(targetPath);
                    itemType = targetStat.isDirectory() ? "directory" : "file";
                    if (relativePath) {
                        knownEntries.set(relativePath, itemType);
                    }
                }
                catch { }
            }
            sendWatcherEvent(formatEventMessage("Modified", itemType));
        });
        watcher.on("error", (error) => {
            const code = String(error?.code || "");
            if (code === "ENOENT") {
                sendWatcherEvent("Selected path was deleted.");
            }
            else {
                sendWatcherEvent(error instanceof Error ? `Watcher error: ${error.message}` : "Watcher error.");
            }
            stopUtilityWatcher(event.sender.id);
        });
        if (!event.sender.isDestroyed()) {
            event.sender.once("destroyed", () => {
                stopUtilityWatcher(event.sender.id);
            });
        }
        utilityWatchers.set(event.sender.id, {
            watcher,
            path: normalizedDirectoryPath,
            knownEntries
        });
        return {
            success: true,
            path: normalizedDirectoryPath
        };
    });
    electron_1.ipcMain.handle("utility:stop-file-watcher", async (event) => {
        return stopUtilityWatcher(event.sender.id);
    });
    electron_1.ipcMain.handle("utility:get-directory-item-count", async (_event, directoryPath) => {
        const normalizedDirectoryPath = String(directoryPath || "").trim();
        if (!normalizedDirectoryPath) {
            return { success: false };
        }
        try {
            const stat = await promises_1.default.stat(normalizedDirectoryPath);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: "The selected path is not a directory."
                };
            }
            const entries = await promises_1.default.readdir(normalizedDirectoryPath);
            return {
                success: true,
                count: entries.length
            };
        }
        catch (error) {
            const code = String(error?.code || "");
            if (code === "ENOENT") {
                return {
                    success: false,
                    error: "The selected path does not exist anymore."
                };
            }
            if (code === "EACCES" || code === "EPERM") {
                return {
                    success: false,
                    error: "Pokenix Studio does not have permission to read that path."
                };
            }
            return {
                success: false,
                error: "Could not read the selected path."
            };
        }
    });
    electron_1.ipcMain.handle("utility:get-directory-tree", async (_event, directoryPath, options) => {
        const normalizedDirectoryPath = String(directoryPath || "").trim();
        if (!normalizedDirectoryPath) {
            return {
                success: false,
                error: "Choose a path first."
            };
        }
        try {
            const stat = await promises_1.default.stat(normalizedDirectoryPath);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: "The selected path is not a directory."
                };
            }
            await promises_1.default.access(normalizedDirectoryPath, node_fs_1.constants.R_OK);
            const rootName = node_path_1.default.basename(normalizedDirectoryPath) || normalizedDirectoryPath;
            const lines = [
                `${rootName}/`,
                ...(await buildDirectoryTreeLines(normalizedDirectoryPath, {
                    hideEmptyFolders: Boolean(options?.hideEmptyFolders),
                    hideHiddenFiles: Boolean(options?.hideHiddenFiles)
                }))
            ];
            return {
                success: true,
                tree: lines.join("\n")
            };
        }
        catch (error) {
            const code = String(error?.code || "");
            if (code === "ENOENT") {
                return {
                    success: false,
                    error: "The selected path does not exist anymore."
                };
            }
            if (code === "EACCES" || code === "EPERM") {
                return {
                    success: false,
                    error: "Pokenix Studio does not have permission to read that path."
                };
            }
            return {
                success: false,
                error: "Could not read the selected path."
            };
        }
    });
    electron_1.ipcMain.handle("utility:validate-directory-name", async (_event, name) => {
        const error = validateDirectoryName(name);
        return {
            success: !error,
            error
        };
    });
    electron_1.ipcMain.handle("utility:create-directories", async (_event, basePath, directories) => {
        if (!basePath || !Array.isArray(directories) || directories.length === 0) {
            return { success: false };
        }
        const normalizedBasePath = String(basePath || "").trim();
        if (!normalizedBasePath) {
            return {
                success: false,
                error: "Choose a path first."
            };
        }
        try {
            const basePathStat = await promises_1.default.stat(normalizedBasePath);
            if (!basePathStat.isDirectory()) {
                return {
                    success: false,
                    error: "The selected path is not a directory."
                };
            }
            await promises_1.default.access(normalizedBasePath, node_fs_1.constants.W_OK);
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error) {
                const code = String(error.code || "");
                if (code === "ENOENT") {
                    return {
                        success: false,
                        error: "The selected path does not exist anymore."
                    };
                }
                if (code === "EACCES" || code === "EPERM") {
                    return {
                        success: false,
                        error: "Pokenix Studio does not have permission to write to that path."
                    };
                }
            }
            return {
                success: false,
                error: "Could not access the selected path."
            };
        }
        const created = [];
        const failed = [];
        for (const directory of directories) {
            const name = String(directory || "").trim();
            if (!name)
                continue;
            const validationError = validateDirectoryName(name);
            if (validationError) {
                failed.push(`${name}: ${validationError}`);
                continue;
            }
            const targetPath = node_path_1.default.join(normalizedBasePath, name);
            try {
                const existingStat = await promises_1.default.stat(targetPath);
                if (existingStat.isDirectory()) {
                    failed.push(`${name}: Directory already exists.`);
                    continue;
                }
            }
            catch { }
            try {
                await promises_1.default.mkdir(targetPath);
                created.push(targetPath);
            }
            catch (error) {
                failed.push(`${name}: ${error instanceof Error ? error.message : "Could not create directory."}`);
            }
        }
        if (failed.length > 0) {
            return {
                success: false,
                error: failed.join("\n"),
                created
            };
        }
        return {
            success: true,
            created
        };
    });
    electron_1.ipcMain.handle("utility:check-transfer-conflicts", async (_event, oldPath, newPath) => {
        const validation = await validateTransferPaths(oldPath, newPath);
        if (!validation.success) {
            return validation;
        }
        return {
            success: true,
            conflicts: validation.conflicts
        };
    });
    electron_1.ipcMain.handle("utility:transfer-files", async (_event, oldPath, newPath, mode, replaceExisting, deleteOldDirectory) => {
        const validation = await validateTransferPaths(oldPath, newPath);
        if (!validation.success) {
            return validation;
        }
        if (validation.conflicts.length > 0 && !replaceExisting) {
            return {
                success: false,
                error: "Some files or folders already exist in the new path.",
                conflicts: validation.conflicts
            };
        }
        const transferred = [];
        try {
            for (const entryName of validation.entryNames) {
                const sourceEntryPath = node_path_1.default.join(validation.sourcePath, entryName);
                const destinationEntryPath = node_path_1.default.join(validation.destinationPath, entryName);
                const sourceItems = await collectTransferredItems(validation.sourcePath, entryName);
                if (replaceExisting) {
                    await promises_1.default.rm(destinationEntryPath, {
                        recursive: true,
                        force: true
                    });
                }
                if (mode === "copy") {
                    await promises_1.default.cp(sourceEntryPath, destinationEntryPath, {
                        recursive: true,
                        force: replaceExisting
                    });
                }
                else {
                    await movePath(sourceEntryPath, destinationEntryPath);
                }
                transferred.push(...sourceItems);
            }
            if (deleteOldDirectory) {
                await promises_1.default.rm(validation.sourcePath, {
                    recursive: true,
                    force: true
                });
            }
        }
        catch (error) {
            const code = String(error?.code || "");
            if (code === "EACCES" || code === "EPERM") {
                return {
                    success: false,
                    error: "Pokenix Studio does not have permission to complete that transfer."
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : "Could not transfer files."
            };
        }
        return {
            success: true,
            transferred
        };
    });
    electron_1.ipcMain.handle("utility:counter-get", async () => {
        return {
            currentValue: counterStore.get("currentValue"),
            history: counterStore.get("history")
        };
    });
    electron_1.ipcMain.handle("utility:counter-increment", async () => {
        const nextValue = counterStore.get("currentValue") + 1;
        counterStore.set("currentValue", nextValue);
        return {
            currentValue: nextValue,
            history: counterStore.get("history")
        };
    });
    electron_1.ipcMain.handle("utility:counter-save", async () => {
        const nextItem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            value: counterStore.get("currentValue"),
            timestamp: new Date().toLocaleString("tr-TR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            })
        };
        const nextHistory = [nextItem, ...counterStore.get("history")];
        counterStore.set("history", nextHistory);
        return {
            currentValue: counterStore.get("currentValue"),
            history: nextHistory
        };
    });
    electron_1.ipcMain.handle("utility:counter-set", async (_event, value) => {
        const normalizedValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
        counterStore.set("currentValue", normalizedValue);
        return {
            currentValue: normalizedValue,
            history: counterStore.get("history")
        };
    });
    electron_1.ipcMain.handle("utility:counter-delete-entry", async (_event, entryId) => {
        const nextHistory = counterStore.get("history").filter((item) => item.id !== entryId);
        counterStore.set("history", nextHistory);
        return {
            currentValue: counterStore.get("currentValue"),
            history: nextHistory
        };
    });
    electron_1.ipcMain.handle("utility:counter-clear", async () => {
        counterStore.set("currentValue", 0);
        counterStore.set("history", []);
        return {
            currentValue: 0,
            history: []
        };
    });
    electron_1.ipcMain.handle("utility:timer-alarm-get", async () => {
        const alarms = timerAlarmStore.get("alarms").map((alarm) => ({
            ...alarm,
            dismissed: Boolean(alarm.dismissed)
        }));
        return {
            elapsed: timerAlarmStore.get("elapsed"),
            laps: timerAlarmStore.get("laps"),
            countdownRemaining: timerAlarmStore.get("countdownRemaining"),
            alarms
        };
    });
    electron_1.ipcMain.handle("utility:timer-alarm-set", async (_event, payload) => {
        const nextElapsed = Number.isFinite(payload.elapsed) ? Math.max(0, Math.trunc(payload.elapsed)) : 0;
        const nextLaps = Array.isArray(payload.laps) ? payload.laps : [];
        const nextCountdownRemaining = Number.isFinite(payload.countdownRemaining)
            ? Math.max(0, Math.trunc(payload.countdownRemaining))
            : 0;
        const nextAlarms = Array.isArray(payload.alarms)
            ? payload.alarms.map((alarm) => ({
                ...alarm,
                dismissed: Boolean(alarm.dismissed)
            }))
            : [];
        timerAlarmStore.set("elapsed", nextElapsed);
        timerAlarmStore.set("laps", nextLaps);
        timerAlarmStore.set("countdownRemaining", nextCountdownRemaining);
        timerAlarmStore.set("alarms", nextAlarms);
        return {
            elapsed: nextElapsed,
            laps: nextLaps,
            countdownRemaining: nextCountdownRemaining,
            alarms: nextAlarms
        };
    });
    electron_1.ipcMain.handle("utility:save-qr-image", async (event, dataUrl) => {
        try {
            const image = electron_1.nativeImage.createFromDataURL(dataUrl);
            const buffer = image.toPNG();
            const randomSuffix = Math.random().toString(36).slice(2, 14);
            const parentWindow = electron_1.BrowserWindow.fromWebContents(event.sender);
            const saveResult = parentWindow
                ? await electron_1.dialog.showSaveDialog(parentWindow, {
                    title: "Save QR Code",
                    defaultPath: node_path_1.default.join(electron_1.app.getPath("desktop"), `Pokenix Studio QR ${randomSuffix}.png`),
                    filters: [{ name: "PNG Image", extensions: ["png"] }]
                })
                : await electron_1.dialog.showSaveDialog({
                    title: "Save QR Code",
                    defaultPath: node_path_1.default.join(electron_1.app.getPath("desktop"), `Pokenix Studio QR ${randomSuffix}.png`),
                    filters: [{ name: "PNG Image", extensions: ["png"] }]
                });
            if (saveResult.canceled || !saveResult.filePath) {
                return {
                    success: false,
                    error: "Save cancelled."
                };
            }
            await promises_1.default.writeFile(saveResult.filePath, buffer);
            return {
                success: true,
                path: saveResult.filePath
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Could not save QR image."
            };
        }
    });
    electron_1.ipcMain.handle("utility:copy-qr-image", async (_event, dataUrl) => {
        try {
            const image = electron_1.nativeImage.createFromDataURL(dataUrl);
            electron_1.clipboard.writeImage(image);
            return {
                success: true
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Could not copy QR image."
            };
        }
    });
    electron_1.ipcMain.handle("notepad:get-content", () => {
        const filePath = notesStore.get("notepadFilePath");
        updateNotepadWindowTitle(filePath);
        return {
            content: notesStore.get("notepadContent"),
            filePath
        };
    });
    electron_1.ipcMain.handle("notepad:set-content", (_event, content, filePath) => {
        notesStore.set("notepadContent", content);
        notesStore.set("notepadFilePath", filePath);
        return { success: true };
    });
    electron_1.ipcMain.handle("notepad:clear", () => {
        notesStore.set("notepadContent", "");
        notesStore.set("notepadFilePath", "");
        updateNotepadWindowTitle("");
        return { success: true };
    });
    electron_1.ipcMain.handle("notepad:open-file", async () => {
        const win = getNotepadWindow();
        const result = win
            ? await electron_1.dialog.showOpenDialog(win, {
                title: "Open File",
                properties: ["openFile"],
                filters: [
                    {
                        name: "Text Files",
                        extensions: ["txt", "md", "json", "js", "ts", "html", "css"]
                    },
                    { name: "All Files", extensions: ["*"] }
                ]
            })
            : await electron_1.dialog.showOpenDialog({
                title: "Open File",
                properties: ["openFile"],
                filters: [
                    {
                        name: "Text Files",
                        extensions: ["txt", "md", "json", "js", "ts", "html", "css"]
                    },
                    { name: "All Files", extensions: ["*"] }
                ]
            });
        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }
        const filePath = result.filePaths[0];
        const content = await promises_1.default.readFile(filePath, "utf8");
        notesStore.set("notepadContent", content);
        notesStore.set("notepadFilePath", filePath);
        updateNotepadWindowTitle(filePath);
        return {
            success: true,
            content,
            filePath
        };
    });
    electron_1.ipcMain.handle("notepad:save-file", async (_event, content, filePath) => {
        if (!filePath) {
            return { success: false, needsSaveAs: true };
        }
        await promises_1.default.writeFile(filePath, content, "utf8");
        notesStore.set("notepadContent", content);
        notesStore.set("notepadFilePath", filePath);
        updateNotepadWindowTitle(filePath);
        return {
            success: true,
            filePath
        };
    });
    electron_1.ipcMain.handle("notepad:save-file-as", async (_event, content, currentPath) => {
        const win = getNotepadWindow();
        const defaultPath = currentPath || "Untitled.txt";
        const result = win
            ? await electron_1.dialog.showSaveDialog(win, {
                title: "Save File As",
                defaultPath,
                filters: [
                    { name: "Text Files", extensions: ["txt"] },
                    { name: "Markdown Files", extensions: ["md"] },
                    { name: "All Files", extensions: ["*"] }
                ]
            })
            : await electron_1.dialog.showSaveDialog({
                title: "Save File As",
                defaultPath,
                filters: [
                    { name: "Text Files", extensions: ["txt"] },
                    { name: "Markdown Files", extensions: ["md"] },
                    { name: "All Files", extensions: ["*"] }
                ]
            });
        if (result.canceled || !result.filePath) {
            return { success: false };
        }
        await promises_1.default.writeFile(result.filePath, content, "utf8");
        notesStore.set("notepadContent", content);
        notesStore.set("notepadFilePath", result.filePath);
        updateNotepadWindowTitle(result.filePath);
        return {
            success: true,
            filePath: result.filePath
        };
    });
    electron_1.ipcMain.on("notepad:set-dirty-state", (event, dirty) => {
        const win = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (!win)
            return;
        notepadDirtyState.set(win.id, Boolean(dirty));
    });
    electron_1.ipcMain.on("notepad:save-all-result", () => {
    });
    electron_1.ipcMain.handle("todos:list", () => {
        return {
            items: todosStore.get("items"),
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
    electron_1.ipcMain.handle("todos:add", (_event, text) => {
        const trimmedText = String(text || "").trim();
        if (!trimmedText) {
            return {
                success: false,
                items: todosStore.get("items")
            };
        }
        const nextItems = applyTodoOrdering([
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                text: trimmedText,
                completed: false,
                createdAt: Date.now()
            },
            ...todosStore.get("items")
        ], todosStore.get("moveCompletedToBottom"));
        todosStore.set("items", nextItems);
        return {
            success: true,
            items: nextItems,
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
    electron_1.ipcMain.handle("todos:toggle", (_event, id) => {
        const nextItems = applyTodoOrdering(todosStore.get("items").map((item) => item.id === id
            ? {
                ...item,
                completed: !item.completed
            }
            : item), todosStore.get("moveCompletedToBottom"));
        todosStore.set("items", nextItems);
        return {
            success: true,
            items: nextItems,
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
    electron_1.ipcMain.handle("todos:delete", (_event, id) => {
        const nextItems = todosStore.get("items").filter((item) => item.id !== id);
        todosStore.set("items", nextItems);
        return {
            success: true,
            items: nextItems,
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
    electron_1.ipcMain.handle("todos:reorder", (_event, orderedIds) => {
        const currentItems = todosStore.get("items");
        const currentMap = new Map(currentItems.map((item) => [item.id, item]));
        const nextItems = orderedIds
            .map((id) => currentMap.get(id))
            .filter((item) => Boolean(item));
        const remainingItems = currentItems.filter((item) => !orderedIds.includes(item.id));
        const finalItems = applyTodoOrdering([...nextItems, ...remainingItems], todosStore.get("moveCompletedToBottom"));
        todosStore.set("items", finalItems);
        return {
            success: true,
            items: finalItems,
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
    electron_1.ipcMain.handle("todos:set-move-completed-to-bottom", (_event, value) => {
        todosStore.set("moveCompletedToBottom", Boolean(value));
        const nextItems = applyTodoOrdering(todosStore.get("items"), Boolean(value));
        todosStore.set("items", nextItems);
        return {
            success: true,
            items: nextItems,
            moveCompletedToBottom: Boolean(value)
        };
    });
    electron_1.ipcMain.handle("todos:clear-completed", () => {
        const nextItems = todosStore.get("items").filter((item) => !item.completed);
        todosStore.set("items", nextItems);
        return {
            success: true,
            items: nextItems,
            moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
        };
    });
}
electron_1.app.whenReady().then(async () => {
    await initStores();
    logInfo(`App started. Version ${electron_1.app.getVersion()}.`);
    registerIpcHandlers();
    configureAutoUpdater();
    createApplicationMenu();
    createTray();
    createMainWindow(shouldStartMinimizedOnLaunch());
    if (pluginStore.get("pluginsEnabled")) {
        void ensurePluginNodeRuntimeInstalled(mainWindow?.webContents ?? null).catch((error) => {
            console.error("Failed to update plugin runtime:", error);
            logError(`Failed to update plugin runtime: ${error instanceof Error ? error.message : "Unknown error."}`);
        });
    }
    updateLoginItemSettings();
    if (electron_1.app.isPackaged) {
        void electron_updater_1.autoUpdater.checkForUpdatesAndNotify().catch((error) => {
            logError(`Failed to check for updates: ${error instanceof Error ? error.message : "Unknown error."}`);
        });
    }
    electron_1.app.on("activate", () => {
        logInfo("App activate event fired.");
        showMainWindow();
    });
});
electron_1.app.on("before-quit", () => {
    isQuitting = true;
    logInfo("App is quitting.");
});
electron_1.app.on("window-all-closed", () => {
    logInfo("All windows closed.");
});
process.on("uncaughtException", (error) => {
    logError(`Uncaught exception: ${error instanceof Error ? error.stack || error.message : String(error)}`);
});
process.on("unhandledRejection", (reason) => {
    logError(`Unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
});
