/**
 * Server-side Lua scripts for atomic Redis state mutations.
 *
 * Each script: takes the room state JSON, validates expected_version (CAS),
 * mutates state, persists, appends event to stream, publishes to channel.
 *
 * Returns a JSON-encoded result: `{ok: true, version}` or `{ok: false, reason, ...}`.
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

export const startGame = `
local stateKey = KEYS[1]
local playerId = ARGV[1]
local raw = redis.call('GET', stateKey)
if not raw then return cjson.encode({ok=false, reason='no_room'}) end
local state = cjson.decode(raw)
if state.ownerId ~= playerId then return cjson.encode({ok=false, reason='not_owner'}) end
if state.phase ~= 'lobby' then return cjson.encode({ok=false, reason='wrong_phase'}) end
if #state.players < 2 then return cjson.encode({ok=false, reason='need_more_players'}) end
state.phase = 'rolling'
state.round = state.round + 1
state.currentTurnIdx = 0
state.lastBid = cjson.null
state.isZhaiRound = false
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='game_started', payload={round=state.round}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

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
repeat
  nextIdx = (nextIdx + 1) % n
until state.players[nextIdx + 1].alive
state.currentTurnIdx = nextIdx
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='bid', payload={playerId=playerId, count=count, face=face, isZhai=isZhai}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;

export const challenge = `
local stateKey = KEYS[1]
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
state.phase = 'reveal'
state.version = state.version + 1
redis.call('SET', stateKey, cjson.encode(state), 'EX', 21600)
local payload = cjson.encode({type='challenge', payload={challengerId=playerId, bid=state.lastBid}, version=state.version})
redis.call('XADD', 'room:' .. state.code .. ':events', '*', 'data', payload)
redis.call('PUBLISH', 'room:' .. state.code .. ':events', payload)
return cjson.encode({ok=true, version=state.version})
`;
