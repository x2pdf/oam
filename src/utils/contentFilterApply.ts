import { ContentItem } from '../mypayload';
import { ContentFilterRule, InputDataItem, normalizeMatchExpression } from '../types';

function appendOampItemText(parts: string[], item: ContentItem): void {
  if (item.type === 'text') {
    parts.push(item.content);
  } else if (item.type === 'link') {
    parts.push(item.label, item.href);
  } else if (item.type === 'image' && item.alt) {
    parts.push(item.alt);
  }
}

/** 仅 OAMP / UTF-8 的可解码正文；RAW / OAMP_ENCRYPTED 返回空（不参与文本类过滤） */
export function extractDecodableText(item: InputDataItem): string | null {
  const kind = item.contentKind;
  if (kind === 'UTF-8') {
    const text = item.textContent?.trim();
    return text ? text : null;
  }
  if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
    const parts: string[] = [];
    for (const oampItem of item.oampItems) {
      appendOampItemText(parts, oampItem);
    }
    const joined = parts.filter(Boolean).join('\n').trim();
    return joined ? joined : null;
  }
  return null;
}

function addressEquals(a: string | undefined, expression: string): boolean {
  if (!a || !expression) return false;
  return a.trim().toLowerCase() === expression.trim().toLowerCase();
}

/** 单条规则是否命中（命中则应隐藏） */
export function matchesContentFilterRule(
  item: InputDataItem,
  rule: ContentFilterRule,
): boolean {
  const expression = normalizeMatchExpression(rule.matchExpression);
  if (!expression) return false;

  switch (rule.matchType) {
    case 'text': {
      const text = extractDecodableText(item);
      if (text == null) return false;
      return text.toLowerCase().includes(expression.toLowerCase());
    }
    case 'regex': {
      const text = extractDecodableText(item);
      if (text == null) return false;
      try {
        return new RegExp(expression).test(text);
      } catch {
        return false;
      }
    }
    case 'address': {
      return addressEquals(item.from, expression) || addressEquals(item.to, expression);
    }
    case 'image':
      // TODO: 等本地 AI 对图片暴力、成人内容识别更准确且更快后再开放
      return false;
    default:
      return false;
  }
}

/** 是否应被任一过滤规则隐藏 */
export function isHiddenByContentFilters(
  item: InputDataItem,
  filters: ContentFilterRule[],
): boolean {
  if (!filters.length) return false;
  return filters.some((rule) => matchesContentFilterRule(item, rule));
}

/** 应用内容过滤：命中任一规则的条目不返回 */
export function applyContentFilters(
  items: InputDataItem[],
  filters: ContentFilterRule[],
): InputDataItem[] {
  if (!filters.length) return items;
  return items.filter((item) => !isHiddenByContentFilters(item, filters));
}
