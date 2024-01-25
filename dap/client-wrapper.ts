import { Static, TSchema, TypeCheck, TypeCompiler } from "../deps/typebox.ts";
import { Client } from "./client.ts";
import { InvocationError, ProtocolError } from "./io.ts";
import { EventEmitter } from "../deps/event_emitter.ts";
import { getLogger } from "../logging.ts";

const logger = getLogger({ name: "client-wrapper" });

export type RequestSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  [request: string]: MethodSpec<TRequest, TResponse>;
};

export type RequestStub<T extends RequestSpec> = {
  [method in keyof T]: WrappedMethod<
    T[method]["request"],
    T[method]["response"]
  >;
};

type MethodSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  request: TRequest;
  response: TResponse;
};

type WrappedMethod<
  TRequest extends TSchema,
  TResponse extends TSchema,
> = (args: Static<TRequest>) => Promise<Static<TResponse>>;

export type EventSpec<T extends TSchema = TSchema> = {
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

type EventListener<T extends TSchema> = (event: Static<T>) => void;

type EmitterSpec<T extends EventSpec> = {
  [event in keyof T]: EventListener<T[event]>;
};

export type ClientStub<
  TRequest extends RequestSpec,
  TEvent extends EventSpec,
> = RequestStub<TRequest> & EventStub<TEvent>;

type CheckerTable<T extends EventSpec> = {
  [key in keyof T]: TypeCheck<T[key]>;
};

export function makeClientStub<
  TRequestSpec extends RequestSpec,
  TEventSpec extends EventSpec,
>(
  client: Client,
  requestSpec: TRequestSpec,
  eventSpec: TEventSpec,
): ClientStub<TRequestSpec, TEventSpec> {
  const requestStub = makeRequestStub(client, requestSpec);
  const eventStub = makeEventStub(client, eventSpec);

  return Object.assign({}, requestStub, eventStub);
}

function makeRequestStub<T extends RequestSpec>(
  client: Client,
  spec: T,
): RequestStub<T> {
  return Object.fromEntries(
    Object.entries(spec).map(([command, spec]) => {
      return [
        command,
        wrapRequest(client, command, spec.request, spec.response),
      ];
    }),
  ) as RequestStub<T>;
}

function makeEventStub<T extends EventSpec>(
  client: Client,
  spec: T,
): EventStub<T> {
  const emitter = new EventEmitter<EmitterSpec<T>>();
  const checkerTable = makeCheckerTable(spec);

  client.on("event", (message) => {
    const checker = checkerTable[message.event];
    if (checker === undefined) {
      logger.warning("Ignored unknown event", message.event);
      return;
    }

    if (!checker.Check(message.body)) {
      const errors = checker.Errors(message.body);
      logger.warning("Invalid event", message.event, [...errors], message.body);
      return;
    }

    emitter.emit(message.event, message.body);
  });

  return {
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}

function makeCheckerTable<T extends EventSpec>(
  schemaTable: T,
): CheckerTable<T> {
  return Object.fromEntries(
    Object.entries(schemaTable).map((
      [key, value],
    ) => [key, TypeCompiler.Compile(value)]),
  ) as CheckerTable<T>;
}

function wrapRequest<
  TRequest extends TSchema,
  TResponse extends TSchema,
>(
  client: Client,
  command: string,
  _requestSchema: TRequest,
  responseSchema: TResponse,
): WrappedMethod<TRequest, TResponse> {
  const responseChecker = TypeCompiler.Compile(responseSchema);
  return async (args: Static<TRequest>): Promise<Static<TResponse>> => {
    const response = await client.sendRequest(command, args);

    if (!response.success) {
      throw new InvocationError(
        response.message || "Unknown error",
        response.body?.error,
      );
    }

    if (!responseChecker.Check(response.body)) {
      throw new ProtocolError(
        `Invalid response from server: ${response.body}`,
      );
    }

    return response.body;
  };
}
