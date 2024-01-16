import { Type } from "../deps/typebox.ts";
import { Capabilities } from "../dap/schema.ts";

export const Ignored = Type.Optional(Type.Unknown());

export const DmuxInfoResponse = Type.Object({
  adapter: Type.Object({
    capabilities: Capabilities,
  }),
});

export const ProtocolSpec = {
  "dmux/info": {
    request: Ignored,
    response: DmuxInfoResponse,
  },
};
