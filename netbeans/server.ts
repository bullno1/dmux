import { getLogger, Logger } from "../logging.ts";
import {
  MessageArg,
  MessageReader,
  ProtocolError,
  writeMessage,
} from "./io.ts";
import { EventEmitter } from "../deps/event_emitter.ts";

export interface Event {
  bufId: number;
  name: string;
  args: MessageArg[];
}

export interface ClientConnection {
  readonly id: number;
  command(bufId: number, name: string, args: MessageArg[]): Promise<void>;
  call(bufId: number, name: string, args: MessageArg[]): Promise<MessageArg[]>;
  on(event: "event", handler: (event: Event) => void): void;
  off(event: "event", handler: (event: Event) => void): void;
  once(event: "event", handler: (event: Event) => void): void;
  disconnect(): void;
}

export interface ServerHandler {
  onConnect(connection: ClientConnection, password: string): Promise<boolean>;
  onDisconnect(connection: ClientConnection): Promise<void>;
  onShutdown(): Promise<void>;
}

export async function runServer(
  listener: Deno.Listener,
  handler: ServerHandler,
  abortSignal?: AbortSignal,
): Promise<void> {
  const clientPromises = new Set<Promise<void>>();
  const abortPromise = new Promise<null>((resolve) => {
    abortSignal?.addEventListener("abort", () => resolve(null));
  });

  while (!abortSignal?.aborted) {
    const newConnection = await Promise.race([
      listener.accept(),
      abortPromise,
    ]);
    if (newConnection === null) {
      break;
    }

    const clientLogger = getLogger({
      name: `netbeans/client/${newConnection.rid}`,
    });

    const clientPromise = handleClient(
      handler,
      newConnection,
      clientLogger,
      abortSignal,
    );
    clientPromises.add(clientPromise);

    clientPromise.catch((e) => {
      clientLogger.error(e);
    }).finally(() => {
      clientPromises.delete(clientPromise);
    });
  }

  await Promise.allSettled([
    handler.onShutdown(),
    ...clientPromises,
  ]);
}

interface Deferred<T> {
  resolve(result: T): void;
  reject(error: Error): void;
}

async function handleClient(
  handler: ServerHandler,
  connection: Deno.Conn,
  logger: Logger,
  serverAbortSignal?: AbortSignal,
): Promise<void> {
  const connectionAbortController = new AbortController();
  let seq = 0;
  let onConnectCalled = false;
  const pendingCalls = new Map<number, Deferred<MessageArg[]>>();
  const reader = connection.readable.getReader();
  const writer = connection.writable.getWriter();
  const emitter = new EventEmitter<{ event(event: Event): void }>();

  const connectionImpl: ClientConnection = {
    id: connection.rid,

    command: (bufId, name, args) => {
      return writeMessage(writer, {
        type: "command",
        seqNo: seq++,
        bufId,
        name,
        args,
      });
    },

    call: async (bufId, name, args) => {
      const callSeq = seq++;
      const result = new Promise<MessageArg[]>((resolve, reject) => {
        pendingCalls.set(callSeq, { resolve, reject });
      });

      await writeMessage(writer, {
        type: "function",
        seqNo: callSeq,
        bufId,
        name,
        args,
      });

      return result;
    },

    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),

    disconnect: () => {
      connectionAbortController.abort();
    },
  };

  const messageReader = new MessageReader(reader);
  const waitForAbort = new Promise<null>((resolve) => {
    const abort = () => resolve(null);
    connectionAbortController.signal.addEventListener("abort", abort);
    serverAbortSignal?.addEventListener("abort", abort);
  });

  logger.info("Session started");

  try {
    {
      // TODO: AUTH timeout
      const message = await Promise.race([
        messageReader.read(),
        waitForAbort,
      ]);
      if (message === null) return;

      if (message.type !== "auth") {
        throw new ProtocolError("No authentication");
      }

      const allowed = await handler.onConnect(connectionImpl, message.password);
      onConnectCalled = true;
      if (!allowed) return;
    }

    while (
      !(connectionAbortController.signal.aborted || serverAbortSignal?.aborted)
    ) {
      const message = await Promise.race([
        messageReader.read(),
        waitForAbort,
      ]);
      if (message === null) break;

      switch (message.type) {
        case "event":
          emitter.emit("event", {
            bufId: message.bufId,
            name: message.name,
            args: message.args,
          });
          break;
        case "reply":
          {
            const deferred = pendingCalls.get(message.seqNo);
            if (deferred !== undefined) {
              pendingCalls.delete(message.seqNo);
              deferred.resolve(message.result);
            }
          }
          break;
        default:
          throw new ProtocolError("Unexpected message type");
      }
    }

    const error = new CallError("Client disconnected");
    for (const deferred of pendingCalls.values()) {
      deferred.reject(error);
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.UnexpectedEof)) {
      throw e;
    }
  } finally {
    logger.info("Session ended");

    await Promise.allSettled([
      reader.cancel(),
      writer.close(),
      onConnectCalled
        ? handler.onDisconnect(connectionImpl)
        : Promise.resolve(),
    ]);
  }
}

export class CallError extends ProtocolError {}
