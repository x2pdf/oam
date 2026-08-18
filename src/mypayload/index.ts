import { toUtf8Bytes, toUtf8String } from "ethers";

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "image"; data: string; alt?: string };

/**
 * 创建 PNG 图片内容项
 * 自动为原始 base64 编码添加 data:image/png;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，将作为 <img> 的 alt 属性存储
 */
export function createPngItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/png;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 创建 JPEG 图片内容项
 * 自动为原始 base64 编码添加 data:image/jpeg;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，形如：sunset.jpg/sunset.jpeg，将作为 <img> 的 alt 属性存储
 */
export function createJpegItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/jpeg;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 创建 GIF 图片内容项
 * 自动为原始 base64 编码添加 data:image/gif;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，将作为 <img> 的 alt 属性存储
 */
export function createGifItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/gif;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 规范化 Payload 编码器
 *
 * 按照 HTML 语法对内容进行封装，支持文本和多张图片的混合编排。
 *
 * 关于 <img> 标签的使用说明：
 * 1. src 属性存储完整的 Data URL（包含前缀和 base64 数据）。
 * 2. alt 属性可选，用于存储图片名称或描述。
 * 3. 编码器会自动按照传入 items 的顺序生成标签，支持混合编排。
 *
 * 注意：本应用约定通常将文本 <pre> 放在前面，图片 <img> 放在后面。
 *
 * @param items 内容项数组
 * @returns 编码后的 Uint8Array
 */
export function payloadEncode(items: ContentItem[]): Uint8Array {
  let html = "<html>";
  for (const item of items) {
    if (item.type === "text") {
      // 使用 <pre> 标签包裹文本，以保留原始换行和格式
      html += `<pre>${item.content}</pre>`;
    } else if (item.type === "image") {
      // 构建 img 标签，确保 src 是有效的 Data URL
      const altAttr = item.alt ? ` alt="${item.alt}"` : "";
      html += `<img src="${item.data}"${altAttr}>`;
    }
  }
  html += "</html>";
  return toUtf8Bytes(html);
}

/**
 * 规范化 Payload 解码器 v1
 *
 * 解析 <html> 封装的规范数据，提取 <pre> 中的文本和 <img> 中的图片。
 * 能够正确处理包含或不包含 alt 属性的 <img> 标签。
 *
 * 兼容性：如果数据不以 <html> 开头，则自动退化为普通纯文本处理。
 *
 * @param data 原始字节数据或字符串
 * @returns 解析后的内容项数组
 */
export function payloadDecode(data: Uint8Array | string): ContentItem[] {
  const html = typeof data === "string" ? data : toUtf8String(data);

  if (!html.startsWith("<html>")) {
    return [{ type: "text", content: html }];
  }

  const items: ContentItem[] = [];
  const tagRegex = /<pre>(.*?)<\/pre>|<img\s+([^>]*?)>/gs;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [_, textContent, imgTagBody] = match;

    if (textContent !== undefined) {
      items.push({ type: "text", content: textContent });
    } else if (imgTagBody !== undefined) {
      const srcMatch = imgTagBody.match(/src="([^"]+)"/);
      const altMatch = imgTagBody.match(/alt="([^"]+)"/);

      if (srcMatch) {
        items.push({
          type: "image",
          data: srcMatch[1],
          alt: altMatch ? altMatch[1] : undefined
        });
      }
    }
  }

  return items;
}
