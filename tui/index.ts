import { concat } from "../deps/std/bytes.ts";
import { encodeText } from "../utils/text.ts";
import { keypress, KeyPressEvent } from "../deps/cliffy/keypress.ts";
import { pair, Sink, Source } from "./event.ts";
import { abortableAsyncIterable } from "../utils/abort.ts";
import { cursorShow } from "../deps/cliffy/ansi.ts";

export interface RenderContext {
  write(data: string | Uint8Array): void;
  endRender(): void;
}

export type Event =
  | { type: "done" }
  | { type: "refresh" }
  | { type: "keypress"; value: KeyPressEvent };

export interface TuiContext {
  nextEvent: Source<Event>;
  beginRender(): RenderContext;
}

export type Tui = (context: TuiContext) => Promise<void>;

export async function run(
  tui: Tui,
  eventSource?: Source<Event>,
): Promise<void> {
  let renderQueued = false;
  const buffer: Uint8Array[] = [];

  const render = () => {
    Deno.stdout.write(concat(buffer));
    renderQueued = false;
  };

  const renderCtx: RenderContext = {
    write: (data) => {
      if (typeof data === "string") {
        buffer.push(encodeText(data));
      } else {
        buffer.push(data);
      }
    },
    endRender: () => {
      if (!renderQueued) {
        renderQueued = true;
        queueMicrotask(render);
      }
    },
  };

  let sink: Sink<Event> = () => {};
  if (eventSource === undefined) {
    const pair = makeEventSource();
    eventSource = pair[0];
    sink = pair[1];
  }
  const ctx: TuiContext = {
    nextEvent: eventSource,
    beginRender: () => {
      buffer.length = 0;
      return renderCtx;
    },
  };

  try {
    await tui(ctx);
    Deno.stdout.write(encodeText(cursorShow));
  } finally {
    sink({ type: "done" });
  }
}

export function makeEventSource(
  signal?: AbortSignal,
): [Source<Event>, Sink<Event>] {
  const [source, sink] = pair<Event>();

  if (signal) {
    signal.addEventListener("abort", () => {
      sink({ type: "done" });
    });
  }

  (async () => {
    for await (const event of abortableAsyncIterable(keypress(), signal)) {
      if (event.ctrlKey && event.key === "c") {
        sink({ type: "done" });
        break;
      } else {
        sink({ type: "keypress", value: event });
      }
    }
  })();

  return [source, sink];
}
