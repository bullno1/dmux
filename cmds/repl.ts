import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";

export const Cmd = new Command()
  .name("repl")
  .description("Enter command directly.")
  .option("--session-name <sessionName:string>", "Session name.")
  .option("--context <context:string>", "Evaluation context.", {
    default: 'repl',
  })
  .action(async ({ sessionName, context }) => {
    const [_client, stub] = await connectToServer(sessionName);

    while (true) {
      const exp = prompt(">");
      if (exp) {
        try {
          const response = await stub.evaluate({
            context,
            expression: exp,
          });
          console.log(response.result);
        } catch (e) {
          console.error(e);
        }
      } else {
        break;
      }
    }
  });
