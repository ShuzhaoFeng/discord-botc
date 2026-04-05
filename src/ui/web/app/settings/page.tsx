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
  }, [selectedGuild]);

  async function saveDefaultLanguage() {
    if (!selectedGuildId) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/settings/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildId: selectedGuildId, lang: selectedLang }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");

      setGuilds((prev) =>
        prev.map((g) =>
          g.guildId === selectedGuildId
            ? { ...g, defaultLang: selectedLang }
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

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveDefaultLanguage}
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
