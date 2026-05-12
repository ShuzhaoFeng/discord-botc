import type { NightPlayerInfo } from "@/types";

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function roleLabel(player: Pick<NightPlayerInfo, "roleId">): string {
  return player.roleId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/* Trouble Brewing role → faction. Keep in sync with src/roles/. */
const TB_CATEGORY: Record<string, "Townsfolk" | "Outsider" | "Minion" | "Demon"> = {
  washerwoman: "Townsfolk",
  librarian: "Townsfolk",
  investigator: "Townsfolk",
  chef: "Townsfolk",
  empath: "Townsfolk",
  fortune_teller: "Townsfolk",
  undertaker: "Townsfolk",
  monk: "Townsfolk",
  ravenkeeper: "Townsfolk",
  virgin: "Townsfolk",
  slayer: "Townsfolk",
  soldier: "Townsfolk",
  mayor: "Townsfolk",
  butler: "Outsider",
  drunk: "Outsider",
  recluse: "Outsider",
  saint: "Outsider",
  poisoner: "Minion",
  spy: "Minion",
  scarlet_woman: "Minion",
  baron: "Minion",
  imp: "Demon",
};

const CATEGORY_TINT = {
  Townsfolk: "var(--color-townsfolk)",
  Outsider: "var(--color-outsider)",
  Minion: "var(--color-minion)",
  Demon: "var(--color-demon)",
} as const;

export function tintForRole(roleId: string): string {
  const cat = TB_CATEGORY[roleId];
  return cat ? CATEGORY_TINT[cat] : "var(--color-gold)";
}
