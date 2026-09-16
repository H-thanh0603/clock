import { describe, expect, it } from "vitest";
import { mediaUrl } from "./media";

const BASE = "https://media.example.com";

describe("mediaUrl", () => {
  it("base trống (dev) → path gốc, hành vi y cũ", () => {
    delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    expect(mediaUrl("/images/a.jpg")).toBe("/images/a.jpg");
    expect(mediaUrl("/swiss-luxury-watches-and-chronographs/video.mp4")).toBe(
      "/swiss-luxury-watches-and-chronographs/video.mp4"
    );
  });

  it("có base → prefix cây tĩnh tự chủ", () => {
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = `${BASE}/`;
    expect(mediaUrl("/images/a.jpg")).toBe(`${BASE}/images/a.jpg`);
    expect(mediaUrl("/swiss-luxury-watches-and-chronographs/video.mp4")).toBe(
      `${BASE}/swiss-luxury-watches-and-chronographs/video.mp4`
    );
    delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  });

  it("giữ nguyên URL tuyệt đối, /uploads, data-URI, rỗng", () => {
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL = BASE;
    try {
      expect(mediaUrl("https://s3.example.com/x.jpg")).toBe(
        "https://s3.example.com/x.jpg"
      );
      expect(mediaUrl("/uploads/abc.jpg")).toBe("/uploads/abc.jpg");
      expect(mediaUrl("/backend/uploads/abc.jpg")).toBe(
        "/backend/uploads/abc.jpg"
      );
      expect(mediaUrl("data:image/png;base64,xx")).toBe(
        "data:image/png;base64,xx"
      );
      expect(mediaUrl("")).toBe("");
      expect(mediaUrl(null)).toBe("");
      expect(mediaUrl("/legal/terms")).toBe("/legal/terms");
    } finally {
      delete process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    }
  });
});
