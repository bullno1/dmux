import {
  AttachRequestArguments,
  Capabilities,
  Ignored,
  InitializeRequestArguments,
  LaunchRequestArguments,
  ThreadsResponse,
} from "./schema.ts";

export const ProtocolSpec = {
  initialize: {
    request: InitializeRequestArguments,
    response: Capabilities,
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
};
