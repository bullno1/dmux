import { Type } from "../deps/typebox.ts";

// Reference: https://vimhelp.org/netbeans.txt.html

const Bool = Type.Union([Type.Literal("T"), Type.Literal("F")]);

export const CommandSpec = {
  addAnno: Type.Object({
    serNum: Type.Number(),
    typeNum: Type.Number(),
    off: Type.Union([Type.Number(), Type.String()]),
    len: Type.Number(),
  }),
  create: Type.Object({
  }),
  defineAnnoType: Type.Object({
    typeNum: Type.Number(),
    typeName: Type.String(),
    tooltip: Type.String(),
    glyphFile: Type.String(),
    fg: Type.String(),
    bg: Type.String(),
  }),
  editFile: Type.Object({
    pathName: Type.String(),
  }),
  setVisible: Type.Object({
    visible: Bool,
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
  startupDone: Type.Object({
  }),
};
