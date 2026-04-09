import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  nativeImage,
  ipcMain,
  dialog,
  WebContents
} from "electron"
import path from "node:path"
import { constants, watch as fsWatch, type FSWatcher } from "node:fs"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import { spawn } from "node:child_process"
import https from "node:https"
import { autoUpdater } from "electron-updater"
import log from "electron-log"
import { PLUGIN_NODE_VERSION } from "./runtime-config"

app.setName("Pokenix Studio")

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let updateProgressWindow: BrowserWindow | null = null

const moduleWindows = new Map<string, BrowserWindow>()
const utilityWatchers = new Map<
  number,
  {
    watcher: FSWatcher
    path: string
    knownEntries: Map<string, "file" | "directory">
  }
>()
const isDev = !!process.env.VITE_DEV_SERVER_URL
const forceCloseWindowIds = new Set<number>()
const notepadDirtyState = new Map<number, boolean>()
const LOG_FILE_NAME = "pxs_logs.log"
const LOG_FILE_MAX_SIZE = 15 * 1024 * 1024

type SettingsStore = {
  startWithSystem: boolean
  closeToTray: boolean
  darkTheme: boolean
  openNewTabs: boolean
  developerMode: boolean
}

type Page = "home" | "plugins" | "themes" | "settings" | "console"

type NotesStore = {
  notepadContent: string
  notepadFilePath: string
}

type TodoItem = {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

type TodosStore = {
  items: TodoItem[]
  moveCompletedToBottom: boolean
}

type PluginStore = {
  pluginsEnabled: boolean
  disabledPluginIds: string[]
  approvedUnsafePermissions: Record<string, string[]>
}

type WindowState = {
  x?: number
  y?: number
  width: number
  height: number
}

type WindowStateStore = {
  main: WindowState
  notepad: WindowState
  plugin: WindowState
}

type StoreLike<T> = {
  get: <K extends keyof T>(key: K) => T[K]
  set: <K extends keyof T>(key: K, value: T[K]) => void
  path: string
}

type StoreMigration = {
  oldPath: string
  newPath: string
}

type PluginManifest = {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  entry: string
  style?: string
  dependencies?: Record<string, string>
  permissions?: string[]
}

const PLUGIN_PERMISSION_RULES: Record<
  string,
  {
    safe: boolean
    description: string
  }
> = {
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
}

type PluginRecord = {
  directory: string
  manifest: PluginManifest
}

type PluginSetupProgress = {
  phase: "preparing" | "downloading" | "extracting" | "finalizing" | "ready"
  message: string
  percent?: number
}

const defaultSettings: SettingsStore = {
  startWithSystem: false,
  closeToTray: true,
  darkTheme: true,
  openNewTabs: true,
  developerMode: false
}

let settingsStore: StoreLike<SettingsStore>
let notesStore: StoreLike<NotesStore>
let todosStore: StoreLike<TodosStore>
let windowStateStore: StoreLike<WindowStateStore>
let pluginStore: StoreLike<PluginStore>

async function movePathIfNeeded(oldPath: string, newPath: string) {
  try {
    await fs.access(newPath)
    return
  } catch {}

  try {
    await fs.access(oldPath)
  } catch {
    return
  }

  await fs.mkdir(path.dirname(newPath), { recursive: true })
  await fs.rename(oldPath, newPath)
}

async function migrateAppDataLayout() {
  const rootDirectory = getConfigDirectory()
  const settingsDirectory = getSettingsDirectory()
  const dataDirectory = getDataDirectory()
  const logsDirectory = getLogsDirectory()
  const runtimeDirectory = getPluginRuntimeRootDirectory()

  await fs.mkdir(settingsDirectory, { recursive: true })
  await fs.mkdir(dataDirectory, { recursive: true })
  await fs.mkdir(logsDirectory, { recursive: true })

  const migrations: StoreMigration[] = [
    {
      oldPath: path.join(rootDirectory, "config.json"),
      newPath: path.join(settingsDirectory, "config.json")
    },
    {
      oldPath: path.join(rootDirectory, "window-state.json"),
      newPath: path.join(settingsDirectory, "window-state.json")
    },
    {
      oldPath: path.join(rootDirectory, "plugins.json"),
      newPath: path.join(settingsDirectory, "plugins.json")
    },
    {
      oldPath: path.join(rootDirectory, "notes.json"),
      newPath: path.join(dataDirectory, "notes.json")
    },
    {
      oldPath: path.join(rootDirectory, "todos.json"),
      newPath: path.join(dataDirectory, "todos.json")
    },
    {
      oldPath: path.join(rootDirectory, "plugin-runtime"),
      newPath: runtimeDirectory
    }
  ]

  for (const migration of migrations) {
    await movePathIfNeeded(migration.oldPath, migration.newPath)
  }
}

async function initStores() {
  const { default: Store } = await import("electron-store")

  await migrateAppDataLayout()

  settingsStore = new Store<SettingsStore>({
    cwd: getSettingsDirectory(),
    name: "config",
    defaults: defaultSettings
  }) as StoreLike<SettingsStore>

  notesStore = new Store<NotesStore>({
    cwd: getDataDirectory(),
    name: "notes",
    defaults: {
      notepadContent: "",
      notepadFilePath: ""
    }
  }) as StoreLike<NotesStore>

  todosStore = new Store<TodosStore>({
    cwd: getDataDirectory(),
    name: "todos",
    defaults: {
      items: [],
      moveCompletedToBottom: true
    }
  }) as StoreLike<TodosStore>

  pluginStore = new Store<PluginStore>({
    cwd: getSettingsDirectory(),
    name: "plugins",
    defaults: {
      pluginsEnabled: false,
      disabledPluginIds: [],
      approvedUnsafePermissions: {}
    }
  }) as StoreLike<PluginStore>

  windowStateStore = new Store<WindowStateStore>({
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
  }) as StoreLike<WindowStateStore>
}

function getSettings(): SettingsStore {
  return {
    startWithSystem: settingsStore.get("startWithSystem"),
    closeToTray: settingsStore.get("closeToTray"),
    darkTheme: settingsStore.get("darkTheme"),
    openNewTabs: settingsStore.get("openNewTabs"),
    developerMode: settingsStore.get("developerMode")
  }
}

function getConfigDirectory() {
  return app.getPath("userData")
}

function getSettingsDirectory() {
  return path.join(getConfigDirectory(), "settings")
}

function getDataDirectory() {
  return path.join(getConfigDirectory(), "data")
}

function getLogsDirectory() {
  return path.join(getConfigDirectory(), "logs")
}

function getLogFilePath() {
  return path.join(getLogsDirectory(), LOG_FILE_NAME)
}

function trimLogContentToLimit(content: string, maxBytes: number) {
  let current = content

  while (Buffer.byteLength(current, "utf8") > maxBytes) {
    const newlineIndex = current.indexOf("\n")

    if (newlineIndex === -1) {
      return current.slice(-maxBytes)
    }

    current = current.slice(newlineIndex + 1)
  }

  return current
}

function formatLogTimestamp() {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, "0")
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const year = String(now.getFullYear())
  const hours = String(now.getHours()).padStart(2, "0")
  const minutes = String(now.getMinutes()).padStart(2, "0")
  const seconds = String(now.getSeconds()).padStart(2, "0")

  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`
}

async function writeLog(level: "INFO" | "WARN" | "ERROR", message: string) {
  try {
    const logDirectory = getLogsDirectory()
    const logFilePath = getLogFilePath()
    const entry = `[${formatLogTimestamp()}] [${level}] ${message}\n`

    await fs.mkdir(logDirectory, { recursive: true })

    let currentContent = ""

    try {
      currentContent = await fs.readFile(logFilePath, "utf8")
    } catch {}

    const nextContent = trimLogContentToLimit(currentContent + entry, LOG_FILE_MAX_SIZE)
    await fs.writeFile(logFilePath, nextContent, "utf8")
  } catch {}
}

function logInfo(message: string) {
  void writeLog("INFO", message)
}

function logWarn(message: string) {
  void writeLog("WARN", message)
}

function logError(message: string) {
  void writeLog("ERROR", message)
}

function getFocusedAppWindow() {
  return BrowserWindow.getFocusedWindow() ?? (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
}

function createOrShowUpdateProgressWindow(version: string) {
  if (updateProgressWindow && !updateProgressWindow.isDestroyed()) {
    updateProgressWindow.show()
    updateProgressWindow.focus()
    return updateProgressWindow
  }

  const parentWindow = getFocusedAppWindow()

  updateProgressWindow = new BrowserWindow({
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
  })

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
  `

  void updateProgressWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
  updateProgressWindow.once("ready-to-show", () => {
    updateProgressWindow?.show()
  })
  updateProgressWindow.on("closed", () => {
    updateProgressWindow = null
  })

  return updateProgressWindow
}

function updateDownloadProgressWindow(percent: number) {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) return
  void updateProgressWindow.webContents.executeJavaScript(`window.setProgress(${Math.round(percent)})`)
}

function closeUpdateProgressWindow() {
  if (!updateProgressWindow || updateProgressWindow.isDestroyed()) {
    updateProgressWindow = null
    return
  }

  updateProgressWindow.close()
  updateProgressWindow = null
}

function configureAutoUpdater() {
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on("checking-for-update", () => {
    logInfo("Checking for app updates.")
  })

  autoUpdater.on("update-available", async (info) => {
    logInfo(`Update available: ${info.version}.`)

    const focusedWindow = getFocusedAppWindow()

    const messageBoxOptions = {
      type: "info" as const,
      buttons: ["Download Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Available",
      message: `Pokenix Studio ${info.version} is available.`,
      detail: "Do you want to download the update now?"
    }

    const result = focusedWindow
      ? await dialog.showMessageBox(focusedWindow, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions)

    if (result.response === 0) {
      logInfo(`Starting update download for version ${info.version}.`)
      createOrShowUpdateProgressWindow(info.version)
      void autoUpdater.downloadUpdate().catch((error) => {
        closeUpdateProgressWindow()
        logError(
          `Failed to download update ${info.version}: ${
            error instanceof Error ? error.message : "Unknown error."
          }`
        )
      })
    } else {
      logInfo(`Update download postponed for version ${info.version}.`)
    }
  })

  autoUpdater.on("update-not-available", (info) => {
    logInfo(`No update available. Current latest version: ${info.version}.`)
  })

  autoUpdater.on("error", (error) => {
    closeUpdateProgressWindow()
    logError(`Auto update error: ${error == null ? "Unknown error." : String(error)}`)
  })

  autoUpdater.on("download-progress", (progress) => {
    logInfo(`Update download progress: ${Math.round(progress.percent)}%.`)
    updateDownloadProgressWindow(progress.percent)
  })

  autoUpdater.on("update-downloaded", async (info) => {
    logInfo(`Update downloaded: ${info.version}.`)
    closeUpdateProgressWindow()

    const focusedWindow = getFocusedAppWindow()

    const messageBoxOptions = {
      type: "info" as const,
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update Ready",
      message: `Pokenix Studio ${info.version} is ready to install.`,
      detail: "Restart the app now to finish updating."
    }

    const result = focusedWindow
      ? await dialog.showMessageBox(focusedWindow, messageBoxOptions)
      : await dialog.showMessageBox(messageBoxOptions)

    if (result.response === 0) {
      logInfo(`Installing downloaded update ${info.version}.`)
      autoUpdater.quitAndInstall()
    }
  })
}

function getPluginsDirectory() {
  return path.join(getConfigDirectory(), "plugins")
}

async function ensurePluginsDirectory() {
  await fs.mkdir(getPluginsDirectory(), { recursive: true })
}

function getPluginRuntimeRootDirectory() {
  return path.join(getConfigDirectory(), "runtime")
}

function getPluginRuntimeVersionFilePath() {
  return path.join(getPluginRuntimeRootDirectory(), "runtime-version.json")
}

function getPluginRuntimeDirectory(pluginId: string) {
  return path.join(getPluginRuntimeRootDirectory(), pluginId)
}

async function ensurePluginRuntimeRootDirectory() {
  await fs.mkdir(getPluginRuntimeRootDirectory(), { recursive: true })
}

function getNodeDistributionTarget() {
  const archMap: Record<string, string> = {
    arm64: "arm64",
    x64: "x64"
  }

  const nodeArch = archMap[process.arch]
  if (!nodeArch) {
    throw new Error(`Unsupported architecture: ${process.arch}`)
  }

  if (process.platform === "darwin") {
    return {
      archiveName: `node-v${PLUGIN_NODE_VERSION}-darwin-${nodeArch}.tar.gz`,
      directoryName: `node-v${PLUGIN_NODE_VERSION}-darwin-${nodeArch}`,
      extension: "tar.gz"
    }
  }

  if (process.platform === "win32") {
    return {
      archiveName: `node-v${PLUGIN_NODE_VERSION}-win-${nodeArch}.zip`,
      directoryName: `node-v${PLUGIN_NODE_VERSION}-win-${nodeArch}`,
      extension: "zip"
    }
  }

  throw new Error(`Unsupported platform: ${process.platform}`)
}

function getNodeRuntimeDirectory() {
  return path.join(getPluginRuntimeRootDirectory(), getNodeDistributionTarget().directoryName)
}

function getNodeExecutablePath() {
  const runtimeDirectory = getNodeRuntimeDirectory()
  return process.platform === "win32"
    ? path.join(runtimeDirectory, "node.exe")
    : path.join(runtimeDirectory, "bin", "node")
}

function getNpmExecutablePath() {
  const runtimeDirectory = getNodeRuntimeDirectory()
  return process.platform === "win32"
    ? path.join(runtimeDirectory, "npm.cmd")
    : path.join(runtimeDirectory, "bin", "npm")
}

function getNpmCliPath() {
  const runtimeDirectory = getNodeRuntimeDirectory()
  return process.platform === "win32"
    ? path.join(runtimeDirectory, "node_modules", "npm", "bin", "npm-cli.js")
    : path.join(runtimeDirectory, "lib", "node_modules", "npm", "bin", "npm-cli.js")
}

async function isPluginNodeRuntimeInstalled() {
  try {
    await fs.access(getNodeExecutablePath())
    return true
  } catch {
    return false
  }
}

async function getInstalledPluginRuntimeVersion() {
  try {
    const raw = await fs.readFile(getPluginRuntimeVersionFilePath(), "utf8")
    const parsed = JSON.parse(raw) as { version?: string }
    return parsed.version || null
  } catch {
    return null
  }
}

async function writeInstalledPluginRuntimeVersion() {
  await fs.writeFile(
    getPluginRuntimeVersionFilePath(),
    JSON.stringify({ version: PLUGIN_NODE_VERSION }, null, 2),
    "utf8"
  )
}

async function clearPluginRuntimeInstallation() {
  await fs.rm(getPluginRuntimeRootDirectory(), { recursive: true, force: true })
  await ensurePluginRuntimeRootDirectory()
}

function sendPluginSetupProgress(
  webContents: WebContents | null,
  progress: PluginSetupProgress
) {
  if (!webContents || webContents.isDestroyed()) return
  webContents.send("plugins:setup-progress", progress)
}

async function downloadFile(
  url: string,
  destinationPath: string,
  onProgress?: (percent?: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume()
        void downloadFile(response.headers.location, destinationPath).then(resolve).catch(reject)
        return
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode ?? "unknown"}`))
        return
      }

      const chunks: Buffer[] = []
      const totalBytes = Number(response.headers["content-length"] || 0)
      let downloadedBytes = 0

      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        chunks.push(buffer)
        downloadedBytes += buffer.length

        if (totalBytes > 0 && onProgress) {
          onProgress(Math.round((downloadedBytes / totalBytes) * 100))
        }
      })

      response.on("end", async () => {
        try {
          await fs.writeFile(destinationPath, Buffer.concat(chunks))
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })

    request.on("error", reject)
  })
}

async function extractArchive(archivePath: string, destinationDirectory: string) {
  await new Promise<void>((resolve, reject) => {
    const command =
      process.platform === "win32"
        ? "powershell.exe"
        : "/usr/bin/tar"

    const args =
      process.platform === "win32"
        ? [
            "-NoProfile",
            "-Command",
            `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destinationDirectory.replace(/'/g, "''")}' -Force`
          ]
        : ["-xzf", archivePath, "-C", destinationDirectory]

    const child = spawn(command, args, {
      stdio: "ignore"
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`Archive extraction failed with code ${code ?? "unknown"}`))
    })
  })
}

async function ensurePluginNodeRuntimeInstalled(
  webContents: WebContents | null,
  forceReinstall = false
) {
  await ensurePluginRuntimeRootDirectory()

  const runtimeInstalled = await isPluginNodeRuntimeInstalled()
  const installedVersion = await getInstalledPluginRuntimeVersion()
  if (forceReinstall && runtimeInstalled) {
    sendPluginSetupProgress(webContents, {
      phase: "preparing",
      message: `Reinstalling plugin runtime ${PLUGIN_NODE_VERSION}...`
    })
    await clearPluginRuntimeInstallation()
  } else if (runtimeInstalled && installedVersion !== PLUGIN_NODE_VERSION) {
    sendPluginSetupProgress(webContents, {
      phase: "preparing",
      message: `Updating plugin runtime to ${PLUGIN_NODE_VERSION}...`
    })
    await clearPluginRuntimeInstallation()
  }

  if (await isPluginNodeRuntimeInstalled()) {
    sendPluginSetupProgress(webContents, {
      phase: "ready",
      message: "Plugin runtime is already installed.",
      percent: 100
    })
    return
  }

  const target = getNodeDistributionTarget()
  const archiveUrl = `https://nodejs.org/dist/v${PLUGIN_NODE_VERSION}/${target.archiveName}`
  const archivePath = path.join(getPluginRuntimeRootDirectory(), target.archiveName)

  sendPluginSetupProgress(webContents, {
    phase: "preparing",
    message: "Preparing plugin runtime setup..."
  })

  await downloadFile(archiveUrl, archivePath, (percent) => {
    sendPluginSetupProgress(webContents, {
      phase: "downloading",
      message: `Downloading Node.js runtime ${percent ? `(${percent}%)` : ""}`.trim(),
      percent
    })
  })

  try {
    sendPluginSetupProgress(webContents, {
      phase: "extracting",
      message: "Extracting Node.js runtime..."
    })
    await extractArchive(archivePath, getPluginRuntimeRootDirectory())
  } finally {
    await fs.rm(archivePath, { force: true })
  }

  if (!(await isPluginNodeRuntimeInstalled())) {
    throw new Error("Node runtime was downloaded but could not be initialized.")
  }

  sendPluginSetupProgress(webContents, {
    phase: "finalizing",
    message: "Finalizing plugin runtime setup..."
  })

  await writeInstalledPluginRuntimeVersion()

  sendPluginSetupProgress(webContents, {
    phase: "ready",
    message: "Plugin runtime installed successfully.",
    percent: 100
  })
}

async function ensurePluginRuntimeDirectory(pluginId: string) {
  const runtimeDirectory = getPluginRuntimeDirectory(pluginId)
  await fs.mkdir(runtimeDirectory, { recursive: true })

  const runtimePackagePath = path.join(runtimeDirectory, "package.json")

  try {
    await fs.access(runtimePackagePath)
  } catch {
    await fs.writeFile(
      runtimePackagePath,
      JSON.stringify(
        {
          name: `pokenix-plugin-${pluginId}`,
          private: true
        },
        null,
        2
      ),
      "utf8"
    )
  }

  return runtimeDirectory
}

function getDisabledPluginIds() {
  return pluginStore.get("disabledPluginIds")
}

function arePluginsEnabled() {
  return pluginStore.get("pluginsEnabled")
}

function isPluginDisabled(pluginId: string) {
  return getDisabledPluginIds().includes(pluginId)
}

function setPluginDisabled(pluginId: string, disabled: boolean) {
  const current = new Set(getDisabledPluginIds())

  if (disabled) {
    current.add(pluginId)
  } else {
    current.delete(pluginId)
  }

  pluginStore.set("disabledPluginIds", Array.from(current))
  notifyPluginStateChanged()
}

function getPluginWindowKey(pluginId: string) {
  return `plugin:${pluginId}`
}

function isPluginWindowOpen(pluginId: string) {
  const win = moduleWindows.get(getPluginWindowKey(pluginId))
  return !!win && !win.isDestroyed()
}

function closePluginWindow(pluginId: string) {
  const windowKey = getPluginWindowKey(pluginId)
  const win = moduleWindows.get(windowKey)

  if (win && !win.isDestroyed()) {
    win.close()
  }

  moduleWindows.delete(windowKey)
  notifyPluginStateChanged()
  return { success: true }
}

function normalizePluginPermissions(permissions: unknown) {
  if (!Array.isArray(permissions)) return []

  return permissions
    .filter((permission): permission is string => typeof permission === "string")
    .map((permission) => permission.trim())
    .filter(Boolean)
}

function getUnsafePluginPermissions(plugin: PluginManifest) {
  return normalizePluginPermissions(plugin.permissions).filter(
    (permission) => !PLUGIN_PERMISSION_RULES[permission]?.safe
  )
}

function formatUnsafePermissionDetails(permissions: string[]) {
  return permissions
    .map((permission) => {
      const rule = PLUGIN_PERMISSION_RULES[permission]
      if (!rule) {
        return `- ${permission}: Unknown permission. Treated as unsafe by default.`
      }

      return `- ${permission}: ${rule.description}`
    })
    .join("\n")
}

function getApprovedUnsafePermissions(pluginId: string) {
  const approvals = pluginStore.get("approvedUnsafePermissions") || {}
  return Array.isArray(approvals[pluginId]) ? approvals[pluginId] : []
}

function setApprovedUnsafePermissions(pluginId: string, permissions: string[]) {
  const approvals = pluginStore.get("approvedUnsafePermissions") || {}
  pluginStore.set("approvedUnsafePermissions", {
    ...approvals,
    [pluginId]: permissions
  })
}

function clearApprovedUnsafePermissions(pluginId: string) {
  const approvals = { ...(pluginStore.get("approvedUnsafePermissions") || {}) }
  delete approvals[pluginId]
  pluginStore.set("approvedUnsafePermissions", approvals)
}

function disablePluginsGlobally() {
  pluginStore.set("pluginsEnabled", false)
  pluginStore.set("disabledPluginIds", [])
  pluginStore.set("approvedUnsafePermissions", {})

  for (const [windowKey, win] of moduleWindows.entries()) {
    if (!windowKey.startsWith("plugin:")) continue

    if (!win.isDestroyed()) {
      win.close()
    }

    moduleWindows.delete(windowKey)
  }

  logInfo("Plugins disabled globally.")
  notifyPluginStateChanged()

  return {
    enabled: false,
    path: getPluginsDirectory(),
    runtimeInstalled: false
  }
}

async function resetPlugins() {
  disablePluginsGlobally()

  await fs.rm(getPluginsDirectory(), { recursive: true, force: true })
  await fs.rm(getPluginRuntimeRootDirectory(), { recursive: true, force: true })

  logInfo("Plugins were reset and plugin directories were removed.")

  return {
    enabled: false,
    path: getPluginsDirectory(),
    runtimeInstalled: false
  }
}

function closeAllPluginWindows() {
  let closedCount = 0

  for (const [windowKey, win] of moduleWindows.entries()) {
    if (!windowKey.startsWith("plugin:")) continue

    if (!win.isDestroyed()) {
      win.close()
      closedCount += 1
    }

    moduleWindows.delete(windowKey)
  }

  logInfo(`Closed ${closedCount} plugin window${closedCount === 1 ? "" : "s"}.`)
  notifyPluginStateChanged()
  return { success: true }
}

async function disableAllPlugins() {
  const installedPlugins = await getInstalledPlugins()

  for (const plugin of installedPlugins.plugins) {
    setPluginDisabled(plugin.id, true)
  }

  logInfo(`Disabled ${installedPlugins.plugins.length} plugin${installedPlugins.plugins.length === 1 ? "" : "s"}.`)
  closeAllPluginWindows()
  return { success: true }
}

async function enableAllPlugins() {
  const installedPlugins = await getInstalledPlugins()

  for (const plugin of installedPlugins.plugins) {
    setPluginDisabled(plugin.id, false)
  }

  logInfo(`Enabled ${installedPlugins.plugins.length} plugin${installedPlugins.plugins.length === 1 ? "" : "s"}.`)
  notifyPluginStateChanged()
  return { success: true }
}

function notifyPluginStateChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("plugins:state-changed")
  }
}

async function readPluginRecord(pluginDirectory: string): Promise<PluginRecord | null> {
  const manifestPath = path.join(pluginDirectory, "manifest.json")

  try {
    const rawManifest = await fs.readFile(manifestPath, "utf8")
    const manifest = JSON.parse(rawManifest) as Partial<PluginManifest>

    if (
      typeof manifest.id !== "string" ||
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string" ||
      typeof manifest.entry !== "string"
    ) {
      return null
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
    }
  } catch {
    return null
  }
}

async function getInstalledPlugins() {
  if (!arePluginsEnabled()) {
    return {
      enabled: false,
      path: getPluginsDirectory(),
      runtimeInstalled: false,
      plugins: []
    }
  }

  await ensurePluginsDirectory()
  await ensurePluginRuntimeRootDirectory()

  const pluginsDirectory = getPluginsDirectory()
  const entries = await fs.readdir(pluginsDirectory, { withFileTypes: true })
  const plugins: PluginManifest[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginRecord = await readPluginRecord(path.join(pluginsDirectory, entry.name))
    if (!pluginRecord) continue

    plugins.push(pluginRecord.manifest)
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
  }
}

async function getPluginById(pluginId: string) {
  if (!arePluginsEnabled()) return null

  await ensurePluginsDirectory()
  await ensurePluginRuntimeRootDirectory()

  const pluginsDirectory = getPluginsDirectory()
  const entries = await fs.readdir(pluginsDirectory, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginRecord = await readPluginRecord(path.join(pluginsDirectory, entry.name))
    if (!pluginRecord || pluginRecord.manifest.id !== pluginId) continue

    const entryPath = path.resolve(pluginRecord.directory, pluginRecord.manifest.entry)
    if (!entryPath.startsWith(pluginRecord.directory)) return null

    const script = await fs.readFile(entryPath, "utf8")

    let style: string | undefined
    const runtimeDirectory = await ensurePluginRuntimeDirectory(pluginRecord.manifest.id)

    if (typeof pluginRecord.manifest.style === "string") {
      const stylePath = path.resolve(pluginRecord.directory, pluginRecord.manifest.style)

      if (stylePath.startsWith(pluginRecord.directory)) {
        style = await fs.readFile(stylePath, "utf8")
      }
    }

    return {
      plugin: pluginRecord.manifest,
      script,
      style,
      runtimeDirectory,
      pluginDirectory: pluginRecord.directory
    }
  }

  return null
}

async function deletePlugin(pluginId: string) {
  const pluginData = await getPluginById(pluginId)
  if (!pluginData) return { success: false }

  const pluginsDirectory = getPluginsDirectory()
  const entries = await fs.readdir(pluginsDirectory, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginRecord = await readPluginRecord(path.join(pluginsDirectory, entry.name))
    if (!pluginRecord || pluginRecord.manifest.id !== pluginId) continue

    await fs.rm(pluginRecord.directory, { recursive: true, force: true })
    await fs.rm(getPluginRuntimeDirectory(pluginId), { recursive: true, force: true })
    setPluginDisabled(pluginId, false)
    clearApprovedUnsafePermissions(pluginId)

    const windowKey = `plugin:${pluginId}`
    const win = moduleWindows.get(windowKey)

    if (win && !win.isDestroyed()) {
      win.close()
    }

    moduleWindows.delete(windowKey)
    notifyPluginStateChanged()
    return { success: true }
  }

  return { success: false }
}

function normalizeRequestedVersion(version: string) {
  return version.trim().replace(/^[~^]/, "")
}

function parseSemver(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  }
}

function compareSemver(a: string, b: string) {
  const parsedA = parseSemver(a)
  const parsedB = parseSemver(b)

  if (!parsedA || !parsedB) {
    return a.localeCompare(b)
  }

  if (parsedA.major !== parsedB.major) return parsedA.major - parsedB.major
  if (parsedA.minor !== parsedB.minor) return parsedA.minor - parsedB.minor
  return parsedA.patch - parsedB.patch
}

function versionSatisfiesRange(requestedVersion: string, installedVersion: string) {
  const trimmedRequested = requestedVersion.trim()
  const normalizedRequested = normalizeRequestedVersion(trimmedRequested)

  if (trimmedRequested.startsWith("^")) {
    const requested = parseSemver(normalizedRequested)
    const installed = parseSemver(installedVersion)
    if (!requested || !installed) return normalizedRequested === installedVersion

    return (
      installed.major === requested.major &&
      compareSemver(installedVersion, normalizedRequested) >= 0
    )
  }

  if (trimmedRequested.startsWith("~")) {
    const requested = parseSemver(normalizedRequested)
    const installed = parseSemver(installedVersion)
    if (!requested || !installed) return normalizedRequested === installedVersion

    return (
      installed.major === requested.major &&
      installed.minor === requested.minor &&
      compareSemver(installedVersion, normalizedRequested) >= 0
    )
  }

  return normalizedRequested === installedVersion
}

async function getPluginDependencyChanges(plugin: PluginManifest) {
  const dependencies = plugin.dependencies || {}
  const entries = Object.entries(dependencies)
  if (entries.length === 0) {
    return {
      missing: [] as Array<{ name: string; version: string }>,
      updates: [] as Array<{ name: string; version: string }>
    }
  }

  const runtimeDirectory = await ensurePluginRuntimeDirectory(plugin.id)
  const runtimeRequire = createRequire(path.join(runtimeDirectory, "package.json"))
  const missing: Array<{ name: string; version: string }> = []
  const updates: Array<{ name: string; version: string }> = []

  for (const [name, version] of entries) {
    try {
      runtimeRequire.resolve(name)

      const packageJsonPath = path.join(runtimeDirectory, "node_modules", name, "package.json")
      const installedPackage = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version?: string }
      const installedVersion = installedPackage.version || ""

      if (!versionSatisfiesRange(version, installedVersion)) {
        updates.push({ name, version })
      }
    } catch {
      missing.push({ name, version })
    }
  }

  return { missing, updates }
}

async function installPluginDependencies(plugin: PluginManifest) {
  const dependencies = plugin.dependencies || {}
  const entries = Object.entries(dependencies)
  if (entries.length === 0) return

  const runtimeDirectory = await ensurePluginRuntimeDirectory(plugin.id)
  const packages = entries.map(([name, version]) => `${name}@${version}`)
  const nodeCommand = getNodeExecutablePath()
  const npmCliPath = getNpmCliPath()
  await fs.access(npmCliPath)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(nodeCommand, [npmCliPath, "install", "--no-save", ...packages], {
      cwd: runtimeDirectory,
      stdio: "ignore"
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`npm install failed with code ${code ?? "unknown"}`))
    })
  })
}

async function ensurePluginDependencies(plugin: PluginManifest) {
  if (isPluginDisabled(plugin.id)) {
    return { success: false, reason: "disabled" as const }
  }

  const dependencyChanges = await getPluginDependencyChanges(plugin)
  const missingDependencies = dependencyChanges.missing
  const updateDependencies = dependencyChanges.updates

  if (missingDependencies.length === 0 && updateDependencies.length === 0) {
    return { success: true as const }
  }

  const dependencyList = [...missingDependencies, ...updateDependencies]
    .map(({ name, version }) => `- ${name}@${version}`)
    .join("\n")

  const message =
    missingDependencies.length > 0 && updateDependencies.length > 0
      ? `${plugin.name} wants to install and update dependencies.`
      : updateDependencies.length > 0
        ? `${plugin.name} wants to update dependencies.`
        : `${plugin.name} wants to install dependencies.`

  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Allow", "Disable Plugin", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Plugin dependencies",
    message,
    detail: dependencyList
  })

  if (result.response === 1) {
    setPluginDisabled(plugin.id, true)
    return { success: false, reason: "disabled" as const }
  }

  if (result.response === 2) {
    return { success: false, reason: "cancelled" as const }
  }

  await installPluginDependencies(plugin)
  setPluginDisabled(plugin.id, false)
  return { success: true as const }
}

function getWindowBounds(
  key: keyof WindowStateStore,
  fallback: WindowState
): WindowState {
  const saved = windowStateStore.get(key)

  return {
    width: saved.width || fallback.width,
    height: saved.height || fallback.height,
    x: saved.x,
    y: saved.y
  }
}

function saveWindowState(key: keyof WindowStateStore, win: BrowserWindow) {
  if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return

  const bounds = win.getBounds()

  windowStateStore.set(key, {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  })
}

function attachWindowStateSave(key: keyof WindowStateStore, win: BrowserWindow) {
  let timeout: NodeJS.Timeout | null = null

  const queueSave = () => {
    if (timeout) clearTimeout(timeout)

    timeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        saveWindowState(key, win)
      }
    }, 150)
  }

  win.on("resize", queueSave)
  win.on("move", queueSave)

  win.on("close", () => {
    if (timeout) clearTimeout(timeout)
    if (!win.isDestroyed()) {
      saveWindowState(key, win)
    }
  })
}

function isUsableWindow(win: BrowserWindow | null): win is BrowserWindow {
  return !!win && !win.isDestroyed()
}

function createMainWindow() {
  const state = getWindowBounds("main", {
    width: 1200,
    height: 800
  })

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  attachWindowStateSave("main", mainWindow)

  if (isDev) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string)
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"))
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show()
    logInfo("Main window is ready.")
  })

  mainWindow.on("close", (event) => {
    const closeToTray = settingsStore.get("closeToTray")

    saveWindowState("main", mainWindow as BrowserWindow)

    if (!isQuitting) {
      if (closeToTray) {
        event.preventDefault()
        mainWindow?.hide()
        logInfo("Main window hidden to tray.")

        if (process.platform === "darwin" && app.dock) {
          app.dock.hide()
        }
      } else {
        isQuitting = true
        logInfo("Main window requested app quit.")
        app.quit()
      }
    }
  })

  mainWindow.on("closed", () => {
    logInfo("Main window closed.")
    mainWindow = null
  })
}

function ensureMainWindow() {
  if (isUsableWindow(mainWindow)) return mainWindow
  createMainWindow()
  return mainWindow
}

function showMainWindow() {
  const win = ensureMainWindow()
  if (!win) return

  if (!win.isVisible()) {
    win.show()
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.focus()
  logInfo("Main window focused.")

  if (process.platform === "darwin" && app.dock) {
    app.dock.show()
  }
}

function hideMainWindow() {
  if (!isUsableWindow(mainWindow)) return
  mainWindow.hide()
}

function navigateMainWindow(page: Page) {
  const win = ensureMainWindow()
  if (!win) return

  if (!win.isVisible()) {
    win.show()
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.focus()
  win.webContents.send("app:navigate", page)
  logInfo(`Navigated main window to: ${page}`)

  if (process.platform === "darwin" && app.dock) {
    app.dock.show()
  }
}

function validateDirectoryName(name: string) {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return "Directory name cannot be empty."
  }

  if (trimmedName === "." || trimmedName === "..") {
    return "Directory name cannot be . or .."
  }

  if (trimmedName.includes("/")) {
    return "Directory name cannot contain /"
  }

  if (process.platform === "darwin") {
    if (trimmedName.includes(":")) {
      return "Directory name cannot contain : on macOS."
    }

    return ""
  }

  if (process.platform === "win32") {
    if (/[<>:"\\|?*]/.test(trimmedName)) {
      return "Directory name contains invalid characters for Windows."
    }

    if (/[. ]$/.test(trimmedName)) {
      return "Directory name cannot end with a space or period on Windows."
    }

    const upperName = trimmedName.toUpperCase()
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
    ]

    if (reservedNames.includes(upperName)) {
      return "Directory name is reserved on Windows."
    }
  }

  return ""
}

type TransferValidationResult =
  | {
      success: true
      sourcePath: string
      destinationPath: string
      entryNames: string[]
      conflicts: { name: string; kind: "file" | "directory" }[]
    }
  | {
      success: false
      error: string
    }

async function validateTransferPaths(sourcePath: string, destinationPath: string): Promise<TransferValidationResult> {
  const normalizedSourcePath = String(sourcePath || "").trim()
  const normalizedDestinationPath = String(destinationPath || "").trim()
  const resolvedSourcePath = path.resolve(normalizedSourcePath)
  const resolvedDestinationPath = path.resolve(normalizedDestinationPath)

  if (!normalizedSourcePath) {
    return { success: false, error: "Choose an old path first." }
  }

  if (!normalizedDestinationPath) {
    return { success: false, error: "Choose a new path first." }
  }

  if (resolvedSourcePath === resolvedDestinationPath) {
    return { success: false, error: "Old path and new path cannot be the same." }
  }

  const sourceWithSeparator = `${resolvedSourcePath}${path.sep}`
  const destinationWithSeparator = `${resolvedDestinationPath}${path.sep}`

  if (resolvedDestinationPath.startsWith(sourceWithSeparator)) {
    return { success: false, error: "The new path cannot be inside the old path." }
  }

  if (resolvedSourcePath.startsWith(destinationWithSeparator)) {
    return { success: false, error: "The old path cannot be inside the new path." }
  }

  let sourceStat: Awaited<ReturnType<typeof fs.stat>>
  let destinationStat: Awaited<ReturnType<typeof fs.stat>>

  try {
    sourceStat = await fs.stat(resolvedSourcePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { success: false, error: "The old path does not exist anymore." }
    }

    return { success: false, error: "Could not access the old path." }
  }

  try {
    destinationStat = await fs.stat(resolvedDestinationPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { success: false, error: "The new path does not exist anymore." }
    }

    return { success: false, error: "Could not access the new path." }
  }

  if (!sourceStat.isDirectory()) {
    return { success: false, error: "The old path is not a directory." }
  }

  if (!destinationStat.isDirectory()) {
    return { success: false, error: "The new path is not a directory." }
  }

  try {
    await fs.access(resolvedSourcePath, constants.R_OK)
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code || "")
    if (code === "EACCES" || code === "EPERM") {
      return { success: false, error: "Pokenix Studio does not have permission to read the old path." }
    }

    return { success: false, error: "Could not read the old path." }
  }

  try {
    await fs.access(resolvedDestinationPath, constants.W_OK)
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code || "")
    if (code === "EACCES" || code === "EPERM") {
      return { success: false, error: "Pokenix Studio does not have permission to write to the new path." }
    }

    return { success: false, error: "Could not write to the new path." }
  }

  const sourceEntries = await fs.readdir(resolvedSourcePath, { withFileTypes: true })

  if (sourceEntries.length === 0) {
    return { success: false, error: "The old path is empty." }
  }

  const entryNames = sourceEntries.map((entry) => entry.name)
  const conflicts: { name: string; kind: "file" | "directory" }[] = []

  for (const entryName of entryNames) {
    try {
      const existingStat = await fs.stat(path.join(resolvedDestinationPath, entryName))
      conflicts.push({
        name: entryName,
        kind: existingStat.isDirectory() ? "directory" : "file"
      })
    } catch {}
  }

  return {
    success: true,
    sourcePath: resolvedSourcePath,
    destinationPath: resolvedDestinationPath,
    entryNames,
    conflicts
  }
}

async function collectTransferredItems(rootPath: string, relativePath = ""): Promise<string[]> {
  const currentPath = relativePath ? path.join(rootPath, relativePath) : rootPath
  const currentStat = await fs.stat(currentPath)

  if (!currentStat.isDirectory()) {
    return relativePath ? [relativePath.replace(/\\/g, "/")] : []
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true })

  if (entries.length === 0) {
    return relativePath ? [`${relativePath.replace(/\\/g, "/")}/`] : []
  }

  const collected: string[] = []

  for (const entry of entries) {
    const nextRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name

    if (entry.isDirectory()) {
      collected.push(...(await collectTransferredItems(rootPath, nextRelativePath)))
      continue
    }

    collected.push(nextRelativePath.replace(/\\/g, "/"))
  }

  return collected
}

async function buildDirectoryTreeLines(
  directoryPath: string,
  options: {
    hideEmptyFolders: boolean
    hideHiddenFiles: boolean
  },
  prefix = ""
): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  const filteredEntries = entries.filter((entry) => {
    if (!options.hideHiddenFiles) return true
    return !entry.name.startsWith(".")
  })

  const sortedEntries = filteredEntries
    .slice()
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

  const lines: string[] = []

  for (const [index, entry] of sortedEntries.entries()) {
    const isLast = index === sortedEntries.length - 1
    const connector = isLast ? "└── " : "├── "

    if (entry.isDirectory()) {
      const childPath = path.join(directoryPath, entry.name)
      const childPrefix = `${prefix}${isLast ? "    " : "│   "}`
      const childLines = await buildDirectoryTreeLines(childPath, options, childPrefix)

      if (options.hideEmptyFolders && childLines.length === 0) {
        continue
      }

      lines.push(`${prefix}${connector}${entry.name}/`)
      lines.push(...childLines)
      continue
    }

    lines.push(`${prefix}${connector}${entry.name}`)
  }

  return lines
}

async function movePath(sourcePath: string, destinationPath: string) {
  try {
    await fs.rename(sourcePath, destinationPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EXDEV") {
      throw error
    }

    await fs.cp(sourcePath, destinationPath, {
      recursive: true,
      force: true
    })

    await fs.rm(sourcePath, {
      recursive: true,
      force: true
    })
  }
}

function createApplicationMenu() {
  app.setAboutPanelOptions({
    applicationName: "Pokenix Studio",
    applicationVersion: app.getVersion(),
    copyright: "Pokenix"
  })

  const template: Electron.MenuItemConstructorOptions[] = [
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
            void shell.openExternal("https://pokenix.com/studio")
          }
        },
        {
          label: "Open Config Folder",
          click: () => {
            void shell.openPath(getConfigDirectory())
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function handleNotepadWindowClose(win: BrowserWindow, event: Electron.Event) {
  if (forceCloseWindowIds.has(win.id)) return

  const isDirty = notepadDirtyState.get(win.id) === true
  if (!isDirty) return

  event.preventDefault()

  const result = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Save", "Discard", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Unsaved changes",
    message: "You have unsaved changes.",
    detail: "Do you want to save your changes before closing?"
  })

  if (result.response === 2) return

  if (result.response === 1) {
    forceCloseWindowIds.add(win.id)
    win.close()
    forceCloseWindowIds.delete(win.id)
    return
  }

  const saveOk = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 60000)

    ipcMain.once("notepad:save-all-result", (_evt, success: boolean) => {
      clearTimeout(timer)
      resolve(Boolean(success))
    })

    win.webContents.send("notepad:save-all-request")
  })

  if (saveOk) {
    forceCloseWindowIds.add(win.id)
    win.close()
    forceCloseWindowIds.delete(win.id)
  }
}

function createModuleWindow(moduleId: string, title: string) {
  const existingWindow = moduleWindows.get(moduleId)

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show()
    existingWindow.focus()
    logInfo(`Focused existing module window: ${moduleId}`)
    return
  }

  const state = getWindowBounds("plugin", {
    width: 1000,
    height: 700
  })

  const moduleWindow = new BrowserWindow({
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  attachWindowStateSave("notepad", moduleWindow)

  const moduleUrl = isDev
    ? `${process.env.VITE_DEV_SERVER_URL}?module=${moduleId}`
    : `file://${path.join(__dirname, "../dist/index.html")}?module=${moduleId}`

  void moduleWindow.loadURL(moduleUrl)
  logInfo(`Opened module window: ${moduleId}`)

  if (moduleId === "notepad") {
    moduleWindow.on("close", (event) => {
      void handleNotepadWindowClose(moduleWindow, event)
    })
  }

  moduleWindow.on("closed", () => {
    moduleWindows.delete(moduleId)
    notepadDirtyState.delete(moduleWindow.id)
    logInfo(`Closed module window: ${moduleId}`)
  })

  moduleWindows.set(moduleId, moduleWindow)
}

async function createPluginWindow(pluginId: string) {
  const pluginData = await getPluginById(pluginId)
  if (!pluginData) return false

  const unsafePermissions = getUnsafePluginPermissions(pluginData.plugin)
  if (unsafePermissions.length > 0) {
    const approvedPermissions = getApprovedUnsafePermissions(pluginData.plugin.id)
    const missingApprovals = unsafePermissions.filter(
      (permission) => !approvedPermissions.includes(permission)
    )

    if (missingApprovals.length > 0) {
      const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Allow", "Disable Plugin", "Cancel"],
        defaultId: 2,
        cancelId: 2,
        title: "Unsafe plugin permissions",
        message: `${pluginData.plugin.name} requests unsafe permissions.`,
        detail: `This plugin wants access to:\n${formatUnsafePermissionDetails(missingApprovals)}\n\nOnly allow this if you trust the plugin author.`
      })

      if (result.response === 1) {
        setPluginDisabled(pluginData.plugin.id, true)
        logWarn(`Plugin disabled after unsafe permission prompt: ${pluginData.plugin.id}`)
        return false
      }

      if (result.response !== 0) {
        logWarn(`Plugin launch cancelled from unsafe permission prompt: ${pluginData.plugin.id}`)
        return false
      }

      setApprovedUnsafePermissions(pluginData.plugin.id, [
        ...new Set([...approvedPermissions, ...missingApprovals])
      ])
    }
  }

  try {
    const dependencyState = await ensurePluginDependencies(pluginData.plugin)
    if (!dependencyState.success) {
      return false
    }
  } catch (error) {
    console.error("Failed to install plugin dependencies:", error)
    logError(
      `Could not install dependencies for ${pluginData.plugin.id}: ${
        error instanceof Error ? error.message : "Unknown install error."
      }`
    )

    await dialog.showMessageBox({
      type: "error",
      buttons: ["OK"],
      title: "Plugin install failed",
      message: `Could not install dependencies for ${pluginData.plugin.name}.`,
      detail: error instanceof Error ? error.message : "Unknown install error."
    })

    return false
  }

  const windowKey = getPluginWindowKey(pluginId)
  const existingWindow = moduleWindows.get(windowKey)

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show()
    existingWindow.focus()
    logInfo(`Focused existing plugin window: ${pluginId}`)
    notifyPluginStateChanged()
    return true
  }

  const state = getWindowBounds("notepad", {
    width: 1000,
    height: 700
  })

  const pluginWindow = new BrowserWindow({
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
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: false,
      nodeIntegration: true
    }
  })

  attachWindowStateSave("plugin", pluginWindow)

  const pluginUrl = isDev
    ? `${process.env.VITE_DEV_SERVER_URL}?plugin=${encodeURIComponent(pluginId)}`
    : `file://${path.join(__dirname, "../dist/index.html")}?plugin=${encodeURIComponent(pluginId)}`

  void pluginWindow.loadURL(pluginUrl)
  logInfo(`Opened plugin window: ${pluginId}`)

  pluginWindow.on("closed", () => {
    moduleWindows.delete(windowKey)
    logInfo(`Closed plugin window: ${pluginId}`)
    notifyPluginStateChanged()
  })

  moduleWindows.set(windowKey, pluginWindow)
  notifyPluginStateChanged()
  return true
}

function getNotepadWindow(): BrowserWindow | null {
  const win = moduleWindows.get("notepad")
  return win && !win.isDestroyed() ? win : null
}

function updateNotepadWindowTitle(filePath?: string) {
  const win = getNotepadWindow()
  if (!win) return

  const fileName = filePath ? path.basename(filePath) : "Untitled"
  win.setTitle(`Notepad - ${fileName}`)
}

function createTray() {
  const iconPath = path.join(__dirname, "../assets/tray-icon.png")

  const image = nativeImage
    .createFromPath(iconPath)
    .resize({ width: 18, height: 18 })

  image.setTemplateImage(true)

  tray = new Tray(image)
  tray.setToolTip("Pokenix Studio")

  const showTrayMenu = () => {
    const mainVisible = isUsableWindow(mainWindow) ? mainWindow.isVisible() : false

    const contextMenu = Menu.buildFromTemplate([
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
          isQuitting = true
          app.quit()
        }
      }
    ])

    tray?.popUpContextMenu(contextMenu)
  }

  tray.on("click", showTrayMenu)
  tray.on("right-click", showTrayMenu)
}

function stopUtilityWatcher(webContentsId: number) {
  const current = utilityWatchers.get(webContentsId)
  if (!current) {
    return { success: true }
  }

  current.watcher.close()
  utilityWatchers.delete(webContentsId)
  return { success: true }
}

async function collectDirectoryEntries(
  rootPath: string,
  currentPath: string,
  knownEntries: Map<string, "file" | "directory">
) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name)
    const relativePath = path.relative(rootPath, absolutePath)

    if (!relativePath) {
      continue
    }

    if (entry.isDirectory()) {
      knownEntries.set(relativePath, "directory")
      await collectDirectoryEntries(rootPath, absolutePath, knownEntries)
      continue
    }

    knownEntries.set(relativePath, "file")
  }
}

function applyTodoOrdering(items: TodoItem[], moveCompletedToBottom: boolean) {
  if (!moveCompletedToBottom) {
    return items
  }

  const activeItems = items.filter((item) => !item.completed)
  const completedItems = items.filter((item) => item.completed)
  return [...activeItems, ...completedItems]
}

function registerIpcHandlers() {
  ipcMain.handle("app:version", () => {
    return app.getVersion()
  })

  ipcMain.handle("app:open-website", async () => {
    await shell.openExternal("https://www.pokenix.com/studio")
    return { success: true }
  })

  ipcMain.handle("app:open-external-url", async (_event, url: string) => {
    const normalizedUrl = String(url || "").trim()

    if (!/^https?:\/\//i.test(normalizedUrl)) {
      return { success: false }
    }

    await shell.openExternal(normalizedUrl)
    return { success: true }
  })

  ipcMain.handle("app:open-logs-directory", async () => {
    await fs.mkdir(getLogsDirectory(), { recursive: true })
    await shell.openPath(getLogsDirectory())
    return { success: true }
  })

  ipcMain.handle("plugins:status", async () => {
    return {
      enabled: arePluginsEnabled(),
      path: getPluginsDirectory(),
      runtimeInstalled: await isPluginNodeRuntimeInstalled()
    }
  })

  ipcMain.handle("plugins:enable", async (event) => {
    await ensurePluginNodeRuntimeInstalled(event.sender)
    pluginStore.set("pluginsEnabled", true)
    await ensurePluginsDirectory()
    await ensurePluginRuntimeRootDirectory()

    return {
      enabled: true,
      path: getPluginsDirectory(),
      runtimeInstalled: true
    }
  })

  ipcMain.handle("plugins:list", async () => {
    return getInstalledPlugins()
  })

  ipcMain.handle("plugins:path", async () => {
    return getPluginsDirectory()
  })

  ipcMain.handle("plugins:open-directory", async () => {
    await ensurePluginsDirectory()
    await shell.openPath(getPluginsDirectory())
    return { success: true }
  })

  ipcMain.handle("plugins:get", async (_event, pluginId: string) => {
    return getPluginById(pluginId)
  })

  ipcMain.handle("plugins:require", async (_event, runtimeDirectory: string, specifier: string) => {
    const runtimePackagePath = path.join(runtimeDirectory, "package.json")
    const runtimeRequire = createRequire(runtimePackagePath)
    return runtimeRequire(specifier)
  })

  ipcMain.handle("plugins:open", async (_event, pluginId: string) => {
    const success = await createPluginWindow(pluginId)
    return { success }
  })

  ipcMain.handle("plugins:close", async (_event, pluginId: string) => {
    return closePluginWindow(pluginId)
  })

  ipcMain.handle("plugins:close-all", async () => {
    return closeAllPluginWindows()
  })

  ipcMain.handle("plugins:disable", async (_event, pluginId: string) => {
    setPluginDisabled(pluginId, true)
    return { success: true }
  })

  ipcMain.handle("plugins:disable-all", async () => {
    return disableAllPlugins()
  })

  ipcMain.handle("plugins:enable-all", async () => {
    return enableAllPlugins()
  })

  ipcMain.handle("plugins:enable-one", async (_event, pluginId: string) => {
    setPluginDisabled(pluginId, false)
    return { success: true }
  })

  ipcMain.handle("plugins:delete", async (_event, pluginId: string) => {
    return deletePlugin(pluginId)
  })

  ipcMain.handle("plugins:disable-globally", async () => {
    return disablePluginsGlobally()
  })

  ipcMain.handle("plugins:reset", async () => {
    return resetPlugins()
  })

  ipcMain.handle("plugins:update-runtime", async (event) => {
    if (!arePluginsEnabled()) {
      return {
        success: false,
        reason: "plugins-disabled" as const
      }
    }

    await ensurePluginNodeRuntimeInstalled(event.sender, true)

    return {
      success: true,
      version: PLUGIN_NODE_VERSION
    }
  })

  ipcMain.handle("settings:get", () => {
    return getSettings()
  })

  ipcMain.handle(
    "settings:set",
    (_event, key: keyof SettingsStore, value: boolean) => {
      try {
        settingsStore.set(key, value)
        logInfo(`Setting updated: ${key}=${String(value)}`)

        if (key === "startWithSystem" && !isDev) {
          try {
            app.setLoginItemSettings({
              openAtLogin: value
            })
          } catch {}
        }

        return {
          success: true,
          settings: getSettings(),
          path: settingsStore.path
        }
      } catch (error) {
        console.error("Failed to save setting:", key, error)
        logError(
          `Failed to save setting ${String(key)}: ${
            error instanceof Error ? error.message : "Unknown error."
          }`
        )

        return {
          success: false,
          settings: getSettings(),
          path: settingsStore.path
        }
      }
    }
  )

  ipcMain.handle("settings:path", () => {
    return getConfigDirectory()
  })

  ipcMain.handle("settings:reset", () => {
    try {
      settingsStore.set("startWithSystem", defaultSettings.startWithSystem)
      settingsStore.set("closeToTray", defaultSettings.closeToTray)
      settingsStore.set("darkTheme", defaultSettings.darkTheme)
      settingsStore.set("openNewTabs", defaultSettings.openNewTabs)
      settingsStore.set("developerMode", defaultSettings.developerMode)

      if (!isDev) {
        try {
          app.setLoginItemSettings({
            openAtLogin: defaultSettings.startWithSystem
          })
        } catch {}
      }

      return {
        success: true,
        settings: getSettings(),
        path: settingsStore.path
      }
    } catch (error) {
      console.error("Failed to reset settings:", error)
      logError(
        `Failed to reset settings: ${error instanceof Error ? error.message : "Unknown error."}`
      )

      return {
        success: false,
        settings: getSettings(),
        path: settingsStore.path
      }
    }
  })

  ipcMain.handle("module:open", (_event, moduleId: string) => {
    const moduleMap: Record<string, string> = {
      notepad: "Notepad",
      "todo-list": "To-Do List",
      "utility-tools": "Utility Tools"
    }

    const title = moduleMap[moduleId]

    if (!title) {
      return { success: false }
    }

    createModuleWindow(moduleId, title)
    return { success: true }
  })

  ipcMain.handle("window-state:reset", () => {
    const mainState = {
      width: 1200,
      height: 800
    }

    const notepadState = {
      width: 1000,
      height: 700
    }

    const pluginState = {
      width: 1000,
      height: 700
    }

    windowStateStore.set("main", mainState)
    windowStateStore.set("notepad", notepadState)
    windowStateStore.set("plugin", pluginState)

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      }
      mainWindow.setBounds(mainState)
      mainWindow.center()
    }

    for (const [windowKey, win] of moduleWindows.entries()) {
      if (!win.isDestroyed()) {
        if (win.isMaximized()) {
          win.unmaximize()
        }
        const targetState = windowKey === "notepad" ? notepadState : pluginState
        win.setBounds(targetState)
        win.center()
      }
    }

    return { success: true }
  })

  ipcMain.handle("utility:choose-directory", async () => {
    const result = await dialog.showOpenDialog({
      title: "Choose Directory",
      properties: ["openDirectory"]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    return {
      success: true,
      path: result.filePaths[0]
    }
  })

  ipcMain.handle("utility:open-directory", async (_event, directoryPath: string) => {
    const normalizedDirectoryPath = String(directoryPath || "").trim()
    if (!normalizedDirectoryPath) {
      return { success: false }
    }

    await shell.openPath(normalizedDirectoryPath)
    return { success: true }
  })

  ipcMain.handle("utility:start-file-watcher", async (event, directoryPath: string) => {
    const normalizedDirectoryPath = String(directoryPath || "").trim()
    if (!normalizedDirectoryPath) {
      return {
        success: false,
        error: "Choose a path first."
      }
    }

    try {
      const stat = await fs.stat(normalizedDirectoryPath)
      if (!stat.isDirectory()) {
        return {
          success: false,
          error: "The selected path is not a directory."
        }
      }

      await fs.access(normalizedDirectoryPath, constants.R_OK)
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || "")

      if (code === "ENOENT") {
        return {
          success: false,
          error: "The selected path does not exist anymore."
        }
      }

      if (code === "EACCES" || code === "EPERM") {
        return {
          success: false,
          error: "Pokenix Studio does not have permission to read that path."
        }
      }

      return {
        success: false,
        error: "Could not watch the selected path."
      }
    }

    stopUtilityWatcher(event.sender.id)

    const sendWatcherEvent = (message: string) => {
      if (event.sender.isDestroyed()) return
      event.sender.send("utility:file-watcher-event", {
        message
      })
    }

    const knownEntries = new Map<string, "file" | "directory">()

    try {
      await collectDirectoryEntries(normalizedDirectoryPath, normalizedDirectoryPath, knownEntries)
    } catch {
      return {
        success: false,
        error: "Could not read the selected path."
      }
    }

    const watcher = fsWatch(normalizedDirectoryPath, { recursive: true }, async (eventType, fileName) => {
      const displayName = typeof fileName === "string" && fileName.trim() ? fileName : "(unknown item)"
      const relativePath = typeof fileName === "string" && fileName.trim() ? path.normalize(fileName) : null
      const targetPath =
        typeof fileName === "string" && fileName.trim()
          ? path.join(normalizedDirectoryPath, fileName)
          : null

      const formatEventMessage = (
        action: "Created" | "Deleted" | "Modified" | "Changed",
        itemType?: "file" | "directory"
      ) => {
        const formattedName = itemType === "directory" ? `${displayName}/` : displayName

        if (!itemType) {
          return `${action}: ${formattedName}`
        }

        return `${action} ${itemType}: ${formattedName}`
      }

      try {
        await fs.access(normalizedDirectoryPath, constants.F_OK)
      } catch (error) {
        const code = String((error as NodeJS.ErrnoException)?.code || "")
        if (code === "ENOENT") {
          sendWatcherEvent("Selected path was deleted.")
          stopUtilityWatcher(event.sender.id)
          return
        }
      }

      if (eventType === "rename") {
        if (!targetPath) {
          sendWatcherEvent(`Changed: ${displayName}`)
          return
        }

        try {
          const targetStat = await fs.stat(targetPath)
          const itemType = targetStat.isDirectory() ? "directory" : "file"
          if (relativePath) {
            knownEntries.set(relativePath, itemType)
          }
          sendWatcherEvent(formatEventMessage("Created", itemType))
        } catch (error) {
          const code = String((error as NodeJS.ErrnoException)?.code || "")
          if (code === "ENOENT") {
            const previousType = relativePath ? knownEntries.get(relativePath) : undefined
            if (relativePath) {
              knownEntries.delete(relativePath)
            }
            sendWatcherEvent(formatEventMessage("Deleted", previousType))
            return
          }

          sendWatcherEvent(formatEventMessage("Changed"))
        }
        return
      }

      let itemType: "file" | "directory" | undefined = relativePath ? knownEntries.get(relativePath) : undefined

      if (!itemType && targetPath) {
        try {
          const targetStat = await fs.stat(targetPath)
          itemType = targetStat.isDirectory() ? "directory" : "file"
          if (relativePath) {
            knownEntries.set(relativePath, itemType)
          }
        } catch {}
      }

      sendWatcherEvent(formatEventMessage("Modified", itemType))
    })

    watcher.on("error", (error) => {
      const code = String((error as NodeJS.ErrnoException)?.code || "")
      if (code === "ENOENT") {
        sendWatcherEvent("Selected path was deleted.")
      } else {
        sendWatcherEvent(
          error instanceof Error ? `Watcher error: ${error.message}` : "Watcher error."
        )
      }

      stopUtilityWatcher(event.sender.id)
    })

    if (!event.sender.isDestroyed()) {
      event.sender.once("destroyed", () => {
        stopUtilityWatcher(event.sender.id)
      })
    }

    utilityWatchers.set(event.sender.id, {
      watcher,
      path: normalizedDirectoryPath,
      knownEntries
    })

    return {
      success: true,
      path: normalizedDirectoryPath
    }
  })

  ipcMain.handle("utility:stop-file-watcher", async (event) => {
    return stopUtilityWatcher(event.sender.id)
  })

  ipcMain.handle("utility:get-directory-item-count", async (_event, directoryPath: string) => {
    const normalizedDirectoryPath = String(directoryPath || "").trim()
    if (!normalizedDirectoryPath) {
      return { success: false }
    }

    try {
      const stat = await fs.stat(normalizedDirectoryPath)
      if (!stat.isDirectory()) {
        return {
          success: false,
          error: "The selected path is not a directory."
        }
      }

      const entries = await fs.readdir(normalizedDirectoryPath)
      return {
        success: true,
        count: entries.length
      }
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || "")

      if (code === "ENOENT") {
        return {
          success: false,
          error: "The selected path does not exist anymore."
        }
      }

      if (code === "EACCES" || code === "EPERM") {
        return {
          success: false,
          error: "Pokenix Studio does not have permission to read that path."
        }
      }

      return {
        success: false,
        error: "Could not read the selected path."
      }
    }
  })

  ipcMain.handle(
    "utility:get-directory-tree",
    async (
      _event,
      directoryPath: string,
      options?: { hideEmptyFolders?: boolean; hideHiddenFiles?: boolean }
    ) => {
    const normalizedDirectoryPath = String(directoryPath || "").trim()
    if (!normalizedDirectoryPath) {
      return {
        success: false,
        error: "Choose a path first."
      }
    }

    try {
      const stat = await fs.stat(normalizedDirectoryPath)
      if (!stat.isDirectory()) {
        return {
          success: false,
          error: "The selected path is not a directory."
        }
      }

      await fs.access(normalizedDirectoryPath, constants.R_OK)

      const rootName = path.basename(normalizedDirectoryPath) || normalizedDirectoryPath
      const lines = [
        `${rootName}/`,
        ...(await buildDirectoryTreeLines(
          normalizedDirectoryPath,
          {
            hideEmptyFolders: Boolean(options?.hideEmptyFolders),
            hideHiddenFiles: Boolean(options?.hideHiddenFiles)
          }
        ))
      ]

      return {
        success: true,
        tree: lines.join("\n")
      }
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || "")

      if (code === "ENOENT") {
        return {
          success: false,
          error: "The selected path does not exist anymore."
        }
      }

      if (code === "EACCES" || code === "EPERM") {
        return {
          success: false,
          error: "Pokenix Studio does not have permission to read that path."
        }
      }

      return {
        success: false,
        error: "Could not read the selected path."
      }
    }
  })

  ipcMain.handle("utility:validate-directory-name", async (_event, name: string) => {
    const error = validateDirectoryName(name)
    return {
      success: !error,
      error
    }
  })

  ipcMain.handle("utility:create-directories", async (_event, basePath: string, directories: string[]) => {
    if (!basePath || !Array.isArray(directories) || directories.length === 0) {
      return { success: false }
    }

    const normalizedBasePath = String(basePath || "").trim()
    if (!normalizedBasePath) {
      return {
        success: false,
        error: "Choose a path first."
      }
    }

    try {
      const basePathStat = await fs.stat(normalizedBasePath)
      if (!basePathStat.isDirectory()) {
        return {
          success: false,
          error: "The selected path is not a directory."
        }
      }

      await fs.access(normalizedBasePath, constants.W_OK)
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        const code = String((error as NodeJS.ErrnoException).code || "")
        if (code === "ENOENT") {
          return {
            success: false,
            error: "The selected path does not exist anymore."
          }
        }

        if (code === "EACCES" || code === "EPERM") {
          return {
            success: false,
            error: "Pokenix Studio does not have permission to write to that path."
          }
        }
      }

      return {
        success: false,
        error: "Could not access the selected path."
      }
    }

    const created: string[] = []
    const failed: string[] = []

    for (const directory of directories) {
      const name = String(directory || "").trim()
      if (!name) continue

      const validationError = validateDirectoryName(name)
      if (validationError) {
        failed.push(`${name}: ${validationError}`)
        continue
      }

      const targetPath = path.join(normalizedBasePath, name)

      try {
        const existingStat = await fs.stat(targetPath)
        if (existingStat.isDirectory()) {
          failed.push(`${name}: Directory already exists.`)
          continue
        }
      } catch {}

      try {
        await fs.mkdir(targetPath)
        created.push(targetPath)
      } catch (error) {
        failed.push(
          `${name}: ${error instanceof Error ? error.message : "Could not create directory."}`
        )
      }
    }

    if (failed.length > 0) {
      return {
        success: false,
        error: failed.join("\n"),
        created
      }
    }

    return {
      success: true,
      created
    }
  })

  ipcMain.handle("utility:check-transfer-conflicts", async (_event, oldPath: string, newPath: string) => {
    const validation = await validateTransferPaths(oldPath, newPath)

    if (!validation.success) {
      return validation
    }

    return {
      success: true,
      conflicts: validation.conflicts
    }
  })

  ipcMain.handle(
    "utility:transfer-files",
    async (
      _event,
      oldPath: string,
      newPath: string,
      mode: "copy" | "move",
      replaceExisting: boolean,
      deleteOldDirectory: boolean
    ) => {
      const validation = await validateTransferPaths(oldPath, newPath)

      if (!validation.success) {
        return validation
      }

      if (validation.conflicts.length > 0 && !replaceExisting) {
        return {
          success: false,
          error: "Some files or folders already exist in the new path.",
          conflicts: validation.conflicts
        }
      }

      const transferred: string[] = []

      try {
        for (const entryName of validation.entryNames) {
          const sourceEntryPath = path.join(validation.sourcePath, entryName)
          const destinationEntryPath = path.join(validation.destinationPath, entryName)
          const sourceItems = await collectTransferredItems(validation.sourcePath, entryName)

          if (replaceExisting) {
            await fs.rm(destinationEntryPath, {
              recursive: true,
              force: true
            })
          }

          if (mode === "copy") {
            await fs.cp(sourceEntryPath, destinationEntryPath, {
              recursive: true,
              force: replaceExisting
            })
          } else {
            await movePath(sourceEntryPath, destinationEntryPath)
          }

          transferred.push(...sourceItems)
        }

        if (deleteOldDirectory) {
          await fs.rm(validation.sourcePath, {
            recursive: true,
            force: true
          })
        }
      } catch (error) {
        const code = String((error as NodeJS.ErrnoException)?.code || "")

        if (code === "EACCES" || code === "EPERM") {
          return {
            success: false,
            error: "Pokenix Studio does not have permission to complete that transfer."
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : "Could not transfer files."
        }
      }

      return {
        success: true,
        transferred
      }
    }
  )

  ipcMain.handle("notepad:get-content", () => {
    const filePath = notesStore.get("notepadFilePath")
    updateNotepadWindowTitle(filePath)

    return {
      content: notesStore.get("notepadContent"),
      filePath
    }
  })

  ipcMain.handle("notepad:set-content", (_event, content: string, filePath: string) => {
    notesStore.set("notepadContent", content)
    notesStore.set("notepadFilePath", filePath)
    return { success: true }
  })

  ipcMain.handle("notepad:clear", () => {
    notesStore.set("notepadContent", "")
    notesStore.set("notepadFilePath", "")
    updateNotepadWindowTitle("")
    return { success: true }
  })

  ipcMain.handle("notepad:open-file", async () => {
    const win = getNotepadWindow()

    const result = win
      ? await dialog.showOpenDialog(win, {
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
      : await dialog.showOpenDialog({
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

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }

    const filePath = result.filePaths[0]
    const content = await fs.readFile(filePath, "utf8")

    notesStore.set("notepadContent", content)
    notesStore.set("notepadFilePath", filePath)
    updateNotepadWindowTitle(filePath)

    return {
      success: true,
      content,
      filePath
    }
  })

  ipcMain.handle("notepad:save-file", async (_event, content: string, filePath: string) => {
    if (!filePath) {
      return { success: false, needsSaveAs: true }
    }

    await fs.writeFile(filePath, content, "utf8")
    notesStore.set("notepadContent", content)
    notesStore.set("notepadFilePath", filePath)
    updateNotepadWindowTitle(filePath)

    return {
      success: true,
      filePath
    }
  })

  ipcMain.handle(
    "notepad:save-file-as",
    async (_event, content: string, currentPath: string) => {
      const win = getNotepadWindow()
      const defaultPath = currentPath || "Untitled.txt"

      const result = win
        ? await dialog.showSaveDialog(win, {
            title: "Save File As",
            defaultPath,
            filters: [
              { name: "Text Files", extensions: ["txt"] },
              { name: "Markdown Files", extensions: ["md"] },
              { name: "All Files", extensions: ["*"] }
            ]
          })
        : await dialog.showSaveDialog({
            title: "Save File As",
            defaultPath,
            filters: [
              { name: "Text Files", extensions: ["txt"] },
              { name: "Markdown Files", extensions: ["md"] },
              { name: "All Files", extensions: ["*"] }
            ]
          })

      if (result.canceled || !result.filePath) {
        return { success: false }
      }

      await fs.writeFile(result.filePath, content, "utf8")
      notesStore.set("notepadContent", content)
      notesStore.set("notepadFilePath", result.filePath)
      updateNotepadWindowTitle(result.filePath)

      return {
        success: true,
        filePath: result.filePath
      }
    }
  )

  ipcMain.on("notepad:set-dirty-state", (event, dirty: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    notepadDirtyState.set(win.id, Boolean(dirty))
  })

  ipcMain.on("notepad:save-all-result", () => {
  })

  ipcMain.handle("todos:list", () => {
    return {
      items: todosStore.get("items"),
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })

  ipcMain.handle("todos:add", (_event, text: string) => {
    const trimmedText = String(text || "").trim()
    if (!trimmedText) {
      return {
        success: false,
        items: todosStore.get("items")
      }
    }

    const nextItems = applyTodoOrdering(
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: trimmedText,
          completed: false,
          createdAt: Date.now()
        },
        ...todosStore.get("items")
      ],
      todosStore.get("moveCompletedToBottom")
    )

    todosStore.set("items", nextItems)

    return {
      success: true,
      items: nextItems,
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })

  ipcMain.handle("todos:toggle", (_event, id: string) => {
    const nextItems = applyTodoOrdering(
      todosStore.get("items").map((item) =>
        item.id === id
          ? {
              ...item,
              completed: !item.completed
            }
          : item
      ),
      todosStore.get("moveCompletedToBottom")
    )

    todosStore.set("items", nextItems)

    return {
      success: true,
      items: nextItems,
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })

  ipcMain.handle("todos:delete", (_event, id: string) => {
    const nextItems = todosStore.get("items").filter((item) => item.id !== id)
    todosStore.set("items", nextItems)

    return {
      success: true,
      items: nextItems,
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })

  ipcMain.handle("todos:reorder", (_event, orderedIds: string[]) => {
    const currentItems = todosStore.get("items")
    const currentMap = new Map(currentItems.map((item) => [item.id, item]))
    const nextItems = orderedIds
      .map((id) => currentMap.get(id))
      .filter((item): item is TodoItem => Boolean(item))

    const remainingItems = currentItems.filter((item) => !orderedIds.includes(item.id))
    const finalItems = applyTodoOrdering(
      [...nextItems, ...remainingItems],
      todosStore.get("moveCompletedToBottom")
    )

    todosStore.set("items", finalItems)

    return {
      success: true,
      items: finalItems,
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })

  ipcMain.handle("todos:set-move-completed-to-bottom", (_event, value: boolean) => {
    todosStore.set("moveCompletedToBottom", Boolean(value))
    const nextItems = applyTodoOrdering(todosStore.get("items"), Boolean(value))
    todosStore.set("items", nextItems)

    return {
      success: true,
      items: nextItems,
      moveCompletedToBottom: Boolean(value)
    }
  })

  ipcMain.handle("todos:clear-completed", () => {
    const nextItems = todosStore.get("items").filter((item) => !item.completed)
    todosStore.set("items", nextItems)

    return {
      success: true,
      items: nextItems,
      moveCompletedToBottom: todosStore.get("moveCompletedToBottom")
    }
  })
}

app.whenReady().then(async () => {
  await initStores()
  logInfo(`App started. Version ${app.getVersion()}.`)

  registerIpcHandlers()
  configureAutoUpdater()
  createApplicationMenu()
  createMainWindow()
  createTray()

  if (pluginStore.get("pluginsEnabled")) {
    void ensurePluginNodeRuntimeInstalled(mainWindow?.webContents ?? null).catch((error) => {
      console.error("Failed to update plugin runtime:", error)
      logError(
        `Failed to update plugin runtime: ${error instanceof Error ? error.message : "Unknown error."}`
      )
    })
  }

  if (!isDev) {
    try {
      app.setLoginItemSettings({
        openAtLogin: settingsStore.get("startWithSystem")
      })
    } catch {}
  }

  if (app.isPackaged) {
    void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      logError(
        `Failed to check for updates: ${error instanceof Error ? error.message : "Unknown error."}`
      )
    })
  }

  app.on("activate", () => {
    logInfo("App activate event fired.")
    showMainWindow()
  })
})

app.on("before-quit", () => {
  isQuitting = true
  logInfo("App is quitting.")
})

app.on("window-all-closed", () => {
  logInfo("All windows closed.")
})

process.on("uncaughtException", (error) => {
  logError(`Uncaught exception: ${error instanceof Error ? error.stack || error.message : String(error)}`)
})

process.on("unhandledRejection", (reason) => {
  logError(`Unhandled rejection: ${reason instanceof Error ? reason.stack || reason.message : String(reason)}`)
})
