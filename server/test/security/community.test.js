// Community privacy and integrity: private chats, groups, saved items, live
// updates, ownership of posts and ideas, polls, reactions, moderation ranks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, makeUser, signIn, prisma } from './helpers.js';

let alice, bob, eve, mod, admin;
let aliceC, bobC, eveC, modC, adminC;
let dmId, dmMessageId, groupId;
before(async () => {
  const base = await startServer();
  void base;
  [alice, bob, eve, mod, admin] = await Promise.all([makeUser('Alice'), makeUser('Bob'), makeUser('Eve'), makeUser('Mod', { role: 'moderator' }), makeUser('Admin', { role: 'admin' })]);
  [aliceC, bobC, eveC, modC, adminC] = await Promise.all([signIn(alice), signIn(bob), signIn(eve), signIn(mod), signIn(admin)]);
  // Alice and Bob's private chat, which Eve must never see.
  dmId = (await aliceC.post('/api/community/conversations/dm', { userId: bob.id })).json.conversationId;
  dmMessageId = (await aliceC.post(`/api/community/conversations/${dmId}/messages`, { body: 'secret trade plan' })).json.message.id;
  groupId = (await aliceC.post('/api/community/conversations', { kind: 'group', name: 'Private desk', memberIds: [bob.id] })).json.conversationId;
});
after(stopServer);

test('outsiders cannot read, search, or post in a private chat', async () => {
  assert.equal((await eveC.get(`/api/community/conversations/${dmId}/messages`)).status, 403);
  assert.equal((await eveC.get(`/api/community/conversations/${dmId}`)).status, 403);
  assert.equal((await eveC.get(`/api/community/conversations/${dmId}/messages/around/${dmMessageId}`)).status, 403);
  assert.equal((await eveC.get(`/api/community/conversations/${dmId}/search?q=secret`)).status, 403);
  assert.equal((await eveC.post(`/api/community/conversations/${dmId}/messages`, { body: 'hi' })).status, 403);
  const search = await eveC.get('/api/community/search?q=secret%20trade');
  assert.ok(!(search.json.results.messages ?? []).some((m) => m.id === dmMessageId));
});

test('outsiders cannot react to, pin, edit, delete or fact-check a private message', async () => {
  assert.equal((await eveC.post(`/api/community/messages/${dmMessageId}/reactions`, { emoji: '👍' })).status, 403);
  assert.equal((await eveC.post(`/api/community/messages/${dmMessageId}/pin`, {})).status, 403);
  assert.equal((await eveC.patch(`/api/community/messages/${dmMessageId}`, { body: 'edited' })).status, 403);
  assert.equal((await eveC.delete(`/api/community/messages/${dmMessageId}`)).status, 403);
  const fc = await eveC.post('/api/community/ai/fact-check', { targetType: 'message', targetId: dmMessageId });
  assert.ok([404, 429, 503].includes(fc.status));
  assert.notEqual(fc.status, 200);
});

test('a private message cannot be saved or listed by someone outside the chat', async () => {
  assert.equal((await eveC.post('/api/community/saved', { itemType: 'message', itemId: dmMessageId })).status, 404);
  // Even a saved row made some other way is filtered out of the list.
  await prisma.savedItem.create({ data: { userId: eve.id, itemType: 'message', itemId: dmMessageId } });
  const saved = await eveC.get('/api/community/saved');
  assert.ok(!JSON.stringify(saved.json).includes('secret trade plan'));
  // Bob, who is in the chat, can save it.
  assert.equal((await bobC.post('/api/community/saved', { itemType: 'message', itemId: dmMessageId })).status, 200);
});

test('private groups: outsiders are refused; removed members lose access', async () => {
  assert.equal((await eveC.get(`/api/community/conversations/${groupId}/messages`)).status, 403);
  assert.equal((await eveC.post(`/api/community/conversations/${groupId}/join`)).status, 403);
  assert.equal((await eveC.post(`/api/community/conversations/${groupId}/members`, { userIds: [eve.id] })).status, 403);
  assert.equal((await bobC.get(`/api/community/conversations/${groupId}/messages`)).status, 200);
  assert.equal((await aliceC.delete(`/api/community/conversations/${groupId}/members/${bob.id}`)).status, 200);
  assert.equal((await bobC.get(`/api/community/conversations/${groupId}/messages`)).status, 403);
  // A removed member can't rejoin by themselves.
  assert.equal((await bobC.post(`/api/community/conversations/${groupId}/join`)).status, 403);
});

test('live updates: a private chat channel cannot be subscribed to', async () => {
  const base = await startServer();
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/realtime/stream?channels=conv:${dmId},market:EURUSD`, { headers: { Cookie: eveC.cookie }, signal: ctrl.signal });
  const reader = res.body.getReader();
  let text = '';
  while (!text.includes('event: ready')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  ctrl.abort();
  const ready = JSON.parse(/event: ready\ndata: (.*)\n/.exec(text)[1]);
  assert.ok(!ready.channels.includes(`conv:${dmId}`));
  assert.ok(ready.channels.includes(`user:${eve.id}`));
});

test("people can't edit or delete others' posts, or update others' trade ideas", async () => {
  const idea = await aliceC.post('/api/community/posts', { kind: 'idea', instrument: 'EURUSD', idea: { direction: 'bullish', timeframe: '4H', entry: 1.1, stop: 1.09, target: 1.13, thesis: 'A long enough explanation of the reasoning behind this idea.' } });
  assert.equal(idea.status, 201);
  const id = idea.json.post.id;
  assert.equal((await eveC.patch(`/api/community/posts/${id}`, { body: 'hijacked' })).status, 403);
  assert.equal((await eveC.delete(`/api/community/posts/${id}`)).status, 403);
  assert.equal((await eveC.patch(`/api/community/ideas/${id}/status`, { status: 'closed', note: 'fake close' })).status, 403);
  // Clients can't post server-only kinds like achievements.
  const fake = await eveC.post('/api/community/posts', { kind: 'achievement', body: 'I made 1000%' });
  assert.equal(fake.status, 201);
  assert.equal(fake.json.post.kind, 'post');
});

test('polls in private chats only accept votes from members', async () => {
  const msg = await aliceC.post(`/api/community/conversations/${dmId}/messages`, { poll: { question: 'Long or short?', options: ['Long', 'Short'] } });
  const pollId = msg.json.message.attachments.find((a) => a.type === 'poll')?.poll?.id ?? (await prisma.poll.findFirst({ where: { messageId: msg.json.message.id } })).id;
  const options = await prisma.pollOption.findMany({ where: { pollId } });
  assert.equal((await eveC.post(`/api/community/polls/${pollId}/vote`, { optionId: options[0].id })).status, 403);
});

test('reaction counts stay exact under parallel taps', async () => {
  const post = await aliceC.post('/api/community/posts', { kind: 'post', body: 'Count me' });
  const id = post.json.post.id;
  await Promise.all(Array.from({ length: 7 }, () => bobC.post(`/api/community/posts/${id}/reactions`, { emoji: 'like' })));
  const [row, n] = await Promise.all([prisma.post.findUnique({ where: { id } }), prisma.postReaction.count({ where: { postId: id } })]);
  assert.equal(row.reactionCount, n);
  assert.ok(n <= 1);
});

test('moderators can remove traders’ posts but not staff posts', async () => {
  const traderPost = await eveC.post('/api/community/posts', { kind: 'post', body: 'spam spam' });
  const staffPost = await adminC.post('/api/community/posts', { kind: 'post', body: 'Staff notice' });
  assert.equal((await modC.delete(`/api/community/posts/${staffPost.json.post.id}`)).status, 403);
  assert.equal((await modC.delete(`/api/community/posts/${traderPost.json.post.id}`)).status, 200);
});

test('reports cannot be read or resolved by traders', async () => {
  // A private message you can't see can't be reported (or probed) either.
  assert.equal((await eveC.post('/api/community/reports', { targetType: 'message', targetId: dmMessageId, category: 'spam' })).status, 404);
  assert.equal((await eveC.get('/api/admin/community/reports')).status, 403);
  assert.equal((await eveC.post('/api/admin/community/actions', { action: 'dismiss' })).status, 403);
});
