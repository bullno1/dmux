import { Type } from "../deps/typebox.ts";

// Reference: https://microsoft.github.io/debug-adapter-protocol/specification

// https://microsoft.github.io/debug-adapter-protocol/specification#base-protocol
// Base {{{

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

export const ErrorMessage = Type.Object({
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
      message: Type.Optional(Type.String()),
      body: Type.Optional(Type.Object({
        error: Type.Optional(ErrorMessage),
      })),
    }),
  ]),
]);

// }}}

// https://microsoft.github.io/debug-adapter-protocol/specification#types
// Shared {{{

export const Ignored = Type.Optional(Type.Unknown());

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

export const Checksum = Type.Object({
  algorithm: ChecksumAlgorithm,
  checksum: Type.String(),
});

export const Source = Type.Recursive((This) =>
  Type.Object({
    name: Type.Optional(Type.String()),
    path: Type.Optional(Type.String()),
    sourceReference: Type.Optional(Type.Number()),
    presentationHint: Type.Optional(
      Type.Union([
        Type.Literal("normal"),
        Type.Literal("emphasize"),
        Type.Literal("deemphasize"),
      ]),
    ),
    origin: Type.Optional(Type.String()),
    sources: Type.Optional(Type.Array(This)),
    adapterData: Type.Optional(Type.Unknown()),
    checksums: Type.Optional(Type.Array(Checksum)),
  })
);

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

export const Thread = Type.Object({
  id: Type.Number(),
  name: Type.String(),
});

export const Scope = Type.Object({
  name: Type.String(),
  presentationHint: Type.Optional(Type.String()),
  variablesReference: Type.Number(),
  namedVariables: Type.Optional(Type.Number()),
  indexedVariables: Type.Optional(Type.Number()),
  expensive: Type.Boolean(),
  source: Type.Optional(Source),
  line: Type.Optional(Type.Number()),
  column: Type.Optional(Type.Number()),
  endLine: Type.Optional(Type.Number()),
  endColumn: Type.Optional(Type.Number()),
});

export const ValueFormat = Type.Object({
  hex: Type.Optional(Type.Boolean()),
});

export const StackFrameFormat = Type.Composite([
  ValueFormat,
  Type.Object({
    parameters: Type.Optional(Type.Boolean()),
    parameterTypes: Type.Optional(Type.Boolean()),
    parameterNames: Type.Optional(Type.Boolean()),
    parameterValues: Type.Optional(Type.Boolean()),
    line: Type.Optional(Type.Boolean()),
    module: Type.Optional(Type.Boolean()),
    includeAll: Type.Optional(Type.Boolean()),
  }),
]);

export const StackFrame = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  source: Type.Optional(Source),
  line: Type.Number(),
  column: Type.Number(),
  endLine: Type.Optional(Type.Number()),
  endColumn: Type.Optional(Type.Number()),
  canRestart: Type.Optional(Type.Boolean()),
  instructionPointerReference: Type.Optional(Type.String()),
  moduleId: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  presentationHint: Type.Optional(
    Type.Union([
      Type.Literal("normal"),
      Type.Literal("label"),
      Type.Literal("subtle"),
    ]),
  ),
});

export const Breakpoint = Type.Object({
  id: Type.Optional(Type.Number()),
  verified: Type.Boolean(),
  message: Type.Optional(Type.String()),
  source: Type.Optional(Source),
  line: Type.Optional(Type.Number()),
  column: Type.Optional(Type.Number()),
  endLine: Type.Optional(Type.Number()),
  endColumn: Type.Optional(Type.Number()),
  instructionReference: Type.Optional(Type.String()),
  offset: Type.Optional(Type.Number()),
  reason: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("failed"),
    ]),
  ),
});

export const VariablePresentationHint = Type.Object({
  kind: Type.Optional(Type.String()),
  attributes: Type.Optional(Type.Array(Type.String())),
  visibility: Type.Optional(Type.String()),
  lazy: Type.Optional(Type.Boolean()),
});

export const Variable = Type.Object({
  name: Type.String(),
  value: Type.String(),
  type: Type.Optional(Type.String()),
  presentationHint: Type.Optional(VariablePresentationHint),
  evaluateName: Type.Optional(Type.String()),
  variablesReference: Type.Number(),
  namedVariables: Type.Optional(Type.Number()),
  indexedVariables: Type.Optional(Type.Number()),
  memoryReference: Type.Optional(Type.String()),
});

export const SteppingGranularity = Type.Union([
  Type.Literal("statement"),
  Type.Literal("line"),
  Type.Literal("instruction"),
]);

// }}}

// https://microsoft.github.io/debug-adapter-protocol/specification#requests
// Requests {{{

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

export const InitializeResponse = Capabilities;

export const LaunchRequestArguments = Type.Object({
  noDebug: Type.Optional(Type.Boolean()),
  __restart: Type.Optional(Type.Any()),
});

export const AttachRequestArguments = Type.Object({
  __restart: Type.Optional(Type.Any()),
});

export const ThreadsResponse = Type.Object({
  threads: Type.Array(Thread),
});

export const StackTraceArguments = Type.Object({
  threadId: Type.Number(),
  startFrame: Type.Optional(Type.Number()),
  levels: Type.Optional(Type.Number()),
  format: Type.Optional(StackFrameFormat),
});

export const StackTraceResponse = Type.Object({
  stackFrames: Type.Array(StackFrame),
  totalFrames: Type.Optional(Type.Number()),
});

export const SourceArguments = Type.Object({
  source: Type.Optional(Source),
  sourceReference: Type.Number(),
});

export const SourceResponse = Type.Object({
  content: Type.String(),
  mimeType: Type.Optional(Type.String()),
});

export const EvaluateArguments = Type.Object({
  expression: Type.String(),
  frameId: Type.Optional(Type.Number()),
  context: Type.Optional(Type.String()),
  format: Type.Optional(ValueFormat),
});

export const EvaluateResponse = Type.Object({
  result: Type.String(),
  type: Type.Optional(Type.String()),
  presentationHint: Type.Optional(VariablePresentationHint),
  variablesReference: Type.Number(),
  namedVariables: Type.Optional(Type.Number()),
  indexedVariables: Type.Optional(Type.Number()),
  memoryReference: Type.Optional(Type.String()),
});

export const ScopesArguments = Type.Object({
  frameId: Type.Number(),
});

export const ScopesResponse = Type.Object({
  scopes: Type.Array(Scope),
});

export const VariablesArguments = Type.Object({
  variablesReference: Type.Number(),
  filter: Type.Optional(
    Type.Union([Type.Literal("indexed"), Type.Literal("named")]),
  ),
  start: Type.Optional(Type.Number()),
  count: Type.Optional(Type.Number()),
  format: Type.Optional(ValueFormat),
});

export const VariablesResponse = Type.Object({
  variables: Type.Array(Variable),
});

export const NextArguments = Type.Object({
  threadId: Type.Number(),
  singleThread: Type.Optional(Type.Boolean()),
  granularity: Type.Optional(SteppingGranularity),
});

export const StepInArguments = Type.Object({
  threadId: Type.Number(),
  singleThread: Type.Optional(Type.Boolean()),
  targetId: Type.Optional(Type.Boolean()),
  granularity: Type.Optional(SteppingGranularity),
});

export const StepOutArguments = Type.Object({
  threadId: Type.Number(),
  singleThread: Type.Optional(Type.Boolean()),
  granularity: Type.Optional(SteppingGranularity),
});

export const ContinueArguments = Type.Object({
  threadId: Type.Number(),
  singleThread: Type.Optional(Type.Boolean()),
});

export const RequestSpec = {
  initialize: {
    request: InitializeRequestArguments,
    response: InitializeResponse,
  },
  launch: {
    request: LaunchRequestArguments,
    response: Ignored,
  },
  attach: {
    request: AttachRequestArguments,
    response: Ignored,
  },
  configurationDone: {
    request: Ignored,
    response: Ignored,
  },
  threads: {
    request: Ignored,
    response: ThreadsResponse,
  },
  scopes: {
    request: ScopesArguments,
    response: ScopesResponse,
  },
  stackTrace: {
    request: StackTraceArguments,
    response: StackTraceResponse,
  },
  source: {
    request: SourceArguments,
    response: SourceResponse,
  },
  evaluate: {
    request: EvaluateArguments,
    response: EvaluateResponse,
  },
  variables: {
    request: VariablesArguments,
    response: VariablesResponse,
  },
  next: {
    request: NextArguments,
    response: Ignored,
  },
  stepIn: {
    request: StepInArguments,
    response: Ignored,
  },
  stepOut: {
    request: StepOutArguments,
    response: Ignored,
  },
  continue: {
    request: ContinueArguments,
    response: Ignored,
  },
};

// }}}

// https://microsoft.github.io/debug-adapter-protocol/specification#events
// Event {{{

export const EventSpec = {
  breakpoint: Type.Object({
    reason: Type.String(),
    breakpoint: Breakpoint,
  }),
  continued: Type.Object({
    threadId: Type.Number(),
    allThreadsContinued: Type.Optional(Type.Boolean()),
  }),
  exited: Type.Object({
    exitCode: Type.Number(),
  }),
  initialized: Ignored,
  output: Type.Object({
    category: Type.Optional(Type.String()),
    output: Type.String(),
    group: Type.Optional(Type.Union([
      Type.Literal("start"),
      Type.Literal("startCollapsed"),
      Type.Literal("end"),
    ])),
    variablesReference: Type.Optional(Type.Number()),
    source: Type.Optional(Source),
    line: Type.Optional(Type.Number()),
    column: Type.Optional(Type.Number()),
    data: Type.Optional(Type.Unknown()),
  }),
  process: Type.Object({
    name: Type.String(),
    systemProcessId: Type.Optional(Type.Number()),
    isLocalProcess: Type.Optional(Type.Boolean()),
    startMethod: Type.Optional(
      Type.Union([
        Type.Literal("launch"),
        Type.Literal("attach"),
        Type.Literal("attachForSuspendedLaunch"),
      ]),
    ),
    pointerSize: Type.Optional(Type.Number()),
  }),
  stopped: Type.Object({
    reason: Type.String(),
    description: Type.Optional(Type.String()),
    threadId: Type.Optional(Type.Number()),
    preserveFocusHint: Type.Optional(Type.Boolean()),
    text: Type.Optional(Type.String()),
    allThreadsStopped: Type.Optional(Type.Boolean()),
    hitBreakpointIds: Type.Optional(Type.Array(Type.Number())),
  }),
  terminated: Type.Union([
    Type.Object({
      restart: Type.Optional(Type.Unknown()),
    }),
    Type.Undefined(),
  ]),
  thread: Type.Object({
    reason: Type.String(),
    threadId: Type.Number(),
  }),
};

// }}}
