import { Command } from "../deps/cliffy/command.ts";
import { encodeBase64 } from "../deps/std/base64.ts";
import { Static } from "../deps/typebox.ts";
import { connectToServer, DmuxClientStub, locateSession } from "./common.ts";
import {
  ClientConnection,
  runServer,
  ServerHandler,
} from "../netbeans/server.ts";
import { CommandSpec, EventSpec, FunctionSpec } from "../netbeans/schema.ts";
import { StackFrame } from "../dap/schema.ts";
import { ClientStub, makeClientStub } from "../netbeans/wrapper.ts";
import { getLogger } from "../logging.ts";

type Client = ClientStub<
  typeof CommandSpec,
  typeof FunctionSpec,
  typeof EventSpec
>;

enum AnnoType {
  Exec = 1,
}

const AnnoTypes: (Static<typeof CommandSpec.defineAnnoType>)[] = [
  {
    typeNum: AnnoType.Exec,
    typeName: "exec",
    tooltip: "",
    glyphFile: ">>",
    fg: { color: "White" },
    bg: { color: "Red" },
  },
];

export const Cmd = new Command()
  .name("vim")
  .description("Vim netbeans server.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    sessionName = await locateSession(sessionName);
    const [rawClient, dapClient] = await connectToServer(sessionName);

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

      const logger = getLogger({ name: "vim", sessionName });

      const tmpDir = Deno.env.get("TMPDIR") ||
        Deno.env.get("TMP") ||
        Deno.env.get("TEMP") ||
        "/tmp";
      const dmuxDir = `${tmpDir}/dmux`;
      await Deno.mkdir(dmuxDir, { recursive: true });
      const sessionFile = `${dmuxDir}/${sessionName}`;
      await Deno.writeTextFile(
        sessionFile,
        `host=127.0.0.1\nport=${port}\nauth=${password}\n`,
        { mode: 0o0600 },
      );

      logger.info(`Run \`vim -nb=${sessionFile}\` to connect`);

      const editors = new Map<number, Editor>();

      await dapClient["dmux/listen"]({});

      dapClient.on("dmux/focus", async (event) => {
        if (
          event.focus.stackFrameId === undefined ||
          event.focus.threadId === undefined
        ) return;

        const stackTraceResult = await dapClient.stackTrace({
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
            const editor = new Editor(connection, dapClient);

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

      await runServer(listener, handler);
    } finally {
      await Promise.allSettled([
        rawClient.stop(),
        listener.close(),
      ]);
    }
  });

class Editor {
  public readonly id: number;
  private client: Client;
  private pathToBufferId = new Map<string, number>();
  private nextBufferId = 1;
  private freeAnnoSerNums: number[] = [];
  private nextAnnoSerNum = 1;
  private execAnnoSernum: number | null = null;

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

    this.client.specialKeys(0, {
      key: "F8",
    });

    this.client.on("keyAtPos", this.onKeyCommand);
  }

  async focus(frame: Static<typeof StackFrame>): Promise<void> {
    const path = frame.source?.path;
    if (path === undefined) return;
    const bufferId = await this.getBufferId(path);

    await this.client.editFile(
      bufferId,
      { pathName: path },
    );
    await this.client.setDot(
      bufferId,
      { off: { lnumCol: [frame.line, frame.column] } },
    );

    if (this.execAnnoSernum !== null) {
      await this.removeAnno(bufferId, this.execAnnoSernum);
    }
    this.execAnnoSernum = await this.addAnno(
      bufferId,
      AnnoType.Exec,
      frame.line,
      frame.column,
    );
  }

  private async getBufferId(path: string): Promise<number> {
    let id = this.pathToBufferId.get(path);
    if (id === undefined) {
      id = this.nextBufferId++;
      this.pathToBufferId.set(path, id);

      for (const annoType of AnnoTypes) {
        await this.client.defineAnnoType(id, annoType);
      }
    }

    return id;
  }

  private async addAnno(
    bufId: number,
    type: AnnoType,
    line: number,
    column: number,
  ): Promise<number> {
    let annoSerNum = this.freeAnnoSerNums.pop();
    if (annoSerNum === undefined) {
      annoSerNum = this.nextAnnoSerNum++;
    }

    await this.client.addAnno(bufId, {
      serNum: annoSerNum,
      typeNum: type,
      off: { lnumCol: [line, column] },
      len: 0, // Unused
    });

    return annoSerNum;
  }

  private async removeAnno(bufId: number, annoSerNum: number): Promise<void> {
    await this.client.removeAnno(bufId, { serNum: annoSerNum });
    this.freeAnnoSerNums.push(annoSerNum);
  }

  private onKeyCommand = (
    _bufId: number,
    event: Static<typeof EventSpec["keyAtPos"]>,
  ) => {
    switch (event.keyName) {
      case "F8":
        this.step();
        break;
    }
  };

  private async step(): Promise<void> {
    const info = await this.dapClient["dmux/info"]({});
    if (info.viewFocus.threadId === undefined) {
      return;
    }

    await this.dapClient.next({
      threadId: info.viewFocus.threadId,
      granularity: "line",
    });
  }
}
