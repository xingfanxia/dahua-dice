# 大话骰 Web App Demo — 骰子音效方案调研

调研日期：2026-05-21
目标栈：Next.js 16 + Vercel + Mobile-first + react-three-fiber + @react-three/rapier
调研重点：mobile-first、physics-driven、4 themes pack

---

## TL;DR — 推荐方案

| 维度 | 推荐 | 理由 |
|---|---|---|
| **核心音效库** | **Howler.js** | 7KB，sprite + pool 内置，自动 iOS unlock，sound ID 控制每个实例 rate/volume，跨浏览器最稳 |
| **空间音效（可选）** | `@react-three/drei` 的 `PositionalAudio` | 给骰盅/骰子加 3D 位置感，但单靠 Howler 已经够用，不必上 |
| **资源主源** | (1) Freesound CC0 → (2) Pixabay 免标注 → (3) ElevenLabs API AI 补充 | 一开始用 free pack，theme 不够再 AI 生 |
| **碰撞驱动** | `onContactForce` `totalForceMagnitude` → 映射 volume + playbackRate | `onCollisionEnter` 没有 force 数据，必须用 `onContactForce` |
| **陀螺仪联动** | `DeviceMotionEvent` magnitude → 摇盅 loop 的 volume + rate | 阈值 ~15 m/s² 起，最大 ~40 m/s² 封顶 |
| **iOS unlock** | Howler 内置 `autoUnlock=true` + 在 "tap to start" 按钮额外调用 `Howler.ctx.resume()` 保底 | iOS 17+ 在 touchstart 上有奇怪行为，touchend 才稳 |

**不要选 Tone.js**：它是音乐合成框架，文件播放只是顺带；游戏 SFX 用 Tone.js 是 over-engineering。
**不要选 Vanilla `<audio>`**：iOS Safari 每个 `<audio>` 元素都需要独立 unlock，channel 管理痛苦，playbackRate 在 iOS 上 audio 元素的支持也烂。

---

## A. 音效资源来源

### A.1 Freesound.org（CC0，最优先；CC-BY 也可用但要在 about 页标注）

直接搜索 URL（已加 CC0 过滤器）：
- 骰子: https://freesound.org/search/?q=dice+roll&f=license%3A%22Creative+Commons+0%22
- 摇杯: https://freesound.org/search/?q=dice+cup+shake&f=license%3A%22Creative+Commons+0%22
- 木桌敲击: https://freesound.org/search/?q=wood+impact&f=license%3A%22Creative+Commons+0%22

**精选 10+ 文件**：

| # | 文件 / 作者 | URL | License | 用途 |
|---|---|---|---|---|
| 1 | `Dice_Rolls_15cm.wav` by andresix | https://freesound.org/people/andresix/sounds/347807/ | CC0 | 单颗塑料骰滚动，干净，做单骰落定基底 |
| 2 | `Rolling Single and Dual 20-Sided Dice` by vartian | https://freesound.org/people/vartian/sounds/560085/ | CC0 | 1-2 颗 D20 在木桌，高保真录音 |
| 3 | `rolling dice 1.wav` by nettimato | https://freesound.org/people/nettimato/sounds/353975/ | CC0 | 3 颗六面骰，含 50% 慢速版（可二次利用） |
| 4 | `Dice Rolling on Table` by Flem0527 | https://freesound.org/people/Flem0527/sounds/629982/ | CC0 | 一对木桌骰，2.8K 下载量验证质量 |
| 5 | `$ DICE - multiple rolls.wav` by kennydoug | https://freesound.org/people/kennydoug/sounds/464254/ | CC0 | 陶瓷水槽反射，可做"骰盅金属/陶瓷"theme |
| 6 | `dice roll_wooden table_2.wav` by ekfink | https://freesound.org/people/ekfink/sounds/235489/ | CC0 | 两颗木桌骰，短促 |
| 7 | `Shaking and rolling dices 5 4 3 2 1.mp3` by fernandobatista89 | https://freesound.org/people/fernandobatista89/sounds/427193/ | CC0 | 渐进 5→1 颗，可切成 5 段单骰 |
| 8 | `Dice Roll 2.mp3` by SciFiSounds | https://freesound.org/people/SciFiSounds/sounds/547929/ | CC-BY | 干净短促，做"开骰" |
| 9 | `GAMEMisc_Dice Roll On Wood_Jaku5.wav` by jakubp.jp | https://freesound.org/people/jakubp.jp/sounds/558204/ | CC0 | 单 D10 木桌，可做 collision variant |
| 10 | `D&D_DICE__1XD20+1XD12_007_Shake_Roll_Off_Table.wav` by Code_E | https://freesound.org/people/Code_E/sounds/575155/ | CC0 | 含 shake → roll → off-table 完整链 |
| 11 | `Dice rolling on wood table` by eduardvlog | https://freesound.org/people/eduardvlog/sounds/766177/ | CC0 | 含 clack + rattle + clatter + clunk，可切片做 4 个独立 SFX |
| 12 | `Dice Rolling - Dungeon and Dragons` by joanneneedsthesound | https://freesound.org/people/joanneneedsthesound/sounds/177208/ | CC0 | D12+D20 两颗，3.3K 下载，社区验证 |

### A.2 Pixabay Sound Effects（royalty-free，免标注，但需要登录账号）

最方便：直接下载 MP3，无须 attribution。

- 骰子总览: https://pixabay.com/sound-effects/search/dice/
- 摇杯: https://pixabay.com/sound-effects/search/dice-rolling/
- 摇晃: https://pixabay.com/sound-effects/search/shake/
- 杯/碗: https://pixabay.com/sound-effects/search/cup/
- UI 点击: https://pixabay.com/sound-effects/search/button-click/
- 胜利: https://pixabay.com/sound-effects/search/victory/

### A.3 OpenGameArt（CC0）

- https://opengameart.org/content/cc0-sound-effects — 2 dice roll (29 throws) 套装直接打包

### A.4 Mixkit（免费商用，需标注 mixkit）

- https://mixkit.co/free-sound-effects/dice/
- https://mixkit.co/free-sound-effects/game/ — UI 按钮、胜利、失败齐全

### A.5 ElevenLabs Sound Effects API（AI 生成兜底）

- 控制台: https://elevenlabs.io/sound-effects
- API 文档: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
- Prompt 上限 450 字符，可控制 timbre / envelope / frequency / motion / environment

**dice 类 prompt 模板**：
```
"Two wooden six-sided dice clattering inside a leather cup, fast rhythmic shaking
for 1.5 seconds, deep low-mid tones with sharp clicks, dry tavern acoustic, no
reverb, mono."
```

**theme-specific 生成 prompt**（节省后面查）：
- 现代极简（金属/玻璃）: `"Glass dice tumbling in a chrome cup, crisp high-pitched tinks and metallic resonance, 1.5 seconds shaking, cold studio acoustic"`
- 经典酒桌（木/皮革）: `"Bone dice shaking in a worn leather cup, warm muffled thuds, 1.5 seconds, intimate tavern atmosphere with subtle wood creak"`
- 港风霓虹（街市喧闹）: `"Dice shaking in a porcelain bowl on a metal table, distant Cantonese chatter and mahjong tile clicks in background, 1.5 seconds"`
- 卡通可爱（Q 版啵啵）: `"Cartoon bubbly dice bouncing inside a plastic cup, playful 'pop pop pop' sounds with cute high-pitched chimes, 1.5 seconds, video game style"`

### A.6 商用资源（信息备用，不优先）

- Envato Audio Jungle: https://audiojungle.net/category/sound-effects/cinematic/dice
- Soundsnap: https://www.soundsnap.com/tags/rolling_dice — 247 文件 dice cup 专题
- Pond5: https://www.pond5.com/sound-effects/1/dice-cup.html

---

## B. 实现方案对比

| 方案 | bundle size | iOS unlock | 多通道并发 | playbackRate | 3D 空间感 | 适用度 |
|---|---|---|---|---|---|---|
| Vanilla `<audio>` | 0 KB | 每个 `<audio>` 实例需独立 unlock，痛苦 | 难，元素数量爆炸 | iOS Safari 不稳 | 无 | ❌ |
| Web Audio API 原生 | 0 KB | 完全自己处理 | 可，但要写 BufferSourceNode pool | 完美支持 (`source.playbackRate.value`) | 可（PannerNode） | 自由度最高但开发成本大 |
| **Howler.js** | ~7 KB gzip | 内置 `autoUnlock`，play 时自动 `ctx.resume()` | sound ID + sprite，并发完美 | 完美（`sound.rate(1.5, id)`） | 可（PannerNode wrapper） | ✅ **推荐** |
| Tone.js | ~50 KB | 需 `await Tone.start()` 显式 | 可，但音乐节拍模型，game SFX 是杀鸡用牛刀 | 支持 | 间接 | ❌ over-engineering |
| @react-three/drei `<PositionalAudio>` | drei 已在依赖里 | 通过 R3F 上下文 | 多个实例并发可，但每个声音都是 Three.PositionalAudio 节点 | THREE.Audio 支持 (`audio.setPlaybackRate`) | ✅ 原生 3D 衰减 | ✅ 与 Howler 并用：drei 做"骰盅震动"空间音，Howler 做 UI/胜利等非空间 SFX |

**结论**：主力 **Howler.js**，3D 沉浸感强的 demo 模式可叠加 drei 的 `<PositionalAudio>` 给骰子和骰盅各挂一个空间源。最简洁的 demo 用纯 Howler。

---

## C. 物理引擎碰撞 → 音效触发

### C.1 关键 API（@react-three/rapier）

**`onCollisionEnter`** payload：
- `target` / `other`: CollisionTarget（含 rigidBody, collider, 对应 Three.Object3D）
- `manifold`: 接触流形（含 contact point, normal）
- `flipped`: boolean

**`onContactForce`** payload（这才是要用的）：
- `target` / `other`: CollisionTarget
- **`totalForce`**: Vector3 — 两 collider 间所有力的和
- **`totalForceMagnitude`**: number — 力的总幅值 ← **映射到 volume**
- **`maxForceDirection`**: Vector3 — 最大力方向（单位向量）
- **`maxForceMagnitude`**: number — 最大力幅值

**`onIntersectionEnter` / `onIntersectionExit`**：sensor collider 用，本场景不需要。

### C.2 映射策略

```ts
// 经验阈值（需在 demo 里调）
const MIN_FORCE = 5;      // 低于此忽略（防音爆）
const MAX_FORCE = 300;    // 饱和点
const MIN_RATE = 0.85;    // 慢速重撞（低沉）
const MAX_RATE = 1.25;    // 快速轻撞（清脆）

function forceToAudio(magnitude: number) {
  const t = Math.min(Math.max((magnitude - MIN_FORCE) / (MAX_FORCE - MIN_FORCE), 0), 1);
  return {
    volume: 0.2 + t * 0.8,           // 0.2 ~ 1.0
    rate: MAX_RATE - t * (MAX_RATE - MIN_RATE), // 重撞慢，轻撞快
  };
}
```

### C.3 防音爆（并发控制）

- **debounce per-rigidbody**：每颗骰子最多 50ms 触发一次碰撞音（在 useRef 里存 `lastPlayedAt`）
- **global cap**：同一 frame 最多 6 个 collision sound 并发（用 Howler `Howler._howls` 数组或自管 ring buffer）
- **variant pool**：每个 collision 音准备 4-6 个 variant（不同 pitch / micro timing），random 选一个，避免重复疲劳

---

## D. 陀螺仪幅度联动

### D.1 DeviceMotion 接入（含 iOS 13+ 权限）

```ts
async function requestMotionPermission(): Promise<boolean> {
  const DM = (window as any).DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') {
    const state = await DM.requestPermission(); // 必须在用户手势里调
    return state === 'granted';
  }
  return true; // Android / 老 iOS 自动允许
}
```

### D.2 magnitude → 摇盅音效

```ts
// magnitude 经验值：静止 ~9.8 (gravity)，强烈摇晃 30-40
function onDeviceMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
  const intensity = Math.min(Math.max((mag - 12) / 25, 0), 1); // 0-1 normalized

  shakeSound.volume(0.3 + intensity * 0.7, shakeId);
  shakeSound.rate(0.9 + intensity * 0.4, shakeId); // 摇得越用力 pitch 越高
}
```

---

## E. Mobile-first 约束清单

| 约束 | 处理 |
|---|---|
| **iOS Safari autoplay** | 启动屏"点击进入" 按钮 → 调用 `Howler.ctx.resume()` + 任意 silent play 触发 unlock。Howler 默认 `autoUnlock=true` 已经在 `touchend`/`mousedown`/`keydown` 上做，但显式保底更稳 |
| **iOS 17 touchstart 异常** | Howler 用 `touchend` 而非 `touchstart` 触发 unlock，不用动；自己写代码时记住要用 `touchend`/`pointerup` |
| **单文件 size 预算** | mp3 128kbps mono ≤ 50KB，对 <2s SFX 充分 |
| **package total 预算** | 4 theme × ~120KB = ~500KB（用 sprite 合一个文件可压到 350KB） |
| **格式 fallback** | `[sound.webm, sound.mp3]` 数组 — Howler 自动按浏览器挑（webm 在 iOS Safari 15+ 已支持但 mp3 兼容更广，所以 mp3 必须给） |
| **preload 策略** | 入口屏（theme 选择）`preload='metadata'`；进游戏后台 `Howl.load()` 全部加载到 buffer |
| **音量持久化** | `localStorage.setItem('dahuashai:volume', '0.7')`；进入 app 时 `Howler.volume(saved)` 设全局 |
| **静音 toggle** | UI 右上角小喇叭按钮，`Howler.mute(boolean)` 一行搞定 |
| **iOS 不支持 navigator.vibrate** | 检测 `'vibrate' in navigator`，否则强化音效 + 视觉 shake 替代 |

---

## F. 4 个 Theme 音效 Pack 推荐

| Theme | 摇盅 (loop ~1.5s) | 碰撞 (variants ×4) | 落定 | 揭盅 | 开骰 | 胜利/失败 | 环境音 (loop) |
|---|---|---|---|---|---|---|---|
| **现代极简（金属/玻璃）** | Freesound #5 (kennydoug ceramic sink) 截 1.5s loop | AI 生成 (ElevenLabs prompt: glass tink ×4) | 短玻璃停顿声 | 金属 swoosh | 短 "开" 人声 / 合成 SFX | 合成器 ding/buzz | 无 / 极简 ambient pad |
| **经典酒桌（木地板/皮革）** | Freesound #11 (eduardvlog shake portion) | Freesound #6 + #9 切片 ×4 | Freesound #11 clunk 段 | 皮革翻盖音（自录或 Pixabay "leather flap"） | 男声"开！"（自录 / fiverr） | 木锤敲桌 / 落寞铃声 | Pixabay "tavern ambience" |
| **港风霓虹（市井）** | Freesound #5 + 茶餐厅人声 mix | Freesound #4 (Flem0527) ×4 variant | 瓷碗停顿 | 长揭盅声 + 远处粤语 | 老港片"开！"采样 | 麻将胡牌音 / 港式失意背景 | Free to Use Sounds Hong Kong Market (https://www.freetousesounds.com/sfx/hong-kong-market-sound-effects-library) — 注意 license |
| **卡通可爱（Q 版啵啵）** | AI 全生成（ElevenLabs: cartoon bubbly shaking） | AI 生 ×4 pop variant | 卡通 "boing" | 卡通 swoosh | Q 版"开！"萌音 | "叮~" 胜利 / "啊呜" 失败 | 8-bit chiptune loop（OpenGameArt）|

**资源策略**：
- 经典酒桌 + 港风：80% Freesound CC0 拼接，20% AI 补
- 现代极简 + 卡通：50%+ AI 生（ElevenLabs，因为这两个风格 freesound 较难找）

---

## G. React Hook 代码示例

### G.1 useDiceAudio hook（核心）

```tsx
// hooks/useDiceAudio.ts
import { Howl, Howler } from 'howler';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

type Theme = 'modern' | 'classic' | 'hongkong' | 'cartoon';

const SPRITE_MAP: Record<Theme, { src: string[]; sprite: Record<string, [number, number, boolean?]> }> = {
  modern: {
    src: ['/audio/modern.webm', '/audio/modern.mp3'],
    sprite: {
      shake:     [0,     1500, true],   // looping
      collide_1: [1600,  180],
      collide_2: [1900,  180],
      collide_3: [2200,  180],
      collide_4: [2500,  180],
      settle:    [2800,  400],
      reveal:    [3300,  600],
      open:      [4000,  800],
      win:       [4900,  1200],
      lose:      [6200,  1200],
      button:    [7500,  120],
    },
  },
  classic:  { src: ['/audio/classic.webm',  '/audio/classic.mp3'],  sprite: { /* same shape */ } as any },
  hongkong: { src: ['/audio/hongkong.webm', '/audio/hongkong.mp3'], sprite: { /* same shape */ } as any },
  cartoon:  { src: ['/audio/cartoon.webm',  '/audio/cartoon.mp3'],  sprite: { /* same shape */ } as any },
};

// volume/rate from impact force
function forceToAudio(mag: number) {
  const t = Math.min(Math.max((mag - 5) / 295, 0), 1);
  return { volume: 0.2 + t * 0.8, rate: 1.25 - t * 0.4 };
}

// motion magnitude → shake params
function intensityFromMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (!a) return 0;
  const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
  return Math.min(Math.max((mag - 12) / 25, 0), 1);
}

export function useDiceAudio(theme: Theme) {
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, _setVolume] = useState(() =>
    typeof window !== 'undefined' ? +(localStorage.getItem('dahuashai:vol') ?? 0.7) : 0.7
  );

  const sound = useMemo(() => {
    const { src, sprite } = SPRITE_MAP[theme];
    return new Howl({ src, sprite, html5: false, preload: true });
  }, [theme]);

  const shakeIdRef = useRef<number | null>(null);
  const collideLastAtRef = useRef<Map<number, number>>(new Map());
  const collideConcurrentRef = useRef(0);

  // global volume + persist
  const setVolume = useCallback((v: number) => {
    _setVolume(v);
    Howler.volume(v);
    localStorage.setItem('dahuashai:vol', String(v));
  }, []);

  useEffect(() => { Howler.volume(muted ? 0 : volume); }, [volume, muted]);

  // unmount cleanup
  useEffect(() => () => { sound.unload(); }, [sound]);

  // ── iOS / Android unlock ─────────────────────────────────────────
  const unlock = useCallback(async () => {
    try {
      // @ts-ignore -- Howler.ctx is internal but stable
      await Howler.ctx?.resume();
    } catch {}
    sound.play('button'); // silent-ish play to fully unlock pipeline
    setUnlocked(true);
  }, [sound]);

  // ── 摇盅 (loop, intensity-driven) ──────────────────────────────
  const startShake = useCallback(() => {
    if (shakeIdRef.current !== null) return;
    const id = sound.play('shake');
    sound.volume(0.4, id);
    sound.rate(1, id);
    shakeIdRef.current = id;
  }, [sound]);

  const updateShake = useCallback((intensity: number) => {
    const id = shakeIdRef.current;
    if (id === null) return;
    sound.volume(0.3 + intensity * 0.7, id);
    sound.rate(0.9 + intensity * 0.4, id);
  }, [sound]);

  const stopShake = useCallback(() => {
    const id = shakeIdRef.current;
    if (id !== null) {
      sound.fade(sound.volume(id) as number, 0, 150, id);
      setTimeout(() => sound.stop(id), 160);
      shakeIdRef.current = null;
    }
  }, [sound]);

  // ── 碰撞 (force-driven, variant + debounce + cap) ─────────────
  const playCollision = useCallback((bodyId: number, forceMag: number) => {
    if (forceMag < 5) return;
    if (collideConcurrentRef.current >= 6) return;
    const now = performance.now();
    const last = collideLastAtRef.current.get(bodyId) ?? 0;
    if (now - last < 50) return;
    collideLastAtRef.current.set(bodyId, now);

    const variant = `collide_${1 + Math.floor(Math.random() * 4)}`;
    const { volume: v, rate } = forceToAudio(forceMag);
    const id = sound.play(variant);
    sound.volume(v, id);
    sound.rate(rate, id);
    collideConcurrentRef.current++;
    sound.once('end', () => { collideConcurrentRef.current--; }, id);
  }, [sound]);

  // ── one-shot ─────────────────────────────────────────────────
  const playOnce = useCallback((name: 'settle' | 'reveal' | 'open' | 'win' | 'lose' | 'button') => {
    sound.play(name);
  }, [sound]);

  return {
    unlocked, unlock,
    muted, setMuted, volume, setVolume,
    startShake, updateShake, stopShake,
    playCollision, playOnce,
    intensityFromMotion,
  };
}
```

### G.2 在 Rapier 骰子组件里挂接

```tsx
// components/Die.tsx
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useRef } from 'react';
import { useDiceAudioContext } from '../context/AudioCtx';

export function Die(props: { position: [number, number, number] }) {
  const ref = useRef<RapierRigidBody>(null!);
  const idRef = useRef(Math.random());
  const { playCollision } = useDiceAudioContext();

  return (
    <RigidBody
      ref={ref}
      colliders="cuboid"
      restitution={0.5}
      friction={0.6}
      onContactForce={({ totalForceMagnitude }) => {
        playCollision(idRef.current, totalForceMagnitude);
      }}
      {...props}
    >
      <mesh>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </RigidBody>
  );
}
```

### G.3 入口屏 unlock + 摇盅交互

```tsx
// app/page.tsx (Next.js 16 App Router)
'use client';
import { useState } from 'react';
import { useDiceAudio } from '@/hooks/useDiceAudio';

export default function Page() {
  const [theme, setTheme] = useState<'modern'>('modern');
  const audio = useDiceAudio(theme);
  const [shaking, setShaking] = useState(false);

  async function handleStart() {
    await audio.unlock();
    // iOS motion permission
    const DM = (window as any).DeviceMotionEvent;
    if (DM?.requestPermission) await DM.requestPermission();
  }

  function handleShakeStart() {
    setShaking(true);
    audio.startShake();
    const onMotion = (e: DeviceMotionEvent) => {
      audio.updateShake(audio.intensityFromMotion(e));
    };
    window.addEventListener('devicemotion', onMotion);
    // store on ref for cleanup
  }

  if (!audio.unlocked) {
    return <button onClick={handleStart}>点击进入大话骰</button>;
  }
  return (
    <main>
      <button onPointerDown={handleShakeStart}>按住摇骰</button>
      {/* ... R3F Canvas with <Die /> components ... */}
    </main>
  );
}
```

---

## H. iOS Autoplay Unlock 完整 Pattern

```ts
// utils/audio-unlock.ts
import { Howler } from 'howler';

let unlocked = false;

export function isUnlocked() { return unlocked; }

export async function unlockAudio(): Promise<boolean> {
  if (unlocked) return true;

  // 1. Resume AudioContext if suspended (most modern browsers)
  try {
    // @ts-ignore
    const ctx = Howler.ctx as AudioContext | undefined;
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  } catch (err) {
    console.warn('[audio] ctx.resume failed', err);
  }

  // 2. Play silent buffer (legacy iOS unlock pattern, belt-and-suspenders)
  try {
    // @ts-ignore
    const ctx = Howler.ctx as AudioContext | undefined;
    if (ctx) {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    }
  } catch {}

  // 3. iOS 13+ device motion permission (only fires inside user gesture)
  const DM = (window as any).DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') {
    try { await DM.requestPermission(); } catch {}
  }

  unlocked = true;
  return true;
}

// Auto-attach to first user gesture as belt-and-suspenders fallback
if (typeof window !== 'undefined') {
  const events = ['touchend', 'mousedown', 'keydown', 'pointerup'];
  const handler = () => {
    unlockAudio();
    events.forEach(e => window.removeEventListener(e, handler));
  };
  events.forEach(e => window.addEventListener(e, handler, { once: false, passive: true }));
}
```

**iOS 17 注意**：用 `touchend` / `pointerup` 而非 `touchstart`。Howler.js 默认行为已对，自己写代码时也要遵守。

---

## I. 文件组织 + 加载策略

```
public/audio/
├── modern.webm        // sprite合并 ~80KB
├── modern.mp3         // sprite合并 ~120KB (mp3 fallback)
├── classic.webm
├── classic.mp3
├── hongkong.webm
├── hongkong.mp3
├── cartoon.webm
└── cartoon.mp3
```

**生成 sprite 工具**：[audiosprite](https://github.com/tonistiigi/audiosprite) （仍然是事实标准）
```bash
npx audiosprite --output public/audio/modern --format howler \
  shake.wav collide_1.wav collide_2.wav ... open.wav
# 产出 modern.{webm,mp3} 和 sprite JSON 直接喂 Howl 构造器
```

**进入策略**：
1. 入口屏：只 preload 当前 theme 的 mp3 metadata
2. 用户选 theme 后：完整加载该 theme（~120KB，1-2s on 4G）
3. 进游戏：lazy preload 其它 3 个 theme 在 idle 时（`requestIdleCallback`）

---

## J. 验收清单

- [ ] iOS Safari (iPhone 真机) — 首次点击后所有 SFX 能播放
- [ ] Android Chrome — 摇晃时陀螺仪幅度联动 shake 音量变化
- [ ] 同时 5 颗骰子撞击 — 不音爆，每颗最多 50ms 一次
- [ ] 切换 theme — 1.5s 内加载完毕，旧 theme 的 audio buffer 被 `Howl.unload()` 释放
- [ ] 静音 toggle — 立即静音/取消，状态 persist 到 localStorage
- [ ] 全局音量条 — 0-1 平滑映射，persist
- [ ] 4 个 theme 各 10 个 SFX 都有声音、风格统一
- [ ] 总 audio bundle ≤ 500KB
- [ ] Lighthouse — Audio 不阻塞 LCP（preload 用 `metadata` 而非 `auto`）

---

## K. 参考 / 既有实现

- [3d-dice/dice-box](https://github.com/3d-dice/dice-box) — BabylonJS+AmmoJS 实现，社区 issue #120 正在加 collision sound（说明这是公认痛点）
- [3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs) — Three+Cannon-ES，已有 `sounds: false, volume: 100, sound_dieMaterial: 'plastic'` 接口
- [sarahRosannaBusch/dice](https://github.com/sarahRosannaBusch/dice) — 简洁参考
- [Howler.js README — Mobile/Chrome Playback 章节](https://github.com/goldfire/howler.js#mobilechrome-playback)
- [@react-three/rapier 文档](https://pmndrs.github.io/react-three-rapier/)
- [MDN — Web Audio Autoplay Guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [Matt Montag — Unlock Web Audio in Safari iOS](https://www.mattmontag.com/web/unlock-web-audio-in-safari-for-ios-and-macos)

---

## L. 落地步骤建议（开箱即用 1 天 demo）

1. **D+0** — 在 Freesound 下载列表里 #1, #4, #6, #11, #12 五个 CC0 文件（覆盖 80% 场景）
2. **D+0.5** — 用 [Audacity](https://www.audacityteam.org/) 切片：从 `eduardvlog #11` 切出 shake / collide / settle / clunk 四段
3. **D+0.5** — 用 [audiosprite](https://github.com/tonistiigi/audiosprite) 拼成 `classic.{webm,mp3}` + sprite JSON
4. **D+1** — 实现 `useDiceAudio` hook + 入口屏 unlock 按钮 + Rapier 接 `onContactForce`
5. **D+1.5** — 用 ElevenLabs 生 cartoon theme 全套（最难找的）
6. **D+2** — 现代极简 + 港风 theme 补足
7. **D+2.5** — 移动端真机测试，调阈值（`MIN_FORCE`, `MAX_FORCE`, debounce 时长）

---

**结语**：核心架构非常稳，关键风险点不在技术而在**美术风格统一**——4 个 theme 拼接 CC0 资源容易"味道不对"，预算 30% 时间在 ElevenLabs 补 + 后期 EQ 统一。
