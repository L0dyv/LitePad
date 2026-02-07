const INITIAL_BOUNDARY_CHARS = [
  "阿",
  "芭",
  "擦",
  "搭",
  "蛾",
  "发",
  "噶",
  "哈",
  "机",
  "喀",
  "垃",
  "妈",
  "拿",
  "哦",
  "啪",
  "期",
  "然",
  "撒",
  "塌",
  "挖",
  "昔",
  "压",
  "匝",
] as const;

const INITIALS = "abcdefghjklmnopqrstwxyz";
const CJK_CHAR_REGEX = /[\u3400-\u9fff]/;

function getPinyinInitial(char: string): string {
  if (!CJK_CHAR_REGEX.test(char)) return "";

  for (let i = INITIAL_BOUNDARY_CHARS.length - 1; i >= 0; i -= 1) {
    if (char.localeCompare(INITIAL_BOUNDARY_CHARS[i], "zh-CN-u-co-pinyin") >= 0) {
      return INITIALS[i];
    }
  }

  return "";
}

export function toPinyinInitials(text: string): string {
  let result = "";
  for (const char of text) {
    if (/[a-z0-9]/i.test(char)) {
      result += char.toLowerCase();
      continue;
    }

    const initial = getPinyinInitial(char);
    if (initial) {
      result += initial;
    }
  }

  return result;
}

export function isSubsequence(query: string, target: string): boolean {
  if (!query) return true;
  if (!target) return false;

  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti += 1) {
    if (target[ti] === query[qi]) qi += 1;
  }

  return qi === query.length;
}
