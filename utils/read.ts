import { concat, indexOf } from "../deps/std/bytes.ts";
import { decodeText } from "./text.ts";

export class ReadBuffer {
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
      result = concat(this.#accumulator);
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

export async function readLine(
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
      return decodeText(lineBytes);
    }
  }

  while (true) {
    const readResult = await reader.read();
    if (readResult.done) {
      throw new Deno.errors.UnexpectedEof("Stream ended");
    }

    const readBytes = readResult.value;

    const lineEndingPos = indexOf(readBytes, lineEnding);
    if (lineEndingPos >= 0) {
      const lineEndBytes = readBytes.slice(0, lineEndingPos);
      const restBytes = readBytes.slice(lineEndingPos + lineEnding.length);
      const lineBytes = readBuf.take(lineEndBytes);
      readBuf.put(restBytes);
      return decodeText(lineBytes);
    } else {
      readBuf.put(readBytes);
    }
  }
}

export async function readN(
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
      throw new Deno.errors.UnexpectedEof("Stream ended");
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
