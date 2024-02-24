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
};

// Event

export const EventSpec = {
  "dmux/focus": ViewFocusChange,
};
