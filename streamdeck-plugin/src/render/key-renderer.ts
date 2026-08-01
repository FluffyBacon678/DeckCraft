import { isHotbarSlot, slotShortLabel, type HotbarSlotState } from "../types/protocol";
import type { LinkStatus } from "../state/hotbar-state-store";

export interface RenderInput {
  link: LinkStatus;
  slotIndex: number; // 0..40
  slot?: HotbarSlotState; // undefined when no data for this slot
  selected: boolean;
  /** Non-hotbar key that is waiting for the mod to start sending slots 9-40. */
  awaitingData?: boolean;
  /** base64 PNG of the item's texture. When absent, the tile shows the item name instead. */
  iconDataUri?: string;
}

/**
 * Milestone 1 renderer: a readable key TITLE. Stream Deck wraps long titles, so we keep
 * lines short. The selected hotbar slot is marked with a leading triangle.
 */
export function renderTitle(input: RenderInput): string {
  const { link, slot, selected, awaitingData } = input;
  if (link === "disconnected") {
    return "No MC";
  }
  if (link === "connected_no_world") {
    return "No World";
  }
  if (awaitingData) {
    return "…";
  }
  if (!slot || slot.empty) {
    return selected ? "▶ —" : "—";
  }
  const name = shorten(slot.displayName);
  let line2 = "";
  if (slot.damageable && slot.durabilityPercent != null) {
    line2 = `${slot.durabilityPercent}%`;
  } else if (slot.count > 1) {
    line2 = `x${slot.count}`;
  }
  const body = line2 ? `${name}\n${line2}` : name;
  return selected ? `▶${body}` : body;
}

function shorten(name: string): string {
  if (!name) {
    return "";
  }
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

/**
 * Greedy word wrap for the no-texture fallback. Long single words are hard-split so a key never
 * renders text past its edge; the last line is ellipsised if we run out of room.
 */
function wrapName(name: string, maxChars: number, maxLines: number): string[] {
  if (!name) {
    return [];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of name.split(/\s+/)) {
    let w = word;
    while (w.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(w.slice(0, maxChars));
      w = w.slice(maxChars);
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= maxChars) {
      current += ` ${w}`;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    lines.length = maxLines;
  }
  // If anything was dropped, mark the final line so it doesn't look like the real full name.
  const rendered = lines.join(" ").replace(/\s+/g, " ");
  if (rendered.length < name.replace(/\s+/g, " ").length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines;
}

/**
 * Milestone 2 renderer (dependency-free): a 144x144 SVG data URI for setImage.
 * Switch a key to "image" display in its property inspector to use this. No native
 * modules required — Stream Deck accepts SVG data URIs directly.
 */
export function renderSvgDataUri(input: RenderInput): string {
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(renderSvg(input))}`;
}

function renderSvg(input: RenderInput): string {
  const size = 144;
  const { link, slot, selected, slotIndex, awaitingData } = input;
  const hotbar = isHotbarSlot(slotIndex);
  // Read-only sections get a slightly cooler background so they're visually distinct.
  const bg = hotbar ? "#1d2026" : "#171a1f";
  const border = selected ? "#58aa5a" : "#000000";
  const borderW = selected ? 8 : 2;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`);
  parts.push(`<rect x="0" y="0" width="${size}" height="${size}" rx="14" fill="${bg}"/>`);

  // slot tag, top-left ("3", "S12", "Bt", "OH")
  parts.push(text(12, 24, escapeXml(slotShortLabel(slotIndex)), 18, hotbar ? "#6b7280" : "#4b5563", "start"));

  if (link === "disconnected") {
    parts.push(centered(size, "No MC", "#e06c6c"));
  } else if (link === "connected_no_world") {
    parts.push(centered(size, "No World", "#d0a040"));
  } else if (awaitingData) {
    parts.push(centered(size, "…", "#4b5563"));
  } else if (!slot || slot.empty) {
    parts.push(centered(size, "Empty", "#4b5563"));
  } else {
    if (input.iconDataUri) {
      // Real item texture. "slice" crops animated vertical strips to their first frame, and
      // pixelated keeps Minecraft's 16x16 art crisp instead of blurring it.
      const icon = 96;
      const ix = (size - icon) / 2;
      parts.push(
        `<image href="${input.iconDataUri}" x="${ix}" y="22" width="${icon}" height="${icon}" ` +
          `preserveAspectRatio="xMidYMin slice" image-rendering="pixelated"/>`,
      );
    } else {
      // No texture (not extracted, modded, or an entity-rendered item like a shield) -> name.
      // Wrap onto up to 3 lines instead of truncating: "Silkworm Spawn Egg" stays readable.
      const lines = wrapName(slot.displayName, 10, 3);
      const lineH = 21;
      const startY = size / 2 + 4 - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, i) => {
        parts.push(text(size / 2, startY + i * lineH, escapeXml(line), 19, "#f3f4f6", "middle"));
      });
    }
    if (slot.count > 1) {
      // Drop shadow keeps the count legible on top of a bright texture.
      parts.push(text(size - 10, size - 12, `${slot.count}`, 26, "#000000", "end"));
      parts.push(text(size - 12, size - 14, `${slot.count}`, 26, "#ffffff", "end"));
    }
    if (slot.damageable && slot.maxDamage > 0) {
      const pct = Math.max(0, Math.min(1, slot.durabilityRemaining / slot.maxDamage));
      const barW = size - 28;
      const x = 14;
      const y = size - 26;
      const color = pct > 0.5 ? "#58aa5a" : pct > 0.25 ? "#d0a040" : "#e06c6c";
      parts.push(`<rect x="${x}" y="${y}" width="${barW}" height="10" rx="5" fill="#374151"/>`);
      parts.push(`<rect x="${x}" y="${y}" width="${Math.round(barW * pct)}" height="10" rx="5" fill="${color}"/>`);
    }
    if (slot.hasEnchantments) {
      parts.push(text(12, size - 14, "✦", 22, "#a78bfa", "start"));
    }
  }

  parts.push(`<rect x="0" y="0" width="${size}" height="${size}" rx="14" fill="none" stroke="${border}" stroke-width="${borderW}"/>`);
  parts.push(`</svg>`);
  return parts.join("");
}

function centered(size: number, label: string, color: string): string {
  return text(size / 2, size / 2 + 8, escapeXml(label), 24, color, "middle");
}

function text(x: number, y: number, content: string, fontSize: number, fill: string, anchor: string): string {
  return `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${fontSize}" fill="${fill}" text-anchor="${anchor}">${content}</text>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
