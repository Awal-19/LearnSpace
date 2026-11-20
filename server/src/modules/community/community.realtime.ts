import type { Response } from 'express';

interface SseClient {
  userId: string;
  userName: string;
  res: Response;
  studyingUntil: number | null;
}

export interface CommunityRealtimeHub {
  subscribe(groupId: string, userId: string, userName: string, res: Response): () => void;
  publish(groupId: string, event: string, data: unknown, eventId?: string): void;
  setTyping(groupId: string, userId: string, userName: string): void;
  getActiveParticipants(groupId: string): Array<{ userId: string; userName: string }>;
}

export function createCommunityRealtimeHub(): CommunityRealtimeHub {
  const rooms = new Map<string, Set<SseClient>>();

  function writeSse(res: Response, event: string, data: unknown, eventId?: string) {
    if (res.writableEnded) return;
    if (eventId) res.write(`id: ${eventId}\n`);
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  return {
    subscribe(groupId, userId, userName, res) {
      let set = rooms.get(groupId);
      if (!set) {
        set = new Set();
        rooms.set(groupId, set);
      }
      const client: SseClient = { userId, userName, res, studyingUntil: null };
      set.add(client);

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        }
      }, 25_000);
      heartbeat.unref();

      return () => {
        clearInterval(heartbeat);
        const current = rooms.get(groupId);
        if (current) {
          current.delete(client);
          if (current.size === 0) rooms.delete(groupId);
        }
      };
    },

    publish(groupId, event, data, eventId) {
      const set = rooms.get(groupId);
      if (!set) return;
      for (const client of set) {
        writeSse(client.res, event, data, eventId);
      }
    },

    setTyping(groupId, userId, userName) {
      const set = rooms.get(groupId);
      if (!set) return;
      for (const client of set) {
        if (client.userId !== userId) {
          writeSse(client.res, 'typing', { userId, userName, at: Date.now() });
        }
      }
    },

    getActiveParticipants(groupId) {
      const set = rooms.get(groupId);
      if (!set) return [];
      const unique = new Map<string, string>();
      for (const c of set) {
        unique.set(c.userId, c.userName);
      }
      return Array.from(unique.entries()).map(([userId, userName]) => ({ userId, userName }));
    },
  };
}
