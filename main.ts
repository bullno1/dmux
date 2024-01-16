import { Command } from "./deps/cliffy.ts";
import { Cmd as ServerCmd } from "./cmds/server.ts";

const cmd = new Command()
  .name("dmux")
  .description("Debugger Adapter Protocol multiplexer.")
  .action(function () {
    this.showHelp();
  })
  .command("server", ServerCmd);

if (import.meta.main) {
  await cmd.parse(Deno.args);
}
