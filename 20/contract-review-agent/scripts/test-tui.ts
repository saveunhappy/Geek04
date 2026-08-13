import { FileSelector, Header, OutputLog, PromptInput, StatusBar } from "../src/tui/components.js";

function testComponents() {
  const header = new Header("测试标题");
  const headerLines = header.render(40);
  console.assert(headerLines.length === 1, "Header 应该只渲染一行");
  console.log("Header 渲染:", headerLines[0]);

  const log = new OutputLog();
  log.append("第一行");
  log.append("第二行");
  const logLines = log.render(40);
  console.assert(logLines.length === 2, "OutputLog 应该有两行");
  console.log("OutputLog 行数:", logLines.length);

  const status = new StatusBar();
  status.setText("运行中");
  const statusLines = status.render(40);
  console.assert(statusLines[0].includes("运行中"), "StatusBar 应该显示状态文本");
  console.log("StatusBar 渲染:", statusLines[0].trimEnd());

  const input = new PromptInput();
  input.setValue("测试输入");
  const inputLines = input.render(40);
  console.assert(inputLines.length === 1, "PromptInput 应该只渲染一行");
  console.log("PromptInput 渲染:", inputLines[0]);

  // 空值且未聚焦时应该显示占位提示
  const emptyInput = new PromptInput("请在这里输入");
  const emptyLines = emptyInput.render(40);
  console.assert(emptyLines[0].includes("请在这里输入"), "空值时应显示占位提示");
  console.log("PromptInput 占位提示:", emptyLines[0]);

  // 聚焦后占位提示消失
  emptyInput.focused = true;
  const focusedLines = emptyInput.render(40);
  console.assert(!focusedLines[0].includes("请在这里输入"), "聚焦后不应显示占位提示");
  console.log("PromptInput 聚焦后:", focusedLines[0]);

  // onSubmit 应该被正确转发
  let submitted = "";
  emptyInput.onSubmit = (value) => {
    submitted = value;
  };
  emptyInput.input.onSubmit?.("hello");
  console.assert(submitted === "hello", "onSubmit 应该转发到 PromptInput");
  console.log("onSubmit 转发测试:", submitted);

  // 文件选择器
  const selector = new FileSelector(["a.txt", "b.docx", "c.pdf"]);
  const selectorLines = selector.render(40);
  console.assert(selectorLines.length > 0, "FileSelector 应该渲染");
  console.assert(selectorLines[0].includes("选择"), "FileSelector 应该显示标题");
  console.log("FileSelector 标题:", selectorLines[0]);

  let selectedFile = "";
  selector.onSelect = (file) => {
    selectedFile = file;
  };
  selector.list.onSelect?.({ value: "b.docx", label: "b.docx" });
  console.assert(selectedFile === "b.docx", "FileSelector 应该返回选中的文件");
  console.log("FileSelector 选择测试:", selectedFile);

  console.log("\nTUI 组件测试通过。");
}

testComponents();
