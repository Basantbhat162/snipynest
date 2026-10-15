export type Theme = "light" | "dark";
export function getTheme(): Theme;
export function setTheme(value: Theme): void;
export function subscribeTheme(listener: () => void): () => void;
