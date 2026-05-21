import { Redis } from '@upstash/redis';

if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  // eslint-disable-next-line no-console
  console.warn('[redis] KV_REST_API_URL/TOKEN missing — Upstash calls will fail');
}

export const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

export const UPSTASH_REST_URL = process.env.KV_REST_API_URL ?? '';
export const UPSTASH_REST_TOKEN = process.env.KV_REST_API_TOKEN ?? '';
