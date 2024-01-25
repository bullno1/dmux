import { ReadBuffer, readLine } from "../utils/read.ts";
import { encodeText } from "../utils/text.ts";

const LF = new Uint8Array([10]);

export type Message =
  | Command
  | FunctionCall
  | Reply
  | Event
  | Auth
  | Disconnect
  | Detach;

export type MessageArg = string | number | boolean | Color;
export type Color = { color: string | number };

export type Command = {
  type: "command";

  bufId: number;
  name: string;
  seqNo: number;

  args: MessageArg[];
};

export type FunctionCall = {
  type: "function";

  bufId: number;
  name: string;
  seqNo: number;

  args: MessageArg[];
};

export type Reply = {
  type: "reply";

  seqNo: number;
  result: MessageArg[];
};

export type Event = {
  type: "event";

  bufId: number;
  name: string;
  seqNo: number;

  args: MessageArg[];
};

export type Auth = {
  type: "auth";
  password: string;
};

export type Disconnect = {
  type: "disconnect";
};

export type Detach = {
  type: "detach";
};

export async function writeMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  message: Message,
): Promise<void> {
  await writer.ready;

  let msg;
  switch (message.type) {
    case "auth":
      msg = `AUTH ${message.password}\n`;
      break;
    case "disconnect":
      msg = "DISCONNECT\n";
      break;
    case "detach":
      msg = "DETACH\n";
      break;
    case "command":
      msg = `${message.bufId}:${message.name}!${message.seqNo} ${
        encodeArgs(message.args)
      }\n`;
      break;
    case "function":
      msg = `${message.bufId}:${message.name}/${message.seqNo} ${
        encodeArgs(message.args)
      }\n`;
      break;
    case "event":
      msg = `${message.bufId}:${message.name}=${message.seqNo} ${
        encodeArgs(message.args)
      }\n`;
      break;
    case "reply":
      msg = `${message.seqNo} ${encodeArgs(message.result)}`;
      break;
  }

  await writer.write(encodeText(msg));
}

const CommandRegex = /^(?<bufId>\d+):(?<name>[^!]*)!(?<seqNo>\d+)$/;
const FunctionCallRegex = /^(?<bufId>\d+):(?<name>[^\/]*)\/(?<seqNo>\d+)$/;
const EventRegex = /^(?<bufId>\d+):(?<name>[^=]*)=(?<seqNo>\d+)$/;
const NumberRegex = /^(?<seqNo>\d+)$/;

export class MessageReader {
  private readBuf = new ReadBuffer();

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {
  }

  async read(): Promise<Message> {
    const line = await readLine(this.reader, this.readBuf, LF);
    const messageParts = splitMessage(line);
    const firstPart = messageParts[0];

    switch (firstPart) {
      case "AUTH":
        return {
          type: "auth",
          password: messageParts[1],
        };
      case "DISCONNECT":
        return { type: "disconnect" };
      case "DETACH":
        return { type: "detach" };
      default:
        try {
          let match = firstPart.match(CommandRegex);
          if (match !== null) {
            return {
              type: "command",
              bufId: parseInt(match.groups!["bufId"]),
              name: match.groups!["name"],
              seqNo: parseInt(match.groups!["seqNo"]),
              args: parseArgs(messageParts.slice(1)),
            };
          }

          match = firstPart.match(FunctionCallRegex);
          if (match !== null) {
            return {
              type: "function",
              bufId: parseInt(match.groups!["bufId"]),
              name: match.groups!["name"],
              seqNo: parseInt(match.groups!["seqNo"]),
              args: parseArgs(messageParts.slice(1)),
            };
          }

          match = firstPart.match(EventRegex);
          if (match !== null) {
            return {
              type: "event",
              bufId: parseInt(match.groups!["bufId"]),
              name: match.groups!["name"],
              seqNo: parseInt(match.groups!["seqNo"]),
              args: parseArgs(messageParts.slice(1)),
            };
          }

          match = firstPart.match(NumberRegex);
          if (match !== null) {
            return {
              type: "reply",
              seqNo: parseInt(match.groups!["seqNo"]),
              result: parseArgs(messageParts.slice(1)),
            };
          }

          throw new ProtocolError("Could not parse: " + firstPart);
      } catch (e) {
        throw new ProtocolError(`Could not parse '${line}'`, { cause: e });
      }
    }
  }
}

export class ProtocolError extends Error {}

function splitMessage(line: string): string[] {
  if (line.startsWith("AUTH")) {
    return line.split(" ", 2);
  }

  const result: string[] = [];
  while (true) {
    const splitPos = findSplitPos(line);
    if (splitPos > 0) {
      result.push(line.slice(0, splitPos));
      line = line.slice(splitPos + 1);
    } else {
      if (line.length > 0) {
        result.push(line);
      }
      break;
    }
  }

  return result;
}

const Quote = '"'.charCodeAt(0);
const Slash = "\\".charCodeAt(0);
const Space = " ".charCodeAt(0);

function findSplitPos(str: string): number {
  if (str.charCodeAt(0) === Quote) {
    for (let i = 1; i < str.length; ++i) {
      const code = str.charCodeAt(i);
      if (code === Slash) {
        ++i;
      } else if (code === Quote) {
        return i + 1;
      }
    }

    return -1;
  } else {
    for (let i = 1; i < str.length; ++i) {
      const code = str.charCodeAt(i);
      if (code === Space) {
        return i;
      }
    }

    return -1;
  }
}

function parseArgs(args: string[]): MessageArg[] {
  return args.map((arg) => {
    if (arg.charCodeAt(0) === Quote) {
      return arg.slice(1, arg.length - 1)
        .replaceAll('\\n', '\n')
        .replaceAll('\\t', '\t')
        .replaceAll('\\r', '\r')
        .replaceAll('\\"', '"')
        .replaceAll('\\\\', '\\');
    } else if (arg === "T") {
      return true;
    } else if (arg === "F") {
      return false;
    } else if (arg.match(NumberRegex)) {
      return parseInt(arg);
    } else {
      return { color: arg };
    }
  });
}

function encodeArgs(args: MessageArg[]): string {
  return args.map((arg) => {
    if (typeof arg === "boolean") {
      return arg ? "T" : "F";
    } else if (typeof arg === "number") {
      return arg.toString();
    } else if (typeof arg === "string") {
      return JSON.stringify(arg);
    } else {
      return arg.color;
    }
  }).join(" ");
}
