import { DefaultSink, LogContext, LogLevel, Sink } from "../logging.ts";
import { ClientStub } from "../dap/client-wrapper.ts";
import { EventSpec, RequestSpec } from "../dmux/schema.ts";

export type DmuxClient = ClientStub<typeof RequestSpec, typeof EventSpec>;

export class DmuxSink implements Sink {
  constructor(private client: DmuxClient) {
  }

  write(
    level: LogLevel,
    timestamp: number,
    context: LogContext,
    args: unknown[],
  ): void {
    this.client["dmux/log"]({ level, timestamp, context, args });
  }
}

export function forwardLogToServer(client: DmuxClient) {
  DefaultSink.target = new DmuxSink(client);
}
