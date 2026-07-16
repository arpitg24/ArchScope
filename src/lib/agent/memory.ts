import { BaseMessage } from '@langchain/core/messages';
import { Requirements } from './state';

export interface SessionState {
  messages: BaseMessage[];
  requirements: Requirements;
  createdAt: number;
}

// In-memory session store. For MVP this lives in the Node.js process.
// Future: move to Redis or Prisma.
const sessions = new Map<string, SessionState>();

const MAX_SESSION_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function getSession(sessionId: string): SessionState {
  const session = sessions.get(sessionId);
  if (session) return session;

  const newSession: SessionState = {
    messages: [],
    requirements: {},
    createdAt: Date.now(),
  };
  sessions.set(sessionId, newSession);
  return newSession;
}

const MAX_MESSAGES = 20; // Keep last 20 messages to limit token usage

export function updateSession(
  sessionId: string,
  messages: BaseMessage[],
  requirements: Requirements
): void {
  // Trim old messages if conversation is too long
  const trimmedMessages = messages.length > MAX_MESSAGES
    ? messages.slice(-MAX_MESSAGES)
    : messages;

  sessions.set(sessionId, {
    messages: trimmedMessages,
    requirements,
    createdAt: sessions.get(sessionId)?.createdAt ?? Date.now(),
  });
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// Periodically clean up stale sessions
export function cleanupSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > MAX_SESSION_AGE_MS) {
      sessions.delete(id);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof globalThis !== 'undefined') {
  const interval = setInterval(cleanupSessions, 5 * 60 * 1000);
  // Don't prevent process exit
  if (interval.unref) interval.unref();
}
