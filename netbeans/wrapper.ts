import { Static, TObject, TypeCheck, TypeCompiler } from "../deps/typebox.ts";
import { ClientConnection } from "./server.ts";
import { EventEmitter } from "../deps/event_emitter.ts";
import { MessageArg, ProtocolError } from "./io.ts";
import { getLogger } from "../logging.ts";

const logger = getLogger({ name: "netbeans/wrapper" });

export type CommandSpec<T extends TObject = TObject> = {
  [command: string]: T;
};

export type CommandStub<T extends CommandSpec> = {
  [command in keyof T]: WrappedCommand<T[command]>;
};

type WrappedCommand<T extends TObject> = (
  bufId: number,
  args: Static<T>,
) => Promise<void>;

export type FunctionSpec<
  TRequest extends TObject = TObject,
  TResponse extends TObject = TObject,
> = {
  [request: string]: {
    request: TRequest;
    response: TResponse;
  };
};

export type FunctionStub<T extends FunctionSpec> = {
  [fn in keyof T]: WrappedFunction<T[fn]["request"], T[fn]["response"]>;
};

type WrappedFunction<
  TRequest extends TObject = TObject,
  TResponse extends TObject = TObject,
> = (bufId: number, args: Static<TRequest>) => Promise<Static<TResponse>>;

export type EventSpec<T extends TObject = TObject> = {
  [event: string]: T;
};

export type EventStub<T extends EventSpec> = {
  on<Event extends keyof T>(
    event: Event,
    listener: EventListener<T[Event]>,
  ): void;

  off<Event extends keyof T>(
    event: Event,
    listener: EventListener<T[Event]>,
  ): void;

  once<Event extends keyof T>(
    event: Event,
    listener: EventListener<T[Event]>,
  ): void;
};

type EventListener<T extends TObject> = (
  bufId: number,
  event: Static<T>,
) => void;

export type ClientStub<
  TCommand extends CommandSpec,
  TFunction extends FunctionSpec,
  TEvent extends EventSpec,
> = CommandStub<TCommand> & FunctionStub<TFunction> & EventStub<TEvent>;

export function makeClientStub<
  TCommand extends CommandSpec,
  TFunction extends FunctionSpec,
  TEvent extends EventSpec,
>(
  client: ClientConnection,
  commandSpec: TCommand,
  functionSpec: TFunction,
  eventSpec: TEvent,
) {
  const commandStub = makeCommandStub(client, commandSpec);
  const functionStub = makeFunctionStub(client, functionSpec);
  const eventStub = makeEventStub(client, eventSpec);

  return Object.assign({}, commandStub, functionStub, eventStub);
}

function makeCommandStub<T extends CommandSpec>(
  client: ClientConnection,
  spec: T,
): CommandStub<T> {
  const cmdPairs = Object.entries(spec).map(([commandName, spec]) => {
    const wrapper = (bufId: number, args: Static<typeof spec>) => {
      const argArray = Object.keys(spec.properties).map(
        (argName) => args[argName],
      ) as MessageArg[];

      return client.command(bufId, commandName, argArray);
    };

    return [commandName, wrapper] as const;
  });

  return Object.fromEntries(cmdPairs) as CommandStub<T>;
}

export function makeFunctionStub<T extends FunctionSpec>(
  client: ClientConnection,
  spec: T,
): FunctionStub<T> {
  const fnPairs = Object.entries(spec).map(([fnName, spec]) => {
    const responseChecker = TypeCompiler.Compile(spec.response);
    const wrapper = async (
      bufId: number,
      args: Static<typeof spec["request"]>,
    ) => {
      const argArray = Object.keys(spec.request.properties).map(
        (argName) => args[argName],
      ) as MessageArg[];

      const responseArray = await client.call(bufId, fnName, argArray);

      const response: Record<string, unknown> = {};
      Object.keys(spec.response.properties).forEach((key, index) => {
        response[key] = responseArray[index];
      });

      if (!responseChecker.Check(response.body)) {
        throw new ProtocolError(
          `Invalid response from client: ${response}`,
        );
      }

      return response;
    };

    return [fnName, wrapper] as const;
  });

  return Object.fromEntries(fnPairs) as FunctionStub<T>;
}

type EventTable<T extends EventSpec> = {
  [key in keyof T]: {
    checker: TypeCheck<T[key]>;
    keys: string[];
  };
};

type EmitterSpec<T extends EventSpec> = {
  [event in keyof T]: EventListener<T[event]>;
};

function makeEventStub<T extends EventSpec>(
  client: ClientConnection,
  spec: T,
): EventStub<T> {
  const emitter = new EventEmitter<EmitterSpec<T>>();
  const checkerTable = makeEventTable(spec);

  client.on("event", (message) => {
    const eventInfo = checkerTable[message.name];
    if (eventInfo === undefined) {
      logger.warning("Dropping event", message);
      return;
    }

    const event: Record<string, MessageArg> = {};
    eventInfo.keys.forEach((key, index) => event[key] = message.args[index]);

    if (!eventInfo.checker.Check(event)) {
      const errors = eventInfo.checker.Errors(event);
      logger.warning("Invalid event", event, [...errors]);
      return;
    }

    logger.debug("Event", message.name, message.bufId, event);
    emitter.emit(message.name, message.bufId, event);
  });

  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}

function makeEventTable<T extends EventSpec>(
  schemaTable: T,
): EventTable<T> {
  const pairs = Object.entries(schemaTable).map((
    [key, spec],
  ) => {
    const checker = TypeCompiler.Compile(spec);
    const keys = Object.keys(spec.properties);

    return [key, { checker, keys }] as const;
  });

  return Object.fromEntries(pairs) as EventTable<T>;
}
