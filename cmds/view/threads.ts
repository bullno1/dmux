import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";

export const Cmd = new Command()
  .name("threads")
  .description("Threads in the program.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [client, stub] = await connectToServer(sessionName);

    console.log(await stub.threads({}));

    await client.stop();
  });
