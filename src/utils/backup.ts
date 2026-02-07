const BACKUP_LOCAL_STORAGE_KEYS = [
  "flashpad-data",
  "flashpad-archived-tabs",
  "flashpad-closed-tabs",
  "flashpad-shortcuts",
  "flashpad-font",
  "flashpad-editor-font",
  "flashpad-editor-font-size",
  "flashpad-editor-tab-indent",
  "flashpad-editor-line-height",
  "flashpad-editor-code-block-highlight",
  "flashpad-editor-quick-symbol-input",
  "flashpad-zen-mode",
  "flashpad-statusbar",
] as const;

export function collectBackupDataFromLocalStorage(
  storage: Storage = localStorage,
): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (const key of BACKUP_LOCAL_STORAGE_KEYS) {
    data[key] = storage.getItem(key);
  }
  return data;
}
