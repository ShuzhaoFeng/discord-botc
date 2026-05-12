"use client";

import { usePathname } from "next/navigation";
import { Tooltip } from "@/components/ui/Tooltip";

/** Header phase indicator: derives the active game phase from the URL.
 *   - /games/[channelId]/night  → 🌙 Night
 *   - /games/[channelId]        → ☀️ Role Assignment
 *   - anywhere else             → dimmed 🌙 ("No active phase") */
export default function PhaseOrb() {
  const pathname = usePathname() ?? "";

  const isNight = /\/games\/[^/]+\/night(?:\/|$)/.test(pathname);
  const isRoleAssignment =
    !isNight && /\/games\/[^/]+(?:\/|$)/.test(pathname);

  if (isNight) {
    return (
      <Tooltip content="Night phase">
        <span
          className="ml-auto text-xl leading-none"
          aria-label="Night phase"
        >
          🌙
        </span>
      </Tooltip>
    );
  }

  if (isRoleAssignment) {
    return (
      <Tooltip content="Role assignment">
        <span
          className="ml-auto text-xl leading-none"
          aria-label="Role assignment"
        >
          ☀️
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="No active phase">
      <span
        className="ml-auto text-xl leading-none opacity-30"
        aria-label="No active phase"
      >
        🌙
      </span>
    </Tooltip>
  );
}
