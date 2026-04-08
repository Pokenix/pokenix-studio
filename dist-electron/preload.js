"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const hubAPI = {
    settings: {
        get: () => electron_1.ipcRenderer.invoke("settings:get"),
        set: (key, value) => electron_1.ipcRenderer.invoke("settings:set", key, value),
        path: () => electron_1.ipcRenderer.invoke("settings:path"),
        reset: () => electron_1.ipcRenderer.invoke("settings:reset")
    },
    modules: {
        open: (moduleId) => electron_1.ipcRenderer.invoke("module:open", moduleId)
    },
    todos: {
        list: () => electron_1.ipcRenderer.invoke("todos:list"),
        add: (text) => electron_1.ipcRenderer.invoke("todos:add", text),
        toggle: (id) => electron_1.ipcRenderer.invoke("todos:toggle", id),
        delete: (id) => electron_1.ipcRenderer.invoke("todos:delete", id),
        reorder: (orderedIds) => electron_1.ipcRenderer.invoke("todos:reorder", orderedIds),
        setMoveCompletedToBottom: (value) => electron_1.ipcRenderer.invoke("todos:set-move-completed-to-bottom", value),
        clearCompleted: () => electron_1.ipcRenderer.invoke("todos:clear-completed")
    },
    plugins: {
        status: () => electron_1.ipcRenderer.invoke("plugins:status"),
        enable: () => electron_1.ipcRenderer.invoke("plugins:enable"),
        list: () => electron_1.ipcRenderer.invoke("plugins:list"),
        path: () => electron_1.ipcRenderer.invoke("plugins:path"),
        openDirectory: () => electron_1.ipcRenderer.invoke("plugins:open-directory"),
        get: (pluginId) => electron_1.ipcRenderer.invoke("plugins:get", pluginId),
        open: (pluginId) => electron_1.ipcRenderer.invoke("plugins:open", pluginId),
        close: (pluginId) => electron_1.ipcRenderer.invoke("plugins:close", pluginId),
        closeAll: () => electron_1.ipcRenderer.invoke("plugins:close-all"),
        disable: (pluginId) => electron_1.ipcRenderer.invoke("plugins:disable", pluginId),
        disableAll: () => electron_1.ipcRenderer.invoke("plugins:disable-all"),
        enableAll: () => electron_1.ipcRenderer.invoke("plugins:enable-all"),
        disableGlobally: () => electron_1.ipcRenderer.invoke("plugins:disable-globally"),
        reset: () => electron_1.ipcRenderer.invoke("plugins:reset"),
        updateRuntime: () => electron_1.ipcRenderer.invoke("plugins:update-runtime"),
        enableOne: (pluginId) => electron_1.ipcRenderer.invoke("plugins:enable-one", pluginId),
        delete: (pluginId) => electron_1.ipcRenderer.invoke("plugins:delete", pluginId),
        require: (runtimeDirectory, specifier) => electron_1.ipcRenderer.invoke("plugins:require", runtimeDirectory, specifier),
        onSetupProgress: (callback) => {
            const listener = (_event, progress) => {
                callback(progress);
            };
            electron_1.ipcRenderer.on("plugins:setup-progress", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("plugins:setup-progress", listener);
            };
        },
        onStateChanged: (callback) => {
            const listener = () => {
                callback();
            };
            electron_1.ipcRenderer.on("plugins:state-changed", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("plugins:state-changed", listener);
            };
        }
    },
    app: {
        version: () => electron_1.ipcRenderer.invoke("app:version"),
        openWebsite: () => electron_1.ipcRenderer.invoke("app:open-website"),
        openExternalUrl: (url) => electron_1.ipcRenderer.invoke("app:open-external-url", url),
        onNavigate: (callback) => {
            const listener = (_event, page) => {
                callback(page);
            };
            electron_1.ipcRenderer.on("app:navigate", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("app:navigate", listener);
            };
        }
    },
    windowState: {
        reset: () => electron_1.ipcRenderer.invoke("window-state:reset")
    },
    utility: {
        chooseDirectory: () => electron_1.ipcRenderer.invoke("utility:choose-directory"),
        openDirectory: (directoryPath) => electron_1.ipcRenderer.invoke("utility:open-directory", directoryPath),
        startFileWatcher: (directoryPath) => electron_1.ipcRenderer.invoke("utility:start-file-watcher", directoryPath),
        stopFileWatcher: () => electron_1.ipcRenderer.invoke("utility:stop-file-watcher"),
        onFileWatcherEvent: (callback) => {
            const listener = (_event, payload) => {
                callback(payload);
            };
            electron_1.ipcRenderer.on("utility:file-watcher-event", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("utility:file-watcher-event", listener);
            };
        },
        getDirectoryItemCount: (directoryPath) => electron_1.ipcRenderer.invoke("utility:get-directory-item-count", directoryPath),
        getDirectoryTree: (directoryPath, options) => electron_1.ipcRenderer.invoke("utility:get-directory-tree", directoryPath, options),
        validateDirectoryName: (name) => electron_1.ipcRenderer.invoke("utility:validate-directory-name", name),
        createDirectories: (basePath, directories) => electron_1.ipcRenderer.invoke("utility:create-directories", basePath, directories),
        checkTransferConflicts: (oldPath, newPath) => electron_1.ipcRenderer.invoke("utility:check-transfer-conflicts", oldPath, newPath),
        transferFiles: (oldPath, newPath, mode, replaceExisting, deleteOldDirectory) => electron_1.ipcRenderer.invoke("utility:transfer-files", oldPath, newPath, mode, replaceExisting, deleteOldDirectory)
    },
    notepad: {
        getContent: () => electron_1.ipcRenderer.invoke("notepad:get-content"),
        setContent: (content, filePath) => electron_1.ipcRenderer.invoke("notepad:set-content", content, filePath),
        clear: () => electron_1.ipcRenderer.invoke("notepad:clear"),
        openFile: () => electron_1.ipcRenderer.invoke("notepad:open-file"),
        saveFile: (content, filePath) => electron_1.ipcRenderer.invoke("notepad:save-file", content, filePath),
        saveFileAs: (content, currentPath) => electron_1.ipcRenderer.invoke("notepad:save-file-as", content, currentPath),
        setDirtyState: (dirty) => electron_1.ipcRenderer.send("notepad:set-dirty-state", dirty),
        onSaveAllRequest: (callback) => {
            const listener = async () => {
                const result = await callback();
                electron_1.ipcRenderer.send("notepad:save-all-result", Boolean(result));
            };
            electron_1.ipcRenderer.on("notepad:save-all-request", listener);
            return () => {
                electron_1.ipcRenderer.removeListener("notepad:save-all-request", listener);
            };
        }
    }
};
if (process.contextIsolated) {
    electron_1.contextBridge.exposeInMainWorld("hubAPI", hubAPI);
}
else {
    ;
    window.hubAPI = hubAPI;
}
