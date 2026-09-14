type Bounds = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/** Prefer adjacent space; if none fits, clamp both axes inside the visible viewport. */
export function previewPosition(anchor: Bounds, width: number, height: number) {
  const margin = 12;
  const gap = 12;
  const size = Math.max(1, Math.min(460, width - margin * 2, height - margin * 2));
  const clamp = (value: number, limit: number) => Math.max(margin, Math.min(value, limit - size - margin));
  let left = anchor.left + (anchor.width - size) / 2;
  let top = anchor.bottom + gap;
  let side: "right" | "left" | "bottom" | "top" = "bottom";
  if (width - anchor.right >= size + gap + margin) {
    left = anchor.right + gap; top = anchor.top + (anchor.height - size) / 2; side = "right";
  } else if (anchor.left >= size + gap + margin) {
    left = anchor.left - size - gap; top = anchor.top + (anchor.height - size) / 2; side = "left";
  } else if (height - anchor.bottom < size + gap + margin && anchor.top >= size + gap + margin) {
    top = anchor.top - size - gap; side = "top";
  }
  return { left: clamp(left, width), top: clamp(top, height), size, side };
}
