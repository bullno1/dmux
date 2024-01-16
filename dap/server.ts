import { getLogger, Logger } from "../logging.ts";
import { MessageReader, UnexpectedMessage, writeMessage } from "./io.ts";

export interface ClientConnection {
  sendEvent(type: string, body: unknown): Promise<void>;
  disconnect(): void;
}

export interface ServerHandler {
  onConnect(connection: ClientConnection): Promise<void>;
  onDisconnect(connection: ClientConnection): Promise<void>;
  onShutdown(): Promise<void>;
  onRequest(
    connection: ClientConnection,
    command: string,
    args: unknown,
  ): Promise<unknown>;
}

export async function runServer(
  listener: Deno.Listener,
  handler: ServerHandler,
  abortSignal?: AbortSignal,
): Promise<void> {
  const clientPromises = new Set<Promise<void>>();

  while (!abortSignal?.aborted) {
    const newConnection = await listener.accept();

    const clientLogger = getLogger({
      name: `dap/client/${newConnection.rid}`,
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

async function handleClient(
  handler: ServerHandler,
  connection: Deno.Conn,
  logger: Logger,
  serverAbortSignal?: AbortSignal,
): Promise<void> {
  const connectionAbortController = new AbortController();
  let seq = 0;
  const reader = connection.readable.getReader();
  const writer = connection.writable.getWriter();
  const connectionImpl: ClientConnection = {
    sendEvent: (type, body) => {
      return writeMessage(writer, {
        type: "event",
        seq: seq++,
        event: type,
        body: body,
      });
    },

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

  try {
    await handler.onConnect(connectionImpl);
    logger.info("Session started");

    while (
      !(connectionAbortController.signal.aborted || serverAbortSignal?.aborted)
    ) {
      const message = await Promise.race([
        messageReader.read(),
        waitForAbort,
      ]);
      if (message === null) break;

      switch (message.type) {
        case "request":
          // Do not await to allow overlapping requests
          handler.onRequest(connectionImpl, message.command, message.arguments)
            .then(
              (result) => {
                return writeMessage(writer, {
                  type: "response",
                  success: true,
                  seq: seq++,
                  request_seq: message.seq,
                  command: message.command,
                  body: result,
                });
              },
              (error) => {
                logger.error(error);
                return writeMessage(writer, {
                  type: "response",
                  success: false,
                  seq: seq++,
                  request_seq: message.seq,
                  command: message.command,
                  message: error instanceof Error
                    ? error.message
                    : "Unknown error",
                });
              },
            ).catch((err) => {
              logger.error(err);
              connectionAbortController.abort();
            });
          break;
        default:
          throw new UnexpectedMessage("Client sent unexpected message");
      }
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
      connectionImpl.disconnect(),
      handler.onDisconnect(connectionImpl),
    ]);
  }
}
