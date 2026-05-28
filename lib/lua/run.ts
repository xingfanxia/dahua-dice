import { redis } from '@/lib/redis';
import * as SCRIPTS from './scripts';

type ScriptName = keyof typeof SCRIPTS;

type LuaResult<T extends Record<string, unknown> = Record<string, unknown>> =
  | ({ ok: true; version: number } & T)
  | { ok: false; reason: string; currentVersion?: number };

/**
 * Execute a server-side Lua script via the Upstash Redis SDK.
 * See: https://upstash.com/docs/redis/sdks/ts/commands/eval
 */
export async function runScript<T extends Record<string, unknown> = Record<string, unknown>>(
  name: ScriptName,
  keys: string[],
  args: string[],
): Promise<LuaResult<T>> {
  // The SDK's EVAL wrapper accepts (script, keys, args)
  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: script registry keyed by name
  const script = SCRIPTS[name];
  // biome-ignore lint/suspicious/noExplicitAny: SDK overload typing varies
  const fn = (redis as any).eval.bind(redis) as (
    s: string,
    k: string[],
    a: string[],
  ) => Promise<unknown>;
  const result = await fn(script, keys, args);
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  return parsed as LuaResult<T>;
}
