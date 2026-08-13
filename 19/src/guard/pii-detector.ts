export interface SensitivePattern {
  name: string;
  regex: RegExp;
}

export const SENSITIVE_PATTERNS: SensitivePattern[] = [
  { name: "身份证号", regex: /\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g },
  { name: "手机号", regex: /1[3-9]\d{9}/g },
  { name: "银行卡号", regex: /\d{16,19}/g },
  { name: "邮箱", regex: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
];

export function detectByRegex(text: string): string[] {
  const hits: string[] = [];
  for (const { name, regex } of SENSITIVE_PATTERNS) {
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      hits.push(`${name}: ${matches.length} 处`);
    }
  }
  return hits;
}