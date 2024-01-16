import { Command } from "../../deps/cliffy/command.ts";
import { Cmd as ThreadsCmd } from "./threads.ts";

export const Cmd = new Command()
  .name("view")
  .description("Various debug views.")
  .action(function () {
    this.showHelp();
  })
  .command("threads", ThreadsCmd);
