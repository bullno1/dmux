import { MessageReader, writeMessage } from "./io.ts";
import { Event as EventSchema, Response as ResponseSchema } from "./schema.ts";
import { Static } from "../deps/typebox.ts";
import { EventEmitter } from "../deps/event_emitter.ts";
import { waitForAbort } from "../utils/abort.ts";

interface Deferred<T> {
  resolve(result: T): void;
  reject(error: Error): void;
}

type Response = Static<typeof ResponseSchema>;

export type ServerEvent = Static<typeof EventSchema>;

interface ClientEvents {
  event: (message: ServerEvent) => void;
  error: (error: Error) => void;
}

export class Client extends EventEmitter<ClientEvents> {
  private messageSeq = 0;
  private pendingRequests = new Map<number, Deferred<Response>>();
  private messageReader: MessageReader;
  private abortController: AbortController | null = null;
  private readLoopPromise: Promise<void> | null = null;

  constructor(
    private requestWriter: WritableStreamDefaultWriter<Uint8Array>,
    private responseReader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    super();
    this.messageReader = new MessageReader(responseReader);
  }

  async sendRequest(command: string, args: unknown): Promise<Response> {
    if (this.readLoopPromise === null) {
      this.abortController = new AbortController();
      this.readLoopPromise = this.readLoop(this.abortController.signal).catch(
        (e: unknown) => {
          const error = new ClientError("Read loop error", { cause: e });
          this.emit("error", error);
          this.terminatePendingRequests(error);
        },
      ).finally(() => {
        this.terminatePendingRequests(new ClientError("Read loop terminated"));
        this.abortController = null;
        this.readLoopPromise = null;
      });
    }

    const messageSeq = this.messageSeq++;

    const result = new Promise<Response>((resolve, reject) => {
      this.pendingRequests.set(messageSeq, { resolve, reject });
    });

    await writeMessage(this.requestWriter, {
      seq: messageSeq,
      type: "request",
      command: command,
      arguments: args,
    });

    return result;
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.readLoopPromise) {
      await this.readLoopPromise;
      this.readLoopPromise = null;
    }

    await Promise.allSettled([
      this.requestWriter.close(),
      this.responseReader.cancel(),
    ]);
  }

  private async readLoop(abortSignal: AbortSignal): Promise<void> {
    const abortPromise = waitForAbort(abortSignal, null);
    while (!abortSignal.aborted) {
      const message = await Promise.race([
        this.messageReader.read(),
        abortPromise,
      ]);
      if (message === null) break;

      switch (message.type) {
        case "event":
          this.emit("event", message);
          break;
        case "response":
          {
            const requestSeq = message.request_seq;
            const deferred = this.pendingRequests.get(requestSeq);
            if (deferred !== undefined) {
              this.pendingRequests.delete(requestSeq);
              deferred.resolve(message);
            }
          }
          break;
        case "request":
          break;
      }
    }
  }

  private terminatePendingRequests(error: Error) {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(error);
    }
    this.pendingRequests.clear();
  }
}

export class ClientError extends Error {}
