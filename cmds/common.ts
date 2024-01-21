import { ArgumentValue, ValidationError } from "../deps/cliffy/command.ts";
import { Select } from "../deps/cliffy/prompt.ts";
import { ReadBuffer, readLine } from "../utils/read.ts";
import { ClientStub, makeClientStub } from "../dap/client-wrapper.ts";
import { Client } from "../dap/client.ts";
import {
  EventSpec as DapEventSpec,
  RequestSpec as DapRequestSpec,
} from "../dap/schema.ts";
import {
  EventSpec as DmuxEventSpec,
  RequestSpec as DmuxRequestSpec,
} from "../dmux/spec.ts";

const LF = new Uint8Array([10]);
const ProcFsSessionPrefix = "@dmux/";
const ActualSessionPrefix = "\0dmux/";

export function JSONString(
  { label, name, value }: ArgumentValue,
): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch (e) {
    if (e instanceof Error) {
      throw new ValidationError(`${label} "${name}": ${e.message}`);
    } else {
      throw e;
    }
  }
}

export type DmuxClientStub = ClientStub<
  typeof DapRequestSpec & typeof DmuxRequestSpec,
  typeof DapEventSpec & typeof DmuxEventSpec
>;

export async function connectToServer(
  sessionNameFromCli?: string,
): Promise<[Client, DmuxClientStub]> {
  const sessionName = await locateSession(sessionNameFromCli);
  const connection = await Deno.connect({
    transport: "unix",
    path: `${ActualSessionPrefix}${sessionName}`,
  });

  const client = new Client(
    connection.writable.getWriter(),
    connection.readable.getReader(),
  );
  const stub = makeClientStub(
    client,
    Object.assign({}, DapRequestSpec, DmuxRequestSpec),
    Object.assign({}, DapEventSpec, DmuxEventSpec),
  );
  return [client, stub];
}

async function locateSession(
  sessionNameFromCli?: string,
): Promise<string> {
  if (sessionNameFromCli !== undefined) {
    return sessionNameFromCli;
  }

  const availableSessions = new Set<string>();
  const file = await Deno.open("/proc/net/unix", { read: true });
  const readBuf = new ReadBuffer();
  const reader = file.readable.getReader();

  try {
    while (true) {
      const line = await readLine(reader, readBuf, LF);

      const parts = line.split(" ");
      const lastPart = parts[parts.length - 1];
      if (lastPart.startsWith(ProcFsSessionPrefix)) {
        availableSessions.add(lastPart.slice(ProcFsSessionPrefix.length));
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.UnexpectedEof)) {
      throw e;
    }
  } finally {
    reader.releaseLock();
  }

  if (availableSessions.size === 0) {
    console.log("Could not find any session");
    return Deno.exit(1);
  }

  if (availableSessions.size === 1) {
    for (const session of availableSessions) {
      return session;
    }
  }

  const choice = await Select.prompt<string>({
    message: "Pick a session",
    options: [...availableSessions].map((name) => ({
      value: name,
    })),
  });

  return choice;
}
