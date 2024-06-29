import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";

export const Cmd = new Command()
  .name("pause")
  .description("Pause the program.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [client, stub] = await connectToServer(sessionName);
    try {
      const info = await stub["dmux/info"]({});
      const threadId = info.viewFocus.threadId;
      if (threadId !== undefined) {
        console.log(await stub.pause({ threadId }));
      }
    } finally {
      await client.stop();
    }
  });
