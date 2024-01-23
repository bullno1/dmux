import { Static, TSchema } from "../deps/typebox.ts";
import { ClientConnection, ServerHandler } from "./server.ts";
import { Client } from "./client.ts";
import { InvocationError } from "./io.ts";

export type RequestSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  [request: string]: MethodSpec<TRequest, TResponse>;
};

export type RequestStub<T extends RequestSpec> = {
  [request in keyof T]: WrappedMethod<
    T[request]["request"],
    T[request]["response"]
  >;
};

export type EventSpec<T extends TSchema = TSchema> = {
  [event: string]: T;
};

type WrappedMethod<
  TRequest extends TSchema,
  TResponse extends TSchema,
> = (
  client: ClientConnection,
  args: Static<TRequest>,
) => Promise<Static<TResponse>>;

type MethodSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  request: TRequest;
  response: TResponse;
};

export type RequestHandler = ServerHandler["onRequest"];

export function makeRequestHandler<T extends RequestSpec>(
  stub: RequestStub<T>,
  fallback: RequestHandler,
): RequestHandler {
  return (connection, command, args) => {
    if (command in stub) {
      const commandHandler = stub[command];
      return commandHandler(connection, args);
    } else {
      return fallback(connection, command, args);
    }
  };
}

export function makeReverseProxy(client: Client): RequestHandler {
  return async (_connection, command, args) => {
    const response = await client.sendRequest(command, args);
    if (response.success) {
      return response.body;
    } else {
      throw new InvocationError(
        response.message || "Unknown error",
        response?.body?.error,
      );
    }
  };
}
