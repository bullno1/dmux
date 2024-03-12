import { Type } from "../deps/typebox.ts";
import { Capabilities } from "../dap/schema.ts";

// Project

// Types

export const Ignored = Type.Optional(Type.Unknown());

export const ViewFocus = Type.Object({
  threadId: Type.Optional(Type.Number()),
  stackFrameId: Type.Optional(Type.Number()),
});

export const ViewFocusChange = Type.Object({
  focus: ViewFocus,
});

export const SourceLocation = Type.Object({
  line: Type.Number(),
});

export const BreakpointData = Type.Object({});

export const Breakpoint = Type.Object({
  location: SourceLocation,
  data: BreakpointData,
});

// Request

export const DmuxInfoResponse = Type.Object({
  adapter: Type.Object({
    capabilities: Capabilities,
  }),
  viewFocus: ViewFocus,
});

export const RequestSpec = {
  "dmux/info": {
    request: Ignored,
    response: DmuxInfoResponse,
  },
  "dmux/listen": {
    request: Ignored,
    response: Ignored,
  },
  "dmux/focus": {
    request: ViewFocusChange,
    response: ViewFocusChange,
  },
  "dmux/setBreakpoint": {
    request: Type.Object({
      enabled: Type.Boolean(),
      path: Type.String(),
      location: SourceLocation,
      data: Type.Optional(BreakpointData),
    }),
    response: Ignored,
  },
  "dmux/getBreakpoints": {
    request: Type.Object({
      path: Type.String(),
    }),
    response: Type.Object({
      breakpoints: Type.Array(Breakpoint),
    }),
  },
  "dmux/log": {
    request: Type.Object({
      level: Type.Number(),
      timestamp: Type.Number(),
      context: Type.Record(Type.String(), Type.Any()),
      args: Type.Array(Type.Any()),
    }),
    response: Ignored,
  },
};

// Event

export const EventSpec = {
  "dmux/focus": ViewFocusChange,
  "dmux/updateBreakpoints": Type.Object({
    path: Type.String(),
    breakpoints: Type.Array(Breakpoint),
  }),
};
