/**
 * Server-side Lua scripts for atomic Redis state mutations.
 *
 * Two kinds of script:
 *  - Simple mutations (joinRoom / startGame / placeBid / setAvatar / leaveRoom):
 *    decode state, mutate, version-bump, persist, emit event — all atomic.
 *  - Thin commits (commitState / commitRound): the route computes the next
 *    RoomState in Node via the unit-tested lib/game-engine/round.ts engine, then
 *    these scripts version-CAS and persist it. This keeps the TESTED code as the
 *    runtime for all challenge/round resolution (开/劈/通杀/Palifico) instead of a
 *    parallel untested Lua re-implementation.
 *
 * Returns a JSON-encoded result: `{ok: true, version, ...}` or `{ok: false, reason, ...}`.
 */

export const joinRoom = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local nick = ARGV[2]
local avatar = ARGV[3]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.phase == 'game_end' then
  return cjson.encode({ok=false, reason='game_ended'})
end
if state.phase ~= 'lobby' then
  return cjson.encode({ok=false, reason='game_in_progress'})
end
if #state.players >= 8 then
  return cjson.encode({ok=false, reason='room_full'})
end
for i = 1, #state.players do
  if state.players[i].id == playerId then
    -- player already in room (reconnect) — refresh nick + avatar
    state.players[i].nick = nick
    state.players[i].avatar = avatar
    state.version = state.version + 1
    redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
    return cjson.encode({ok=true, version=state.version, rejoined=true})
  end
end
local newPlayer = {
  id = playerId,
  nick = nick,
  avatar = avatar,
  diceLeft = state.rules.diceCount,
  alive = true,
}
table.insert(state.players, newPlayer)
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='player_joined', payload={playerId=playerId, nick=nick, avatar=avatar}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

// startGame: atomically advances lobby → bidding AND writes hands.
// JS layer generates hands (via crypto.randomInt) and passes them in.
// ARGV: playerId, then alternating playerId, jsonHand, playerId, jsonHand, ...
export const startGame = `
local stateKey = KEYS[1]
local handsKey = KEYS[2]
local playerId = ARGV[1]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.ownerId ~= playerId then return cjson.encode({ok=false, reason='not_owner'}) end
if state.phase ~= 'lobby' then return cjson.encode({ok=false, reason='wrong_phase'}) end
if #state.players < 2 then return cjson.encode({ok=false, reason='need_more_players'}) end

-- Replace hands hash atomically with what JS sent us
redis.call('DEL', handsKey)
for i = 2, #ARGV, 2 do
  redis.call('HSET', handsKey, ARGV[i], ARGV[i+1])
end
redis.call('EXPIRE', handsKey, 21600)

state.phase = 'bidding'
state.round = state.round + 1
state.currentTurnIdx = 0
-- Skip to first alive player (defensive; all players start alive)
local n = #state.players
if not state.players[1].alive then
  for k = 1, n do
    state.currentTurnIdx = (state.currentTurnIdx + 1) % n
    if state.players[state.currentTurnIdx + 1].alive then break end
  end
end
state.lastBid = cjson.null
state.isZhaiRound = false
state.lastChallengeResult = cjson.null
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='game_started', payload={round=state.round}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

// placeBid: validates turn, CAS, appends to the round's bid chain, advances to
// next alive player. (Bid legality is checked in Node via isValidBid before this
// runs; version-CAS guarantees the state it validated against is the committed one.)
export const placeBid = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local count = tonumber(ARGV[2])
local face = tonumber(ARGV[3])
local isZhai = ARGV[4] == '1'
local expectedVersion = tonumber(ARGV[5])
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=state.version})
end
if state.phase ~= 'bidding' then return cjson.encode({ok=false, reason='wrong_phase'}) end
local turnPlayer = state.players[state.currentTurnIdx + 1]
if not turnPlayer or turnPlayer.id ~= playerId then
  return cjson.encode({ok=false, reason='not_your_turn'})
end
-- Reset the bid chain when this is the round opener (no standing bid), then append.
-- NB: lastBid and the chain entry must be SEPARATE tables — Redis cjson.encode
-- returns nil (→ "redis() args must be strings") if a sub-table is shared.
if state.lastBid == nil or state.lastBid == cjson.null then state.bidChain = {} end
state.lastBid = { count = count, face = face, isZhai = isZhai }
table.insert(state.bidChain, { playerId = playerId, bid = { count = count, face = face, isZhai = isZhai } })
if isZhai then state.isZhaiRound = true end
local n = #state.players
local nextIdx = state.currentTurnIdx
local guard = 0
repeat
  nextIdx = (nextIdx + 1) % n
  guard = guard + 1
  if guard > n then return cjson.encode({ok=false, reason='no_alive_players'}) end
until state.players[nextIdx + 1].alive
state.currentTurnIdx = nextIdx
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='bid', payload={playerId=playerId, count=count, face=face, isZhai=isZhai}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

// commitState: version-CAS commit of a full RoomState computed in Node (challenge /
// 劈 / 通杀 resolution, or a terminal game_end). KEYS[1]=stateKey.
// ARGV: expectedVersion, newStateJson, eventJson, ttl.
export const commitState = `
local stateKey = KEYS[1]
local expectedVersion = tonumber(ARGV[1])
local newState = ARGV[2]
local eventJson = ARGV[3]
local ttl = tonumber(ARGV[4])
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local cur = cjson.decode(raw)
if cur.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=cur.version})
end
redis.call('SET', stateKey, newState, 'EX', ttl)
local decoded = cjson.decode(newState)
redis.call('XADD', 'room:' .. cur.code .. ':events', '*', 'data', eventJson)
redis.call('PUBLISH', 'room:' .. cur.code .. ':events', eventJson)
return cjson.encode({ok=true, version=decoded.version})
`;

// commitRound: like commitState, but also resets the hands hash with fresh dice for
// the new round. KEYS[1]=stateKey KEYS[2]=handsKey.
// ARGV: expectedVersion, newStateJson, eventJson, ttl, then alternating playerId, jsonHand.
export const commitRound = `
local stateKey = KEYS[1]
local handsKey = KEYS[2]
local expectedVersion = tonumber(ARGV[1])
local newState = ARGV[2]
local eventJson = ARGV[3]
local ttl = tonumber(ARGV[4])
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local cur = cjson.decode(raw)
if cur.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=cur.version})
end
redis.call('SET', stateKey, newState, 'EX', ttl)
redis.call('DEL', handsKey)
for i = 5, #ARGV, 2 do
  redis.call('HSET', handsKey, ARGV[i], ARGV[i+1])
end
redis.call('EXPIRE', handsKey, ttl)
local decoded = cjson.decode(newState)
redis.call('XADD', 'room:' .. cur.code .. ':events', '*', 'data', eventJson)
redis.call('PUBLISH', 'room:' .. cur.code .. ':events', eventJson)
return cjson.encode({ok=true, version=decoded.version})
`;

// setAvatar: updates a player's cosmetic avatar id. Lobby-only.
export const setAvatar = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local avatar = ARGV[2]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
-- Lobby-only: bumping state.version mid-game would race version-CAS bids.
if state.phase ~= 'lobby' then return cjson.encode({ok=false, reason='wrong_phase'}) end
local found = false
for i = 1, #state.players do
  if state.players[i].id == playerId then
    state.players[i].avatar = avatar
    found = true
    break
  end
end
if not found then return cjson.encode({ok=false, reason='not_in_room'}) end
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 1800)
local payload = cjson.encode({type='avatar_updated', payload={playerId=playerId, avatar=avatar}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

// leaveRoom: removes player from room. If owner leaves, transfers to earliest joiner.
// If only 1 alive remains during an active game, ends the game.
export const leaveRoom = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
local n = #state.players
local idx = -1
for i = 1, n do
  if state.players[i].id == playerId then idx = i break end
end
if idx == -1 then return cjson.encode({ok=true, version=state.version, alreadyOut=true}) end

if state.phase == 'lobby' then
  -- Remove entirely
  table.remove(state.players, idx)
  if #state.players == 0 then
    redis.call('DEL', stateKey)
    return cjson.encode({ok=true, roomClosed=true})
  end
  if state.ownerId == playerId then
    state.ownerId = state.players[1].id
  end
  state.version = state.version + 1
  redis.call('SET', stateKey, cjson.encode(state), 'EX', 1800)
  local payload = cjson.encode({type='player_left', payload={playerId=playerId}, version=state.version})
  redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
  redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
  return cjson.encode({ok=true, version=state.version})
end

-- Mid-game: mark dead instead of removing (preserve indices)
state.players[idx].alive = false
state.players[idx].diceLeft = 0
if state.ownerId == playerId then
  for i = 1, n do
    if state.players[i].alive then state.ownerId = state.players[i].id break end
  end
end
local aliveCount = 0
local lastAliveIdx = -1
for i = 1, n do
  if state.players[i].alive then
    aliveCount = aliveCount + 1
    lastAliveIdx = i - 1
  end
end
if aliveCount <= 1 then
  state.phase = 'game_end'
  state.lastChallengeResult = {
    kind = 'challenge', actualCount = 0, verifiedBid = { count = 0, face = 1, isZhai = false },
    bidderIdx = -1, loserIdx = idx - 1, loserId = playerId, loserIds = { playerId },
    diceLost = 0, actualMeetsBid = false, gameEnded = true, winnerIdx = lastAliveIdx,
  }
elseif state.currentTurnIdx == idx - 1 then
  -- The departing player held the turn and the game continues — advance to the
  -- next alive seat so the round doesn't freeze on a dead player.
  local guard = 0
  repeat
    state.currentTurnIdx = (state.currentTurnIdx + 1) % n
    guard = guard + 1
    if guard > n then break end
  until state.players[state.currentTurnIdx + 1].alive
end
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='player_left', payload={playerId=playerId, gameEnded=aliveCount<=1}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

// rematch: owner-only reset of a finished game back to the lobby with the same
// players. (Empty {}/array fields are coerced by normalizeState on the next read.)
export const rematch = `
local stateKey = KEYS[1]
local handsKey = KEYS[2]
local playerId = ARGV[1]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.ownerId ~= playerId then return cjson.encode({ok=false, reason='not_owner'}) end
if state.phase ~= 'game_end' then return cjson.encode({ok=false, reason='wrong_phase'}) end
for i = 1, #state.players do
  state.players[i].diceLeft = state.rules.diceCount
  state.players[i].alive = true
end
state.phase = 'lobby'
state.round = 0
state.currentTurnIdx = 0
state.lastBid = cjson.null
state.bidChain = {}
state.isZhaiRound = false
state.palificoActive = false
state.palificoBidderId = cjson.null
state.palificoTriggered = {}
state.lastChallengeResult = cjson.null
state.version = state.version + 1
redis.call('DEL', handsKey)
redis.call('SET', stateKey, cjson.encode(state), 'EX', 1800)
local payload = cjson.encode({type='rematch', payload={}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;
