import { Type } from "../deps/typebox.ts";

// Reference: https://microsoft.github.io/debug-adapter-protocol/specification

export const ProtocolMessage = Type.Object({
  seq: Type.Number(),
});

export const Request = Type.Composite([
  ProtocolMessage,
  Type.Object({
    type: Type.Literal("request"),
    command: Type.String(),
    arguments: Type.Optional(Type.Unknown()),
  }),
]);

export const Event = Type.Composite([
  ProtocolMessage,
  Type.Object({
    type: Type.Literal("event"),
    event: Type.String(),
    body: Type.Optional(Type.Unknown()),
  }),
]);

export const BaseResponse = Type.Composite([
  ProtocolMessage,
  Type.Object({
    type: Type.Literal("response"),
    request_seq: Type.Number(),
    command: Type.String(),
  }),
]);

export const Message = Type.Object({
  id: Type.Number(),
  format: Type.String(),
  variables: Type.Optional(Type.Record(Type.String(), Type.String())),
  sendTelemetry: Type.Optional(Type.Boolean()),
  showUser: Type.Optional(Type.Boolean()),
  url: Type.Optional(Type.Boolean()),
  urlLabel: Type.Optional(Type.Boolean()),
});

export const Response = Type.Intersect([
  BaseResponse,
  Type.Union([
    Type.Object({
      success: Type.Literal(true),
      body: Type.Optional(Type.Unknown()),
    }),
    Type.Object({
      success: Type.Literal(false),
      message: Type.String(),
      body: Type.Object({
        error: Type.Optional(Message),
      }),
    }),
  ]),
]);
