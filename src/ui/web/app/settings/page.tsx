"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  GuildSettingsData,
  GuildSettingsEntry,
  GuildSettingsResponse,
} from "@/types";

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-200">Settings</h1>
          <Link
            href="/games"
            className="text-sm text-slate-300 hover:text-slate-100 underline underline-offset-2"
          >
            Back to games
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">Loading settings...</p>
        ) : guilds.length === 0 ? (
          <p className="text-sm text-slate-400">
            No guilds are currently available.
          </p>
        ) : (
          <>
            {/* Guild selector */}
            <label className="block text-sm text-slate-300">
              Guild
              <select
                className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-slate-100"
                value={selectedGuildId}
                onChange={(e) => setSelectedGuildId(e.target.value)}
              >
                {guilds.map((g) => (
                  <option key={g.guildId} value={g.guildId}>
                    {g.guildName}
                  </option>
                ))}
              </select>
            </label>

            {/* Guild Settings */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Guild Settings
                </h2>
              </div>

              <label className="block text-sm text-slate-300">
                Default language
                <select
                  className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-slate-100"
                  value={draft.defaultLang}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      defaultLang: e.target.value as "en" | "zh",
                    }))
                  }
                >
                  <option value="en">English</option>
                  <option value="zh">简体中文</option>
                </select>
              </label>
            </section>

            {/* Integration */}
            <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">
                  Integration
                </h2>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-indigo-500"
                  checked={draft.onlineMode}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, onlineMode: e.target.checked }))
                  }
                />
                <span>
                  Online mode (skip filler night messages for players with no
                  night interaction)
                </span>
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-indigo-500"
                  checked={townsquareEnabled}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      townsquareUrl: e.target.checked
                        ? DEFAULT_TOWNSQUARE_URL
                        : null,
                    }))
                  }
                />
                <span>Use townsquare</span>
              </label>

              {townsquareEnabled && (
                <label className="block text-sm text-slate-300">
                  Townsquare URL
                  <input
                    type="url"
                    className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-slate-100"
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

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveSettings}
                disabled={saved || !selectedGuildId}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  saved
                    ? "bg-emerald-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-slate-300 text-white"
                }`}
              >
                {saved ? "Saved!" : "Save"}
              </button>
              {message && (
                <span className="text-sm text-red-400">{message}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
