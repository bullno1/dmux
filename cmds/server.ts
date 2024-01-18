import { Client as DapClient, ServerEvent as DapEvent } from "../dap/client.ts";
import { runServer } from "../dap/server.ts";
import { makeClientStub } from "../dap/client-wrapper.ts";
import { makeRequestHandler, makeReverseProxy } from "../dap/server-wrapper.ts";
import { Output, Stopped  } from "../dap/schema.ts";
import { ProtocolSpec as DapProtocolSpec } from "../dap/spec.ts";
import { ProtocolSpec as DmuxProtocolSpec, ViewFocus } from "../dmux/spec.ts";
import {
  ArgumentValue,
  Command,
  EnumType,
  ValidationError,
} from "../deps/cliffy/command.ts";
import { Static } from "../deps/typebox.ts";
import { getLogger } from "../logging.ts";
import { superslug } from "../deps/superslug.ts";
import { ClientConnection } from "../dap/server.ts";
import { makeChecker } from "../utils/type-compiler.ts";

const Checkers = makeChecker({
  Output,
  Stopped,
});

function JSONString(
  { label, name, value }: ArgumentValue,
): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (e) {
    if (e instanceof Error) {
      throw new ValidationError(`${label} "${name}": ${e.message}`);
    } else {
      throw e;
    }
  }
}

enum Mode {
  Launch = "launch",
  Attach = "attach",
}

export const Cmd = new Command()
  .name("server")
  .description("The debugger multiplexer server.")
  .option("--adapter <path:string>", "Path to the debug adapter.", {
    default: "lldb-vscode",
  })
  .type("Mode", new EnumType(Mode))
  .type("JSONString", JSONString)
  .option("--mode <mode:Mode>", "Debug mode.", {
    required: true,
  })
  .option(
    "--session-name <path:string>",
    "Name for the session. A random one will be generated if omitted.",
  )
  .option(
    "--args <args:JSONString>",
    "Arguments for the adapter. Must be a valid JSON string.",
  )
  .option(
    "--args-file <path:string>",
    "Arguments for the adapter. Must be a path to a valid JSON file.",
  )
  .action(async ({
    adapter,
    mode,
    sessionName,
    args,
    argsFile,
  }) => {
    const debuggerCmd = new Deno.Command(adapter, {
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
    });
    let argsFromFile: Record<string, unknown> = {};
    if (argsFile) {
      argsFromFile = JSON.parse(await Deno.readTextFile(argsFile));
    }

    const debuggerProc = debuggerCmd.spawn();

    const writer = debuggerProc.stdin.getWriter();
    const reader = debuggerProc.stdout.getReader();
    const dapClient = new DapClient(writer, reader);

    if (sessionName === undefined) {
      sessionName = superslug({
        separator: "-",
        format: "lowercase",
      });
    }

    const dmuxServer = Deno.listen({
      transport: "unix",
      path: `\0dmux/${sessionName}`,
    });
    const logger = getLogger({ name: "server", sessionName });
    //const serverAbortController = new AbortController();

    const dapLogger = getLogger({ name: "dap" });
    dapClient.on("event", (event) => {
      if (event.event === "output" && Checkers.Output.Check(event.body)) {
        if (event.body?.group) console.group(event.body?.group);
        switch (event.body?.category) {
          case "important":
          case "stderr":
            dapLogger.warning(event.body.output);
            break;
          default:
            dapLogger.info(event.body.output);
            break;
        }
      } else {
        dapLogger.debug("Event", event.event, event.body);
      }
    });

    const dap = makeClientStub(dapClient, DapProtocolSpec);

    try {
      const initializedEvent = new Promise<void>((resolve) => {
        const listener = (event: DapEvent) => {
          if (event.event === "initialized") {
            resolve();
            dapClient.off("event", listener);
          }
        };

        dapClient.on("event", listener);
      });

      const listeners = new Set<ClientConnection>();
      const viewFocus: Static<typeof ViewFocus> = new ViewFocusImpl();
      const broadcastEvent = async (
        type: string,
        body: unknown,
      ): Promise<void> => {
        const sendPromises: Promise<void>[] = [];
        for (const listener of listeners) {
          sendPromises.push(listener.sendEvent(type, body));
        }
        await Promise.allSettled(sendPromises);
      };

      dapClient.on("event", (event) => {
        broadcastEvent(event.type, event.body);

        if (
          event.event === "stopped"
          && Checkers.Stopped.Check(event.body)
          && event.body?.threadId !== undefined
        ) {
          viewFocus.threadId = event.body.threadId;
          broadcastEvent("dmux/focus", { focus: viewFocus });
        }
      });

      const capabilities = await dap.initialize({ adapterID: "dap" });
      logger.debug("Adapter capabilities:", capabilities);

      const debuggerArgs = argsFromFile || args || {};
      switch (mode) {
        case Mode.Launch:
          logger.debug(await dap.launch(debuggerArgs));
          break;
        case Mode.Attach:
          logger.debug(await dap.attach(debuggerArgs));
          break;
      }

      await initializedEvent;
      logger.info("Initialized");

      await dap.configurationDone({});

      await runServer(
        dmuxServer,
        {
          onConnect: async (_connection) => {
          },
          onDisconnect: (connection) => {
            listeners.delete(connection);
            return Promise.resolve();
          },
          onShutdown: async () => {
          },
          onRequest: makeRequestHandler<typeof DmuxProtocolSpec>(
            {
              "dmux/info": (_client, _args) =>
                Promise.resolve({
                  adapter: {
                    capabilities,
                  },
                  viewFocus,
                }),
              "dmux/listen": (client, _args) => {
                listeners.add(client);
                return Promise.resolve();
              },
              "dmux/focus": async (_client, { focus }) => {
                if (focus.threadId !== undefined) {
                  viewFocus.threadId = focus.threadId;
                }

                if (focus.stackFrameId !== undefined) {
                  viewFocus.stackFrameId = focus.stackFrameId;
                }

                await broadcastEvent("dmux/focus", {
                  focus: viewFocus,
                });

                return { focus: viewFocus };
              },
            },
            makeReverseProxy(dapClient),
          ),
        },
      );
    } finally {
      dmuxServer.close();
      await writer.close();
      await dapClient.stop();
    }
  });

class ViewFocusImpl {
  #threadId: number | undefined = undefined;
  #stackFrameId: number | undefined = undefined;

  get threadId(): number | undefined {
    return this.#threadId;
  }

  set threadId(value: number) {
    if (this.#threadId !== value) {
      this.#threadId = value;
      this.#stackFrameId = undefined;
    }
  }

  get stackFrameId(): number | undefined {
    return this.#stackFrameId;
  }

  set stackFrameId(value: number) {
    this.#stackFrameId = value;
  }

  toJSON() {
    return {
      threadId: this.#threadId,
      stackFrameId: this.#stackFrameId,
    };
  }
}
