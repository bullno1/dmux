import { Client as DapClient } from "./dap/client.ts";

async function main(_args: string[]) {
  const debuggerCmd = new Deno.Command("lldb-vscode", {
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  });
  const debuggerProc = debuggerCmd.spawn();

  const writer = debuggerProc.stdin.getWriter();
  const reader = debuggerProc.stdout.getReader();
  const client = new DapClient(writer, reader);

  try {
    console.log(await client.sendRequest("initialize", {}));
  } finally {
    await writer.close();
    await client.stop();
  }
}

if (import.meta.main) {
  await main(Deno.args);
}
