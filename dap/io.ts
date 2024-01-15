import { concat, indexOf } from "../deps/bytes.ts";
import { Static, Type, TypeCompiler } from "../deps/typebox.ts";
import { Event, Request, Response } from "./schema.ts";

const textEncoder = new TextEncoder();
const encodeText = textEncoder.encode.bind(textEncoder);
const textDecoder = new TextDecoder();
const decodeText = textDecoder.decode.bind(textDecoder);
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
      console.log("Read line");
      const line = await this.readLine();
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
    const body = await this.readN(contentLength);

    // Process message
    const messageStr = decodeText(body);
    const message: unknown = JSON.parse(messageStr);
    if (!MessageSchemaChecker.Check(message)) {
      throw new FormatError("Invalid message");
    }

    return message;
  }

  private async readLine(): Promise<string> {
    if (this.readBuf.size > 0) {
      let bufBytes = this.readBuf.peek();
      const lineEndingPos = indexOf(bufBytes, CRLF);

      if (lineEndingPos >= 0) {
        bufBytes = this.readBuf.take();
        const lineBytes = bufBytes.slice(0, lineEndingPos);
        const restBytes = bufBytes.slice(lineEndingPos + CRLF.length);
        this.readBuf.put(restBytes);
        return decodeText(lineBytes);
      }
    }

    while (true) {
      const readResult = await this.reader.read();
      if (readResult.done) {
        throw new StreamEnded("Stream ended");
      }

      const readBytes = readResult.value;

      const lineEndingPos = indexOf(readBytes, CRLF);
      if (lineEndingPos >= 0) {
        const lineEndBytes = readBytes.slice(0, lineEndingPos);
        const restBytes = readBytes.slice(lineEndingPos + CRLF.length);
        const lineBytes = this.readBuf.take(lineEndBytes);
        this.readBuf.put(restBytes);
        return decodeText(lineBytes);
      } else {
        this.readBuf.put(readBytes);
      }
    }
  }

  private async readN(numBytes: number): Promise<Uint8Array> {
    let numBytesLeft = numBytes - this.readBuf.size;
    if (numBytesLeft <= 0) {
      const bufBytes = this.readBuf.take();
      const resultBytes = bufBytes.slice(0, numBytes);
      const restBytes = bufBytes.slice(numBytes);
      this.readBuf.put(restBytes);
      return resultBytes;
    }

    while (true) {
      const readResult = await this.reader.read();
      if (readResult.done) {
        throw new StreamEnded("Stream ended");
      }

      const readBytes = readResult.value;
      numBytesLeft -= readBytes.length;

      if (numBytesLeft <= 0) {
        const numRestBytes = -numBytesLeft;
        const resultEndBytes = readBytes.slice(
          0,
          readBytes.length - numRestBytes,
        );
        const restBytes = readBytes.slice(readBytes.length - numRestBytes);
        const resultBytes = this.readBuf.take(resultEndBytes);
        this.readBuf.put(restBytes);
        return resultBytes;
      } else {
        this.readBuf.put(readBytes);
      }
    }
  }
}

class ReadBuffer {
  private static Empty = new Uint8Array(0);

  #size = 0;
  #accumulator: Uint8Array[] = [];

  get size(): number {
    return this.#size;
  }

  put(fragment: Uint8Array): void {
    if (fragment.length === 0) return;

    this.#accumulator.push(fragment);
    this.#size += fragment.length;
  }

  take(rest?: Uint8Array): Uint8Array {
    if (rest !== undefined) {
      this.#accumulator.push(rest);
    }

    let result;
    if (this.#accumulator.length === 0) {
      result = ReadBuffer.Empty;
    } else if (this.#accumulator.length === 1) {
      result = this.#accumulator[0];
    } else {
      result = concat(...this.#accumulator);
    }

    this.#accumulator.length = 0;
    this.#size = 0;

    return result;
  }

  peek(): Uint8Array {
    if (this.#accumulator.length === 0) {
      return ReadBuffer.Empty;
    } else if (this.#accumulator.length === 1) {
      return this.#accumulator[0];
    } else {
      const result = this.take();
      this.put(result);
      return result;
    }
  }
}

export class IOError extends Error {}

export class StreamEnded extends IOError {
}

export class FormatError extends IOError {
}
