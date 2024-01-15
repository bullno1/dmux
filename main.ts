import { Client as DapClient } from "./dap.ts";

async function main(_args: string[]) {
  const debuggerCmd = new Deno.Command("lldb-vscode", {
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const debuggerProc = debuggerCmd.spawn();

  const client = new DapClient(
    debuggerProc.stdin.getWriter(),
    debuggerProc.stdout.getReader(),
  );
  client.startLoop();
  console.log(await client.sendRequest("initialize", {}));
}

if (import.meta.main) {
  await main(Deno.args);
}
