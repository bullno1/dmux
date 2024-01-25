import { Type } from "../deps/typebox.ts";

// Reference: https://vimhelp.org/netbeans.txt.html

export const Offset = Type.Union([Type.Number(), Type.String()]);
export const Color = Type.Object({
  color: Type.Union([Type.Number(), Type.String()])
});

// https://vimhelp.org/netbeans.txt.html#nb-commands
export const CommandSpec = {
  addAnno: Type.Object({
    serNum: Type.Number(),
    typeNum: Type.Number(),
    off: Offset,
    len: Type.Number(),
  }),
  create: Type.Object({
  }),
  defineAnnoType: Type.Object({
    typeNum: Type.Number(),
    typeName: Type.String(),
    tooltip: Type.String(),
    glyphFile: Type.String(),
    fg: Color,
    bg: Color,
  }),
  editFile: Type.Object({
    pathName: Type.String(),
  }),
  setVisible: Type.Object({
    visible: Type.Boolean(),
  }),
};

// https://vimhelp.org/netbeans.txt.html#nb-functions
export const FunctionSpec = {
  getAnno: {
    request: Type.Object({
    }),
    response: Type.Object({
      lnum: Type.Number(),
    }),
  }
};

// https://vimhelp.org/netbeans.txt.html#nb-events
export const EventSpec = {
  keyCommand: Type.Object({
    keyName: Type.String(),
  }),
  startupDone: Type.Object({
  }),
};
