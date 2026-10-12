export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return (bytes / 1024 ** 3).toFixed(1) + " GB";
}
export function clipDate(value: string): string {
  const date = new Date(
    value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value) ? value : value + "Z",
  );
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const today = new Date();
  return date.toLocaleDateString() === today.toLocaleDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}
