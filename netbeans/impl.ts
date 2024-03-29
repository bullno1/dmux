import { encodeBase64 } from "../deps/std/base64.ts";
import { Static } from "../deps/typebox.ts";
import { DmuxClientStub } from "../cmds/common.ts";
import {
  ClientConnection,
  runServer as runNetbeans,
  ServerHandler,
} from "./server.ts";
import { CommandSpec, EventSpec, FunctionSpec, LnumCol } from "./schema.ts";
import { ClientStub, makeClientStub } from "./wrapper.ts";
import { EventSpec as DmuxEventSpec } from "../dmux/schema.ts";
import { StackFrame } from "../dap/schema.ts";
import { Logger } from "../logging.ts";

type Client = ClientStub<
  typeof CommandSpec,
  typeof FunctionSpec,
  typeof EventSpec
>;

enum BufferPreparationMethod {
  EditFile,
  PutBufferNumber,
}

enum AnnoType {
  Exec = 1,
  Breakpoint = 2,
}

const AnnoTypes: (Static<typeof CommandSpec.defineAnnoType>)[] = [
  {
    typeNum: AnnoType.Exec,
    typeName: "exec",
    tooltip: "",
    glyphFile: ">>",
    fg: { color: "White" },
    bg: { color: "Blue" },
  },
  {
    typeNum: AnnoType.Breakpoint,
    typeName: "breakpoint",
    tooltip: "",
    glyphFile: "bp",
    fg: { color: "White" },
    bg: { color: "Red" },
  },
];

export interface ServerInfo {
  host: string;
  port: number;
  password: string;
}

export interface ServerOptions {
  dmuxClient: DmuxClientStub;
  logger: Logger;
  abortSignal?: AbortSignal;
  onServerStarted?: (serverInfo: ServerInfo) => void;
}

export async function runServer({
  dmuxClient,
  abortSignal,
  logger,
  onServerStarted,
}: ServerOptions): Promise<void> {
  const listener = Deno.listen({
    transport: "tcp",
    hostname: "127.0.0.1",
    port: 0,
  });

  if (listener.addr.transport !== "tcp") {
    throw new Error("Broken socket");
  }

  try {
    const port = listener.addr.port;

    const buf = new Uint8Array(16);
    crypto.getRandomValues(buf);
    const password = encodeBase64(buf);

    const editors = new Map<number, Editor>();

    await dmuxClient["dmux/listen"]({});

    dmuxClient.on("dmux/focus", async (event) => {
      if (
        event.focus.stackFrameId === undefined ||
        event.focus.threadId === undefined
      ) return;

      const stackTraceResult = await dmuxClient.stackTrace({
        threadId: event.focus.threadId,
      });

      for (const frame of stackTraceResult.stackFrames) {
        if (frame.id === event.focus.stackFrameId) {
          for (const editor of editors.values()) {
            editor.focus(frame).catch((err) => {
              editors.delete(editor.id);
              logger.error({ editor: editor.id }, err);
            });
          }

          break;
        }
      }
    });

    const handler: ServerHandler = {
      onConnect: (connection, authPassword) => {
        const authorized = authPassword === password;

        if (authorized) {
          const editor = new Editor(connection, dmuxClient);

          editor.setup().then(
            () => editors.set(editor.id, editor),
            (e) => logger.error({ editor: connection.id }, e),
          );
        }

        return Promise.resolve(authorized);
      },
      onDisconnect: (connection) => {
        editors.delete(connection.id);
        return Promise.resolve();
      },
      onShutdown: () => {
        return Promise.resolve();
      },
    };

    onServerStarted?.({
      host: "127.0.0.1",
      port,
      password,
    });

    await runNetbeans(listener, handler, abortSignal);
  } finally {
    await Promise.allSettled([
      listener.close(),
    ]);
  }
}

interface BufferState {
  readonly id: number;
  readonly path: string;

  freeAnnoSerNums: number[];
  nextAnnoSerNum: number;
  execAnnoSernum: number | null;
  breakpointAnnoSerNums: number[];
}

class Editor {
  public readonly id: number;
  private client: Client;
  private bufferByPath = new Map<string, BufferState>();
  private bufferById = new Map<number, BufferState>();
  private nextBufferId = 1;

  constructor(
    connection: ClientConnection,
    private dapClient: DmuxClientStub,
  ) {
    this.client = makeClientStub(
      connection,
      CommandSpec,
      FunctionSpec,
      EventSpec,
    );
    this.id = connection.id;
  }

  async setup(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.client.once("startupDone", () => resolve());
    });

    const info = await this.dapClient["dmux/info"]({});
    if (
      info.viewFocus.stackFrameId !== undefined &&
      info.viewFocus.threadId !== undefined
    ) {
      const stackTraceResult = await this.dapClient.stackTrace({
        threadId: info.viewFocus.threadId,
      });

      for (const frame of stackTraceResult.stackFrames) {
        if (frame.id === info.viewFocus.stackFrameId) {
          await this.focus(frame);
          break;
        }
      }
    }

    this.client.specialKeys(0, { key: "F5" });
    this.client.specialKeys(0, { key: "F8" });
    this.client.specialKeys(0, { key: "C-F8" });
    this.client.specialKeys(0, { key: "F7" });
    this.client.specialKeys(0, { key: "C-F7" });

    this.client.on("keyAtPos", this.onKeyCommand);
    this.client.on("fileOpened", this.onFileOpened);
    if (info.adapter.capabilities.supportsEvaluateForHovers) {
      this.client.on("balloonText", this.onBalloonText);
    }

    this.dapClient.on("dmux/updateBreakpoints", this.onBreakpointUpdated);
  }

  async focus(frame: Static<typeof StackFrame>): Promise<void> {
    const path = frame.source?.path;
    if (path === undefined) return;
    const buffer = await this.getBufferForPath(path);

    await this.client.setDot(
      buffer.id,
      { off: { lnumCol: [frame.line, frame.column] } },
    );

    if (buffer.execAnnoSernum !== null) {
      await this.removeAnno(buffer, buffer.execAnnoSernum);
    }
    buffer.execAnnoSernum = await this.addAnno(
      buffer,
      AnnoType.Exec,
      frame.line,
      frame.column,
    );
  }

  private async getBufferForPath(
    path: string,
    preparationMethod: BufferPreparationMethod =
      BufferPreparationMethod.EditFile,
  ): Promise<BufferState> {
    let buffer = this.bufferByPath.get(path);
    if (buffer === undefined) {
      const id = this.nextBufferId++;
      buffer = {
        id,
        path,
        execAnnoSernum: null,
        freeAnnoSerNums: [],
        nextAnnoSerNum: 1,
        breakpointAnnoSerNums: [],
      };
      this.bufferById.set(id, buffer);
      this.bufferByPath.set(path, buffer);

      switch (preparationMethod) {
        case BufferPreparationMethod.EditFile:
          await this.client.editFile(
            buffer.id,
            { pathName: path },
          );
          break;
        case BufferPreparationMethod.PutBufferNumber:
          await this.client.putBufferNumber(
            buffer.id,
            { pathName: path },
          );
          break;
      }

      for (const annoType of AnnoTypes) {
        await this.client.defineAnnoType(id, annoType);
      }

      const breakpoints = (await this.dapClient["dmux/getBreakpoints"]({
        path: buffer.path,
      })).breakpoints;
      const sourceBreakpoints = breakpoints[buffer.path];
      if (sourceBreakpoints !== undefined) {
        for (const breakpoint of sourceBreakpoints) {
          buffer.breakpointAnnoSerNums.push(
            await this.addAnno(
              buffer,
              AnnoType.Breakpoint,
              breakpoint.location.line,
              1,
            ),
          );
        }
      }
    }

    return buffer;
  }

  private async addAnno(
    buffer: BufferState,
    type: AnnoType,
    line: number,
    column: number,
  ): Promise<number> {
    let annoSerNum = buffer.freeAnnoSerNums.pop();
    if (annoSerNum === undefined) {
      annoSerNum = buffer.nextAnnoSerNum++;
    }

    await this.client.addAnno(buffer.id, {
      serNum: annoSerNum,
      typeNum: type,
      off: { lnumCol: [line, column] },
      len: 0, // Unused
    });

    return annoSerNum;
  }

  private async removeAnno(
    buffer: BufferState,
    annoSerNum: number,
  ): Promise<void> {
    await this.client.removeAnno(buffer.id, { serNum: annoSerNum });
    buffer.freeAnnoSerNums.push(annoSerNum);
  }

  private onKeyCommand = (
    bufId: number,
    event: Static<typeof EventSpec["keyAtPos"]>,
  ) => {
    switch (event.keyName) {
      case "F5":
        this.continue();
        break;
      case "F8":
        this.stepOver();
        break;
      case "C-F8":
        this.toggleBreakpoint(bufId, event.lnumCol);
        break;
      case "F7":
        this.stepIn();
        break;
      case "C-F7":
        this.stepOut();
        break;
    }
  };

  private onFileOpened = async (
    bufId: number,
    event: Static<typeof EventSpec["fileOpened"]>,
  ) => {
    if (bufId !== 0) {
      return;
    }

    await this.getBufferForPath(
      event.pathName,
      BufferPreparationMethod.PutBufferNumber,
    );
  };

  private onBalloonText = async (
    bufId: number,
    event: Static<typeof EventSpec["balloonText"]>,
  ) => {
    const info = await this.dapClient["dmux/info"]({});
    const frameId = info.viewFocus.stackFrameId;
    if (frameId === undefined) {
      return;
    }

    let popupText: string;
    try {
      const result = await this.dapClient.evaluate({
        context: "hover",
        expression: event.text,
        frameId,
      });
      popupText = result.result;
    } catch (e) {
      popupText = new String(e).toString();
    }

    await this.client.showBalloon(bufId, { text: popupText });
  };

  private onBreakpointUpdated = async (
    event: Static<typeof DmuxEventSpec["dmux/updateBreakpoints"]>,
  ) => {
    const buffer = await this.getBufferForPath(event.path);
    for (const annoSerNum of buffer.breakpointAnnoSerNums) {
      await this.removeAnno(buffer, annoSerNum);
    }
    buffer.breakpointAnnoSerNums.length = 0;

    for (const breakpoint of event.breakpoints) {
      buffer.breakpointAnnoSerNums.push(
        await this.addAnno(
          buffer,
          AnnoType.Breakpoint,
          breakpoint.location.line,
          1,
        ),
      );
    }
  };

  private async stepOver(): Promise<void> {
    // TODO: cache thread id
    const info = await this.dapClient["dmux/info"]({});
    if (info.viewFocus.threadId === undefined) {
      return;
    }

    await this.dapClient.next({
      threadId: info.viewFocus.threadId,
      granularity: "line",
    });
  }

  private async stepIn(): Promise<void> {
    // TODO: cache thread id
    const info = await this.dapClient["dmux/info"]({});
    if (info.viewFocus.threadId === undefined) {
      return;
    }

    await this.dapClient.stepIn({
      threadId: info.viewFocus.threadId,
      granularity: "line",
    });
  }

  private async stepOut(): Promise<void> {
    // TODO: cache thread id
    const info = await this.dapClient["dmux/info"]({});
    if (info.viewFocus.threadId === undefined) {
      return;
    }

    await this.dapClient.stepOut({
      threadId: info.viewFocus.threadId,
      granularity: "line",
    });
  }

  private async continue(): Promise<void> {
    // TODO: cache thread id
    const info = await this.dapClient["dmux/info"]({});
    if (info.viewFocus.threadId === undefined) {
      return;
    }

    await this.dapClient.continue({
      threadId: info.viewFocus.threadId,
    });
  }

  private async toggleBreakpoint(
    bufId: number,
    location: Static<typeof LnumCol>,
  ): Promise<void> {
    const buffer = this.bufferById.get(bufId);
    if (buffer === undefined) {
      return;
    }

    const breakpoints = (
      await this.dapClient["dmux/getBreakpoints"]({ path: buffer.path })
    ).breakpoints;
    const sourceBreakpoints = breakpoints[buffer.path];
    let foundBreakpoint = false;
    if (sourceBreakpoints !== undefined) {
      for (const breakpoint of sourceBreakpoints) {
        if (breakpoint.location.line === location.lnumCol[0]) {
          foundBreakpoint = true;
          break;
        }
      }
    }

    await this.dapClient["dmux/setBreakpoint"]({
      path: buffer.path,
      enabled: !foundBreakpoint,
      location: {
        line: location.lnumCol[0],
      },
    });
  }
}
