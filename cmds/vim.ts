import { Command } from "../deps/cliffy/command.ts";
import { encodeBase64 } from "../deps/std/base64.ts";
import { connectToServer, locateSession } from "./common.ts";
import { runServer, ServerHandler } from "../netbeans/server.ts";
import { CommandSpec, FunctionSpec, EventSpec } from "../netbeans/schema.ts";
import { ClientStub, makeClientStub } from "../netbeans/wrapper.ts";
import { getLogger } from "../logging.ts";
import { ClientConnection } from "../netbeans/server.ts";

type Client = ClientStub<
  typeof CommandSpec,
  typeof FunctionSpec,
  typeof EventSpec
>;

export const Cmd = new Command()
  .name("vim")
  .description("Vim netbeans server.")
  .option("--session-name <sessionName:string>", "Session name.")
  .action(async ({ sessionName }) => {
    sessionName = await locateSession(sessionName);
    const [rawClient, stub] = await connectToServer(sessionName);

    const listener = Deno.listen({
      transport: "tcp",
      hostname: "127.0.0.1",
      port: 0,
    });

    if (listener.addr.transport !== "tcp") {
      throw new Error("Broken socket");
    }

    try {
      const port = listener.addr.port;

      const buf = new Uint8Array(16);
      crypto.getRandomValues(buf);
      const password = encodeBase64(buf);

      const logger = getLogger({ name: "vim", sessionName });

      const tmpDir = Deno.env.get("TMPDIR") ||
        Deno.env.get("TMP") ||
        Deno.env.get("TEMP") ||
        "/tmp";
      const dmuxDir = `${tmpDir}/dmux`;
      await Deno.mkdir(dmuxDir, { recursive: true });
      const sessionFile = `${dmuxDir}/${sessionName}`;
      await Deno.writeTextFile(
        sessionFile,
        `host=127.0.0.1\nport=${port}\nauth=${password}\n`,
        { mode: 0o0600 }
      );

      logger.info(`Run \`vim -nb=${sessionFile}\` to connect`);

      const clients = new Map<ClientConnection, Client>();
      const handler: ServerHandler = {
        onConnect: (connection, authPassword) => {
          logger.info(authPassword, password);
          const authorized = authPassword === password;

          if (authorized) {
            clients.set(
              connection,
              makeClientStub(connection, CommandSpec, FunctionSpec, EventSpec)
            );
          }

          return Promise.resolve(authorized);
        },
        onDisconnect: (connection) => {
          clients.delete(connection);
          return Promise.resolve();
        },
        onShutdown: () => {
          return Promise.resolve();
        },
      };

      await runServer(listener, handler);
    } finally {
      await Promise.allSettled([
        rawClient.stop(),
        listener.close(),
      ]);
    }
  });
