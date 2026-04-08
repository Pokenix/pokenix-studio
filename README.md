# Pokenix Studio

Pokenix Studio is a modular desktop productivity hub built with Electron, React, Vite, and TypeScript.

Official website:
[https://www.pokenix.com/studio](https://www.pokenix.com/studio)

It currently ships with:

- Notepad
- To-Do List
- Utility Tools
- Plugins
- Developer Console

## Modules

### Notepad

- Multi-tab text editing
- Open, Save, Save As
- Find and Replace
- Keyboard shortcuts
- Unsaved changes protection

### To-Do List

- Add tasks quickly
- Mark tasks as completed
- Delete tasks
- Clear completed tasks
- Drag and drop custom ordering
- Optional "move completed tasks to bottom" behavior
- Clickable links inside task text
- Local persistent storage

### Utility Tools

#### File Manager

- Create Directories
- Move Files
- Directory Structure
- File Watcher

#### Create Directories

- Choose a base path
- Build a directory list
- Validate directory names
- Create multiple folders in one action

#### Move Files

- Copy or move folder contents
- Open old and new paths quickly
- Conflict detection before transfer
- Hidden files included
- Optional delete-old-directory flow

#### Directory Structure

- Generate an ASCII tree for a selected folder
- Copy the output
- Refresh on demand
- Hide empty folders
- Hide hidden files

#### File Watcher

- Watch a selected folder live
- Log created, deleted, and modified items
- Distinguish files and directories

#### Color Tools

- HEX / RGB / HSL Converter
- Live color preview
- Click the preview to open the color picker

### Plugins

- Optional plugin system
- Disabled by default
- Runtime setup flow
- Dependency install and update flow
- Permission-based warnings for unsafe plugins
- Community plugins can be loaded from the plugins directory

### Developer Console

- Hidden unless Developer Mode is enabled
- Command input with history-style output
- Built-in help command
- Runtime update command
- Website shortcut command
- Clear command

## Settings

Current settings include:

- Start with system
- Close to tray
- Dark theme
- Enable Developer Mode
- Open new tabs
- Reset window layout
- Disable Plugins
- Reset Plugins
- Reset settings to default

## Platform Notes

### macOS

- Distributed as a `.dmg`
- Tray support is included
- Unsigned or non-notarized builds may show Gatekeeper warnings

### Windows

- Distributed as an NSIS installer
- Tray behavior and shortcuts are supported
- Unsigned builds may show SmartScreen warnings

## Development

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Package the app:

```bash
npm run dist
```

## Plugin Safety

Plugins are optional and disabled by default.

When enabled, third-party plugins can request permissions and may install their own dependencies.
Only allow plugins you trust.
