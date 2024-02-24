import { Client as RawClient } from "../dap/client.ts";
import { runServer, ServerHandler } from "../dap/server.ts";
import { makeClientStub } from "../dap/client-wrapper.ts";
import {
  EventSpec,
  makeRequestHandler,
  makeReverseProxy,
  RequestStub as ServerStub,
} from "../dap/server-wrapper.ts";
import {
  EventSpec as DapEventSpec,
  RequestSpec as DapRequestSpec,
} from "../dap/schema.ts";
import {
  EventSpec as DmuxEventSpec,
  RequestSpec as DmuxRequestSpec,
  ViewFocus,
} from "../dmux/schema.ts";
import {
  ArgumentValue,
  Command,
  ValidationError,
} from "../deps/cliffy/command.ts";
import { Type, TypeCompiler, Static } from "../deps/typebox.ts";
import { getLogger } from "../logging.ts";
import { superslug } from "../deps/superslug.ts";
import { ClientConnection } from "../dap/server.ts";

const ConfigSchema = Type.Object({
  executable: Type.String(),
  args: Type.Array(Type.String()),
  mode: Type.Union([
    Type.Literal("launch"),
    Type.Literal("attach"),
  ]),
  config: Type.Optional(Type.Object({})),
});

const ConfigSchemaChecker = TypeCompiler.Compile(ConfigSchema);

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

type EventSender<T extends EventSpec> = {
  <Event extends keyof T & string>(event: Event, args: Static<T[Event]>): void;
};

export const Cmd = new Command()
  .description("The debugger multiplexer server.")
  .type("JSONString", JSONString)
  .option(
    "--session-name <path:string>",
    "Name for the session. A random one will be generated if omitted.",
  )
  .option(
    "--config <args:JSONString>",
    "Config for the adapter. Must be a valid JSON string.",
    {
      default: {},
    },
  )
  .option(
    "--config-file <path:string>",
    "Arguments for the adapter. Must be a path to a valid JSON file.",
  )
  .action(async ({
    sessionName,
    config,
    configFile,
  }) => {
    let configFromFile: Record<string, unknown> = {};
    if (configFile) {
      configFromFile = JSON.parse(await Deno.readTextFile(configFile));
    }
    const mergedConfig = Object.assign({}, configFromFile, config);
    if (!ConfigSchemaChecker.Check(mergedConfig)) {
      for (const error of ConfigSchemaChecker.Errors(mergedConfig)) {
        console.error(error);
      }

      return;
    }

    const debuggerCmd = new Deno.Command(mergedConfig.executable, {
      args: mergedConfig.args,
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
    });

    const debuggerProc = debuggerCmd.spawn();

    const writer = debuggerProc.stdin.getWriter();
    const reader = debuggerProc.stdout.getReader();
    const rawClient = new RawClient(writer, reader);

    const dapLogger = getLogger({ name: "dap" });
    rawClient.on("event", (event) => dapLogger.debug(event));

    const dapClient = makeClientStub(rawClient, DapRequestSpec, DapEventSpec);

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

    try {
      const initializedEvent = new Promise<void>((resolve) => {
        dapClient.once("initialized", () => resolve());
      });

      const capabilities = await dapClient.initialize({ adapterID: "dap" });
      logger.debug("Adapter capabilities:", capabilities);

      switch (mergedConfig.mode) {
        case "launch":
          logger.debug(await dapClient.launch(mergedConfig.config || {}));
          break;
        case "attach":
          logger.debug(await dapClient.attach(mergedConfig.config || {}));
          break;
      }

      logger.info("Waiting for initialization");
      await initializedEvent;
      logger.info("Initialized");

      await dapClient.configurationDone({});

      const listeners = new Set<ClientConnection>();
      const viewFocus: Static<typeof ViewFocus> = {
        threadId: undefined,
        stackFrameId: undefined,
      };

      // Focus on the first thread
      {
        const threadsResponse = await dapClient.threads({});
        if (threadsResponse.threads.length > 0) {
          viewFocus.threadId = threadsResponse.threads[0].id;
        }
      }

      const broadcastRawEvent = (type: string, body: unknown) => {
        listeners.forEach((connection) => {
          connection.sendEvent(type, body).catch(() => {
            connection.disconnect();
          });
        });
      };

      rawClient.on("event", (message) => {
        broadcastRawEvent(message.event, message.body);
      });

      const broadcastEvent: EventSender<typeof DmuxEventSpec> =
        broadcastRawEvent;

      dapClient.on("stopped", (event) => {
        // TODO: Handle focus on a per-thread basis
        if (event.threadId !== undefined) {
          viewFocus.threadId = event.threadId;
          viewFocus.stackFrameId = undefined;
          broadcastEvent("dmux/focus", { focus: viewFocus });
        }
      });

      const requestHandlers: ServerStub<typeof DmuxRequestSpec> = {
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
        "dmux/focus": (_client, { focus }) => {
          if (focus.threadId !== undefined) {
            viewFocus.threadId = focus.threadId;
            viewFocus.stackFrameId = undefined;
          }

          if (focus.stackFrameId !== undefined) {
            viewFocus.stackFrameId = focus.stackFrameId;
          }

          broadcastEvent("dmux/focus", { focus: viewFocus });
          return Promise.resolve({ focus: viewFocus });
        },
      };

      const serverHandler: ServerHandler = {
        onConnect: async (_connection) => {
        },
        onDisconnect: (connection) => {
          listeners.delete(connection);
          return Promise.resolve();
        },
        onShutdown: async () => {
        },
        onRequest: makeRequestHandler<typeof DmuxRequestSpec>(
          requestHandlers,
          makeReverseProxy(rawClient),
        ),
      };

      await runServer(dmuxServer, serverHandler);
    } finally {
      dmuxServer.close();
      reader.releaseLock();
      await rawClient.stop();
      await writer.close();
    }
  });
