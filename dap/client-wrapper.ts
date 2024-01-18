import { Static, TSchema, TypeCompiler } from "../deps/typebox.ts";
import { Client } from "./client.ts";
import { InvocationError, ProtocolError } from "./io.ts";

export type WrapperFn<
  TRequest extends TSchema,
  TResponse extends TSchema,
> = (args: Static<TRequest>) => Promise<Static<TResponse>>;

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

export function makeClientStub<T extends ProtocolSpec>(
  client: Client,
  spec: T,
): Stub<T> {
  return Object.fromEntries(
    Object.entries(spec).map(([command, spec]) => {
      return [
        command,
        wrapRequest(client, command, spec.request, spec.response),
      ];
    }),
  ) as Stub<T>;
}

function wrapRequest<
  TRequest extends TSchema,
  TResponse extends TSchema,
>(
  client: Client,
  command: string,
  _requestSchema: TRequest,
  responseSchema: TResponse,
): WrapperFn<TRequest, TResponse> {
  const responseChecker = TypeCompiler.Compile(responseSchema);
  return async (args) => {
    const response = await client.sendRequest(command, args);

    if (!response.success) {
      throw new InvocationError(response.message, response.body?.error);
    }

    if (!responseChecker.Check(response.body)) {
      console.log(response);
      throw new ProtocolError(
        `Invalid response from server: ${response.body}`,
      );
    }

    return response.body;
  };
}
