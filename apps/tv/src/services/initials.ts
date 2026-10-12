import { pinyin } from 'pinyin-pro';

/**
 * TV 端「首字母/拼音首字母」检索的首字母串算法。
 *
 * 规则（用户 2026-10-11 确认 + 实测）：
 *  - 按字符切成「连续汉字段」与「连续英数段」交替；
 *  - 汉字段整段送 `pinyin(text, { pattern:'first', toneType:'none', type:'array' })`，
 *    保留多音字上下文（重庆→CQ），每字取首字母大写；
 *  - 英数段取每个单词的第一个字符大写；
 *  - 分隔符（空格/标点等）直接跳过；
 *  - 对 title / alias / original_title 各算一次后拼接（覆盖字段 = 片名搜索语义）。
 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const WORD_RE = /[A-Za-z0-9]/;

/** 取一段文本的首字母串（大写字面串，无分隔符）。 */
export function computeInitials(text: string): string {
  if (!text) return '';

  // 切成「连续汉字段」与「连续英数段」交替
  const parts: string[] = [];
  let buf = '';
  let curIsCjk: boolean | null = null;
  for (const ch of text) {
    const isCjk = CJK_RE.test(ch);
    const isWord = WORD_RE.test(ch);
    if (!isCjk && !isWord) {
      if (buf) {
        parts.push(buf);
        buf = '';
        curIsCjk = null;
      }
      continue;
    }
    if (curIsCjk !== null && isCjk !== curIsCjk) {
      parts.push(buf);
      buf = '';
    }
    curIsCjk = isCjk;
    buf += ch;
  }
  if (buf) parts.push(buf);

  let out = '';
  for (const part of parts) {
    if (CJK_RE.test(part[0])) {
      // 汉字段：整段送 pinyin（保留多音字上下文），取每字首字母
      const arr = pinyin(part, { pattern: 'first', toneType: 'none', type: 'array' });
      for (const s of arr) {
        const c = s.trim();
        if (c) out += c[0].toUpperCase();
      }
    } else {
      // 英数段：取每个单词首字符
      const words = part.match(/[A-Za-z0-9]+/g) ?? [];
      for (const w of words) out += w[0].toUpperCase();
    }
  }
  return out;
}

/** 对一部影片算首字母串：title + alias + original_title 各算一次后拼接。 */
export function initialsOfMedia(media: {
  title?: string | null;
  alias?: string | null;
  originalTitle?: string | null;
}): string {
  const parts = [media.title, media.alias, media.originalTitle].filter(
    (t) => typeof t === 'string' && t.trim().length > 0,
  );
  return parts.map((t) => computeInitials(t as string)).join('');
}