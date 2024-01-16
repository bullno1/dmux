import { Command } from "./deps/cliffy/command.ts";
import { Cmd as ServerCmd } from "./cmds/server.ts";
import { Cmd as InfoCmd } from "./cmds/info.ts";

const cmd = new Command()
  .name("dmux")
  .description("Debugger Adapter Protocol multiplexer.")
  .action(function () {
    this.showHelp();
  })
  .command("server", ServerCmd)
  .command("info", InfoCmd);

if (import.meta.main) {
  await cmd.parse(Deno.args);
}
