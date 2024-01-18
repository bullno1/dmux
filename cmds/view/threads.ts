import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { Select } from "../../deps/cliffy/prompt.ts";
import { tty } from "../../deps/cliffy/tty.ts";

export const Cmd = new Command()
  .name("threads")
  .description("Threads in the program.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [_client, stub] = await connectToServer(sessionName);

    let threadId: number | undefined = undefined;
    while (true) {
      tty.cursorSave
        .cursorHide
        .cursorTo(0, 0)
        .eraseScreen();
      const threadsResult = await stub.threads({});
      threadId = await Select.prompt<number>({
        message: "Threads",
        options: threadsResult.threads.map(({ name, id }) => ({
          name: name,
          value: id,
        })),
        default: threadId,
      });

      await stub["dmux/focus"]({ focus: { threadId } });
    }
  });
