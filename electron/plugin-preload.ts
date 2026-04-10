import { contextBridge, ipcRenderer } from "electron"

const pluginId =
  process.argv.find((argument) => argument.startsWith("--pxs-plugin-id="))?.slice("--pxs-plugin-id=".length) || ""

const noopUnsubscribe = () => {}

const hubAPI = {
  settings: {
    get: async () => ({
      startWithSystem: false,
      startMinimized: false,
      closeToTray: true,
      darkTheme: true,
      openNewTabs: true,
      developerMode: false
    }),
    set: async () => ({
      success: false,
      settings: {
        startWithSystem: false,
        startMinimized: false,
        closeToTray: true,
        darkTheme: true,
        openNewTabs: true,
        developerMode: false
      },
      path: ""
    }),
    path: async () => "",
    reset: async () => ({
      success: false,
      settings: {
        startWithSystem: false,
        startMinimized: false,
        closeToTray: true,
        darkTheme: true,
        openNewTabs: true,
        developerMode: false
      },
      path: ""
    })
  },
  plugins: {
    status: async () => ({
      enabled: true,
      path: "",
      runtimeInstalled: true
    }),
    list: async () => ({
      enabled: true,
      path: "",
      runtimeInstalled: true,
      plugins: []
    }),
    onSetupProgress: () => noopUnsubscribe,
    onStateChanged: () => noopUnsubscribe
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
    onNavigate: () => noopUnsubscribe
  }
}

const pluginHost = {
  pluginId,
  getPlugin: () => ipcRenderer.invoke("plugin-host:get-plugin", pluginId),
  storage: {
    readText: (relativePath: string) =>
      ipcRenderer.invoke("plugin-host:storage-read-text", pluginId, relativePath),
    writeText: (relativePath: string, content: string) =>
      ipcRenderer.invoke("plugin-host:storage-write-text", pluginId, relativePath, content),
    delete: (relativePath: string) =>
      ipcRenderer.invoke("plugin-host:storage-delete", pluginId, relativePath),
    list: () => ipcRenderer.invoke("plugin-host:storage-list", pluginId)
  },
  clipboard: {
    readText: () => ipcRenderer.invoke("plugin-host:clipboard-read-text", pluginId),
    writeText: (text: string) => ipcRenderer.invoke("plugin-host:clipboard-write-text", pluginId, text)
  },
  notifications: {
    show: (title: string, body?: string) =>
      ipcRenderer.invoke("plugin-host:notifications-show", pluginId, { title, body })
  },
  filesystem: {
    chooseDirectory: () => ipcRenderer.invoke("plugin-host:choose-directory", pluginId),
    listDirectory: (directoryPath: string) =>
      ipcRenderer.invoke("plugin-host:list-directory", pluginId, directoryPath),
    readTextFile: (targetPath: string) =>
      ipcRenderer.invoke("plugin-host:read-text-file", pluginId, targetPath),
    writeTextFile: (targetPath: string, content: string) =>
      ipcRenderer.invoke("plugin-host:write-text-file", pluginId, targetPath, content),
    deletePath: (targetPath: string) =>
      ipcRenderer.invoke("plugin-host:delete-path", pluginId, targetPath),
    openPath: (targetPath: string) =>
      ipcRenderer.invoke("plugin-host:open-path", pluginId, targetPath)
  },
  network: {
    request: (
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string }
    ) => ipcRenderer.invoke("plugin-host:network-request", pluginId, url, init)
  },
  external: {
    open: (url: string) => ipcRenderer.invoke("plugin-host:open-external", pluginId, url)
  },
  process: {
    run: (command: string, args?: string[]) =>
      ipcRenderer.invoke("plugin-host:process-run", pluginId, command, args)
  },
  nativeModules: {
    require: (specifier: string) => ipcRenderer.invoke("plugin-host:require", pluginId, specifier)
  }
}

contextBridge.exposeInMainWorld("hubAPI", hubAPI)
contextBridge.exposeInMainWorld("pluginHost", pluginHost)
