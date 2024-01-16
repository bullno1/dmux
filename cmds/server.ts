import { Client as DapClient, ServerEvent as DapEvent } from "../dap/client.ts";
import {
  AttachRequestArguments,
  Capabilities,
  Ignored,
  InitializeRequestArguments,
  LaunchRequestArguments,
  Output,
} from "../dap/schema.ts";
import {
  ArgumentValue,
  Command,
  EnumType,
  ValidationError,
} from "../deps/cliffy.ts";
import { TypeCompiler } from "../deps/typebox.ts";
import { getLogger } from "../logging.ts";

const logger = getLogger({ name: "server" });

const OutputSchemaChecker = TypeCompiler.Compile(Output);

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
  .description("The server for other components.")
  .option("--adapter <path:string>", "Path to the debug adapter.", {
    default: "lldb-vscode",
  })
  .type("Mode", new EnumType(Mode))
  .type("JSONString", JSONString)
  .option("--mode <mode:Mode>", "Debug mode.", {
    required: true,
  })
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
    const client = new DapClient(writer, reader);

    const dapLogger = logger.child({ name: "dap" });
    client.on("event", (event) => {
      if (event.event === "output" && OutputSchemaChecker.Check(event.body)) {
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

    const wrapperSpec = {
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
    };
    const wrapper = client.makeWrapper(wrapperSpec);

    try {
      const initializedEvent = new Promise<void>((resolve) => {
        const listener = (event: DapEvent) => {
          if (event.event === "initialized") {
            resolve();
            client.off("event", listener);
          }
        };

        client.on("event", listener);
      });

      const capabilities = await wrapper.initialize({ adapterID: "dap" });
      logger.debug("Adapter capabilities:", capabilities);

      const debuggerArgs = argsFromFile || args || {};
      switch (mode) {
        case Mode.Launch:
          logger.debug(await wrapper.launch(debuggerArgs));
          break;
        case Mode.Attach:
          logger.debug(await wrapper.attach(debuggerArgs));
          break;
      }

      await initializedEvent;
      logger.info("Initialized");
    } finally {
      //await writer.close();
      await client.stop();
    }
  });
