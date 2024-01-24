import { Type } from "../deps/typebox.ts";

// Reference: https://vimhelp.org/netbeans.txt.html

export const CommandSpec = {
  addAnno: Type.Object({
    serNum: Type.Number(),
    typeNum: Type.Number(),
    off: Type.Union([Type.Number(), Type.String()]),
    len: Type.Number(),
  }),
};

export const FunctionSpec = {
  getAnno: {
    request: Type.Object({
    }),
    response: Type.Object({
      lnum: Type.Number(),
    }),
  }
};

export const EventSpec = {
  keyCommand: Type.Object({
    keyName: Type.String(),
  }),
};
