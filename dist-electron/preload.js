"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // 后续添加 IPC 通信方法
  getVersion: () => process.versions.electron
});
