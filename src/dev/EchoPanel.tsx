import { useCallback, useEffect, useRef, useState } from 'react';
import { host } from '../host';
import type { BridgeMessage } from '../../shared/types';

interface LogEntry {
  id: number;
  text: string;
}

const PROVIDER = 'chatgpt';
const AUTOTEST = import.meta.env.VITE_M1_AUTOTEST === '1';
// Module-level guard: StrictMode double-mounts effects in dev; the gate must run once.
let autotestStarted = false;

export function EchoPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const nextLogId = useRef(1);

  const appendLog = useCallback((text: string) => {
    setLogs((current) => [{ id: nextLogId.current++, text }, ...current].slice(0, 30));
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void host.bridge.subscribe((message) => {
      if (!disposed) appendLog(formatMessage(message));
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [appendLog]);

  useEffect(() => {
    if (!AUTOTEST || autotestStarted) return;
    autotestStarted = true;
    const rect = panelRef.current?.getBoundingClientRect() ?? new DOMRect(24, 24, 960, 720);
    void runM1Gate(rect, appendLog);
  }, [appendLog]);

  const openWebview = async () => {
    const rect = panelRef.current?.getBoundingClientRect() ?? new DOMRect(24, 24, 960, 720);
    try {
      const state = await host.provider.open(PROVIDER, rect);
      appendLog(`open ${state.provider}: ${state.webview}`);
    } catch (error) {
      appendLog(`open failed: ${String(error)}`);
    }
  };

  const pingTitle = async () => {
    const sentAt = performance.now();
    await evalInProvider(
      `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.emitTitle("STATUS_REPORT", { echo: "title", sentAt: ${sentAt} });`,
      'ping title sent',
    );
  };

  const bulkEcho = async (size: number) => {
    const sentAt = performance.now();
    await evalInProvider(
      `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.sendBulk("ECHO_BULK", { echo: "bulk", size: ${size}, sentAt: ${sentAt}, data: "x".repeat(${size}) });`,
      `bulk ${Math.round(size / 1024)}KB sent`,
    );
  };

  const callbackEcho = async (size: number) => {
    const sentAt = performance.now();
    try {
      const result = await host.provider.evalWithCallback(
        PROVIDER,
        `({ echo: "callback", size: ${size}, sentAt: ${sentAt}, data: "x".repeat(${size}) })`,
      );
      const elapsed = Math.round(performance.now() - sentAt);
      appendLog(`callback ${Math.round(size / 1024)}KB ${elapsed}ms result=${result.length} chars`);
    } catch (error) {
      appendLog(`callback failed: ${String(error)}`);
    }
  };

  const evalInProvider = async (js: string, success: string) => {
    try {
      await host.provider.eval(PROVIDER, js);
      appendLog(success);
    } catch (error) {
      appendLog(`eval failed: ${String(error)}`);
    }
  };

  return (
    <div ref={panelRef} className="w-full max-w-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex flex-wrap gap-2">
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={openWebview}>
          Open chatgpt webview
        </button>
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={pingTitle}>
          Ping (title)
        </button>
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={() => void bulkEcho(16 * 1024)}>
          Bulk echo 16KB
        </button>
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={() => void bulkEcho(192 * 1024)}>
          Bulk echo 192KB
        </button>
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={() => void callbackEcho(16 * 1024)}>
          Callback 16KB
        </button>
        <button className="border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800" onClick={() => void callbackEcho(192 * 1024)}>
          Callback 192KB
        </button>
      </div>
      <ol className="mt-3 max-h-52 space-y-1 overflow-auto text-left text-xs text-zinc-300">
        {logs.map((log) => (
          <li key={log.id} className="border-t border-zinc-800 pt-1">
            {log.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatMessage(message: BridgeMessage): string {
  const payload = message.payload as { sentAt?: number; size?: number; echo?: string } | undefined;
  const elapsed = typeof payload?.sentAt === 'number' ? ` ${Math.round(performance.now() - payload.sentAt)}ms` : '';
  const size = typeof payload?.size === 'number' ? ` ${Math.round(payload.size / 1024)}KB` : '';
  const echo = payload?.echo ? ` ${payload.echo}` : '';
  return `${message.provider ?? 'unknown'} ${message.transport ?? 'bridge'} ${message.action}${echo}${size}${elapsed}`;
}

// --- M1 live-gate autotest (VITE_M1_AUTOTEST=1) -------------------------------
// Runs the Phase B gate sequence headlessly: open webview -> wait for bridge ->
// title pings -> outbox-pulled bulk echoes -> eval_with_callback echoes. Every result
// line goes to the panel log and, via dev_log, to the `pnpm tauri dev` stdout
// with an [M1GATE] prefix so a background runner can scrape it.

interface EchoPayload {
  echo?: string;
  size?: number;
  sentAt?: number;
  data?: string;
}

interface Waiter {
  predicate: (message: BridgeMessage) => boolean;
  resolve: (message: BridgeMessage) => void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isEcho(payload: unknown, echo: string): payload is EchoPayload {
  return typeof payload === 'object' && payload !== null && (payload as EchoPayload).echo === echo;
}

function stats(samples: number[]): string {
  if (samples.length === 0) return 'min=- med=- max=-';
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return `min=${sorted[0]}ms med=${median}ms max=${sorted[sorted.length - 1]}ms`;
}

async function runM1Gate(rect: DOMRect, appendLog: (text: string) => void) {
  const log = async (text: string) => {
    appendLog(`[M1GATE] ${text}`);
    try {
      await host.dev.log(`[M1GATE] ${text}`);
    } catch {
      // stdout mirroring is best-effort
    }
  };

  const waiters = new Set<Waiter>();
  const unlisten = await host.bridge.subscribe((message) => {
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  });
  const waitFor = (predicate: Waiter['predicate'], timeoutMs: number): Promise<BridgeMessage | null> =>
    new Promise((resolve) => {
      const waiter: Waiter = {
        predicate,
        resolve: (message) => {
          window.clearTimeout(timer);
          resolve(message);
        },
      };
      const timer = window.setTimeout(() => {
        waiters.delete(waiter);
        resolve(null);
      }, timeoutMs);
      waiters.add(waiter);
    });
  const finish = async (status: string) => {
    await log(`DONE status=${status}`);
    unlisten();
    try {
      await host.dev.log('__M1GATE_EXIT__');
    } catch {
      // app exit is best-effort
    }
  };
  const titlePing = async (): Promise<{ elapsed: number; bootId?: string } | null> => {
    const sentAt = performance.now();
    const reply = waitFor((m) => m.action === 'STATUS_REPORT' && isEcho(m.payload, 'title'), 4000);
    try {
      await host.provider.eval(
        PROVIDER,
        `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.emitTitle("STATUS_REPORT", { echo: "title", sentAt: ${sentAt} });`,
      );
    } catch {
      // reported as timeout below
    }
    const message = await reply;
    return message ? { elapsed: Math.round(performance.now() - sentAt), bootId: message.bootId } : null;
  };

  await log('start');
  try {
    const state = await host.provider.open(PROVIDER, rect);
    await log(`webview open: ${state.webview}`);
  } catch (error) {
    await log(`open failed: ${String(error)}`);
    await finish('abort-open');
    return;
  }

  // 1. Wait for page load + bootstrap injection to come alive.
  let bootIdBefore: string | undefined;
  let alive = false;
  for (let attempt = 1; attempt <= 15 && !alive; attempt++) {
    const pong = await titlePing();
    if (pong !== null) {
      alive = true;
      bootIdBefore = pong.bootId;
      await log(`bridge alive attempt=${attempt} ${pong.elapsed}ms bootId=${pong.bootId ?? 'n/a'}`);
    } else {
      await sleep(1500);
    }
  }
  if (!alive) {
    await log('bridge never came alive after 15 attempts');
    await finish('fail-alive');
    return;
  }

  // 2. Title ping latency x10, spaced past the >=1s STATUS_REPORT merge window.
  const pings: number[] = [];
  for (let i = 1; i <= 10; i++) {
    await sleep(1200);
    const pong = await titlePing();
    if (pong !== null) {
      pings.push(pong.elapsed);
      await log(`ping i=${i} ${pong.elapsed}ms`);
    } else {
      await log(`ping i=${i} TIMEOUT`);
    }
  }
  await log(`ping summary ok=${pings.length}/10 ${stats(pings)}`);

  // 3. Outbox-pulled bulk echoes (16KB x3, 192KB x4).
  const bulkRun = async (label: string, size: number, rounds: number, timeoutMs: number) => {
    const times: number[] = [];
    for (let i = 1; i <= rounds; i++) {
      const sentAt = performance.now();
      // ECHO_BULK is a dev-only action outside the SPEC MessageAction union.
      const reply = waitFor(
        (m) => (m.action as string) === 'ECHO_BULK' && isEcho(m.payload, 'bulk') && m.payload.size === size,
        timeoutMs,
      );
      try {
        await host.provider.eval(
          PROVIDER,
          `window.__MAC_BRIDGE__ && window.__MAC_BRIDGE__.sendBulk("ECHO_BULK", { echo: "bulk", size: ${size}, sentAt: ${sentAt}, data: "x".repeat(${size}) });`,
        );
      } catch (error) {
        await log(`${label} i=${i} eval failed: ${String(error)}`);
        continue;
      }
      const message = await reply;
      if (message) {
        const elapsed = Math.round(performance.now() - sentAt);
        const dataOk = isEcho(message.payload, 'bulk') && message.payload.data?.length === size;
        times.push(elapsed);
        await log(`${label} i=${i} ${elapsed}ms dataOk=${dataOk}`);
      } else {
        await log(`${label} i=${i} TIMEOUT`);
      }
    }
    await log(`${label} summary ok=${times.length}/${rounds} ${stats(times)}`);
    return times.length;
  };
  const bulk16 = await bulkRun('bulk16', 16 * 1024, 3, 15000);
  const bulk192 = await bulkRun('bulk192', 192 * 1024, 4, 30000);

  // 4. eval_with_callback echoes (16KB x3, 192KB x6 for reliability confidence).
  const callbackRun = async (label: string, size: number, rounds: number) => {
    const times: number[] = [];
    for (let i = 1; i <= rounds; i++) {
      const sentAt = performance.now();
      try {
        const result = await host.provider.evalWithCallback(
          PROVIDER,
          `({ echo: "callback", size: ${size}, sentAt: ${sentAt}, data: "x".repeat(${size}) })`,
        );
        const elapsed = Math.round(performance.now() - sentAt);
        times.push(elapsed);
        await log(`${label} i=${i} ${elapsed}ms result=${result.length} chars lengthOk=${result.length >= size}`);
      } catch (error) {
        await log(`${label} i=${i} FAILED: ${String(error)}`);
      }
      await sleep(250);
    }
    await log(`${label} summary ok=${times.length}/${rounds} ${stats(times)}`);
    return times.length;
  };
  const cb16 = await callbackRun('callback16', 16 * 1024, 3);
  const cb192 = await callbackRun('callback192', 192 * 1024, 6);

  // 5. Hard reload: bootstrap must re-arm with a fresh bootId (SPEC §7.2).
  let rearm = 'FAIL';
  try {
    await host.provider.eval(PROVIDER, 'location.reload();');
    await sleep(4000);
    for (let attempt = 1; attempt <= 10 && rearm === 'FAIL'; attempt++) {
      const pong = await titlePing();
      if (pong !== null) {
        const rotated = pong.bootId !== undefined && pong.bootId !== bootIdBefore;
        rearm = rotated ? 'ok-rotated' : 'ok-same-bootId';
        await log(
          `rearm attempt=${attempt} ${pong.elapsed}ms bootId ${bootIdBefore ?? 'n/a'} -> ${pong.bootId ?? 'n/a'} (${rearm})`,
        );
      } else {
        await sleep(1500);
      }
    }
  } catch (error) {
    await log(`rearm eval failed: ${String(error)}`);
  }

  const verdict =
    bulk16 === 0 && bulk192 === 0
      ? 'bulk-pull-fail'
      : bulk16 === 3 && bulk192 === 4 && cb192 === 6
        ? 'bulk-pull-strong'
        : bulk16 >= 2 && bulk192 >= 3 && cb192 >= 4
          ? 'bulk-pull-flaky'
          : 'bulk-pull-weak';
  await log(
    `verdict ping=${pings.length}/10 bulk16=${bulk16}/3 bulk192=${bulk192}/4 cb16=${cb16}/3 cb192=${cb192}/6 rearm=${rearm} => ${verdict}`,
  );
  await finish('complete');
}
