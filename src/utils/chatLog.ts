export interface ChatMessage {
  from: "bot" | string; // "bot" or playerId
  text: string;
  timestamp: number;
}

// channelId → (playerId → ChatMessage[])
const logs = new Map<string, Map<string, ChatMessage[]>>();

let onUpdate: ((channelId: string) => void) | null = null;

export function setChatUpdateHook(fn: (channelId: string) => void): void {
  onUpdate = fn;
}

function getConvo(channelId: string, playerId: string): ChatMessage[] {
  if (!logs.has(channelId)) logs.set(channelId, new Map());
  const gameLog = logs.get(channelId)!;
  if (!gameLog.has(playerId)) gameLog.set(playerId, []);
  return gameLog.get(playerId)!;
}

export function logBotMessage(
  channelId: string,
  playerId: string,
  text: string,
): void {
  getConvo(channelId, playerId).push({ from: "bot", text, timestamp: Date.now() });
  onUpdate?.(channelId);
}

export function logPlayerMessage(
  channelId: string,
  playerId: string,
  text: string,
): void {
  getConvo(channelId, playerId).push({
    from: playerId,
    text,
    timestamp: Date.now(),
  });
  onUpdate?.(channelId);
}

export function getConversations(
  channelId: string,
): Record<string, ChatMessage[]> {
  const gameLog = logs.get(channelId);
  if (!gameLog) return {};
  const result: Record<string, ChatMessage[]> = {};
  for (const [pid, msgs] of gameLog) {
    result[pid] = [...msgs];
  }
  return result;
}

export function clearGameLog(channelId: string): void {
  logs.delete(channelId);
}
