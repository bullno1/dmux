import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";

export const Cmd = new Command()
  .name("vim")
  .description("Vim netbean server.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }, sourceRef) => {
    const [_client, stub] = await connectToServer(sessionName);

  });
