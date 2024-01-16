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

export const InitializeRequestArguments = Type.Object({
  clientID: Type.Optional(Type.String()),
  clientName: Type.Optional(Type.String()),
  adapterID: Type.String(),
  locale: Type.Optional(Type.String()),
  linesStartAt1: Type.Optional(Type.Boolean()),
  columnStartAt1: Type.Optional(Type.Boolean()),
  pathFormat: Type.Optional(Type.String()),
  supportsVariableType: Type.Optional(Type.Boolean()),
  supportsVariablePaging: Type.Optional(Type.Boolean()),
  supportsRunInTerminalRequest: Type.Optional(Type.Boolean()),
  supportsMemoryReferences: Type.Optional(Type.Boolean()),
  supportsProgressReporting: Type.Optional(Type.Boolean()),
  supportsInvalidatedEvent: Type.Optional(Type.Boolean()),
  supportsMemoryEvent: Type.Optional(Type.Boolean()),
  supportsArgsCanBeInterpretedByShell: Type.Optional(Type.Boolean()),
  supportsStartDebuggingRequest: Type.Optional(Type.Boolean()),
});

export const ExceptionBreakpointsFilter = Type.Object({
  filter: Type.String(),
  label: Type.String(),
  description: Type.Optional(Type.String()),
  default: Type.Optional(Type.Boolean()),
  supportsCondition: Type.Optional(Type.Boolean()),
  conditionDescription: Type.Optional(Type.String()),
});

export const ColumnDescriptor = Type.Object({
  attributeName: Type.String(),
  label: Type.String(),
  format: Type.Optional(Type.String()),
  type: Type.Optional(
    Type.Union([
      Type.Literal("string"),
      Type.Literal("number"),
      Type.Literal("boolean"),
      Type.Literal("unixTimestampUTC"),
    ]),
  ),
  width: Type.Optional(Type.Number()),
});

export const ChecksumAlgorithm = Type.Union([
  Type.Literal("MD5"),
  Type.Literal("SHA1"),
  Type.Literal("SHA256"),
  Type.Literal("timestamp"),
]);

export const Capabilities = Type.Object({
  supportsConfigurationDoneRequest: Type.Optional(Type.Boolean()),
  supportsFunctionBreakpoints: Type.Optional(Type.Boolean()),
  supportsConditionalBreakpoints: Type.Optional(Type.Boolean()),
  supportsHitConditionalBreakpoints: Type.Optional(Type.Boolean()),
  supportsEvaluateForHovers: Type.Optional(Type.Boolean()),
  exceptionBreakpointFilters: Type.Optional(
    Type.Array(ExceptionBreakpointsFilter),
  ),
  supportsStepBack: Type.Optional(Type.Boolean()),
  supportsSetVariable: Type.Optional(Type.Boolean()),
  supportsRestartFrame: Type.Optional(Type.Boolean()),
  supportsGotoTargetsRequest: Type.Optional(Type.Boolean()),
  supportsStepInTargetsRequest: Type.Optional(Type.Boolean()),
  supportsCompletionsRequest: Type.Optional(Type.Boolean()),
  completionTriggerCharacters: Type.Optional(Type.Array(Type.String())),
  supportsModulesRequest: Type.Optional(Type.Boolean()),
  additionalModuleColumns: Type.Optional(Type.Array(ColumnDescriptor)),
  supportedChecksumAlgorithms: Type.Optional(Type.Array(ChecksumAlgorithm)),
  supportsRestartRequest: Type.Optional(Type.Boolean()),
  supportsExceptionOptions: Type.Optional(Type.Boolean()),
  supportsValueFormattingOptions: Type.Optional(Type.Boolean()),
  supportsExceptionInfoRequest: Type.Optional(Type.Boolean()),
  supportTerminateDebuggee: Type.Optional(Type.Boolean()),
  supportSuspendDebuggee: Type.Optional(Type.Boolean()),
  supportsDelayedStackTraceLoading: Type.Optional(Type.Boolean()),
  supportsLoadedSourcesRequest: Type.Optional(Type.Boolean()),
  supportsLogPoints: Type.Optional(Type.Boolean()),
  supportsTerminateThreadsRequest: Type.Optional(Type.Boolean()),
  supportsSetExpression: Type.Optional(Type.Boolean()),
  supportsTerminateRequest: Type.Optional(Type.Boolean()),
  supportsDataBreakpoints: Type.Optional(Type.Boolean()),
  supportsReadMemoryRequest: Type.Optional(Type.Boolean()),
  supportsWriteMemoryRequest: Type.Optional(Type.Boolean()),
  supportsDisassembleRequest: Type.Optional(Type.Boolean()),
  supportsCancelRequest: Type.Optional(Type.Boolean()),
  supportsBreakpointLocationsRequest: Type.Optional(Type.Boolean()),
  supportsClipboardContext: Type.Optional(Type.Boolean()),
  supportsSteppingGranularity: Type.Optional(Type.Boolean()),
  supportsInstructionBreakpoints: Type.Optional(Type.Boolean()),
  supportsExceptionFilterOptions: Type.Optional(Type.Boolean()),
  supportsSingleThreadExecutionRequests: Type.Optional(Type.Boolean()),
});
