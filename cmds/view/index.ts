import { Command } from "../../deps/cliffy/command.ts";
import { Cmd as StackTraceCmd } from "./stacktrace.ts";

export const Cmd = new Command()
  .name("view")
  .description("Various debug views.")
  .action(function () {
    this.showHelp();
  })
  .command("stacktrace", StackTraceCmd);
