import { Readable } from "stream";

/**
 * Converts a Buffer into a readable stream (required by Cloudinary upload_stream)
 * @param {Buffer} buffer
 * @returns {Readable}
 */
export const bufferToStream = (buffer) => {
  const readableStream = new Readable({
    read() {
      this.push(buffer);
      this.push(null); // end the stream
    },
  });

  return readableStream;
};
