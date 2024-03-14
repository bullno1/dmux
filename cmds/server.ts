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
  Breakpoint as BreakpointSpec,
  EventSpec as DmuxEventSpec,
  RequestSpec as DmuxRequestSpec,
  WatchData as WatchDataSpec,
} from "../dmux/schema.ts";
import {
  ArgumentValue,
  Command,
  ValidationError,
} from "../deps/cliffy/command.ts";
import { Static, Type, TypeCompiler } from "../deps/typebox.ts";
import { DefaultSink, getLogger } from "../logging.ts";
import { superslug } from "../deps/superslug.ts";
import { ClientConnection } from "../dap/server.ts";
import { dirname } from "../deps/std/path.ts";

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
const BreakpointSchemaChecker = TypeCompiler.Compile(BreakpointSpec);

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
  .option(
    "--project-file <path:string>",
    "Project file",
    {
      default: ".dmux/project",
    },
  )
  .action(async ({
    sessionName,
    config,
    configFile,
    projectFile,
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
    const db = await openDb(projectFile);

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

      const watches = new Map<number, Static<typeof WatchDataSpec>>();
      let nextWatchId = 0;
      const breakpoints = new Map<string, Static<typeof BreakpointSpec>[]>();

      // Reload breakpoints
      const savedBreakpoints = db.list({ prefix: ["breakpoint"] });
      for await (const breakpointList of savedBreakpoints) {
        if (breakpointList.key.length !== 2) {
          continue;
        }

        const path = breakpointList.key[1];
        if (typeof path !== "string") {
          continue;
        }

        if (!Array.isArray(breakpointList.value)) {
          continue;
        }

        const sourceBreakpoints: Static<typeof BreakpointSpec>[] = [];
        for (const breakpoint of breakpointList.value) {
          if (!BreakpointSchemaChecker.Check(breakpoint)) {
            continue;
          }

          sourceBreakpoints.push(breakpoint);
        }

        breakpoints.set(path, sourceBreakpoints);
      }

      // Upload breakpoints
      for (const [path, sourceBreakpoints] of breakpoints.entries()) {
        console.log("Upload", path, sourceBreakpoints);
        const result = await dapClient.setBreakpoints({
          source: { path: path },
          breakpoints: sourceBreakpoints.map((breakpoint) => ({
            line: breakpoint.location.line,
          })),
        });

        sourceBreakpoints.length = 0;
        for (const breakpoint of result.breakpoints) {
          if (breakpoint.line !== undefined) {
            sourceBreakpoints.push({
              data: {},
              location: {
                line: breakpoint.line,
              },
            });
          }
        }
      }

      // Save breakpoints again in case they slip to the next line
      const tx = db.atomic();
      for (const [path, sourceBreakpoints] of breakpoints.entries()) {
        if (sourceBreakpoints.length > 0) {
          tx.set(["breakpoint", path], sourceBreakpoints);
        } else {
          breakpoints.delete(path);
          tx.delete(["breakpoint", path]);
        }
      }
      const result = await tx.commit();
      if (!result.ok) {
        logger.warning("Could not commit breakpoint");
      }

      if (capabilities.supportsConfigurationDoneRequest) {
        await dapClient.configurationDone({});
      }

      const listeners = new Set<ClientConnection>();
      const focusedStackFrame = new Map<number, number>();
      let focusedThread: number | undefined = undefined;

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

      dapClient.on("stopped", async (event) => {
        if (event.threadId !== undefined) {
          focusedThread = event.threadId;
          if (!focusedStackFrame.has(focusedThread)) {
            const resp = await dapClient.stackTrace({
              threadId: focusedThread,
            });
            if (resp.stackFrames.length > 0) {
              focusedStackFrame.set(focusedThread, resp.stackFrames[0].id);
            }
          }

          const viewFocus = {
            threadId: focusedThread,
            stackFrameId: focusedThread !== undefined
              ? focusedStackFrame.get(focusedThread)
              : undefined,
          };
          broadcastRawEvent("dmux/focus", { focus: viewFocus });
        }
      });

      const requestHandlers: ServerStub<typeof DmuxRequestSpec> = {
        "dmux/info": (_client, _args) =>
          Promise.resolve({
            adapter: {
              capabilities,
            },
            viewFocus: {
              threadId: focusedThread,
              stackFrameId: focusedThread !== undefined
                ? focusedStackFrame.get(focusedThread)
                : undefined,
            },
          }),
        "dmux/listen": (client, _args) => {
          listeners.add(client);
          return Promise.resolve();
        },
        "dmux/focus": (_client, { focus }) => {
          if (focus.threadId !== undefined) {
            focusedThread = focus.threadId;
          }

          if (focusedThread !== undefined && focus.stackFrameId !== undefined) {
            focusedStackFrame.set(focusedThread, focus.stackFrameId);
          }

          const viewFocus = {
            threadId: focusedThread,
            stackFrameId: focusedThread !== undefined
              ? focusedStackFrame.get(focusedThread)
              : undefined,
          };
          broadcastEvent("dmux/focus", { focus: viewFocus });
          return Promise.resolve({ focus: viewFocus });
        },
        "dmux/setBreakpoint": async (_client, info) => {
          let shouldUpdate = false;
          let sourceBreakpoints = breakpoints.get(info.path);
          if (info.enabled) {
            if (sourceBreakpoints === undefined) {
              sourceBreakpoints = [];
              breakpoints.set(info.path, sourceBreakpoints);
            }

            let foundBreakpoint = false;
            for (let i = 0; i < sourceBreakpoints.length; ++i) {
              const breakpoint = sourceBreakpoints[i];
              if (breakpoint.location.line === info.location.line) {
                foundBreakpoint = true;
                if (info.data !== undefined) {
                  breakpoint.data = info.data;
                }
              }
            }

            if (!foundBreakpoint) {
              sourceBreakpoints.push({
                location: info.location,
                data: info.data !== undefined ? info.data : {},
              });
            }

            shouldUpdate = true;
          } else {
            if (sourceBreakpoints !== undefined) {
              let foundBreakpoint = false;
              for (let i = 0; i < sourceBreakpoints.length; ++i) {
                const breakpoint = sourceBreakpoints[i];
                if (breakpoint.location.line === info.location.line) {
                  foundBreakpoint = true;
                  sourceBreakpoints.splice(i, 1);
                  break;
                }
              }
              shouldUpdate = foundBreakpoint;
            }
          }

          if (shouldUpdate && sourceBreakpoints !== undefined) {
            const result = await dapClient.setBreakpoints({
              source: {
                path: info.path,
              },
              breakpoints: sourceBreakpoints.map((breakpoint) => ({
                line: breakpoint.location.line,
              })),
            });

            sourceBreakpoints.length = 0;
            for (const breakpoint of result.breakpoints) {
              if (breakpoint.line !== undefined) {
                sourceBreakpoints.push({
                  data: {},
                  location: {
                    line: breakpoint.line,
                  },
                });
              }
            }

            broadcastEvent("dmux/updateBreakpoints", {
              path: info.path,
              breakpoints: sourceBreakpoints,
            });

            try {
              if (sourceBreakpoints.length > 0) {
                await db.set(
                  ["breakpoint", info.path],
                  sourceBreakpoints,
                );
              } else {
                breakpoints.delete(info.path);
                await db.delete(["breakpoint", info.path]);
              }
            } catch (e) {
              logger.warning("Could not save breakpoints", e);
            }
          }

          return Promise.resolve({});
        },
        "dmux/getBreakpoints": (_client, { path }) => {
          const result: Record<string, Static<typeof BreakpointSpec>[]> = {};
          breakpoints.forEach((sourceBreakpoints, file) => {
            if (path === undefined || path === file) {
              result[file] = sourceBreakpoints;
            }
          });

          return Promise.resolve({ breakpoints: result });
        },
        "dmux/log": (_client, { level, timestamp, context, args }) => {
          DefaultSink.write(level, timestamp, context, args);
          return Promise.resolve();
        },
        "dmux/addWatch": (_client, { watch }) => {
          const watchId = nextWatchId++;
          watches.set(watchId, watch);
          broadcastEvent("dmux/addWatch", {
            id: watchId,
            data: watch,
          });
          return Promise.resolve({ id: watchId });
        },
        "dmux/removeWatch": (_client, { id }) => {
          if (watches.delete(id)) {
            broadcastEvent("dmux/removeWatch", {
              id: id,
            });
          }
          return Promise.resolve({});
        },
        "dmux/getWatches": () => {
          return Promise.resolve(Object.fromEntries(watches.entries()));
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
      db.close();
      dmuxServer.close();
      reader.releaseLock();
      try {
        await rawClient.stop();
      } catch (e) {
        logger.warning("Could not stop rawClient", e);
      }

      try {
        await writer.close();
      } catch (e) {
        logger.warning("Could not stop writer", e);
      }
    }
  });

async function openDb(path: string): Promise<Deno.Kv> {
  const dbDir = dirname(path);
  await Deno.mkdir(dbDir, { recursive: true });
  return Deno.openKv(path);
}
