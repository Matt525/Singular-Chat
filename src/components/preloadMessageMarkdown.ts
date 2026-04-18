export function preloadMessageMarkdown() {
  void import("./MessageMarkdown").catch((error) => {
    console.error("Failed to preload markdown renderer:", error);
  });
}
