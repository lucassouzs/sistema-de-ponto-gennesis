import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { ChatType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ChatService } from '../services/ChatService';

const chatService = new ChatService();

type CallRecord = {
  callerId: string;
  calleeId: string;
  chatId: string;
  video: boolean;
  startedAt: Date;
  answeredAt?: Date;
};

type GroupSession = {
  chatId: string;
  /** Chat GROUP_CALL onde ficam CALL_STARTED / CALL_LOG e mensagens da ligação. */
  sideChatId: string;
  video: boolean;
  initiatorId: string;
  startedAt: Date;
  endedAt?: Date;
  locked: boolean;
  /** Quem já entrou na chamada (inclui o iniciador desde o invite). */
  joined: Set<string>;
  /** Ainda sendo chamados (subset dos convidados; não inclui iniciador). */
  ringing: Set<string>;
  /** Usuários aguardando aprovação quando sala bloqueada. */
  waitingApproval: Set<string>;
  /** Estado de mídia por participante. */
  mediaState: Map<string, { micMuted: boolean; camOff: boolean }>;
};

const MAX_GROUP_MESH = 12;

type ExtWebSocket = WebSocket & { userId?: string };

/** Sockets por usuário (várias abas). */
const userSockets = new Map<string, Set<ExtWebSocket>>();

/** callId → participantes da chamada 1:1 */
const activeCalls = new Map<string, CallRecord>();

/** callId → mésh em grupo */
const groupSessions = new Map<string, GroupSession>();

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

/** Chamada WebRTC nativa também permitida quando ambos são participantes do mesmo grupo. */
async function assertGroupChatPeers(chatId: string, userA: string, userB: string): Promise<boolean> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, chatType: ChatType.GROUP },
    select: {
      participants: {
        where: { userId: { in: [userA, userB] } },
        select: { userId: true },
      },
    },
  });
  return !!chat && chat.participants.length === 2;
}

async function assertPeersCanNativeCall(chatId: string, userA: string, userB: string): Promise<boolean> {
  const directOk = await assertDirectChatPeers(chatId, userA, userB);
  if (directOk) return true;
  return assertGroupChatPeers(chatId, userA, userB);
}

async function getGroupParticipantIds(chatId: string): Promise<string[] | null> {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, chatType: ChatType.GROUP },
    select: { participants: { select: { userId: true } } },
  });
  if (!chat) return null;
  return chat.participants.map((p) => p.userId);
}

async function namesByUserIds(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const m: Record<string, string> = {};
  users.forEach((u) => {
    m[u.id] = u.name || 'Usuário';
  });
  ids.forEach((id) => {
    if (!(id in m)) m[id] = 'Usuário';
  });
  return m;
}

function encodeCallInvite(callId: string, chatId: string, callSideChatId?: string): string {
  const payload = JSON.stringify({
    callId,
    chatId,
    ...(callSideChatId ? { callSideChatId } : {}),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function otherInCall(rec: CallRecord, me: string): string | null {
  if (rec.callerId === me) return rec.calleeId;
  if (rec.calleeId === me) return rec.callerId;
  return null;
}

function userInAnyCallSocket(userId: string): boolean {
  for (const rec of activeCalls.values()) {
    if (rec.callerId === userId || rec.calleeId === userId) return true;
  }
  for (const g of groupSessions.values()) {
    if (g.joined.has(userId)) return true;
  }
  return false;
}

async function notifyGroupEveryone(callId: string, grp: GroupSession) {
  const ids = [...grp.joined];
  const names = await namesByUserIds(ids);
  const members = ids.map((id) => ({
    id,
    name: names[id],
    isHost: id === grp.initiatorId,
    micMuted: grp.mediaState.get(id)?.micMuted ?? false,
    camOff: grp.mediaState.get(id)?.camOff ?? !grp.video,
  }));
  const payload = {
    type: 'call:group-sync' as const,
    callId,
    chatId: grp.chatId,
    callSideChatId: grp.sideChatId,
    members,
    locked: grp.locked,
    waitingApprovalCount: grp.waitingApproval.size,
  };
  ids.forEach((id) => sendToUser(id, payload as unknown as Record<string, unknown>));
}

/**
 * Para cada vizinho já na sessão quando `joinerUserId` entra, apenas o lado com userId menor cria SDP offer.
 */
function meshNotifyNewJoiner(callId: string, grp: GroupSession, joinerUserId: string) {
  for (const p of grp.joined) {
    if (p === joinerUserId) continue;
    const offerSide = [p, joinerUserId].sort()[0];
    const answerSide = [p, joinerUserId].sort()[1];
    sendToUser(offerSide, {
      type: 'call:group-signaling-offer',
      callId,
      remoteUserId: answerSide,
    });
  }
}

async function persistCallHistory(params: {
  chatId: string;
  callId: string;
  mode: 'direct' | 'group';
  callType: 'voice' | 'video';
  startedAt: Date;
  endedAt: Date;
  participants: string[];
  status: 'answered' | 'missed' | 'rejected' | 'cancelled';
}) {
  const durationSec = Math.max(0, Math.floor((params.endedAt.getTime() - params.startedAt.getTime()) / 1000));
  await prisma.message.create({
    data: {
      chatId: params.chatId,
      senderId: params.participants[0],
      isSystem: true,
      content: `CALL_LOG:${JSON.stringify({
        callId: params.callId,
        mode: params.mode,
        type: params.callType,
        startedAt: params.startedAt.toISOString(),
        endedAt: params.endedAt.toISOString(),
        durationSec,
        participants: params.participants,
        status: params.status,
      })}`,
    },
  });
}

async function persistCallStartedMessage(params: {
  chatId: string;
  senderId: string;
  mode: 'direct' | 'group';
  callId: string;
  video: boolean;
  initiatorName: string;
}) {
  await prisma.message.create({
    data: {
      chatId: params.chatId,
      senderId: params.senderId,
      isSystem: true,
      content: `CALL_STARTED:${JSON.stringify({
        callId: params.callId,
        mode: params.mode,
        type: params.video ? 'video' : 'voice',
        initiatorName: params.initiatorName,
      })}`,
    },
  });
}

/** Para HTTP: saber se há chamada nativa em grupo ativa neste chat. */
export function getActiveGroupCallForChat(chatId: string): {
  callId: string;
  video: boolean;
  joinedUserIds: string[];
} | null {
  for (const [callId, grp] of groupSessions) {
    if (grp.chatId !== chatId || grp.joined.size === 0) continue;
    return {
      callId,
      video: grp.video,
      joinedUserIds: [...grp.joined],
    };
  }
  return null;
}

async function teardownGroupCall(callId: string, grp: GroupSession, toastMsg?: string) {
  const endedAt = new Date();
  for (const p of grp.joined) {
    const payload: Record<string, unknown> = { type: 'call:ended', callId };
    if (toastMsg) payload.message = toastMsg;
    sendToUser(p, payload);
  }
  groupSessions.delete(callId);
  await persistCallHistory({
    chatId: grp.sideChatId,
    callId,
    mode: 'group',
    callType: grp.video ? 'video' : 'voice',
    startedAt: grp.startedAt,
    endedAt,
    participants: [...grp.joined],
    status: grp.joined.size > 1 ? 'answered' : 'missed',
  });
}

/**
 * WebSocket em `/ws/calls?token=JWT` — sinalização WebRTC 1:1 e chamada em grupo (mesh SFU-less).
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
            const ok = await assertPeersCanNativeCall(chatId, uid, targetUserId);
            if (!ok) return;
            if (userInAnyCallSocket(targetUserId)) {
              sendToUser(uid, { type: 'call:busy', callId, targetUserId });
              return;
            }
            activeCalls.set(callId, {
              callerId: uid,
              calleeId: targetUserId,
              chatId,
              video,
              startedAt: new Date(),
            });
            const fromUser = await prisma.user.findUnique({
              where: { id: uid },
              select: { name: true },
            });
            sendToUser(targetUserId, {
              type: 'call:incoming',
              callId,
              chatId,
              video,
              isGroupCall: false,
              from: { id: uid, name: fromUser?.name || 'Usuário' },
            });
            await persistCallStartedMessage({
              chatId,
              senderId: uid,
              mode: 'direct',
              callId,
              video,
              initiatorName: fromUser?.name || 'Usuário',
            });
            break;
          }

          case 'call:invite-group': {
            const callId = msg.callId as string;
            const chatId = msg.chatId as string;
            const video = Boolean(msg.video);
            const targetUserIds = (msg.targetUserIds as string[] | undefined)?.filter(Boolean) ?? [];
            if (!callId || !chatId) return;

            const allParticipants = await getGroupParticipantIds(chatId);
            if (!allParticipants || !allParticipants.includes(uid)) return;

            const ringSet = new Set(
              targetUserIds.length ? targetUserIds.filter((id) => id !== uid) : allParticipants.filter((id) => id !== uid)
            );
            const memberCountMesh = ringSet.size + 1;
            if (memberCountMesh > MAX_GROUP_MESH) {
              sendToUser(uid, {
                type: 'call:error',
                callId,
                code: 'group-too-big',
                max: MAX_GROUP_MESH,
              });
              return;
            }

            const busy = [...ringSet].filter((id) => userInAnyCallSocket(id));
            if (busy.length > 0) {
              sendToUser(uid, { type: 'call:group-busy', callId, busyUserIds: busy });
              return;
            }

            if (userInAnyCallSocket(uid)) {
              sendToUser(uid, { type: 'call:busy-self', callId });
              return;
            }

            let sideChatId: string;
            try {
              sideChatId = await chatService.createGroupCallSideChat({
                parentGroupChatId: chatId,
                initiatorId: uid,
                callId,
                participantUserIds: allParticipants,
              });
            } catch (e) {
              console.error('[ws/calls] createGroupCallSideChat', e);
              sendToUser(uid, { type: 'call:error', callId, code: 'side-chat-failed' });
              return;
            }

            groupSessions.set(callId, {
              chatId,
              sideChatId,
              video,
              initiatorId: uid,
              startedAt: new Date(),
              locked: false,
              joined: new Set([uid]),
              ringing: ringSet,
              waitingApproval: new Set(),
              mediaState: new Map([[uid, { micMuted: false, camOff: !video }]]),
            });

            const fromUser = await prisma.user.findUnique({
              where: { id: uid },
              select: { name: true },
            });
            for (const tid of ringSet) {
              sendToUser(tid, {
                type: 'call:incoming',
                callId,
                chatId,
                callSideChatId: sideChatId,
                video,
                isGroupCall: true,
                groupExpectedCount: memberCountMesh,
                from: { id: uid, name: fromUser?.name || 'Usuário' },
              });
            }
            sendToUser(uid, {
              type: 'call:invite-link',
              callId,
              chatId,
              callSideChatId: sideChatId,
              inviteToken: encodeCallInvite(callId, chatId, sideChatId),
            });
            await persistCallStartedMessage({
              chatId: sideChatId,
              senderId: uid,
              mode: 'group',
              callId,
              video,
              initiatorName: fromUser?.name || 'Usuário',
            });
            break;
          }

          case 'call:accept': {
            const callId = msg.callId as string;
            if (!callId) return;

            const grp = groupSessions.get(callId);
            if (grp) {
              if (!grp.ringing.has(uid)) return;

              grp.ringing.delete(uid);
              grp.joined.add(uid);
              grp.mediaState.set(uid, { micMuted: false, camOff: !grp.video });
              await chatService.ensureUserInGroupCallChat(grp.sideChatId, uid);
              meshNotifyNewJoiner(callId, grp, uid);
              await notifyGroupEveryone(callId, grp);
              sendToUser(grp.initiatorId, { type: 'call:group-progress', callId, joinedCount: grp.joined.size });
              break;
            }

            const rec = activeCalls.get(callId);
            if (!rec || rec.calleeId !== uid) return;
            rec.answeredAt = new Date();
            sendToUser(rec.callerId, { type: 'call:accepted', callId, chatId: rec.chatId });
            break;
          }

          case 'call:reject': {
            const callId = msg.callId as string;
            if (!callId) return;

            const grpR = groupSessions.get(callId);
            if (grpR) {
              if (!grpR.ringing.delete(uid)) return;
              sendToUser(grpR.initiatorId, { type: 'call:group-decline', callId, userId: uid });

              const everyoneDeclined =
                grpR.ringing.size === 0 &&
                grpR.joined.size === 1 &&
                grpR.joined.has(grpR.initiatorId);
              if (everyoneDeclined) {
                await teardownGroupCall(callId, grpR);
              }
              break;
            }

            const recR = activeCalls.get(callId);
            if (!recR || recR.calleeId !== uid) return;
            activeCalls.delete(callId);
            sendToUser(recR.callerId, { type: 'call:rejected', callId });
            await persistCallHistory({
              chatId: recR.chatId,
              callId,
              mode: 'direct',
              callType: recR.video ? 'video' : 'voice',
              startedAt: recR.startedAt,
              endedAt: new Date(),
              participants: [recR.callerId, recR.calleeId],
              status: 'rejected',
            });
            break;
          }

          case 'call:end': {
            const callId = msg.callId as string;
            if (!callId) return;

            const grpE = groupSessions.get(callId);
            if (grpE) {
              if (!grpE.joined.has(uid)) return;

              grpE.joined.delete(uid);
              grpE.mediaState.delete(uid);

              const remainingJoined = [...grpE.joined];
              remainingJoined.forEach((p) =>
                sendToUser(p, { type: 'call:group-peer-left', callId, userId: uid })
              );

              if (grpE.joined.size === 0) {
                for (const t of grpE.ringing) {
                  sendToUser(t, { type: 'call:ended', callId });
                }
                groupSessions.delete(callId);
                await persistCallHistory({
                  chatId: grpE.sideChatId,
                  callId,
                  mode: 'group',
                  callType: grpE.video ? 'video' : 'voice',
                  startedAt: grpE.startedAt,
                  endedAt: new Date(),
                  participants: [uid],
                  status: 'cancelled',
                });
              } else if (grpE.joined.size === 1) {
                await teardownGroupCall(callId, grpE);
              } else {
                await notifyGroupEveryone(callId, grpE);
              }

              break;
            }

            const recE = activeCalls.get(callId);
            if (!recE) return;
            if (recE.callerId !== uid && recE.calleeId !== uid) return;
            activeCalls.delete(callId);
            const other = otherInCall(recE, uid);
            if (other) sendToUser(other, { type: 'call:ended', callId });
            await persistCallHistory({
              chatId: recE.chatId,
              callId,
              mode: 'direct',
              callType: recE.video ? 'video' : 'voice',
              startedAt: recE.startedAt,
              endedAt: new Date(),
              participants: [recE.callerId, recE.calleeId],
              status: recE.answeredAt ? 'answered' : 'missed',
            });
            break;
          }

          case 'call:request-join': {
            const callId = msg.callId as string;
            const grp = groupSessions.get(callId);
            if (!grp) return;
            const members = await getGroupParticipantIds(grp.chatId);
            if (!members?.includes(uid)) return;
            if (grp.joined.has(uid)) return;

            if (grp.locked) {
              grp.waitingApproval.add(uid);
              sendToUser(grp.initiatorId, { type: 'call:group-join-request', callId, userId: uid });
              sendToUser(uid, { type: 'call:group-join-pending', callId });
              return;
            }

            grp.joined.add(uid);
            grp.waitingApproval.delete(uid);
            grp.mediaState.set(uid, { micMuted: false, camOff: !grp.video });
            await chatService.ensureUserInGroupCallChat(grp.sideChatId, uid);
            meshNotifyNewJoiner(callId, grp, uid);
            await notifyGroupEveryone(callId, grp);
            break;
          }

          case 'call:group-add-invite': {
            const callId = msg.callId as string;
            const targetUserIds = (msg.targetUserIds as string[] | undefined)?.filter(Boolean) ?? [];
            if (!callId || targetUserIds.length === 0) return;
            const grpAdd = groupSessions.get(callId);
            if (!grpAdd || !grpAdd.joined.has(uid)) return;

            const membersAdd = await getGroupParticipantIds(grpAdd.chatId);
            if (!membersAdd) return;

            const uniq = Array.from(new Set(targetUserIds));
            const allowed = uniq.filter(
              (id) =>
                id !== uid &&
                membersAdd.includes(id) &&
                !grpAdd.joined.has(id) &&
                !grpAdd.ringing.has(id) &&
                !grpAdd.waitingApproval.has(id)
            );
            if (allowed.length === 0) return;

            const projectedMesh = grpAdd.joined.size + grpAdd.ringing.size + allowed.length;
            if (projectedMesh > MAX_GROUP_MESH) {
              sendToUser(uid, { type: 'call:error', callId, code: 'group-too-big', max: MAX_GROUP_MESH });
              return;
            }

            const busyAdd = allowed.filter((id) => userInAnyCallSocket(id));
            if (busyAdd.length > 0) {
              sendToUser(uid, { type: 'call:group-busy', callId, busyUserIds: busyAdd });
              return;
            }

            for (const id of allowed) grpAdd.ringing.add(id);
            await chatService.addUsersToGroupCallChat(grpAdd.sideChatId, allowed);

            const fromAdd = await prisma.user.findUnique({
              where: { id: uid },
              select: { name: true },
            });
            const memberCountAdd = grpAdd.joined.size + grpAdd.ringing.size;
            for (const tid of allowed) {
              sendToUser(tid, {
                type: 'call:incoming',
                callId,
                chatId: grpAdd.chatId,
                callSideChatId: grpAdd.sideChatId,
                video: grpAdd.video,
                isGroupCall: true,
                groupExpectedCount: memberCountAdd,
                from: { id: uid, name: fromAdd?.name || 'Usuário' },
              });
            }
            break;
          }

          case 'call:group-media-state': {
            const callId = msg.callId as string;
            const grp = groupSessions.get(callId);
            if (!grp || !grp.joined.has(uid)) return;
            const micMuted = Boolean(msg.micMuted);
            const camOff = Boolean(msg.camOff);
            grp.mediaState.set(uid, { micMuted, camOff });
            grp.joined.forEach((peer) => {
              if (peer === uid) return;
              sendToUser(peer, { type: 'call:group-media-state', callId, userId: uid, micMuted, camOff });
            });
            break;
          }

          case 'call:group-host-action': {
            const callId = msg.callId as string;
            const action = msg.action as string;
            const grp = groupSessions.get(callId);
            if (!grp || grp.initiatorId !== uid) return;

            if (action === 'set-lock') {
              grp.locked = Boolean(msg.locked);
              grp.joined.forEach((peer) =>
                sendToUser(peer, { type: 'call:group-lock-state', callId, locked: grp.locked })
              );
              break;
            }

            if (action === 'approve-join') {
              const targetUserId = msg.targetUserId as string;
              if (!targetUserId || !grp.waitingApproval.has(targetUserId)) return;
              grp.waitingApproval.delete(targetUserId);
              grp.joined.add(targetUserId);
              grp.mediaState.set(targetUserId, { micMuted: false, camOff: !grp.video });
              await chatService.ensureUserInGroupCallChat(grp.sideChatId, targetUserId);
              meshNotifyNewJoiner(callId, grp, targetUserId);
              await notifyGroupEveryone(callId, grp);
              sendToUser(targetUserId, { type: 'call:group-join-approved', callId });
              break;
            }

            if (action === 'mute') {
              const targetUserId = msg.targetUserId as string;
              if (!targetUserId || !grp.joined.has(targetUserId)) return;
              const prev = grp.mediaState.get(targetUserId) ?? { micMuted: false, camOff: !grp.video };
              grp.mediaState.set(targetUserId, { ...prev, micMuted: true });
              sendToUser(targetUserId, { type: 'call:force-mute', callId });
              await notifyGroupEveryone(callId, grp);
              break;
            }

            if (action === 'kick') {
              const targetUserId = msg.targetUserId as string;
              if (!targetUserId || !grp.joined.has(targetUserId) || targetUserId === grp.initiatorId) return;
              grp.joined.delete(targetUserId);
              grp.mediaState.delete(targetUserId);
              sendToUser(targetUserId, { type: 'call:kicked', callId });
              grp.joined.forEach((peer) =>
                sendToUser(peer, { type: 'call:group-peer-left', callId, userId: targetUserId })
              );
              await notifyGroupEveryone(callId, grp);
            }
            break;
          }

          case 'rtc:offer':
          case 'rtc:answer':
          case 'rtc:candidate': {
            const callId = msg.callId as string;
            const toUser = msg.to as string | undefined;

            const grpSd = groupSessions.get(callId);
            if (grpSd && toUser) {
              if (!grpSd.joined.has(uid) || !grpSd.joined.has(toUser)) return;
              sendToUser(toUser, { ...msg, from: uid } as unknown as Record<string, unknown>);
              break;
            }

            const recSd = activeCalls.get(callId);
            if (!recSd) break;

            let target = toUser;
            if (!target) {
              const other = otherInCall(recSd, uid);
              if (!other) return;
              target = other;
            } else {
              const ok = uid === recSd.callerId ? target === recSd.calleeId : target === recSd.callerId;
              if (!ok || target !== otherInCall(recSd, uid)) return;
            }
            sendToUser(target, { ...msg, from: uid } as unknown as Record<string, unknown>);
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
