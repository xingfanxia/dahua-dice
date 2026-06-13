import { BotClient } from './BotClient';

/**
 * Human-vs-computer mode — a LOCAL single-device game (no room, no server). The
 * same unit-tested engine drives an in-memory game against a probability-model
 * bot (lib/bot/*). Pick a difficulty and play; nothing leaves the device.
 */
export default function BotPage() {
  return <BotClient />;
}
