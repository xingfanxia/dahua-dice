/**
 * Server-side Lua scripts for atomic Redis state mutations.
 *
 * Each script takes the room state JSON, validates expected_version (CAS),
 * mutates state, persists, appends event to stream, publishes to channel.
 *
 * Returns a JSON-encoded result: `{ok: true, version, ...}` or `{ok: false, reason, ...}`.
 *
 * Refer to Upstash @upstash/redis SDK for the script execution method.
 */

export const joinRoom = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local nick = ARGV[2]
local avatar = ARGV[3]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
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

// placeBid: validates turn, CAS, advances to next alive player.
// Dead-loop guard prevents infinite repeat-until if state corrupts.
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
state.lastBid = { count = count, face = face, isZhai = isZhai }
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

// resolveChallenge: bidding → reveal, computes actualCount from hands hash,
// decrements loser's diceLeft, marks alive=false if 0, persists outcome on state.
export const resolveChallenge = `
local stateKey = KEYS[1]
local handsKey = KEYS[2]
local playerId = ARGV[1]
local expectedVersion = tonumber(ARGV[2])
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=state.version})
end
if state.phase ~= 'bidding' then return cjson.encode({ok=false, reason='wrong_phase'}) end
if not state.lastBid or state.lastBid == cjson.null then
  return cjson.encode({ok=false, reason='no_bid_to_challenge'})
end
local turnPlayer = state.players[state.currentTurnIdx + 1]
if not turnPlayer or turnPlayer.id ~= playerId then
  return cjson.encode({ok=false, reason='not_your_turn'})
end

-- Compute actual count from hands hash (JSON-encoded number[] per player)
local handsArr = redis.call('HGETALL', handsKey)
local handsByPlayerId = {}
for i = 1, #handsArr, 2 do
  handsByPlayerId[handsArr[i]] = cjson.decode(handsArr[i+1])
end
local wildOnesActive = (not state.lastBid.isZhai) and state.rules.aceWild
local actualCount = 0
for _, hand in pairs(handsByPlayerId) do
  for _, face in ipairs(hand) do
    if face == state.lastBid.face then
      actualCount = actualCount + 1
    elseif wildOnesActive and face == 1 then
      actualCount = actualCount + 1
    end
  end
end

local actualMeetsBid = actualCount >= state.lastBid.count
local challengerIdx = state.currentTurnIdx
local n = #state.players
-- Find previous alive player as bidder
local bidderIdx = challengerIdx
local guard = 0
repeat
  bidderIdx = (bidderIdx - 1 + n) % n
  guard = guard + 1
  if guard > n then return cjson.encode({ok=false, reason='no_alive_players'}) end
until state.players[bidderIdx + 1].alive and bidderIdx ~= challengerIdx
local loserIdx = challengerIdx
if not actualMeetsBid then loserIdx = bidderIdx end

local loser = state.players[loserIdx + 1]
loser.diceLeft = loser.diceLeft - 1
if loser.diceLeft <= 0 then
  loser.alive = false
end

local aliveCount = 0
local lastAliveIdx = -1
for i = 1, n do
  if state.players[i].alive then
    aliveCount = aliveCount + 1
    lastAliveIdx = i - 1
  end
end

state.phase = 'reveal'
state.lastChallengeResult = {
  actualCount = actualCount,
  bidderIdx = bidderIdx,
  loserIdx = loserIdx,
  loserId = loser.id,
  actualMeetsBid = actualMeetsBid,
  gameEnded = aliveCount <= 1,
  winnerIdx = (aliveCount <= 1) and lastAliveIdx or -1,
}
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='challenge_resolved', payload=state.lastChallengeResult, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version, result=state.lastChallengeResult})
`;

// nextRound: reveal → rolling (or game_end if only one alive). JS passes fresh hands.
// ARGV: playerId, expectedVersion, then alternating playerId, jsonHand for each alive player.
export const nextRound = `
local stateKey = KEYS[1]
local handsKey = KEYS[2]
local playerId = ARGV[1]
local expectedVersion = tonumber(ARGV[2])
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.version ~= expectedVersion then
  return cjson.encode({ok=false, reason='stale', currentVersion=state.version})
end
if state.phase ~= 'reveal' then return cjson.encode({ok=false, reason='wrong_phase'}) end

local isAlive = false
for i = 1, #state.players do
  if state.players[i].id == playerId and state.players[i].alive then
    isAlive = true
    break
  end
end
if not isAlive then return cjson.encode({ok=false, reason='not_alive'}) end

if state.lastChallengeResult and state.lastChallengeResult.gameEnded then
  state.phase = 'game_end'
  state.version = state.version + 1
  redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
  local endPayload = cjson.encode({type='game_ended', payload={winnerIdx=state.lastChallengeResult.winnerIdx}, version=state.version})
  redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', endPayload)
  redis.call('PUBLISH', 'room:' .. state.code .. ':events', endPayload)
  return cjson.encode({ok=true, version=state.version, gameEnded=true})
end

redis.call('DEL', handsKey)
for i = 3, #ARGV, 2 do
  redis.call('HSET', handsKey, ARGV[i], ARGV[i+1])
end
redis.call('EXPIRE', handsKey, 21600)

local n = #state.players
local nextTurnIdx = state.lastChallengeResult.loserIdx
if not state.players[nextTurnIdx + 1].alive then
  local guard = 0
  repeat
    nextTurnIdx = (nextTurnIdx + 1) % n
    guard = guard + 1
    if guard > n then return cjson.encode({ok=false, reason='no_alive_players'}) end
  until state.players[nextTurnIdx + 1].alive
end
state.phase = 'bidding'
state.round = state.round + 1
state.currentTurnIdx = nextTurnIdx
state.lastBid = cjson.null
state.isZhaiRound = false
state.lastChallengeResult = cjson.null
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local roundPayload = cjson.encode({type='round_started', payload={round=state.round, currentTurnIdx=nextTurnIdx}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', roundPayload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', roundPayload)
return cjson.encode({ok=true, version=state.version})
`;

// setAvatar: updates a player's cosmetic avatar id. Allowed in any phase.
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
    actualCount = 0, bidderIdx = -1, loserIdx = idx - 1, loserId = playerId,
    actualMeetsBid = false, gameEnded = true, winnerIdx = lastAliveIdx,
  }
end
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='player_left', payload={playerId=playerId, gameEnded=aliveCount<=1}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;
