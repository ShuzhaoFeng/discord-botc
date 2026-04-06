import type {
  NightActionEntry,
  NightDeathConfirmEntry,
  NightInfoEntry,
  PlayerBasic,
  RoleBasic,
} from "@/types";

interface InfoMessageCardProps {
  entry: NightInfoEntry;
  localMessage?: string;
  localFields?: Record<string, string | number | boolean>;
  allPlayers: PlayerBasic[];
  scriptRoles: RoleBasic[];
  onFieldChange: (
    userId: string,
    field: string,
    value: string | number | boolean,
  ) => void;
}

export function ActionMessageCard({ entry }: { entry: NightActionEntry }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <p className="text-xs font-semibold text-slate-300 mb-1.5">
        {entry.displayName}
      </p>
      <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
        {entry.message}
      </p>
    </div>
  );
}

export function InfoMessageCard({
  entry,
  localMessage,
  localFields,
  allPlayers,
  scriptRoles,
  onFieldChange,
}: InfoMessageCardProps) {
  const isRandomized = entry.metaKind === "randomized";
  const currentMessage = localMessage ?? entry.message;
  const currentFields = localFields ?? entry.draft?.fields ?? {};
  const editableFields = entry.draft?.fieldTypes
    ? Object.entries(entry.draft.fieldTypes)
    : [];

  return (
    <div
      className={`rounded-lg border p-3 ${
        isRandomized
          ? "border-amber-700/40 bg-amber-950/20"
          : "border-slate-700 bg-slate-800/50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-300">
          {entry.displayName}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            isRandomized
              ? "bg-amber-900/50 text-amber-300"
              : "bg-slate-700/80 text-slate-400"
          }`}
        >
          {isRandomized ? "randomized" : "fixed"}
        </span>
      </div>

      {editableFields.length > 0 && (
        <div className="mb-2.5 space-y-1.5 pl-1">
          {editableFields.map(([fieldKey, fieldType]) => {
            const currentVal = currentFields[fieldKey];
            return (
              <div key={fieldKey} className="flex items-center gap-2">
                <label className="text-xs text-slate-500 shrink-0 w-10 truncate">
                  {fieldKey}
                </label>
                {fieldType === "player" ? (
                  <select
                    value={String(currentVal ?? "")}
                    onChange={(e) =>
                      onFieldChange(entry.userId, fieldKey, e.target.value)
                    }
                    className="flex-1 min-w-0 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {allPlayers.map((player) => (
                      <option key={player.userId} value={player.userId}>
                        {player.displayName}
                      </option>
                    ))}
                  </select>
                ) : fieldType === "role" ? (
                  <select
                    value={String(currentVal ?? "")}
                    onChange={(e) =>
                      onFieldChange(entry.userId, fieldKey, e.target.value)
                    }
                    className="flex-1 min-w-0 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {scriptRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                ) : fieldType === "number" ? (
                  <input
                    type="number"
                    value={Number(currentVal ?? 0)}
                    onChange={(e) =>
                      onFieldChange(
                        entry.userId,
                        fieldKey,
                        Number(e.target.value),
                      )
                    }
                    className="w-20 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <select
                    value={String(currentVal ?? "true")}
                    onChange={(e) =>
                      onFieldChange(
                        entry.userId,
                        fieldKey,
                        e.target.value === "true",
                      )
                    }
                    className="flex-1 min-w-0 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed italic">
        {currentMessage}
      </p>
    </div>
  );
}

interface DeathConfirmCardProps {
  entry: NightDeathConfirmEntry;
  localConfirmation?: string;
  localFields?: Record<string, string>;
  allPlayers: PlayerBasic[];
  scriptRoles: RoleBasic[];
  onFieldChange: (userId: string, field: string, value: string) => void;
}

export function DeathConfirmCard({
  entry,
  localConfirmation,
  localFields,
  allPlayers,
  scriptRoles,
  onFieldChange,
}: DeathConfirmCardProps) {
  const currentConfirmation = localConfirmation ?? entry.confirmation;
  const currentFields = localFields ?? entry.draft?.fields ?? {};
  const editableFields = entry.draft?.fieldTypes
    ? Object.entries(entry.draft.fieldTypes)
    : [];

  return (
    <div className="rounded-lg border border-rose-800/40 bg-rose-950/20 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold text-slate-300">
          {entry.displayName}
        </span>
        {entry.kind === "ravenkeeper" && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-300">
            Ravenkeeper
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-1.5">
        <span className="text-slate-400">Response:</span>{" "}
        {entry.response || "-"}
      </p>

      {editableFields.length > 0 && (
        <div className="mb-2.5 space-y-1.5 pl-1">
          {editableFields.map(([fieldKey, fieldType]) => {
            const currentVal = currentFields[fieldKey];
            return (
              <div key={fieldKey} className="flex items-center gap-2">
                <label className="text-xs text-slate-500 shrink-0 w-10 truncate">
                  {fieldKey}
                </label>
                {fieldType === "player" ? (
                  <select
                    value={currentVal ?? ""}
                    onChange={(e) =>
                      onFieldChange(entry.userId, fieldKey, e.target.value)
                    }
                    className="flex-1 min-w-0 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {allPlayers.map((player) => (
                      <option key={player.userId} value={player.userId}>
                        {player.displayName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={currentVal ?? ""}
                    onChange={(e) =>
                      onFieldChange(entry.userId, fieldKey, e.target.value)
                    }
                    className="flex-1 min-w-0 text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    {scriptRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 italic whitespace-pre-wrap leading-relaxed">
        {currentConfirmation}
      </p>
    </div>
  );
}
