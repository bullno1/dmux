import { Static, TSchema } from "../deps/typebox.ts";
import { ClientConnection, ServerHandler } from "./server.ts";
import { Client } from "./client.ts";
import { InvocationError } from "./io.ts";

export type WrapperFn<
  TRequest extends TSchema,
  TResponse extends TSchema,
> = (
  client: ClientConnection,
  args: Static<TRequest>,
) => Promise<Static<TResponse>>;

export type ProtocolSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  [request: string]: RequestSpec<TRequest, TResponse>;
};

type RequestSpec<
  TRequest extends TSchema = TSchema,
  TResponse extends TSchema = TSchema,
> = {
  request: TRequest;
  response: TResponse;
};

type WrappedRequest<T extends RequestSpec> = T extends
  RequestSpec<infer TRequest, infer TResponse> ? WrapperFn<TRequest, TResponse>
  : never;

export type Stub<T extends ProtocolSpec> = {
  [request in keyof T]: WrappedRequest<T[request]>;
};

export type RequestHandler = ServerHandler["onRequest"];

export function makeRequestHandler<T extends ProtocolSpec>(
  stub: Stub<T>,
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
      throw new InvocationError(response.message, response?.body?.error);
    }
  };
}
