import type { ProfileLinkType } from "../api/types";

const KNOWN_LINK_TYPES: { type: Exclude<ProfileLinkType, "other">; hosts: string[]; label: string }[] = [
  { type: "github", hosts: ["github.com"], label: "GitHub" },
  { type: "instagram", hosts: ["instagram.com"], label: "Instagram" },
  { type: "notion", hosts: ["notion.so", "notion.site"], label: "노션" },
  { type: "x", hosts: ["x.com", "twitter.com"], label: "X" },
  { type: "linkedin", hosts: ["linkedin.com"], label: "LinkedIn" },
  { type: "behance", hosts: ["behance.net"], label: "Behance" },
];

// Known domain -> icon + platform label; unknown domain -> no icon, just the
// hostname as the label. No platform picker: the URL alone is enough input.
export function detectLink(rawUrl: string): { type: ProfileLinkType; label: string } {
  let hostname = rawUrl.trim();
  try {
    hostname = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`).hostname.replace(/^www\./, "");
  } catch {
    // Not a parseable URL — fall back to the raw input as the label.
  }
  const known = KNOWN_LINK_TYPES.find((k) => k.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`)));
  return known ? { type: known.type, label: known.label } : { type: "other", label: hostname };
}
