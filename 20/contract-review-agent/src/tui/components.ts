import type { Component, Focusable } from "@earendil-works/pi-tui";
import { Input, matchesKey, SelectList, truncateToWidth } from "@earendil-works/pi-tui";
import type { SelectItem } from "@earendil-works/pi-tui";

const GREEN = "\x1b[32m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export class OutputLog implements Component {
  private lines: string[] = [];
  private maxLines = 500;

  append(line: string) {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }
  }

  appendRaw(text: string) {
    if (this.lines.length === 0) {
      this.lines.push(text);
    } else {
      this.lines[this.lines.length - 1] += text;
    }
  }

  clear() {
    this.lines = [];
  }

  invalidate() {}

  render(width: number): string[] {
    if (this.lines.length === 0) return [""];
    return this.lines.map((l) => truncateToWidth(l, width));
  }
}

export class StatusBar implements Component {
  private text = "就绪";

  setText(text: string) {
    this.text = text;
  }

  invalidate() {}

  render(width: number): string[] {
    const line = `${DIM}状态：${this.text}${RESET}`;
    return [truncateToWidth(line, width, "", true)];
  }
}

export class Header implements Component {
  private title: string;

  constructor(title: string) {
    this.title = title;
  }

  invalidate() {}

  render(width: number): string[] {
    const line = `${BLUE}${this.title}${RESET}`;
    return [truncateToWidth(line, width, "", true)];
  }
}

export class PromptInput implements Component, Focusable {
  readonly input = new Input();
  focused = false;
  onSubmit?: (value: string) => void;
  onCtrlC?: () => void;
  private placeholder: string;

  constructor(placeholder = "输入消息，按 Enter 发送") {
    this.placeholder = placeholder;
    this.input.setValue("");
    this.input.onSubmit = (value) => {
      this.onSubmit?.(value);
    };
  }

  getValue(): string {
    return this.input.getValue();
  }

  setValue(value: string) {
    this.input.setValue(value);
  }

  clear() {
    this.input.setValue("");
  }

  handleInput(data: string) {
    if (matchesKey(data, "ctrl+c")) {
      this.onCtrlC?.();
      return;
    }
    this.input.handleInput(data);
  }

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    this.input.focused = this.focused;

    const label = `${GREEN}You:${RESET} `;
    const inputWidth = Math.max(1, width - truncateToWidth(label, width).length);
    const value = this.input.getValue();

    if (!value && !this.focused) {
      const hint = `${DIM}${this.placeholder}${RESET}`;
      return [truncateToWidth(label + hint, width, "", true)];
    }

    const inputLines = this.input.render(inputWidth);
    return inputLines.map((line) => truncateToWidth(label + line, width));
  }
}

export class ToolMessage implements Component {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  setText(text: string) {
    this.text = text;
  }

  invalidate() {}

  render(width: number): string[] {
    const line = `${MAGENTA}[Tool]${RESET} ${this.text}`;
    return [truncateToWidth(line, width)];
  }
}

export class FileSelector implements Component, Focusable {
  readonly list: SelectList;
  focused = false;
  onSelect?: (filePath: string) => void;
  onCancel?: () => void;

  constructor(files: string[]) {
    const items: SelectItem[] = files.map((f) => ({ value: f, label: f }));
    this.list = new SelectList(
      items,
      Math.min(items.length, 10),
      {
        selectedPrefix: (t) => `${MAGENTA}${t}${RESET}`,
        selectedText: (t) => `${MAGENTA}${t}${RESET}`,
        description: (t) => `${DIM}${t}${RESET}`,
        scrollInfo: (t) => `${DIM}${t}${RESET}`,
        noMatch: (t) => `${YELLOW}${t}${RESET}`,
      },
    );
    this.list.onSelect = (item) => this.onSelect?.(item.value);
    this.list.onCancel = () => this.onCancel?.();
  }

  handleInput(data: string) {
    this.list.handleInput(data);
  }

  invalidate() {
    this.list.invalidate();
  }

  render(width: number): string[] {
    const title = `${BLUE}请选择要审查的合同文件${RESET}`;
    const hint = `${DIM}上下移动，Enter 选择，Esc 取消${RESET}`;
    const listLines = this.list.render(width);
    return [
      truncateToWidth(title, width),
      "",
      ...listLines,
      "",
      truncateToWidth(hint, width),
    ];
  }
}
