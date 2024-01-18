import { Type } from "../deps/typebox.ts";
import { Capabilities, Stopped } from "../dap/schema.ts";

export const Ignored = Type.Optional(Type.Unknown());

export const ViewFocus = Type.Object({
  threadId: Type.Optional(Type.Number()),
  stackFrameId: Type.Optional(Type.Number()),
});

export const ViewFocusChange = Type.Object({
  focus: ViewFocus,
});

export const DmuxInfoResponse = Type.Object({
  adapter: Type.Object({
    capabilities: Capabilities,
  }),
  viewFocus: ViewFocus,
  lastEvents: Type.Partial(
    Type.Object({
      stopped: Stopped,
    }),
  )
});

export const ProtocolSpec = {
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
