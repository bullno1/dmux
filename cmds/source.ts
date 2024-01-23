import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";

export const Cmd = new Command()
  .name("stacktrace")
  .description("View source.")
  .arguments("<source-ref:number>")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }, sourceRef) => {
    const [_client, stub] = await connectToServer(sessionName);

    const response = await stub.source({
      source: {
        sourceReference: sourceRef,
      },
      sourceReference: sourceRef,
    });
    console.log(response.content);
  });
