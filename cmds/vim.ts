import { Command } from "../deps/cliffy/command.ts";
import { connectToServer } from "./common.ts";
import { runServer, ServerInfo } from "../netbeans/impl.ts";
import { getLogger, DefaultSink, Console } from "../logging.ts";
import { forwardLogToServer } from "../dmux/logging.ts";

export const Cmd = new Command()
  .name("vim")
  .description("Run vim as a code view.")
  .option("--session-name <sessionName:string>", "Session name.")
  .option(
    "--executable <executable:string>",
    "Vim executable.",
    {
      default: "vim",
    },
  )
  .action(async ({ sessionName, executable }) => {
    const [rawClient, dmuxClient] = await connectToServer(sessionName);
    forwardLogToServer(dmuxClient);

    const logger = getLogger({ name: "vim" });
    const abortController = new AbortController();

    try {
      const onServerStarted = (serverInfo: ServerInfo) => {
        const netbeansArg =
          `-nb:${serverInfo.host}:${serverInfo.port}:${serverInfo.password}`;

        const command = new Deno.Command(
          executable,
          {
            args: [netbeansArg],
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
            signal: abortController.signal,
          },
        );
        const vim = command.spawn();
        vim.status.finally(() => abortController.abort());
      };

      await runServer({
        dmuxClient,
        logger,
        onServerStarted,
        abortSignal: abortController.signal,
      });
    } finally {
      DefaultSink.target = Console;
      abortController.abort();
      await rawClient.stop();
    }
  });
