const zlib = require("node:zlib");
const crypto = require("node:crypto");

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function send(res, status, payload) {
  res.status(status).json(payload);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createMask(width, height, selection) {
  const pixels = Buffer.alloc((width * 4 + 1) * height, 255);
  const padding = Math.max(3, Math.round(Math.min(selection.w, selection.h) * 0.04));
  const left = Math.max(0, Math.floor(selection.x - padding));
  const top = Math.max(0, Math.floor(selection.y - padding));
  const right = Math.min(width, Math.ceil(selection.x + selection.w + padding));
  const bottom = Math.min(height, Math.ceil(selection.y + selection.h + padding));

  for (let y = 0; y < height; y += 1) {
    pixels[y * (width * 4 + 1)] = 0;
  }
  for (let y = top; y < bottom; y += 1) {
    const row = y * (width * 4 + 1);
    for (let x = left; x < right; x += 1) {
      const offset = row + 1 + x * 4;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function parseImage(value) {
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(String(value || ""));
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  return buffer.length && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
}

function validSelection(value, width, height) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const w = Number(value.w);
  const h = Number(value.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 2 || h < 2) return null;
  if (x < 0 || y < 0 || x + w > width || y + h > height) return null;
  return { x, y, w, h };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { message: "POST 요청만 사용할 수 있습니다." });
  }

  const passcode = process.env.FLYER_EDIT_PASSCODE;
  if (!process.env.OPENAI_API_KEY || !passcode) {
    return send(res, 503, {
      message: "Vercel의 OPENAI_API_KEY와 FLYER_EDIT_PASSCODE를 먼저 설정하세요.",
    });
  }
  if (!safeEqual(req.headers["x-flyer-edit-code"], passcode)) {
    return send(res, 401, { message: "AI 편집 비밀번호가 맞지 않습니다." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const width = Number(body.width);
  const height = Number(body.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 3840 || height > 3840) {
    return send(res, 400, { message: "이미지 크기가 올바르지 않습니다." });
  }
  const source = parseImage(body.imageData);
  const selection = validSelection(body.selection, width, height);
  if (!source || !selection) {
    return send(res, 400, { message: "원본 이미지 또는 글자 영역이 올바르지 않습니다." });
  }

  try {
    const form = new FormData();
    form.append("model", "gpt-image-2");
    form.append("image[]", new Blob([source], { type: "image/png" }), "flyer.png");
    form.append("mask", new Blob([createMask(width, height, selection)], { type: "image/png" }), "mask.png");
    form.append(
      "prompt",
      "Remove only the visible text inside the transparent mask and reconstruct the underlying flyer background naturally. Do not add any letters, words, numbers, logos, or new objects. Preserve every unmasked pixel, layout, colors, product photos, borders, and design as closely as possible.",
    );
    form.append("quality", "medium");
    form.append("output_format", "png");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    const result = await response.json();
    if (!response.ok || !result?.data?.[0]?.b64_json) {
      console.error("OpenAI image edit failed", response.status, result);
      return send(res, response.status >= 400 && response.status < 500 ? response.status : 502, {
        message: result?.error?.message || "AI 배경 복원에 실패했습니다.",
      });
    }
    return send(res, 200, { imageData: `data:image/png;base64,${result.data[0].b64_json}` });
  } catch (error) {
    console.error("AI image edit error", error);
    return send(res, 502, { message: "AI 배경 복원 서버에 연결하지 못했습니다." });
  }
};
