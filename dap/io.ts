import { Static, Type, TypeCompiler } from "../deps/typebox.ts";
import {
  ErrorMessage as ErrorMessageSchema,
  Event,
  Request,
  Response,
} from "./schema.ts";
import { ReadBuffer, readLine, readN } from "../utils/read.ts";
import { decodeText, encodeText } from "../utils/text.ts";

const CRLF = new Uint8Array([13, 10]);

export const ContentLengthHeader = "Content-Length";

const ProtocolMessageSchema = Type.Union([Request, Response, Event]);
const ProtocolMessageSchemaChecker = TypeCompiler.Compile(
  ProtocolMessageSchema,
);
export type ProtocolMessage = Static<typeof ProtocolMessageSchema>;
export type ErrorMessage = Static<typeof ErrorMessageSchema>;

export async function writeMessage(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  message: ProtocolMessage,
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

  async read(): Promise<ProtocolMessage> {
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
    if (!ProtocolMessageSchemaChecker.Check(message)) {
      throw new FormatError("Invalid message");
    }

    return message;
  }
}

export class ProtocolError extends Error {}

export class FormatError extends ProtocolError {}

export class UnexpectedMessage extends ProtocolError {}

export class InvocationError extends ProtocolError {
  constructor(message: string, public extra?: ErrorMessage) {
    super(message);
  }
}
