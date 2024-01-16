import { Static, Type, TypeCompiler } from "../deps/typebox.ts";
import { Event, Request, Response } from "./schema.ts";
import { ReadBuffer, readLine, readN } from "../utils/read.ts";
import { decodeText, encodeText } from "../utils/text.ts";

const CRLF = new Uint8Array([13, 10]);

export const ContentLengthHeader = "Content-Length";

const MessageSchema = Type.Union([Request, Response, Event]);
const MessageSchemaChecker = TypeCompiler.Compile(MessageSchema);
export type Message = Static<typeof MessageSchema>;

export async function writeMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  message: Message,
): Promise<void> {
  await writer.ready;

  const body = JSON.stringify(message);
  const buff = encodeText(
    `${ContentLengthHeader}: ${body.length}\r\n\r\n${body}`,
  );
  await writer.write(buff);
}

export class MessageReader {
  private readBuf = new ReadBuffer();
  private headers = new Map<string, string>();

  constructor(private reader: ReadableStreamDefaultReader<Uint8Array>) {
  }

  async read(): Promise<Message> {
    // Read headers
    this.headers.clear();
    while (true) {
      const line = await readLine(this.reader, this.readBuf, CRLF);
      if (line.length > 0) {
        const [header, value] = line.split(": ", 2);
        this.headers.set(header, value);
      } else {
        break;
      }
    }

    // Read body
    const contentLengthStr = this.headers.get(ContentLengthHeader);
    if (contentLengthStr === undefined) {
      throw new FormatError("Missing Content-Length header");
    }
    const contentLength = parseInt(contentLengthStr);
    if (isNaN(contentLength)) {
      throw new FormatError(
        `Invalid Content-Length value: '${contentLengthStr}'`,
      );
    }
    const body = await readN(this.reader, this.readBuf, contentLength);

    // Process message
    const messageStr = decodeText(body);
    const message: unknown = JSON.parse(messageStr);
    if (!MessageSchemaChecker.Check(message)) {
      throw new FormatError("Invalid message");
    }

    return message;
  }
}

export class IOError extends Error {}

export class FormatError extends IOError {
}
