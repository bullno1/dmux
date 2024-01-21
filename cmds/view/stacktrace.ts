import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { Select } from "../../deps/cliffy/prompt.ts";
import { ViewFocus } from "../../dmux/spec.ts";
import { Static } from "../../deps/typebox.ts";
import { tty } from "../../deps/cliffy/tty.ts";

export const Cmd = new Command()
  .name("stacktrace")
  .description("Stacktrace for the current thread.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [client, stub] = await connectToServer(sessionName);

    await stub["dmux/listen"]({});

    while (true) {
      let focus: Static<typeof ViewFocus>;
      do {
      } while (focus.stackFrameId === undefined);

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
