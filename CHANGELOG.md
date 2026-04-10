# Changelog

All notable changes to Pokenix Studio will be documented in this file.

## 0.1.10

### Improved
- Improved the app update flow so the restart/install prompt appears more reliably after downloads finish.
- Improved Windows startup behavior for `Start with system` and `Start minimized`.
- Updated packaged app metadata to use `Pokenix` as the app author/publisher label.

## 0.1.9

### Added
- Added `Check for Updates` to `Settings > About`.
- Added `update app` to the Developer Console.

### Improved
- Hardened the plugin system with a stricter plugin host bridge and permission enforcement.
- Removed the `new Function` based plugin execution path.
- Restricted plugin network and external navigation behavior behind explicit permissions.

## 0.1.8

### Added
- Added GitHub Releases based app update support for Windows.
- Added update download confirmation and a live update progress window.
- Added `Report a Bug` and `Open Logs Folder` actions to `Settings > About`.
- Added app logging with a dedicated `logs/pxs_logs.log` file.

### Improved
- Improved updater asset naming for Windows releases.
- Improved To-Do List behavior with clickable links and completed-task ordering.
- Improved plugin permission prompts and unsafe permission handling.

## 0.1.7

### Fixed
- Fixed packaged Windows builds crashing because of the `electron-updater` import.

## 0.1.6

### Added
- Added the first auto update integration work with GitHub Releases.

### Improved
- Improved release packaging configuration for updater support.

## 0.1.5

### Added
- Added the To-Do List module with persistent tasks.
- Added drag and drop ordering for tasks.
- Added the `Move completed tasks to bottom` option.
- Added the `File Watcher` tool to File Manager.
- Added the `HEX / RGB / HSL Converter` to Color Tools.

### Improved
- Improved file watcher output with clearer created, deleted, and modified messages.
- Improved file watcher messages to show whether an item is a file or directory.
- Improved Color Tools with a clickable preview color picker.

## 0.1.4

### Added
- Added `Directory Structure` to File Manager.
- Added `Hide empty folders` and `Hide hidden files` options to directory tree output.
- Added `Check for Updates` groundwork through release packaging improvements.

### Improved
- Continued refinement of plugin management, permissions, and runtime handling.
