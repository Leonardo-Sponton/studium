// Bridge between the page and the main process. Only these functions are visible to the page.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

const call = name => (...args) => ipcRenderer.invoke(name, ...args);

contextBridge.exposeInMainWorld("studium", {
  config: { get: call("config:get"), setDataDir: call("config:setDataDir") },
  pickFolder: call("dialog:pickFolder"),
  openFolder: call("shell:openFolder"),
  openSnippets: call("shell:openSnippets"),
  listFonts: call("fonts:list"),
  printPdf: call("print:pdf"),
  openLastPdf: call("print:openLast"),
  setZoom: z => webFrame.setZoomFactor(Number(z) || 1),
  onZoomKey: cb => {
    const listener = (_e, key) => cb(key);
    ipcRenderer.on("zoom:key", listener);
    return () => ipcRenderer.removeListener("zoom:key", listener);
  },
  openLink: call("shell:openLink"),
  openFile: call("shell:openFile"),
  saveBackup: call("dialog:saveBackup"),
  repo: {
    link: call("repo:link"),
    unlink: call("repo:unlink"),
    status: call("repo:status"),
    log: call("repo:log"),
    readFile: call("repo:readFile"),
    openFolder: call("repo:openFolder"),
    openTerminal: call("repo:openTerminal"),
  },
  sync: {
    devices: call("sync:devices"),
    pcName: call("sync:pcName"),
    localHashes: call("sync:localHashes"),
    deviceHashes: call("sync:deviceHashes"),
    fs: Object.fromEntries(
      ["list", "stat", "read", "readBinary", "write", "writeBinary", "move", "remove"].map(op => [op, call(`dev:${op}`)]),
    ),
  },
  fs: {
    list: call("fs:list"),
    stat: call("fs:stat"),
    read: call("fs:read"),
    readBinary: call("fs:readBinary"),
    write: call("fs:write"),
    writeBinary: call("fs:writeBinary"),
    move: call("fs:move"),
    remove: call("fs:remove"),
  },
  // The window is closing: run `flush`, then tell the main process it may close.
  onClosing: flush => {
    ipcRenderer.on("app:closing", async () => {
      try {
        await flush();
      } finally {
        ipcRenderer.send("app:flushed");
      }
    });
  },
  onFileChanged: cb => {
    const listener = (_e, path) => cb(path);
    ipcRenderer.on("fs:changed", listener);
    return () => ipcRenderer.removeListener("fs:changed", listener);
  },
});
