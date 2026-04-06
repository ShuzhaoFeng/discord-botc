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
