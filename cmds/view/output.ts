import { Command } from "../../deps/cliffy/command.ts";
import { connectToServer } from "../common.ts";
import { encodeText } from "../../utils/text.ts";

export const Cmd = new Command()
  .name("output")
  .description("View output.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    const [_client, stub] = await connectToServer(sessionName);

    await stub["dmux/listen"]({});

    stub.on("output", ({ category, output }) => {
      switch (category) {
        case "stdout":
          Deno.stdout.write(encodeText(output));
          break;
        case "stderr":
          Deno.stderr.write(encodeText(output));
          break;
      }
    });

    await new Promise(() => {});
  });
