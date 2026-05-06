import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatType } from '@prisma/client';
import { prisma } from '../lib/prisma';

type CallRecord = { callerId: string; calleeId: string; chatId: string };

type ExtWebSocket = WebSocket & { userId?: string };

/** Sockets por usuário (várias abas). */
const userSockets = new Map<string, Set<ExtWebSocket>>();

/** callId → participantes da chamada 1:1 */
const activeCalls = new Map<string, CallRecord>();

function addSocket(userId: string, ws: ExtWebSocket) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(ws);
}

function removeSocket(userId: string, ws: ExtWebSocket) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) userSockets.delete(userId);
}

function sendToUser(userId: string, payload: Record<string, unknown>) {
  const set = userSockets.get(userId);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const s of set) {
    if (s.readyState === WebSocket.OPEN) s.send(raw);
  }
}

async function assertDirectChatPeers(chatId: string, userA: string, userB: string): Promise<boolean> {
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      chatType: ChatType.DIRECT,
      OR: [
        { initiatorId: userA, recipientId: userB },
        { initiatorId: userB, recipientId: userA },
      ],
    },
    select: { id: true },
  });
  return !!chat;
}

function otherInCall(rec: CallRecord, me: string): string | null {
  if (rec.callerId === me) return rec.calleeId;
  if (rec.calleeId === me) return rec.callerId;
  return null;
}

/**
 * WebSocket em `/ws/calls?token=JWT` — sinalização WebRTC (1:1, chat direto).
 */
export function attachCallSignaling(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/calls' });

  wss.on('connection', (ws: ExtWebSocket, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token || !process.env.JWT_SECRET) {
      ws.close(4001, 'unauthorized');
      return;
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: string };
      ws.userId = decoded.id;
      addSocket(decoded.id, ws);
    } catch {
      ws.close(4002, 'invalid token');
      return;
    }

    ws.on('message', async (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string | undefined;
      const uid = ws.userId;
      if (!type || !uid) return;

      try {
        switch (type) {
          case 'call:invite': {
            const callId = msg.callId as string;
            const chatId = msg.chatId as string;
            const targetUserId = msg.targetUserId as string;
            const video = Boolean(msg.video);
            if (!callId || !chatId || !targetUserId || targetUserId === uid) return;
            const ok = await assertDirectChatPeers(chatId, uid, targetUserId);
            if (!ok) return;
            activeCalls.set(callId, { callerId: uid, calleeId: targetUserId, chatId });
            const fromUser = await prisma.user.findUnique({
              where: { id: uid },
              select: { name: true },
            });
            sendToUser(targetUserId, {
              type: 'call:incoming',
              callId,
              chatId,
              video,
              from: { id: uid, name: fromUser?.name || 'Usuário' },
            });
            break;
          }
          case 'call:accept': {
            const callId = msg.callId as string;
            const rec = activeCalls.get(callId);
            if (!rec || rec.calleeId !== uid) return;
            sendToUser(rec.callerId, { type: 'call:accepted', callId, chatId: rec.chatId });
            break;
          }
          case 'call:reject': {
            const callId = msg.callId as string;
            const rec = activeCalls.get(callId);
            if (!rec || rec.calleeId !== uid) return;
            activeCalls.delete(callId);
            sendToUser(rec.callerId, { type: 'call:rejected', callId });
            break;
          }
          case 'call:end': {
            const callId = msg.callId as string;
            const rec = activeCalls.get(callId);
            if (!rec) return;
            if (rec.callerId !== uid && rec.calleeId !== uid) return;
            activeCalls.delete(callId);
            const other = otherInCall(rec, uid);
            if (other) sendToUser(other, { type: 'call:ended', callId });
            break;
          }
          case 'rtc:offer':
          case 'rtc:answer':
          case 'rtc:candidate': {
            const callId = msg.callId as string;
            if (!callId) return;
            const rec = activeCalls.get(callId);
            if (!rec) return;
            const other = otherInCall(rec, uid);
            if (!other) return;
            sendToUser(other, msg as unknown as Record<string, unknown>);
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error('[ws/calls]', e);
      }
    });

    ws.on('close', () => {
      if (ws.userId) removeSocket(ws.userId, ws);
    });
  });

  console.log('📞 WebRTC signaling: ws://…/ws/calls');
}
