"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  GuildLanguageSetting,
  GuildLanguageSettingsResponse,
} from "@/types";

export default function SettingsPage() {
  const [guilds, setGuilds] = useState<GuildLanguageSetting[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [selectedLang, setSelectedLang] = useState<"en" | "zh">("en");
  const [drunkOverlap, setDrunkOverlap] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  async function loadSettings() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/settings/language/guilds");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = (await res.json()) as GuildLanguageSettingsResponse;
      setGuilds(data.guilds);
      if (data.guilds.length > 0) {
        const first = data.guilds[0];
        setSelectedGuildId((prev) => prev || first.guildId);
        setSelectedLang(first.defaultLang);
        setDrunkOverlap(first.drunkOverlap);
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
    setSelectedLang(selectedGuild.defaultLang);
    setDrunkOverlap(selectedGuild.drunkOverlap);
  }, [selectedGuild]);

  async function saveSettings() {
    if (!selectedGuildId) return;
    setSaving(true);
    setMessage("");

    try {
      const [langRes, drunkRes] = await Promise.all([
        fetch("/api/settings/language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guildId: selectedGuildId, lang: selectedLang }),
        }),
        fetch("/api/settings/drunk-overlap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guildId: selectedGuildId,
            drunkOverlap,
          }),
        }),
      ]);

      const langData = (await langRes.json()) as { error?: string };
      if (!langRes.ok)
        throw new Error(langData.error ?? "Failed to save language setting");

      const drunkData = (await drunkRes.json()) as { error?: string };
      if (!drunkRes.ok)
        throw new Error(drunkData.error ?? "Failed to save drunk overlap setting");

      setGuilds((prev) =>
        prev.map((g) =>
          g.guildId === selectedGuildId
            ? { ...g, defaultLang: selectedLang, drunkOverlap }
            : g,
        ),
      );
      setMessage("Saved.");
    } catch (err: unknown) {
      setMessage(
        err instanceof Error ? err.message : "Failed to save settings",
      );
    } finally {
      setSaving(false);
    }
  }

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

        <section className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Server Default Language
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              New players use this language by default. A player's /lang choice
              still overrides it.
            </p>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Loading settings...</p>
          ) : guilds.length === 0 ? (
            <p className="text-sm text-slate-400">
              No guilds are currently available.
            </p>
          ) : (
            <div className="space-y-4">
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

              <label className="block text-sm text-slate-300">
                Default language
                <select
                  className="mt-1 w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-slate-100"
                  value={selectedLang}
                  onChange={(e) =>
                    setSelectedLang(e.target.value as "en" | "zh")
                  }
                >
                  <option value="en">English</option>
                  <option value="zh">简体中文</option>
                </select>
              </label>

              <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-indigo-500"
                  checked={drunkOverlap}
                  onChange={(e) => setDrunkOverlap(e.target.checked)}
                />
                <span>
                  Allow Drunk&apos;s fake role to overlap with a Townsfolk
                  already in play
                </span>
              </label>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveSettings}
                  disabled={saving || !selectedGuildId}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900 disabled:text-slate-300 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {message && (
                  <span className="text-sm text-slate-300">{message}</span>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
