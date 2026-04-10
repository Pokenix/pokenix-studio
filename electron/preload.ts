import { contextBridge, ipcRenderer } from "electron"

const hubAPI = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (
      key:
        | "startWithSystem"
        | "startMinimized"
        | "closeToTray"
        | "darkTheme"
        | "openNewTabs"
        | "developerMode",
      value: boolean
    ) => ipcRenderer.invoke("settings:set", key, value),
    path: () => ipcRenderer.invoke("settings:path"),
    reset: () => ipcRenderer.invoke("settings:reset")
  },

  modules: {
    open: (moduleId: "notepad" | "todo-list" | "utility-tools") =>
      ipcRenderer.invoke("module:open", moduleId)
  },

  todos: {
    list: () => ipcRenderer.invoke("todos:list"),
    add: (text: string) => ipcRenderer.invoke("todos:add", text),
    toggle: (id: string) => ipcRenderer.invoke("todos:toggle", id),
    delete: (id: string) => ipcRenderer.invoke("todos:delete", id),
    reorder: (orderedIds: string[]) => ipcRenderer.invoke("todos:reorder", orderedIds),
    setMoveCompletedToBottom: (value: boolean) =>
      ipcRenderer.invoke("todos:set-move-completed-to-bottom", value),
    clearCompleted: () => ipcRenderer.invoke("todos:clear-completed")
  },

  plugins: {
    status: () => ipcRenderer.invoke("plugins:status"),
    enable: () => ipcRenderer.invoke("plugins:enable"),
    list: () => ipcRenderer.invoke("plugins:list"),
    path: () => ipcRenderer.invoke("plugins:path"),
    openDirectory: () => ipcRenderer.invoke("plugins:open-directory"),
    get: (pluginId: string) => ipcRenderer.invoke("plugins:get", pluginId),
    open: (pluginId: string) => ipcRenderer.invoke("plugins:open", pluginId),
    close: (pluginId: string) => ipcRenderer.invoke("plugins:close", pluginId),
    closeAll: () => ipcRenderer.invoke("plugins:close-all"),
    disable: (pluginId: string) => ipcRenderer.invoke("plugins:disable", pluginId),
    disableAll: () => ipcRenderer.invoke("plugins:disable-all"),
    enableAll: () => ipcRenderer.invoke("plugins:enable-all"),
    disableGlobally: () => ipcRenderer.invoke("plugins:disable-globally"),
    reset: () => ipcRenderer.invoke("plugins:reset"),
    updateRuntime: () => ipcRenderer.invoke("plugins:update-runtime"),
    enableOne: (pluginId: string) => ipcRenderer.invoke("plugins:enable-one", pluginId),
    delete: (pluginId: string) => ipcRenderer.invoke("plugins:delete", pluginId),
    require: (runtimeDirectory: string, specifier: string) =>
      ipcRenderer.invoke("plugins:require", runtimeDirectory, specifier),
    onSetupProgress: (
      callback: (progress: {
        phase: "preparing" | "downloading" | "extracting" | "finalizing" | "ready"
        message: string
        percent?: number
      }) => void
    ) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: {
          phase: "preparing" | "downloading" | "extracting" | "finalizing" | "ready"
          message: string
          percent?: number
        }
      ) => {
        callback(progress)
      }

      ipcRenderer.on("plugins:setup-progress", listener)

      return () => {
        ipcRenderer.removeListener("plugins:setup-progress", listener)
      }
    },
    onStateChanged: (callback: () => void) => {
      const listener = () => {
        callback()
      }

      ipcRenderer.on("plugins:state-changed", listener)

      return () => {
        ipcRenderer.removeListener("plugins:state-changed", listener)
      }
    }
  },

  app: {
    version: () => ipcRenderer.invoke("app:version"),
    openWebsite: () => ipcRenderer.invoke("app:open-website"),
    openExternalUrl: (url: string) => ipcRenderer.invoke("app:open-external-url", url),
    checkForUpdates: () => ipcRenderer.invoke("app:check-for-updates"),
    openLogsDirectory: () => ipcRenderer.invoke("app:open-logs-directory"),
    onNavigate: (callback: (page: "home" | "plugins" | "themes" | "settings" | "console") => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        page: "home" | "plugins" | "themes" | "settings" | "console"
      ) => {
        callback(page)
      }

      ipcRenderer.on("app:navigate", listener)

      return () => {
        ipcRenderer.removeListener("app:navigate", listener)
      }
    }
  },

  windowState: {
    reset: () => ipcRenderer.invoke("window-state:reset")
  },

  utility: {
    chooseDirectory: () => ipcRenderer.invoke("utility:choose-directory"),
    openDirectory: (directoryPath: string) => ipcRenderer.invoke("utility:open-directory", directoryPath),
    startFileWatcher: (directoryPath: string) => ipcRenderer.invoke("utility:start-file-watcher", directoryPath),
    stopFileWatcher: () => ipcRenderer.invoke("utility:stop-file-watcher"),
    onFileWatcherEvent: (callback: (payload: { message: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { message: string }) => {
        callback(payload)
      }

      ipcRenderer.on("utility:file-watcher-event", listener)

      return () => {
        ipcRenderer.removeListener("utility:file-watcher-event", listener)
      }
    },
    getDirectoryItemCount: (directoryPath: string) =>
      ipcRenderer.invoke("utility:get-directory-item-count", directoryPath),
    getDirectoryTree: (
      directoryPath: string,
      options?: { hideEmptyFolders?: boolean; hideHiddenFiles?: boolean }
    ) => ipcRenderer.invoke("utility:get-directory-tree", directoryPath, options),
    validateDirectoryName: (name: string) =>
      ipcRenderer.invoke("utility:validate-directory-name", name),
    createDirectories: (basePath: string, directories: string[]) =>
      ipcRenderer.invoke("utility:create-directories", basePath, directories),
    checkTransferConflicts: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke("utility:check-transfer-conflicts", oldPath, newPath),
    transferFiles: (
      oldPath: string,
      newPath: string,
      mode: "copy" | "move",
      replaceExisting: boolean,
      deleteOldDirectory: boolean
    ) =>
      ipcRenderer.invoke(
        "utility:transfer-files",
        oldPath,
        newPath,
        mode,
        replaceExisting,
        deleteOldDirectory
      )
  },

  notepad: {
    getContent: () => ipcRenderer.invoke("notepad:get-content"),
    setContent: (content: string, filePath: string) =>
      ipcRenderer.invoke("notepad:set-content", content, filePath),
    clear: () => ipcRenderer.invoke("notepad:clear"),
    openFile: () => ipcRenderer.invoke("notepad:open-file"),
    saveFile: (content: string, filePath: string) =>
      ipcRenderer.invoke("notepad:save-file", content, filePath),
    saveFileAs: (content: string, currentPath: string) =>
      ipcRenderer.invoke("notepad:save-file-as", content, currentPath),
    setDirtyState: (dirty: boolean) => ipcRenderer.send("notepad:set-dirty-state", dirty),
    onSaveAllRequest: (callback: () => Promise<boolean> | boolean) => {
      const listener = async () => {
        const result = await callback()
        ipcRenderer.send("notepad:save-all-result", Boolean(result))
      }

      ipcRenderer.on("notepad:save-all-request", listener)

      return () => {
        ipcRenderer.removeListener("notepad:save-all-request", listener)
      }
    }
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("hubAPI", hubAPI)
} else {
  ;(window as typeof window & { hubAPI: typeof hubAPI }).hubAPI = hubAPI
}
