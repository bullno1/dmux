import { Command } from "../../deps/cliffy/command.ts";
import { Cmd as StackTraceCmd } from "./stacktrace.ts";
import { Cmd as VarsCmd } from "./vars.ts";
import { Cmd as OutputCmd } from "./output.ts";
import { Cmd as WatchesCmd } from "./watch.ts";

export const Cmd = new Command()
  .name("view")
  .description("Various debug views.")
  .action(function () {
    this.showHelp();
  })
  .command("stacktrace", StackTraceCmd)
  .command("vars", VarsCmd)
  .command("watch", WatchesCmd)
  .command("output", OutputCmd);
