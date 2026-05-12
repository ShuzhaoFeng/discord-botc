import type {
  NightActionEntry,
  NightDeathConfirmEntry,
  NightInfoEntry,
  PlayerBasic,
  RoleBasic,
} from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

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
    <div className="rounded-lg border border-gold/30 bg-ink-2/60 p-3">
      <p className="text-xs font-display tracking-wide text-parchment mb-1.5">
        {entry.displayName}
      </p>
      <p className="text-xs text-parchment-2/70 whitespace-pre-wrap leading-relaxed">
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
          ? "border-fabled/40 bg-fabled/5"
          : "border-gold/30 bg-ink-2/60"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-display tracking-wide text-parchment">
          {entry.displayName}
        </span>
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-display tracking-wide ${
            isRandomized
              ? "bg-fabled/20 text-fabled border border-fabled/40"
              : "bg-ink-2 text-parchment-2/70 border border-gold/30"
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
                <label className="text-xs text-parchment-2/50 shrink-0 w-10 truncate">
                  {fieldKey}
                </label>
                {fieldType === "player" ? (
                  <div className="flex-1 min-w-0">
                    <Select
                      value={String(currentVal ?? "")}
                      onValueChange={(v) =>
                        onFieldChange(entry.userId, fieldKey, v)
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Player" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPlayers.map((player) => (
                          <SelectItem key={player.userId} value={player.userId}>
                            {player.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : fieldType === "role" ? (
                  <div className="flex-1 min-w-0">
                    <Select
                      value={String(currentVal ?? "")}
                      onValueChange={(v) =>
                        onFieldChange(entry.userId, fieldKey, v)
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        {scriptRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                    className="w-20 text-xs bg-ink-2 border border-gold/40 rounded px-2 py-1 text-parchment focus:outline-none focus:border-ember"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <Select
                      value={String(currentVal ?? "true")}
                      onValueChange={(v) =>
                        onFieldChange(entry.userId, fieldKey, v === "true")
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-parchment-2/70 whitespace-pre-wrap leading-relaxed italic">
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
    <div className="rounded-lg border border-demon/40 bg-demon/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-display tracking-wide text-parchment">
          {entry.displayName}
        </span>
        {entry.kind === "ravenkeeper" && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-traveller/20 text-traveller border border-traveller/40 font-display tracking-wide">
            Ravenkeeper
          </span>
        )}
      </div>
      <p className="text-xs text-parchment-2/60 mb-1.5">
        <span className="text-parchment-2/80">Response:</span>{" "}
        {entry.response || "—"}
      </p>

      {editableFields.length > 0 && (
        <div className="mb-2.5 space-y-1.5 pl-1">
          {editableFields.map(([fieldKey, fieldType]) => {
            const currentVal = currentFields[fieldKey];
            return (
              <div key={fieldKey} className="flex items-center gap-2">
                <label className="text-xs text-parchment-2/50 shrink-0 w-10 truncate">
                  {fieldKey}
                </label>
                {fieldType === "player" ? (
                  <div className="flex-1 min-w-0">
                    <Select
                      value={currentVal ?? ""}
                      onValueChange={(v) =>
                        onFieldChange(entry.userId, fieldKey, v)
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Player" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPlayers.map((player) => (
                          <SelectItem key={player.userId} value={player.userId}>
                            {player.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <Select
                      value={currentVal ?? ""}
                      onValueChange={(v) =>
                        onFieldChange(entry.userId, fieldKey, v)
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        {scriptRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-parchment-2/70 italic whitespace-pre-wrap leading-relaxed">
        {currentConfirmation}
      </p>
    </div>
  );
}
