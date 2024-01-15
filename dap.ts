import { concat, indexOf } from "./deps/bytes.ts";

const Encoder = new TextEncoder();
const Decoder = new TextDecoder();
const ContentLengthHeader = "Content-Length";

export class Client {
  private requestSeq = 1;
  private inflightReqs = new Map<number, (response: Response) => void>();

  constructor(
    private requestWriter: WritableStreamDefaultWriter<Uint8Array>,
    private responseReader: ReadableStreamDefaultReader<Uint8Array>,
  ) {
  }

  async sendRequest(command: string, args: unknown): Promise<Response> {
    const requestSeq = this.requestSeq++;
    const requestStr = JSON.stringify({
      seq: requestSeq,
      type: "request",
      command: command,
      arguments: args,
    });

    const result = new Promise<Response>((resolve) => {
      this.inflightReqs.set(requestSeq, resolve);
    });

    const buf = Encoder.encode(
      `${ContentLengthHeader}: ${requestStr.length}\r\n\r\n${requestStr}`,
    );
    await this.requestWriter.ready;
    await this.requestWriter.write(buf);

    return result;
  }

  async startLoop(): Promise<void> {
    const crlf = new Uint8Array([13, 10]);
    const readBuf = new ReadBuffer();
    const headers = new Map<string, string>();

    while (true) {
      // Read headers
      headers.clear();
      while (true) {
        const line = await readLine(this.responseReader, readBuf, crlf);
        if (line.length > 0) {
          const [header, value] = line.split(": ", 2);
          headers.set(header, value);
        } else {
          break;
        }
      }

      // Read body
      const contentLengthStr = headers.get(ContentLengthHeader);
      if (contentLengthStr === undefined) {
        throw new Error("Missing Content-Length header");
      }
      const contentLength = parseInt(contentLengthStr);
      if (isNaN(contentLength)) {
        throw new Error(`Invalid Content-Length value: '${contentLengthStr}'`);
      }

      // Process message
      const messageStr = Decoder.decode(
        await readNBytes(this.responseReader, readBuf, contentLength),
      );
      const message = JSON.parse(messageStr) as ProtocolMessage;

      if (message.type === "response") {
        const response = message as Response;
        const requestSeq = response.request_seq;
        const resolve = this.inflightReqs.get(requestSeq);
        if (resolve !== undefined) {
          this.inflightReqs.delete(requestSeq);
          resolve(response);
        }
      }
    }
  }
}

interface ProtocolMessage {
  seq: number;
  type: "request" | "response" | "event";
}

interface Response extends ProtocolMessage {
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: "cancelled" | "notStopped" | string;
  body?: unknown;
}

async function readLine(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  readBuf: ReadBuffer,
  lineEnding: Uint8Array,
): Promise<string> {
  if (readBuf.size > 0) {
    let bufBytes = readBuf.peek();
    const lineEndingPos = indexOf(bufBytes, lineEnding);

    if (lineEndingPos >= 0) {
      bufBytes = readBuf.take();
      const lineBytes = bufBytes.slice(0, lineEndingPos);
      const restBytes = bufBytes.slice(lineEndingPos + lineEnding.length);
      readBuf.put(restBytes);
      return Decoder.decode(lineBytes);
    }
  }

  while (true) {
    const readResult = await reader.read();
    if (readResult.done) {
      throw new Error("Stream ended");
    }

    const readBytes = readResult.value;

    const lineEndingPos = indexOf(readBytes, lineEnding);
    if (lineEndingPos >= 0) {
      const lineEndBytes = readBytes.slice(0, lineEndingPos);
      const restBytes = readBytes.slice(lineEndingPos + lineEnding.length);
      const lineBytes = readBuf.take(lineEndBytes);
      readBuf.put(restBytes);
      return Decoder.decode(lineBytes);
    } else {
      readBuf.put(readBytes);
    }
  }
}

async function readNBytes(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  readBuf: ReadBuffer,
  numBytes: number,
): Promise<Uint8Array> {
  let numBytesLeft = numBytes - readBuf.size;
  if (numBytesLeft <= 0) {
    const bufBytes = readBuf.take();
    const resultBytes = bufBytes.slice(0, numBytes);
    const restBytes = bufBytes.slice(numBytes);
    readBuf.put(restBytes);
    return resultBytes;
  }

  while (true) {
    const readResult = await reader.read();
    if (readResult.done) {
      throw new Error("Stream ended");
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
      const resultBytes = readBuf.take(resultEndBytes);
      readBuf.put(restBytes);
      return resultBytes;
    } else {
      readBuf.put(readBytes);
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
