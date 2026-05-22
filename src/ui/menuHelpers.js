function toggleId(list, id) {
  const set = new Set(list || []);
  set.has(id) ? set.delete(id) : set.add(id);
  return [...set];
}
function floatingMenuMeta(trigger, estimatedHeight = 220) {
  const rect = trigger?.getBoundingClientRect?.();
  if (!rect) return { direction: "down", maxHeight: estimatedHeight };
  const bottomSpace = window.innerHeight - rect.bottom;
  const topSpace = rect.top;
  const direction = bottomSpace < estimatedHeight && topSpace > bottomSpace ? "up" : "down";
  const available = direction === "up" ? topSpace - 16 : bottomSpace - 16;
  return { direction, maxHeight: Math.max(112, Math.min(estimatedHeight, available)) };
}
function floatingMenuPositionClass(meta) {
  return meta?.direction === "up"
    ? "bottom-full mb-1.5 origin-bottom-right"
    : "top-full mt-1.5 origin-top-right";
}
