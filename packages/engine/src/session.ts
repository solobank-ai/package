/**
 * In-memory session store with TTL.
 * Redis-backed version can replace this later.
 */

import type { ChatMessage } from './provider.js';

export interface Session {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  lastActiveAt: number;
  totalCost: number;
}

const SESSION_TTL = 60 * 60 * 1000; // 1 hour

export class SessionStore {
  private sessions = new Map<string, Session>();

  get(id: string): Session | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (Date.now() - session.lastActiveAt > SESSION_TTL) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  save(session: Session): void {
    session.lastActiveAt = Date.now();
    this.sessions.set(session.id, session);
  }

  create(id: string): Session {
    const session: Session = {
      id,
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      totalCost: 0,
    };
    this.sessions.set(id, session);
    return session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }
}
