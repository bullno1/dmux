import { MessageReader, writeMessage } from "./io.ts";
import { Response as ResponseSchema } from "./schema.ts";
import { Static } from "../deps/typebox.ts";

interface Deferred<T> {
  resolve(result: T): void;
  reject(error: Error): void;
}

type Response = Static<typeof ResponseSchema>;

export class Client {
  private requestSeq = 0;
  private pendingRequests = new Map<number, Deferred<Response>>();
  private messageReader: MessageReader;
  private abortController: AbortController | null = null;
  private readLoopPromise: Promise<void> | null = null;

  constructor(
    private requestWriter: WritableStreamDefaultWriter<Uint8Array>,
    responseReader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
    this.messageReader = new MessageReader(responseReader);
  }

  async sendRequest(command: string, args: unknown): Promise<Response> {
    if (this.readLoopPromise === null) {
      this.abortController = new AbortController();
      this.readLoopPromise = this.readLoop(this.abortController.signal).catch(
        (e) => {
          this.terminatePendingRequests(
            new ClientError("Read loop error", { cause: e }),
          );
        },
      ).finally(() => {
        this.terminatePendingRequests(new ClientError("Read loop terminated"));
        this.abortController = null;
        this.readLoopPromise = null;
      });
    }

    const requestSeq = this.requestSeq++;

    const result = new Promise<Response>((resolve, reject) => {
      this.pendingRequests.set(requestSeq, { resolve, reject });
    });

    await writeMessage(this.requestWriter, {
      seq: requestSeq,
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
  }

  private async readLoop(abortSignal: AbortSignal): Promise<void> {
    while (!abortSignal.aborted) {
      const message = await this.messageReader.read();
      switch (message.type) {
        case "event":
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
