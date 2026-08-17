import { toUtf8Bytes, toUtf8String } from "ethers";

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "image"; data: string; alt?: string };

/**
 * 规范化 Payload 编码器
 *
 * 按照 HTML 语法对内容进行封装，支持文本和多张图片的混合编排。
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
      // 构建 img 标签，可选包含 alt 属性
      const altAttr = item.alt ? ` alt="${item.alt}"` : "";
      html += `<img src="${item.data}"${altAttr}>`;
    }
  }
  html += "</html>";
  return toUtf8Bytes(html);
}

/**
 * 规范化 Payload 解码器
 *
 * 解析 <html> 封装的规范数据。
 * 兼容性：如果数据不以 <html> 开头，则自动退化为普通纯文本处理。
 * 性能：使用全局正则表达式线性扫描，对于链上数据规模（通常在 KB 级别）具有良好的执行效率。
 *
 * @param data 原始字节数据或字符串
 * @returns 解析后的内容项数组
 */
export function payloadDecode(data: Uint8Array | string): ContentItem[] {
  const html = typeof data === "string" ? data : toUtf8String(data);

  // 兼容性逻辑：如果不符合规范格式，视为旧版纯文本消息
  if (!html.startsWith("<html>")) {
    return [{ type: "text", content: html }];
  }

  const items: ContentItem[] = [];

  // 匹配 <pre> 标签内容 或整个 <img> 标签体
  // 使用非贪婪匹配 .*? 确保在大 Payload 下也能正确分割标签
  const tagRegex = /<pre>(.*?)<\/pre>|<img\s+([^>]*?)>/gs;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [fullMatch, textContent, imgTagBody] = match;

    if (textContent !== undefined) {
      // 匹配到了文本段落
      items.push({ type: "text", content: textContent });
    } else if (imgTagBody !== undefined) {
      // 匹配到了图片标签，解析内部属性
      // 使用子正则匹配 src 和 alt，这样即使属性顺序变化或存在额外空格也能正确解析
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
