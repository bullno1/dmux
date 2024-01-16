import { Client as DapClient } from "../dap/client.ts";
import { Capabilities, InitializeRequestArguments } from "../dap/schema.ts";
import { Command } from "../deps/cliffy.ts";

export const Cmd = new Command()
  .name("server")
  .description("The server for other components.")
  .option("--adapter <path:string>", "Path to the debug adapter.", {
    default: "lldb-vscode",
  })
  .action(async ({ adapter }) => {
    const debuggerCmd = new Deno.Command(adapter, {
      stdin: "piped",
      stdout: "piped",
      stderr: "inherit",
    });
    const debuggerProc = debuggerCmd.spawn();

    const writer = debuggerProc.stdin.getWriter();
    const reader = debuggerProc.stdout.getReader();
    const client = new DapClient(writer, reader);

    try {
      const initialize = client.makeWrapper(
        "initialize",
        InitializeRequestArguments,
        Capabilities,
      );
      const capabilities = await initialize({ adapterID: "dap" });
      console.log(capabilities);
    } finally {
      await writer.close();
      await client.stop();
    }
  });
