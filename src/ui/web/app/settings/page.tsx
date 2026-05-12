"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  GuildSettingsData,
  GuildSettingsEntry,
  GuildSettingsResponse,
} from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ArrowLeft } from "lucide-react";

const DEFAULT_TOWNSQUARE_URL = "https://clocktower.live";

export default function SettingsPage() {
  const [guilds, setGuilds] = useState<GuildSettingsEntry[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [draft, setDraft] = useState<GuildSettingsData>({
    defaultLang: "en",
    townsquareUrl: null,
    onlineMode: false,
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings/guilds");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as GuildSettingsResponse;
      setGuilds(data.guilds);
      if (data.guilds.length > 0) {
        const first = data.guilds[0];
        setSelectedGuildId((prev) => prev || first.guildId);
        setDraft(first.settings);
      } else {
        setSelectedGuildId("");
      }
    } catch (err: unknown) {
      setMessage(
        err instanceof Error ? err.message : "Failed to load settings",
      );
      setGuilds([]);
      setSelectedGuildId("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  const selectedGuild = useMemo(
    () => guilds.find((g) => g.guildId === selectedGuildId) ?? null,
    [guilds, selectedGuildId],
  );

  useEffect(() => {
    if (!selectedGuild) return;
    setDraft(selectedGuild.settings);
  }, [selectedGuild]);

  async function saveSettings() {
    if (!selectedGuildId) return;
    setMessage("");

    try {
      const res = await fetch("/api/settings/guild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, settings: draft }),
      });

      const data = (await res.json()) as {
        error?: string;
        settings?: GuildSettingsData;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");

      setGuilds((prev) =>
        prev.map((g) =>
          g.guildId === selectedGuildId
            ? { ...g, settings: data.settings ?? draft }
            : g,
        ),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err: unknown) {
      setMessage(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    }
  }

  const townsquareEnabled = draft.townsquareUrl !== null;

  const inputClass =
    "mt-1 w-full bg-ink-2 border border-gold/40 rounded-md px-3 py-2 text-parchment focus:outline-none focus:border-ember";

  return (
    <ScrollArea className="h-full">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl tracking-[0.08em] text-parchment-2">
            ⚙️ Settings
          </h1>
          <Link
            href="/games"
            className="text-sm text-parchment-2/70 hover:text-ember underline underline-offset-2 transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-parchment-2/60 italic">
            Loading settings…
          </p>
        ) : guilds.length === 0 ? (
          <p className="text-sm text-parchment-2/60 italic">
            No guilds are currently available.
          </p>
        ) : (
          <>
            <div className="block text-sm text-parchment">
              <span className="font-display tracking-wide text-parchment-2">
                Guild
              </span>
              <Select
                value={selectedGuildId}
                onValueChange={setSelectedGuildId}
              >
                <SelectTrigger className="mt-1 px-3 py-2">
                  <SelectValue placeholder="Select a guild" />
                </SelectTrigger>
                <SelectContent>
                  {guilds.map((g) => (
                    <SelectItem key={g.guildId} value={g.guildId}>
                      {g.guildName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <section
              className="rounded-lg p-5 space-y-4 bg-ink-2/60"
              style={{
                borderLeft: "3px solid var(--color-gold)",
                border:
                  "1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)",
                borderLeftWidth: "3px",
              }}
            >
              <h2 className="font-display text-base tracking-[0.08em] text-parchment-2">
                📜 Guild Settings
              </h2>

              <div className="block text-sm text-parchment">
                <span className="font-display tracking-wide text-parchment-2">
                  Default language
                </span>
                <Select
                  value={draft.defaultLang}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, defaultLang: v as "en" | "zh" }))
                  }
                >
                  <SelectTrigger className="mt-1 px-3 py-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">简体中文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section
              className="rounded-lg p-5 space-y-4 bg-ink-2/60"
              style={{
                borderLeft: "3px solid var(--color-ember)",
                border:
                  "1px solid color-mix(in srgb, var(--color-gold) 30%, transparent)",
                borderLeftWidth: "3px",
              }}
            >
              <h2 className="font-display text-base tracking-[0.08em] text-parchment-2">
                🔗 Integration
              </h2>

              <label className="flex items-center gap-3 text-sm text-parchment cursor-pointer select-none">
                <Checkbox
                  checked={draft.onlineMode}
                  onCheckedChange={(c) =>
                    setDraft((d) => ({ ...d, onlineMode: c === true }))
                  }
                />
                <span>
                  Online mode (skip filler night messages for players with no
                  night interaction)
                </span>
              </label>

              <label className="flex items-center gap-3 text-sm text-parchment cursor-pointer select-none">
                <Checkbox
                  checked={townsquareEnabled}
                  onCheckedChange={(c) =>
                    setDraft((d) => ({
                      ...d,
                      townsquareUrl: c === true ? DEFAULT_TOWNSQUARE_URL : null,
                    }))
                  }
                />
                <span>Use townsquare</span>
              </label>

              {townsquareEnabled && (
                <label className="block text-sm text-parchment">
                  <span className="font-display tracking-wide text-parchment-2">
                    Townsquare URL
                  </span>
                  <input
                    type="url"
                    className={inputClass}
                    value={draft.townsquareUrl ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        townsquareUrl: e.target.value || DEFAULT_TOWNSQUARE_URL,
                      }))
                    }
                  />
                </label>
              )}
            </section>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveSettings}
                disabled={saved || !selectedGuildId}
                className="font-display tracking-[0.1em] uppercase text-sm rounded-md px-4 py-2 transition-all disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg"
                style={{
                  background: saved
                    ? "linear-gradient(180deg, var(--color-fabled) 0%, color-mix(in srgb, var(--color-fabled) 70%, black) 100%)"
                    : "linear-gradient(180deg, var(--color-ember) 0%, color-mix(in srgb, var(--color-ember) 70%, black) 100%)",
                  color: "#1a1410",
                  border: "1px solid var(--color-gold)",
                  opacity: !selectedGuildId ? 0.6 : 1,
                }}
              >
                {saved ? "✓ Saved" : "Save"}
              </button>
              {message && (
                <span className="wax-seal text-sm px-3 py-1.5 rounded-md inline-flex items-center gap-2">
                  <span aria-hidden="true">⚠</span>
                  {message}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  );
}
