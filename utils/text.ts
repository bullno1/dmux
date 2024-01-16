const textEncoder = new TextEncoder();
export const encodeText = textEncoder.encode.bind(textEncoder);

const textDecoder = new TextDecoder();
export const decodeText = textDecoder.decode.bind(textDecoder);
