import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";

export const Cmd = new Command()
  .name("info")
  .description("Gather info about an ongoing debug session.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [client, stub] = await connectToServer(sessionName);
    try {
      console.log(await stub["dmux/info"]({}));
    } finally {
      await client.stop();
    }
  });
