import "./index.css"
import { Home, NotebookPen, Settings, Search, Replace, Plug, Palette, TerminalSquare, Wrench, ArrowLeft, FolderKanban, FolderOpen, Blocks, ListTodo } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

type Page = "home" | "plugins" | "themes" | "hub" | "settings" | "console"

type AppSettings = {
  startWithSystem: boolean
  closeToTray: boolean
  darkTheme: boolean
  openNewTabs: boolean
  developerMode: boolean
}

type ModuleId = "notepad" | "todo-list" | "utility-tools"

type ModuleItem = {
  id: ModuleId
  title: string
  description: string
  icon: React.ReactNode
}

type SettingsSetResponse = {
  success: boolean
  settings: AppSettings
  path: string
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
  disabled?: boolean
  open?: boolean
}

type PluginsListResponse = {
  enabled: boolean
  path: string
  runtimeInstalled: boolean
  plugins: PluginManifest[]
}

type PluginsStatusResponse = {
  enabled: boolean
  path: string
  runtimeInstalled: boolean
}

type PluginSetupProgress = {
  phase: "preparing" | "downloading" | "extracting" | "finalizing" | "ready"
  message: string
  percent?: number
}

type ConsoleLine = {
  text: string
  tone?: "normal" | "error"
  hintCommand?: string
  kind?: "command" | "output"
  timestamp?: string
}

type ConsoleIntroTimestamps = {
  developerMode: string
  help: string
  helpCommand: string
}

type PluginContentResponse = {
  plugin: PluginManifest
  script: string
  style?: string
  runtimeDirectory: string
  pluginDirectory: string
} | null

type TransferConflict = {
  name: string
  kind: "file" | "directory"
}

type NotepadContentResponse = {
  content: string
  filePath: string
}

type NotepadSaveResponse = {
  success: boolean
  filePath?: string
  needsSaveAs?: boolean
}

type Tab = {
  id: string
  content: string
  filePath: string
  dirty: boolean
}

type TabHistory = {
  undo: string[]
  redo: string[]
}

type MatchRange = {
  start: number
  end: number
}

type RgbColor = {
  r: number
  g: number
  b: number
}

type TodoItem = {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

declare global {
  interface Window {
    require?: (id: string) => unknown
    hubAPI: {
      settings: {
        get: () => Promise<AppSettings>
        set: (
          key: "startWithSystem" | "closeToTray" | "darkTheme" | "openNewTabs" | "developerMode",
          value: boolean
        ) => Promise<SettingsSetResponse>
        path: () => Promise<string>
        reset: () => Promise<SettingsSetResponse>
      }
      modules: {
        open: (moduleId: ModuleId) => Promise<{ success: boolean }>
      }
      todos: {
        list: () => Promise<{ items: TodoItem[]; moveCompletedToBottom: boolean }>
        add: (text: string) => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
        toggle: (id: string) => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
        delete: (id: string) => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
        reorder: (orderedIds: string[]) => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
        setMoveCompletedToBottom: (
          value: boolean
        ) => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
        clearCompleted: () => Promise<{ success: boolean; items: TodoItem[]; moveCompletedToBottom: boolean }>
      }
      plugins: {
        status: () => Promise<PluginsStatusResponse>
        enable: () => Promise<PluginsStatusResponse>
        list: () => Promise<PluginsListResponse>
        path: () => Promise<string>
        openDirectory: () => Promise<{ success: boolean }>
        get: (pluginId: string) => Promise<PluginContentResponse>
        open: (pluginId: string) => Promise<{ success: boolean }>
        close: (pluginId: string) => Promise<{ success: boolean }>
        closeAll: () => Promise<{ success: boolean }>
        disable: (pluginId: string) => Promise<{ success: boolean }>
        disableAll: () => Promise<{ success: boolean }>
        enableAll: () => Promise<{ success: boolean }>
        disableGlobally: () => Promise<PluginsStatusResponse>
        reset: () => Promise<PluginsStatusResponse>
        updateRuntime: () => Promise<{ success: boolean; version?: string; reason?: "plugins-disabled" }>
        enableOne: (pluginId: string) => Promise<{ success: boolean }>
        delete: (pluginId: string) => Promise<{ success: boolean }>
        onSetupProgress: (callback: (progress: PluginSetupProgress) => void) => () => void
        onStateChanged: (callback: () => void) => () => void
        require: (runtimeDirectory: string, specifier: string) => Promise<unknown>
      }
      app: {
        version: () => Promise<string>
        openWebsite: () => Promise<{ success: boolean }>
        openExternalUrl: (url: string) => Promise<{ success: boolean }>
        openLogsDirectory: () => Promise<{ success: boolean }>
        onNavigate: (callback: (page: Page) => void) => () => void
      }
      windowState: {
        reset: () => Promise<{ success: boolean }>
      }
  utility: {
        chooseDirectory: () => Promise<{ success: boolean; path?: string }>
        openDirectory: (directoryPath: string) => Promise<{ success: boolean }>
        startFileWatcher: (
          directoryPath: string
        ) => Promise<{ success: boolean; path?: string; error?: string }>
        stopFileWatcher: () => Promise<{ success: boolean }>
        onFileWatcherEvent: (callback: (payload: { message: string }) => void) => () => void
        getDirectoryItemCount: (
          directoryPath: string
        ) => Promise<{ success: boolean; count?: number; error?: string }>
        getDirectoryTree: (
          directoryPath: string,
          options?: { hideEmptyFolders?: boolean; hideHiddenFiles?: boolean }
        ) => Promise<{ success: boolean; tree?: string; error?: string }>
        validateDirectoryName: (
          name: string
        ) => Promise<{ success: boolean; error?: string }>
        createDirectories: (
          basePath: string,
          directories: string[]
        ) => Promise<{ success: boolean; created?: string[]; error?: string }>
        checkTransferConflicts: (
          oldPath: string,
          newPath: string
        ) => Promise<{ success: boolean; conflicts?: TransferConflict[]; error?: string }>
        transferFiles: (
          oldPath: string,
          newPath: string,
          mode: "copy" | "move",
          replaceExisting: boolean,
          deleteOldDirectory: boolean
        ) => Promise<{ success: boolean; transferred?: string[]; conflicts?: TransferConflict[]; error?: string }>
      }
      notepad: {
        getContent: () => Promise<NotepadContentResponse>
        setContent: (content: string, filePath: string) => Promise<{ success: true }>
        clear: () => Promise<{ success: true }>
        openFile: () => Promise<{ success: boolean; content?: string; filePath?: string }>
        saveFile: (content: string, filePath: string) => Promise<NotepadSaveResponse>
        saveFileAs: (content: string, currentPath: string) => Promise<NotepadSaveResponse>
        setDirtyState: (dirty: boolean) => void
        onSaveAllRequest: (callback: () => Promise<boolean> | boolean) => () => void
      }
    }
  }
}

function HomePage({ modules }: { modules: ModuleItem[] }) {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Welcome back</h1>
          <p>Choose a module to get started.</p>
        </div>
      </div>

      <section className="modules-section">
        <div className="section-header">
          <h2>Modules</h2>
          <span>{modules.length} available</span>
        </div>

        <div className="module-grid">
          {modules.map((module) => (
            <button
              key={module.id}
              className="module-card"
              onClick={() => {
                void window.hubAPI.modules.open(module.id)
              }}
            >
              <div className="module-icon">{module.icon}</div>
              <div className="module-info">
                <h3>{module.title}</h3>
                <p>{module.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}

function clampColorChannel(value: number) {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim().replace(/^#/, "")

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return null
  }

  if (trimmed.length === 3) {
    return trimmed
      .split("")
      .map((character) => character + character)
      .join("")
      .toUpperCase()
  }

  return trimmed.toUpperCase()
}

function hexToRgb(value: string): RgbColor | null {
  const normalizedHex = normalizeHexColor(value)
  if (!normalizedHex) return null

  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16),
    g: Number.parseInt(normalizedHex.slice(2, 4), 16),
    b: Number.parseInt(normalizedHex.slice(4, 6), 16)
  }
}

function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`
}

function parseRgbColor(value: string): RgbColor | null {
  const cleaned = value.trim().replace(/^rgb\s*\(/i, "").replace(/\)$/i, "")
  const parts = cleaned
    .split(/[,\s/]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length !== 3) {
    return null
  }

  const channels = parts.map((part) => Number(part))
  if (channels.some((channel) => Number.isNaN(channel) || channel < 0 || channel > 255)) {
    return null
  }

  return {
    r: clampColorChannel(channels[0]),
    g: clampColorChannel(channels[1]),
    b: clampColorChannel(channels[2])
  }
}

function rgbToHsl({ r, g, b }: RgbColor) {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2

  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))

    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6
        break
      case green:
        hue = (blue - red) / delta + 2
        break
      default:
        hue = (red - green) / delta + 4
        break
    }

    hue *= 60
    if (hue < 0) hue += 360
  }

  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  }
}

function parseHslColor(value: string): RgbColor | null {
  const cleaned = value
    .trim()
    .replace(/^hsl\s*\(/i, "")
    .replace(/\)$/i, "")
    .replace(/%/g, "")
  const parts = cleaned
    .split(/[,\s/]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length !== 3) {
    return null
  }

  const [rawHue, rawSaturation, rawLightness] = parts.map((part) => Number(part))

  if (
    [rawHue, rawSaturation, rawLightness].some((part) => Number.isNaN(part)) ||
    rawSaturation < 0 ||
    rawSaturation > 100 ||
    rawLightness < 0 ||
    rawLightness > 100
  ) {
    return null
  }

  const hue = ((rawHue % 360) + 360) % 360
  const saturation = rawSaturation / 100
  const lightness = rawLightness / 100
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const hueSegment = hue / 60
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1))

  let redPrime = 0
  let greenPrime = 0
  let bluePrime = 0

  if (hueSegment >= 0 && hueSegment < 1) {
    redPrime = chroma
    greenPrime = x
  } else if (hueSegment < 2) {
    redPrime = x
    greenPrime = chroma
  } else if (hueSegment < 3) {
    greenPrime = chroma
    bluePrime = x
  } else if (hueSegment < 4) {
    greenPrime = x
    bluePrime = chroma
  } else if (hueSegment < 5) {
    redPrime = x
    bluePrime = chroma
  } else {
    redPrime = chroma
    bluePrime = x
  }

  const match = lightness - chroma / 2

  return {
    r: clampColorChannel((redPrime + match) * 255),
    g: clampColorChannel((greenPrime + match) * 255),
    b: clampColorChannel((bluePrime + match) * 255)
  }
}

function SettingsPage({
  settings,
  updateSetting,
  resetSettings,
  pluginsEnabled,
  disablePlugins,
  resetPlugins,
  settingsPath,
  appVersion
}: {
  settings: AppSettings
  updateSetting: (
    key: "startWithSystem" | "closeToTray" | "darkTheme" | "openNewTabs" | "developerMode",
    value: boolean
  ) => Promise<void>
  resetSettings: () => Promise<void>
  pluginsEnabled: boolean
  disablePlugins: () => Promise<void>
  resetPlugins: () => Promise<void>
  settingsPath: string
  appVersion: string
}) {
  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-group">
        <h3>General</h3>

        <label className="settings-item">
          <span>Start with system</span>
          <input
            type="checkbox"
            checked={settings.startWithSystem}
            onChange={(e) => void updateSetting("startWithSystem", e.target.checked)}
          />
        </label>

        <label className="settings-item">
          <span>Close to tray</span>
          <input
            type="checkbox"
            checked={settings.closeToTray}
            onChange={(e) => void updateSetting("closeToTray", e.target.checked)}
          />
        </label>

        <label className="settings-item">
          <span>Dark theme</span>
          <input
            type="checkbox"
            checked={settings.darkTheme}
            onChange={(e) => void updateSetting("darkTheme", e.target.checked)}
          />
        </label>

        <label className="settings-item">
          <span>Enable Developer Mode</span>
          <input
            type="checkbox"
            checked={settings.developerMode}
            onChange={(e) => void updateSetting("developerMode", e.target.checked)}
          />
        </label>

        <div className="settings-action-row">
          <button
            className="notepad-action-btn"
            onClick={async () => {
              await window.hubAPI.windowState.reset()
            }}
          >
            Reset window layout
          </button>

          <button
            className="notepad-clear-btn"
            onClick={async () => {
              const confirmed = window.confirm("Disable plugins globally and close all plugin windows?")

              if (!confirmed) return
              await disablePlugins()
            }}
            disabled={!pluginsEnabled}
          >
            Disable Plugins
          </button>

          <button
            className="notepad-action-btn"
            onClick={async () => {
              const confirmed = window.confirm(
                "Reset plugins, remove the plugins and runtime folders, and require plugin setup again?"
              )

              if (!confirmed) return
              await resetPlugins()
            }}
          >
            Reset Plugins
          </button>

          <button
            className="notepad-action-btn"
            onClick={async () => {
              const confirmed = window.confirm(
                "Reset all settings to default values?"
              )

              if (!confirmed) return
              await resetSettings()
            }}
          >
            Reset settings to default
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h3>Notepad</h3>

        <label className="settings-item">
          <span>Open new tabs</span>
          <input
            type="checkbox"
            checked={settings.openNewTabs}
            onChange={(e) => void updateSetting("openNewTabs", e.target.checked)}
          />
        </label>
      </div>

      <div className="settings-group">
        <h3>About</h3>
        <p>Pokenix Studio {appVersion ? `v${appVersion}` : "Loading..."}</p>
        <p style={{ marginTop: 10, wordBreak: "break-all" }}>
          Config path: {settingsPath || "Loading..."}
        </p>
        <div className="settings-action-row">
          <button
            className="notepad-action-btn"
            onClick={() => {
              void window.hubAPI.app.openExternalUrl("https://www.pokenix.com/studio/report")
            }}
            type="button"
          >
            Report a Bug
          </button>
          <button
            className="notepad-action-btn"
            onClick={() => {
              void window.hubAPI.app.openLogsDirectory()
            }}
            type="button"
          >
            Open Logs Folder
          </button>
        </div>
      </div>
    </div>
  )
}

function PluginsPage({
  pluginsEnabled,
  plugins,
  pluginsPath,
  pluginsRuntimeInstalled,
  pluginSetupError,
  pluginSetupLoading,
  pluginSetupProgress,
  onEnablePlugins,
  onRefreshPlugins
}: {
  pluginsEnabled: boolean
  plugins: PluginManifest[]
  pluginsPath: string
  pluginsRuntimeInstalled: boolean
  pluginSetupError: string
  pluginSetupLoading: boolean
  pluginSetupProgress: PluginSetupProgress | null
  onEnablePlugins: () => Promise<void>
  onRefreshPlugins: () => Promise<void>
}) {
  const hasPlugins = plugins.length > 0
  const hasOpenPlugins = plugins.some((plugin) => plugin.open)
  const hasEnabledPlugins = plugins.some((plugin) => !plugin.disabled)
  const hasDisabledPlugins = plugins.some((plugin) => plugin.disabled)

  if (!pluginsEnabled) {
    return (
      <div className="settings-page">
        <h1>Plugins</h1>
        <div className="settings-group">
          <h3>Enable plugins</h3>
          <p>
            Plugins are optional. They require Node.js support and can install third-party
            packages automatically.
          </p>
          <p style={{ marginTop: 10 }}>
            Issues caused by third-party plugins are not the responsibility of Pokenix.
          </p>
          {pluginSetupLoading && (
            <p style={{ marginTop: 10 }}>
              {pluginSetupProgress?.message || "Setting up plugin runtime. This may take a moment."}
            </p>
          )}
          {pluginSetupLoading && pluginSetupProgress?.percent !== undefined && (
            <p style={{ marginTop: 10 }}>Progress: {pluginSetupProgress.percent}%</p>
          )}
          {pluginSetupError && <p style={{ marginTop: 10 }}>{pluginSetupError}</p>}

          <div className="settings-action-row">
            <button
              className="notepad-action-btn"
              onClick={() => {
                void onEnablePlugins()
              }}
              disabled={pluginSetupLoading}
              type="button"
            >
              {pluginSetupLoading ? "Setting Up..." : "Enable Plugins"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <h1>Plugins</h1>
      <p className="page-subtitle">
        Add plugin folders to the plugins directory and restart Pokenix Studio to load them.
      </p>

      <div className="settings-group">
        <h3>Installed plugins</h3>
        <p>{plugins.length} plugin{plugins.length === 1 ? "" : "s"} found</p>
        <p style={{ marginTop: 10 }}>
          Runtime: {pluginsRuntimeInstalled ? "Installed" : "Missing"}
        </p>
        <p style={{ marginTop: 10, wordBreak: "break-all" }}>
          Plugins path: {pluginsPath || "Loading..."}
        </p>
        <div className="settings-action-row" style={{ marginTop: 14 }}>
          <button
            className="notepad-action-btn"
            onClick={async () => {
              const confirmed = window.confirm("Close all open plugin windows?")

              if (!confirmed) return
              await window.hubAPI.plugins.closeAll()
              await onRefreshPlugins()
            }}
            disabled={!hasPlugins || !hasOpenPlugins}
            type="button"
          >
            Close All Plugins
          </button>
          <button
            className="notepad-action-btn"
            onClick={async () => {
              await window.hubAPI.plugins.enableAll()
              await onRefreshPlugins()
            }}
            disabled={!hasPlugins || !hasDisabledPlugins}
            type="button"
          >
            Enable All Plugins
          </button>
          <button
            className="notepad-clear-btn"
            onClick={async () => {
              await window.hubAPI.plugins.disableAll()
              await window.hubAPI.plugins.closeAll()
              await onRefreshPlugins()
            }}
            disabled={!hasPlugins || !hasEnabledPlugins}
            type="button"
          >
            Disable All Plugins
          </button>
          <button
            className="notepad-action-btn"
            onClick={() => {
              void window.hubAPI.plugins.openDirectory()
            }}
            type="button"
          >
            Open Plugins Directory
          </button>
        </div>
      </div>

      <div className="module-grid">
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className={`module-card ${plugin.disabled ? "module-card-disabled" : ""}`}
          >
            <div className="module-icon">
              <Plug size={22} />
            </div>
            <div className="module-info">
              <h3>{plugin.name}</h3>
              <p>{plugin.description || "No description provided."}</p>
              <div className="plugin-meta-row">
                <p className="plugin-meta">{plugin.author || "Unknown author"}</p>
                <p className="plugin-meta">v{plugin.version}</p>
              </div>
              {plugin.open && <p className="plugin-meta">Running</p>}
              {plugin.disabled && <p className="plugin-meta">Disabled</p>}
            </div>
            <div className="settings-action-row" style={{ marginTop: 14 }}>
              <button
                className="notepad-action-btn"
                onClick={async () => {
                  if (plugin.open) {
                    await window.hubAPI.plugins.close(plugin.id)
                  } else {
                    await window.hubAPI.plugins.open(plugin.id)
                  }
                  await onRefreshPlugins()
                }}
                disabled={plugin.disabled && !plugin.open}
                type="button"
              >
                {plugin.open ? "Close" : "Open"}
              </button>
              <button
                className="notepad-action-btn"
                onClick={async () => {
                  if (plugin.disabled) {
                    await window.hubAPI.plugins.enableOne(plugin.id)
                  } else {
                    await window.hubAPI.plugins.disable(plugin.id)
                  }
                  await onRefreshPlugins()
                }}
                disabled={plugin.open}
                type="button"
              >
                {plugin.disabled ? "Enable" : "Disable"}
              </button>
              <button
                className="notepad-clear-btn"
                onClick={async () => {
                  const confirmed = window.confirm(
                    `Delete plugin "${plugin.name}" and its runtime files?`
                  )

                  if (!confirmed) return

                  await window.hubAPI.plugins.delete(plugin.id)
                  await onRefreshPlugins()
                }}
                disabled={plugin.open}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {plugins.length === 0 && (
        <div className="settings-group">
          <h3>No plugins yet</h3>
          <p>Drop plugin folders into the plugins directory to see them here.</p>
        </div>
      )}
    </div>
  )
}

function ThemesPage() {
  return (
    <div className="settings-page">
      <h1>Themes</h1>
      <p className="page-subtitle">Coming soon...</p>
    </div>
  )
}

function HubPage() {
  return (
    <div className="settings-page">
      <h1>Pokenix Hub</h1>
      <p className="page-subtitle">Coming soon...</p>
    </div>
  )
}

function TodoListPage() {
  const [items, setItems] = useState<TodoItem[]>([])
  const [draft, setDraft] = useState("")
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null)
  const [moveCompletedToBottom, setMoveCompletedToBottom] = useState(true)

  useEffect(() => {
    const loadTodos = async () => {
      const result = await window.hubAPI.todos.list()
      setItems(result.items)
      setMoveCompletedToBottom(result.moveCompletedToBottom)
    }

    void loadTodos()
  }, [])

  const addTodo = async () => {
    const result = await window.hubAPI.todos.add(draft)
    if (!result.success) return
    setItems(result.items)
    setMoveCompletedToBottom(result.moveCompletedToBottom)
    setDraft("")
  }

  const reorderTodos = async (fromId: string, toId: string) => {
    if (fromId === toId) return

    const currentIndex = items.findIndex((item) => item.id === fromId)
    const targetIndex = items.findIndex((item) => item.id === toId)
    if (currentIndex === -1 || targetIndex === -1) return

    const nextItems = [...items]
    const [movedItem] = nextItems.splice(currentIndex, 1)
    nextItems.splice(targetIndex, 0, movedItem)

    setItems(nextItems)

    const result = await window.hubAPI.todos.reorder(nextItems.map((item) => item.id))
    if (result.success) {
      setItems(result.items)
      setMoveCompletedToBottom(result.moveCompletedToBottom)
    }
  }

  const activeCount = items.filter((item) => !item.completed).length
  const completedCount = items.length - activeCount
  const linkPattern = /(https?:\/\/[^\s]+)/g

  const renderTodoText = (text: string, completed: boolean) => {
    const parts = text.split(linkPattern)

    return parts.map((part, index) => {
      if (!/^https?:\/\//i.test(part)) {
        return <span key={`${part}-${index}`}>{part}</span>
      }

      return (
        <a
          key={`${part}-${index}`}
          className={completed ? "todo-item-link todo-item-link-completed" : "todo-item-link"}
          href={part}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void window.hubAPI.app.openExternalUrl(part)
          }}
        >
          {part}
        </a>
      )
    })
  }

  return (
    <div className="module-page">
      <h1>To-Do List</h1>
      <p>Track quick tasks and keep them between app launches.</p>

      <div className="settings-group" style={{ marginTop: 24, maxWidth: 880 }}>
        <h3>Add task</h3>
        <div className="todo-input-row">
          <input
            className="utility-input"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              void addTodo()
            }}
            placeholder="Write a task..."
          />
          <button
            className="notepad-action-btn"
            onClick={() => {
              void addTodo()
            }}
            disabled={!draft.trim()}
            type="button"
          >
            Add
          </button>
        </div>
      </div>

      <div className="settings-group" style={{ maxWidth: 880 }}>
        <h3>Tasks</h3>
        <p style={{ marginBottom: 14 }}>
          {activeCount} active, {completedCount} completed
        </p>
        <label className="settings-item todo-settings-item">
          <span>Move completed tasks to bottom</span>
          <input
            type="checkbox"
            checked={moveCompletedToBottom}
            onChange={(event) => {
              void window.hubAPI.todos.setMoveCompletedToBottom(event.target.checked).then((result) => {
                setItems(result.items)
                setMoveCompletedToBottom(result.moveCompletedToBottom)
              })
            }}
          />
        </label>

        {items.length === 0 ? (
          <p>No tasks yet.</p>
        ) : (
          <div className="todo-list">
            {items.map((item) => (
              <div
                key={item.id}
                className={`todo-item ${draggedTodoId === item.id ? "todo-item-dragging" : ""}`}
                draggable
                onDragStart={() => setDraggedTodoId(item.id)}
                onDragEnd={() => setDraggedTodoId(null)}
                onDragOver={(event) => {
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (!draggedTodoId) return
                  void reorderTodos(draggedTodoId, item.id)
                  setDraggedTodoId(null)
                }}
              >
                <div className="todo-item-main">
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => {
                      void window.hubAPI.todos.toggle(item.id).then((result) => {
                        setItems(result.items)
                        setMoveCompletedToBottom(result.moveCompletedToBottom)
                      })
                    }}
                  />
                  <span className={item.completed ? "todo-item-text todo-item-text-completed" : "todo-item-text"}>
                    {renderTodoText(item.text, item.completed)}
                  </span>
                </div>

                <button
                  className="notepad-clear-btn"
                  onClick={() => {
                    void window.hubAPI.todos.delete(item.id).then((result) => {
                      setItems(result.items)
                      setMoveCompletedToBottom(result.moveCompletedToBottom)
                    })
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="settings-action-row">
          <button
            className="notepad-action-btn"
            onClick={() => {
              void window.hubAPI.todos.clearCompleted().then((result) => {
                setItems(result.items)
                setMoveCompletedToBottom(result.moveCompletedToBottom)
              })
            }}
            disabled={completedCount === 0}
            type="button"
          >
            Clear Completed
          </button>
        </div>
      </div>
    </div>
  )
}

function UtilityToolsPage() {
  const [activeTool, setActiveTool] = useState<"home" | "file-manager" | "color-tools">("home")
  const [activeFileManagerTool, setActiveFileManagerTool] = useState<
    "home" | "create-files" | "move-files" | "directory-structure" | "file-watcher"
  >("home")
  const [activeColorTool, setActiveColorTool] = useState<"home" | "converter">("home")

  const [directoriesBasePath, setDirectoriesBasePath] = useState("")
  const [directoryName, setDirectoryName] = useState("")
  const [directoryList, setDirectoryList] = useState<string[]>([])
  const [directoryMessage, setDirectoryMessage] = useState("")
  const [moveOldPath, setMoveOldPath] = useState("")
  const [moveNewPath, setMoveNewPath] = useState("")
  const [moveOldPathCount, setMoveOldPathCount] = useState<number | null>(null)
  const [moveNewPathCount, setMoveNewPathCount] = useState<number | null>(null)
  const [moveMessage, setMoveMessage] = useState("")
  const [transferredItems, setTransferredItems] = useState<string[]>([])
  const [treePath, setTreePath] = useState("")
  const [treeOutput, setTreeOutput] = useState("")
  const [treeMessage, setTreeMessage] = useState("")
  const [hideEmptyFolders, setHideEmptyFolders] = useState(false)
  const [hideHiddenFiles, setHideHiddenFiles] = useState(false)
  const [watcherPath, setWatcherPath] = useState("")
  const [watcherMessage, setWatcherMessage] = useState("")
  const [watcherLogs, setWatcherLogs] = useState<string[]>([])
  const [hexValue, setHexValue] = useState("#3ABEFF")
  const [rgbR, setRgbR] = useState("58")
  const [rgbG, setRgbG] = useState("190")
  const [rgbB, setRgbB] = useState("255")
  const [hslH, setHslH] = useState("199")
  const [hslS, setHslS] = useState("100")
  const [hslL, setHslL] = useState("61")
  const [colorMessage, setColorMessage] = useState("")
  const colorPickerRef = useRef<HTMLInputElement | null>(null)

  const colorPreview = useMemo(() => {
    const hexRgb = hexToRgb(hexValue)
    if (hexRgb) {
      return {
        rgb: hexRgb,
        source: "hex" as const
      }
    }

    const parsedRgb = parseRgbColor(`${rgbR}, ${rgbG}, ${rgbB}`)
    if (parsedRgb) {
      return {
        rgb: parsedRgb,
        source: "rgb" as const
      }
    }

    const parsedHsl = parseHslColor(`${hslH}, ${hslS}%, ${hslL}%`)
    if (parsedHsl) {
      return {
        rgb: parsedHsl,
        source: "hsl" as const
      }
    }

    return null
  }, [hexValue, rgbR, rgbG, rgbB, hslH, hslS, hslL])

  const syncHexValue = (nextValue: string) => {
    setHexValue(nextValue)
    const rgb = hexToRgb(nextValue)
    if (!rgb) {
      setColorMessage("Enter a valid HEX value like #3ABEFF or #0af.")
      return
    }

    const hsl = rgbToHsl(rgb)
    setHexValue(rgbToHex(rgb))
    setRgbR(String(rgb.r))
    setRgbG(String(rgb.g))
    setRgbB(String(rgb.b))
    setHslH(String(hsl.h))
    setHslS(String(hsl.s))
    setHslL(String(hsl.l))
    setColorMessage("")
  }

  const syncRgbValue = (channel: "r" | "g" | "b", nextValue: string) => {
    if (channel === "r") setRgbR(nextValue)
    if (channel === "g") setRgbG(nextValue)
    if (channel === "b") setRgbB(nextValue)

    const nextRgbValue = {
      r: channel === "r" ? nextValue : rgbR,
      g: channel === "g" ? nextValue : rgbG,
      b: channel === "b" ? nextValue : rgbB
    }

    const rgb = parseRgbColor(`${nextRgbValue.r}, ${nextRgbValue.g}, ${nextRgbValue.b}`)
    if (!rgb) {
      setColorMessage("Enter RGB as three values between 0 and 255.")
      return
    }

    const hsl = rgbToHsl(rgb)
    setHexValue(rgbToHex(rgb))
    setRgbR(String(rgb.r))
    setRgbG(String(rgb.g))
    setRgbB(String(rgb.b))
    setHslH(String(hsl.h))
    setHslS(String(hsl.s))
    setHslL(String(hsl.l))
    setColorMessage("")
  }

  const syncHslValue = (channel: "h" | "s" | "l", nextValue: string) => {
    if (channel === "h") setHslH(nextValue)
    if (channel === "s") setHslS(nextValue)
    if (channel === "l") setHslL(nextValue)

    const nextHslValue = {
      h: channel === "h" ? nextValue : hslH,
      s: channel === "s" ? nextValue : hslS,
      l: channel === "l" ? nextValue : hslL
    }

    const rgb = parseHslColor(`${nextHslValue.h}, ${nextHslValue.s}%, ${nextHslValue.l}%`)
    if (!rgb) {
      setColorMessage("Enter HSL as hue, saturation%, lightness%.")
      return
    }

    const hsl = rgbToHsl(rgb)
    setHexValue(rgbToHex(rgb))
    setRgbR(String(rgb.r))
    setRgbG(String(rgb.g))
    setRgbB(String(rgb.b))
    setHslH(String(hsl.h))
    setHslS(String(hsl.s))
    setHslL(String(hsl.l))
    setColorMessage("")
  }

  const tryAddDirectory = async () => {
    const trimmedName = directoryName.trim()
    if (!trimmedName) return

    const normalizedName = trimmedName.toLocaleLowerCase()
    const alreadyInList = directoryList.some((item) => item.toLocaleLowerCase() === normalizedName)

    if (alreadyInList) {
      setDirectoryMessage("That directory is already in the list.")
      return
    }

    const validation = await window.hubAPI.utility.validateDirectoryName(trimmedName)
    if (!validation.success) {
      setDirectoryMessage(validation.error || "That directory name is not valid.")
      return
    }

    setDirectoryList((current) => [...current, trimmedName])
    setDirectoryName("")
    setDirectoryMessage("")
  }

  const runTransfer = async (mode: "copy" | "move", deleteOldDirectory = false) => {
    setTransferredItems([])

    if (!moveOldPath) {
      setMoveMessage("Choose an old path first.")
      return
    }

    if (!moveNewPath) {
      setMoveMessage("Choose a new path first.")
      return
    }

    const conflictCheck = await window.hubAPI.utility.checkTransferConflicts(moveOldPath, moveNewPath)
    if (!conflictCheck.success) {
      setMoveMessage(conflictCheck.error || "Could not validate those paths.")
      return
    }

    let replaceExisting = false

    if ((conflictCheck.conflicts?.length || 0) > 0) {
      const shouldReplace = window.confirm(
        `Some files or folders already exist in the new path.\n\nConflicts:\n${conflictCheck.conflicts
          ?.map((item) => `- ${item.name} (${item.kind})`)
          .join("\n")}\n\nPress OK to replace them, or Cancel to stop the transfer.`
      )

      if (!shouldReplace) {
        setMoveMessage("Transfer cancelled.")
        return
      }

      replaceExisting = true
    }

    setMoveMessage(mode === "copy" ? "Copying files..." : "Moving files...")

    const result = await window.hubAPI.utility.transferFiles(
      moveOldPath,
      moveNewPath,
      mode,
      replaceExisting,
      deleteOldDirectory
    )

    if (!result.success) {
      setMoveMessage(result.error || `Could not ${mode} files.`)
      return
    }

    setTransferredItems(result.transferred || [])

    const [oldCountResult, newCountResult] = await Promise.all([
      deleteOldDirectory || !moveOldPath
        ? Promise.resolve({ success: false, count: undefined })
        : window.hubAPI.utility.getDirectoryItemCount(moveOldPath),
      !moveNewPath
        ? Promise.resolve({ success: false, count: undefined })
        : window.hubAPI.utility.getDirectoryItemCount(moveNewPath)
    ])

    setMoveOldPathCount(deleteOldDirectory ? null : oldCountResult.success ? (oldCountResult.count ?? 0) : null)
    setMoveNewPathCount(newCountResult.success ? (newCountResult.count ?? 0) : null)

    if (deleteOldDirectory) {
      setMoveOldPath("")
    }
    setMoveMessage(
      `${result.transferred?.length || 0} item${result.transferred?.length === 1 ? "" : "s"} ${
        mode === "copy" ? "copied" : "moved"
      }${deleteOldDirectory ? " and the old directory was deleted." : "."}`
    )
  }

  const hasSameTransferPath =
    Boolean(moveOldPath) &&
    Boolean(moveNewPath) &&
    moveOldPath === moveNewPath

  useEffect(() => {
    let cancelled = false

    const loadOldPathCount = async () => {
      if (!moveOldPath) {
        setMoveOldPathCount(null)
        return
      }

      const result = await window.hubAPI.utility.getDirectoryItemCount(moveOldPath)
      if (cancelled) return

      setMoveOldPathCount(result.success ? (result.count ?? 0) : null)
    }

    void loadOldPathCount()

    return () => {
      cancelled = true
    }
  }, [moveOldPath])

  useEffect(() => {
    let cancelled = false

    const loadNewPathCount = async () => {
      if (!moveNewPath) {
        setMoveNewPathCount(null)
        return
      }

      const result = await window.hubAPI.utility.getDirectoryItemCount(moveNewPath)
      if (cancelled) return

      setMoveNewPathCount(result.success ? (result.count ?? 0) : null)
    }

    void loadNewPathCount()

    return () => {
      cancelled = true
    }
  }, [moveNewPath])

  const refreshDirectoryTree = async (nextPath = treePath) => {
    if (!nextPath) {
      setTreeMessage("Choose a path first.")
      return
    }

    const result = await window.hubAPI.utility.getDirectoryTree(nextPath, {
      hideEmptyFolders,
      hideHiddenFiles
    })

    if (!result.success || !result.tree) {
      setTreeOutput("")
      setTreeMessage(result.error || "Could not load the directory structure.")
      return
    }

    setTreeOutput(result.tree)
    setTreeMessage("")
  }

  useEffect(() => {
    if (!treePath) return
    void refreshDirectoryTree(treePath)
  }, [treePath, hideEmptyFolders, hideHiddenFiles])

  useEffect(() => {
    if (!(activeTool === "file-manager" && activeFileManagerTool === "file-watcher")) {
      void window.hubAPI.utility.stopFileWatcher()
      return
    }

    const unsubscribe = window.hubAPI.utility.onFileWatcherEvent(({ message }) => {
      const timestamp = new Date().toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })

      setWatcherLogs((current) => [`[${timestamp}] ${message}`, ...current])

      if (message === "Selected path was deleted.") {
        setWatcherMessage(message)
        setWatcherPath("")
      }
    })

    return () => {
      unsubscribe()
      void window.hubAPI.utility.stopFileWatcher()
    }
  }, [activeTool, activeFileManagerTool])

  if (activeTool === "file-manager" && activeFileManagerTool === "create-files") {
    return (
      <div className="settings-page utility-page">
        <button className="utility-back-btn" onClick={() => setActiveFileManagerTool("home")} type="button">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>Create Directories</h1>
        <p className="page-subtitle">Choose a base path, build a list, and create all directories at once.</p>

        <div className="settings-group">
          <h3>Base path</h3>
          <p style={{ marginBottom: 14, wordBreak: "break-all" }}>
            {directoriesBasePath || "No path selected yet."}
          </p>
          <div className="settings-action-row" style={{ marginTop: 0 }}>
            <button
              className="notepad-action-btn"
              onClick={async () => {
                const result = await window.hubAPI.utility.chooseDirectory()
                if (!result.success || !result.path) return
                setDirectoriesBasePath(result.path)
                setDirectoryMessage("")
              }}
              type="button"
            >
              Choose Path
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3>Directory name</h3>
          <input
            className="utility-input"
            type="text"
            value={directoryName}
            onChange={(event) => setDirectoryName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return

              event.preventDefault()
              void tryAddDirectory()
            }}
            placeholder="example-folder"
          />
          {directoryMessage && (
            <p className="utility-message utility-message-error">{directoryMessage}</p>
          )}
          <div className="settings-action-row">
            <button
              className="notepad-action-btn"
              onClick={() => {
                void tryAddDirectory()
              }}
              type="button"
            >
              Add Directory to List
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3>Preview list</h3>
          {directoryList.length === 0 ? (
            <p>No directories added yet.</p>
          ) : (
            <div className="utility-list">
              {directoryList.map((directory) => (
                <div key={directory} className="utility-list-item">
                  <span>{directory}</span>
                  <button
                    className="notepad-clear-btn"
                    onClick={() => {
                      setDirectoryList((current) => current.filter((item) => item !== directory))
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="settings-action-row">
            <button
              className="notepad-action-btn"
              onClick={async () => {
                if (!directoriesBasePath) {
                  setDirectoryMessage("Choose a path first.")
                  return
                }

                if (directoryList.length === 0) {
                  setDirectoryMessage("Add at least one directory first.")
                  return
                }

                const result = await window.hubAPI.utility.createDirectories(
                  directoriesBasePath,
                  directoryList
                )

                const createdNames = new Set(
                  (result.created || []).map((createdPath) => {
                    const normalizedPath = createdPath.replace(/\\/g, "/")
                    const pathParts = normalizedPath.split("/")
                    return pathParts[pathParts.length - 1]?.toLocaleLowerCase() || ""
                  })
                )

                if (createdNames.size > 0) {
                  setDirectoryList((current) =>
                    current.filter((directory) => !createdNames.has(directory.toLocaleLowerCase()))
                  )
                }

                if (!result.success) {
                  setDirectoryMessage(
                    result.error || "Could not create directories."
                  )
                  return
                }

                setDirectoryMessage(
                  `${result.created?.length || 0} director${result.created?.length === 1 ? "y" : "ies"} created.`
                )
                setDirectoryList([])
              }}
              disabled={directoryList.length === 0}
              type="button"
            >
              Create
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                setDirectoryList([])
                setDirectoryMessage("")
              }}
              disabled={directoryList.length === 0}
              type="button"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (activeTool === "file-manager" && activeFileManagerTool === "move-files") {
    return (
      <div className="settings-page utility-page">
        <button className="utility-back-btn" onClick={() => setActiveFileManagerTool("home")} type="button">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>Move Files</h1>
        <p className="page-subtitle">Copy or move everything from one folder into another folder.</p>

        <div className="settings-group">
          <h3>Old path</h3>
          <p style={{ marginBottom: 14, wordBreak: "break-all" }}>
            {moveOldPath || "No old path selected yet."}
          </p>
          {moveOldPath && moveOldPathCount !== null && (
            <p style={{ marginBottom: 14 }}>
              {moveOldPathCount} item{moveOldPathCount === 1 ? "" : "s"}
            </p>
          )}
          <div className="settings-action-row" style={{ marginTop: 0 }}>
            <button
              className="notepad-action-btn"
              onClick={async () => {
                const result = await window.hubAPI.utility.chooseDirectory()
                if (!result.success || !result.path) return
                setMoveOldPath(result.path)
                setMoveMessage("")
              }}
              type="button"
            >
              Choose Old Path
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                void window.hubAPI.utility.openDirectory(moveOldPath)
              }}
              disabled={!moveOldPath}
              type="button"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3>New path</h3>
          <p style={{ marginBottom: 14, wordBreak: "break-all" }}>
            {moveNewPath || "No new path selected yet."}
          </p>
          {moveNewPath && moveNewPathCount !== null && (
            <p style={{ marginBottom: 14 }}>
              {moveNewPathCount} item{moveNewPathCount === 1 ? "" : "s"}
            </p>
          )}
          <div className="settings-action-row" style={{ marginTop: 0 }}>
            <button
              className="notepad-action-btn"
              onClick={async () => {
                const result = await window.hubAPI.utility.chooseDirectory()
                if (!result.success || !result.path) return
                setMoveNewPath(result.path)
                setMoveMessage("")
              }}
              type="button"
            >
              Choose New Path
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                void window.hubAPI.utility.openDirectory(moveNewPath)
              }}
              disabled={!moveNewPath}
              type="button"
            >
              <FolderOpen size={16} />
            </button>
          </div>
          {hasSameTransferPath && (
            <p className="utility-message utility-message-error">
              Please choose a different directory for the new path.
            </p>
          )}
          {moveMessage && (
            <p
              className={`utility-message ${
                moveMessage.includes("copied") ||
                moveMessage.includes("moved") ||
                moveMessage.includes("Copying") ||
                moveMessage.includes("Moving")
                  ? ""
                  : "utility-message-error"
              }`}
            >
              {moveMessage}
            </p>
          )}
          <div className="settings-action-row">
            <button
              className="notepad-action-btn"
              onClick={() => {
                void runTransfer("copy")
              }}
              disabled={!moveOldPath || !moveNewPath || hasSameTransferPath}
              type="button"
            >
              Copy
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                void runTransfer("move")
              }}
              disabled={!moveOldPath || !moveNewPath || hasSameTransferPath}
              type="button"
            >
              Move
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                void runTransfer("move", true)
              }}
              disabled={!moveOldPath || !moveNewPath || hasSameTransferPath}
              type="button"
            >
              Move & Delete Directory
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3>Transferred files</h3>
          {transferredItems.length === 0 ? (
            <p>No transferred files yet.</p>
          ) : (
            <div className="utility-list">
              {transferredItems.map((item) => (
                <div key={item} className="utility-list-item">
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (activeTool === "file-manager" && activeFileManagerTool === "directory-structure") {
    return (
      <div className="settings-page utility-page">
        <button className="utility-back-btn" onClick={() => setActiveFileManagerTool("home")} type="button">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>Directory Structure</h1>
        <p className="page-subtitle">Generate and copy an ASCII tree for any folder.</p>

        <div className="settings-group">
          <h3>Choose path</h3>
          <p style={{ marginBottom: 14, wordBreak: "break-all" }}>
            {treePath || "No path selected yet."}
          </p>
          <div className="settings-action-row" style={{ marginTop: 0 }}>
            <button
              className="notepad-action-btn"
              onClick={async () => {
                const result = await window.hubAPI.utility.chooseDirectory()
                if (!result.success || !result.path) return
                setTreePath(result.path)
                void refreshDirectoryTree(result.path)
              }}
              type="button"
            >
              Choose Path
            </button>
          </div>
          {treeMessage && (
            <p className="utility-message utility-message-error">{treeMessage}</p>
          )}
        </div>

        <div className="settings-group">
          <h3>Directory tree</h3>
          <div className="utility-toggle-row">
            <label className="utility-toggle-item">
              <input
                type="checkbox"
                checked={hideEmptyFolders}
                onChange={(event) => setHideEmptyFolders(event.target.checked)}
              />
              <span>Hide empty folders</span>
            </label>
            <label className="utility-toggle-item">
              <input
                type="checkbox"
                checked={hideHiddenFiles}
                onChange={(event) => setHideHiddenFiles(event.target.checked)}
              />
              <span>Hide hidden files</span>
            </label>
          </div>
          <pre className="utility-code-block">{treeOutput || "Choose a path to generate the ASCII tree."}</pre>
          <div className="settings-action-row">
            <button
              className="notepad-action-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(treeOutput)
              }}
              disabled={!treePath || !treeOutput}
              type="button"
            >
              Copy
            </button>
            <button
              className="notepad-action-btn"
              onClick={() => {
                void refreshDirectoryTree()
              }}
              disabled={!treePath}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (activeTool === "file-manager" && activeFileManagerTool === "file-watcher") {
    return (
      <div className="settings-page utility-page">
        <button className="utility-back-btn" onClick={() => setActiveFileManagerTool("home")} type="button">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>File Watcher</h1>
        <p className="page-subtitle">Watch a folder and log live changes.</p>

        <div className="settings-group">
          <h3>Choose path</h3>
          <p style={{ marginBottom: 14, wordBreak: "break-all" }}>
            {watcherPath || "No path selected yet."}
          </p>
          <div className="settings-action-row" style={{ marginTop: 0 }}>
            <button
              className="notepad-action-btn"
              onClick={async () => {
                const result = await window.hubAPI.utility.chooseDirectory()
                if (!result.success || !result.path) return

                const watchResult = await window.hubAPI.utility.startFileWatcher(result.path)
                if (!watchResult.success) {
                  setWatcherMessage(watchResult.error || "Could not start watching that path.")
                  return
                }

                setWatcherPath(result.path)
                setWatcherLogs([])
                setWatcherMessage("Watching for changes...")
              }}
              type="button"
            >
              Choose Path
            </button>
          </div>
          {watcherMessage && (
            <p
              className={`utility-message ${
                watcherMessage.includes("Watching") ? "" : "utility-message-error"
              }`}
            >
              {watcherMessage}
            </p>
          )}
        </div>

        <div className="settings-group">
          <h3>Log</h3>
          <pre className="utility-code-block">
            {watcherLogs.length > 0 ? watcherLogs.join("\n") : "No file events yet."}
          </pre>
        </div>
      </div>
    )
  }

  if (activeTool === "file-manager") {
    return (
      <div className="settings-page utility-page">
        <button
          className="utility-back-btn"
          onClick={() => {
            setActiveFileManagerTool("home")
            setActiveTool("home")
          }}
          type="button"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>File Manager</h1>
        <p className="page-subtitle">Utilities for creating, moving, and organizing files.</p>

        <div className="module-grid">
          <button className="module-card" onClick={() => setActiveFileManagerTool("create-files")} type="button">
            <div className="module-icon">
              <FolderKanban size={22} />
            </div>
            <div className="module-info">
              <h3>Create Directories</h3>
              <p>Create folders quickly from a single list and base path.</p>
            </div>
          </button>

          <button className="module-card" onClick={() => setActiveFileManagerTool("move-files")} type="button">
            <div className="module-icon">
              <FolderKanban size={22} />
            </div>
            <div className="module-info">
              <h3>Move Files</h3>
              <p>Move and organize files with guided actions.</p>
            </div>
          </button>

          <button className="module-card" onClick={() => setActiveFileManagerTool("directory-structure")} type="button">
            <div className="module-icon">
              <FolderKanban size={22} />
            </div>
            <div className="module-info">
              <h3>Directory Structure</h3>
              <p>Generate an ASCII tree for a selected folder.</p>
            </div>
          </button>

          <button className="module-card" onClick={() => setActiveFileManagerTool("file-watcher")} type="button">
            <div className="module-icon">
              <FolderKanban size={22} />
            </div>
            <div className="module-info">
              <h3>File Watcher</h3>
              <p>Watch a folder and log changes in real time.</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (activeTool === "color-tools") {
    if (activeColorTool === "converter") {
      const previewRgb = colorPreview?.rgb ?? { r: 58, g: 190, b: 255 }
      const previewHsl = rgbToHsl(previewRgb)

      return (
        <div className="settings-page utility-page">
          <button
            className="utility-back-btn"
            onClick={() => {
              setActiveColorTool("home")
            }}
            type="button"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>

          <h1>HEX / RGB / HSL Converter</h1>
          <p className="page-subtitle">Convert between the most common color formats instantly.</p>

          <div className="settings-group">
            <h3>Color preview</h3>
            <div className="color-preview-row">
              <div
                className="color-preview-swatch"
                style={{ background: `rgb(${previewRgb.r}, ${previewRgb.g}, ${previewRgb.b})` }}
                onClick={() => colorPickerRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    colorPickerRef.current?.click()
                  }
                }}
              />
              <div className="color-preview-meta">
                <strong>{rgbToHex(previewRgb)}</strong>
                <p>rgb({previewRgb.r}, {previewRgb.g}, {previewRgb.b})</p>
                <p>hsl({previewHsl.h}, {previewHsl.s}%, {previewHsl.l}%)</p>
              </div>
            </div>
            <input
              ref={colorPickerRef}
              className="color-picker-hidden-input"
              type="color"
              value={rgbToHex(previewRgb)}
              onChange={(event) => syncHexValue(event.target.value)}
              aria-label="Color Picker"
            />
          </div>

          <div className="settings-group">
            <h3>HEX</h3>
            <input
              className="utility-input"
              type="text"
              value={hexValue}
              onChange={(event) => syncHexValue(event.target.value)}
              placeholder="#3ABEFF"
            />
          </div>

          <div className="settings-group">
            <h3>RGB</h3>
            <div className="utility-split-inputs">
              <input
                className="utility-input"
                type="text"
                value={rgbR}
                onChange={(event) => syncRgbValue("r", event.target.value)}
                placeholder="R"
              />
              <input
                className="utility-input"
                type="text"
                value={rgbG}
                onChange={(event) => syncRgbValue("g", event.target.value)}
                placeholder="G"
              />
              <input
                className="utility-input"
                type="text"
                value={rgbB}
                onChange={(event) => syncRgbValue("b", event.target.value)}
                placeholder="B"
              />
            </div>
          </div>

          <div className="settings-group">
            <h3>HSL</h3>
            <div className="utility-split-inputs">
              <input
                className="utility-input"
                type="text"
                value={hslH}
                onChange={(event) => syncHslValue("h", event.target.value)}
                placeholder="H"
              />
              <input
                className="utility-input"
                type="text"
                value={hslS}
                onChange={(event) => syncHslValue("s", event.target.value)}
                placeholder="S%"
              />
              <input
                className="utility-input"
                type="text"
                value={hslL}
                onChange={(event) => syncHslValue("l", event.target.value)}
                placeholder="L%"
              />
            </div>
            {colorMessage && (
              <p className="utility-message utility-message-error">{colorMessage}</p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="settings-page utility-page">
        <button
          className="utility-back-btn"
          onClick={() => {
            setActiveTool("home")
          }}
          type="button"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <h1>Color Tools</h1>
        <p className="page-subtitle">Color helpers and converters in one place.</p>

        <div className="module-grid">
          <button className="module-card" onClick={() => setActiveColorTool("converter")} type="button">
            <div className="module-icon">
              <Palette size={22} />
            </div>
            <div className="module-info">
              <h3>HEX / RGB / HSL Converter</h3>
              <p>Convert colors instantly and preview the result live.</p>
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page utility-page">
      <h1>Utility Tools</h1>
      <p className="page-subtitle">Small tools and helper utilities in one place.</p>

      <div className="module-grid">
        <button className="module-card" onClick={() => setActiveTool("file-manager")} type="button">
          <div className="module-icon">
            <FolderKanban size={22} />
          </div>
          <div className="module-info">
            <h3>File Manager</h3>
            <p>Browse and manage files from a dedicated utility page.</p>
          </div>
        </button>

        <button className="module-card" onClick={() => setActiveTool("color-tools")} type="button">
          <div className="module-icon">
            <Palette size={22} />
          </div>
          <div className="module-info">
            <h3>Color Tools</h3>
            <p>Color conversion and palette helpers in one place.</p>
          </div>
        </button>
      </div>
    </div>
  )
}

function createConsoleIntroTimestamps(): ConsoleIntroTimestamps {
  const timestamp = new Date().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })

  return {
    developerMode: timestamp,
    help: timestamp,
    helpCommand: timestamp
  }
}

function ConsolePage({
  command,
  setCommand,
  lines,
  setLines,
  introTimestamps,
  setIntroTimestamps
}: {
  command: string
  setCommand: React.Dispatch<React.SetStateAction<string>>
  lines: ConsoleLine[]
  setLines: React.Dispatch<React.SetStateAction<ConsoleLine[]>>
  introTimestamps: ConsoleIntroTimestamps
  setIntroTimestamps: React.Dispatch<React.SetStateAction<ConsoleIntroTimestamps>>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const createLine = (
    text: string,
    options: Omit<ConsoleLine, "text" | "timestamp"> = {}
  ): ConsoleLine => ({
    text,
    timestamp: new Date().toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    ...options
  })

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const runCommand = async (rawCommand: string) => {
    const nextCommand = rawCommand.trim()
    if (!nextCommand) return

    if (nextCommand === "help") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Available commands:"),
        createLine("help [command]"),
        createLine("clear"),
        createLine("update [module]"),
        createLine("website")
      ])
      return
    }

    if (nextCommand === "help update") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Usage: update [module]"),
        createLine("Available modules:"),
        createLine("runtime"),
        createLine("Example: update runtime")
      ])
      return
    }

    if (nextCommand === "help website") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Usage: website"),
        createLine("Opens https://www.pokenix.com/studio in your browser.")
      ])
      return
    }

    if (nextCommand === "help clear") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Usage: clear"),
        createLine("Clears the console and restores the default intro messages.")
      ])
      return
    }

    if (nextCommand.startsWith("help ")) {
      const helpTopic = nextCommand.slice(5).trim()
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine(`No help found for: ${helpTopic}`, { tone: "error" })
      ])
      return
    }

    if (nextCommand === "clear") {
      setIntroTimestamps(createConsoleIntroTimestamps())
      setLines([])
      return
    }

    if (nextCommand === "update") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Run help update for more info.", { hintCommand: "help update" })
      ])
      return
    }

    if (nextCommand === "update runtime") {
      setLines((current) => [
        ...current,
        createLine(`$ ${nextCommand}`, { kind: "command" }),
        createLine("Updating runtime...")
      ])

      const result = await window.hubAPI.plugins.updateRuntime()

      if (!result.success && result.reason === "plugins-disabled") {
        setLines((current) => [
          ...current.slice(0, -1),
          createLine("You must enable the plugins in the Plugins page first to run this command.", {
            tone: "error"
          })
        ])
        return
      }

      setLines((current) => [
        ...current,
        createLine(`Plugin runtime updated to ${result.version || "target version"}.`)
      ])
      return
    }

    if (nextCommand === "website") {
      setLines((current) => [...current, createLine(`$ ${nextCommand}`, { kind: "command" })])
      await window.hubAPI.app.openWebsite()
      setLines((current) => [
        ...current,
        createLine("Opening https://www.pokenix.com/studio")
      ])
      return
    }

    setLines((current) => [
      ...current,
      createLine(`$ ${nextCommand}`, { kind: "command" }),
      createLine(`Unknown command: ${nextCommand}`, { tone: "error" })
    ])
  }

  const cancelCommand = () => {
    const currentCommand = command.trim()

    if (currentCommand) {
      setLines((current) => [
        ...current,
        createLine(`$ ${currentCommand}`, { kind: "command" }),
        createLine("^C", { tone: "error" })
      ])
    } else {
      setLines((current) => [...current, createLine("^C", { tone: "error" })])
    }

    setCommand("")
  }

  return (
    <div className="settings-page console-page">
      <div className="console-shell">
        <div className="console-toolbar">
          <span className="console-dot console-dot-red" />
          <span className="console-dot console-dot-yellow" />
          <span className="console-dot console-dot-green" />
          <span className="console-title">Pokenix Studio Console</span>
        </div>

        <div className="console-body">
          <div className="console-intro">
            <p>
              <span className="console-timestamp">
                [{introTimestamps.developerMode}]
              </span>
              $ Developer Mode enabled.
            </p>
            <p>
              <span className="console-timestamp">
                [{introTimestamps.help}]
              </span>
              $ Run <span className="console-command-hint">help</span> to see a list of available commands.
            </p>
            <p>
              <span className="console-timestamp">
                [{introTimestamps.helpCommand}]
              </span>
              $ Run <span className="console-command-hint">help &lt;command&gt;</span> for help about a specific command.
            </p>
          </div>
          {lines.map((line, index) => (
            <p
              key={`${line.text}-${index}`}
              className={[
                line.tone === "error" ? "console-line-error" : "",
                line.kind === "command" ? "console-line-command" : ""
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {line.timestamp && <span className="console-timestamp">[{line.timestamp}]</span>}
              {line.hintCommand ? (
                <>
                  Run <span className="console-command-hint">{line.hintCommand}</span> for more info.
                </>
              ) : (
                line.text
              )}
            </p>
          ))}
        </div>
 
        <form
          className="console-input-row"
          onSubmit={(event) => {
            event.preventDefault()
            const nextCommand = command
            setCommand("")
            void runCommand(nextCommand)
          }}
        >
          <span className="console-prompt">$</span>
          <input
            ref={inputRef}
            className="console-input"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              const mod = event.metaKey || event.ctrlKey
              const selection = window.getSelection()?.toString() || ""

              if (mod && event.key.toLowerCase() === "c" && !selection) {
                event.preventDefault()
                cancelCommand()
              }
            }}
            placeholder="Type a command..."
          />
        </form>
      </div>
    </div>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button className="notepad-tool-btn" onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
    </button>
  )
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getFileName(filePath: string) {
  const segments = filePath.split(/[/\\]/)
  return segments[segments.length - 1] || filePath
}

function NotepadPage() {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: crypto.randomUUID(),
      content: "",
      filePath: "",
      dirty: false
    }
  ])
  const [activeTab, setActiveTab] = useState(0)
  const [allowTabs, setAllowTabs] = useState(true)

  const [findOpen, setFindOpen] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const [replaceQuery, setReplaceQuery] = useState("")
  const [matchCount, setMatchCount] = useState(0)
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [replaceAllMessage, setReplaceAllMessage] = useState("")

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const findInputRef = useRef<HTMLInputElement | null>(null)
  const historyRef = useRef<Record<string, TabHistory>>({})
  const historyActionRef = useRef(false)

  const active = tabs[activeTab]

  useEffect(() => {
    const load = async () => {
      const [note, settings] = await Promise.all([
        window.hubAPI.notepad.getContent(),
        window.hubAPI.settings.get()
      ])

      setAllowTabs(settings.openNewTabs)

      setTabs([
        {
          id: crypto.randomUUID(),
          content: note.content,
          filePath: note.filePath,
          dirty: false
        }
      ])
      setActiveTab(0)
    }

    void load()
  }, [])

  useEffect(() => {
    const syncSettings = async () => {
      const s = await window.hubAPI.settings.get()
      setAllowTabs(s.openNewTabs)
    }

    const interval = setInterval(() => {
      void syncSettings()
    }, 500)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const anyDirty = tabs.some((tab) => tab.dirty)
    window.hubAPI.notepad.setDirtyState(anyDirty)
  }, [tabs])

  useEffect(() => {
    if (!active) return
    void window.hubAPI.notepad.setContent(active.content, active.filePath)
  }, [active?.content, active?.filePath])

  useEffect(() => {
    if (!findOpen) {
      setActiveMatchIndex(-1)
      setMatchCount(0)
      setReplaceAllMessage("")
      return
    }

    const matches = getMatches(active?.content ?? "", findQuery)
    setMatchCount(matches.length)

    if (matches.length === 0) {
      setActiveMatchIndex(-1)
    } else if (activeMatchIndex >= matches.length) {
      setActiveMatchIndex(matches.length - 1)
    }
  }, [findOpen, activeTab, active?.content, caseSensitive, wholeWord])

  useEffect(() => {
    if (findOpen) {
      setTimeout(() => findInputRef.current?.focus(), 0)
    }
  }, [findOpen])

  useEffect(() => {
    const textarea = textareaRef.current
    const highlight = highlightRef.current
    if (!textarea || !highlight) return

    const syncScroll = () => {
      highlight.scrollTop = textarea.scrollTop
      highlight.scrollLeft = textarea.scrollLeft
    }

    syncScroll()
    textarea.addEventListener("scroll", syncScroll)
    return () => textarea.removeEventListener("scroll", syncScroll)
  }, [activeTab, active?.content])

  function updateTab(index: number, data: Partial<Tab>) {
    setTabs((prev) =>
      prev.map((t, i) => (i === index ? { ...t, ...data } : t))
    )
  }

  function getTabHistory(tabId: string) {
    if (!historyRef.current[tabId]) {
      historyRef.current[tabId] = {
        undo: [],
        redo: []
      }
    }

    return historyRef.current[tabId]
  }

  function pushUndoState(tabId: string, content: string) {
    const history = getTabHistory(tabId)

    if (history.undo[history.undo.length - 1] !== content) {
      history.undo.push(content)
    }

    history.redo = []
  }

  function newTab() {
    if (!allowTabs) return

    setTabs((prev) => {
      const nextTabs = [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: "",
          filePath: "",
          dirty: false
        }
      ]

      setActiveTab(nextTabs.length - 1)
      return nextTabs
    })
  }

  async function saveTabAt(index: number): Promise<boolean> {
    const tab = tabs[index]
    if (!tab) return false

    if (!tab.filePath) {
      const saveAsResult = await window.hubAPI.notepad.saveFileAs(tab.content, tab.filePath)
      if (!saveAsResult.success) return false

      updateTab(index, {
        filePath: saveAsResult.filePath || "",
        dirty: false
      })
      return true
    }

    const result = await window.hubAPI.notepad.saveFile(tab.content, tab.filePath)
    if (!result.success) return false

    updateTab(index, {
      filePath: result.filePath || "",
      dirty: false
    })
    return true
  }

  async function confirmCloseTab(index: number): Promise<"save" | "discard" | "cancel"> {
    const tab = tabs[index]
    if (!tab?.dirty) return "discard"

    const shouldSave = window.confirm(
      "This tab has unsaved changes.\n\nPress OK to save before closing.\nPress Cancel to see more options."
    )

    if (shouldSave) return "save"

    const shouldDiscard = window.confirm(
      "Discard unsaved changes and close this tab?\n\nPress OK to discard.\nPress Cancel to keep the tab open."
    )

    if (shouldDiscard) return "discard"

    return "cancel"
  }

  async function closeTab(index: number) {
    if (tabs.length === 1) return

    const action = await confirmCloseTab(index)

    if (action === "cancel") return

    if (action === "save") {
      const ok = await saveTabAt(index)
      if (!ok) return
    }

    const nextTabs = tabs.filter((_, i) => i !== index)
    setTabs(nextTabs)

    const nextIndex =
      activeTab > index
        ? activeTab - 1
        : activeTab >= nextTabs.length
          ? nextTabs.length - 1
          : activeTab

    setActiveTab(nextIndex)
  }

  async function saveAllTabs(): Promise<boolean> {
    for (let i = 0; i < tabs.length; i += 1) {
      if (!tabs[i].dirty) continue

      const ok = await saveTabAt(i)
      if (!ok) return false
    }

    return true
  }

  useEffect(() => {
    const unsubscribe = window.hubAPI.notepad.onSaveAllRequest(async () => {
      return saveAllTabs()
    })

    return unsubscribe
  }, [tabs])

  async function openFile() {
    const r = await window.hubAPI.notepad.openFile()
    if (!r.success || r.content === undefined) return
    const content = r.content
    const filePath = r.filePath || ""

    if (allowTabs) {
      setTabs((prev) => {
        const nextTabs = [
          ...prev,
          {
            id: crypto.randomUUID(),
            content,
            filePath,
            dirty: false
          }
        ]

        setActiveTab(nextTabs.length - 1)
        return nextTabs
      })
    } else {
      updateTab(activeTab, {
        content,
        filePath,
        dirty: false
      })
    }
  }

  async function save() {
    await saveTabAt(activeTab)
  }

  async function saveAs() {
    const tab = tabs[activeTab]
    if (!tab) return

    const r = await window.hubAPI.notepad.saveFileAs(tab.content, tab.filePath)
    if (r.success) {
      updateTab(activeTab, {
        filePath: r.filePath || "",
        dirty: false
      })
    }
  }

  function change(value: string) {
    const currentTab = tabs[activeTab]
    if (!currentTab || currentTab.content === value) return

    if (!historyActionRef.current) {
      pushUndoState(currentTab.id, currentTab.content)
    }

    updateTab(activeTab, {
      content: value,
      dirty: true
    })
  }

  function undo() {
    const currentTab = tabs[activeTab]
    if (!currentTab) return

    const history = getTabHistory(currentTab.id)
    const previousContent = history.undo.pop()
    if (previousContent === undefined) return

    history.redo.push(currentTab.content)
    historyActionRef.current = true

    updateTab(activeTab, {
      content: previousContent,
      dirty: true
    })

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const cursor = previousContent.length
      textarea.setSelectionRange(cursor, cursor)
      historyActionRef.current = false
    })
  }

  function redo() {
    const currentTab = tabs[activeTab]
    if (!currentTab) return

    const history = getTabHistory(currentTab.id)
    const nextContent = history.redo.pop()
    if (nextContent === undefined) return

    history.undo.push(currentTab.content)
    historyActionRef.current = true

    updateTab(activeTab, {
      content: nextContent,
      dirty: true
    })

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      const cursor = nextContent.length
      textarea.setSelectionRange(cursor, cursor)
      historyActionRef.current = false
    })
  }

  async function newNote() {
    if (!allowTabs) {
      const current = tabs[activeTab]
      if (current?.dirty) {
        const shouldSave = window.confirm(
          "This tab has unsaved changes.\n\nPress OK to save before creating a new note.\nPress Cancel to keep editing."
        )

        if (!shouldSave) return

        const ok = await saveTabAt(activeTab)
        if (!ok) return
      }

      updateTab(activeTab, {
        content: "",
        filePath: "",
        dirty: false
      })
      await window.hubAPI.notepad.clear()
      return
    }

    newTab()
  }

  function nextTab() {
    if (tabs.length <= 1) return
    setActiveTab((prev) => (prev + 1) % tabs.length)
  }

  function previousTab() {
    if (tabs.length <= 1) return
    setActiveTab((prev) => (prev - 1 + tabs.length) % tabs.length)
  }

  function buildMatchRegex(query: string) {
    if (!query) return null

    const escaped = escapeRegExp(query)
    const source = wholeWord ? `\\b${escaped}\\b` : escaped
    const flags = caseSensitive ? "g" : "gi"

    return new RegExp(source, flags)
  }

  function getMatches(text: string, query: string): MatchRange[] {
    const regex = buildMatchRegex(query)
    if (!regex) return []

    const matches: MatchRange[] = []
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length
      })

      if (match[0].length === 0) {
        regex.lastIndex += 1
      }
    }

    return matches
  }

  function selectMatch(start: number, length: number) {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.focus()
    textarea.setSelectionRange(start, start + length)

    requestAnimationFrame(() => {
      const styles = window.getComputedStyle(textarea)
      const lineHeight = parseFloat(styles.lineHeight) || 24
      const paddingTop = parseFloat(styles.paddingTop) || 0

      const textBefore = textarea.value.slice(0, start)
      const lineIndex = textBefore.split("\n").length - 1

      const targetTop = lineIndex * lineHeight + paddingTop
      const centeredTop = targetTop - textarea.clientHeight / 2 + lineHeight / 2

      textarea.scrollTop = Math.max(0, centeredTop)
    })
  }

  function getActiveMatches() {
    return getMatches(active?.content ?? "", findQuery)
  }

  function findNext() {
    const matches = getActiveMatches()
    if (matches.length === 0 || !findQuery) return

    const nextIndex =
      activeMatchIndex < 0 ? 0 : (activeMatchIndex + 1) % matches.length

    setActiveMatchIndex(nextIndex)

    requestAnimationFrame(() => {
      const m = matches[nextIndex]
      selectMatch(m.start, m.end - m.start)
    })
  }

  function findPrevious() {
    const matches = getActiveMatches()
    if (matches.length === 0 || !findQuery) return

    const prevIndex =
      activeMatchIndex < 0
        ? matches.length - 1
        : (activeMatchIndex - 1 + matches.length) % matches.length

    setActiveMatchIndex(prevIndex)

    requestAnimationFrame(() => {
      const m = matches[prevIndex]
      selectMatch(m.start, m.end - m.start)
    })
  }

  function openFind() {
    setFindOpen(true)
    setReplaceOpen(false)
    setReplaceAllMessage("")
  }

  function openReplace() {
    setFindOpen(true)
    setReplaceOpen(true)
    setReplaceAllMessage("")
  }

  function closeFindReplace() {
    setFindOpen(false)
    setReplaceOpen(false)
    setFindQuery("")
    setReplaceQuery("")
    setMatchCount(0)
    setActiveMatchIndex(-1)
    setReplaceAllMessage("")
    textareaRef.current?.focus()
  }

  function replaceCurrent() {
    const textarea = textareaRef.current
    if (!textarea || !findQuery) return

    const matches = getActiveMatches()
    if (matches.length === 0) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = active?.content.slice(start, end) ?? ""

    const exactSelected = caseSensitive
      ? selected === findQuery
      : selected.toLowerCase() === findQuery.toLowerCase()

    if (!exactSelected) {
      findNext()
      return
    }

    const currentScrollTop = textarea.scrollTop
    const replacedStart = start
    const replacedEnd = start + replaceQuery.length
    textarea.setRangeText(replaceQuery, start, end, "end")
    const nextContent = textarea.value
    change(nextContent)

    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return

      const nextMatches = getMatches(nextContent, findQuery)
      setMatchCount(nextMatches.length)

      const nextIndex = nextMatches.findIndex((m) => m.start >= replacedEnd)

      el.focus()

      if (nextIndex !== -1) {
        setActiveMatchIndex(nextIndex)
        el.scrollTop = currentScrollTop

        const nextMatch = nextMatches[nextIndex]
        el.setSelectionRange(nextMatch.start, nextMatch.end)

        requestAnimationFrame(() => {
          selectMatch(nextMatch.start, nextMatch.end - nextMatch.start)
        })
      } else {
        setActiveMatchIndex(-1)
        el.setSelectionRange(replacedStart, replacedEnd)
        el.scrollTop = currentScrollTop
      }
    }, 0)
  }

  function replaceAll() {
    if (!findQuery) return

    const textarea = textareaRef.current
    if (!textarea) return
    const currentScrollTop = textarea?.scrollTop ?? 0
    const regex = buildMatchRegex(findQuery)
    if (!regex) return

    const existingMatches = getActiveMatches()
    const replaceCount = existingMatches.length
    const nextContent = active.content.replace(regex, replaceQuery)

    textarea.setSelectionRange(0, textarea.value.length)
    textarea.setRangeText(nextContent, 0, textarea.value.length, "end")
    change(nextContent)

    setTimeout(() => {
      const el = textareaRef.current
      if (!el) return

      const matches = getMatches(nextContent, findQuery)
      setMatchCount(matches.length)
      setActiveMatchIndex(-1)
      setReplaceAllMessage(
        replaceCount === 0
          ? "No matches replaced."
          : `${replaceCount} match${replaceCount === 1 ? "" : "es"} replaced.`
      )

      el.focus()
      el.scrollTop = currentScrollTop
    }, 0)
  }

  function renderHighlightedContent() {
    const text = active?.content ?? ""
    const matches = findOpen && findQuery ? getActiveMatches() : []

    if (matches.length === 0) {
      return escapeHtml(text)
        .replace(/\n$/g, "\n ")
        .replace(/\n/g, "<br />")
        .replace(/ /g, "&nbsp;")
    }

    let html = ""
    let cursor = 0

    matches.forEach((match, index) => {
      const before = text.slice(cursor, match.start)
      const value = text.slice(match.start, match.end)
      const isActive = index === activeMatchIndex

      html += escapeHtml(before)
      html += `<mark class="${isActive ? "find-highlight-active" : "find-highlight"}">${escapeHtml(value)}</mark>`

      cursor = match.end
    })

    html += escapeHtml(text.slice(cursor))

    return html
      .replace(/\n$/g, "\n ")
      .replace(/\n/g, "<br />")
      .replace(/ /g, "&nbsp;")
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      const key = event.key.toLowerCase()

      if (key === "s" && event.shiftKey) {
        event.preventDefault()
        void saveAs()
        return
      }

      if (key === "z" && event.shiftKey) {
        event.preventDefault()
        redo()
        return
      }

      if (key === "z") {
        event.preventDefault()
        undo()
        return
      }

      if (key === "y") {
        event.preventDefault()
        redo()
        return
      }

      if (key === "s") {
        event.preventDefault()
        void save()
        return
      }

      if (key === "o") {
        event.preventDefault()
        void openFile()
        return
      }

      if (key === "n") {
        event.preventDefault()
        void newNote()
        return
      }

      if (key === "t" && allowTabs) {
        event.preventDefault()
        newTab()
        return
      }

      if (key === "w") {
        event.preventDefault()
        void closeTab(activeTab)
        return
      }

      if (key === "f") {
        event.preventDefault()
        openFind()
        return
      }

      if (key === "h") {
        event.preventDefault()
        openReplace()
        return
      }

      if (key === "g" && event.shiftKey) {
        event.preventDefault()
        findPrevious()
        return
      }

      if (key === "g") {
        event.preventDefault()
        findNext()
        return
      }

      if (key === "tab" && event.shiftKey) {
        event.preventDefault()
        previousTab()
        return
      }

      if (key === "tab") {
        event.preventDefault()
        nextTab()
        return
      }

      const number = Number(key)
      if (number >= 1 && number <= 9) {
        const index = number - 1
        if (tabs[index]) {
          event.preventDefault()
          setActiveTab(index)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeTab, allowTabs, tabs, findQuery, replaceQuery, caseSensitive, wholeWord])

  return (
    <div className="module-page">
      <div className="tabs-bar">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            className={`tab-item ${i === activeTab ? "active" : ""}`}
            onClick={() => setActiveTab(i)}
          >
            <span className="tab-label">
              {tab.filePath ? getFileName(tab.filePath) : "Untitled"}
              {tab.dirty ? " *" : ""}
            </span>

            {tabs.length > 1 && (
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  void closeTab(i)
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}

        {allowTabs && (
          <button className="tab-new-btn" onClick={newTab}>
            +
          </button>
        )}
      </div>

      {findOpen && (
        <div className="find-replace-bar">
          <div className="find-row">
            <input
              ref={findInputRef}
              className="find-input"
              type="text"
              placeholder="Find..."
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value)
                const matches = getMatches(active?.content ?? "", e.target.value)
                setMatchCount(matches.length)
                setActiveMatchIndex(-1)
                setReplaceAllMessage("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.shiftKey) {
                  e.preventDefault()
                  findPrevious()
                  return
                }

                if (e.key === "Enter") {
                  e.preventDefault()
                  findNext()
                }
              }}
            />

            <span className="find-count">
              {matchCount === 0
                ? "No results"
                : activeMatchIndex < 0
                  ? `${matchCount} results`
                  : `${activeMatchIndex + 1}/${matchCount}`}
            </span>

            <button className="find-btn" onClick={findPrevious} type="button">
              ↑
            </button>
            <button className="find-btn" onClick={findNext} type="button">
              ↓
            </button>

            {!replaceOpen && (
              <button className="find-btn" onClick={openReplace} type="button">
                Replace
              </button>
            )}

            <button className="find-btn" onClick={closeFindReplace} type="button">
              ✕
            </button>
          </div>

          <div className="find-row">
            <label className="find-toggle">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => {
                  setCaseSensitive(e.target.checked)
                  setActiveMatchIndex(-1)
                  setReplaceAllMessage("")
                }}
              />
              <span>Case sensitive</span>
            </label>

            <label className="find-toggle">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => {
                  setWholeWord(e.target.checked)
                  setActiveMatchIndex(-1)
                  setReplaceAllMessage("")
                }}
              />
              <span>Whole word</span>
            </label>

            {replaceAllMessage && (
              <span className="find-count">{replaceAllMessage}</span>
            )}
          </div>

          {replaceOpen && (
            <div className="find-row">
              <input
                className="find-input"
                type="text"
                placeholder="Replace..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
              />

              <button className="find-btn" onClick={replaceCurrent} type="button">
                Replace
              </button>
              <button className="find-btn" onClick={replaceAll} type="button">
                Replace All
              </button>
            </div>
          )}
        </div>
      )}

      <div className="notepad-header">
        <div>
          <h1>Notepad</h1>
          <p>{active?.filePath ? active.filePath : "Untitled note"}</p>
        </div>

        <div className="notepad-actions">
          <span className="notepad-status">
            {active?.dirty ? "● Unsaved" : "Saved"}
          </span>

          <ToolbarButton
            icon={<Search size={16} />}
            label="Find"
            onClick={openFind}
          />
          <ToolbarButton
            icon={<Replace size={16} />}
            label="Replace"
            onClick={openReplace}
          />
          <button className="notepad-action-btn" onClick={() => void openFile()}>
            Open
          </button>
          <button className="notepad-action-btn" onClick={() => void save()}>
            Save
          </button>
          <button className="notepad-action-btn" onClick={() => void saveAs()}>
            Save As
          </button>
          <button className="notepad-clear-btn" onClick={() => void newNote()}>
            New
          </button>
        </div>
      </div>

      <div className="notepad-editor-wrap notepad-editor-stack">
        <div
          ref={highlightRef}
          className="notepad-highlight-layer"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: renderHighlightedContent() }}
        />
        <textarea
          ref={textareaRef}
          className="notepad-editor notepad-editor-overlay"
          value={active?.content ?? ""}
          onChange={(e) => change(e.target.value)}
          placeholder="Start typing..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}

function PluginRuntimePage({ pluginId }: { pluginId: string }) {
  const [pluginError, setPluginError] = useState("")
  const pluginHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = pluginHostRef.current
    if (!host) return

    let cancelled = false
    let cleanup: (() => void) | undefined
    let styleElement: HTMLStyleElement | undefined

    const loadPlugin = async () => {
      setPluginError("")
      host.innerHTML = ""

      const pluginData = await window.hubAPI.plugins.get(pluginId)

      if (!pluginData) {
        setPluginError("Plugin could not be loaded.")
        return
      }

      document.title = pluginData.plugin.name

      try {
        if (pluginData.style) {
          styleElement = document.createElement("style")
          styleElement.textContent = pluginData.style
          document.head.appendChild(styleElement)
        }

        const pluginFactory = new Function(
          "require",
          pluginData.script.replace(/^\s*export\s+default\s+/, "return ")
        ) as (require: (specifier: string) => unknown) => {
          mount?: (container: HTMLDivElement, api: object) => unknown
          unmount?: () => void
        }
        const pluginRequire =
          typeof window.require === "function"
            ? (() => {
                const nodeModule = window.require?.("node:module") as typeof import("node:module")
                const nodePath = window.require?.("node:path") as typeof import("node:path")
                const runtimeRequire = nodeModule.createRequire(
                  nodePath.join(pluginData.runtimeDirectory, "package.json")
                )

                return (specifier: string) => runtimeRequire(specifier)
              })()
            : (specifier: string) => window.hubAPI.plugins.require(pluginData.runtimeDirectory, specifier)

        const pluginInstance = pluginFactory(pluginRequire)
        if (cancelled) return

        if (!pluginInstance || typeof pluginInstance.mount !== "function") {
          setPluginError("Plugin entry must export a default object with mount().")
          return
        }

        const result = await pluginInstance.mount(host, {
          pluginDirectory: pluginData.pluginDirectory
        })
        const unmount = pluginInstance.unmount

        if (typeof result === "function") {
          cleanup = () => {
            result()
          }
        } else if (typeof unmount === "function") {
          cleanup = () => {
            unmount()
          }
        }
      } catch (error) {
        console.error(error)
        setPluginError(
          error instanceof Error
            ? `Plugin crashed: ${error.message}`
            : "Plugin crashed while loading."
        )
      }
    }

    void loadPlugin()

    return () => {
      cancelled = true
      host.innerHTML = ""
      cleanup?.()
      if (styleElement) styleElement.remove()
    }
  }, [pluginId])

  return (
    <div className="plugin-runtime-page">
      {pluginError ? (
        <p className="plugin-runtime-error">{pluginError}</p>
      ) : (
        <div ref={pluginHostRef} className="plugin-runtime-host" />
      )}
    </div>
  )
}

function ModulePage() {
  const moduleId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get("module")
  }, [])
  const pluginId = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get("plugin")
  }, [])

  if (moduleId === "notepad") {
    return <NotepadPage />
  }

  if (moduleId === "todo-list") {
    return <TodoListPage />
  }

  if (moduleId === "utility-tools") {
    return <UtilityToolsPage />
  }

  if (pluginId) {
    return <PluginRuntimePage pluginId={pluginId} />
  }

  return (
    <div className="module-page">
      <h1>Unknown Module</h1>
      <p>Could not load this module.</p>
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>("home")
  const [settings, setSettings] = useState<AppSettings>({
    startWithSystem: false,
    closeToTray: true,
    darkTheme: true,
    openNewTabs: true,
    developerMode: false
  })
  const [settingsPath, setSettingsPath] = useState("")
  const [appVersion, setAppVersion] = useState("")
  const [pluginsPath, setPluginsPath] = useState("")
  const [plugins, setPlugins] = useState<PluginManifest[]>([])
  const [pluginsEnabled, setPluginsEnabled] = useState(false)
  const [pluginsRuntimeInstalled, setPluginsRuntimeInstalled] = useState(false)
  const [pluginSetupError, setPluginSetupError] = useState("")
  const [pluginSetupLoading, setPluginSetupLoading] = useState(false)
  const [pluginSetupProgress, setPluginSetupProgress] = useState<PluginSetupProgress | null>(null)
  const [runtimeNoticeVisible, setRuntimeNoticeVisible] = useState(false)
  const [consoleCommand, setConsoleCommand] = useState("")
  const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([])
  const [consoleIntroTimestamps, setConsoleIntroTimestamps] = useState<ConsoleIntroTimestamps>(
    createConsoleIntroTimestamps
  )

  const modules: ModuleItem[] = [
    {
      id: "notepad",
      title: "Notepad",
      description: "Quick notes and text files",
      icon: <NotebookPen size={22} />
    },
    {
      id: "todo-list",
      title: "To-Do List",
      description: "Track tasks and keep a simple checklist",
      icon: <ListTodo size={22} />
    },
    {
      id: "utility-tools",
      title: "Utility Tools",
      description: "Small tools and helper utilities",
      icon: <Wrench size={22} />
    }
  ]

  useEffect(() => {
    const load = async () => {
      const [s, p, pluginStatus, pluginData] = await Promise.all([
        window.hubAPI.settings.get(),
        window.hubAPI.settings.path(),
        window.hubAPI.plugins.status(),
        window.hubAPI.plugins.list()
      ])
      const version = await window.hubAPI.app.version()

      setSettings(s)
      setSettingsPath(p)
      setAppVersion(version)
      setPluginsEnabled(pluginStatus.enabled)
      setPluginsPath(pluginStatus.path)
      setPluginsRuntimeInstalled(pluginStatus.runtimeInstalled)
      setPlugins(pluginData.plugins)
    }

    void load()
  }, [])

  useEffect(() => {
    document.body.classList.toggle("light-theme", !settings.darkTheme)
  }, [settings.darkTheme])

  useEffect(() => {
    const unsubscribe = window.hubAPI.app.onNavigate((nextPage) => {
      if (nextPage === "console" && !settings.developerMode) {
        setPage("home")
        return
      }

      setPage(nextPage)
    })

    return unsubscribe
  }, [settings.developerMode])

  useEffect(() => {
    if (page === "console" && !settings.developerMode) {
      setPage("home")
    }
  }, [page, settings.developerMode])

  useEffect(() => {
    const unsubscribe = window.hubAPI.plugins.onSetupProgress((progress) => {
      setPluginSetupProgress(progress)

      if (progress.phase === "ready") {
        setTimeout(() => {
          setRuntimeNoticeVisible(false)
        }, 1200)
        return
      }

      setRuntimeNoticeVisible(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.hubAPI.plugins.onStateChanged(() => {
      void refreshPlugins()
    })

    return unsubscribe
  }, [])

  const updateSetting = async (
    key: "startWithSystem" | "closeToTray" | "darkTheme" | "openNewTabs" | "developerMode",
    value: boolean
  ) => {
    const r = await window.hubAPI.settings.set(key, value)
    setSettings(r.settings)
    setSettingsPath(r.path)
  }

  const resetSettings = async () => {
    const r = await window.hubAPI.settings.reset()
    setSettings(r.settings)
    setSettingsPath(r.path)
  }

  const enablePlugins = async () => {
    try {
      setPluginSetupLoading(true)
      setPluginSetupError("")
      setPluginSetupProgress({
        phase: "preparing",
        message: "Preparing plugin setup..."
      })
      const result = await window.hubAPI.plugins.enable()
      const pluginData = await window.hubAPI.plugins.list()

      setPluginsEnabled(result.enabled)
      setPluginsPath(result.path)
      setPluginsRuntimeInstalled(result.runtimeInstalled)
      setPlugins(pluginData.plugins)
    } catch (error) {
      setPluginSetupError(
        error instanceof Error
          ? `Plugin setup failed: ${error.message}`
          : "Plugin setup failed."
      )
    } finally {
      setPluginSetupLoading(false)
    }
  }

  const refreshPlugins = async () => {
    const pluginStatus = await window.hubAPI.plugins.status()
    const pluginData = await window.hubAPI.plugins.list()

    setPluginsEnabled(pluginStatus.enabled)
    setPluginsPath(pluginStatus.path)
    setPluginsRuntimeInstalled(pluginStatus.runtimeInstalled)
    setPlugins(pluginData.plugins)
  }

  const disablePlugins = async () => {
    const pluginStatus = await window.hubAPI.plugins.disableGlobally()
    setPluginsEnabled(pluginStatus.enabled)
    setPluginsPath(pluginStatus.path)
    setPluginsRuntimeInstalled(pluginStatus.runtimeInstalled)
    setPlugins([])
  }

  const resetPlugins = async () => {
    const pluginStatus = await window.hubAPI.plugins.reset()
    setPluginsEnabled(pluginStatus.enabled)
    setPluginsPath(pluginStatus.path)
    setPluginsRuntimeInstalled(pluginStatus.runtimeInstalled)
    setPlugins([])
    setPluginSetupError("")
    setPluginSetupLoading(false)
    setPluginSetupProgress(null)
  }

  const params = new URLSearchParams(window.location.search)
  const isModuleWindow = params.has("module") || params.has("plugin")

  if (isModuleWindow) {
    return <ModulePage />
  }

  return (
    <div className="app-shell">
      {runtimeNoticeVisible && pluginSetupProgress && (
        <div className="runtime-notice">
          {pluginSetupProgress.phase === "downloading"
            ? pluginSetupProgress.message
            : "Updating plugin runtime..."}
        </div>
      )}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">P</div>
          <div>
            <h2>Pokenix Studio</h2>
            <p>Your desktop hub</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${page === "home" ? "active" : ""}`}
            onClick={() => setPage("home")}
          >
            <Home size={18} />
            <span>Home</span>
          </button>

          <button
            className={`nav-item ${page === "plugins" ? "active" : ""}`}
            onClick={() => setPage("plugins")}
          >
            <Plug size={18} />
            <span>Plugins</span>
          </button>

          <button
            className={`nav-item ${page === "themes" ? "active" : ""}`}
            onClick={() => setPage("themes")}
          >
            <Palette size={18} />
            <span>Themes</span>
          </button>

          <button
            className={`nav-item ${page === "hub" ? "active" : ""}`}
            onClick={() => setPage("hub")}
          >
            <Blocks size={18} />
            <span>Pokenix Hub</span>
          </button>

          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => setPage("settings")}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>

          {settings.developerMode && (
            <button
              className={`nav-item ${page === "console" ? "active" : ""}`}
              onClick={() => setPage("console")}
            >
              <TerminalSquare size={18} />
              <span>Console</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-card">
            <div className="profile-avatar">U</div>
            <div>
              <strong>User</strong>
              <p>Default Profile</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {page === "home" && <HomePage modules={modules} />}
        {page === "plugins" && (
          <PluginsPage
            pluginsEnabled={pluginsEnabled}
            plugins={plugins}
            pluginsPath={pluginsPath}
            pluginsRuntimeInstalled={pluginsRuntimeInstalled}
            pluginSetupError={pluginSetupError}
            pluginSetupLoading={pluginSetupLoading}
            pluginSetupProgress={pluginSetupProgress}
            onEnablePlugins={enablePlugins}
            onRefreshPlugins={refreshPlugins}
          />
        )}
        {page === "themes" && <ThemesPage />}
        {page === "hub" && <HubPage />}
        {page === "settings" && (
          <SettingsPage
            settings={settings}
            updateSetting={updateSetting}
            resetSettings={resetSettings}
            pluginsEnabled={pluginsEnabled}
            disablePlugins={disablePlugins}
            resetPlugins={resetPlugins}
            settingsPath={settingsPath}
            appVersion={appVersion}
          />
        )}
        {page === "console" && settings.developerMode && (
          <ConsolePage
            command={consoleCommand}
            setCommand={setConsoleCommand}
            lines={consoleLines}
            setLines={setConsoleLines}
            introTimestamps={consoleIntroTimestamps}
            setIntroTimestamps={setConsoleIntroTimestamps}
          />
        )}
      </main>
    </div>
  )
}
