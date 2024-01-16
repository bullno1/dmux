export enum LogLevel {
  Debug,
  Info,
  Warning,
  Error,
}

export type LogContext = Record<string, unknown>;

export interface Sink {
  write(
    level: LogLevel,
    timestamp: number,
    context: LogContext,
    args: unknown[],
  ): void;
}

export class Logger {
  constructor(private sink: Sink, private context: LogContext) {}

  log(level: LogLevel, ...args: unknown[]): void {
    this.sink.write(level, Date.now(), this.context, args);
  }

  debug(...args: unknown[]): void {
    this.sink.write(LogLevel.Debug, Date.now(), this.context, args);
  }

  info(...args: unknown[]): void {
    this.sink.write(LogLevel.Info, Date.now(), this.context, args);
  }

  warning(...args: unknown[]): void {
    this.sink.write(LogLevel.Warning, Date.now(), this.context, args);
  }

  error(...args: unknown[]): void {
    this.sink.write(LogLevel.Error, Date.now(), this.context, args);
  }

  child(context: LogContext): Logger {
    return new Logger(this.sink, Object.assign({}, this.context, context));
  }
}

export const MessageStyleForLevel: Record<LogLevel, string> = {
  [LogLevel.Debug]: "color: gray",
  [LogLevel.Info]: "color: white",
  [LogLevel.Warning]: "color: yellow",
  [LogLevel.Error]: "color: red",
};

export const Console: Sink = {
  write(level, timestamp, context, args) {
    console.log(
      "%c[%d] [%s]%c %o",
      MessageStyleForLevel[level],
      timestamp,
      LogLevel[level],
      MessageStyleForLevel[LogLevel.Info],
      context,
      ...args,
    );
  },
};

export class ForwardSink implements Sink {
  constructor(public target: Sink) {}

  write(
    level: LogLevel,
    timestamp: number,
    context: LogContext,
    args: unknown[],
  ): void {
    this.target.write(level, timestamp, context, args);
  }
}

export const DefaultSink = new ForwardSink(Console);
export const DefaultLogger = new Logger(DefaultSink, {});
export const getLogger = DefaultLogger.child.bind(DefaultLogger);
